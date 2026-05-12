import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);
function getOrgId(req: any, body?: any): number | null {
  // Regular users always have organizationId in JWT
  if (req.user.organizationId) return req.user.organizationId;
  // Super admin can pass orgId explicitly in request body
  const fromBody = body?.orgId ?? req.body?.orgId;
  if (fromBody) return Number(fromBody);
  return null;
}

// ─── Poster API helper ────────────────────────────────────────────────────────
async function posterFetch(account: string, method: string, token: string): Promise<any> {
  const url = `https://${account}.joinposter.com/api/${method}?token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Poster API HTTP ${res.status}`);
  const json: any = await res.json();
  if (json.error) throw new Error(`Poster: ${json.message || json.error}`);
  return json.response;
}

// ─── Normalise price ─────────────────────────────────────────────────────────
// Poster stores prices as integer kopecks (1/100 UAH)
function posterPrice(raw: any): number {
  if (!raw) return 0;
  // price can be object {"1":"8000"} or plain number or string
  const val = typeof raw === "object" ? Object.values(raw)[0] : raw;
  return Math.round(parseFloat(String(val))) / 100;
}

// ─── Extract category ID from a product (Poster uses different field names) ──
function productCategoryId(p: any): string {
  // Poster API may use category_id, menu_category_id, or similar
  const raw = p.category_id ?? p.menu_category_id ?? p.category ?? "";
  return String(raw);
}

