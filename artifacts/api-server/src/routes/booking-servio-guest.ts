import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import {
  IssueBookingServioGuestLinkBody, IssueBookingServioGuestLinkResponse,
  GetBookingServioGuestReservationResponse, CheckoutBookingServioGuestReservationBody,
  CheckoutBookingServioGuestReservationResponse,
} from "@workspace/api-zod";
import { acceptsBookingTariff } from "../lib/booking-tariff.js";
import { engineConfig } from "../lib/booking-engine.js";
import { attemptConnection, checkoutServioReservation, reservationView, type Attempt } from "../lib/servio-reservations.js";
import { createServioGuestAccess, decodeServioGuestAccess, encodeServioGuestAccess, verifiesServioGuestAccess } from "../lib/servio-guest-access.js";

const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const privateHeaders = (res: any) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, nosnippet");
};
/** Mounted only after the parent's authenticated owner/admin role guard. */
export async function issueServioGuestLink(req: any, res: any) {
  privateHeaders(res);
  const parsed = IssueBookingServioGuestLinkBody.safeParse(req.body);
  if (!validId(req.params.id) || !parsed.success || !parsed.data.authorizeGuestAccess) {
    res.status(400).json({ error: "Потрібен явний дозвіл надати гостю приватний доступ до цього бронювання." }); return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query(`SELECT a.*,o.slug,o.name AS hotel_name,o.phone AS hotel_phone,o.email AS hotel_email,o.booking_engine_config
      FROM servio_booking_attempts a JOIN organizations o ON o.id=a.organization_id AND o.is_active=true
      WHERE a.id=$1 AND a.organization_id=$2 FOR UPDATE OF a`, [req.params.id, req.user.organizationId])).rows[0];
    if (!row) { await client.query("ROLLBACK"); res.status(404).json({ error: "Бронювання не знайдено." }); return; }
    const connection = attemptConnection(row), existing = decodeServioGuestAccess(row);
    let access = existing;
    if (!existing || Date.parse(existing.expiresAt) <= Date.now()) {
      if (row.state !== "bill_ready" || !row.bill || !connection.terms?.trim() || !connection.privacy?.trim()) {
        await client.query("ROLLBACK"); res.status(409).json({ error: "Нове посилання доступне лише для остаточного неоплаченого рахунку до видачі платіжного посилання." }); return;
      }
      const seller = (await client.query("SELECT name FROM legal_entities WHERE id=$1 AND organization_id=$2",
        [connection.legalEntityId, row.organization_id])).rows[0];
      if (!seller?.name?.trim()) {
        await client.query("ROLLBACK"); res.status(409).json({ error: "Заповніть юридичне найменування продавця перед надсиланням посилання гостю." }); return;
      }
      const config = engineConfig({ name: row.hotel_name, phone: row.hotel_phone, email: row.hotel_email, booking_engine_config: row.booking_engine_config });
      access = createServioGuestAccess(row.slug, row.id, {
        hotelName: config.displayName.trim() || row.hotel_name, sellerName: seller.name, phone: config.phone, email: config.email,
      });
      await client.query("UPDATE servio_booking_attempts SET guest_access=$3,updated_at=now() WHERE id=$1 AND organization_id=$2",
        [row.id, row.organization_id, encodeServioGuestAccess(access)]);
    }
    if (!access) throw new Error("access_unavailable");
    await client.query("COMMIT");
    res.json(IssueBookingServioGuestLinkResponse.parse({
      reservationId: row.id, expiresAt: access.expiresAt,
      url: `${connection.origin}${access.returnPath}#access=${access.token}`,
    }));
  } catch {
    await client.query("ROLLBACK");
    res.status(503).json({ error: "Приватне посилання тимчасово недоступне." });
  } finally { client.release(); }
}

const router = Router();
const limiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
router.use("/:slug/servio/reservations/:id", (_req, res, next) => { privateHeaders(res); next(); }, limiter);
async function guestAttempt(req: any): Promise<Attempt | null> {
  const token = req.get("X-Booking-Access");
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)
    || !validId(req.params.id) || typeof req.params.slug !== "string" || req.params.slug.length > 200) return null;
  const row = (await pool.query(`SELECT a.* FROM servio_booking_attempts a
    JOIN organizations o ON o.id=a.organization_id AND o.is_active=true
    WHERE a.id=$1 AND o.slug=$2`, [req.params.id, req.params.slug])).rows[0];
  return row && verifiesServioGuestAccess(row, req.params.slug, token) ? row : null;
}
router.get("/:slug/servio/reservations/:id", async (req, res) => {
  try {
    const row = await guestAttempt(req);
    if (!row) { res.status(404).json({ error: "Посилання недійсне або строк доступу минув. Зверніться до готелю." }); return; }
    const access = decodeServioGuestAccess(row)!, connection = attemptConnection(row);
    res.json(GetBookingServioGuestReservationResponse.parse({
      reservation: reservationView(row), hotelName: access.hotelName, sellerName: access.sellerName,
      phone: access.phone, email: access.email, terms: connection.terms || "", privacy: connection.privacy || "",
      accessExpiresAt: access.expiresAt,
    }));
  } catch { res.status(503).json({ error: "Не вдалося перевірити стан бронювання. Не повторюйте оплату, якщо кошти вже списано." }); }
});
router.post("/:slug/servio/reservations/:id/checkout", async (req, res) => {
  const parsed = CheckoutBookingServioGuestReservationBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.agreeTerms || !acceptsBookingTariff(parsed.data)) {
    res.status(400).json({ error: "Потрібні окремі згоди з правилами готелю та неповоротним тарифом." }); return;
  }
  try {
    const row = await guestAttempt(req);
    if (!row) { res.status(404).json({ error: "Посилання недійсне або строк доступу минув. Зверніться до готелю." }); return; }
    if (!row.bill || row.bill.totalMinor !== Math.round(parsed.data.expectedTotal * 100)) {
      res.status(409).json({ error: "Остаточна сума змінилася. Оновіть сторінку й перевірте її перед оплатою." }); return;
    }
    res.json(CheckoutBookingServioGuestReservationResponse.parse(await checkoutServioReservation(row, undefined, "guest")));
  } catch { res.status(409).json({ error: "Зараз оплату починати не можна. Оновіть стан; якщо кошти вже списано, не платіть повторно." }); }
});
export default router;
