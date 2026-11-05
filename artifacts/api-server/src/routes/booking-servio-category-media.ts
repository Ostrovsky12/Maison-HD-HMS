import { Router } from "express";
import { pool } from "@workspace/db";
import { GetBookingServioCategoryMediaResponse, SaveBookingServioCategoryMediaBody, SaveBookingServioCategoryMediaResponse } from "@workspace/api-zod";
import { requireRole } from "../lib/auth.js";
import { engineConfig, validBookingMediaUrl } from "../lib/booking-engine.js";
import { servioCategoryMediaList } from "../lib/servio-category-media.js";

const router = Router();
router.get("/", async (req: any, res) => {
  const row = (await pool.query("SELECT name,booking_engine_config FROM organizations WHERE id=$1 AND is_active=true", [req.user.organizationId])).rows[0];
  if (!row) { res.status(404).json({ error: "Готель не знайдено." }); return; }
  res.json(GetBookingServioCategoryMediaResponse.parse(servioCategoryMediaList(engineConfig(row))));
});
router.put("/", requireRole("super_admin", "owner", "admin"), async (req: any, res) => {
  const parsed = SaveBookingServioCategoryMediaBody.safeParse(req.body);
  if (!parsed.success || !/^[a-f0-9]{64}$/.test(parsed.data.sourceId)
    || !Number.isSafeInteger(parsed.data.hotelId) || !Number.isSafeInteger(parsed.data.categoryId)
    || !Number.isSafeInteger(parsed.data.expectedRevision)
    || parsed.data.media.photos.some(url => !validBookingMediaUrl(url))
    || (!!parsed.data.media.videoUrl && !validBookingMediaUrl(parsed.data.media.videoUrl))) {
    res.status(400).json({ error: "Перевірте категорію, опис та HTTPS-посилання на фото чи відео." }); return;
  }
  const { sourceId, hotelId, categoryId, expectedRevision, media } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const org = (await client.query("SELECT name,booking_engine_config FROM organizations WHERE id=$1 AND is_active=true FOR UPDATE", [req.user.organizationId])).rows[0];
    if (!org) { await client.query("ROLLBACK"); res.status(404).json({ error: "Готель не знайдено." }); return; }
    const config = engineConfig(org), catalog = servioCategoryMediaList(config);
    const category = catalog.categories.find(c => c.hotelId === hotelId && c.categoryId === categoryId);
    if (!catalog.ready || catalog.sourceId !== sourceId || !category || category.revision !== expectedRevision) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Підключення, категорія або матеріали змінилися. Оновіть дані перед збереженням; ваші зміни не перезаписано." }); return;
    }
    const saved = { media: { photos: [...new Set(media.photos)], videoUrl: media.videoUrl, description: media.description,
      ...(media.details ? { details: media.details } : {}) }, revision: category.revision + 1 };
    const sources = config.servioCategoryMedia ?? {};
    const next = { ...sources, [sourceId]: { ...(sources[sourceId] ?? {}), [`${hotelId}:${categoryId}`]: saved } };
    // Merge under the tenant row lock. No units, properties, rates or Servio API writes.
    await client.query(`UPDATE organizations SET booking_engine_config=jsonb_set(coalesce(booking_engine_config,'{}'::jsonb),'{servioCategoryMedia}',$2::jsonb)
      WHERE id=$1`, [req.user.organizationId, JSON.stringify(next)]);
    await client.query("COMMIT");
    res.json(SaveBookingServioCategoryMediaResponse.parse({ hotelId, categoryId, name: category.name, ...saved }));
  } catch {
    await client.query("ROLLBACK");
    res.status(503).json({ error: "Не вдалося зберегти матеріали категорії. Ваші зміни залишаються у формі." });
  } finally { client.release(); }
});
export default router;
