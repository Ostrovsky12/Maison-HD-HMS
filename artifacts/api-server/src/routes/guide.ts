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
    tipsUa: r.tips_ua,
    imageUrl: r.image_url,
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
  const [counts, pts, recent] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM guide_locations WHERE is_active = true) AS total_locations,
        (SELECT COUNT(*) FROM guide_routes WHERE is_active = true) AS total_routes,
        (SELECT COUNT(*) FROM guide_categories) AS total_categories,
        (SELECT COUNT(*) FROM guide_locations WHERE verification_status IN ('draft','under_review')) AS pending_review
    `),
    db.execute(sql`SELECT COUNT(*) AS n FROM guide_route_points`),
    db.execute(sql`
      SELECT l.id, l.title_ua, l.short_desc_ua
      FROM guide_locations l
      WHERE l.is_active = true
      ORDER BY l.id DESC LIMIT 5
    `),
  ]);
  const r = counts.rows[0] as any;
  const locationCount = parseInt(r.total_locations);
  const routeCount = parseInt(r.total_routes);
  const categoryCount = parseInt(r.total_categories);
  const routePointCount = parseInt((pts.rows[0] as any).n);
  const recentLocations = recent.rows.map((l: any) => ({
    id: l.id, titleUa: l.title_ua, shortDescUa: l.short_desc_ua,
  }));
  res.json({
    locationCount, routeCount, categoryCount, routePointCount,
    pendingReview: parseInt(r.pending_review),
    recentLocations,
  });
});

// ─── Auto-seed: run once if tables are empty ─────────────────────────────────
async function seedGuideDataIfEmpty() {
  try {
    const check = await db.execute(sql`SELECT COUNT(*) AS n FROM guide_categories`);
    const count = parseInt((check.rows[0] as any).n);
    if (count > 0) return;

    // Categories (parameterized to handle Ukrainian safely)
    const catData = [
      { nameUa: "Дерева",   nameEn: "Trees",     icon: "🌲", colorToken: "trees",     desc: "Вікові дерева та особливі екземпляри лісу" },
      { nameUa: "Гриби",    nameEn: "Mushrooms", icon: "🍄", colorToken: "mushrooms", desc: "Їстівні та декоративні гриби" },
      { nameUa: "Птахи",    nameEn: "Birds",      icon: "🦅", colorToken: "birds",     desc: "Птахи Дзвінкового та річки Ірпінь" },
      { nameUa: "Вода",     nameEn: "Water",      icon: "💧", colorToken: "water",     desc: "Джерела, струмки та заплавні місця" },
      { nameUa: "Пам'ятки", nameEn: "Monuments", icon: "🏛",  colorToken: "monuments", desc: "Історичні та культурні об'єкти" },
      { nameUa: "Краєвиди", nameEn: "Views",      icon: "🌅", colorToken: "routes",    desc: "Мальовничі місця та панорами" },
    ];
    for (const c of catData) {
      await db.execute(sql`
        INSERT INTO guide_categories (name_ua, name_en, icon, color_token, description_ua)
        VALUES (${c.nameUa}, ${c.nameEn}, ${c.icon}, ${c.colorToken}, ${c.desc})
        ON CONFLICT DO NOTHING
      `);
    }

    const cats = await db.execute(sql`SELECT id, color_token FROM guide_categories ORDER BY id`);
    const catMap: Record<string, number> = {};
    for (const c of cats.rows as any[]) catMap[c.color_token] = c.id;

    // Locations (parameterized)
    const locData = [
      { slug: "lisove-dzherelo", titleUa: "Лісове джерело", titleEn: "Forest Spring",
        catKey: "water", shortUa: "Природне джерело — природна перлина Дзвінківського урочища",
        fullUa: "Природне джерело — одна з природних перлин Дзвінківського урочища. Вода б'є з піщаного схилу соснового лісу, холодна і чиста навіть у спеку. Про цей куточок знали ще давні мешканці села — воду звідси набирали жителі навколишніх хуторів. Офіційний сайт Дзвінкового має окрему сторінку, присвячену цьому джерелу.",
        factUa: "Офіційний сайт села Дзвінкового має окрему сторінку, присвячену цьому джерелу — настільки воно відоме серед місцевих.",
        lat: 50.5845, lng: 30.4410,
        imageUrl: "https://images.unsplash.com/photo-1662779508413-79be77f95b49?w=800&fit=crop&q=80" },
      { slug: "grybna-galyavyna", titleUa: "Грибна галявина", titleEn: "Mushroom Glade",
        catKey: "mushrooms", shortUa: "Серце грибного лісу — традиційне місце збору з ХVІІ ст.",
        fullUa: "Ліс навколо Дзвінкового здавна славився грибами та ягодами. За свідченнями історичних джерел, збирання і заготівля лісових ягід і грибів було особливо важливим заняттям кожного мешканця села — від продажу їх на київських і васильківських ярмарках вони мали чималий прибуток. Ця галявина — серце грибного лісу.",
        factUa: "Мешканці Дзвінкового продавали гриби та ягоди на київських і васильківських ярмарках — це було одним з головних джерел доходу ще у ХVІІ–ХІХ ст.",
        lat: 50.5862, lng: 30.4425,
        imageUrl: "https://images.unsplash.com/photo-1760288256101-bb930c69bb61?w=800&fit=crop&q=80" },
      { slug: "vikova-sosna", titleUa: "Вікова сосна", titleEn: "Ancient Pine",
        catKey: "trees", shortUa: "Сосна-велетень у Дзвінківському заказнику",
        fullUa: "Стара сосна на схилі Дзвінківського заказника. Заказник «Дзвінківський» — офіційна природоохоронна зона, що охоплює лісовий масив навколо Дзвінкового. Ці ліси ростуть тут сотні років і пам'ятають часи, коли по стежках ходили козаки, а потім — дачники з Києва.",
        factUa: "Заказник «Дзвінківський» — офіційна природоохоронна зона, внесена до реєстру заказників Київщини.",
        lat: 50.5831, lng: 30.4405,
        imageUrl: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&fit=crop&q=80" },
      { slug: "ptashynyy-bereh", titleUa: "Пташиний берег", titleEn: "Bird Shore",
        catKey: "birds", shortUa: "Берег Ірпеня — місце, де жив і полював Остап Вишня",
        fullUa: "Берег Ірпеня біля Дзвінкового — місце, оспіване письменниками. Саме «чарівний Ірпінь, який кишів рибою, випасав своїми прибережними травами величезні табуни білих гусей» приваблював сюди відпочивальників ще з ХІХ ст. Після Другої світової тут, закоханий в Ірпінські плавні, мав свою мисливську дачу письменник-гуморист Остап Вишня.",
        factUa: "Остап Вишня — знаменитий український письменник-гуморист, багаторічний в'язень радянських концтаборів — мав тут мисливську дачу. Він був закоханий в Ірпінські плавні.",
        lat: 50.5805, lng: 30.4385,
        imageUrl: "https://images.unsplash.com/photo-1670337613556-60ce8b5481bc?w=800&fit=crop&q=80" },
      { slug: "mohyla-ferchuka", titleUa: "Могила Андрія Ферчука", titleEn: "Ferchuk Memorial",
        catKey: "monuments", shortUa: "Місце поховання відомого київського авіатора",
        fullUa: "У Дзвінковому похований відомий київський авіатор Андрій Ферчук. Меморіальне місце поблизу старого кладовища — місце пам'яті про людей, чиї долі були пов'язані з цим краєм. Тут відчувається особлива тиша і зв'язок з минулим.",
        factUa: "Андрій Ферчук — відомий київський авіатор, чиє ім'я пов'язане з історією авіації краю — похований саме у Дзвінковому.",
        lat: 50.5817, lng: 30.4462,
        imageUrl: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&fit=crop&q=80" },
      { slug: "dub-velyeten", titleUa: "Дуб-велетень", titleEn: "Giant Oak",
        catKey: "trees", shortUa: "Могутній дуб — свідок кількох сторіч у заказнику",
        fullUa: "Могутній дуб — свідок кількох сторіч. Заказник «Дзвінківський» охороняє такі вікові дерева як пам'ятки природи. Ще за козацьких часів ці ліси служили укриттям, а з 70-х років ХVІ ст. до них приходили лісоруби і пасічники з навколишніх хуторів.",
        factUa: "Ці ліси входять до заказника «Дзвінківський» і перебувають під охороною держави як цінна природна екосистема.",
        lat: 50.5838, lng: 30.4398,
        imageUrl: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800&fit=crop&q=80" },
      { slug: "vyd-na-dolyny-irpenya", titleUa: "Вид на долину Ірпеня", titleEn: "Irpin Valley View",
        catKey: "routes", shortUa: "Долина річки, від дзвонів на млинах якої назвали Дзвінкове",
        fullUa: "З пагорба на краю лісу відкривається вид на заплаву Ірпеня — річки, яка дала назву цілому краю. Ірпінська долина завжди була центром притяжіння: тут стояли три водяні млини монахів Києво-Братського монастиря, дзвони яких скликали хуторян, і від яких пізніше взяло назву саме Дзвінкове.",
        factUa: "Назва «Дзвінкове» походить від дзвонів водяних млинів монахів Києво-Братського монастиря на Ірпені — ними скликали хуторян на помол зерна (ХVІІ ст.).",
        lat: 50.5798, lng: 30.4441,
        imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&fit=crop&q=80" },
    ];

    const locIds: number[] = [];
    for (const loc of locData) {
      const r = await db.execute(sql`
        INSERT INTO guide_locations
          (slug, title_ua, title_en, category_id, short_desc_ua, full_desc_ua,
           fact_ua, image_url, gps_lat, gps_lng, is_internal, verification_status, is_active)
        VALUES
          (${loc.slug}, ${loc.titleUa}, ${loc.titleEn}, ${catMap[loc.catKey]},
           ${loc.shortUa}, ${loc.fullUa}, ${(loc as any).factUa ?? null},
           ${(loc as any).imageUrl ?? null},
           ${loc.lat}, ${loc.lng}, true, 'approved', true)
        RETURNING id
      `);
      locIds.push((r.rows[0] as any).id);
    }

    // Routes (parameterized)
    const routeData = [
      { titleUa: "Ранковий маршрут до джерела", titleEn: "Morning Route to the Spring",
        dur: 20, dist: 800, diff: "easy", mood: "Спокій і свіжість", season: "Весна–Осінь",
        desc: "Короткий ранковий маршрут від DOGODA до лісового джерела. Ліс вранці особливо тихий, повітря наповнене смолою і росою.",
        tips: "Беріть пляшку — воду з джерела можна набрати. Найкраще вирушати до 9 ранку.",
        img: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&fit=crop&q=80",
        featured: true },
      { titleUa: "Маршрут пам'яті — до могили льотчика", titleEn: "Memorial Route to the Pilot's Grave",
        dur: 40, dist: 1800, diff: "easy", mood: "Спокійна прогулянка з роздумами", season: "Цілий рік",
        desc: "Неспішна прогулянка через ліс до могили льотчика Андрія Ферчука. Маршрут проходить через найстаршу частину лісу.",
        tips: "Зупиніться на хвилину мовчання.",
        img: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&fit=crop&q=80",
        featured: true },
      { titleUa: "Захід сонця над Ірпенем", titleEn: "Sunset over Irpin",
        dur: 35, dist: 1400, diff: "easy", mood: "Романтичний, споглядальний", season: "Квітень–Жовтень",
        desc: "Увечері цей маршрут веде на пагорб з видом на долину Ірпеня. Ідеальний для пар та самотніх мандрівників.",
        tips: "Виходьте за 20 хвилин до заходу сонця. Візьміть плед.",
        img: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&fit=crop&q=80",
        featured: true },
      { titleUa: "Грибний обхід", titleEn: "Mushroom Round",
        dur: 75, dist: 3200, diff: "medium", mood: "Пригода збирача", season: "Серпень–Жовтень",
        desc: "Повний обхід грибних місць Дзвінківського лісу. Різноманіття мікроклімату для різних видів грибів.",
        tips: "Корзина обов'язкова. Не збирайте незнайомі гриби.",
        img: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&fit=crop&q=80",
        featured: false },
    ];

    const routeIds: number[] = [];
    for (const rt of routeData) {
      const r = await db.execute(sql`
        INSERT INTO guide_routes
          (title_ua, title_en, duration_minutes, distance_meters, difficulty,
           mood_tag, seasonality, description_ua, tips_ua, image_url, is_featured, verification_status, is_active)
        VALUES
          (${rt.titleUa}, ${rt.titleEn}, ${rt.dur}, ${rt.dist}, ${rt.diff},
           ${rt.mood}, ${rt.season}, ${rt.desc}, ${rt.tips}, ${rt.img},
           ${rt.featured}, 'approved', true)
        RETURNING id
      `);
      routeIds.push((r.rows[0] as any).id);
    }

    // Route points
    if (locIds.length >= 7 && routeIds.length >= 4) {
      const ptData = [
        { ri: 0, pts: [0, 2, 6] },
        { ri: 1, pts: [4, 5, 1] },
        { ri: 2, pts: [3, 6] },
        { ri: 3, pts: [1, 5, 2] },
      ];
      for (const { ri, pts } of ptData) {
        for (let i = 0; i < pts.length; i++) {
          await db.execute(sql`
            INSERT INTO guide_route_points (route_id, location_id, sort_order)
            VALUES (${routeIds[ri]}, ${locIds[pts[i]]}, ${i + 1})
          `);
        }
      }
    }

    console.log("[guide] Auto-seeded default guide data successfully");
  } catch (err) {
    console.error("[guide] Auto-seed error:", err);
  }
}

// ─── POST /guide/admin/force-seed ────────────────────────────────────────────
// Admin-only: wipe and re-seed all guide data. Requires super-admin password.
router.post("/admin/force-seed", async (req, res) => {
  const pw = req.headers["x-admin-password"] || req.body?.password;
  if (!pw || pw !== process.env["SUPER_ADMIN_PASSWORD"]) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  try {
    // Wipe existing guide data in dependency order
    await db.execute(sql`DELETE FROM guide_route_points`);
    await db.execute(sql`DELETE FROM guide_routes`);
    await db.execute(sql`DELETE FROM guide_locations`);
    await db.execute(sql`DELETE FROM guide_categories`);
    // Re-seed
    await seedGuideDataIfEmpty();
    const cats = await db.execute(sql`SELECT COUNT(*) AS n FROM guide_categories`);
    const locs = await db.execute(sql`SELECT COUNT(*) AS n FROM guide_locations`);
    const routes = await db.execute(sql`SELECT COUNT(*) AS n FROM guide_routes`);
    res.json({
      ok: true,
      categories: (cats.rows[0] as any).n,
      locations: (locs.rows[0] as any).n,
      routes: (routes.rows[0] as any).n,
    });
  } catch (err: any) {
    console.error("[guide] force-seed error:", err);
    res.status(500).json({ error: err.message });
  }
});

export { seedGuideDataIfEmpty };
export default router;
