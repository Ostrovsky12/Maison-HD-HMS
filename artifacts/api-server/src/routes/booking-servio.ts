import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import { GetBookingServioStatusResponse, CheckBookingServioConnectionResponse } from "@workspace/api-zod";
import { requireRole } from "../lib/auth.js";
import { decrypt } from "../lib/encrypt.js";
import { engineConfig } from "../lib/booking-engine.js";
import { checkServioConnection, servioBaseUrl, servioHotelId, servioFingerprint, uncheckedServio } from "../lib/servio-connection.js";

const router = Router();
const editors = requireRole("super_admin", "owner", "admin");
const limiter = rateLimit({ windowMs: 60_000, max: 3, standardHeaders: true, legacyHeaders: false });

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
  try { base = servioBaseUrl(config.servioBaseUrl); hotelId = servioHotelId(config.servioHotelId); }
  catch { res.status(400).json({ error: "Потрібні числовий HotelID і HTTPS-адреса виду https://назва.servio.support/ReservationService_1_10 без додаткових параметрів." }); return; }
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
