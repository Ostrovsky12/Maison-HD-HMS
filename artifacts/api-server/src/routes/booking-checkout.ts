import { Router } from "express";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import rateLimit from "express-rate-limit";
import { decrypt } from "../lib/encrypt.js";
import { generateLiqPayForm, parseLiqPayData, verifyLiqPayCallbackWithKey } from "../lib/liqpay.js";
import { acceptsBookingTariff, BOOKING_TARIFF_POLICY, bookingMerchant } from "../lib/booking-tariff.js";

function sameCode(a: unknown, b: unknown) {
  if (typeof a !== "string" || typeof b !== "string" || !a || a.length !== b.length || a.length > 100) return false;
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
function money(value: unknown) { return Math.round(Number(value) * 100); }
export function bookingPaymentOrigin() {
  const configured = process.env.PUBLIC_APP_URL || process.env.PUBLIC_APP_ORIGIN || process.env.FRONTEND_URL
    || (process.env.NODE_ENV !== "production" && process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "");
  try {
    const url = new URL(configured);
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : "";
  } catch { return ""; }
}
const bookingSql = `SELECT b.*,o.slug,p.legal_entity_id AS property_legal_entity_id
  FROM bookings b JOIN organizations o ON o.id=b.organization_id
  JOIN units u ON u.id=b.unit_id JOIN properties p ON p.id=u.property_id AND p.organization_id=b.organization_id
  WHERE b.id=$1 AND o.slug=$2 AND b.utm_source='maison_hd_booking'`;

export function bookingCheckoutRouter(fiscalize: (orderId: string, bookingId: number) => Promise<unknown>) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

  router.post("/:slug/checkout", limiter, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!acceptsBookingTariff(req.body)) {
      res.status(400).json({ error: "Потрібна окрема згода з умовами неповоротного тарифу та 100% передоплатою." }); return;
    }
    const base = bookingPaymentOrigin();
    if (!base) { res.status(503).json({ error: "Онлайн-оплата ще не налаштована. Оплата при заїзді для цього тарифу недоступна." }); return; }
    const id = Number(req.body.bookingId);
    if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Некоректне бронювання." }); return; }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`booking-checkout:${id}`]);
      const booking = (await client.query(bookingSql + " FOR UPDATE OF b", [id, req.params.slug])).rows[0];
      if (!booking || !sameCode(booking.guest_access_code, req.body.guestAccessCode)) {
        await client.query("ROLLBACK"); res.status(404).json({ error: "Бронювання не знайдено." }); return;
      }
      const receipt = booking.booking_policy_receipt;
      if (!receipt || receipt.version !== BOOKING_TARIFF_POLICY.version || receipt.prepaymentPercent !== 100) {
        await client.query("ROLLBACK"); res.status(409).json({ error: "Для цього бронювання не зафіксовано згоду з поточними умовами тарифу." }); return;
      }
      if (booking.payment_status === "paid" || Number(booking.paid_amount) > 0) {
        await client.query("ROLLBACK"); res.status(409).json({ error: "Бронювання вже має оплату. Повторне списання не дозволено." }); return;
      }
      if (booking.status !== "pending" || !booking.draft_expires_at || new Date(booking.draft_expires_at).getTime() <= Date.now()) {
        await client.query("ROLLBACK"); res.status(410).json({ error: "Час на оплату минув. Не оплачуйте старе посилання; оновіть пошук.", status: "expired" }); return;
      }
      const merchant = await bookingMerchant(Number(booking.organization_id), Number(booking.unit_id), client, true);
      if (!merchant?.liqpay_public_key || !merchant?.liqpay_private_key) {
        await client.query("ROLLBACK"); res.status(503).json({ error: "Готель ще не налаштував онлайн-оплату цього об’єкта. Оплата при заїзді недоступна." }); return;
      }
      const amountMinor = money(booking.total_amount);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        await client.query("ROLLBACK"); res.status(409).json({ error: "Некоректна сума до оплати." }); return;
      }
      const previous = receipt.checkout;
      if (previous && (previous.legalEntityId !== merchant.id || previous.publicKey !== merchant.liqpay_public_key || previous.amountMinor !== amountMinor)) {
        await client.query("ROLLBACK"); res.status(409).json({ error: "Реквізити або сума змінилися. Потрібна перевірка готелем; нове списання не створено." }); return;
      }
      const checkout = previous ?? {
        orderId: `mhdbe_${booking.organization_id}_${booking.id}_${randomBytes(8).toString("hex")}`,
        legalEntityId: merchant.id, publicKey: merchant.liqpay_public_key, amountMinor, currency: "UAH",
        createdAt: new Date().toISOString(), status: "awaiting_payment",
      };
      if (!previous) await client.query("UPDATE bookings SET booking_policy_receipt=jsonb_set(booking_policy_receipt,'{checkout}',$2::jsonb),updated_at=NOW() WHERE id=$1", [id, JSON.stringify(checkout)]);
      const form = generateLiqPayForm({
        action: "pay", amount: amountMinor / 100, currency: "UAH", description: `100% оплата неповоротного тарифу — ${booking.booking_ref}`,
        orderId: checkout.orderId, publicKey: merchant.liqpay_public_key, privateKey: decrypt(merchant.liqpay_private_key)!,
        serverUrl: `${base}/api/public/booking-engine/${encodeURIComponent(String(req.params.slug))}/liqpay-callback`,
        resultUrl: `${base}/booking/${encodeURIComponent(String(req.params.slug))}?payment_return=1&bookingId=${id}&code=${encodeURIComponent(booking.guest_access_code)}`,
      });
      await client.query("COMMIT");
      res.json({ data: form.data, signature: form.signature, amount: amountMinor / 100, currency: "UAH",
        checkoutUrl: "https://www.liqpay.ua/api/3/checkout", status: "awaiting_payment", bookingRef: booking.booking_ref });
    } catch {
      await client.query("ROLLBACK");
      res.status(503).json({ error: "Не вдалося підготувати оплату. Повторіть для цього ж бронювання; нове бронювання не потрібне." });
    } finally { client.release(); }
  });

  router.get("/:slug/payment-status", limiter, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = Number(req.query.bookingId);
    if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Некоректне бронювання." }); return; }
    const booking = (await pool.query(bookingSql, [id, req.params.slug])).rows[0];
    if (!booking || !sameCode(booking.guest_access_code, req.query.code)) { res.status(404).json({ error: "Бронювання не знайдено." }); return; }
    const checkout = booking.booking_policy_receipt?.checkout;
    const expired = booking.status === "cancelled" || (!!booking.draft_expires_at && new Date(booking.draft_expires_at).getTime() <= Date.now());
    const status = checkout?.status === "review" ? "review" : booking.payment_status === "paid" && booking.status === "confirmed" ? "paid" : expired ? "expired" : "awaiting_payment";
    res.json({ status, paymentStatus: booking.payment_status, bookingRef: booking.booking_ref,
      totalAmount: Number(booking.total_amount), paidAmount: Number(booking.paid_amount), currency: "UAH" });
  });

  router.post("/:slug/liqpay-callback", async (req, res) => {
    const { data, signature } = req.body ?? {};
    if (typeof data !== "string" || typeof signature !== "string" || data.length > 30_000) { res.status(400).json({ error: "invalid_callback" }); return; }
    let parsed: any;
    try { parsed = parseLiqPayData(data); } catch { res.status(400).json({ error: "invalid_callback" }); return; }
    const match = /^mhdbe_(\d+)_(\d+)_([a-f0-9]{16})$/.exec(String(parsed.order_id));
    if (!match) { res.status(400).json({ error: "invalid_order_id" }); return; }
    const bookingId = Number(match[2]), orgId = Number(match[1]);
    const lookup = (await pool.query(bookingSql, [bookingId, req.params.slug])).rows[0];
    const snapshot = lookup?.booking_policy_receipt?.checkout;
    if (!lookup || lookup.organization_id !== orgId || snapshot?.orderId !== parsed.order_id) { res.status(400).json({ error: "unknown_order" }); return; }
    const merchant = (await pool.query("SELECT id,liqpay_public_key,liqpay_private_key FROM legal_entities WHERE id=$1 AND organization_id=$2", [snapshot.legalEntityId, orgId])).rows[0];
    if (!merchant?.liqpay_private_key || merchant.liqpay_public_key !== snapshot.publicKey
      || parsed.public_key !== snapshot.publicKey
      || !verifyLiqPayCallbackWithKey(data, signature, decrypt(merchant.liqpay_private_key)!)) {
      res.status(400).json({ error: "invalid_signature" }); return;
    }
    if (parsed.status !== "success") { res.json({ ok: true, recorded: false }); return; }
    if (parsed.currency !== "UAH" || !Number.isFinite(Number(parsed.amount)) || Number(parsed.amount) <= 0
      || Math.abs(Number(parsed.amount) * 100 - snapshot.amountMinor) > 0.001) {
      res.status(400).json({ error: "amount_or_currency_mismatch" }); return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [snapshot.orderId]);
      // Use the same unit lock as every accommodation write before taking a booking row lock.
      const lockedUnit = (await client.query("SELECT id,status FROM units WHERE id=$1 FOR UPDATE", [lookup.unit_id])).rows[0];
      const booking = (await client.query(bookingSql + " FOR UPDATE OF b", [bookingId, req.params.slug])).rows[0];
      if (!booking || booking.booking_policy_receipt?.checkout?.orderId !== snapshot.orderId) throw new Error("Checkout identity changed");
      const existing = (await client.query("SELECT id FROM payments WHERE liqpay_order_id=$1 AND booking_id=$2 LIMIT 1", [snapshot.orderId, bookingId])).rows[0];
      if (!existing) {
        const expired = booking.status !== "pending" || new Date(booking.draft_expires_at).getTime() <= Date.now() || Number(booking.paid_amount) > 0;
        const overlaps = expired ? true : (await client.query(`SELECT id FROM bookings WHERE unit_id=$1 AND id<>$2 AND status::text<>'cancelled'
          AND check_in<$4::date AND check_out>$3::date LIMIT 1`, [booking.unit_id, bookingId, booking.check_in, booking.check_out])).rows.length > 0;
        const blocked = (await client.query(`SELECT id FROM accommodation_blocks WHERE organization_id=$1 AND is_active=true
          AND $2=ANY(ARRAY(SELECT jsonb_array_elements_text(unit_ids))::int[]) AND start_date<$4::date AND end_date>$3::date LIMIT 1`,
          [orgId, booking.unit_id, booking.check_in, booking.check_out])).rows.length > 0;
        const review = expired || overlaps || blocked || !lockedUnit || lockedUnit.status !== "active" || money(booking.total_amount) !== snapshot.amountMinor;
        await client.query(`INSERT INTO payments (booking_id,legal_entity_id,amount,net_amount,fee_amount,currency,method,status,payment_type,
          liqpay_order_id,liqpay_status,external_id,description,processed_at,created_at,updated_at)
          VALUES ($1,$2,$3,$3,0,'UAH','liqpay','completed','payment',$4,'success',$5,$6,NOW(),NOW(),NOW())`,
          [bookingId, snapshot.legalEntityId, (snapshot.amountMinor / 100).toFixed(2), snapshot.orderId, String(parsed.payment_id || ""), `100% неповоротний тариф ${booking.booking_ref}`]);
        await client.query(`UPDATE bookings SET paid_amount=coalesce(paid_amount,0)+$2::numeric,payment_status='paid',
          status=CASE WHEN $3 THEN status ELSE 'confirmed'::booking_status END,
          booking_policy_receipt=jsonb_set(booking_policy_receipt,'{checkout,status}',to_jsonb($4::text)),updated_at=NOW() WHERE id=$1`,
          [bookingId, (snapshot.amountMinor / 100).toFixed(2), review, review ? "review" : "paid"]);
      }
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK"); res.status(503).json({ error: "payment_record_pending" }); return;
    } finally { client.release(); }
    // Financial payment is committed independently of fiscal-provider availability.
    try { await fiscalize(snapshot.orderId, bookingId); } catch { /* durable completed payment remains available for fiscal retry */ }
    res.json({ ok: true });
  });
  return router;
}
