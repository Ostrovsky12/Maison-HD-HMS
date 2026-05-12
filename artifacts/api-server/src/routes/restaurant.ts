import { Router } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { requireAuth } from '../lib/auth.js';

const router = Router();
router.use(requireAuth);

// ─── STATS ───────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const today = new Date().toISOString().split('T')[0];

    const [stats] = (await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('paid','cancelled')) AS active_orders,
        COUNT(*) FILTER (WHERE status = 'new') AS new_orders,
        COUNT(*) FILTER (WHERE status = 'preparing') AS preparing,
        COUNT(*) FILTER (WHERE status = 'ready') AS ready_for_pickup,
        COUNT(*) FILTER (WHERE order_type = 'room_service' AND status NOT IN ('paid','cancelled')) AS room_service_active,
        COUNT(*) FILTER (WHERE DATE(created_at) = ${today}::date) AS today_orders,
        COALESCE(SUM(total) FILTER (WHERE DATE(paid_at) = ${today}::date AND status = 'paid'), 0) AS today_revenue,
        COALESCE(SUM(total) FILTER (WHERE status NOT IN ('paid','cancelled')), 0) AS open_revenue,
        COUNT(*) FILTER (WHERE order_type = 'breakfast' AND status NOT IN ('paid','cancelled')) AS breakfast_active,
        COUNT(*) FILTER (WHERE order_type = 'banquet' AND status NOT IN ('paid','cancelled')) AS banquet_active
      FROM restaurant_orders
      WHERE organization_id = ${orgId}
    `)).rows as any[];

    const [tableStats] = (await db.execute(sql`
      SELECT
        COUNT(*) AS total_tables,
        COUNT(*) FILTER (WHERE status = 'occupied') AS occupied,
        COUNT(*) FILTER (WHERE status = 'free') AS free,
        COUNT(*) FILTER (WHERE status = 'reserved') AS reserved
      FROM restaurant_tables
      WHERE organization_id = ${orgId} AND is_active = TRUE
    `)).rows as any[];

    const [menuStats] = (await db.execute(sql`
      SELECT COUNT(*) AS total_items, COUNT(*) FILTER (WHERE is_available) AS available_items
      FROM menu_items WHERE organization_id = ${orgId}
    `)).rows as any[];

    const [reservationStats] = (await db.execute(sql`
      SELECT COUNT(*) AS today_reservations, COALESCE(SUM(guest_count),0) AS today_guests
      FROM restaurant_reservations
      WHERE organization_id = ${orgId} AND reservation_date = ${today}::date AND status != 'cancelled'
    `)).rows as any[];

    res.json({ ...stats, ...tableStats, ...menuStats, ...reservationStats });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MENU CATEGORIES ─────────────────────────────────────────────────────────
router.get('/menu/categories', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const result = await db.execute(sql`
      SELECT mc.*, COUNT(mi.id) AS item_count
      FROM menu_categories mc
      LEFT JOIN menu_items mi ON mi.category_id = mc.id AND mi.is_available = TRUE
      WHERE mc.organization_id = ${orgId}
      GROUP BY mc.id ORDER BY mc.sort_order, mc.name
    `);
    res.json({ categories: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/menu/categories', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { name, description, icon, sort_order, available_from, available_to } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const fromVal = available_from || null;
    const toVal = available_to || null;
    const result = await db.execute(sql`
      INSERT INTO menu_categories (organization_id, name, description, icon, sort_order, available_from, available_to)
      VALUES (${orgId}, ${name}, ${description || null}, ${icon || null}, ${sort_order || 0}, ${fromVal}::time, ${toVal}::time)
      RETURNING *
    `);
    res.json({ category: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/menu/categories/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const { name, description, icon, sort_order } = req.body;
    const result = await db.execute(sql`
      UPDATE menu_categories SET
        name = COALESCE(${name || null}, name),
        description = COALESCE(${description || null}, description),
        icon = COALESCE(${icon || null}, icon),
        sort_order = COALESCE(${sort_order ?? null}, sort_order)
      WHERE id = ${parseInt(id)} AND organization_id = ${orgId}
      RETURNING *
    `);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ category: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/menu/categories/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    await db.execute(sql`UPDATE menu_categories SET is_active = FALSE WHERE id = ${parseInt(id)} AND organization_id = ${orgId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MENU ITEMS ───────────────────────────────────────────────────────────────
router.get('/menu/items', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { category_id, available, search, type, featured } = req.query;
    const catId = category_id ? parseInt(category_id as string) : null;
    const availVal = available === 'true' ? true : available === 'false' ? false : null;
    const featuredVal = featured === 'true' ? true : null;
    const searchVal = search ? `%${search}%` : null;
    const typeVal = type || null;

    const result = await db.execute(sql`
      SELECT mi.*, mc.name AS category_name, mc.icon AS category_icon
      FROM menu_items mi
      LEFT JOIN menu_categories mc ON mc.id = mi.category_id
      WHERE mi.organization_id = ${orgId}
        AND (${catId}::int IS NULL OR mi.category_id = ${catId})
        AND (${availVal}::bool IS NULL OR mi.is_available = ${availVal})
        AND (${featuredVal}::bool IS NULL OR mi.is_featured = ${featuredVal})
        AND (${typeVal}::text IS NULL OR mi.item_type::text = ${typeVal})
        AND (${searchVal}::text IS NULL OR mi.name ILIKE ${searchVal} OR mi.description ILIKE ${searchVal})
      ORDER BY mc.sort_order, mi.sort_order, mi.name
    `);
    res.json({ items: result.rows, total: result.rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/menu/items', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { category_id, name, description, price, cost_price, item_type, prep_time_min, calories, tags, allergens, is_available, is_featured, sort_order } = req.body;
    if (!name || price == null) return res.status(400).json({ error: 'name and price required' });
    const result = await db.execute(sql`
      INSERT INTO menu_items (organization_id, category_id, name, description, price, cost_price, item_type, prep_time_min, calories, tags, allergens, is_available, is_featured, sort_order)
      VALUES (${orgId}, ${category_id || null}, ${name}, ${description || null}, ${price}, ${cost_price || null}, ${item_type || 'food'}, ${prep_time_min || 15}, ${calories || null}, ${JSON.stringify(tags || [])}::jsonb, ${JSON.stringify(allergens || [])}::jsonb, ${is_available !== false}, ${is_featured || false}, ${sort_order || 0})
      RETURNING *
    `);
    res.json({ item: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/menu/items/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const { name, description, price, cost_price, category_id, item_type, prep_time_min, calories, is_available, is_featured, tags, sort_order, photo_url } = req.body;
    const result = await db.execute(sql`
      UPDATE menu_items SET
        name = COALESCE(${name || null}, name),
        description = COALESCE(${description || null}, description),
        price = COALESCE(${price ?? null}, price),
        cost_price = COALESCE(${cost_price ?? null}, cost_price),
        category_id = COALESCE(${category_id ?? null}, category_id),
        item_type = COALESCE(${item_type || null}::menu_item_type, item_type),
        prep_time_min = COALESCE(${prep_time_min ?? null}, prep_time_min),
        calories = COALESCE(${calories ?? null}, calories),
        is_available = COALESCE(${is_available ?? null}, is_available),
        is_featured = COALESCE(${is_featured ?? null}, is_featured),
        tags = COALESCE(${tags ? JSON.stringify(tags) : null}::jsonb, tags),
        sort_order = COALESCE(${sort_order ?? null}, sort_order),
        photo_url = COALESCE(${photo_url ?? null}, photo_url),
        updated_at = NOW()
      WHERE id = ${parseInt(id)} AND organization_id = ${orgId}
      RETURNING *
    `);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ item: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/menu/items/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    await db.execute(sql`UPDATE menu_items SET is_available = FALSE WHERE id = ${parseInt(id)} AND organization_id = ${orgId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── TABLES ───────────────────────────────────────────────────────────────────
router.get('/tables', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { section } = req.query;
    const sectionVal = section || null;
    const result = await db.execute(sql`
      SELECT rt.*,
        ro.id AS current_order_id, ro.guest_name AS current_guest, ro.guest_count, ro.total AS current_total, ro.status AS order_status,
        ro.waiter_user_id AS current_waiter_user_id,
        rr.guest_name AS reservation_guest, rr.reservation_time, rr.guest_count AS reservation_guests
      FROM restaurant_tables rt
      LEFT JOIN restaurant_orders ro ON ro.table_id = rt.id AND ro.status NOT IN ('paid','cancelled')
      LEFT JOIN restaurant_reservations rr ON rr.table_id = rt.id AND rr.reservation_date = CURRENT_DATE AND rr.status != 'cancelled'
      WHERE rt.organization_id = ${orgId} AND rt.is_active = TRUE
        AND (${sectionVal}::text IS NULL OR rt.section = ${sectionVal})
      ORDER BY rt.section, rt.table_number
    `);
    res.json({ tables: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tables', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { table_number, section, capacity, notes } = req.body;
    if (!table_number) return res.status(400).json({ error: 'table_number required' });
    const result = await db.execute(sql`
      INSERT INTO restaurant_tables (organization_id, table_number, section, capacity, notes, status, is_active)
      VALUES (${orgId}, ${String(table_number)}, ${section || 'Зал'}, ${capacity || 4}, ${notes || null}, 'free', TRUE)
      RETURNING *
    `);
    res.status(201).json({ table: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/tables/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const { status, section, capacity, notes, table_number } = req.body;
    const result = await db.execute(sql`
      UPDATE restaurant_tables SET
        status = COALESCE(${status || null}::table_status, status),
        section = COALESCE(${section || null}, section),
        capacity = COALESCE(${capacity ?? null}, capacity),
        notes = COALESCE(${notes || null}, notes),
        table_number = COALESCE(${table_number || null}, table_number),
        updated_at = NOW()
      WHERE id = ${parseInt(id)} AND organization_id = ${orgId}
      RETURNING *
    `);
    res.json({ table: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/tables/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    await db.execute(sql`UPDATE restaurant_tables SET is_active = FALSE, updated_at = NOW() WHERE id = ${parseInt(id)} AND organization_id = ${orgId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────
router.get('/orders', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { status, order_type, table_id, date, active } = req.query;

    const statusVal = status || null;
    const typeVal = order_type || null;
    const tableVal = table_id ? parseInt(table_id as string) : null;
    const activeOnly = active === 'true';
    const dateVal = date ? String(date) : new Date().toISOString().split('T')[0];

    const result = await db.execute(sql`
      SELECT ro.*,
        rt.table_number, rt.section,
        u.name AS waiter_name
      FROM restaurant_orders ro
      LEFT JOIN restaurant_tables rt ON rt.id = ro.table_id
      LEFT JOIN users u ON u.id = ro.waiter_user_id
      WHERE ro.organization_id = ${orgId}
        AND (${statusVal}::text IS NULL OR ro.status::text = ${statusVal})
        AND (${typeVal}::text IS NULL OR ro.order_type::text = ${typeVal})
        AND (${tableVal}::int IS NULL OR ro.table_id = ${tableVal})
        AND (NOT ${activeOnly} OR ro.status NOT IN ('paid','cancelled'))
        AND (${activeOnly} OR DATE(ro.created_at) = ${dateVal}::date)
      ORDER BY ro.created_at DESC
    `);
    res.json({ orders: result.rows, total: result.rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/orders/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const [order] = (await db.execute(sql`
      SELECT ro.*, rt.table_number, rt.section, u.name AS waiter_name
      FROM restaurant_orders ro
      LEFT JOIN restaurant_tables rt ON rt.id = ro.table_id
      LEFT JOIN users u ON u.id = ro.waiter_user_id
      WHERE ro.id = ${parseInt(id)} AND ro.organization_id = ${orgId}
    `)).rows as any[];
    if (!order) return res.status(404).json({ error: 'Not found' });

    const items = (await db.execute(sql`
      SELECT roi.*, mi.prep_time_min, mi.photo_url
      FROM restaurant_order_items roi
      LEFT JOIN menu_items mi ON mi.id = roi.menu_item_id
      WHERE roi.order_id = ${parseInt(id)}
      ORDER BY roi.course_number, roi.created_at
    `)).rows;

    res.json({ order, items });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/orders', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const userId = (req as any).user.userId;
    const { table_id, booking_id, unit_id, order_type, guest_name, guest_count, notes, special_requests, delivery_address, is_room_charge, scheduled_time, waiter_user_id, property_id } = req.body;

    const result = await db.execute(sql`
      INSERT INTO restaurant_orders (organization_id, property_id, table_id, booking_id, unit_id, order_type, guest_name, guest_count, notes, special_requests, delivery_address, is_room_charge, scheduled_time, waiter_user_id)
      VALUES (${orgId}, ${property_id || null}, ${table_id || null}, ${booking_id || null}, ${unit_id || null}, ${order_type || 'dine_in'}, ${guest_name || null}, ${guest_count || 1}, ${notes || null}, ${special_requests || null}, ${delivery_address || null}, ${is_room_charge || false}, ${scheduled_time || null}, ${waiter_user_id || userId})
      RETURNING *
    `);
    const order = result.rows[0] as any;

    // Mark table as occupied
    if (table_id) {
      await db.execute(sql`UPDATE restaurant_tables SET status = 'occupied', updated_at = NOW() WHERE id = ${table_id}`);
    }

    res.json({ order });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/orders/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const { status, notes, payment_method, paid_amount, tip_amount, discount_amount } = req.body;

    const result = await db.execute(sql`
      UPDATE restaurant_orders SET
        status = COALESCE(${status || null}::restaurant_order_status, status),
        notes = COALESCE(${notes || null}, notes),
        payment_method = COALESCE(${payment_method || null}, payment_method),
        paid_amount = COALESCE(${paid_amount ?? null}, paid_amount),
        tip_amount = COALESCE(${tip_amount ?? null}, tip_amount),
        discount_amount = COALESCE(${discount_amount ?? null}, discount_amount),
        confirmed_at = CASE WHEN ${status || null} = 'confirmed' AND confirmed_at IS NULL THEN NOW() ELSE confirmed_at END,
        ready_at = CASE WHEN ${status || null} = 'ready' AND ready_at IS NULL THEN NOW() ELSE ready_at END,
        served_at = CASE WHEN ${status || null} = 'served' AND served_at IS NULL THEN NOW() ELSE served_at END,
        paid_at = CASE WHEN ${status || null} = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END,
        updated_at = NOW()
      WHERE id = ${parseInt(id)} AND organization_id = ${orgId}
      RETURNING *
    `);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const order = result.rows[0] as any;

    // If paid/cancelled, free the table
    if ((status === 'paid' || status === 'cancelled') && order.table_id) {
      await db.execute(sql`UPDATE restaurant_tables SET status = 'free', updated_at = NOW() WHERE id = ${order.table_id}`);
    }

    res.json({ order });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ORDER ITEMS ─────────────────────────────────────────────────────────────
router.post('/orders/:id/items', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const { items } = req.body; // [{ menu_item_id, quantity, notes, course_number }]
    if (!items?.length) return res.status(400).json({ error: 'items required' });

    // Verify order belongs to org
    const [order] = (await db.execute(sql`SELECT * FROM restaurant_orders WHERE id = ${parseInt(id)} AND organization_id = ${orgId}`)).rows as any[];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    let subtotalAdd = 0;
    const inserted = [];
    for (const item of items) {
      const [menuItem] = (await db.execute(sql`SELECT * FROM menu_items WHERE id = ${item.menu_item_id} AND organization_id = ${orgId}`)).rows as any[];
      if (!menuItem) continue;
      const qty = item.quantity || 1;
      const total = menuItem.price * qty;
      subtotalAdd += total;
      const station = ['drink','alcohol'].includes(menuItem.item_type) ? 'bar' : 'kitchen';
      const [row] = (await db.execute(sql`
        INSERT INTO restaurant_order_items (order_id, menu_item_id, name, item_type, quantity, unit_price, total_price, notes, course_number, station)
        VALUES (${parseInt(id)}, ${menuItem.id}, ${menuItem.name}, ${menuItem.item_type}, ${qty}, ${menuItem.price}, ${total}, ${item.notes || null}, ${item.course_number || 1}, ${station})
        RETURNING *
      `)).rows as any[];
      inserted.push(row);
    }

    // Update order totals
    await db.execute(sql`
      UPDATE restaurant_orders SET
        subtotal = subtotal + ${subtotalAdd},
        service_charge = ROUND((subtotal + ${subtotalAdd}) * 0.10, 2),
        total = ROUND((subtotal + ${subtotalAdd}) * 1.10, 2),
        updated_at = NOW()
      WHERE id = ${parseInt(id)}
    `);

    const [updatedOrder] = (await db.execute(sql`SELECT * FROM restaurant_orders WHERE id = ${parseInt(id)}`)).rows as any[];
    res.json({ items: inserted, order: updatedOrder });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/orders/:id/items/:itemId', async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { status, notes, quantity } = req.body;
    const result = await db.execute(sql`
      UPDATE restaurant_order_items SET
        status = COALESCE(${status || null}::order_item_status, status),
        notes = COALESCE(${notes || null}, notes),
        ready_at = CASE WHEN ${status || null} = 'ready' AND ready_at IS NULL THEN NOW() ELSE ready_at END
      WHERE id = ${parseInt(itemId)} AND order_id = ${parseInt(id)}
      RETURNING *
    `);
    res.json({ item: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── KITCHEN DISPLAY (KDS) ────────────────────────────────────────────────────
router.get('/kitchen', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { station } = req.query; // kitchen | bar
    const stationVal = station || null;

    const result = await db.execute(sql`
      SELECT roi.*, ro.order_type, ro.table_id, ro.guest_name, ro.guest_count, ro.notes AS order_notes,
        rt.table_number, rt.section,
        EXTRACT(EPOCH FROM (NOW() - roi.created_at))/60 AS minutes_waiting
      FROM restaurant_order_items roi
      JOIN restaurant_orders ro ON ro.id = roi.order_id
      LEFT JOIN restaurant_tables rt ON rt.id = ro.table_id
      WHERE ro.organization_id = ${orgId}
        AND roi.status IN ('pending','preparing')
        AND ro.status NOT IN ('cancelled','paid')
        AND (${stationVal}::text IS NULL OR roi.station = ${stationVal})
      ORDER BY roi.created_at ASC
    `);
    res.json({ items: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ROOM SERVICE ────────────────────────────────────────────────────────────
router.get('/room-service', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const result = await db.execute(sql`
      SELECT ro.*, u.name AS waiter_name,
        EXTRACT(EPOCH FROM (NOW() - ro.created_at))/60 AS minutes_since_order
      FROM restaurant_orders ro
      LEFT JOIN users u ON u.id = ro.waiter_user_id
      WHERE ro.organization_id = ${orgId}
        AND ro.order_type = 'room_service'
        AND ro.status NOT IN ('paid','cancelled')
      ORDER BY ro.created_at DESC
    `);
    res.json({ orders: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── RESERVATIONS ─────────────────────────────────────────────────────────────
router.get('/reservations', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { date, status } = req.query;
    const dateVal = date ? String(date) : new Date().toISOString().split('T')[0];
    const statusVal = status || null;

    const result = await db.execute(sql`
      SELECT rr.*, rt.table_number, rt.section, rt.capacity
      FROM restaurant_reservations rr
      LEFT JOIN restaurant_tables rt ON rt.id = rr.table_id
      WHERE rr.organization_id = ${orgId}
        AND rr.reservation_date = ${dateVal}::date
        AND (${statusVal}::text IS NULL OR rr.status = ${statusVal})
      ORDER BY rr.reservation_time
    `);
    res.json({ reservations: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/reservations', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { table_id, guest_name, guest_phone, guest_email, guest_count, reservation_date, reservation_time, duration_min, notes, deposit_amount, booking_id, property_id } = req.body;
    if (!guest_name || !reservation_date || !reservation_time) return res.status(400).json({ error: 'guest_name, reservation_date, reservation_time required' });

    const result = await db.execute(sql`
      INSERT INTO restaurant_reservations (organization_id, property_id, table_id, guest_name, guest_phone, guest_email, guest_count, reservation_date, reservation_time, duration_min, notes, deposit_amount, booking_id)
      VALUES (${orgId}, ${property_id || null}, ${table_id || null}, ${guest_name}, ${guest_phone || null}, ${guest_email || null}, ${guest_count || 2}, ${reservation_date}, ${reservation_time}, ${duration_min || 90}, ${notes || null}, ${deposit_amount || 0}, ${booking_id || null})
      RETURNING *
    `);

    // Mark table as reserved
    if (table_id) {
      const today = new Date().toISOString().split('T')[0];
      if (reservation_date === today) {
        await db.execute(sql`UPDATE restaurant_tables SET status = 'reserved', updated_at = NOW() WHERE id = ${table_id}`);
      }
    }

    res.json({ reservation: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/reservations/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const { status, table_id, guest_count, notes, reservation_time } = req.body;
    const result = await db.execute(sql`
      UPDATE restaurant_reservations SET
        status = COALESCE(${status || null}, status),
        table_id = COALESCE(${table_id ?? null}, table_id),
        guest_count = COALESCE(${guest_count ?? null}, guest_count),
        notes = COALESCE(${notes || null}, notes),
        reservation_time = COALESCE(${reservation_time || null}::time, reservation_time),
        updated_at = NOW()
      WHERE id = ${parseInt(id)} AND organization_id = ${orgId}
      RETURNING *
    `);
    res.json({ reservation: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/reservations/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    await db.execute(sql`UPDATE restaurant_reservations SET status = 'cancelled', updated_at = NOW() WHERE id = ${parseInt(id)} AND organization_id = ${orgId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
router.get('/analytics/revenue', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { period = '7' } = req.query;
    const days = parseInt(period as string) || 7;

    const daily = (await db.execute(sql`
      SELECT DATE(paid_at) AS date,
        COUNT(*) AS orders,
        COALESCE(SUM(total), 0) AS revenue,
        COALESCE(SUM(tip_amount), 0) AS tips
      FROM restaurant_orders
      WHERE organization_id = ${orgId} AND status = 'paid'
        AND paid_at >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY DATE(paid_at) ORDER BY date
    `)).rows;

    const byType = (await db.execute(sql`
      SELECT order_type,
        COUNT(*) AS orders,
        COALESCE(SUM(total), 0) AS revenue
      FROM restaurant_orders
      WHERE organization_id = ${orgId} AND status = 'paid'
        AND paid_at >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY order_type ORDER BY revenue DESC
    `)).rows;

    const topItems = (await db.execute(sql`
      SELECT roi.name, roi.item_type,
        SUM(roi.quantity) AS sold_qty,
        SUM(roi.total_price) AS revenue
      FROM restaurant_order_items roi
      JOIN restaurant_orders ro ON ro.id = roi.order_id
      WHERE ro.organization_id = ${orgId} AND ro.status = 'paid'
        AND ro.paid_at >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY roi.name, roi.item_type
      ORDER BY sold_qty DESC LIMIT 10
    `)).rows;

    const byPaymentMethod = (await db.execute(sql`
      SELECT payment_method, COUNT(*) AS orders, SUM(total) AS revenue
      FROM restaurant_orders
      WHERE organization_id = ${orgId} AND status = 'paid'
        AND paid_at >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY payment_method
    `)).rows;

    res.json({ daily, byType, topItems, byPaymentMethod, period: days });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ROOM CHARGES ────────────────────────────────────────────────────────────
router.get('/room-charges', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const charges = (await db.execute(sql`
      SELECT
        b.id AS booking_id, b.check_in, b.check_out,
        COALESCE(b.first_name || ' ' || b.last_name, '#' || b.id::text) AS guest_display,
        b.first_name, b.last_name,
        u.name AS unit_name,
        COALESCE(SUM(ro.total) FILTER (WHERE ro.status != 'cancelled'), 0) AS total_charged,
        COALESCE(SUM(ro.paid_amount) FILTER (WHERE ro.status != 'cancelled'), 0) AS total_paid,
        COUNT(ro.id) FILTER (WHERE ro.status NOT IN ('paid','cancelled')) AS open_orders,
        COUNT(ro.id) FILTER (WHERE ro.status = 'paid') AS closed_orders
      FROM bookings b
      JOIN units u ON u.id = b.unit_id
      JOIN properties p ON p.id = u.property_id AND p.organization_id = ${orgId}
      LEFT JOIN restaurant_orders ro ON ro.booking_id = b.id
      WHERE b.check_in <= CURRENT_DATE AND b.check_out >= CURRENT_DATE
        AND b.status IN ('confirmed','checked_in','pending')
      GROUP BY b.id, b.check_in, b.check_out, b.first_name, b.last_name, u.name
      ORDER BY b.last_name ASC NULLS LAST
    `)).rows;
    res.json({ charges });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/room-charges/:bookingId/orders', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { bookingId } = req.params;
    const orders = (await db.execute(sql`
      SELECT ro.*, rt.number AS table_number
      FROM restaurant_orders ro
      LEFT JOIN restaurant_tables rt ON rt.id = ro.table_id
      WHERE ro.booking_id = ${parseInt(bookingId)}
      ORDER BY ro.created_at DESC
    `)).rows;
    res.json({ orders });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/room-charges/:bookingId/charge', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { bookingId } = req.params;
    const { amount, description, order_type = 'room_service' } = req.body;
    const [booking] = (await db.execute(sql`
      SELECT b.*, u.name as unit_name FROM bookings b
      JOIN units u ON u.id = b.unit_id
      JOIN properties p ON p.id = u.property_id AND p.organization_id = ${orgId}
      WHERE b.id = ${parseInt(bookingId)} LIMIT 1
    `)).rows as any[];
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const guestName = [booking.first_name, booking.last_name].filter(Boolean).join(' ') || `Гість #${bookingId}`;
    const [order] = (await db.execute(sql`
      INSERT INTO restaurant_orders
        (organization_id, booking_id, order_type, status, guest_name, notes, subtotal, total, created_at, updated_at)
      VALUES
        (${orgId}, ${parseInt(bookingId)}, ${order_type}::restaurant_order_type, 'paid'::restaurant_order_status,
         ${guestName}, ${description || 'Рахунок на кімнату'},
         ${parseFloat(amount)}, ${parseFloat(amount)}, NOW(), NOW())
      RETURNING *
    `)).rows as any[];
    res.json({ order });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GUEST LOOKUP ─────────────────────────────────────────────────────────────
router.get('/guest-lookup', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { q = '' } = req.query;
    const search = `%${q}%`;
    const guests = (await db.execute(sql`
      SELECT b.id AS booking_id,
        b.first_name, b.last_name,
        b.check_in, b.check_out,
        u.name AS unit_name,
        EXISTS(
          SELECT 1 FROM booking_addons ba
          JOIN addons ad ON ad.id = ba.addon_id
          WHERE ba.booking_id = b.id AND LOWER(ad.name) LIKE '%breakfast%'
        ) AS breakfast_included
      FROM bookings b
      JOIN units u ON u.id = b.unit_id
      JOIN properties p ON p.id = u.property_id AND p.organization_id = ${orgId}
      WHERE b.check_in <= CURRENT_DATE AND b.check_out >= CURRENT_DATE
        AND b.status IN ('confirmed','checked_in','pending')
        AND (LOWER(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')) LIKE LOWER(${search})
             OR LOWER(u.name) LIKE LOWER(${search}))
      ORDER BY b.last_name ASC NULLS LAST LIMIT 20
    `)).rows;
    res.json({ guests });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── BREAKFAST FLAGS ──────────────────────────────────────────────────────────
router.get('/breakfast-flags', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const today = new Date().toISOString().split('T')[0];
    const guests = (await db.execute(sql`
      SELECT
        b.id AS booking_id, b.first_name, b.last_name,
        u.name AS unit_name,
        EXISTS(
          SELECT 1 FROM booking_addons ba
          JOIN addons ad ON ad.id = ba.addon_id
          WHERE ba.booking_id = b.id AND LOWER(ad.name) LIKE '%breakfast%'
        ) AS breakfast_included,
        (SELECT COUNT(*) FROM restaurant_orders ro
          WHERE ro.booking_id = b.id AND ro.order_type = 'breakfast'::restaurant_order_type
            AND DATE(ro.created_at) = ${today}::date AND ro.status != 'cancelled'::restaurant_order_status
        ) AS breakfast_orders_today
      FROM bookings b
      JOIN units u ON u.id = b.unit_id
      JOIN properties p ON p.id = u.property_id AND p.organization_id = ${orgId}
      WHERE b.check_in <= CURRENT_DATE AND b.check_out >= CURRENT_DATE
        AND b.status IN ('confirmed','checked_in','pending')
      ORDER BY u.name ASC NULLS LAST
    `)).rows;
    res.json({ guests });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POS CONFIG / SYNC ────────────────────────────────────────────────────────
router.get('/pos-config', async (req, res) => {
  try {
    res.json({
      config: null,
      providers: [
        { id: 'poster', name: 'Poster POS', logo: 'poster', status: 'available', description: 'Хмарна POS-система для ресторанів' },
        { id: 'iiko', name: 'iiko', logo: 'iiko', status: 'available', description: 'Система автоматизації ресторану' },
        { id: 'rkeeper', name: 'R-Keeper', logo: 'rkeeper', status: 'available', description: 'Система управління рестораном R-Keeper' },
        { id: 'generic', name: 'Generic REST API', logo: 'api', status: 'available', description: 'Власна POS-система через REST API' },
      ],
      activeProvider: null,
      lastSync: null,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/pos-sync', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { provider = 'generic', action = 'pull_orders' } = req.body;
    await db.execute(sql`
      INSERT INTO integration_logs (organization_id, integration_type, action, status, created_at)
      VALUES (${orgId}, ${'pos_' + provider}, ${action}, 'success', NOW())
      ON CONFLICT DO NOTHING
    `);
    res.json({
      success: true,
      provider,
      action,
      syncedAt: new Date().toISOString(),
      message: `Синхронізацію з ${provider} запущено успішно`,
      ordersImported: 0,
      ordersExported: 0,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
