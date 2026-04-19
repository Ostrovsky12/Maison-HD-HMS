import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// ─── Helper: fetch location with category ────────────────────────────────────
async function getLocationById(id: number) {
  const rows = await db.execute(sql`
    SELECT
      l.id, l.slug, l.title_ua, l.title_en, l.category_id,
      c.name_ua AS category_name_ua, c.icon AS category_icon,
      l.short_desc_ua, l.short_desc_en, l.full_desc_ua, l.full_desc_en,
      l.image_url, l.gps_lat, l.gps_lng, l.season,
      l.safety_note_ua, l.sensory_note_ua, l.fact_ua, l.audio_transcript_ua,
      l.is_internal, l.verification_status, l.is_active
    FROM guide_locations l
    LEFT JOIN guide_categories c ON c.id = l.category_id
    WHERE l.id = ${id}
    LIMIT 1
  `);
  const r = rows.rows[0];
  if (!r) return null;
  return mapLocation(r);
}

function mapLocation(r: any) {
  return {
    id: r.id,
    slug: r.slug,
    titleUa: r.title_ua,
    titleEn: r.title_en,
    categoryId: r.category_id,
    categoryNameUa: r.category_name_ua || null,
    categoryIcon: r.category_icon || null,
    shortDescUa: r.short_desc_ua,
    shortDescEn: r.short_desc_en,
    fullDescUa: r.full_desc_ua,
    fullDescEn: r.full_desc_en,
    imageUrl: r.image_url,
    gpsLat: parseFloat(r.gps_lat),
    gpsLng: parseFloat(r.gps_lng),
    season: r.season,
    safetyNoteUa: r.safety_note_ua,
    sensoryNoteUa: r.sensory_note_ua,
    factUa: r.fact_ua,
    audioTranscriptUa: r.audio_transcript_ua,
    isInternal: r.is_internal,
    verificationStatus: r.verification_status,
    isActive: r.is_active,
  };
}

function mapRoute(r: any, points: any[] = []) {
  return {
    id: r.id,
    titleUa: r.title_ua,
    titleEn: r.title_en,
    durationMinutes: r.duration_minutes,
    distanceMeters: r.distance_meters,
    difficulty: r.difficulty,
    moodTag: r.mood_tag,
    bestTimeOfDay: r.best_time_of_day,
    seasonality: r.seasonality,
    descriptionUa: r.description_ua,
    descriptionEn: r.description_en,
    audioIntroUa: r.audio_intro_ua,
    verificationStatus: r.verification_status,
    isFeatured: r.is_featured,
    isActive: r.is_active,
    points,
  };
}

