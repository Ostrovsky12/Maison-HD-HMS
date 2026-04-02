/**
 * Finance API — Payments, Deposits, LiqPay, Invoices, Installments, Reconciliation
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, bookingsTable, invoicesTable, legalEntitiesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import crypto from "crypto";

const router = Router();
router.use(requireAuth);

// ─── Constants ────────────────────────────────────────────────────────────────
// bookings → units → properties → organization_id (bookings has no org_id)
const ORG_JOIN = sql.raw(`JOIN units _u ON _u.id = b.unit_id JOIN properties _p ON _p.id = _u.property_id`);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function liqpaySign(data: string, key: string) {
  return crypto.createHash("sha1").update(key + data + key).digest("base64");
}
function liqpayEncode(obj: object) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}
function liqpayDecode(data: string) {
  try { return JSON.parse(Buffer.from(data, "base64").toString("utf8")); } catch { return {}; }
}

async function genInvoiceNumber() {
  const year = new Date().getFullYear();
  const r = await db.execute(sql`SELECT COUNT(*) as cnt FROM invoices WHERE EXTRACT(YEAR FROM created_at) = ${year}`);
  const n = parseInt((r.rows[0] as any)?.cnt || "0") + 1;
  return `INV-${year}-${String(n).padStart(5, "0")}`;
}

async function getDefaultLegalEntity(orgId: number) {
  const r = await db.execute(sql`
    SELECT * FROM legal_entities WHERE organization_id = ${orgId} AND is_active = true
    ORDER BY CASE WHEN is_default THEN 0 ELSE 1 END LIMIT 1
  `);
  return (r.rows[0] as any) || null;
}

async function updateBookingPayment(bookingId: number, amount: number, type: string) {
  const [b] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!b) return;
  let paid = parseFloat(b.paidAmount || "0");
  if (type === "refund") paid = Math.max(0, paid - amount);
  else if (!["fee", "adjustment"].includes(type)) paid += amount;
  const total = parseFloat(b.totalAmount || "0");
  const status: "unpaid" | "partial" | "paid" = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
  await db.update(bookingsTable).set({ paidAmount: paid.toString(), paymentStatus: status, updatedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId));
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
router.get("/summary", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;

    const [totals, byMethod, byStatus, deposits, overdue, recent] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*) as tx_count,
          SUM(CASE WHEN p.payment_type::text != 'refund' THEN p.amount ELSE 0 END) as gross_amount,
          SUM(CASE WHEN p.status::text = 'completed' AND p.payment_type::text != 'refund' THEN p.amount ELSE 0 END) as collected,
          SUM(CASE WHEN p.status::text = 'pending' THEN p.amount ELSE 0 END) as pending_amount,
          SUM(COALESCE(p.fee_amount, 0)) as total_fees,
          SUM(CASE WHEN p.payment_type::text = 'refund' THEN p.amount ELSE 0 END) as refunded_amount
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        ${ORG_JOIN}
        WHERE _p.organization_id = ${orgId}
      `),
      db.execute(sql`
        SELECT p.method::text as method, COUNT(*) as cnt, SUM(p.amount) as amount
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        ${ORG_JOIN}
        WHERE _p.organization_id = ${orgId}
          AND p.status::text = 'completed' AND p.payment_type::text != 'refund'
        GROUP BY p.method ORDER BY amount DESC
      `),
      db.execute(sql`
        SELECT b.payment_status::text as payment_status, COUNT(*) as cnt,
               SUM(b.total_amount) as total, SUM(b.paid_amount) as paid
        FROM bookings b ${ORG_JOIN}
        WHERE _p.organization_id = ${orgId}
        GROUP BY b.payment_status
      `),
      db.execute(sql`
        SELECT COUNT(*) as cnt, SUM(amount) as amount
        FROM deposits WHERE organization_id = ${orgId} AND status::text = 'held'
      `),
      db.execute(sql`
        SELECT COUNT(*) as cnt, SUM(b.total_amount - b.paid_amount) as amount
        FROM bookings b ${ORG_JOIN}
        WHERE _p.organization_id = ${orgId}
          AND b.payment_status::text IN ('unpaid','partial') AND b.check_out < NOW()
      `),
      db.execute(sql`
        SELECT p.*, b.booking_ref, TRIM(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')) as booking_guest
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        ${ORG_JOIN}
        WHERE _p.organization_id = ${orgId}
        ORDER BY p.created_at DESC LIMIT 10
      `),
    ]);

    res.json({
      totals: totals.rows[0] || {},
      byMethod: byMethod.rows,
      byStatus: byStatus.rows,
      deposits: deposits.rows[0] || {},
      overdue: overdue.rows[0] || {},
      recentPayments: recent.rows,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── LIST PAYMENTS ────────────────────────────────────────────────────────────
router.get("/payments", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const { bookingId, method, status, type, search } = req.query as any;

    // Build extra conditions using sql fragments — safe string values only from known enums
    const extra: ReturnType<typeof sql>[] = [];
    if (bookingId) extra.push(sql`AND p.booking_id = ${parseInt(bookingId)}`);
    if (method && ["cash","card","liqpay","stripe","bank_transfer"].includes(method))
      extra.push(sql`AND p.method::text = ${method}`);
    if (status && ["pending","completed","failed","refunded"].includes(status))
      extra.push(sql`AND p.status::text = ${status}`);
    if (type && ["deposit","payment","partial","refund","fee","adjustment"].includes(type))
      extra.push(sql`AND p.payment_type::text = ${type}`);
    if (search)
      extra.push(sql`AND (b.booking_ref ILIKE ${"%" + search + "%"} OR TRIM(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')) ILIKE ${"%" + search + "%"} OR p.receipt_number ILIKE ${"%" + search + "%"})`);

    const extraSql = extra.reduce((acc, s) => sql`${acc} ${s}`, sql``);

    const [payments, stats] = await Promise.all([
      db.execute(sql`
        SELECT p.*,
          b.booking_ref, TRIM(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')) as booking_guest, b.check_in, b.check_out,
          b.total_amount as booking_total, b.paid_amount as booking_paid,
          le.name as legal_entity_name, le.short_name as legal_entity_short,
          u2.name as staff_name,
          ref_p.receipt_number as refund_of_receipt
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        ${ORG_JOIN}
        LEFT JOIN legal_entities le ON le.id = p.legal_entity_id
        LEFT JOIN users u2 ON u2.id = p.staff_id
        LEFT JOIN payments ref_p ON ref_p.id = p.refund_of_id
        WHERE _p.organization_id = ${orgId}
        ${extraSql}
        ORDER BY p.created_at DESC LIMIT 200
      `),
      db.execute(sql`
        SELECT
          SUM(CASE WHEN p.payment_type::text != 'refund' THEN p.amount ELSE 0 END) as collected,
          SUM(CASE WHEN p.payment_type::text = 'refund' THEN p.amount ELSE 0 END) as refunded,
          COUNT(*) as count
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        ${ORG_JOIN}
        WHERE _p.organization_id = ${orgId} AND p.status::text = 'completed'
      `),
    ]);

    res.json({ payments: payments.rows, stats: stats.rows[0] || {} });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── RECORD PAYMENT ───────────────────────────────────────────────────────────
router.post("/payments", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const userId: number = req.user?.id;
    const { bookingId, amount, method, description, paymentType = "payment", currency = "UAH" } = req.body;
    if (!bookingId || !amount) return res.status(400).json({ error: "bookingId та amount обов'язкові" });

    const le = await getDefaultLegalEntity(orgId);
    const receipt = `REC-${Date.now()}`;

    const [payment] = await db.insert(paymentsTable).values({
      bookingId, amount: amount.toString(),
      method: (method || "cash") as any, status: "completed",
      paymentType: paymentType as any, legalEntityId: le?.id ?? null,
      receiptNumber: receipt, processedAt: new Date(), staffId: userId,
      currency, description, netAmount: amount.toString(),
    } as any).returning();

    await updateBookingPayment(bookingId, parseFloat(amount), paymentType);
    res.json({ payment, receiptNumber: receipt });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── REFUND ───────────────────────────────────────────────────────────────────
router.post("/payments/:id/refund", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId: number = req.user?.id;
    const { amount, reason } = req.body;
    const [orig] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
    if (!orig) return res.status(404).json({ error: "Платіж не знайдено" });

    const refAmt = parseFloat(amount) || parseFloat(orig.amount.toString());
    const receipt = `REF-${Date.now()}`;

    const [refund] = await db.insert(paymentsTable).values({
      bookingId: orig.bookingId, amount: refAmt.toString(),
      method: orig.method, status: "refunded", paymentType: "refund" as any,
      refundOfId: id, receiptNumber: receipt, processedAt: new Date(),
      staffId: userId, currency: (orig as any).currency || "UAH",
      description: reason || `Повернення по ${orig.receiptNumber || orig.id}`,
      legalEntityId: (orig as any).legalEntityId ?? null,
      netAmount: refAmt.toString(),
    } as any).returning();

    await db.update(paymentsTable).set({ status: "refunded" } as any).where(eq(paymentsTable.id, id));
    await updateBookingPayment(orig.bookingId, refAmt, "refund");
    res.json({ refund, receiptNumber: receipt });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── AUTO-GENERATE INVOICE ────────────────────────────────────────────────────
router.post("/invoices/generate", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const userId: number = req.user?.id;
    const { bookingId, type = "accommodation" } = req.body;
    if (!bookingId) return res.status(400).json({ error: "bookingId обов'язковий" });

    const existing = await db.select().from(invoicesTable).where(eq(invoicesTable.bookingId, bookingId));
    if (existing.length) return res.json({ invoice: existing[0], existed: true });

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });

    const le = await getDefaultLegalEntity(orgId);
    const invoiceNumber = await genInvoiceNumber();
    const total = parseFloat(booking.totalAmount || "0");
    const subtotal = Math.round(total / 1.2 * 100) / 100;
    const vat = Math.round((total - subtotal) * 100) / 100;

    const [invoice] = await db.insert(invoicesTable).values({
      invoiceNumber, bookingId, guestId: booking.guestId ?? null,
      invoiceType: type as any, status: "pending",
      amount: total.toString(), taxAmount: vat.toString(),
      subtotal: subtotal.toString(), vatAmount: vat.toString(),
      currency: "UAH",
      description: `Проживання: ${booking.bookingRef}`,
      dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      legalEntityId: le?.id ?? null, counterpartyName: booking.guestName ?? null,
      isAutoGenerated: true, createdById: userId,
    } as any).returning();

    res.json({ invoice });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── LIST INVOICES ────────────────────────────────────────────────────────────
router.get("/invoices", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const { bookingId, status, search } = req.query as any;

    const extra: ReturnType<typeof sql>[] = [];
    if (bookingId) extra.push(sql`AND i.booking_id = ${parseInt(bookingId)}`);
    if (status && ["draft","pending","paid","overdue","cancelled"].includes(status))
      extra.push(sql`AND i.status::text = ${status}`);
    if (search)
      extra.push(sql`AND (b.booking_ref ILIKE ${"%" + search + "%"} OR TRIM(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')) ILIKE ${"%" + search + "%"} OR i.invoice_number ILIKE ${"%" + search + "%"})`);

    const extraSql = extra.reduce((acc, s) => sql`${acc} ${s}`, sql``);

    const invoices = await db.execute(sql`
      SELECT i.*, b.booking_ref, TRIM(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')) as guest_name, b.check_in, b.check_out,
             b.payment_status as booking_payment_status,
             le.name as legal_entity_name, le.short_name as legal_entity_short
      FROM invoices i
      JOIN bookings b ON b.id = i.booking_id
      ${ORG_JOIN}
      LEFT JOIN legal_entities le ON le.id = i.legal_entity_id
      WHERE _p.organization_id = ${orgId}
      ${extraSql}
      ORDER BY i.created_at DESC LIMIT 200
    `);

    res.json({ invoices: invoices.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/invoices/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, paidAmount, paymentMethod } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (paidAmount !== undefined) { updates.paidAmount = paidAmount.toString(); updates.paidAt = new Date(); }
    if (paymentMethod) updates.paymentMethod = paymentMethod;
    const [updated] = await db.update(invoicesTable).set(updates).where(eq(invoicesTable.id, id)).returning();
    res.json({ invoice: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── LIQPAY: CREATE LINK ─────────────────────────────────────────────────────
router.post("/liqpay/create-link", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const { bookingId, amount, description, guestEmail, guestPhone, guestName, expiresInDays = 3 } = req.body;
    if (!bookingId || !amount) return res.status(400).json({ error: "bookingId та amount обов'язкові" });

    const le = await getDefaultLegalEntity(orgId);
    const orderId = `HOTEL-${bookingId}-${Date.now()}`;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 3600 * 1000);
    const hasKeys = !!(le?.liqpay_public_key && le?.liqpay_private_key);

    let checkoutUrl: string | null = null;
    let dataStr: string | null = null;
    let sig: string | null = null;

    if (hasKeys) {
      const payObj = {
        public_key: le.liqpay_public_key, version: "3", action: "pay",
        amount: amount.toString(), currency: "UAH",
        description: description || `Оплата бронювання #${bookingId}`, order_id: orderId,
        server_url: `${process.env.API_BASE_URL || "http://localhost:8080"}/api/finance/liqpay/webhook`,
        result_url: process.env.FRONTEND_URL || "", language: "uk",
      };
      dataStr = liqpayEncode(payObj);
      sig = liqpaySign(dataStr, le.liqpay_private_key);
      checkoutUrl = `https://www.liqpay.ua/api/3/checkout?data=${encodeURIComponent(dataStr)}&signature=${encodeURIComponent(sig)}`;
    }

    const leId = le?.id ?? null;
    await db.execute(sql`
      INSERT INTO payment_links (booking_id, organization_id, legal_entity_id, amount, currency, description, status, provider, order_id, checkout_url, liqpay_data, liqpay_signature, expires_at, guest_email, guest_phone, guest_name, created_at, updated_at)
      VALUES (${bookingId}, ${orgId}, ${leId}, ${amount}, 'UAH', ${description ?? null}, 'pending', 'liqpay', ${orderId}, ${checkoutUrl}, ${dataStr}, ${sig}, ${expiresAt.toISOString()}, ${guestEmail ?? null}, ${guestPhone ?? null}, ${guestName ?? null}, NOW(), NOW())
    `);

    if (checkoutUrl) {
      await db.update(bookingsTable)
        .set({ paymentLink: checkoutUrl, updatedAt: new Date() } as any)
        .where(eq(bookingsTable.id, bookingId));
    }

    res.json({
      checkoutUrl, orderId, hasKeys,
      message: hasKeys
        ? "Посилання для оплати LiqPay сформовано"
        : "LiqPay ключі не налаштовані. Додайте public/private ключі у юридичній особі.",
      emailText: checkoutUrl
        ? `Для оплати бронювання перейдіть: ${checkoutUrl}`
        : "Налаштуйте LiqPay ключі у розділі «Бухгалтерія → Юридичні особи»",
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── LIQPAY: WEBHOOK ──────────────────────────────────────────────────────────
router.post("/liqpay/webhook", async (req: any, res) => {
  try {
    const { data, signature } = req.body;
    if (!data) return res.status(400).send("No data");
    const decoded = liqpayDecode(data);
    const { order_id, status, amount, payment_id, description } = decoded;

    const linkRes = await db.execute(sql`SELECT * FROM payment_links WHERE order_id = ${order_id} LIMIT 1`);
    const link = linkRes.rows[0] as any;
    if (!link) return res.send("OK");

    if (link.legal_entity_id) {
      const leRes = await db.execute(sql`SELECT * FROM legal_entities WHERE id = ${link.legal_entity_id}`);
      const le = leRes.rows[0] as any;
      if (le?.liqpay_private_key && liqpaySign(data, le.liqpay_private_key) !== signature) {
        return res.status(403).send("Invalid signature");
      }
    }

    if (["success", "sandbox"].includes(status)) {
      const [payment] = await db.insert(paymentsTable).values({
        bookingId: link.booking_id, amount: amount.toString(), method: "liqpay" as any,
        status: "completed", paymentType: "payment" as any,
        legalEntityId: link.legal_entity_id ?? null,
        liqpayOrderId: order_id, liqpayStatus: status,
        externalId: payment_id?.toString(), receiptNumber: `LQ-${order_id}`,
        processedAt: new Date(), currency: "UAH", description: description || "LiqPay оплата",
        netAmount: (amount * 0.975).toFixed(2), feeAmount: (amount * 0.025).toFixed(2),
      } as any).returning();

      await db.execute(sql`
        UPDATE payment_links SET status = 'paid', paid_amount = ${amount}, paid_at = NOW(), payment_id = ${payment.id}, updated_at = NOW()
        WHERE order_id = ${order_id}
      `);
      await updateBookingPayment(link.booking_id, parseFloat(amount), "payment");
    }

    res.send("OK");
  } catch (err: any) { console.error("LiqPay webhook:", err); res.status(500).send("Error"); }
});

// ─── LIQPAY: LIST LINKS ───────────────────────────────────────────────────────
router.get("/liqpay/links", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const links = await db.execute(sql`
      SELECT pl.*, b.booking_ref, TRIM(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')) as guest_name, le.name as legal_entity_name
      FROM payment_links pl
      JOIN bookings b ON b.id = pl.booking_id
      LEFT JOIN legal_entities le ON le.id = pl.legal_entity_id
      WHERE pl.organization_id = ${orgId}
      ORDER BY pl.created_at DESC LIMIT 100
    `);
    res.json({ links: links.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/liqpay/links/:id/cancel", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.execute(sql`UPDATE payment_links SET status = 'cancelled', updated_at = NOW() WHERE id = ${id}`);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── DEPOSITS ─────────────────────────────────────────────────────────────────
router.get("/deposits", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const { bookingId, status } = req.query as any;

    const extra: ReturnType<typeof sql>[] = [];
    if (bookingId) extra.push(sql`AND d.booking_id = ${parseInt(bookingId)}`);
    if (status && ["held","applied","refunded","forfeited"].includes(status))
      extra.push(sql`AND d.status::text = ${status}`);
    const extraSql = extra.reduce((acc, s) => sql`${acc} ${s}`, sql``);

    const [deposits, summary] = await Promise.all([
      db.execute(sql`
        SELECT d.*, b.booking_ref, TRIM(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')) as guest_name, b.check_in, b.check_out
        FROM deposits d JOIN bookings b ON b.id = d.booking_id
        WHERE d.organization_id = ${orgId}
        ${extraSql}
        ORDER BY d.created_at DESC
      `),
      db.execute(sql`
        SELECT
          COUNT(*) as total_count,
          SUM(CASE WHEN status::text = 'held' THEN amount ELSE 0 END) as held_amount,
          SUM(CASE WHEN status::text = 'refunded' THEN COALESCE(refunded_amount,0) ELSE 0 END) as refunded_amount,
          SUM(CASE WHEN status::text = 'forfeited' THEN amount ELSE 0 END) as forfeited_amount
        FROM deposits WHERE organization_id = ${orgId}
      `),
    ]);

    res.json({ deposits: deposits.rows, summary: summary.rows[0] || {} });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/deposits", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const { bookingId, amount, method = "cash", description } = req.body;
    if (!bookingId || !amount) return res.status(400).json({ error: "bookingId та amount обов'язкові" });

    const le = await getDefaultLegalEntity(orgId);
    const leId = le?.id ?? null;

    const depRes = await db.execute(sql`
      INSERT INTO deposits (booking_id, organization_id, legal_entity_id, amount, currency, status, method, description, held_at, created_at, updated_at)
      VALUES (${bookingId}, ${orgId}, ${leId}, ${amount}, 'UAH', 'held', ${method}, ${description ?? null}, NOW(), NOW(), NOW())
      RETURNING *
    `);

    await db.insert(paymentsTable).values({
      bookingId, amount: amount.toString(), method: method as any,
      status: "completed", paymentType: "deposit" as any,
      legalEntityId: leId, receiptNumber: `DEP-${Date.now()}`,
      processedAt: new Date(), currency: "UAH", description: description || "Депозит",
      netAmount: amount.toString(),
    } as any);

    res.json({ deposit: depRes.rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/deposits/:id/refund", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { amount } = req.body;
    const depRes = await db.execute(sql`SELECT * FROM deposits WHERE id = ${id}`);
    const d = depRes.rows[0] as any;
    if (!d) return res.status(404).json({ error: "Депозит не знайдено" });
    const refAmt = parseFloat(amount) || parseFloat(d.amount);
    await db.execute(sql`UPDATE deposits SET status = 'refunded', refunded_amount = ${refAmt}, refunded_at = NOW(), updated_at = NOW() WHERE id = ${id}`);
    await updateBookingPayment(d.booking_id, refAmt, "refund");
    res.json({ success: true, refundAmount: refAmt });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/deposits/:id/apply", async (req: any, res) => {
  try {
    await db.execute(sql`UPDATE deposits SET status = 'applied', applied_at = NOW(), updated_at = NOW() WHERE id = ${parseInt(req.params.id)}`);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/deposits/:id/forfeit", async (req: any, res) => {
  try {
    const { reason = "No-show / штраф" } = req.body;
    await db.execute(sql`UPDATE deposits SET status = 'forfeited', forfeited_reason = ${reason}, updated_at = NOW() WHERE id = ${parseInt(req.params.id)}`);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── INSTALLMENTS ─────────────────────────────────────────────────────────────
router.get("/installments/:bookingId", async (req: any, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const rows = await db.execute(sql`
      SELECT pi.*, p.status as payment_status, p.receipt_number, p.created_at as paid_at
      FROM payment_installments pi
      LEFT JOIN payments p ON p.id = pi.payment_id
      WHERE pi.booking_id = ${bookingId}
      ORDER BY pi.installment_number
    `);
    res.json({ installments: rows.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/installments", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const { bookingId, schedule } = req.body;
    if (!bookingId || !schedule?.length) return res.status(400).json({ error: "bookingId та schedule обов'язкові" });

    const total = schedule.length;
    const results = [];
    for (let i = 0; i < schedule.length; i++) {
      const s = schedule[i];
      const r = await db.execute(sql`
        INSERT INTO payment_installments (booking_id, organization_id, installment_number, total_installments, amount, due_date, description, status, created_at, updated_at)
        VALUES (${bookingId}, ${orgId}, ${i + 1}, ${total}, ${s.amount}, ${s.dueDate ?? null}, ${s.description || `Платіж ${i + 1} з ${total}`}, 'pending', NOW(), NOW())
        RETURNING *
      `);
      results.push(r.rows[0]);
    }
    res.json({ installments: results });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── RECONCILIATION ───────────────────────────────────────────────────────────
router.get("/reconciliation", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const { from, to, method } = req.query as any;

    const dateConds: ReturnType<typeof sql>[] = [];
    if (from) dateConds.push(sql`AND p.created_at >= ${from}::date`);
    if (to)   dateConds.push(sql`AND p.created_at <= ${to}::date + interval '1 day'`);
    if (method && ["cash","card","liqpay","stripe","bank_transfer"].includes(method))
      dateConds.push(sql`AND p.method::text = ${method}`);
    const dateExtraSql = dateConds.reduce((acc, s) => sql`${acc} ${s}`, sql``);

    const [byMethod, byStatus, summary] = await Promise.all([
      db.execute(sql`
        SELECT p.method::text as method,
          SUM(CASE WHEN p.payment_type::text != 'refund' THEN p.amount ELSE 0 END) as gross,
          SUM(CASE WHEN p.payment_type::text = 'refund' THEN p.amount ELSE 0 END) as refunds,
          SUM(COALESCE(p.fee_amount, 0)) as fees,
          SUM(COALESCE(p.net_amount, p.amount)) as net,
          COUNT(*) as count
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        ${ORG_JOIN}
        WHERE _p.organization_id = ${orgId}
        ${dateExtraSql}
        GROUP BY p.method ORDER BY gross DESC
      `),
      db.execute(sql`
        SELECT b.payment_status::text as payment_status, COUNT(*) as cnt,
               SUM(b.total_amount) as total, SUM(b.paid_amount) as paid
        FROM bookings b ${ORG_JOIN}
        WHERE _p.organization_id = ${orgId}
        GROUP BY b.payment_status
      `),
      db.execute(sql`
        SELECT
          SUM(CASE WHEN p.payment_type::text != 'refund' THEN p.amount ELSE 0 END) as total_collected,
          SUM(CASE WHEN p.payment_type::text = 'refund' THEN p.amount ELSE 0 END) as total_refunded,
          SUM(COALESCE(p.fee_amount, 0)) as total_fees,
          SUM(COALESCE(p.net_amount, p.amount)) as net_revenue,
          COUNT(DISTINCT p.booking_id) as unique_bookings
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        ${ORG_JOIN}
        WHERE _p.organization_id = ${orgId} AND p.status::text = 'completed'
        ${dateExtraSql}
      `),
    ]);

    res.json({ byMethod: byMethod.rows, byBookingStatus: byStatus.rows, summary: summary.rows[0] || {} });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── BOOKING PAYMENTS STATUS ──────────────────────────────────────────────────
router.get("/booking-payments", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const { status, overdue, search } = req.query as any;

    const extra: ReturnType<typeof sql>[] = [];
    if (status && ["unpaid","partial","paid"].includes(status))
      extra.push(sql`AND b.payment_status::text = ${status}`);
    if (overdue === "true")
      extra.push(sql`AND b.check_out < NOW() AND b.payment_status::text != 'paid'`);
    if (search)
      extra.push(sql`AND (b.booking_ref ILIKE ${"%" + search + "%"} OR TRIM(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')) ILIKE ${"%" + search + "%"} OR b.email ILIKE ${"%" + search + "%"})`);
    const extraSql = extra.reduce((acc, s) => sql`${acc} ${s}`, sql``);

    const rows = await db.execute(sql`
      SELECT b.*,
        (SELECT SUM(amount) FROM deposits d WHERE d.booking_id = b.id AND d.status::text = 'held') as held_deposit,
        (SELECT COUNT(*) FROM payment_links pl WHERE pl.booking_id = b.id AND pl.status::text = 'pending') as active_links,
        (SELECT json_agg(pm ORDER BY pm.created_at DESC) FROM payments pm WHERE pm.booking_id = b.id) as payments_json
      FROM bookings b ${ORG_JOIN}
      WHERE _p.organization_id = ${orgId}
      ${extraSql}
      ORDER BY b.check_in DESC LIMIT 100
    `);

    res.json({ bookings: rows.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
