import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { PreviewPosterMenuImportBody, ExecutePosterMenuImportBody } from "@workspace/api-zod";

const router = Router();
router.use(requireAuth);
router.use((req: any, res, next) => {
  if (!["owner", "manager", "admin", "super_admin"].includes(req.user?.role)) {
    res.status(403).json({ error: "Імпорт меню доступний керівнику закладу." });
    return;
  }
  next();
});

function getOrgId(req: any, body?: any): number | null {
  if (Number.isInteger(req.user.organizationId) && req.user.organizationId > 0) return req.user.organizationId;
  const fromBody = body?.orgId ?? req.body?.orgId;
  if (req.user.role === "super_admin" && Number.isInteger(Number(fromBody)) && Number(fromBody) > 0) return Number(fromBody);
  return null;
}

async function importSource(req: any, body: any) {
  const orgId = getOrgId(req, body);
  if (!orgId) throw new Error("Відкрийте імпорт від імені конкретного закладу.");
  if (body.token?.trim()) {
    if (!body.account?.trim()) throw new Error("Вкажіть назву акаунту Poster.");
    return { orgId, account: body.account.trim(), token: body.token.trim() };
  }
  const result = await db.execute(sql`SELECT enabled_modules->'posterConfig' AS config FROM organizations WHERE id=${orgId}`);
  const config: any = (result.rows[0] as any)?.config;
  if (!config?.apiKey) throw new Error("Для цього закладу немає збереженого підключення Poster. Підключіть його в Інтеграціях.");
  return { orgId, account: String(config.accountId || "Poster"), token: String(config.apiKey) };
}

