import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import { GetBookingServioStatusResponse, CheckBookingServioConnectionResponse,
  SearchBookingServioAvailabilityBody, SearchBookingServioAvailabilityResponse } from "@workspace/api-zod";
import { requireRole } from "../lib/auth.js";
import { decrypt } from "../lib/encrypt.js";
import { engineConfig } from "../lib/booking-engine.js";
import { checkServioConnection, servioBaseUrl, servioHotelId, servioFingerprint, uncheckedServio } from "../lib/servio-connection.js";
import { searchServioAvailability, validServioSearch } from "../lib/servio-availability.js";
import bookingServioPreflight from "./booking-servio-preflight.js";
import bookingServioReservations from "./booking-servio-reservations.js";

const router = Router();
router.use("/preflight", bookingServioPreflight);
router.use("/reservations", bookingServioReservations);
const editors = requireRole("super_admin", "owner", "admin");
const limiter = rateLimit({ windowMs: 60_000, max: 3, standardHeaders: true, legacyHeaders: false });
const searchLimiter = rateLimit({ windowMs: 60_000, max: 6, standardHeaders: true, legacyHeaders: false });

router.post("/availability", editors, searchLimiter, async (req: any, res): Promise<void> => {
  const parsed = SearchBookingServioAvailabilityBody.safeParse(req.body);
  if (!parsed.success || !validServioSearch(parsed.data)) {
    res.status(400).json({ error: "Перевірте дати (1–31 ніч), кількість дорослих (1–20) та вік кожної дитини (0–17). CompanyID і CompanyCodeID мають бути або обидва 0, або обидва надані Servio; умова договору без компанії має бути 0." }); return;
  }
  const orgId = req.user.organizationId;
  const org = (await pool.query("SELECT name,booking_engine_config FROM organizations WHERE id=$1 AND is_active=true", [orgId])).rows[0];
  if (!org) { res.status(404).json({ error: "Готель не знайдено." }); return; }
  const config = engineConfig(org), fingerprint = servioFingerprint(config);
  const searchIdentity = JSON.stringify([fingerprint, config.checkInTime, config.checkOutTime]);
  const verified = config.servioVerification?.fingerprint === fingerprint
    ? GetBookingServioStatusResponse.safeParse(config.servioVerification.result) : null;
  if (config.provider !== "servio" || !config.servioToken || !verified?.success
    || verified.data.status !== "connected" || !verified.data.categories.length) {
    res.status(400).json({ error: "Спочатку успішно перевірте з’єднання і категорії для поточних реквізитів Servio." }); return;
  }
  let base: string, hotelId: number, token: string | null;
  try { base = servioBaseUrl(config.servioBaseUrl); hotelId = servioHotelId(config.servioHotelId); token = decrypt(config.servioToken); }
  catch { res.status(400).json({ error: "Перевірте збережені реквізити Servio." }); return; }
  if (!token || /[\r\n]/.test(token)) {
    res.status(400).json({ error: "Не вдалося прочитати AccessToken. Збережіть його заново." }); return;
  }
  const result = await searchServioAvailability({
    base, token, hotelId, checkInTime: config.checkInTime, checkOutTime: config.checkOutTime,
  }, parsed.data, verified.data.categories);
  const current = (await pool.query("SELECT name,booking_engine_config FROM organizations WHERE id=$1 AND is_active=true", [orgId])).rows[0];
  const currentConfig = current ? engineConfig(current) : null;
  if (!currentConfig || JSON.stringify([servioFingerprint(currentConfig), currentConfig.checkInTime, currentConfig.checkOutTime]) !== searchIdentity) {
    res.status(409).json({ error: "Підключення Servio змінилося під час запиту. Оновіть сторінку та повторіть перевірку." }); return;
  }
  req.log.info({ organizationId: orgId, status: result.status, code: result.code }, "Servio availability diagnostic completed");
  res.json(SearchBookingServioAvailabilityResponse.parse(result));
});

router.get("/", async (req: any, res): Promise<void> => {
  const org = (await pool.query("SELECT name,booking_engine_config FROM organizations WHERE id=$1 AND is_active=true", [req.user.organizationId])).rows[0];
  if (!org) { res.status(404).json({ error: "Готель не знайдено." }); return; }
  const config = engineConfig(org);
  const saved = config.servioVerification;
  const valid = saved?.fingerprint === servioFingerprint(config)
    ? GetBookingServioStatusResponse.safeParse(saved.result) : null;
  res.json(valid?.success ? valid.data : uncheckedServio);
});

router.post("/", editors, limiter, async (req: any, res): Promise<void> => {
  const orgId = req.user.organizationId;
  const org = (await pool.query("SELECT name,booking_engine_config FROM organizations WHERE id=$1 AND is_active=true", [orgId])).rows[0];
  if (!org) { res.status(404).json({ error: "Готель не знайдено." }); return; }
  const config = engineConfig(org);
  if (config.provider !== "servio" || !config.servioToken) {
    res.status(400).json({ error: "Спочатку збережіть джерело Servio та AccessToken." }); return;
  }
  let base: string, hotelId: number;
  try { base = servioBaseUrl(config.servioBaseUrl); }
  catch {
    res.status(400).json({ error: "Некоректна адреса Servio. Потрібна HTTPS-адреса виду https://назва.servio.support/ReservationService_1_10 без додаткових параметрів.", field: "servioBaseUrl" }); return;
  }
  try { hotelId = servioHotelId(config.servioHotelId); }
  catch {
    res.status(400).json({ error: "Некоректний HotelID. Введіть ціле число від 1 до 2147483647, надане Servio.", field: "servioHotelId" }); return;
  }
  let token: string | null;
  try { token = decrypt(config.servioToken); }
  catch { token = null; }
  if (!token || /[\r\n]/.test(token)) {
    res.status(400).json({ error: "Не вдалося прочитати AccessToken. Збережіть його заново." }); return;
  }
  const fingerprint = servioFingerprint(config);
  const result = CheckBookingServioConnectionResponse.parse(await checkServioConnection(base, hotelId, token));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = (await client.query("SELECT name,booking_engine_config FROM organizations WHERE id=$1 AND is_active=true FOR UPDATE", [orgId])).rows[0];
    if (!current || fingerprint !== servioFingerprint(engineConfig(current))) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Налаштування Servio змінилися під час перевірки. Повторіть перевірку." }); return;
    }
    await client.query(`UPDATE organizations SET booking_engine_config=jsonb_set(
      coalesce(booking_engine_config,'{}'::jsonb),'{servioVerification}',$2::jsonb),updated_at=NOW() WHERE id=$1`,
    [orgId, JSON.stringify({ fingerprint, result })]);
    await client.query("COMMIT");
    req.log.info({ organizationId: orgId, status: result.status, code: result.code }, "Servio read-only check completed");
    res.json(result);
  } catch {
    await client.query("ROLLBACK");
    res.status(503).json({ error: "Результат перевірки не вдалося зберегти. Повторіть перевірку." });
  } finally { client.release(); }
});

export default router;