// ─── STEP 1: Test connection & fetch preview ──────────────────────────────────
router.post("/preview", async (req, res) => {
  try {
    const { account, token } = req.body;
    if (!account || !token) return res.status(400).json({ error: "account і token обов'язкові" });

    const [rawCats, rawProducts] = await Promise.all([
      posterFetch(account, "menu.getCategories", token),
      posterFetch(account, "menu.getProducts", token),
    ]);

    const cats: any[] = Array.isArray(rawCats) ? rawCats : [];
    const products: any[] = Array.isArray(rawProducts) ? rawProducts : [];

    // Debug: log first records so we can see real Poster structure
    if (cats.length > 0) console.log("[Poster preview] First category keys:", Object.keys(cats[0]), "sample:", JSON.stringify(cats[0]).slice(0, 300));
    if (products.length > 0) console.log("[Poster preview] First product keys:", Object.keys(products[0]), "sample:", JSON.stringify(products[0]).slice(0, 300));

    // Build category maps: by id AND by name (lowercased)
    const catById: Record<string, string> = {};
    const catByName: Record<string, string> = {};
    cats.forEach((c: any) => {
      const id = String(c.category_id ?? c.id ?? "");
      const name = String(c.category_name ?? c.name ?? "");
      if (id) catById[id] = name;
      if (name) catByName[name.toLowerCase()] = id;
    });

    // Enrich products — resolve category name via ID or name fallback
    const items = products.map((p: any) => {
      const catId = productCategoryId(p);
      const catName = catById[catId] || catByName[String(p.category_name ?? "").toLowerCase()] || "Без категорії";
      return {
        poster_id: String(p.product_id ?? p.id ?? ""),
        name: String(p.product_name ?? p.name ?? ""),
        category_id: catId,
        category_name: catName,
        price: posterPrice(p.price),
        photo_url: p.photo || null,
        weight: p.out || p.weight || null,
        unit: p.unit || null,
        barcode: p.barcode || null,
        is_fiscal: p.fiscal === "1",
      };
    });

    const categories = cats.map((c: any) => {
      const id = String(c.category_id ?? c.id ?? "");
      const parentRaw = c.parent_category ?? c.parent_id ?? "0";
      const parent = String(parentRaw);
      return {
        poster_id: id,
        name: String(c.category_name ?? c.name ?? ""),
        parent_id: parent && parent !== "0" ? parent : null,
        photo: c.category_photo || null,
        sort_order: parseInt(c.sort_order || "0"),
        product_count: items.filter(i => i.category_id === id).length,
      };
    });

    // Debug: how many items were matched
    const matched = items.filter(i => i.category_name !== "Без категорії").length;
    console.log(`[Poster preview] Matched ${matched}/${items.length} products to categories`);

    res.json({
      account,
      categories,
      items,
      stats: {
        categories_count: categories.length,
        items_count: items.length,
        with_photo: items.filter(i => i.photo_url).length,
        with_price: items.filter(i => i.price > 0).length,
      },
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Не вдалось підключитись до Poster" });
  }
});

// ─── STEP 2: Execute import ───────────────────────────────────────────────────
router.post("/execute", async (req, res) => {
  try {
    const { account, token, options = {} } = req.body as {
      account: string; token: string;
      options: {
        overwrite_existing?: boolean;
        skip_no_price?: boolean;
        import_photos?: boolean;
        category_map?: Record<string, number | "new">;
      };
    };
    if (!account || !token) return res.status(400).json({ error: "account і token обов'язкові" });
    const orgId = getOrgId(req, req.body);
    if (!orgId) return res.status(400).json({ error: "Не вдалось визначити організацію. Увійдіть як власник або менеджер." });

    // Fetch from Poster
    const [rawCats, rawProducts] = await Promise.all([
      posterFetch(account, "menu.getCategories", token),
      posterFetch(account, "menu.getProducts", token),
    ]);
    const cats: any[] = Array.isArray(rawCats) ? rawCats : [];
    const products: any[] = Array.isArray(rawProducts) ? rawProducts : [];

    const stats = { categories_created: 0, categories_reused: 0, items_created: 0, items_updated: 0, items_skipped: 0 };

    // posterCatToHmsId: Poster category_id → HMS fb_categories.id
    const posterCatToHmsId: Record<string, number> = {};
    // catNameToHmsId: lowercase name → HMS fb_categories.id (fallback)
    const catNameToHmsId: Record<string, number> = {};

    // ── Phase 1: import categories ───────────────────────────────────────────
    for (const cat of cats) {
      const pid = String(cat.category_id ?? cat.id ?? "");
      const catName = String(cat.category_name ?? cat.name ?? "");
      if (!pid || !catName) continue;

      // If user provided mapping
      if (options.category_map && options.category_map[pid] !== undefined) {
        const mapped = options.category_map[pid];
        if (mapped !== "new" && typeof mapped === "number") {
          posterCatToHmsId[pid] = mapped;
          catNameToHmsId[catName.toLowerCase()] = mapped;
          stats.categories_reused++;
          continue;
        }
      }

      // Check if category with same name already exists
      const existing = (await db.execute(sql`
        SELECT id FROM fb_categories
        WHERE organization_id = ${orgId} AND LOWER(name) = LOWER(${catName}) AND is_active = true
        LIMIT 1
      `)).rows[0] as any;

      if (existing && !options.overwrite_existing) {
        posterCatToHmsId[pid] = existing.id;
        catNameToHmsId[catName.toLowerCase()] = existing.id;
        stats.categories_reused++;
        continue;
      }

      if (existing && options.overwrite_existing) {
        await db.execute(sql`
          UPDATE fb_categories SET
            name = ${catName},
            sort_order = ${parseInt(cat.sort_order || "0")},
            updated_at = NOW()
          WHERE id = ${existing.id}
        `);
        posterCatToHmsId[pid] = existing.id;
        catNameToHmsId[catName.toLowerCase()] = existing.id;
        stats.categories_reused++;
        continue;
      }

      // Create new category
      const newCat = await db.execute(sql`
        INSERT INTO fb_categories (organization_id, name, emoji, sort_order, is_active)
        VALUES (${orgId}, ${catName}, ${"🍽"}, ${parseInt(cat.sort_order || "0")}, true)
        RETURNING id
      `);
      const newId = (newCat.rows[0] as any).id;
      posterCatToHmsId[pid] = newId;
      catNameToHmsId[catName.toLowerCase()] = newId;
      stats.categories_created++;
    }

    console.log(`[Poster execute] Category map has ${Object.keys(posterCatToHmsId).length} entries`);

    // ── Phase 2: import products ─────────────────────────────────────────────
    for (const p of products) {
      const price = posterPrice(p.price);
      if (options.skip_no_price && price === 0) { stats.items_skipped++; continue; }

      // Try ID-based match first, then name-based fallback
      const pid = productCategoryId(p);
      const catNameRaw = String(p.category_name ?? "").toLowerCase();
      const catId = posterCatToHmsId[pid]
        ?? catNameToHmsId[catNameRaw]
        ?? null;

      const photoUrl = options.import_photos !== false ? (p.photo || null) : null;
      const name = String(p.product_name ?? p.name ?? "");
      if (!name) continue;

      // Check duplicate by name
      const existing = (await db.execute(sql`
        SELECT id FROM fb_items
        WHERE organization_id = ${orgId}
          AND LOWER(name) = LOWER(${name})
          AND is_active = true
        LIMIT 1
      `)).rows[0] as any;

      if (existing && !options.overwrite_existing) { stats.items_skipped++; continue; }

      if (existing && options.overwrite_existing) {
        await db.execute(sql`
          UPDATE fb_items SET
            price = ${price},
            photo_url = COALESCE(${photoUrl}, photo_url),
            category_id = COALESCE(${catId}, category_id),
            is_available = true,
            updated_at = NOW()
          WHERE id = ${existing.id}
        `);
        stats.items_updated++;
        continue;
      }

      // Create new item
      await db.execute(sql`
        INSERT INTO fb_items (organization_id, category_id, name, price, photo_url, is_available, station)
        VALUES (${orgId}, ${catId}, ${name}, ${price}, ${photoUrl}, true, ${"kitchen_general"})
      `);
      stats.items_created++;
    }

    res.json({ success: true, stats });
  } catch (e: any) {
    console.error("[Poster execute error]", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
