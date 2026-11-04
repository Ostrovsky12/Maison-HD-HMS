import { Router } from "express";
import { pool } from "@workspace/db";
import { SaveBookingEngineSettingsBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth.js";
import { encrypt } from "../lib/encrypt.js";
import { engineConfig, engineIssues, publicEngineConfig } from "../lib/booking-engine.js";

const router = Router();
router.use(requireAuth, requireRole("super_admin", "owner", "manager", "admin"));
router.use((req: any, res, next) => {
  if (!Number.isSafeInteger(req.user.organizationId) || req.user.organizationId <= 0) {
    res.status(400).json({ error: "Спочатку оберіть організацію готелю." }); return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
});

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
  const { servioToken, ...safe } = config;
  const issues = engineIssues(config, properties.length, Number(active));
  return { organization: { id: org.id, name: org.name, slug: org.slug },
    config: { ...safe, hasServioToken: !!servioToken },
    readiness: { canPublish: issues.length === 0, issues, servioSupported: false }, properties };
}

router.get("/settings", async (req: any, res): Promise<void> => {
  const result = await view(req.user.organizationId);
  if (!result) { res.status(404).json({ error: "Готель не знайдено." }); return; }
  res.json(result);
});

router.put("/settings", async (req: any, res): Promise<void> => {
  const parsed = SaveBookingEngineSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Перевірте заповнення полів.", fields: parsed.error.issues.map(i => ({ field: i.path.join("."), message: i.message })) }); return; }
  const input = parsed.data;
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
    const { servioToken, clearServioToken, ...editable } = input;
    if (old.provider !== editable.provider || old.servioBaseUrl !== editable.servioBaseUrl || old.servioHotelId !== editable.servioHotelId) {
      const active = await client.query(`SELECT id FROM bookings WHERE organization_id=$1
        AND utm_source='maison_hd_booking' AND status::text NOT IN ('cancelled','checked_out') LIMIT 1`, [req.user.organizationId]);
      if (active.rows.length) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Завершіть або звірте активні бронювання модуля перед зміною PMS чи її облікового запису." }); return;
      }
    }
    const config = { ...editable, displayName: editable.displayName.trim(), updatedAt: new Date().toISOString(),
      servioToken: clearServioToken ? undefined : servioToken?.trim() ? encrypt(servioToken.trim())! : old.servioToken };
    // Saving a new upstream identity cannot retain a different account's bearer token.
    if (!servioToken?.trim() && (old.servioBaseUrl !== config.servioBaseUrl || old.servioHotelId !== config.servioHotelId)) {
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
publicEngineRouter.get("/:slug", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const { rows } = await pool.query("SELECT id,name,slug,is_active,booking_engine_config FROM organizations WHERE slug=$1", [req.params.slug]);
  const org = rows[0];
  if (!org?.is_active) { res.status(404).json({ error: "Сторінку готелю не знайдено." }); return; }
  const config = engineConfig(org);
  if (config.provider === "servio") { res.status(503).json({ error: "Онлайн-бронювання Servio ще не підключено." }); return; }
  if (!config.published) { res.status(404).json({ error: "Сторінка бронювання ще не опублікована." }); return; }
  const properties = (await pool.query("SELECT id,name FROM properties WHERE organization_id=$1 ORDER BY id", [org.id])).rows;
  res.json({ organization: { name: org.name, slug: org.slug }, config: publicEngineConfig(config), properties, currency: "UAH" });
});
export default router;
