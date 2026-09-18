import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { getProvider, classifyError } from "../lib/payment-provider.js";
import { generateSplitPaymentLinks, getInvoiceSplits } from "../lib/split-billing.js";
import { allocatePositiveFiscalItems, orchestrateFiscalization, isSubmissionEligible, resolvePaymentSessionFiscalSource } from "../services/prro-orchestrator.js";
import { submitDocument } from "./prro.js";
import crypto from "crypto";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DB = () => (db as any).$client;

async function getEntityKeys(orgId: number, entityId?: number | null) {
  if (!entityId) {
    const { rows } = await DB().query(
      `SELECT * FROM legal_entities WHERE organization_id = $1 AND is_default = true LIMIT 1`, [orgId]);
    return rows[0] || null;
  }
  const { rows } = await DB().query(`SELECT * FROM legal_entities WHERE id = $1 AND organization_id = $2`, [entityId, orgId]);
  return rows[0] || null;
}

function genSessionRef(prefix = "PAY"): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function saveDiagnostic(orgId: number, sessionId: number, provider: string, error: string, rawData?: any) {
  const { category, resolution } = classifyError(error);
  await DB().query(`
    INSERT INTO payment_diagnostics (organization_id, session_id, provider, error_message, category, resolution, error_detail)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [orgId, sessionId, provider, error, category, resolution, rawData ? JSON.stringify(rawData) : null]);
}

async function logWebhook(orgId: any, provider: string, sessionId: any, eventType: string, status: string, sigValid: boolean, rawBody: any, parsedData: any, amount?: any, currency?: any, ip?: any) {
  await DB().query(`
    INSERT INTO payment_webhooks (organization_id, provider, session_id, event_type, status, signature_valid, raw_body, parsed_data, amount, currency, ip_address, processed_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
    [orgId||null, provider, sessionId||null, eventType, status, sigValid, rawBody||null, parsedData||null, amount||null, currency||null, ip||null]);
}

// ─── PUBLIC WEBHOOK — before requireAuth ──────────────────────────────────────
router.post("/webhook/liqpay", async (req, res) => {
  const { data, signature } = req.body;
  let orgId: number | null = null;
  let sessionId: number | null = null;
  let parsed: any = null;
  let isValid = false;

  try {
    if (!data || !signature) { await logWebhook(null, "liqpay", null, "missing_params", "received", false, null, null); return res.json({ ok: true }); }

    parsed = JSON.parse(Buffer.from(data, "base64").toString("utf-8"));
    const orderId = parsed?.order_id || "";

    const { rows: sessions } = await DB().query(
      `SELECT ps.*, le.liqpay_private_key FROM payment_sessions ps
       LEFT JOIN legal_entities le ON le.id = ps.legal_entity_id
       WHERE ps.provider_order_id = $1 ORDER BY ps.id DESC LIMIT 1`, [orderId]);

    let session = sessions[0];
    if (session) {
      orgId = session.organization_id;
      sessionId = session.id;
      const privKey = session.liqpay_private_key || process.env.LIQPAY_PRIVATE_KEY || "";
      const expected = crypto.createHash("sha1").update(privKey + data + privKey).digest("base64");
      // Use timing-safe comparison to prevent timing attacks on webhook verification
      isValid = expected.length === signature.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } else {
      const privKey = process.env.LIQPAY_PRIVATE_KEY || "";
      if (privKey) {
        const expected = crypto.createHash("sha1").update(privKey + data + privKey).digest("base64");
        isValid = expected.length === signature.length &&
          crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
      }
    }

    await logWebhook(orgId, "liqpay", sessionId, parsed?.status || "unknown", parsed?.action || "callback", isValid, JSON.stringify({ data, signature }), parsed ? JSON.stringify(parsed) : null, parsed?.amount, parsed?.currency, req.ip || null);

    if (isValid && session) {
      const statusMap: Record<string, string> = {
        success: "paid", wait_accept: "pending", processing: "processing",
        failure: "failed", error: "failed", reversed: "refunded", sandbox: "paid", expired: "expired",
      };
      const newStatus = statusMap[parsed.status] || "pending";

      if (newStatus === "paid") {
        const paidAmount = Number(parsed.amount);
        const paidCurrency = String(parsed.currency || "");
        if (!Number.isFinite(paidAmount) || paidAmount <= 0 ||
            Math.abs(paidAmount - Number(session.amount)) > 0.01 ||
            paidCurrency !== String(session.currency || "UAH") ||
            String(parsed.order_id) !== String(session.provider_order_id) ||
            (parsed.action && !["pay", "hold"].includes(String(parsed.action)))) {
          return res.status(400).json({ error: "LiqPay callback does not match payment session" });
        }
        const paymentClient = await DB().connect();
        try {
          await paymentClient.query("BEGIN");
          const locked = await paymentClient.query(
            `SELECT * FROM payment_sessions WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
            [session.id, session.organization_id],
          );
          if (!locked.rows[0]) throw new Error("Payment session disappeared");
          session = { ...session, ...locked.rows[0] };
          let paymentId: number | null = null;
          const existingPayment = await paymentClient.query(
            `SELECT id FROM payments
              WHERE organization_id = $1
                AND (payment_session_id = $2 OR liqpay_order_id = $3)
              ORDER BY id LIMIT 1 FOR UPDATE`,
            [session.organization_id, session.id, orderId],
          );
          if (existingPayment.rows[0]) {
            paymentId = Number(existingPayment.rows[0].id);
          } else {
            const inserted = await paymentClient.query(`
              INSERT INTO payments (booking_id, organization_id, payment_session_id, amount, method, status, external_id, liqpay_order_id, liqpay_status, currency, description, payment_type)
              VALUES ($1,$2,$3,$4,'liqpay','completed',$5,$6,$7,$8,$9,'payment')
              RETURNING id`,
              [session.booking_id || null, session.organization_id, session.id, paidAmount,
               String(parsed.payment_id || ""), orderId, parsed.status, paidCurrency, session.description || "Онлайн-оплата"]);
            paymentId = Number(inserted.rows[0]?.id);
          }
          if (session.status !== "paid" || Math.abs(Number(session.paid_amount || 0) - paidAmount) > 0.01) {
            await paymentClient.query(`
              UPDATE payment_sessions SET status = 'paid', paid_amount = $3, paid_at = NOW(),
                provider_tx_id = $4, provider_fee = $5, callback_data = $6, payment_id = $7, updated_at = NOW()
              WHERE id = $1 AND organization_id = $2`,
              [session.id, session.organization_id, paidAmount, String(parsed.payment_id || ""),
               parsed.commission_credit || null, JSON.stringify(parsed), paymentId]);
          }
          await paymentClient.query("COMMIT");
        } catch (paymentError) {
          await paymentClient.query("ROLLBACK").catch(() => {});
          throw paymentError;
        } finally {
          paymentClient.release();
        }
        try {
          const paidAmount = Number(parsed.amount || session.amount);
          const fiscalSource = await resolvePaymentSessionFiscalSource(session, paidAmount);
          const fiscal = await orchestrateFiscalization({
            organizationId: Number(session.organization_id),
            sourceType: fiscalSource.sourceType,
            sourceId: fiscalSource.sourceId,
            defaultLegalEntityId: session.legal_entity_id,
            items: fiscalSource.items,
            totalAmount: paidAmount,
            itemKind: fiscalSource.sourceType === "spa_booking" ? "service" : "mixed",
            paymentChannel: "online_card",
            idempotencyKey: `payment-session:${session.organization_id}:${session.id}`,
          });
          for (const document of fiscal.documents) {
            if (isSubmissionEligible(document.status)) await submitDocument(Number(session.organization_id), Number(document.id));
          }
        } catch (fiscalError: any) {
          await saveDiagnostic(session.organization_id, session.id, "prro", fiscalError?.message || "Фіскалізація не виконана").catch(() => {});
        }
      } else if (newStatus === "failed" || newStatus === "expired") {
        await DB().query(`
          UPDATE payment_sessions SET status = $2, failed_at = NOW(), last_error = $3, callback_data = $4, updated_at = NOW()
          WHERE id = $1`, [session.id, newStatus, parsed.status, JSON.stringify(parsed)]);
        await saveDiagnostic(session.organization_id, session.id, "liqpay", parsed.err_description || parsed.status || "failed", parsed);
      } else {
        await DB().query(`UPDATE payment_sessions SET status = $2, callback_data = $3, updated_at = NOW() WHERE id = $1`,
          [session.id, newStatus, JSON.stringify(parsed)]);
      }
    }

    res.json({ ok: true });
  } catch (e: any) {
    await logWebhook(orgId, "liqpay", sessionId, "error", "error", false, null, null).catch(() => {});
    res.json({ ok: true });
  }
});

// ─── AUTH PROTECTED ROUTES ────────────────────────────────────────────────────
router.use(requireAuth);

// ─── SESSIONS ─────────────────────────────────────────────────────────────────

router.get("/sessions", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { status, provider, type, search, from, to, limit = 50, offset = 0 } = req.query;

    let q = `SELECT ps.*, b.booking_ref, b.check_in, b.check_out,
               le.name AS entity_name
             FROM payment_sessions ps
             LEFT JOIN bookings b ON b.id = ps.booking_id
             LEFT JOIN legal_entities le ON le.id = ps.legal_entity_id
             WHERE ps.organization_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (status)   { q += ` AND ps.status = $${idx++}`;  params.push(status); }
    if (provider) { q += ` AND ps.provider = $${idx++}`; params.push(provider); }
    if (type)     { q += ` AND ps.type = $${idx++}`;    params.push(type); }
    if (from)     { q += ` AND ps.created_at >= $${idx++}`; params.push(from); }
    if (to)       { q += ` AND ps.created_at <= $${idx++}`; params.push(to); }
    if (search)   { q += ` AND (ps.session_ref ILIKE $${idx} OR ps.guest_name ILIKE $${idx} OR ps.description ILIKE $${idx++})`; params.push(`%${search}%`); }
    q += ` ORDER BY ps.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const { rows } = await DB().query(q, params);
    const cnt = await DB().query(`SELECT COUNT(*) c FROM payment_sessions WHERE organization_id = $1`, [orgId]);
    res.json({ sessions: rows, total: parseInt(cnt.rows[0].c) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/sessions/:id", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { rows } = await DB().query(`
      SELECT ps.*, b.booking_ref, b.check_in, b.check_out, b.guest_name AS booking_guest,
             le.name AS entity_name, le.liqpay_public_key IS NOT NULL AS has_liqpay
      FROM payment_sessions ps
      LEFT JOIN bookings b ON b.id = ps.booking_id
      LEFT JOIN legal_entities le ON le.id = ps.legal_entity_id
      WHERE ps.id = $1 AND ps.organization_id = $2`, [id, orgId]);
    if (!rows[0]) return res.status(404).json({ error: "Session not found" });

    const { rows: diags } = await DB().query(`SELECT * FROM payment_diagnostics WHERE session_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]);
    const { rows: webhooks } = await DB().query(`SELECT id, event_type, status, amount, received_at, signature_valid FROM payment_webhooks WHERE session_id = $1 ORDER BY received_at DESC LIMIT 20`, [id]);

    res.json({ session: rows[0], diagnostics: diags, webhooks });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── CREATE PAYMENT SESSION ───────────────────────────────────────────────────
router.post("/sessions", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const userId = req.user?.userId;
    const {
      amount, currency = "UAH", description, type = "full", chargeReason,
      provider = "liqpay", bookingId, folioId, invoiceId, legalEntityId,
      guestName, guestEmail, guestPhone, notes, expiryHours = 72, metadata,
      resultUrl, scheduleId, installmentNumber,
    } = req.body;

    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: "Amount must be > 0" });
    if (bookingId) {
      const { rows } = await DB().query(
        `SELECT b.id FROM bookings b
          LEFT JOIN units u ON u.id = b.unit_id
          LEFT JOIN properties p ON p.id = u.property_id
         WHERE b.id = $1 AND b.organization_id = $2
           AND (p.organization_id = $2 OR p.organization_id IS NULL)`,
        [bookingId, orgId],
      );
      if (!rows[0]) return res.status(403).json({ error: "Booking is outside organization" });
    }
    if (invoiceId) {
      const { rows } = await DB().query(
        `SELECT id FROM invoices WHERE id = $1 AND organization_id = $2`,
        [invoiceId, orgId],
      );
      if (!rows[0]) return res.status(403).json({ error: "Invoice is outside organization" });
    }
    if (folioId) {
      const { rows } = await DB().query(
        `SELECT id FROM bookings WHERE folio_id = $1 AND organization_id = $2`,
        [folioId, orgId],
      );
      if (!rows[0]) return res.status(403).json({ error: "Folio is outside organization" });
    }
    if (legalEntityId) {
      const { rows } = await DB().query(
        `SELECT id FROM legal_entities
          WHERE id = $1 AND organization_id = $2 AND is_active = true`,
        [legalEntityId, orgId],
      );
      if (!rows[0]) return res.status(403).json({ error: "Legal entity is outside organization or inactive" });
    }

    const entity = await getEntityKeys(orgId, legalEntityId);
    const sessionRef = genSessionRef("PAY");
    const orderId = `${orgId}-${sessionRef}-${Date.now()}`;

    // Get booking guest info if not provided
    let finalGuestName = guestName, finalGuestEmail = guestEmail, finalGuestPhone = guestPhone;
    if (bookingId && (!guestName || !guestEmail)) {
      const { rows: bk } = await DB().query(
        `SELECT b.*, g.email, g.phone FROM bookings b LEFT JOIN guests g ON g.id = b.guest_id WHERE b.id = $1`, [bookingId]);
      if (bk[0]) {
        finalGuestName  = finalGuestName  || bk[0].guest_name || (bk[0].first_name + " " + (bk[0].last_name || "")).trim() || bk[0].full_name;
        finalGuestEmail = finalGuestEmail || bk[0].email;
        finalGuestPhone = finalGuestPhone || bk[0].phone;
      }
    }

    const expiresAt = new Date(Date.now() + (expiryHours || 72) * 3600 * 1000);
    let checkoutUrl = "", providerOrderId = "", providerData: any = null;

    if (entity?.liqpay_public_key && entity?.liqpay_private_key) {
      const providerInst = getProvider(provider);
      const result = await providerInst.createSession({
        amount: parseFloat(amount),
        currency,
        description: description || chargeReason || `Оплата бронювання`,
        orderId,
        sessionRef,
        guestName: finalGuestName,
        guestEmail: finalGuestEmail,
        guestPhone: finalGuestPhone,
        expiryHours,
        publicKey: entity.liqpay_public_key,
        privateKey: entity.liqpay_private_key,
        resultUrl,
      });
      checkoutUrl = result.checkoutUrl;
      providerOrderId = result.providerOrderId;
      providerData = result.providerData;
    } else {
      // Store session without checkout URL — keys not configured
      providerOrderId = orderId;
    }

    const { rows } = await DB().query(`
      INSERT INTO payment_sessions (
        organization_id, session_ref, provider, type, status,
        booking_id, folio_id, invoice_id, legal_entity_id,
        amount, currency, description, charge_reason,
        guest_name, guest_email, guest_phone,
        provider_order_id, checkout_url, provider_data,
        expires_at, notes, metadata, schedule_id, installment_number, created_by
      ) VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      RETURNING *`,
      [orgId, sessionRef, provider, type, bookingId||null, folioId||null, invoiceId||null, legalEntityId||entity?.id||null,
       parseFloat(amount), currency, description||null, chargeReason||null,
       finalGuestName||null, finalGuestEmail||null, finalGuestPhone||null,
       providerOrderId, checkoutUrl||null, providerData ? JSON.stringify(providerData) : null,
       expiresAt, notes||null, metadata ? JSON.stringify(metadata) : null,
       scheduleId||null, installmentNumber||null, userId]);

    const session = rows[0];

    // Also create/update payment_links for backward compat
    if (checkoutUrl) {
      await DB().query(`
        INSERT INTO payment_links (organization_id, booking_id, invoice_id, legal_entity_id, amount, currency,
          description, provider, order_id, checkout_url, liqpay_data, liqpay_signature,
          expires_at, guest_name, guest_email, guest_phone, charge_reason, type)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT DO NOTHING`,
        [orgId, bookingId||null, invoiceId||null, entity?.id||null, parseFloat(amount), currency,
         description||null, provider, orderId, checkoutUrl,
         providerData?.data||null, providerData?.signature||null,
         expiresAt, finalGuestName||null, finalGuestEmail||null, finalGuestPhone||null,
         chargeReason||null, type]);
    }

    res.json({
      session,
      checkoutUrl,
      hasKeys: !!checkoutUrl,
      message: checkoutUrl ? "Сесія створена. Посилання готове." : "Сесія створена. Налаштуйте LiqPay ключі для генерації посилання.",
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── SESSION ACTIONS ──────────────────────────────────────────────────────────
router.post("/sessions/:id/sync", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { rows } = await DB().query(
      `SELECT ps.*, le.liqpay_public_key, le.liqpay_private_key
       FROM payment_sessions ps LEFT JOIN legal_entities le ON le.id = ps.legal_entity_id
       WHERE ps.id = $1 AND ps.organization_id = $2`, [id, orgId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const session = rows[0];

    if (!session.provider_order_id) return res.json({ synced: false, message: "No provider order ID" });

    const provider = getProvider(session.provider);
    const statusResult = await provider.getStatus(session.provider_order_id, {
      publicKey: session.liqpay_public_key || "",
      privateKey: session.liqpay_private_key || "",
    });

    const updates: string[] = ["updated_at = NOW()"];
    const params: any[] = [id, orgId];
    let idx = 3;

    if (statusResult.status === "paid") {
      updates.push(`status = 'paid'`, `paid_amount = $${idx++}`, `paid_at = $${idx++}`, `provider_tx_id = $${idx++}`);
      params.push(statusResult.amount || session.amount, statusResult.paidAt || new Date(), statusResult.providerTxId || "");
      if (statusResult.feeAmount) { updates.push(`provider_fee = $${idx++}`); params.push(statusResult.feeAmount); }
    } else if (statusResult.status === "failed") {
      updates.push(`status = 'failed'`, `failed_at = NOW()`, `last_error = $${idx++}`);
      params.push(statusResult.providerStatus);
      await saveDiagnostic(orgId, id, session.provider, statusResult.providerStatus || "unknown", statusResult.rawData);
    } else if (statusResult.status === "expired") {
      updates.push(`status = 'expired'`);
    }

    if (statusResult.rawData) { updates.push(`callback_data = $${idx++}`); params.push(JSON.stringify(statusResult.rawData)); }

    await DB().query(`UPDATE payment_sessions SET ${updates.join(", ")} WHERE id = $1 AND organization_id = $2`, params);
    res.json({ synced: true, status: statusResult.status, providerStatus: statusResult.providerStatus, rawData: statusResult.rawData });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sessions/:id/retry", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { rows } = await DB().query(
      `SELECT ps.*, le.liqpay_public_key, le.liqpay_private_key, le.name AS entity_name
       FROM payment_sessions ps LEFT JOIN legal_entities le ON le.id = ps.legal_entity_id
       WHERE ps.id = $1 AND ps.organization_id = $2`, [id, orgId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const session = rows[0];
    if (session.retry_count >= session.max_retries) return res.status(400).json({ error: `Max retries (${session.max_retries}) reached` });

    const newOrderId = `${session.provider_order_id}-R${session.retry_count + 1}`;
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000);

    let checkoutUrl = session.checkout_url;
    let providerData = session.provider_data;

    if (session.liqpay_public_key && session.liqpay_private_key) {
      const provider = getProvider(session.provider);
      const result = await provider.createSession({
        amount: parseFloat(session.amount),
        currency: session.currency,
        description: session.description || "Повторна оплата",
        orderId: newOrderId,
        sessionRef: session.session_ref,
        guestName: session.guest_name,
        guestEmail: session.guest_email,
        guestPhone: session.guest_phone,
        expiryHours: 72,
        publicKey: session.liqpay_public_key,
        privateKey: session.liqpay_private_key,
      });
      checkoutUrl = result.checkoutUrl;
      providerData = result.providerData;
    }

    await DB().query(`
      UPDATE payment_sessions SET
        status = 'pending', checkout_url = $3, provider_order_id = $4,
        provider_data = $5, expires_at = $6, failed_at = NULL, last_error = NULL,
        retry_count = retry_count + 1, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2`,
      [id, orgId, checkoutUrl, newOrderId, JSON.stringify(providerData), expiresAt]);

    res.json({ retried: true, checkoutUrl, newOrderId, retryCount: session.retry_count + 1 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sessions/:id/cancel", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    await DB().query(`UPDATE payment_sessions SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    res.json({ cancelled: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sessions/:id/mark-paid", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const userId = req.user?.userId;
    const id = parseInt(req.params.id);
    const { amount, method = "cash", notes } = req.body;
    const client = await DB().connect();
    let session: any;
    let paymentId = 0;
    let paidAmt = 0;
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT * FROM payment_sessions WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [id, orgId],
      );
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Not found" });
      }
      session = rows[0];
      paidAmt = amount === undefined ? Number(session.amount) : Number(amount);
      if (!Number.isFinite(paidAmt) || paidAmt <= 0 || paidAmt > Number(session.amount) + 0.01) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Invalid payment amount" });
      }
      if (session.status === "paid" && session.payment_id) {
        if (Math.abs(Number(session.paid_amount || 0) - paidAmt) > 0.01) {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "Payment session already settled for another amount" });
        }
        paymentId = Number(session.payment_id);
      } else {
        const existingPayment = await client.query(
          `SELECT id FROM payments
            WHERE organization_id = $1 AND external_id = $2
            ORDER BY id LIMIT 1 FOR UPDATE`,
          [orgId, session.session_ref],
        );
        if (existingPayment.rows[0]) {
          paymentId = Number(existingPayment.rows[0].id);
        } else {
          const { rows: inserted } = await client.query(`
              INSERT INTO payments (booking_id, organization_id, payment_session_id, amount, method, status, description, payment_type, external_id, currency)
              VALUES ($1, $2, $3, $4, $5, 'completed', $6, 'payment', $7, $8) RETURNING id`,
            [session.booking_id || null, orgId, session.id, paidAmt, method, session.description || notes || "Оплата", session.session_ref, session.currency]);
          paymentId = Number(inserted[0].id);
        }
        await client.query(`
          UPDATE payment_sessions SET status = 'paid', paid_amount = $3, paid_at = NOW(), payment_id = $4, updated_at = NOW()
          WHERE id = $1 AND organization_id = $2`,
          [id, orgId, paidAmt, paymentId]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    let fiscalization: any = null;
    try {
      const fiscalSource = await resolvePaymentSessionFiscalSource(session, paidAmt);
      const result = await orchestrateFiscalization({
        organizationId: orgId,
        sourceType: fiscalSource.sourceType,
        sourceId: fiscalSource.sourceId,
        defaultLegalEntityId: session.legal_entity_id,
        items: fiscalSource.items,
        totalAmount: paidAmt,
        itemKind: fiscalSource.sourceType === "spa_booking" ? "service" : "mixed",
        paymentChannel: method === "cash" ? "cash" : method === "iban_transfer" ? "iban_transfer" : "online_card",
        idempotencyKey: `payment-session:${orgId}:${session.id}`,
        createdBy: userId,
        requestId: String(req.id ?? ""),
        exemptionAuthority: req.body?.exemptionAuthority,
        exemptionReference: req.body?.exemptionReference,
      });
      const documents = [];
      for (const document of result.documents) {
        documents.push(isSubmissionEligible(document.status)
          ? await submitDocument(orgId, Number(document.id), String(req.id ?? ""))
          : document);
      }
      fiscalization = { ...result, documents };
    } catch (error: any) {
      fiscalization = { error: error instanceof Error ? error.message : "Фіскалізація не виконана" };
    }
    res.json({ success: true, paymentId, paidAmount: paidAmt, fiscalization });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/webhooks", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { provider, status, sessionId, limit = 100 } = req.query;
    let q = `SELECT pw.*, ps.session_ref FROM payment_webhooks pw LEFT JOIN payment_sessions ps ON ps.id = pw.session_id WHERE pw.organization_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (provider)  { q += ` AND pw.provider = $${idx++}`;  params.push(provider); }
    if (status)    { q += ` AND pw.status = $${idx++}`;    params.push(status); }
    if (sessionId) { q += ` AND pw.session_id = $${idx++}`; params.push(parseInt(sessionId as string)); }
    q += ` ORDER BY pw.received_at DESC LIMIT $${idx++}`;
    params.push(parseInt(limit as string));
    const { rows } = await DB().query(q, params);
    res.json({ webhooks: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── PAYMENT SCHEDULES ────────────────────────────────────────────────────────
router.get("/schedules", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { bookingId, status } = req.query;
    let q = `SELECT ps.*, b.booking_ref FROM payment_schedules ps LEFT JOIN bookings b ON b.id = ps.booking_id WHERE ps.organization_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (bookingId) { q += ` AND ps.booking_id = $${idx++}`; params.push(parseInt(bookingId as string)); }
    if (status)    { q += ` AND ps.status = $${idx++}`;     params.push(status); }
    q += ` ORDER BY ps.created_at DESC`;
    const { rows: schedules } = await DB().query(q, params);

    // Attach steps
    for (const s of schedules) {
      const { rows: steps } = await DB().query(`SELECT * FROM payment_schedule_steps WHERE schedule_id = $1 ORDER BY step_number`, [s.id]);
      s.steps = steps;
    }
    res.json({ schedules });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/schedules", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { bookingId, name, type = "deposit_balance", totalAmount, currency = "UAH", guestName, guestEmail, provider = "liqpay", legalEntityId, autoCharge = false, notes, steps = [] } = req.body;
    if (!totalAmount) return res.status(400).json({ error: "totalAmount required" });

    const { rows: sched } = await DB().query(`
      INSERT INTO payment_schedules (organization_id, booking_id, legal_entity_id, name, type, status, total_amount, currency, guest_name, guest_email, provider, auto_charge, notes)
      VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [orgId, bookingId||null, legalEntityId||null, name||"Графік оплати", type, parseFloat(totalAmount), currency, guestName||null, guestEmail||null, provider, autoCharge, notes||null]);

    const schedule = sched[0];

    // Create steps
    const builtSteps = steps.length ? steps : buildDefaultSteps(type, parseFloat(totalAmount));
    for (const step of builtSteps) {
      await DB().query(`
        INSERT INTO payment_schedule_steps (schedule_id, organization_id, step_number, type, label, amount, percent, due_date, due_days_before_checkin)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [schedule.id, orgId, step.stepNumber, step.type, step.label, step.amount, step.percent||null, step.dueDate||null, step.dueDaysBeforeCheckin||null]);
    }

    const { rows: createdSteps } = await DB().query(`SELECT * FROM payment_schedule_steps WHERE schedule_id = $1 ORDER BY step_number`, [schedule.id]);
    res.json({ schedule: { ...schedule, steps: createdSteps } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

function buildDefaultSteps(type: string, total: number) {
  if (type === "deposit_balance") {
    const deposit = Math.round(total * 0.3 * 100) / 100;
    return [
      { stepNumber: 1, type: "deposit", label: "Депозит (30%)", amount: deposit, percent: 30, dueDaysBeforeCheckin: 30 },
      { stepNumber: 2, type: "final_balance", label: "Залишок (70%)", amount: total - deposit, percent: 70, dueDaysBeforeCheckin: 3 },
    ];
  }
  if (type === "three_stage") {
    const third = Math.round(total / 3 * 100) / 100;
    return [
      { stepNumber: 1, type: "deposit", label: "1-й платіж (33%)", amount: third, percent: 33, dueDaysBeforeCheckin: 60 },
      { stepNumber: 2, type: "installment", label: "2-й платіж (33%)", amount: third, percent: 33, dueDaysBeforeCheckin: 30 },
      { stepNumber: 3, type: "final_balance", label: "3-й платіж (34%)", amount: total - third * 2, percent: 34, dueDaysBeforeCheckin: 3 },
    ];
  }
  return [{ stepNumber: 1, type: "full", label: "Повна оплата", amount: total, percent: 100 }];
}

router.post("/schedules/:id/charge-step/:stepId", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const scheduleId = parseInt(req.params.id);
    const stepId = parseInt(req.params.stepId);
    const { resultUrl } = req.body;

    const { rows: steps } = await DB().query(`SELECT * FROM payment_schedule_steps WHERE id = $1 AND schedule_id = $2`, [stepId, scheduleId]);
    if (!steps[0]) return res.status(404).json({ error: "Step not found" });
    const step = steps[0];
    if (step.status === "paid") return res.status(400).json({ error: "Step already paid" });

    const { rows: scheds } = await DB().query(`SELECT * FROM payment_schedules WHERE id = $1 AND organization_id = $2`, [scheduleId, orgId]);
    if (!scheds[0]) return res.status(404).json({ error: "Schedule not found" });
    const schedule = scheds[0];

    // Create a payment session for this step
    const sessionRef = genSessionRef("STEP");
    const orderId = `${orgId}-${sessionRef}`;
    const entity = await getEntityKeys(orgId, schedule.legal_entity_id);
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000);

    let checkoutUrl = "", providerOrderId = orderId, providerData: any = null;
    if (entity?.liqpay_public_key && entity?.liqpay_private_key) {
      const provider = getProvider(schedule.provider || "liqpay");
      const result = await provider.createSession({
        amount: parseFloat(step.amount), currency: schedule.currency || "UAH",
        description: step.label || "Оплата за графіком",
        orderId, sessionRef, guestEmail: schedule.guest_email, guestName: schedule.guest_name,
        publicKey: entity.liqpay_public_key, privateKey: entity.liqpay_private_key, resultUrl,
      });
      checkoutUrl = result.checkoutUrl;
      providerData = result.providerData;
    }

    const { rows: sess } = await DB().query(`
      INSERT INTO payment_sessions (organization_id, session_ref, provider, type, status, booking_id, legal_entity_id, amount, currency, description, guest_name, guest_email, provider_order_id, checkout_url, provider_data, expires_at, schedule_id, installment_number, charge_reason)
      VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [orgId, sessionRef, schedule.provider||"liqpay", step.type, schedule.booking_id||null, entity?.id||null,
       parseFloat(step.amount), schedule.currency||"UAH", step.label||"Оплата за графіком",
       schedule.guest_name||null, schedule.guest_email||null,
       providerOrderId, checkoutUrl||null, providerData ? JSON.stringify(providerData) : null, expiresAt,
       scheduleId, step.step_number, step.type]);

    await DB().query(`UPDATE payment_schedule_steps SET session_id = $2, status = 'pending' WHERE id = $1`, [stepId, sess[0].id]);

    res.json({ session: sess[0], checkoutUrl, step });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── DIAGNOSTICS ─────────────────────────────────────────────────────────────
router.get("/diagnostics", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { category, resolved, limit = 50 } = req.query;
    let q = `SELECT pd.*, ps.session_ref, ps.amount, ps.guest_name, ps.guest_email
             FROM payment_diagnostics pd LEFT JOIN payment_sessions ps ON ps.id = pd.session_id
             WHERE pd.organization_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (category) { q += ` AND pd.category = $${idx++}`; params.push(category); }
    if (resolved === "true") q += " AND pd.resolved_at IS NOT NULL";
    if (resolved === "false") q += " AND pd.resolved_at IS NULL";
    q += ` ORDER BY pd.created_at DESC LIMIT $${idx++}`;
    params.push(parseInt(limit as string));
    const { rows } = await DB().query(q, params);
    res.json({ diagnostics: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/diagnostics/:id/resolve", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { resolution } = req.body;
    const { rows } = await DB().query(`
      UPDATE payment_diagnostics SET resolved_at = NOW(), resolution = COALESCE($3, resolution), auto_resolved = false
      WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [parseInt(req.params.id), orgId, resolution || null]);
    res.json({ diagnostic: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── OVERVIEW / STATS ─────────────────────────────────────────────────────────
router.get("/overview", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const [statusStats, providerStats, schedStats, diagStats, recentFailed] = await Promise.all([
      DB().query(`SELECT status, COUNT(*) cnt, SUM(amount) total, SUM(paid_amount) paid FROM payment_sessions WHERE organization_id = $1 GROUP BY status`, [orgId]),
      DB().query(`SELECT provider, COUNT(*) cnt, SUM(paid_amount) paid FROM payment_sessions WHERE organization_id = $1 AND status = 'paid' GROUP BY provider`, [orgId]),
      DB().query(`SELECT COUNT(*) total, SUM(total_amount) total_amt, SUM(paid_amount) paid_amt FROM payment_schedules WHERE organization_id = $1 AND status = 'active'`, [orgId]),
      DB().query(`SELECT category, COUNT(*) cnt FROM payment_diagnostics WHERE organization_id = $1 AND resolved_at IS NULL GROUP BY category ORDER BY cnt DESC LIMIT 5`, [orgId]),
      DB().query(`SELECT ps.*, le.name AS entity_name FROM payment_sessions ps LEFT JOIN legal_entities le ON le.id = ps.legal_entity_id WHERE ps.organization_id = $1 AND ps.status IN ('failed','expired') ORDER BY ps.updated_at DESC LIMIT 10`, [orgId]),
    ]);

    const byStatus: Record<string, any> = {};
    for (const r of statusStats.rows) byStatus[r.status] = { count: parseInt(r.cnt), total: parseFloat(r.total||0), paid: parseFloat(r.paid||0) };

    res.json({
      byStatus,
      providers: providerStats.rows,
      schedules: { active: parseInt(schedStats.rows[0]?.total||0), totalAmount: parseFloat(schedStats.rows[0]?.total_amt||0), paidAmount: parseFloat(schedStats.rows[0]?.paid_amt||0) },
      openDiagnostics: diagStats.rows,
      recentFailed: recentFailed.rows,
      availableProviders: {
        liqpay:    { status: "active",      name: "LiqPay",    note: "Основний провайдер" },
        fondy:     { status: "placeholder", name: "Fondy",     note: "Потребує налаштування" },
        wayforpay: { status: "placeholder", name: "WayForPay", note: "Потребує налаштування" },
        stripe:    { status: "placeholder", name: "Stripe",    note: "Потребує налаштування" },
        mono:      { status: "placeholder", name: "Monobank",  note: "Потребує налаштування" },
      },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── SPLIT BILLING ────────────────────────────────────────────────────────────
router.post("/invoices/:invoiceId/splits", async (req: any, res) => {
  try {
    const orgId: number = req.user.organizationId;
    const invoiceId = parseInt(req.params.invoiceId);
    if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid invoiceId" });

    const { guestName, guestEmail, guestPhone, currency, regenerate } = req.body;

    const result = await generateSplitPaymentLinks({
      invoiceId,
      orgId,
      guestName,
      guestEmail,
      guestPhone,
      currency,
      regenerate: Boolean(regenerate),
    });

    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/invoices/:invoiceId/splits", async (req: any, res) => {
  try {
    const orgId: number = req.user.organizationId;
    const invoiceId = parseInt(req.params.invoiceId);
    if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid invoiceId" });
    const splits = await getInvoiceSplits(invoiceId, orgId);
    res.json({ splits, isSplit: splits.length > 1 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Mark a split as paid (webhook integration point)
router.post("/invoices/:invoiceId/splits/:splitId/mark-paid", requireRole("super_admin", "owner", "admin", "manager"), async (req: any, res) => {
  try {
    const orgId: number = req.user.organizationId;
    const invoiceId = parseInt(req.params.invoiceId);
    const splitId   = parseInt(req.params.splitId);
    const { paidAmount, txId } = req.body;
    const requestedAmount = paidAmount === undefined ? null : Number(paidAmount);
    if (requestedAmount !== null && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) {
      return res.status(422).json({ error: "paidAmount must be positive" });
    }
    const client = await DB().connect();
    let split: any;
    let event: any;
    let eventReplayed = false;
    try {
      await client.query("BEGIN");
      const found = await client.query(
        `SELECT s.*, i.amount AS invoice_amount, i.organization_id
           FROM invoice_splits s
           JOIN invoices i ON i.id = s.invoice_id
          WHERE s.id = $1 AND s.invoice_id = $2 AND i.organization_id = $3
          FOR UPDATE OF s, i`,
        [splitId, invoiceId, orgId],
      );
      split = found.rows[0];
      if (!split) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Split not found" });
      }
      const expected = Number(split.amount);
      if (requestedAmount !== null && Math.abs(requestedAmount - expected) > 0.01) {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "paidAmount must equal the split amount" });
      }
      if (split.status === "paid" && split.liqpay_tx_id && txId &&
          String(split.liqpay_tx_id) !== String(txId)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Split already paid with another transaction" });
      }
      const transactionIdentity = String(txId || split.liqpay_tx_id || `split-${splitId}`);
      const eventKey = `invoice-split:${splitId}:payment:${transactionIdentity}`;
      const splitItems = Array.isArray(split.items_snapshot) ? split.items_snapshot : [];
      const splitSourceType = splitItems.length > 0 &&
        splitItems.every((item: any) => item.source === "minibar" || item.metadata?.source === "minibar")
        ? "minibar" : "hotel_folio";
      const inserted = await client.query(
        `INSERT INTO payment_events
           (organization_id, source_type, source_id, event_key, previous_amount, target_amount, delta_amount, currency, payload)
         VALUES ($1,$2,$3,$4,0,$5,$5,$6,$7)
         ON CONFLICT (organization_id, event_key) DO NOTHING
         RETURNING *`,
        [orgId, splitSourceType, `invoice-split:${splitId}`, eventKey, expected, split.currency || "UAH",
         JSON.stringify({ invoiceId, splitId, txId: transactionIdentity })],
      );
      event = inserted.rows[0];
      if (!event) {
        eventReplayed = true;
        const existingEvent = await client.query(
          `SELECT * FROM payment_events WHERE organization_id = $1 AND event_key = $2 FOR UPDATE`,
          [orgId, eventKey],
        );
        event = existingEvent.rows[0];
      }
      if (event && split.status !== "paid") {
        await client.query(
          `UPDATE invoice_splits SET status = 'paid', paid_amount = $1,
                  liqpay_tx_id = COALESCE($2, liqpay_tx_id), paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
             WHERE id = $3`,
          [expected, txId || null, splitId],
        );
        split.status = "paid";
        split.paid_amount = expected;
      }
      const { rows: allSplits } = await client.query(
        `SELECT status FROM invoice_splits WHERE invoice_id = $1`, [invoiceId],
      );
      if (allSplits.length > 0 && allSplits.every((row: any) => row.status === "paid")) {
        await client.query(
          `UPDATE invoices SET status = 'paid', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
            WHERE id = $1 AND organization_id = $2`, [invoiceId, orgId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    let fiscalization: any = null;
    try {
      const snapshot = Array.isArray(split.items_snapshot) ? split.items_snapshot : [];
      if (!snapshot.length) throw new Error("У split відсутній незмінний snapshot позицій");
      const sourceItems = snapshot.map((item: any) => ({
        name: item.name || item.description || "Позиція split",
        quantity: Number(item.quantity ?? item.qty ?? 1),
        unitPrice: Number(item.unitPrice ?? item.price ?? item.amount ?? 0),
        amount: Number(item.amount ?? item.total ?? 0),
        legalEntityId: item.legalEntityId ?? item.legal_entity_id ?? split.legal_entity_id,
        taxCode: item.taxCode ?? item.vatRate,
        metadata: { ...(item.metadata || {}), ...(item.source ? { source: item.source } : {}) },
      }));
      const items = allocatePositiveFiscalItems(sourceItems, Number(split.amount));
      const sourceType = items.every((item: any) => item.metadata?.source === "minibar") ? "minibar" : "hotel_folio";
      const result = await orchestrateFiscalization({
        organizationId: orgId,
        sourceType,
        sourceId: `payment-event:${event.id}`,
        defaultLegalEntityId: split.legal_entity_id,
        items,
        totalAmount: Number(split.amount),
        itemKind: "mixed",
        paymentChannel: "online_card",
        idempotencyKey: `payment-event:${orgId}:${event.id}`,
        createdBy: req.user?.userId,
        requestId: String(req.id ?? ""),
      });
      const documents = [];
      for (const document of result.documents) {
        documents.push(isSubmissionEligible(document.status)
          ? await submitDocument(orgId, Number(document.id), String(req.id ?? ""))
          : document);
      }
      fiscalization = { ...result, documents };
      await DB().query(
        `UPDATE payment_events SET status = 'allocated', updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
        [event.id],
      );
    } catch (error: any) {
      fiscalization = { error: error instanceof Error ? error.message : "Фіскалізація не виконана" };
    }
    res.json({ ok: true, split, fiscalization, replayed: eventReplayed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── EXPIRY CLEANUP (can be called from cron) ─────────────────────────────────
router.post("/expire-pending", async (req: any, res) => {
  try {
    const { rows } = await DB().query(`
      UPDATE payment_sessions SET status = 'expired', updated_at = NOW()
      WHERE status = 'pending' AND expires_at < NOW() AND expires_at IS NOT NULL
      RETURNING id, organization_id`);
    res.json({ expired: rows.length, ids: rows.map((r: any) => r.id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
