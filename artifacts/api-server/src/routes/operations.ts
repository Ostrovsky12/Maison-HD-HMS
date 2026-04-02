import { Router } from "express";
import { db } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";

const router = Router();

const DB = () => (db as any).$client;

function getOrg(req: any): number {
  return req.user?.organizationId ?? req.user?.organization_id ?? 1;
}
function getUserId(req: any): number | null {
  return req.user?.id ?? null;
}
function getUserName(req: any): string {
  return req.user?.name ?? "Невідомо";
}

// ─── Dashboard Overview ───────────────────────────────────────────────────────
router.get("/dashboard", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const client = DB();

    const [hkRes, mntRes, lostRes, inspRes, roomRes] = await Promise.all([
      client.query(`
        SELECT
          COUNT(*)::int as total,
          SUM(CASE WHEN ht.status='pending' THEN 1 ELSE 0 END)::int as pending,
          SUM(CASE WHEN ht.status='in_progress' THEN 1 ELSE 0 END)::int as in_progress,
          SUM(CASE WHEN ht.status='completed' THEN 1 ELSE 0 END)::int as completed,
          SUM(CASE WHEN ht.status='verified' THEN 1 ELSE 0 END)::int as verified,
          SUM(CASE WHEN ht.due_date::date = CURRENT_DATE AND ht.status NOT IN ('completed','verified','cancelled') THEN 1 ELSE 0 END)::int as due_today,
          SUM(CASE WHEN ht.due_date < CURRENT_DATE AND ht.status NOT IN ('completed','verified','cancelled') THEN 1 ELSE 0 END)::int as overdue
        FROM housekeeping_tasks ht
        JOIN units u ON u.id = ht.unit_id
        JOIN properties p ON p.id = u.property_id
        WHERE p.organization_id = $1
      `, [orgId]),
      client.query(`
        SELECT
          COUNT(*)::int as total,
          SUM(CASE WHEN status='open' THEN 1 ELSE 0 END)::int as open,
          SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END)::int as in_progress,
          SUM(CASE WHEN status='pending_parts' THEN 1 ELSE 0 END)::int as pending_parts,
          SUM(CASE WHEN status='escalated' THEN 1 ELSE 0 END)::int as escalated,
          SUM(CASE WHEN priority='critical' AND status NOT IN ('resolved','cancelled') THEN 1 ELSE 0 END)::int as critical,
          SUM(CASE WHEN due_date < NOW() AND status NOT IN ('resolved','cancelled') THEN 1 ELSE 0 END)::int as overdue
        FROM maintenance_requests WHERE organization_id = $1
      `, [orgId]),
      client.query(`
        SELECT
          COUNT(*)::int as total,
          SUM(CASE WHEN status='found' THEN 1 ELSE 0 END)::int as unclaimed,
          SUM(CASE WHEN status='claimed' THEN 1 ELSE 0 END)::int as claimed,
          SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END)::int as this_week
        FROM lost_found_items WHERE organization_id = $1
      `, [orgId]),
      client.query(`
        SELECT
          COUNT(*)::int as total,
          SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)::int as pending,
          SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END)::int as in_progress,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END)::int as failed,
          ROUND(AVG(score))::int as avg_score
        FROM room_inspections WHERE organization_id = $1
      `, [orgId]),
      client.query(`
        SELECT
          SUM(CASE WHEN u.housekeeping_status='clean' THEN 1 ELSE 0 END)::int as clean,
          SUM(CASE WHEN u.housekeeping_status='dirty' THEN 1 ELSE 0 END)::int as dirty,
          SUM(CASE WHEN u.housekeeping_status='in_progress' THEN 1 ELSE 0 END)::int as in_progress,
          COUNT(*)::int as total
        FROM units u
        JOIN properties p ON p.id = u.property_id
        WHERE p.organization_id = $1 AND u.status='active'
      `, [orgId])
    ]);

    res.json({
      housekeeping: hkRes.rows[0] ?? {},
      maintenance:  mntRes.rows[0] ?? {},
      lostFound:    lostRes.rows[0] ?? {},
      inspections:  inspRes.rows[0] ?? {},
      rooms:        roomRes.rows[0] ?? {},
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Room Status Board ────────────────────────────────────────────────────────
router.get("/room-board", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { property_id } = req.query;
    const client = DB();

    const propCondition = property_id ? `AND p.id = ${Number(property_id)}` : "";

    const [unitsRes, tasksRes, bookingsRes] = await Promise.all([
      client.query(`
        SELECT u.id, u.name, u.floor, u.category, u.housekeeping_status,
               u.status as unit_status, p.id as property_id, p.name as property_name
        FROM units u
        JOIN properties p ON p.id = u.property_id
        WHERE p.organization_id = $1 AND u.status = 'active' ${propCondition}
        ORDER BY p.name, u.floor NULLS LAST, u.name
      `, [orgId]),
      client.query(`
        SELECT ht.unit_id, ht.id, ht.title, ht.task_type, ht.status, ht.priority,
               ht.due_date, usr.name as assigned_to_name
        FROM housekeeping_tasks ht
        LEFT JOIN users usr ON usr.id = ht.assigned_to_id
        JOIN units u ON u.id = ht.unit_id
        JOIN properties p ON p.id = u.property_id
        WHERE p.organization_id = $1 AND ht.status IN ('pending','in_progress')
      `, [orgId]),
      client.query(`
        SELECT b.unit_id,
               b.status as booking_status,
               b.first_name || ' ' || b.last_name as guest_name,
               b.check_in, b.check_out
        FROM bookings b
        JOIN units u ON u.id = b.unit_id
        JOIN properties p ON p.id = u.property_id
        WHERE p.organization_id = $1
          AND b.status IN ('confirmed','checked_in')
          AND b.check_in <= CURRENT_DATE + 1
          AND b.check_out >= CURRENT_DATE
        ORDER BY b.check_in
      `, [orgId])
    ]);

    const tasksByUnit: Record<number, any[]> = {};
    for (const t of tasksRes.rows) {
      if (!tasksByUnit[t.unit_id]) tasksByUnit[t.unit_id] = [];
      tasksByUnit[t.unit_id].push(t);
    }
    const bookingsByUnit: Record<number, any> = {};
    for (const b of bookingsRes.rows) bookingsByUnit[b.unit_id] = b;

    const result = unitsRes.rows.map((u: any) => ({
      ...u,
      activeTasks: tasksByUnit[u.id] ?? [],
      booking: bookingsByUnit[u.id] ?? null
    }));

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/room-board/:unitId/status", requireAuth, async (req: any, res) => {
  try {
    const { unitId } = req.params;
    const { status } = req.body;
    await DB().query(`
      UPDATE units SET housekeeping_status = $1::housekeeping_status, updated_at = NOW()
      WHERE id = $2
    `, [status, Number(unitId)]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── HK Tasks ────────────────────────────────────────────────────────────────
router.get("/tasks", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { status, task_type, assigned_to, property_id, date } = req.query;
    const client = DB();

    const conditions = [`p.organization_id = $1`];
    const params: any[] = [orgId];
    let pIdx = 2;

    if (status) { conditions.push(`ht.status = $${pIdx++}`); params.push(status); }
    if (task_type) { conditions.push(`ht.task_type = $${pIdx++}`); params.push(task_type); }
    if (assigned_to) { conditions.push(`ht.assigned_to_id = $${pIdx++}`); params.push(Number(assigned_to)); }
    if (property_id) { conditions.push(`p.id = $${pIdx++}`); params.push(Number(property_id)); }
    if (date) { conditions.push(`ht.due_date::date = $${pIdx++}::date`); params.push(date); }

    const tasksRes = await client.query(`
      SELECT ht.*,
             u.name as unit_name, u.floor, u.category,
             p.name as property_name,
             usr.name as assigned_to_name,
             v.name as verified_by_name
      FROM housekeeping_tasks ht
      JOIN units u ON u.id = ht.unit_id
      JOIN properties p ON p.id = u.property_id
      LEFT JOIN users usr ON usr.id = ht.assigned_to_id
      LEFT JOIN users v ON v.id = ht.verified_by_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE ht.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        ht.due_date NULLS LAST, ht.created_at DESC
    `, params);

    const taskIds = tasksRes.rows.map((t: any) => t.id);
    let comments: any[] = [];
    if (taskIds.length > 0) {
      const cRes = await client.query(`
        SELECT * FROM internal_comments
        WHERE entity_type = 'hk_task' AND entity_id = ANY($1)
        ORDER BY created_at
      `, [taskIds]);
      comments = cRes.rows;
    }

    const commentsByTask: Record<number, any[]> = {};
    for (const c of comments) {
      if (!commentsByTask[c.entity_id]) commentsByTask[c.entity_id] = [];
      commentsByTask[c.entity_id].push(c);
    }

    const result = tasksRes.rows.map((t: any) => ({
      ...t,
      comments: commentsByTask[t.id] ?? []
    }));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/tasks", requireAuth, async (req: any, res) => {
  try {
    const {
      unit_id, title, description, task_type = "cleaning", priority = "medium",
      due_date, assigned_to_id, estimated_minutes = 30, checklist = [], notes
    } = req.body;
    const result = await DB().query(`
      INSERT INTO housekeeping_tasks
        (unit_id, title, description, task_type, priority, due_date, assigned_to_id, estimated_minutes, checklist, notes)
      VALUES ($1, $2, $3, $4::task_type, $5::task_priority, $6, $7, $8, $9::json, $10)
      RETURNING *
    `, [
      Number(unit_id), title, description ?? null,
      task_type, priority,
      due_date ?? null, assigned_to_id ? Number(assigned_to_id) : null,
      estimated_minutes, JSON.stringify(checklist), notes ?? null
    ]);
    res.json(result.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/tasks/:id", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (updates.status !== undefined) { sets.push(`status = $${pIdx++}::task_status`); params.push(updates.status); }
    if (updates.priority !== undefined) { sets.push(`priority = $${pIdx++}::task_priority`); params.push(updates.priority); }
    if (updates.assigned_to_id !== undefined) { sets.push(`assigned_to_id = $${pIdx++}`); params.push(updates.assigned_to_id ?? null); }
    if (updates.title !== undefined) { sets.push(`title = $${pIdx++}`); params.push(updates.title); }
    if (updates.notes !== undefined) { sets.push(`notes = $${pIdx++}`); params.push(updates.notes ?? null); }
    if (updates.due_date !== undefined) { sets.push(`due_date = $${pIdx++}`); params.push(updates.due_date ?? null); }
    if (updates.checklist !== undefined) { sets.push(`checklist = $${pIdx++}::json`); params.push(JSON.stringify(updates.checklist)); }
    if (updates.estimated_minutes !== undefined) { sets.push(`estimated_minutes = $${pIdx++}`); params.push(updates.estimated_minutes); }
    if (updates.status === 'in_progress') sets.push(`start_time = NOW()`);
    if (updates.status === 'completed') sets.push(`end_time = NOW()`);
    if (updates.verified_by_id !== undefined) {
      sets.push(`verified_by_id = $${pIdx++}`); params.push(updates.verified_by_id);
      sets.push(`verified_at = NOW()`);
      if (updates.verification_notes) { sets.push(`verification_notes = $${pIdx++}`); params.push(updates.verification_notes); }
    }
    sets.push(`updated_at = NOW()`);
    params.push(Number(id));
    await DB().query(`UPDATE housekeeping_tasks SET ${sets.join(', ')} WHERE id = $${pIdx}`, params);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/tasks/:id/comment", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { text, photo_urls = [] } = req.body;
    await DB().query(`
      INSERT INTO internal_comments (entity_type, entity_id, user_id, user_name, text, photo_urls)
      VALUES ('hk_task', $1, $2, $3, $4, $5::jsonb)
    `, [Number(id), getUserId(req), getUserName(req), text, JSON.stringify(photo_urls)]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Maintenance Tickets ──────────────────────────────────────────────────────
router.get("/maintenance", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { status, category, priority, property_id, assigned_to } = req.query;
    const client = DB();

    const conditions = [`mr.organization_id = $1`];
    const params: any[] = [orgId];
    let pIdx = 2;

    if (status) { conditions.push(`mr.status = $${pIdx++}`); params.push(status); }
    if (category) { conditions.push(`mr.category = $${pIdx++}`); params.push(category); }
    if (priority) { conditions.push(`mr.priority = $${pIdx++}`); params.push(priority); }
    if (property_id) { conditions.push(`mr.property_id = $${pIdx++}`); params.push(Number(property_id)); }
    if (assigned_to) { conditions.push(`mr.assigned_to_user_id = $${pIdx++}`); params.push(Number(assigned_to)); }

    const ticketsRes = await client.query(`
      SELECT mr.*,
             u.name as unit_name, u.floor, u.category as unit_category,
             p.name as property_name,
             rep.name as reported_by_name,
             asgn.name as assigned_to_name,
             EXTRACT(DAY FROM NOW() - mr.created_at)::int as age_days,
             CASE WHEN mr.due_date < NOW() AND mr.status NOT IN ('resolved','cancelled') THEN true ELSE false END as sla_breached
      FROM maintenance_requests mr
      LEFT JOIN units u ON u.id = mr.unit_id
      LEFT JOIN properties p ON p.id = mr.property_id
      LEFT JOIN users rep ON rep.id = mr.reported_by_user_id
      LEFT JOIN users asgn ON asgn.id = mr.assigned_to_user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE mr.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        mr.created_at DESC
    `, params);

    const ticketIds = ticketsRes.rows.map((t: any) => t.id);
    let comments: any[] = [], logs: any[] = [];
    if (ticketIds.length > 0) {
      const [cRes, lRes] = await Promise.all([
        client.query(`
          SELECT * FROM internal_comments
          WHERE entity_type = 'maintenance' AND entity_id = ANY($1)
          ORDER BY created_at
        `, [ticketIds]),
        client.query(`
          SELECT ml.*, u.name as user_name
          FROM maintenance_logs ml
          LEFT JOIN users u ON u.id = ml.user_id
          WHERE ml.request_id = ANY($1)
          ORDER BY ml.created_at
        `, [ticketIds])
      ]);
      comments = cRes.rows;
      logs = lRes.rows;
    }

    const commentsByTicket: Record<number, any[]> = {};
    const logsByTicket: Record<number, any[]> = {};
    for (const c of comments) {
      if (!commentsByTicket[c.entity_id]) commentsByTicket[c.entity_id] = [];
      commentsByTicket[c.entity_id].push(c);
    }
    for (const l of logs) {
      if (!logsByTicket[l.request_id]) logsByTicket[l.request_id] = [];
      logsByTicket[l.request_id].push(l);
    }

    const result = ticketsRes.rows.map((t: any) => ({
      ...t,
      comments: commentsByTicket[t.id] ?? [],
      activity: logsByTicket[t.id] ?? []
    }));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/maintenance", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const userId = getUserId(req);
    const {
      title, description, category = "other", priority = "medium",
      property_id, unit_id, assigned_to_user_id,
      estimated_duration_min, estimated_cost,
      due_date, tags = [], notes, reported_by_guest_name
    } = req.body;
    const client = DB();

    const result = await client.query(`
      INSERT INTO maintenance_requests
        (organization_id, title, description, category, priority, property_id, unit_id,
         reported_by_user_id, reported_by_guest_name, assigned_to_user_id,
         estimated_duration_min, estimated_cost, due_date, tags, notes)
      VALUES ($1,$2,$3,$4::maintenance_category,$5::maintenance_priority,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)
      RETURNING id
    `, [
      orgId, title, description ?? null, category, priority,
      property_id ? Number(property_id) : null, unit_id ? Number(unit_id) : null,
      userId, reported_by_guest_name ?? null,
      assigned_to_user_id ? Number(assigned_to_user_id) : null,
      estimated_duration_min ? Number(estimated_duration_min) : null,
      estimated_cost ? Number(estimated_cost) : null,
      due_date ?? null, JSON.stringify(tags), notes ?? null
    ]);
    const newId = result.rows[0]?.id;
    await client.query(`
      INSERT INTO maintenance_logs (request_id, user_id, action, new_status, note)
      VALUES ($1,$2,'created','open','Заявку створено')
    `, [newId, userId]);
    res.json({ id: newId, success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/maintenance/:id", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrg(req);
    const userId = getUserId(req);
    const updates = req.body;
    const client = DB();

    const currentRes = await client.query(
      `SELECT status FROM maintenance_requests WHERE id = $1 AND organization_id = $2`,
      [Number(id), orgId]
    );
    const oldStatus = currentRes.rows[0]?.status;

    const sets: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (updates.status !== undefined) { sets.push(`status = $${pIdx++}::maintenance_status`); params.push(updates.status); }
    if (updates.priority !== undefined) { sets.push(`priority = $${pIdx++}::maintenance_priority`); params.push(updates.priority); }
    if (updates.assigned_to_user_id !== undefined) { sets.push(`assigned_to_user_id = $${pIdx++}`); params.push(updates.assigned_to_user_id ?? null); }
    if (updates.title !== undefined) { sets.push(`title = $${pIdx++}`); params.push(updates.title); }
    if (updates.notes !== undefined) { sets.push(`notes = $${pIdx++}`); params.push(updates.notes ?? null); }
    if (updates.resolution_notes !== undefined) { sets.push(`resolution_notes = $${pIdx++}`); params.push(updates.resolution_notes ?? null); }
    if (updates.due_date !== undefined) { sets.push(`due_date = $${pIdx++}`); params.push(updates.due_date ?? null); }
    if (updates.actual_duration_min !== undefined) { sets.push(`actual_duration_min = $${pIdx++}`); params.push(Number(updates.actual_duration_min)); }
    if (updates.actual_cost !== undefined) { sets.push(`actual_cost = $${pIdx++}`); params.push(Number(updates.actual_cost)); }
    if (updates.vendor_name !== undefined) { sets.push(`vendor_name = $${pIdx++}`); params.push(updates.vendor_name ?? null); }
    if (updates.status === 'in_progress') sets.push(`started_at = NOW()`);
    if (updates.status === 'resolved') sets.push(`resolved_at = NOW()`);
    sets.push(`updated_at = NOW()`);
    params.push(Number(id));

    if (sets.length > 1) {
      await client.query(`UPDATE maintenance_requests SET ${sets.join(', ')} WHERE id = $${pIdx}`, params);
    }
    if (updates.status && updates.status !== oldStatus) {
      await client.query(`
        INSERT INTO maintenance_logs (request_id, user_id, action, old_status, new_status, note)
        VALUES ($1,$2,'status_change',$3::maintenance_status,$4::maintenance_status,$5)
      `, [Number(id), userId, oldStatus ?? null, updates.status, updates.log_note ?? `Статус: ${updates.status}`]);
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/maintenance/:id/comment", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { text, photo_urls = [] } = req.body;
    const userId = getUserId(req);
    const userName = getUserName(req);
    const client = DB();
    await Promise.all([
      client.query(`
        INSERT INTO internal_comments (entity_type, entity_id, user_id, user_name, text, photo_urls)
        VALUES ('maintenance',$1,$2,$3,$4,$5::jsonb)
      `, [Number(id), userId, userName, text, JSON.stringify(photo_urls)]),
      client.query(`
        INSERT INTO maintenance_logs (request_id, user_id, action, note)
        VALUES ($1,$2,'comment',$3)
      `, [Number(id), userId, text])
    ]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Preventive Maintenance Schedules ────────────────────────────────────────
router.get("/maintenance/schedules", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const result = await DB().query(`
      SELECT ms.*,
             u.name as unit_name,
             p.name as property_name,
             asgn.name as assigned_to_name
      FROM maintenance_schedules ms
      LEFT JOIN units u ON u.id = ms.unit_id
      LEFT JOIN properties p ON p.id = ms.property_id
      LEFT JOIN users asgn ON asgn.id = ms.assigned_to_user_id
      WHERE ms.organization_id = $1
      ORDER BY ms.next_due_at NULLS LAST
    `, [orgId]);
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Lost & Found ─────────────────────────────────────────────────────────────
router.get("/lost-found", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { status, category } = req.query;
    const client = DB();

    const conditions = [`lf.organization_id = $1`];
    const params: any[] = [orgId];
    let pIdx = 2;
    if (status) { conditions.push(`lf.status = $${pIdx++}`); params.push(status); }
    if (category) { conditions.push(`lf.category = $${pIdx++}`); params.push(category); }

    const itemsRes = await client.query(`
      SELECT lf.*,
             p.name as property_name,
             u.name as unit_name,
             usr.name as found_by_name
      FROM lost_found_items lf
      LEFT JOIN properties p ON p.id = lf.property_id
      LEFT JOIN units u ON u.id = lf.unit_id
      LEFT JOIN users usr ON usr.id = lf.found_by_user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY lf.found_date DESC, lf.created_at DESC
    `, params);

    const itemIds = itemsRes.rows.map((i: any) => i.id);
    let comments: any[] = [];
    if (itemIds.length > 0) {
      const cRes = await client.query(`
        SELECT * FROM internal_comments
        WHERE entity_type = 'lost_found' AND entity_id = ANY($1)
        ORDER BY created_at
      `, [itemIds]);
      comments = cRes.rows;
    }
    const commentsByItem: Record<number, any[]> = {};
    for (const c of comments) {
      if (!commentsByItem[c.entity_id]) commentsByItem[c.entity_id] = [];
      commentsByItem[c.entity_id].push(c);
    }
    const result = itemsRes.rows.map((i: any) => ({ ...i, comments: commentsByItem[i.id] ?? [] }));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/lost-found", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const userId = getUserId(req);
    const {
      property_id, unit_id, found_date, category = "other",
      description, color, brand, storage_location,
      guest_name, guest_contact, notes, photo_urls = []
    } = req.body;

    const result = await DB().query(`
      INSERT INTO lost_found_items
        (organization_id, property_id, unit_id, found_date, found_by_user_id,
         category, description, color, brand, storage_location,
         guest_name, guest_contact, notes, photo_urls)
      VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
      RETURNING id
    `, [
      orgId,
      property_id ? Number(property_id) : null,
      unit_id ? Number(unit_id) : null,
      found_date ?? new Date().toISOString().split("T")[0],
      userId, category, description,
      color ?? null, brand ?? null, storage_location ?? null,
      guest_name ?? null, guest_contact ?? null, notes ?? null,
      JSON.stringify(photo_urls)
    ]);
    res.json({ id: result.rows[0]?.id, success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/lost-found/:id", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (updates.status !== undefined) { sets.push(`status = $${pIdx++}`); params.push(updates.status); }
    if (updates.storage_location !== undefined) { sets.push(`storage_location = $${pIdx++}`); params.push(updates.storage_location ?? null); }
    if (updates.guest_name !== undefined) { sets.push(`guest_name = $${pIdx++}`); params.push(updates.guest_name ?? null); }
    if (updates.guest_contact !== undefined) { sets.push(`guest_contact = $${pIdx++}`); params.push(updates.guest_contact ?? null); }
    if (updates.notes !== undefined) { sets.push(`notes = $${pIdx++}`); params.push(updates.notes ?? null); }
    if (updates.status === 'claimed') {
      sets.push(`claimed_at = NOW()`);
      if (updates.claimed_by) { sets.push(`claimed_by = $${pIdx++}`); params.push(updates.claimed_by); }
    }
    sets.push(`updated_at = NOW()`);
    params.push(Number(id));
    await DB().query(`UPDATE lost_found_items SET ${sets.join(', ')} WHERE id = $${pIdx}`, params);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/lost-found/:id/comment", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { text, photo_urls = [] } = req.body;
    await DB().query(`
      INSERT INTO internal_comments (entity_type, entity_id, user_id, user_name, text, photo_urls)
      VALUES ('lost_found',$1,$2,$3,$4,$5::jsonb)
    `, [Number(id), getUserId(req), getUserName(req), text, JSON.stringify(photo_urls)]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Inspections ──────────────────────────────────────────────────────────────
router.get("/inspections", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { status, inspection_type, property_id } = req.query;
    const client = DB();

    const conditions = [`ri.organization_id = $1`];
    const params: any[] = [orgId];
    let pIdx = 2;
    if (status) { conditions.push(`ri.status = $${pIdx++}`); params.push(status); }
    if (inspection_type) { conditions.push(`ri.inspection_type = $${pIdx++}`); params.push(inspection_type); }
    if (property_id) { conditions.push(`ri.property_id = $${pIdx++}`); params.push(Number(property_id)); }

    const inspRes = await client.query(`
      SELECT ri.*,
             u.name as unit_name, u.floor, u.category as unit_category,
             p.name as property_name,
             insp.name as inspector_name,
             appr.name as approved_by_name
      FROM room_inspections ri
      JOIN units u ON u.id = ri.unit_id
      LEFT JOIN properties p ON p.id = ri.property_id
      LEFT JOIN users insp ON insp.id = ri.inspector_id
      LEFT JOIN users appr ON appr.id = ri.approved_by_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ri.created_at DESC
      LIMIT 100
    `, params);

    const inspIds = inspRes.rows.map((i: any) => i.id);
    let comments: any[] = [];
    if (inspIds.length > 0) {
      const cRes = await client.query(`
        SELECT * FROM internal_comments
        WHERE entity_type = 'inspection' AND entity_id = ANY($1)
        ORDER BY created_at
      `, [inspIds]);
      comments = cRes.rows;
    }
    const commentsByInsp: Record<number, any[]> = {};
    for (const c of comments) {
      if (!commentsByInsp[c.entity_id]) commentsByInsp[c.entity_id] = [];
      commentsByInsp[c.entity_id].push(c);
    }
    const result = inspRes.rows.map((i: any) => ({ ...i, comments: commentsByInsp[i.id] ?? [] }));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/inspections", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const userId = getUserId(req);
    const { unit_id, property_id, inspection_type = "routine", inspector_id, notes, checklist = [] } = req.body;

    const defaultChecklist = checklist.length > 0 ? checklist : [
      { id: 1, item: "Підлога чиста", ok: null },
      { id: 2, item: "Ліжко заправлене", ok: null },
      { id: 3, item: "Санвузол чистий", ok: null },
      { id: 4, item: "Рушники свіжі", ok: null },
      { id: 5, item: "Вікна чисті", ok: null },
      { id: 6, item: "Косметика поповнена", ok: null },
      { id: 7, item: "Міні-бар перевірено", ok: null },
      { id: 8, item: "ТБ/кліматизатор працює", ok: null },
      { id: 9, item: "Немає пошкоджень", ok: null },
      { id: 10, item: "Загальна чистота", ok: null },
    ];

    const result = await DB().query(`
      INSERT INTO room_inspections
        (organization_id, property_id, unit_id, inspector_id, inspection_type, notes, checklist)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
      RETURNING id
    `, [
      orgId, property_id ? Number(property_id) : null, Number(unit_id),
      inspector_id ? Number(inspector_id) : userId,
      inspection_type, notes ?? null, JSON.stringify(defaultChecklist)
    ]);
    res.json({ id: result.rows[0]?.id, success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/inspections/:id", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const updates = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (updates.status !== undefined) { sets.push(`status = $${pIdx++}`); params.push(updates.status); }
    if (updates.score !== undefined) { sets.push(`score = $${pIdx++}`); params.push(Number(updates.score)); }
    if (updates.notes !== undefined) { sets.push(`notes = $${pIdx++}`); params.push(updates.notes ?? null); }
    if (updates.checklist !== undefined) { sets.push(`checklist = $${pIdx++}::jsonb`); params.push(JSON.stringify(updates.checklist)); }
    if (updates.issues !== undefined) { sets.push(`issues = $${pIdx++}::jsonb`); params.push(JSON.stringify(updates.issues)); }
    if (updates.photo_urls !== undefined) { sets.push(`photo_urls = $${pIdx++}::jsonb`); params.push(JSON.stringify(updates.photo_urls)); }
    if (updates.status === 'in_progress') sets.push(`started_at = NOW()`);
    if (updates.status === 'completed' || updates.status === 'failed') sets.push(`completed_at = NOW()`);
    if (updates.status === 'approved') {
      sets.push(`approved_by_id = $${pIdx++}`); params.push(userId);
      sets.push(`approved_at = NOW()`);
    }
    sets.push(`updated_at = NOW()`);
    params.push(Number(id));
    await DB().query(`UPDATE room_inspections SET ${sets.join(', ')} WHERE id = $${pIdx}`, params);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/inspections/:id/comment", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { text, photo_urls = [] } = req.body;
    await DB().query(`
      INSERT INTO internal_comments (entity_type, entity_id, user_id, user_name, text, photo_urls)
      VALUES ('inspection',$1,$2,$3,$4,$5::jsonb)
    `, [Number(id), getUserId(req), getUserName(req), text, JSON.stringify(photo_urls)]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Staff ────────────────────────────────────────────────────────────────────
router.get("/staff", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const result = await DB().query(`
      SELECT id, name, email, role
      FROM users
      WHERE organization_id = $1
        AND role IN ('housekeeping','manager','reception','owner')
      ORDER BY
        CASE role WHEN 'housekeeping' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, name
    `, [orgId]);
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Properties ───────────────────────────────────────────────────────────────
router.get("/properties", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const result = await DB().query(
      `SELECT id, name FROM properties WHERE organization_id = $1 ORDER BY name`,
      [orgId]
    );
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Units ────────────────────────────────────────────────────────────────────
router.get("/units", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { property_id } = req.query;
    const conditions = [`p.organization_id = $1`, `u.status = 'active'`];
    const params: any[] = [orgId];
    if (property_id) { conditions.push(`p.id = $2`); params.push(Number(property_id)); }

    const result = await DB().query(`
      SELECT u.id, u.name, u.floor, u.category, p.name as property_name, p.id as property_id
      FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.name, u.floor NULLS LAST, u.name
    `, params);
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