// ─── Poster API helper ────────────────────────────────────────────────────────
async function posterFetch(_account: string, method: string, token: string): Promise<any> {
  // Saved accountId is a display label, not necessarily a Poster subdomain.
  const url = new URL(`https://joinposter.com/api/${method}`);
  url.searchParams.set("token", token);
  let res: Response;
  try { res = await fetch(url, { signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error("Не вдалося отримати меню з Poster. Спробуйте ще раз пізніше."); }
  if (!res.ok) throw new Error(`Poster API HTTP ${res.status} for ${method}`);
  let json: any;
  try { json = await res.json(); } catch { throw new Error("Poster повернув некоректну відповідь."); }
  if (!json || json.error || (json.error_code !== undefined && Number(json.error_code) !== 0) || !Array.isArray(json.response)) {
    throw new Error("Poster не підтвердив доступ до довідника. Перевірте підключення й дозволи.");
  }
  return json.response;
}

// ─── Price helper (Poster stores in kopecks) ──────────────────────────────────
function posterPrice(raw: any): number {
  if (!raw) return 0;
  const values = typeof raw === "object" ? Object.values(raw) : [raw];
  const prices = [...new Set(values.map(v => Number(v)))];
  if (prices.some(p => !Number.isFinite(p) || p < 0)) throw new Error("Poster повернув некоректну ціну. Імпорт зупинено.");
  if (prices.length > 1) throw new Error("У Poster різні ціни для кількох закладів. Спочатку потрібно визначити заклад-джерело; першу ціну навмання не використовуємо.");
  return Math.round(prices[0] || 0) / 100;
}

function productCategoryId(p: any): string {
  const raw = p.category_id ?? p.menu_category_id ?? p.category ?? "";
  return String(raw);
}

// ─── Normalise ingredient unit ────────────────────────────────────────────────
function normaliseUnit(raw: string | null | undefined): string {
  if (!raw) return "кг";
  const u = String(raw).toLowerCase().trim();
  if (u === "kg" || u === "кг" || u === "кілограм") return "кг";
  if (u === "g" || u === "г" || u === "гр" || u === "грам") return "г";
  if (u === "l" || u === "л" || u === "літр") return "л";
  if (u === "ml" || u === "мл") return "мл";
  if (u === "pcs" || u === "шт" || u === "шт." || u === "piece") return "шт";
  return raw;
}

// ─── STEP 1: Preview ─────────────────────────────────────────────────────────
router.post("/preview", async (req, res) => {
  try {
    const parsed = PreviewPosterMenuImportBody.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Некоректні параметри імпорту." });
    const { account, token } = await importSource(req, parsed.data);

    // Fetch all entity types from Poster in parallel
    const [rawCats, rawProducts, rawDishes, rawIngredients, rawWorkshops] = await Promise.allSettled([
      posterFetch(account, "menu.getCategories", token),
      posterFetch(account, "menu.getProducts", token),
      posterFetch(account, "menu.getDishes", token),
      posterFetch(account, "menu.getIngredients", token),
      posterFetch(account, "menu.getWorkshops", token),
    ]);
    if (rawCats.status !== "fulfilled" || rawProducts.status !== "fulfilled") {
      throw new Error("Не вдалося завантажити категорії та товари Poster. Порожній успішний імпорт не виконано.");
    }

    const cats: any[] = rawCats.status === "fulfilled" && Array.isArray(rawCats.value) ? rawCats.value : [];
    const products: any[] = rawProducts.status === "fulfilled" && Array.isArray(rawProducts.value) ? rawProducts.value : [];
    const dishes: any[] = rawDishes.status === "fulfilled" && Array.isArray(rawDishes.value) ? rawDishes.value : [];
    const ingredients: any[] = rawIngredients.status === "fulfilled" && Array.isArray(rawIngredients.value) ? rawIngredients.value : [];
    const workshops: any[] = rawWorkshops.status === "fulfilled" && Array.isArray(rawWorkshops.value) ? rawWorkshops.value : [];

    // Build category maps
    const catById: Record<string, string> = {};
    const catByName: Record<string, string> = {};
    cats.forEach((c: any) => {
      const id = String(c.category_id ?? c.id ?? "");
      const name = String(c.category_name ?? c.name ?? "");
      if (id) catById[id] = name;
      if (name) catByName[name.toLowerCase()] = id;
    });

    // Normalise products
    const items = products.map((p: any) => {
      const catId = productCategoryId(p);
      const catName = catById[catId] || catByName[String(p.category_name ?? "").toLowerCase()] || "Без категорії";
      return {
        poster_id: String(p.product_id ?? p.id ?? ""),
        name: String(p.product_name ?? p.name ?? ""),
        category_id: catId, category_name: catName,
        price: posterPrice(p.price),
        photo_url: p.photo || null,
        weight: p.out || p.weight || null,
      };
    });

    const categories = cats.map((c: any) => {
      const id = String(c.category_id ?? c.id ?? "");
      const parentRaw = c.parent_category ?? c.parent_id ?? "0";
      return {
        poster_id: id,
        name: String(c.category_name ?? c.name ?? ""),
        parent_id: String(parentRaw) !== "0" ? String(parentRaw) : null,
        photo: c.category_photo || null,
        sort_order: parseInt(c.sort_order || "0"),
        product_count: items.filter(i => i.category_id === id).length,
      };
    });

    // Normalise dishes / tech cards
    const dishList = dishes.map((d: any) => {
      const catId = String(d.category_id ?? "");
      const catName = catById[catId] || "Без категорії";
      const ingCount = Array.isArray(d.ingredients) ? d.ingredients.length : 0;
      return {
        poster_id: String(d.dish_id ?? d.id ?? ""),
        name: String(d.dish_name ?? d.name ?? ""),
        category_id: catId, category_name: catName,
        price: posterPrice(d.price),
        photo_url: d.photo || null,
        yield: d.out || null,
        yield_unit: normaliseUnit(d.unit),
        ingredient_count: ingCount,
      };
    });

    // Normalise ingredients
    const ingList = ingredients.map((i: any) => {
      const catName = String(i.category_name ?? i.category ?? "");
      return {
        poster_id: String(i.ingredient_id ?? i.id ?? ""),
        name: String(i.ingredient_name ?? i.name ?? ""),
        category: catName,
        unit: normaliseUnit(i.unit),
        cost: posterPrice(i.price_brutto),
        barcode: i.barcode || null,
        loss_pct: parseFloat(i.loss || "0"),
      };
    });

    // Normalise workshops
    const workshopList = workshops.map((w: any) => ({
      poster_id: String(w.workshop_id ?? w.id ?? ""),
      name: String(w.workshop_name ?? w.name ?? ""),
    }));

    // Ingredient categories (unique)
    const ingCategories = [...new Set(ingList.map(i => i.category).filter(Boolean))];

    return res.json({
      account,
      categories,
      items,
      dishes: dishList,
      ingredients: ingList,
      workshops: workshopList,
      ingredient_categories: ingCategories,
      stats: {
        categories_count: categories.length,
        items_count: items.length,
        dishes_count: dishList.length,
        dishes_with_recipes: dishList.filter(d => d.ingredient_count > 0).length,
        ingredients_count: ingList.length,
        ingredient_categories_count: ingCategories.length,
        workshops_count: workshopList.length,
        with_photo: items.filter(i => i.photo_url).length + dishList.filter(d => d.photo_url).length,
        with_price: items.filter(i => i.price > 0).length,
      },
    });
  } catch (e: any) {
    return res.status(400).json({ error: e.message || "Не вдалось підключитись до Poster" });
  }
});

// ─── STEP 2: Execute import ───────────────────────────────────────────────────
router.post("/execute", async (req, res) => {
  try {
    const parsed = ExecutePosterMenuImportBody.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Некоректні параметри імпорту." });
    const { account, token, orgId } = await importSource(req, parsed.data);
    const options = parsed.data.options || {};

    // Fetch everything from Poster (including storage quantities)
    const fetches = await Promise.allSettled([
      posterFetch(account, "menu.getCategories", token),
      posterFetch(account, "menu.getProducts", token),
      options.import_dishes ? posterFetch(account, "menu.getDishes", token) : Promise.resolve([]),
      options.import_ingredients ? posterFetch(account, "menu.getIngredients", token) : Promise.resolve([]),
      options.import_ingredients ? posterFetch(account, "storage.getIngredients", token) : Promise.resolve([]),
    ]);
    const required = [0, 1, ...(options.import_dishes ? [2] : []), ...(options.import_ingredients ? [3, 4] : [])];
    if (required.some(i => fetches[i].status !== "fulfilled")) {
      throw new Error("Не вдалося завантажити вибрані довідники Poster. Дані Maison HD не змінено.");
    }

    const cats: any[] = fetches[0].status === "fulfilled" && Array.isArray(fetches[0].value) ? fetches[0].value : [];
    const products: any[] = fetches[1].status === "fulfilled" && Array.isArray(fetches[1].value) ? fetches[1].value : [];
    const dishes: any[] = fetches[2].status === "fulfilled" && Array.isArray(fetches[2].value) ? fetches[2].value : [];
    // Validate all selected sale prices before the first local write.
    for (const p of products) posterPrice(p.price);
    for (const d of dishes) posterPrice(d.price);
    const rawIngredients: any[] = fetches[3].status === "fulfilled" && Array.isArray(fetches[3].value) ? fetches[3].value : [];
    // Build stock quantity map from storage: poster_ingredient_id → quantity
    const storageItems: any[] = fetches[4].status === "fulfilled" && Array.isArray(fetches[4].value) ? fetches[4].value : [];
    const stockMap: Record<string, number> = {};
    for (const si of storageItems) {
      const id = String(si.ingredient_id ?? si.id ?? "");
      // Poster storage.getIngredients returns current balance in `ingredient_left`
      const qty = parseFloat(si.ingredient_left ?? si.quantity_units ?? si.quantity ?? si.current_stock ?? 0) || 0;
      if (id) stockMap[id] = qty;
    }

    const stats = {
      categories_created: 0, categories_reused: 0,
      items_created: 0, items_updated: 0, items_skipped: 0,
      dishes_created: 0, dishes_updated: 0, dishes_skipped: 0,
      ingredients_created: 0, ingredients_updated: 0, ingredients_skipped: 0,
      recipes_linked: 0,
    };

    // Build category maps
    const catById: Record<string, string> = {};
    const catByName: Record<string, string> = {};
    cats.forEach((c: any) => {
      const id = String(c.category_id ?? c.id ?? "");
      const name = String(c.category_name ?? c.name ?? "");
      if (id) catById[id] = name;
      if (name) catByName[name.toLowerCase()] = id;
    });

    // posterCatToHmsId: Poster category_id → HMS fb_categories.id
    const posterCatToHmsId: Record<string, number> = {};
    const catNameToHmsId: Record<string, number> = {};

    // ── Phase 1: import product/dish categories ───────────────────────────────
    for (const cat of cats) {
      const pid = String(cat.category_id ?? cat.id ?? "");
      const catName = String(cat.category_name ?? cat.name ?? "");
      if (!pid || !catName) continue;

      const existing = (await db.execute(sql`
        SELECT id FROM fb_categories
        WHERE organization_id = ${orgId} AND LOWER(name) = LOWER(${catName}) AND is_active = true
        LIMIT 1
      `)).rows[0] as any;

      if (existing) {
        posterCatToHmsId[pid] = existing.id;
        catNameToHmsId[catName.toLowerCase()] = existing.id;
        stats.categories_reused++;
      } else {
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
    }

    // ── Phase 2: import products (товари) ────────────────────────────────────
    for (const p of products) {
      const price = posterPrice(p.price);
      if (options.skip_no_price && price === 0) { stats.items_skipped++; continue; }

      const pid = productCategoryId(p);
      const catNameRaw = String(p.category_name ?? "").toLowerCase();
      const catId = posterCatToHmsId[pid] ?? catNameToHmsId[catNameRaw] ?? null;
      const rawPhoto = p.photo || null;
      const photoUrl = options.import_photos !== false && rawPhoto
        ? (rawPhoto.startsWith("http") ? rawPhoto : `https://joinposter.com${rawPhoto}`)
        : null;
      const name = String(p.product_name ?? p.name ?? "");
      if (!name) continue;

      const existing = (await db.execute(sql`
        SELECT id FROM fb_items WHERE organization_id = ${orgId} AND LOWER(name) = LOWER(${name}) AND is_active = true LIMIT 1
      `)).rows[0] as any;

      if (existing && !options.overwrite_existing) { stats.items_skipped++; continue; }
      if (existing && options.overwrite_existing) {
        await db.execute(sql`
          UPDATE fb_items SET price = ${price}, image_url = COALESCE(${photoUrl}, image_url),
            category_id = COALESCE(${catId}, category_id), is_available = true, updated_at = NOW()
          WHERE id = ${existing.id} AND organization_id = ${orgId}
        `);
        stats.items_updated++;
      } else {
        await db.execute(sql`
          INSERT INTO fb_items (organization_id, category_id, name, price, image_url, is_available, station)
          VALUES (${orgId}, ${catId}, ${name}, ${price}, ${photoUrl}, true, ${"kitchen_general"})
        `);
        stats.items_created++;
      }
    }

    // ── Phase 3: import ingredients ──────────────────────────────────────────
    // posterIngId → HMS fb_ingredients.id (for recipe linking)
    const posterIngToHmsId: Record<string, number> = {};

    if (options.import_ingredients && rawIngredients.length > 0) {
      for (const ing of rawIngredients) {
        const name = String(ing.ingredient_name ?? ing.name ?? "");
        if (!name) continue;
        const unit = normaliseUnit(ing.unit);
        const category = String(ing.category_name ?? ing.category ?? "");
        const cost = posterPrice(ing.price_brutto);
        const barcode = ing.barcode || null;
        const posterId = String(ing.ingredient_id ?? ing.id ?? "");

        const existing = (await db.execute(sql`
          SELECT id FROM fb_ingredients
          WHERE organization_id = ${orgId} AND LOWER(name) = LOWER(${name}) AND is_active = true
          LIMIT 1
        `)).rows[0] as any;

        if (existing && !options.overwrite_existing) {
          posterIngToHmsId[posterId] = existing.id;
          stats.ingredients_skipped++;
        } else if (existing && options.overwrite_existing) {
          const currentStock = stockMap[posterId] ?? null;
          await db.execute(sql`
            UPDATE fb_ingredients SET
              unit = ${unit},
              category = NULLIF(${category}, ''),
              cost_per_unit = ${cost},
              barcode = ${barcode},
              current_stock = COALESCE(${currentStock}, current_stock),
              updated_at = NOW()
            WHERE id = ${existing.id}
          `);
          posterIngToHmsId[posterId] = existing.id;
          stats.ingredients_updated++;
        } else {
          const currentStock = stockMap[posterId] ?? 0;
          const r = await db.execute(sql`
            INSERT INTO fb_ingredients (organization_id, name, unit, category, cost_per_unit, barcode, current_stock, min_stock)
            VALUES (${orgId}, ${name}, ${unit}, NULLIF(${category}, ''), ${cost}, ${barcode}, ${currentStock}, 0)
            RETURNING id
          `);
          posterIngToHmsId[posterId] = (r.rows[0] as any).id;
          stats.ingredients_created++;
        }
      }
    }

    // ── Phase 4: import dishes (тех. картки) ─────────────────────────────────
    if (options.import_dishes && dishes.length > 0) {
      for (const d of dishes) {
        const price = posterPrice(d.price);
        const catId_ = String(d.category_id ?? "");
        const catName_ = catById[catId_] || "";
        const catId = posterCatToHmsId[catId_] ?? catNameToHmsId[catName_.toLowerCase()] ?? null;
        const rawPhotoD = d.photo || null;
        const photoUrl = options.import_photos !== false && rawPhotoD
          ? (rawPhotoD.startsWith("http") ? rawPhotoD : `https://joinposter.com${rawPhotoD}`)
          : null;
        const name = String(d.dish_name ?? d.name ?? "");
        if (!name) continue;
        const yieldQty = parseFloat(d.out || "1") || 1;
        const yieldUnit = normaliseUnit(d.unit);

        // Check/create fb_item
        const existing = (await db.execute(sql`
          SELECT id FROM fb_items WHERE organization_id = ${orgId} AND LOWER(name) = LOWER(${name}) AND is_active = true LIMIT 1
        `)).rows[0] as any;

        let itemId: number;
        if (existing && !options.overwrite_existing) {
          itemId = existing.id;
          stats.dishes_skipped++;
        } else if (existing && options.overwrite_existing) {
          await db.execute(sql`
            UPDATE fb_items SET price = ${price}, image_url = COALESCE(${photoUrl}, image_url),
              category_id = COALESCE(${catId}, category_id), updated_at = NOW()
            WHERE id = ${existing.id}
          `);
          itemId = existing.id;
          stats.dishes_updated++;
        } else {
          const r = await db.execute(sql`
            INSERT INTO fb_items (organization_id, category_id, name, price, image_url, is_available, station)
            VALUES (${orgId}, ${catId}, ${name}, ${price}, ${photoUrl}, true, ${"kitchen_general"})
            RETURNING id
          `);
          itemId = (r.rows[0] as any).id;
          stats.dishes_created++;
        }

        // Create/update recipe card if requested and has ingredients
        const ingList = Array.isArray(d.ingredients) ? d.ingredients : [];
        if (options.import_recipes && ingList.length > 0 && itemId) {
          // Check if recipe card already exists for this item
          const existingCard = (await db.execute(sql`
            SELECT id FROM fb_recipe_cards WHERE menu_item_id = ${itemId} AND is_active = true LIMIT 1
          `)).rows[0] as any;

          let cardId: number;
          if (existingCard) {
            cardId = existingCard.id;
            // Delete old items to re-import
            await db.execute(sql`DELETE FROM fb_recipe_card_items WHERE recipe_id = ${cardId}`);
          } else {
            const rc = await db.execute(sql`
              INSERT INTO fb_recipe_cards (organization_id, menu_item_id, name, yield_quantity, yield_unit, is_active)
              VALUES (${orgId}, ${itemId}, ${name}, ${yieldQty}, ${yieldUnit}, true)
              RETURNING id
            `);
            cardId = (rc.rows[0] as any).id;
          }

          // Insert recipe items
          let totalCost = 0;
          for (const ri of ingList) {
            const postIngId = String(ri.ingredient_id ?? ri.id ?? "");
            const hmsIngId = posterIngToHmsId[postIngId];
            if (!hmsIngId) continue;

            const gross = parseFloat(ri.quantity || ri.gross_quantity || "0");
            const lossPct = parseFloat(ri.loss || "0");
            const net = lossPct > 0 ? gross * (1 - lossPct / 100) : gross;
            const unit = normaliseUnit(ri.unit);

            // Get cost for this ingredient
            const ingCostR = (await db.execute(sql`SELECT cost_per_unit FROM fb_ingredients WHERE id = ${hmsIngId}`)).rows[0] as any;
            const ingCost = ingCostR ? Number(ingCostR.cost_per_unit) : 0;
            totalCost += ingCost * net;

            await db.execute(sql`
              INSERT INTO fb_recipe_card_items (recipe_id, ingredient_id, gross_quantity, net_quantity, unit, loss_pct)
              VALUES (${cardId}, ${hmsIngId}, ${gross}, ${net}, ${unit}, ${lossPct})
            `);
            stats.recipes_linked++;
          }

          // Update recipe cost
          await db.execute(sql`UPDATE fb_recipe_cards SET cost_per_portion = ${totalCost}, updated_at = NOW() WHERE id = ${cardId}`);

          // Update item cost_price
          await db.execute(sql`UPDATE fb_items SET cost_price = ${totalCost}, updated_at = NOW() WHERE id = ${itemId}`);
        }
      }
    }

    return res.json({ success: true, stats });
  } catch (e: any) {
    console.error("[Poster execute error]", e);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
