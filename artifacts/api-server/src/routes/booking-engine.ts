import { Router } from "express";
import { servioReservationPaymentCallback } from "./booking-servio-reservations.js";
import bookingServioGuest from "./booking-servio-guest.js";
import { pool } from "@workspace/db";
import { SaveBookingEngineSettingsBody, RequestUploadUrlBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth.js";
import { encrypt } from "../lib/encrypt.js";
import { engineConfig, engineIssues, publicEngineConfig, validBookingMediaUrl } from "../lib/booking-engine.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { BOOKING_TARIFF_POLICY } from "../lib/booking-tariff.js";
import bookingLiqpaySettings from "./booking-liqpay-settings.js";
import bookingServio from "./booking-servio.js";
import { servioCategoryMediaList } from "../lib/servio-category-media.js";

const router = Router();
router.use(requireAuth, requireRole("super_admin", "owner", "manager", "admin"));
router.use((req: any, res, next) => {
  if (!Number.isSafeInteger(req.user.organizationId) || req.user.organizationId <= 0) {
    res.status(400).json({ error: "Спочатку оберіть організацію готелю." }); return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.use("/liqpay", bookingLiqpaySettings);
router.use("/servio", bookingServio);

async function view(orgId: number, client: any = pool) {
  const { rows } = await client.query(
    "SELECT id,name,slug,phone,email,booking_engine_config FROM organizations WHERE id=$1 AND is_active=true", [orgId]);
  if (!rows[0]) return null;
  const org = rows[0], config = engineConfig(org);
  const properties = (await client.query("SELECT id,name FROM properties WHERE organization_id=$1 ORDER BY id", [orgId])).rows;
  const active = (await client.query(`SELECT count(*)::int AS count FROM units u
    JOIN properties p ON p.id=u.property_id
    WHERE p.organization_id=$1 AND u.status='active' AND coalesce(u.is_hidden,false)=false
      AND u.base_price IS NOT NULL AND u.base_price>=0`, [orgId])).rows[0]?.count || 0;
  const { servioToken, servioVerification: _internalServioCheck, liqpayVerification: _internalPaymentChecks, ...safe } = config;
  const issues = engineIssues(config, properties.length, Number(active));
  const units = (await client.query(`SELECT u.id,u.name,u.description,u.property_id AS "propertyId",p.name AS "propertyName"
    FROM units u JOIN properties p ON p.id=u.property_id WHERE p.organization_id=$1 ORDER BY p.id,u.id`, [orgId])).rows;
  return { organization: { id: org.id, name: org.name, slug: org.slug },
    config: { ...safe, hasServioToken: !!servioToken },
    readiness: { canPublish: issues.length === 0, issues, servioSupported: false }, properties, units };
}

router.get("/settings", async (req: any, res): Promise<void> => {
  const result = await view(req.user.organizationId);
  if (!result) { res.status(404).json({ error: "Готель не знайдено." }); return; }
  res.json(result);
});

router.post("/media-upload", async (req: any, res): Promise<void> => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Перевірте файл для завантаження." }); return; }
  const { name, size, contentType } = parsed.data;
  const photo = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType);
  const video = ["video/mp4", "video/webm", "video/quicktime"].includes(contentType);
  if ((!photo && !video) || !Number.isSafeInteger(size) || size <= 0
    || size > (photo ? 15 : 250) * 1024 * 1024 || !name.trim() || name.length > 255) {
    res.status(400).json({ error: "Оберіть JPEG, PNG, WEBP або GIF до 15 МБ чи MP4, WEBM або MOV до 250 МБ." }); return;
  }
  const org = (await pool.query("SELECT id,name,booking_engine_config FROM organizations WHERE id=$1 AND is_active=true", [req.user.organizationId])).rows[0];
  if (!org) { res.status(404).json({ error: "Готель не знайдено." }); return; }
  if (engineConfig(org).provider === "servio" && (!["super_admin", "owner", "admin"].includes(req.user.role)
    || !servioCategoryMediaList(engineConfig(org)).ready)) {
    res.status(409).json({ error: "Завантаження доступне власнику або адміністратору після перевірки категорій Servio. Прив’язка локальних номерів не потрібна." }); return;
  }
  try {
    const storage = new ObjectStorageService();
    const uploadURL = await storage.getObjectEntityUploadURL();
    res.json({ uploadURL, objectPath: storage.normalizeObjectEntityPath(uploadURL), metadata: { name, size, contentType } });
  } catch {
    res.status(503).json({ error: "Сховище тимчасово недоступне. Спробуйте завантажити файл пізніше." });
  }
});

router.put("/settings", async (req: any, res): Promise<void> => {
  const parsed = SaveBookingEngineSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Перевірте заповнення полів.", fields: parsed.error.issues.map(i => ({ field: i.path.join("."), message: i.message })) }); return; }
  const input = parsed.data;
  input.servioBaseUrl = input.servioBaseUrl.trim();
  input.servioHotelId = input.servioHotelId.trim();
  if (input.unitMedia) {
    const entries = Object.entries(input.unitMedia);
    if (entries.length > 500 || entries.some(([id, media]) =>
      !/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647
      || media.photos.some(url => !validBookingMediaUrl(url))
      || (!!media.videoUrl && !validBookingMediaUrl(media.videoUrl)))) {
      res.status(400).json({ error: "Для фото й відео потрібні HTTPS-посилання або публічні файли сховища. Перевірте номери об’єктів." }); return;
    }
  }
  for (const key of ["logoUrl", "servioBaseUrl"] as const) {
    if (!input[key]) continue;
    try {
      const url = new URL(input[key]);
      if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error();
    } catch { res.status(400).json({ error: `${key}: потрібна HTTPS-адреса без пароля та фрагмента.` }); return; }
  }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    res.status(400).json({ error: "Некоректна адреса email." }); return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT id,name,phone,email,booking_engine_config FROM organizations WHERE id=$1 AND is_active=true FOR UPDATE", [req.user.organizationId]);
    if (!rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Готель не знайдено." }); return; }
    const old = engineConfig(rows[0]);
    const { servioToken, clearServioToken, unitMedia, ...editable } = input;
    const upstreamChanged = old.servioBaseUrl.trim() !== editable.servioBaseUrl
      || old.servioHotelId.trim() !== editable.servioHotelId;
    if (!["super_admin", "owner", "admin"].includes(req.user.role)
      && (servioToken?.trim() || clearServioToken || upstreamChanged || old.provider !== editable.provider)) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Змінювати підключення PMS може лише власник або адміністратор." }); return;
    }
    if (editable.provider === "servio" && unitMedia
      && JSON.stringify(unitMedia) !== JSON.stringify(old.unitMedia ?? {})) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Медіа для Servio можна редагувати лише після перевіреної прив’язки його номерного фонду. Локальні номери не використовуються замість Servio." }); return;
    }
    if (unitMedia && Object.keys(unitMedia).length) {
      const ids = Object.keys(unitMedia).map(Number);
      const owned = await client.query(`SELECT u.id FROM units u JOIN properties p ON p.id=u.property_id
        WHERE p.organization_id=$1 AND u.id=ANY($2::int[])`, [req.user.organizationId, ids]);
      const ownedIds = new Set(owned.rows.map((row: any) => Number(row.id)));
      if (ids.some(id => !ownedIds.has(id))) {
        await client.query("ROLLBACK"); res.status(403).json({ error: "Медіа можна змінювати лише для номерів і будинків вашого готелю." }); return;
      }
    }
    if (old.provider !== editable.provider || upstreamChanged) {
      const active = await client.query(`SELECT id FROM bookings WHERE organization_id=$1
        AND utm_source='maison_hd_booking' AND status::text NOT IN ('cancelled','checked_out') LIMIT 1`, [req.user.organizationId]);
      if (active.rows.length) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Завершіть або звірте активні бронювання модуля перед зміною PMS чи її облікового запису." }); return;
      }
    }
    const config = { ...editable, displayName: editable.displayName.trim(), updatedAt: new Date().toISOString(),
      liqpayVerification: old.liqpayVerification,
      servioVerification: old.servioVerification,
      unitMedia: unitMedia ?? old.unitMedia ?? {},
      servioCategoryMedia: old.servioCategoryMedia,
      servioToken: clearServioToken ? undefined : servioToken?.trim() ? encrypt(servioToken.trim())! : old.servioToken };
    // Saving a new upstream identity cannot retain a different account's bearer token.
    if (!servioToken?.trim() && upstreamChanged) {
      delete config.servioToken;
    }
    const existing = await view(req.user.organizationId, client);
    const issues = engineIssues(config, existing!.properties.length,
      (await client.query(`SELECT count(*)::int AS count FROM units u JOIN properties p ON p.id=u.property_id
        WHERE p.organization_id=$1 AND u.status='active' AND coalesce(u.is_hidden,false)=false AND u.base_price>=0`,
      [req.user.organizationId])).rows[0]?.count || 0);
    if (config.published && issues.length) {
      await client.query("ROLLBACK"); res.status(409).json({ error: issues.join(" "), issues }); return;
    }
    await client.query("UPDATE organizations SET booking_engine_config=$2::jsonb,updated_at=NOW() WHERE id=$1",
      [req.user.organizationId, JSON.stringify(config)]);
    const result = await view(req.user.organizationId, client);
    await client.query("COMMIT");
    req.log.info({ organizationId: req.user.organizationId, provider: config.provider, published: config.published }, "Booking module configuration saved");
    res.json(result);
  } catch {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Не вдалося зберегти налаштування модуля." });
  } finally { client.release(); }
});

