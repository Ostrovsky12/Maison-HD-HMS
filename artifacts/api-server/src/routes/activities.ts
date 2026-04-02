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

    const [eqStats] = (await db.execute(sql`
      SELECT
        COUNT(*) AS total_items,
        COUNT(*) FILTER (WHERE is_available = TRUE) AS available_items,
        COUNT(*) FILTER (WHERE condition IN ('poor','under_repair')) AS needs_attention,
        COUNT(DISTINCT category_id) AS active_categories
      FROM equipment_items WHERE organization_id = ${orgId}
    `)).rows as any[];

    const [rentalStats] = (await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active_rentals,
        COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_rentals,
        COUNT(*) FILTER (WHERE DATE(created_at) = ${today}::date) AS today_rentals,
        COALESCE(SUM(price_charged) FILTER (WHERE DATE(created_at) = ${today}::date AND status IN ('returned','active')), 0) AS today_rental_revenue
      FROM equipment_rentals WHERE organization_id = ${orgId}
    `)).rows as any[];

    const [activityStats] = (await db.execute(sql`
      SELECT
        COUNT(*) AS total_session_types,
        COUNT(*) FILTER (WHERE is_active) AS active_types
      FROM activity_types WHERE organization_id = ${orgId}
    `)).rows as any[];

    const [sessionStats] = (await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE session_date = ${today}::date AND status NOT IN ('cancelled','completed')) AS today_sessions,
        COALESCE(SUM(current_participants) FILTER (WHERE session_date = ${today}::date), 0) AS today_participants,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS sessions_in_progress
      FROM activity_sessions WHERE organization_id = ${orgId}
    `)).rows as any[];

    const [bookingStats] = (await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE DATE(ab.created_at) = ${today}::date) AS today_bookings,
        COALESCE(SUM(ab.price_charged) FILTER (WHERE DATE(ab.created_at) = ${today}::date), 0) AS today_activity_revenue
      FROM activity_bookings ab
      JOIN activity_sessions s ON s.id = ab.session_id
      WHERE s.organization_id = ${orgId}
    `)).rows as any[];

    res.json({
      ...eqStats,
      ...rentalStats,
      ...activityStats,
      ...sessionStats,
      ...bookingStats,
      today_total_revenue: Number(rentalStats.today_rental_revenue || 0) + Number(bookingStats.today_activity_revenue || 0)
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── EQUIPMENT CATEGORIES ────────────────────────────────────────────────────
router.get('/equipment/categories', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const result = await db.execute(sql`
      SELECT ec.*,
        COUNT(ei.id) AS total_items,
        COUNT(ei.id) FILTER (WHERE ei.is_available = TRUE) AS available_items
      FROM equipment_categories ec
      LEFT JOIN equipment_items ei ON ei.category_id = ec.id
      WHERE ec.organization_id = ${orgId} AND ec.is_active = TRUE
      GROUP BY ec.id ORDER BY ec.sort_order, ec.name
    `);
    res.json({ categories: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/equipment/categories', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { name, description, icon, color, rental_unit, deposit_required, deposit_amount, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await db.execute(sql`
      INSERT INTO equipment_categories (organization_id, name, description, icon, color, rental_unit, deposit_required, deposit_amount, sort_order)
      VALUES (${orgId}, ${name}, ${description || null}, ${icon || null}, ${color || '#6366f1'}, ${rental_unit || 'hour'}, ${deposit_required || false}, ${deposit_amount || 0}, ${sort_order || 0})
      RETURNING *
    `);
    res.json({ category: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── EQUIPMENT ITEMS ─────────────────────────────────────────────────────────
router.get('/equipment/items', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { category_id, available, search, condition } = req.query;
    const catId = category_id ? parseInt(category_id as string) : null;
    const availVal = available === 'true' ? true : available === 'false' ? false : null;
    const searchVal = search ? `%${search}%` : null;
    const condVal = condition || null;

    const result = await db.execute(sql`
      SELECT ei.*, ec.name AS category_name, ec.icon AS category_icon, ec.color AS category_color,
        ec.rental_unit, ec.deposit_required, ec.deposit_amount,
        er_active.id AS active_rental_id, er_active.guest_name AS rented_by, er_active.end_time AS rented_until
      FROM equipment_items ei
      JOIN equipment_categories ec ON ec.id = ei.category_id
      LEFT JOIN equipment_rentals er_active ON er_active.item_id = ei.id AND er_active.status = 'active'
      WHERE ei.organization_id = ${orgId}
        AND (${catId}::int IS NULL OR ei.category_id = ${catId})
        AND (${availVal}::bool IS NULL OR ei.is_available = ${availVal})
        AND (${condVal}::text IS NULL OR ei.condition::text = ${condVal})
        AND (${searchVal}::text IS NULL OR ei.name ILIKE ${searchVal} OR ei.serial_number ILIKE ${searchVal})
      ORDER BY ec.sort_order, ei.name
    `);
    res.json({ items: result.rows, total: result.rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/equipment/items', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { category_id, name, serial_number, condition, price_per_hour, price_per_half_day, price_per_day, size_info, notes } = req.body;
    if (!name || !category_id) return res.status(400).json({ error: 'name and category_id required' });
    const result = await db.execute(sql`
      INSERT INTO equipment_items (organization_id, category_id, name, serial_number, condition, price_per_hour, price_per_half_day, price_per_day, size_info, notes)
      VALUES (${orgId}, ${category_id}, ${name}, ${serial_number || null}, ${condition || 'good'}, ${price_per_hour || null}, ${price_per_half_day || null}, ${price_per_day || null}, ${size_info || null}, ${notes || null})
      RETURNING *
    `);
    res.json({ item: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/equipment/items/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const { condition, is_available, notes, price_per_hour, price_per_half_day, price_per_day } = req.body;
    const result = await db.execute(sql`
      UPDATE equipment_items SET
        condition = COALESCE(${condition || null}::equipment_condition, condition),
        is_available = COALESCE(${is_available ?? null}, is_available),
        notes = COALESCE(${notes || null}, notes),
        price_per_hour = COALESCE(${price_per_hour ?? null}, price_per_hour),
        price_per_half_day = COALESCE(${price_per_half_day ?? null}, price_per_half_day),
        price_per_day = COALESCE(${price_per_day ?? null}, price_per_day),
        updated_at = NOW()
      WHERE id = ${parseInt(id)} AND organization_id = ${orgId}
      RETURNING *
    `);
    res.json({ item: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── EQUIPMENT RENTALS ────────────────────────────────────────────────────────
router.get('/equipment/rentals', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { status, category_id, date, active } = req.query;
    const statusVal = status || null;
    const catId = category_id ? parseInt(category_id as string) : null;
    const activeOnly = active === 'true';
    const dateVal = date ? String(date) : new Date().toISOString().split('T')[0];

    const result = await db.execute(sql`
      SELECT er.*, ei.name AS item_name, ei.serial_number, ec.name AS category_name, ec.icon AS category_icon,
        u.name AS created_by_name,
        EXTRACT(EPOCH FROM (COALESCE(er.actual_return_time, NOW()) - er.start_time))/3600 AS hours_elapsed,
        CASE WHEN er.status = 'active' AND NOW() > er.end_time THEN TRUE ELSE FALSE END AS is_overdue
      FROM equipment_rentals er
      JOIN equipment_items ei ON ei.id = er.item_id
      JOIN equipment_categories ec ON ec.id = ei.category_id
      LEFT JOIN users u ON u.id = er.created_by
      WHERE ec.organization_id = ${orgId}
        AND (${statusVal}::text IS NULL OR er.status::text = ${statusVal})
        AND (${catId}::int IS NULL OR ei.category_id = ${catId})
        AND (NOT ${activeOnly} OR er.status = 'active')
        AND (${activeOnly} OR DATE(er.created_at) = ${dateVal}::date)
      ORDER BY er.created_at DESC
    `);
    res.json({ rentals: result.rows, total: result.rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/equipment/rentals', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const userId = (req as any).user.userId;
    const { item_id, guest_name, guest_phone, booking_id, duration_hours, price_charged, deposit_taken, notes, start_time } = req.body;
    if (!item_id || !guest_name || !duration_hours) return res.status(400).json({ error: 'item_id, guest_name, duration_hours required' });

    // Verify item belongs to org and is available
    const [item] = (await db.execute(sql`
      SELECT ei.*, ec.organization_id FROM equipment_items ei
      JOIN equipment_categories ec ON ec.id = ei.category_id
      WHERE ei.id = ${item_id} AND ec.organization_id = ${orgId}
    `)).rows as any[];
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!item.is_available) return res.status(400).json({ error: 'Item is not available' });

    const startT = start_time ? new Date(start_time) : new Date();
    const endT = new Date(startT.getTime() + duration_hours * 3600000);

    const result = await db.execute(sql`
      INSERT INTO equipment_rentals (organization_id, item_id, booking_id, guest_name, guest_phone, start_time, end_time, duration_hours, price_charged, deposit_taken, notes, status, created_by)
      VALUES (${orgId}, ${item_id}, ${booking_id || null}, ${guest_name}, ${guest_phone || null}, ${startT.toISOString()}, ${endT.toISOString()}, ${duration_hours}, ${price_charged || 0}, ${deposit_taken || 0}, ${notes || null}, 'active', ${userId})
      RETURNING *
    `);

    // Mark item as rented (unavailable)
    await db.execute(sql`UPDATE equipment_items SET is_available = FALSE, updated_at = NOW() WHERE id = ${item_id}`);

    res.json({ rental: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/equipment/rentals/:id/return', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const { damage_notes, damage_charge, deposit_returned } = req.body;

    const [rental] = (await db.execute(sql`
      SELECT er.*, ec.organization_id FROM equipment_rentals er
      JOIN equipment_items ei ON ei.id = er.item_id
      JOIN equipment_categories ec ON ec.id = ei.category_id
      WHERE er.id = ${parseInt(id)} AND ec.organization_id = ${orgId}
    `)).rows as any[];
    if (!rental) return res.status(404).json({ error: 'Rental not found' });

    const result = await db.execute(sql`
      UPDATE equipment_rentals SET
        status = 'returned', actual_return_time = NOW(),
        damage_notes = ${damage_notes || null}, damage_charge = ${damage_charge || 0},
        deposit_returned = ${deposit_returned !== false},
        updated_at = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING *
    `);

    // Mark item as available again
    await db.execute(sql`UPDATE equipment_items SET is_available = TRUE, updated_at = NOW() WHERE id = ${rental.item_id}`);

    res.json({ rental: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ACTIVITY TYPES ───────────────────────────────────────────────────────────
router.get('/types', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { category, search } = req.query;
    const catVal = category || null;
    const searchVal = search ? `%${search}%` : null;

    const result = await db.execute(sql`
      SELECT at.*,
        COUNT(DISTINCT s.id) FILTER (WHERE s.session_date >= CURRENT_DATE AND s.status != 'cancelled') AS upcoming_sessions,
        COALESCE(SUM(s.current_participants) FILTER (WHERE s.session_date >= CURRENT_DATE AND s.status != 'cancelled'), 0) AS upcoming_participants
      FROM activity_types at
      LEFT JOIN activity_sessions s ON s.activity_type_id = at.id
      WHERE at.organization_id = ${orgId} AND at.is_active = TRUE
        AND (${catVal}::text IS NULL OR at.category = ${catVal})
        AND (${searchVal}::text IS NULL OR at.name ILIKE ${searchVal})
      GROUP BY at.id ORDER BY at.sort_order, at.name
    `);
    res.json({ types: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/types', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { name, description, category, icon, color, difficulty, duration_min, max_participants, min_participants, min_age, price_per_person, price_group, instructor_required, equipment_included, location, tags } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await db.execute(sql`
      INSERT INTO activity_types (organization_id, name, description, category, icon, color, difficulty, duration_min, max_participants, min_participants, min_age, price_per_person, price_group, instructor_required, equipment_included, location, tags)
      VALUES (${orgId}, ${name}, ${description || null}, ${category || 'sport'}, ${icon || '🏃'}, ${color || '#6366f1'}, ${difficulty || 'all_ages'}, ${duration_min || 60}, ${max_participants || 10}, ${min_participants || 1}, ${min_age || null}, ${price_per_person || 0}, ${price_group || null}, ${instructor_required || false}, ${equipment_included !== false}, ${location || null}, ${JSON.stringify(tags || [])}::jsonb)
      RETURNING *
    `);
    res.json({ type: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/types/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const { name, description, price_per_person, is_active, max_participants, location, instructor_required } = req.body;
    const result = await db.execute(sql`
      UPDATE activity_types SET
        name = COALESCE(${name || null}, name),
        description = COALESCE(${description || null}, description),
        price_per_person = COALESCE(${price_per_person ?? null}, price_per_person),
        is_active = COALESCE(${is_active ?? null}, is_active),
        max_participants = COALESCE(${max_participants ?? null}, max_participants),
        location = COALESCE(${location || null}, location),
        instructor_required = COALESCE(${instructor_required ?? null}, instructor_required)
      WHERE id = ${parseInt(id)} AND organization_id = ${orgId}
      RETURNING *
    `);
    res.json({ type: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ACTIVITY SESSIONS ────────────────────────────────────────────────────────
router.get('/sessions', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { date, date_from, date_to, status, activity_type_id } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const dateFrom = date_from ? String(date_from) : (date ? String(date) : today);
    const dateTo = date_to ? String(date_to) : (date ? String(date) : new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    const statusVal = status || null;
    const typeId = activity_type_id ? parseInt(activity_type_id as string) : null;

    const result = await db.execute(sql`
      SELECT s.*,
        at.name AS activity_name, at.category, at.icon, at.color, at.duration_min,
        at.price_per_person, at.difficulty, at.max_participants AS type_max_participants,
        (s.max_participants - s.current_participants) AS spots_left,
        COUNT(ab.id) AS booking_count
      FROM activity_sessions s
      JOIN activity_types at ON at.id = s.activity_type_id
      LEFT JOIN activity_bookings ab ON ab.session_id = s.id AND ab.status != 'cancelled'
      WHERE at.organization_id = ${orgId}
        AND s.session_date BETWEEN ${dateFrom}::date AND ${dateTo}::date
        AND (${statusVal}::text IS NULL OR s.status = ${statusVal})
        AND (${typeId}::int IS NULL OR s.activity_type_id = ${typeId})
      GROUP BY s.id, at.name, at.category, at.icon, at.color, at.duration_min, at.price_per_person, at.difficulty, at.max_participants
      ORDER BY s.session_date, s.start_time
    `);
    res.json({ sessions: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/sessions/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const [session] = (await db.execute(sql`
      SELECT s.*, at.name AS activity_name, at.category, at.icon, at.color, at.duration_min, at.price_per_person
      FROM activity_sessions s JOIN activity_types at ON at.id = s.activity_type_id
      WHERE s.id = ${parseInt(id)} AND at.organization_id = ${orgId}
    `)).rows as any[];
    if (!session) return res.status(404).json({ error: 'Not found' });

    const bookings = (await db.execute(sql`
      SELECT * FROM activity_bookings WHERE session_id = ${parseInt(id)} ORDER BY created_at
    `)).rows;

    res.json({ session, bookings });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/sessions', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { activity_type_id, session_date, start_time, end_time, instructor_name, location, max_participants, notes } = req.body;
    if (!activity_type_id || !session_date || !start_time) return res.status(400).json({ error: 'activity_type_id, session_date, start_time required' });

    const [type] = (await db.execute(sql`SELECT * FROM activity_types WHERE id = ${activity_type_id} AND organization_id = ${orgId}`)).rows as any[];
    if (!type) return res.status(404).json({ error: 'Activity type not found' });

    // Calculate end_time from duration if not provided
    const endTime = end_time || (() => {
      const [h, m] = start_time.split(':').map(Number);
      const totalMin = h * 60 + m + (type.duration_min || 60);
      return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
    })();

    const result = await db.execute(sql`
      INSERT INTO activity_sessions (organization_id, activity_type_id, session_date, start_time, end_time, instructor_name, location, max_participants, notes)
      VALUES (${orgId}, ${activity_type_id}, ${session_date}, ${start_time}, ${endTime}, ${instructor_name || null}, ${location || type.location || null}, ${max_participants || type.max_participants || 10}, ${notes || null})
      RETURNING *
    `);
    res.json({ session: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/sessions/:id', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const { status, instructor_name, notes, max_participants } = req.body;
    const result = await db.execute(sql`
      UPDATE activity_sessions SET
        status = COALESCE(${status || null}, status),
        instructor_name = COALESCE(${instructor_name || null}, instructor_name),
        notes = COALESCE(${notes || null}, notes),
        max_participants = COALESCE(${max_participants ?? null}, max_participants),
        updated_at = NOW()
      WHERE id = ${parseInt(id)} AND organization_id = ${orgId}
      RETURNING *
    `);
    res.json({ session: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ACTIVITY BOOKINGS ────────────────────────────────────────────────────────
router.post('/sessions/:id/book', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const { guest_name, guest_phone, guest_email, participant_count, notes, special_requirements, booking_id } = req.body;
    if (!guest_name) return res.status(400).json({ error: 'guest_name required' });

    const [session] = (await db.execute(sql`
      SELECT s.*, at.price_per_person, at.max_participants AS type_max FROM activity_sessions s
      JOIN activity_types at ON at.id = s.activity_type_id
      WHERE s.id = ${parseInt(id)} AND at.organization_id = ${orgId}
    `)).rows as any[];
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const count = participant_count || 1;
    const spotsLeft = (session.max_participants || session.type_max || 10) - (session.current_participants || 0);
    if (spotsLeft < count) return res.status(400).json({ error: `Only ${spotsLeft} spots available` });

    const price = Number(session.price_per_person || 0) * count;

    const result = await db.execute(sql`
      INSERT INTO activity_bookings (organization_id, session_id, booking_id, guest_name, guest_phone, guest_email, participant_count, price_charged, notes, special_requirements, status, created_by)
      VALUES (${orgId}, ${parseInt(id)}, ${booking_id || null}, ${guest_name}, ${guest_phone || null}, ${guest_email || null}, ${count}, ${price}, ${notes || null}, ${special_requirements || null}, 'confirmed', ${userId})
      RETURNING *
    `);

    // Update participant count
    await db.execute(sql`UPDATE activity_sessions SET current_participants = current_participants + ${count}, updated_at = NOW() WHERE id = ${parseInt(id)}`);

    res.json({ booking: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/bookings/:id/cancel', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;
    const [booking] = (await db.execute(sql`
      SELECT ab.* FROM activity_bookings ab
      JOIN activity_sessions s ON s.id = ab.session_id
      JOIN activity_types at ON at.id = s.activity_type_id
      WHERE ab.id = ${parseInt(id)} AND at.organization_id = ${orgId}
    `)).rows as any[];
    if (!booking) return res.status(404).json({ error: 'Not found' });

    await db.execute(sql`UPDATE activity_bookings SET status = 'cancelled' WHERE id = ${parseInt(id)}`);
    await db.execute(sql`UPDATE activity_sessions SET current_participants = GREATEST(0, current_participants - ${booking.participant_count}), updated_at = NOW() WHERE id = ${booking.session_id}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
