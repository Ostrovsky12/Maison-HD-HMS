import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);
const org = (req: any): number => req.user.organizationId;

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
  // price can be object {"1":"8000"} or plain number
  const val = typeof raw === "object" ? Object.values(raw)[0] : raw;
  return Math.round(parseFloat(String(val))) / 100;
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

    // Build category map for product lookup
    const catMap: Record<string, string> = {};
    cats.forEach((c: any) => { catMap[String(c.category_id)] = c.category_name; });

    // Enrich products
    const items = products.map((p: any) => ({
      poster_id: String(p.product_id),
      name: p.product_name,
      category_id: String(p.category_id),
      category_name: catMap[String(p.category_id)] || "Без категорії",
      price: posterPrice(p.price),
      photo_url: p.photo || null,
      weight: p.out || p.weight || null,
      unit: p.unit || null,
      barcode: p.barcode || null,
      is_fiscal: p.fiscal === "1",
    }));

    const categories = cats.map((c: any) => ({
      poster_id: String(c.category_id),
      name: c.category_name,
      parent_id: c.parent_category && c.parent_category !== "0" ? String(c.parent_category) : null,
      photo: c.category_photo || null,
      sort_order: parseInt(c.sort_order || "0"),
      product_count: items.filter(i => i.category_id === String(c.category_id)).length,
    }));

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
        overwrite_existing?: boolean;  // оновити вже існуючі
        skip_no_price?: boolean;       // пропустити без ціни
        import_photos?: boolean;       // зберегти URL фото
        category_map?: Record<string, number | "new">; // poster_cat_id → existing HMS cat id or "new"
      };
    };
    if (!account || !token) return res.status(400).json({ error: "account і token обов'язкові" });
    const orgId = org(req);

    // Fetch from Poster
    const [rawCats, rawProducts] = await Promise.all([
      posterFetch(account, "menu.getCategories", token),
      posterFetch(account, "menu.getProducts", token),
    ]);
    const cats: any[] = Array.isArray(rawCats) ? rawCats : [];
    const products: any[] = Array.isArray(rawProducts) ? rawProducts : [];

    const stats = { categories_created: 0, categories_reused: 0, items_created: 0, items_updated: 0, items_skipped: 0 };
    const posterCatToHmsId: Record<string, number> = {};

    // ── Phase 1: import categories ───────────────────────────────────────────
    for (const cat of cats) {
      const pid = String(cat.category_id);

      // If user provided mapping
      if (options.category_map && options.category_map[pid] !== undefined) {
        const mapped = options.category_map[pid];
        if (mapped !== "new" && typeof mapped === "number") {
          posterCatToHmsId[pid] = mapped;
          stats.categories_reused++;
          continue;
        }
      }

      // Check if category with same name already exists
      const existing = (await db.execute(sql`
        SELECT id FROM fb_categories
        WHERE organization_id = ${orgId} AND LOWER(name) = LOWER(${cat.category_name}) AND is_active = true
        LIMIT 1
      `)).rows[0] as any;

      if (existing && !options.overwrite_existing) {
        posterCatToHmsId[pid] = existing.id;
        stats.categories_reused++;
        continue;
      }

      if (existing && options.overwrite_existing) {
        await db.execute(sql`
          UPDATE fb_categories SET
            name = ${cat.category_name},
            sort_order = ${parseInt(cat.sort_order || "0")},
            updated_at = NOW()
          WHERE id = ${existing.id}
        `);
        posterCatToHmsId[pid] = existing.id;
        stats.categories_reused++;
        continue;
      }

      // Create new category
      const newCat = await db.execute(sql`
        INSERT INTO fb_categories (organization_id, name, emoji, sort_order, is_active)
        VALUES (${orgId}, ${cat.category_name}, ${"🍽"}, ${parseInt(cat.sort_order || "0")}, true)
        RETURNING id
      `);
      posterCatToHmsId[pid] = (newCat.rows[0] as any).id;
      stats.categories_created++;
    }

    // ── Phase 2: import products ─────────────────────────────────────────────
    for (const p of products) {
      const price = posterPrice(p.price);
      if (options.skip_no_price && price === 0) { stats.items_skipped++; continue; }

      const catId = posterCatToHmsId[String(p.category_id)] || null;
      const photoUrl = options.import_photos !== false ? (p.photo || null) : null;
      const name = p.product_name;

      // Check duplicate by name + category
      const existing = (await db.execute(sql`
        SELECT id FROM fb_items
        WHERE organization_id = ${orgId}
          AND LOWER(name) = LOWER(${name})
          AND (${catId}::int IS NULL OR category_id = ${catId})
          AND is_active = true
        LIMIT 1
      `)).rows[0] as any;

      if (existing && !options.overwrite_existing) { stats.items_skipped++; continue; }

      if (existing && options.overwrite_existing) {
        await db.execute(sql`
          UPDATE fb_items SET
            price = ${price},
            photo_url = COALESCE(${photoUrl}, photo_url),
            category_id = ${catId},
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
    res.status(500).json({ error: e.message });
  }
});

export default router;