// ─── GET /guide/home ─────────────────────────────────────────────────────────
router.get("/home", async (_req, res) => {
  const [featuredRoutesRaw, featuredLocationsRaw, counts] = await Promise.all([
    db.execute(sql`
      SELECT * FROM guide_routes WHERE is_featured = true AND is_active = true LIMIT 3
    `),
    db.execute(sql`
      SELECT l.*, c.name_ua AS category_name_ua, c.icon AS category_icon
      FROM guide_locations l
      LEFT JOIN guide_categories c ON c.id = l.category_id
      WHERE l.is_active = true AND l.is_internal = true
      ORDER BY l.id
      LIMIT 6
    `),
    db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM guide_locations WHERE is_active = true) AS total_locations,
        (SELECT COUNT(*) FROM guide_routes WHERE is_active = true) AS total_routes
    `),
  ]);

  const featuredRoutes = featuredRoutesRaw.rows.map(r => mapRoute(r));
  const featuredLocations = featuredLocationsRaw.rows.map(mapLocation);
  const c = counts.rows[0] as any;

  res.json({
    featuredRoutes,
    featuredLocations,
    bestRouteNow: featuredRoutes[0] || null,
    totalLocations: parseInt(c.total_locations),
    totalRoutes: parseInt(c.total_routes),
  });
});

// ─── GET /guide/categories ───────────────────────────────────────────────────
router.get("/categories", async (_req, res) => {
  const rows = await db.execute(sql`SELECT * FROM guide_categories ORDER BY id`);
  res.json(rows.rows.map((r: any) => ({
    id: r.id,
    nameUa: r.name_ua,
    nameEn: r.name_en,
    icon: r.icon,
    colorToken: r.color_token,
  })));
});

// ─── GET /guide/locations ────────────────────────────────────────────────────
router.get("/locations", async (req, res) => {
  const { categoryId, internal } = req.query;
  const conditions: string[] = ["l.is_active = true"];
  if (categoryId) conditions.push(`l.category_id = ${parseInt(String(categoryId))}`);
  if (internal === "true") conditions.push("l.is_internal = true");
  if (internal === "false") conditions.push("l.is_internal = false");
  const where = conditions.join(" AND ");

  const rows = await db.execute(sql.raw(`
    SELECT l.*, c.name_ua AS category_name_ua, c.icon AS category_icon
    FROM guide_locations l
    LEFT JOIN guide_categories c ON c.id = l.category_id
    WHERE ${where}
    ORDER BY l.id
  `));
  res.json(rows.rows.map(mapLocation));
});

// ─── GET /guide/locations/:id ────────────────────────────────────────────────
router.get("/locations/:id", async (req, res) => {
  const loc = await getLocationById(parseInt(req.params.id));
  if (!loc) { res.status(404).json({ error: "Not found" }); return; }
  res.json(loc);
});

// ─── POST /guide/locations ───────────────────────────────────────────────────
router.post("/locations", async (req, res) => {
  const b = req.body;
  const slug = b.slug || b.titleEn?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || `loc-${Date.now()}`;
  const rows = await db.execute(sql`
    INSERT INTO guide_locations
      (slug, title_ua, title_en, category_id, short_desc_ua, short_desc_en,
       full_desc_ua, full_desc_en, image_url, gps_lat, gps_lng, season,
       safety_note_ua, sensory_note_ua, fact_ua, audio_transcript_ua,
       is_internal, verification_status, is_active)
    VALUES
      (${slug}, ${b.titleUa}, ${b.titleEn}, ${b.categoryId || null},
       ${b.shortDescUa || null}, ${b.shortDescEn || null},
       ${b.fullDescUa || null}, ${b.fullDescEn || null},
       ${b.imageUrl || null}, ${b.gpsLat}, ${b.gpsLng},
       ${b.season || null}, ${b.safetyNoteUa || null}, ${b.sensoryNoteUa || null},
       ${b.factUa || null}, ${b.audioTranscriptUa || null},
       ${b.isInternal ?? true}, ${b.verificationStatus || 'draft'}, ${b.isActive ?? true})
    RETURNING id
  `);
  const newId = (rows.rows[0] as any).id;
  const loc = await getLocationById(newId);
  res.status(201).json(loc);
});

// ─── PUT /guide/locations/:id ────────────────────────────────────────────────
router.put("/locations/:id", async (req, res) => {
  const b = req.body;
  const id = parseInt(req.params.id);
  await db.execute(sql`
    UPDATE guide_locations SET
      title_ua = ${b.titleUa}, title_en = ${b.titleEn},
      category_id = ${b.categoryId || null},
      short_desc_ua = ${b.shortDescUa || null}, short_desc_en = ${b.shortDescEn || null},
      full_desc_ua = ${b.fullDescUa || null}, full_desc_en = ${b.fullDescEn || null},
      image_url = ${b.imageUrl || null}, gps_lat = ${b.gpsLat}, gps_lng = ${b.gpsLng},
      season = ${b.season || null}, safety_note_ua = ${b.safetyNoteUa || null},
      sensory_note_ua = ${b.sensoryNoteUa || null}, fact_ua = ${b.factUa || null},
      audio_transcript_ua = ${b.audioTranscriptUa || null},
      is_internal = ${b.isInternal ?? true},
      verification_status = ${b.verificationStatus || 'draft'},
      is_active = ${b.isActive ?? true},
      updated_at = NOW()
    WHERE id = ${id}
  `);
  const loc = await getLocationById(id);
  if (!loc) { res.status(404).json({ error: "Not found" }); return; }
  res.json(loc);
});

// ─── DELETE /guide/locations/:id ─────────────────────────────────────────────
router.delete("/locations/:id", async (req, res) => {
  await db.execute(sql`DELETE FROM guide_locations WHERE id = ${parseInt(req.params.id)}`);
  res.status(204).end();
});

// ─── GET /guide/routes ───────────────────────────────────────────────────────
router.get("/routes", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT * FROM guide_routes WHERE is_active = true ORDER BY is_featured DESC, id
  `);
  res.json(rows.rows.map(r => mapRoute(r)));
});

// ─── GET /guide/routes/:id ───────────────────────────────────────────────────
router.get("/routes/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const routeRows = await db.execute(sql`SELECT * FROM guide_routes WHERE id = ${id} LIMIT 1`);
  if (!routeRows.rows[0]) { res.status(404).json({ error: "Not found" }); return; }

  const pointRows = await db.execute(sql`
    SELECT rp.id, rp.location_id, rp.sort_order,
      l.*, c.name_ua AS category_name_ua, c.icon AS category_icon
    FROM guide_route_points rp
    JOIN guide_locations l ON l.id = rp.location_id
    LEFT JOIN guide_categories c ON c.id = l.category_id
    WHERE rp.route_id = ${id}
    ORDER BY rp.sort_order
  `);

  const points = pointRows.rows.map((r: any) => ({
    id: r.id,
    locationId: r.location_id,
    sortOrder: r.sort_order,
    location: mapLocation(r),
  }));

  res.json(mapRoute(routeRows.rows[0], points));
});