router.get('/analytics', async (req, res) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { period = '7' } = req.query;
    const days = parseInt(period as string) || 7;

    const rentalByCategory = (await db.execute(sql`
      SELECT ec.name AS category, ec.icon, COUNT(er.id) AS rental_count,
        COALESCE(SUM(er.price_charged), 0) AS revenue,
        AVG(er.duration_hours) AS avg_hours
      FROM equipment_rentals er
      JOIN equipment_items ei ON ei.id = er.item_id
      JOIN equipment_categories ec ON ec.id = ei.category_id
      WHERE ec.organization_id = ${orgId}
        AND er.created_at >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY ec.name, ec.icon ORDER BY revenue DESC
    `)).rows;

    const activityByType = (await db.execute(sql`
      SELECT at.name, at.icon, at.category,
        COUNT(ab.id) AS booking_count,
        COALESCE(SUM(ab.participant_count), 0) AS total_participants,
        COALESCE(SUM(ab.price_charged), 0) AS revenue
      FROM activity_bookings ab
      JOIN activity_sessions s ON s.id = ab.session_id
      JOIN activity_types at ON at.id = s.activity_type_id
      WHERE at.organization_id = ${orgId}
        AND ab.created_at >= NOW() - INTERVAL '1 day' * ${days}
        AND ab.status != 'cancelled'
      GROUP BY at.name, at.icon, at.category ORDER BY revenue DESC
    `)).rows;

    const dailyRevenue = (await db.execute(sql`
      SELECT DATE(t.day) AS date,
        COALESCE(SUM(er.price_charged), 0) AS rental_revenue,
        COALESCE(SUM(ab.price_charged), 0) AS activity_revenue
      FROM generate_series(NOW() - INTERVAL '1 day' * ${days}, NOW(), INTERVAL '1 day') AS t(day)
      LEFT JOIN equipment_rentals er ON DATE(er.created_at) = DATE(t.day)
        AND er.organization_id = ${orgId}
      LEFT JOIN activity_bookings ab ON DATE(ab.created_at) = DATE(t.day)
        AND ab.status != 'cancelled'
        AND ab.session_id IN (SELECT id FROM activity_sessions WHERE organization_id = ${orgId})
      GROUP BY DATE(t.day) ORDER BY date
    `)).rows;

    const topItems = (await db.execute(sql`
      SELECT ei.name, ec.name AS category, ec.icon,
        COUNT(er.id) AS rental_count,
        COALESCE(SUM(er.price_charged), 0) AS revenue
      FROM equipment_rentals er
      JOIN equipment_items ei ON ei.id = er.item_id
      JOIN equipment_categories ec ON ec.id = ei.category_id
      WHERE ec.organization_id = ${orgId}
        AND er.created_at >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY ei.name, ec.name, ec.icon ORDER BY rental_count DESC LIMIT 8
    `)).rows;

    res.json({ rentalByCategory, activityByType, dailyRevenue, topItems, period: days });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