router.get("/overview", async (req: any, res): Promise<void> => {
  const id = req.user.organizationId;
  const rows = (await pool.query(`SELECT b.id,b.booking_ref AS "bookingRef",
    concat_ws(' ',b.first_name,b.last_name) AS "guestName",u.name AS "unitName",
    b.check_in::text AS "checkIn",b.check_out::text AS "checkOut",b.status,b.payment_status AS "paymentStatus",
    b.total_amount::float8 AS "totalAmount",b.created_at AS "createdAt"
    FROM bookings b JOIN units u ON u.id=b.unit_id JOIN properties p ON p.id=u.property_id
    WHERE b.organization_id=$1 AND p.organization_id=$1 AND b.source='direct'
    ORDER BY b.created_at DESC LIMIT 50`, [id])).rows;
  const stats = (await pool.query(`SELECT count(*)::int AS bookings,
    coalesce(sum(CASE WHEN status::text <> 'cancelled' THEN total_amount ELSE 0 END),0)::float8 AS "totalAmount",
    coalesce(sum(paid_amount),0)::float8 AS "paidAmount"
    FROM bookings WHERE organization_id=$1 AND source='direct'`, [id])).rows[0];
  res.json({ stats, bookings: rows, scope: "direct" });
});

export const publicEngineRouter = Router();
publicEngineRouter.use(bookingServioGuest);
publicEngineRouter.post("/servio/payment-callback", servioReservationPaymentCallback);
publicEngineRouter.get("/:slug", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const { rows } = await pool.query("SELECT id,name,slug,is_active,booking_engine_config FROM organizations WHERE slug=$1", [req.params.slug]);
  const org = rows[0];
  if (!org?.is_active) { res.status(404).json({ error: "Сторінку готелю не знайдено." }); return; }
  const config = engineConfig(org);
  if (config.provider === "servio") { res.status(503).json({ error: "Онлайн-бронювання Servio ще не підключено." }); return; }
  if (!config.published) { res.status(404).json({ error: "Сторінка бронювання ще не опублікована." }); return; }
  const properties = (await pool.query("SELECT id,name FROM properties WHERE organization_id=$1 ORDER BY id", [org.id])).rows;
  const visibleUnits = (await pool.query(`SELECT u.id FROM units u JOIN properties p ON p.id=u.property_id
    WHERE p.organization_id=$1 AND u.status='active' AND coalesce(u.is_hidden,false)=false`, [org.id])).rows;
  res.json({ organization: { name: org.name, slug: org.slug }, config: publicEngineConfig(config, visibleUnits.map((unit: any) => unit.id)), properties, currency: "UAH",
    tariffPolicy: BOOKING_TARIFF_POLICY });
});
export default router;
