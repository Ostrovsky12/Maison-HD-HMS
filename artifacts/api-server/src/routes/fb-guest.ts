/**
 * F&B Guest QR Routes — public (no auth) + cashier-protected endpoints
 * Mounted at /fb alongside fbRouter in index.ts
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { generateLiqPayForm } from "../lib/liqpay.js";
import { decrypt } from "../lib/encrypt.js";

const router = Router();

// ── Helper: map item station → printer type ───────────────────────────────────
function stationToPrinterType(station: string | null): "kitchen" | "bar" {
  if (!station) return "kitchen";
  const s = station.toLowerCase();
  if (s.startsWith("bar")) return "bar";
  return "kitchen";
}

// ── Helper: create print jobs after order acceptance ─────────────────────────
async function createPrintJobs(
  orgId: number,
  orderId: number,
  tableNumber: string | null,
  tableLocation: string | null,
  guestName: string | null,
) {
  // Fetch items with station info (category hierarchy: item.station → parent_cat.station → cat.station)
  const { rows: orderItems } = await pool.query(
    `SELECT oi.id, oi.name, oi.quantity, oi.price, oi.total_price, oi.notes,
            oi.modifiers,
            COALESCE(
              fi.station,
              CASE WHEN parent_cat.station IS NOT NULL THEN
                CASE parent_cat.station
                  WHEN 'bar' THEN 'bar'
                  ELSE 'kitchen_general'
                END
              ELSE NULL END,
              CASE WHEN cat.station IS NOT NULL THEN
                CASE cat.station
                  WHEN 'bar' THEN 'bar'
                  ELSE 'kitchen_general'
                END
              ELSE NULL END,
              'kitchen_general'
            ) AS station
     FROM fb_order_items oi
     LEFT JOIN fb_items fi ON fi.id = oi.item_id
     LEFT JOIN fb_categories cat ON cat.id = fi.category_id
     LEFT JOIN fb_categories parent_cat ON parent_cat.id = cat.parent_id
     WHERE oi.order_id = $1`,
    [orderId],
  );
  if (!orderItems.length) return;

  // Group by printer_type
  const groups: Record<string, typeof orderItems> = {};
  for (const item of orderItems) {
    const pt = stationToPrinterType(item.station);
    if (!groups[pt]) groups[pt] = [];
    groups[pt].push(item);
  }

  // Fetch available printers for this org
  const { rows: printers } = await pool.query(
    `SELECT id, type FROM fb_printers
     WHERE organization_id = $1 AND is_active = true AND type IN ('kitchen','bar','receipt')`,
    [orgId],
  );

  const printerByType: Record<string, number | null> = {};
  for (const p of printers) {
    if (!printerByType[p.type]) printerByType[p.type] = p.id;
  }

  // Create one print job per printer type that has items
  for (const [printerType, items] of Object.entries(groups)) {
    const printerId = printerByType[printerType] || null;
    await pool.query(
      `INSERT INTO fb_print_jobs
         (organization_id, order_id, printer_id, printer_type, station,
          status, table_number, table_location, guest_name, items_json)
       VALUES ($1,$2,$3,$4,$5,'queued',$6,$7,$8,$9)`,
      [
        orgId, orderId, printerId, printerType,
        items[0]?.station || printerType,
        tableNumber, tableLocation, guestName,
        JSON.stringify(items.map(i => {
          const mods: any[] = Array.isArray(i.modifiers) ? i.modifiers : (i.modifiers ? JSON.parse(i.modifiers) : []);
          return {
            name: i.name,
            quantity: Number(i.quantity),
            price: Number(i.price),
            total: Number(i.total_price),
            notes: i.notes || null,
            modifiers: mods.length ? mods.map((m: any) => `${m.groupName}: ${m.optionName}${m.priceDelta > 0 ? ` (+${m.priceDelta}₴)` : ""}`).join(", ") : null,
          };
        })),
      ],
    );
  }
}

// ── Helper: check if a table group is currently open ─────────────────────────
function isGroupOpen(group: { is_24h: boolean; open_time: string; close_time: string } | null): {
  open: boolean; opensAt: string | null;
} {
  if (!group) return { open: true, opensAt: null }; // no group = always open
  if (group.is_24h) return { open: true, opensAt: null };
  // Use Kyiv time (UTC+3 in winter, UTC+2 in summer — approximate with UTC+2 for simplicity)
  const now = new Date();
  const kyivOffset = 3 * 60; // UTC+3 (approximate, doesn't need DST precision for shift logic)
  const kyivMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + kyivOffset) % (24 * 60);
  const [oh, om] = group.open_time.split(":").map(Number);
  const [ch, cm] = group.close_time.split(":").map(Number);
  const openMinutes = oh * 60 + om;
  const closeMinutes = ch * 60 + cm;
  let open: boolean;
  if (openMinutes <= closeMinutes) {
    open = kyivMinutes >= openMinutes && kyivMinutes < closeMinutes;
  } else {
    // overnight: e.g. 22:00 – 06:00
    open = kyivMinutes >= openMinutes || kyivMinutes < closeMinutes;
  }
  const opensAt = open ? null : group.open_time;
  return { open, opensAt };
}

// ─── Shared helper: fetch menu items with optional outlet filter ──────────────
async function fetchMenuItems(orgId: number, outletId?: number | null) {
  if (outletId) {
    const { rows } = await pool.query(
      `SELECT fi.id, fi.category_id, fi.name, fi.description,
              COALESCE(foi.price_override, fi.price) AS price,
              fi.is_popular, fi.is_vegetarian, fi.allergens, fi.image_url, fi.cook_minutes,
              COALESCE(fi.station, 'kitchen_general') AS station
       FROM fb_items fi
       LEFT JOIN fb_outlet_items foi ON foi.item_id = fi.id AND foi.outlet_id = $2
       WHERE fi.organization_id = $1
         AND fi.is_available = true
         AND (fi.is_stop_list IS NULL OR fi.is_stop_list = false)
         AND (foi.item_id IS NULL OR foi.is_available IS NULL OR foi.is_available = true)
       ORDER BY fi.sort_order ASC NULLS LAST, fi.name ASC`,
      [orgId, outletId],
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT id, category_id, name, description, price,
            is_popular, is_vegetarian, allergens, image_url, cook_minutes,
            COALESCE(station, 'kitchen_general') AS station
     FROM fb_items
     WHERE organization_id = $1 AND is_available = true AND (is_stop_list IS NULL OR is_stop_list = false)
     ORDER BY sort_order ASC NULLS LAST, name ASC`,
    [orgId],
  );
  return rows;
}

// ─── GET /fb/public/guest-menu?tid=<tableId>  OR  ?outlet=<slug> ─────────────
router.get("/public/guest-menu", async (req, res) => {
  const { tid, outlet: outletSlug } = req.query;
  if (!tid && !outletSlug) return res.status(400).json({ error: "tid or outlet required" });

  try {
    let orgId: number;
    let org_name: string;
    let org_slug: string;
    let tableNumber: string | null = null;
    let tableLocation: string | null = null;
    let group_id: number | null = null;
    let outletInfo: { id: number; name: string; slug: string; icon: string; color: string; description?: string } | null = null;

    if (outletSlug) {
      // Outlet-based QR — load org from the outlet slug
      const { rows: outletRows } = await pool.query(
        `SELECT o.id as outlet_id, o.name as outlet_name, o.slug, o.icon, o.color, o.description, o.is_active,
                org.id as org_id, org.name as org_name, org.slug as org_slug
         FROM fb_outlets o
         JOIN organizations org ON org.id = o.organization_id
         WHERE o.slug = $1 LIMIT 1`,
        [outletSlug],
      );
      if (!outletRows[0]) return res.status(404).json({ error: "Outlet not found" });
      if (!outletRows[0].is_active) return res.status(403).json({ error: "outlet_closed", message: "Ця зона зараз не працює" });
      orgId = outletRows[0].org_id;
      org_name = outletRows[0].org_name;
      org_slug = outletRows[0].org_slug;
      outletInfo = {
        id: outletRows[0].outlet_id,
        name: outletRows[0].outlet_name,
        slug: outletRows[0].slug,
        icon: outletRows[0].icon,
        color: outletRows[0].color,
        description: outletRows[0].description,
      };
    } else {
      // Table-based QR (legacy path)
      const { rows: tableRows } = await pool.query(
        `SELECT ft.id, ft.number, ft.location, ft.organization_id, ft.group_id,
                o.name as org_name, o.slug as org_slug
         FROM fb_tables ft
         JOIN organizations o ON o.id = ft.organization_id
         WHERE ft.id = $1 AND ft.is_active = true LIMIT 1`,
        [tid],
      );
      if (!tableRows[0]) return res.status(404).json({ error: "Table not found" });
      orgId = tableRows[0].organization_id;
      org_name = tableRows[0].org_name;
      org_slug = tableRows[0].org_slug;
      tableNumber = tableRows[0].number;
      tableLocation = tableRows[0].location;
      group_id = tableRows[0].group_id;
    }

    // Fetch group info if assigned (table-based only)
    let groupInfo: any = null;
    let groupClosed = false;
    let groupOpensAt: string | null = null;
    if (group_id) {
      const { rows: grRows } = await pool.query(
        `SELECT id, name, icon, color, is_minibar, is_24h, open_time, close_time
         FROM fb_table_groups WHERE id = $1 AND is_active = true LIMIT 1`,
        [group_id],
      );
      if (grRows[0]) {
        groupInfo = grRows[0];
        const status = isGroupOpen(grRows[0]);
        groupClosed = !status.open;
        groupOpensAt = status.opensAt;
      }
    }

    const { rows: cats } = await pool.query(
      `SELECT id, name, description, color, parent_id, station FROM fb_categories
       WHERE organization_id = $1 AND is_active = true
       ORDER BY sort_order ASC NULLS LAST, name ASC`,
      [orgId],
    );

    // Fetch modifier groups with options
    const { rows: modGroups } = await pool.query(
      `SELECT mg.id, mg.item_id, mg.name, mg.is_required, mg.min_select, mg.max_select, mg.sort_order,
              COALESCE(json_agg(
                json_build_object(
                  'id', mo.id, 'name', mo.name, 'price_delta', mo.price_delta,
                  'sort_order', mo.sort_order, 'is_available', mo.is_available
                ) ORDER BY mo.sort_order
              ) FILTER (WHERE mo.id IS NOT NULL AND mo.is_available = true), '[]') AS options
       FROM fb_modifier_groups mg
       LEFT JOIN fb_modifier_options mo ON mo.group_id = mg.id
       WHERE mg.organization_id = $1
       GROUP BY mg.id ORDER BY mg.sort_order`,
      [orgId],
    );
    const modifiersByItem: Record<number, any[]> = {};
    for (const g of modGroups) {
      if (!modifiersByItem[g.item_id]) modifiersByItem[g.item_id] = [];
      modifiersByItem[g.item_id].push(g);
    }

    const items = await fetchMenuItems(orgId, outletInfo?.id ?? null);

    const { rows: brandingRows } = await pool.query(
      `SELECT data FROM fb_config_settings WHERE organization_id=$1 AND section='guest_branding' LIMIT 1`,
      [orgId],
    ).catch(() => ({ rows: [] }));
    const branding = brandingRows[0]?.data || {};

    const itemsWithMods = items.map((i: any) => ({ ...i, modifier_groups: modifiersByItem[i.id] || [] }));
    res.json({
      orgId, orgName: org_name, orgSlug: org_slug,
      tableNumber, tableLocation,
      categories: cats, items: itemsWithMods, branding,
      outlet: outletInfo,
      group: groupInfo
        ? { id: groupInfo.id, name: groupInfo.name, icon: groupInfo.icon, color: groupInfo.color, isMinibar: groupInfo.is_minibar }
        : null,
      groupClosed,
      groupOpensAt,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /fb/public/guest-orders ────────────────────────────────────────────
router.post("/public/guest-orders", async (req, res) => {
  const { tableId, items, guestName, guestCount, notes, tipPct, outletId, outletSlug } = req.body;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "items required" });
  }

  try {
    let orgId: number;
    let resolvedTableId = tableId || null;
    let resolvedOutletId = outletId || null;

    if (outletSlug && !outletId) {
      // Resolve outletId from slug
      const { rows } = await pool.query(
        `SELECT id, organization_id FROM fb_outlets WHERE slug = $1 AND is_active = true LIMIT 1`,
        [outletSlug],
      );
      if (!rows[0]) return res.status(404).json({ error: "Outlet not found" });
      resolvedOutletId = rows[0].id;
      orgId = rows[0].organization_id;
    } else if (resolvedTableId) {
      const { rows: tableRows } = await pool.query(
        `SELECT ft.id, ft.number, ft.organization_id, ft.group_id,
                tg.is_minibar, tg.is_24h, tg.open_time, tg.close_time
         FROM fb_tables ft
         LEFT JOIN fb_table_groups tg ON tg.id = ft.group_id AND tg.is_active = true
         WHERE ft.id = $1 AND ft.is_active = true LIMIT 1`,
        [resolvedTableId],
      );
      if (!tableRows[0]) return res.status(404).json({ error: "Table not found" });
      const { organization_id, is_minibar, is_24h, open_time, close_time } = tableRows[0];
      orgId = organization_id;

      const isMinibar = is_minibar === true;
      if (!isMinibar) {
        const groupStatus = isGroupOpen(is_24h != null ? { is_24h, open_time, close_time } : null);
        if (!groupStatus.open) {
          return res.status(403).json({
            error: "group_closed",
            message: `Замовлення зараз недоступне. Відчиняємось о ${groupStatus.opensAt}`,
            opensAt: groupStatus.opensAt,
          });
        }
      }
    } else {
      return res.status(400).json({ error: "tableId or outletSlug required" });
    }

    // Also resolve outletId if provided directly (without slug)
    if (outletId && !resolvedOutletId) resolvedOutletId = outletId;

    const safeTipPct = Math.max(0, Math.min(100, parseFloat(tipPct) || 0));
    const { rows: orderRows } = await pool.query(
      `INSERT INTO fb_orders (organization_id, table_id, order_type, guest_name, guest_count, status, notes, tip_pct, outlet_id, opened_at)
       VALUES ($1, $2, 'dine_in', $3, $4, 'new_guest', $5, $6, $7, NOW())
       RETURNING *`,
      [orgId!, resolvedTableId, guestName || "Гість (QR)", parseInt(guestCount) || 1, notes || null, safeTipPct, resolvedOutletId],
    );
    const order = orderRows[0];

    if (resolvedTableId) {
      await pool.query(
        `UPDATE fb_tables SET status = 'occupied', current_order_id = $1 WHERE id = $2`,
        [order.id, resolvedTableId],
      );
    }

    for (const item of items) {
      const { rows: itemRows } = await pool.query(
        `SELECT name, price FROM fb_items WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [item.itemId, orgId],
      );
      if (!itemRows[0]) continue;
      const { name, price } = itemRows[0];
      const qty = parseInt(item.quantity) || 1;
      // Sum modifier price deltas
      const mods: Array<{ groupId: number; groupName: string; optionId: number; optionName: string; priceDelta: number }> = Array.isArray(item.modifiers) ? item.modifiers : [];
      const modDelta = mods.reduce((s, m) => s + (parseFloat(String(m.priceDelta)) || 0), 0);
      const unitPrice = (parseFloat(price) + modDelta).toFixed(2);
      const total = (parseFloat(unitPrice) * qty).toFixed(2);
      await pool.query(
        `INSERT INTO fb_order_items (order_id, item_id, organization_id, name, price, quantity, total_price, notes, status, modifiers)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)`,
        [order.id, item.itemId, orgId, name, unitPrice, qty, total, item.notes || null,
         mods.length ? JSON.stringify(mods) : null],
      );
    }

    await pool.query(
      `UPDATE fb_orders SET total_amount = (
         SELECT COALESCE(SUM(total_price::numeric), 0) FROM fb_order_items WHERE order_id = $1
       ) WHERE id = $1`,
      [order.id],
    );

    const { rows: finalRows } = await pool.query(`SELECT * FROM fb_orders WHERE id = $1`, [order.id]);
    res.json({ order: finalRows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /fb/public/liqpay-checkout ─────────────────────────────────────────
// Generates a LiqPay checkout URL for the current open FB order at a table.
// Returns { url } — guest is redirected to LiqPay (supports Apple Pay / Google Pay).
router.post("/public/liqpay-checkout", async (req, res) => {
  const { tableId, tipPct } = req.body;
  if (!tableId) return res.status(400).json({ error: "tableId required" });

  try {
    // 1. Resolve table → org + group (minibar check)
    const { rows: tableRows } = await pool.query(
      `SELECT ft.id, ft.number, ft.location, ft.organization_id, o.name as org_name,
              tg.is_minibar
       FROM fb_tables ft
       JOIN organizations o ON o.id = ft.organization_id
       LEFT JOIN fb_table_groups tg ON tg.id = ft.group_id AND tg.is_active = true
       WHERE ft.id = $1 AND ft.is_active = true LIMIT 1`,
      [tableId],
    );
    if (!tableRows[0]) return res.status(404).json({ error: "Table not found" });
    const { organization_id: orgId, org_name, number: tableNumber, is_minibar } = tableRows[0];
    const isMinibar = is_minibar === true;

    // 2. Get current open order
    const { rows: orderRows } = await pool.query(
      `SELECT id, total_amount, tip_pct FROM fb_orders
       WHERE table_id=$1 AND status NOT IN ('billed','cancelled')
       ORDER BY opened_at DESC LIMIT 1`,
      [tableId],
    );
    if (!orderRows[0]) return res.status(404).json({ error: "No open order for this table" });
    const order = orderRows[0];

    const safeTipPct = Math.max(0, Math.min(50, parseFloat(tipPct) || parseFloat(order.tip_pct) || 0));
    const base = parseFloat(order.total_amount) || 0;
    const amount = parseFloat((base * (1 + safeTipPct / 100)).toFixed(2));
    if (amount <= 0) return res.status(400).json({ error: "Order total is zero" });

    // 3. Get LiqPay keys from org's default legal entity
    const { rows: leRows } = await pool.query(
      `SELECT liqpay_public_key, liqpay_private_key FROM legal_entities
       WHERE organization_id=$1 AND is_active=true AND liqpay_public_key IS NOT NULL
       ORDER BY is_default DESC NULLS LAST LIMIT 1`,
      [orgId],
    );

    const le = leRows[0];
    if (!le?.liqpay_public_key || !le?.liqpay_private_key) {
      return res.status(422).json({ error: "LiqPay not configured for this venue" });
    }

    const publicKey = le.liqpay_public_key;
    const privateKey = decrypt(le.liqpay_private_key) || le.liqpay_private_key;

    // 4. Generate checkout URL
    // Minibar + Kyiv time 22:00–08:00 → Ukrainian law forbids alcohol sale → use "hold" (pre-auth)
    const kyivHour = (new Date().getUTCHours() + 3) % 24;
    const alcoholRestricted = isMinibar && (kyivHour >= 22 || kyivHour < 8);
    const liqpayAction = alcoholRestricted ? "hold" : "pay";

    const orderId = `fb-${order.id}-${Date.now()}`;
    const { url } = generateLiqPayForm({
      action: liqpayAction,
      amount,
      currency: "UAH",
      description: `${org_name} · ${isMinibar ? "Міні-бар" : `Стіл №${tableNumber}`} · Замовлення #${order.id}`,
      orderId,
      publicKey,
      privateKey,
    });

    res.json({ url, amount, orderId, liqpayAction, alcoholRestricted });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /fb/public/call-waiter ─────────────────────────────────────────────
router.post("/public/call-waiter", async (req, res) => {
  const { tableId } = req.body;
  if (!tableId) return res.status(400).json({ error: "tableId required" });
  try {
    const { rows: tableRows } = await pool.query(
      `SELECT ft.id, ft.number, ft.location, ft.organization_id
       FROM fb_tables ft WHERE ft.id = $1 AND ft.is_active = true LIMIT 1`,
      [tableId],
    );
    if (!tableRows[0]) return res.status(404).json({ error: "Table not found" });
    const { organization_id, number: tableNumber, location: tableLocation } = tableRows[0];

    // Check rate limit: no duplicate waiter call within last 2 minutes
    const { rows: recent } = await pool.query(
      `SELECT id FROM fb_table_notifications
       WHERE organization_id=$1 AND table_id=$2 AND type='waiter_call' AND status='pending'
         AND created_at > NOW() - INTERVAL '2 minutes' LIMIT 1`,
      [organization_id, tableId],
    );
    if (recent[0]) return res.json({ ok: true, duplicate: true });

    await pool.query(
      `INSERT INTO fb_table_notifications (organization_id, table_id, table_number, table_location, type, status)
       VALUES ($1, $2, $3, $4, 'waiter_call', 'pending')`,
      [organization_id, tableId, tableNumber, tableLocation],
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POST /fb/public/request-payment ─────────────────────────────────────────
router.post("/public/request-payment", async (req, res) => {
  const { tableId, method } = req.body;
  if (!tableId || !method) return res.status(400).json({ error: "tableId and method required" });
  const allowedMethods = ["cash", "terminal"];
  if (!allowedMethods.includes(method)) return res.status(400).json({ error: "Invalid method" });
  try {
    const { rows: tableRows } = await pool.query(
      `SELECT ft.id, ft.number, ft.location, ft.organization_id
       FROM fb_tables ft WHERE ft.id = $1 AND ft.is_active = true LIMIT 1`,
      [tableId],
    );
    if (!tableRows[0]) return res.status(404).json({ error: "Table not found" });
    const { organization_id, number: tableNumber, location: tableLocation } = tableRows[0];

    // Get current open order total
    const { rows: orderRows } = await pool.query(
      `SELECT id, total_amount, tip_pct FROM fb_orders
       WHERE table_id=$1 AND status NOT IN ('billed','cancelled')
       ORDER BY opened_at DESC LIMIT 1`,
      [tableId],
    );
    const order = orderRows[0];

    await pool.query(
      `INSERT INTO fb_table_notifications (organization_id, table_id, table_number, table_location, type, payload, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [organization_id, tableId, tableNumber, tableLocation,
       `payment_${method}`,
       JSON.stringify({ method, orderId: order?.id, total: order?.total_amount, tipPct: order?.tip_pct })],
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /fb/public/table-order?tid= ─────────────────────────────────────────
router.get("/public/table-order", async (req, res) => {
  const { tid } = req.query;
  if (!tid) return res.status(400).json({ error: "tid required" });
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.total_amount, o.status, o.tip_pct
       FROM fb_orders o
       JOIN fb_tables ft ON ft.id = o.table_id
       WHERE ft.id = $1 AND o.status NOT IN ('billed','cancelled','closed')
       ORDER BY o.opened_at DESC LIMIT 1`,
      [tid],
    );
    if (!rows[0]) return res.json({ order: null });
    res.json({ order: rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /fb/public/pending-orders ───────────────────────────────────────────
router.get("/public/pending-orders", requireAuth, async (req: any, res) => {
  const orgId = req.user?.organizationId;
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.status, o.guest_name, o.guest_count, o.notes, o.total_amount, o.opened_at,
              o.tip_pct,
              ft.number as table_number, ft.location as table_location,
              COALESCE(json_agg(
                json_build_object(
                  'id', oi.id, 'name', oi.name, 'quantity', oi.quantity,
                  'price', oi.price, 'total_price', oi.total_price, 'notes', oi.notes
                ) ORDER BY oi.id
              ) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM fb_orders o
       LEFT JOIN fb_tables ft ON ft.id = o.table_id
       LEFT JOIN fb_order_items oi ON oi.order_id = o.id
       WHERE o.organization_id = $1 AND o.status = 'new_guest'
       GROUP BY o.id, ft.number, ft.location
       ORDER BY o.opened_at ASC`,
      [orgId],
    );
    res.json({ orders: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /fb/public/guest-orders/:id/accept ────────────────────────────────
// Cashier accepts → status 'open', creates print jobs for kitchen/bar printers
router.patch("/public/guest-orders/:id/accept", requireAuth, async (req: any, res) => {
  const orgId = req.user?.organizationId;
  const orderId = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE fb_orders SET status = 'open', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'new_guest'
       RETURNING *, (SELECT number FROM fb_tables WHERE id = fb_orders.table_id) AS table_number,
                   (SELECT location FROM fb_tables WHERE id = fb_orders.table_id) AS table_location`,
      [orderId, orgId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Order not found or already processed" });

    // Async — don't block the response on print job creation errors
    createPrintJobs(
      orgId, orderId,
      rows[0].table_number, rows[0].table_location,
      rows[0].guest_name,
    ).catch(err => console.error("[print-jobs] Failed to create print jobs:", err));

    res.json({ order: rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /fb/public/guest-orders/:id/reject ────────────────────────────────
router.patch("/public/guest-orders/:id/reject", requireAuth, async (req: any, res) => {
  const orgId = req.user?.organizationId;
  const orderId = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE fb_orders SET status = 'cancelled', closed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'new_guest'
       RETURNING table_id`,
      [orderId, orgId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Order not found or already processed" });
    if (rows[0].table_id) {
      await pool.query(
        `UPDATE fb_tables SET status = 'free', current_order_id = NULL WHERE id = $1`,
        [rows[0].table_id],
      );
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /fb/public/print-jobs ───────────────────────────────────────────────
// Returns queued print jobs. Used by local print bridge agent.
// Auth: Bearer token (same HMS token)
router.get("/public/print-jobs", requireAuth, async (req: any, res) => {
  const orgId = req.user?.organizationId;
  const { status = "queued" } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT pj.id, pj.order_id, pj.printer_id, pj.printer_type, pj.station,
              pj.status, pj.table_number, pj.table_location, pj.guest_name,
              pj.items_json, pj.created_at,
              fp.name AS printer_name, fp.ip_address, fp.port,
              fp.driver, fp.connection, fp.paper_width, fp.print_copies
       FROM fb_print_jobs pj
       LEFT JOIN fb_printers fp ON fp.id = pj.printer_id
       WHERE pj.organization_id = $1 AND pj.status = $2
       ORDER BY pj.created_at ASC`,
      [orgId, status],
    );
    res.json({ printJobs: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /fb/public/print-jobs/:id/done ────────────────────────────────────
// Local print bridge marks a job as printed or failed.
router.patch("/public/print-jobs/:id/done", requireAuth, async (req: any, res) => {
  const orgId = req.user?.organizationId;
  const jobId = parseInt(req.params.id);
  const { error: errMsg } = req.body;
  const status = errMsg ? "failed" : "done";
  try {
    const { rows } = await pool.query(
      `UPDATE fb_print_jobs SET status = $1, error_msg = $2, printed_at = NOW()
       WHERE id = $3 AND organization_id = $4 RETURNING id, status`,
      [status, errMsg || null, jobId, orgId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Job not found" });
    res.json({ job: rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /fb/public/print-jobs/by-order/:orderId ─────────────────────────────
// HMS cashier polls this to show print status badges per order.
router.get("/public/print-jobs/by-order/:orderId", requireAuth, async (req: any, res) => {
  const orgId = req.user?.organizationId;
  const orderId = parseInt(req.params.orderId);
  try {
    const { rows } = await pool.query(
      `SELECT id, printer_type, station, status, error_msg, created_at, printed_at,
              (SELECT name FROM fb_printers WHERE id = pj.printer_id) AS printer_name
       FROM fb_print_jobs pj
       WHERE organization_id = $1 AND order_id = $2
       ORDER BY printer_type ASC`,
      [orgId, orderId],
    );
    res.json({ printJobs: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /fb/public/ai-chat ──────────────────────────────────────────────────
// AI waiter endpoint — uses OPENAI_API_KEY to chat about the menu
router.post("/public/ai-chat", async (req, res) => {
  const { tid, messages } = req.body;
  if (!tid || !Array.isArray(messages)) return res.status(400).json({ error: "tid and messages required" });

  try {
    const { rows: tableRows } = await pool.query(
      `SELECT ft.organization_id, ft.number, ft.location, o.name as org_name
       FROM fb_tables ft JOIN organizations o ON o.id = ft.organization_id
       WHERE ft.id = $1 AND ft.is_active = true LIMIT 1`,
      [tid],
    );
    if (!tableRows[0]) return res.status(404).json({ error: "Table not found" });
    const { organization_id: orgId, number: tableNumber, location: tableLocation, org_name } = tableRows[0];

    // Build menu context
    const { rows: items } = await pool.query(
      `SELECT fi.name, fi.description, fi.price, fi.allergens, fi.is_vegetarian, fi.is_popular,
              fi.cook_minutes, fi.station, fc.name AS category_name
       FROM fb_items fi
       LEFT JOIN fb_categories fc ON fc.id = fi.category_id
       WHERE fi.organization_id = $1 AND fi.is_available = true AND (fi.is_stop_list IS NULL OR fi.is_stop_list = false)
       ORDER BY fc.sort_order NULLS LAST, fi.sort_order NULLS LAST, fi.name`,
      [orgId],
    );

    const menuText = items.map((i: any) => {
      let line = `• ${i.name} — ${parseFloat(i.price).toFixed(0)} ₴`;
      if (i.category_name) line += ` [${i.category_name}]`;
      if (i.description) line += `\n  ${i.description}`;
      if (i.is_vegetarian) line += " 🌿";
      if (i.is_popular) line += " ⭐";
      if (i.cook_minutes) line += ` (~${i.cook_minutes} хв)`;
      if (Array.isArray(i.allergens) && i.allergens.length) line += `\n  Алергени: ${i.allergens.join(", ")}`;
      return line;
    }).join("\n");

    const systemPrompt = `Ти — AI-офіціант ресторану "${org_name}". Стіл: ${tableNumber}${tableLocation ? ` · ${tableLocation}` : ""}.

Твоя роль:
- Допомагати гостям обрати страви та напої
- Розповідати про склад, алергени, час приготування
- Рекомендувати поєднання (вино до м'яса, десерт до кави тощо)
- Ненав'язливо нагадувати про хліб до перших страв і про десерти наприкінці
- Відповідати виключно про позиції з меню нижче
- Говорити тільки українською мовою
- Бути привітним, коротким і корисним

МЕНЮ ЗАКЛАДУ:
${menuText}

Якщо гість питає про щось поза меню — чемно поясни, що цього немає в меню.`;

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(503).json({ error: "AI waiter not configured" });

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...messages.slice(-10)],
        max_tokens: 400,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const openaiData: any = await openaiRes.json();
    if (!openaiRes.ok) return res.status(502).json({ error: openaiData.error?.message || "OpenAI error" });

    res.json({ reply: openaiData.choices[0]?.message?.content || "Вибачте, не зрозумів. Спробуйте ще раз." });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