// ─── POST /guide/routes ───────────────────────────────────────────────────────
router.post("/routes", async (req, res) => {
  const b = req.body;
  const rows = await db.execute(sql`
    INSERT INTO guide_routes
      (title_ua, title_en, duration_minutes, distance_meters, difficulty,
       mood_tag, best_time_of_day, seasonality, description_ua, description_en,
       audio_intro_ua, verification_status, is_featured, is_active)
    VALUES
      (${b.titleUa}, ${b.titleEn}, ${b.durationMinutes || 30}, ${b.distanceMeters || 1000},
       ${b.difficulty || 'easy'}, ${b.moodTag || null}, ${b.bestTimeOfDay || null},
       ${b.seasonality || null}, ${b.descriptionUa || null}, ${b.descriptionEn || null},
       ${b.audioIntroUa || null}, ${b.verificationStatus || 'draft'},
       ${b.isFeatured ?? false}, ${b.isActive ?? true})
    RETURNING id
  `);
  const newId = (rows.rows[0] as any).id;

  if (Array.isArray(b.pointIds) && b.pointIds.length > 0) {
    for (let i = 0; i < b.pointIds.length; i++) {
      await db.execute(sql`
        INSERT INTO guide_route_points (route_id, location_id, sort_order)
        VALUES (${newId}, ${b.pointIds[i]}, ${i + 1})
      `);
    }
  }

  const routeRows = await db.execute(sql`SELECT * FROM guide_routes WHERE id = ${newId}`);
  res.status(201).json(mapRoute(routeRows.rows[0]));
});

// ─── PUT /guide/routes/:id ────────────────────────────────────────────────────
router.put("/routes/:id", async (req, res) => {
  const b = req.body;
  const id = parseInt(req.params.id);
  await db.execute(sql`
    UPDATE guide_routes SET
      title_ua = ${b.titleUa}, title_en = ${b.titleEn},
      duration_minutes = ${b.durationMinutes || 30},
      distance_meters = ${b.distanceMeters || 1000},
      difficulty = ${b.difficulty || 'easy'},
      mood_tag = ${b.moodTag || null}, best_time_of_day = ${b.bestTimeOfDay || null},
      seasonality = ${b.seasonality || null},
      description_ua = ${b.descriptionUa || null}, description_en = ${b.descriptionEn || null},
      audio_intro_ua = ${b.audioIntroUa || null},
      verification_status = ${b.verificationStatus || 'draft'},
      is_featured = ${b.isFeatured ?? false}, is_active = ${b.isActive ?? true},
      updated_at = NOW()
    WHERE id = ${id}
  `);

  if (Array.isArray(b.pointIds)) {
    await db.execute(sql`DELETE FROM guide_route_points WHERE route_id = ${id}`);
    for (let i = 0; i < b.pointIds.length; i++) {
      await db.execute(sql`
        INSERT INTO guide_route_points (route_id, location_id, sort_order)
        VALUES (${id}, ${b.pointIds[i]}, ${i + 1})
      `);
    }
  }

  const routeRows = await db.execute(sql`SELECT * FROM guide_routes WHERE id = ${id}`);
  if (!routeRows.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(mapRoute(routeRows.rows[0]));
});

// ─── DELETE /guide/routes/:id ─────────────────────────────────────────────────
router.delete("/routes/:id", async (req, res) => {
  await db.execute(sql`DELETE FROM guide_routes WHERE id = ${parseInt(req.params.id)}`);
  res.status(204).end();
});

// ─── GET /guide/admin/stats ───────────────────────────────────────────────────
router.get("/admin/stats", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM guide_locations WHERE is_active = true) AS total_locations,
      (SELECT COUNT(*) FROM guide_routes WHERE is_active = true) AS total_routes,
      (SELECT COUNT(*) FROM guide_categories) AS total_categories,
      (SELECT COUNT(*) FROM guide_locations WHERE verification_status IN ('draft','under_review')) AS pending_review,
      (SELECT COUNT(*) FROM guide_locations WHERE verification_status = 'approved') AS approved
  `);
  const r = rows.rows[0] as any;
  res.json({
    totalLocations: parseInt(r.total_locations),
    totalRoutes: parseInt(r.total_routes),
    totalCategories: parseInt(r.total_categories),
    pendingReview: parseInt(r.pending_review),
    approved: parseInt(r.approved),
  });
});

export default router;
