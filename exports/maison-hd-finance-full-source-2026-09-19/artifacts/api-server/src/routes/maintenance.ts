import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { sendPushToOrg, sendPushToUsers } from "./push.js";

const router = Router();

function getOrg(req: any): number {
  return req.user?.organizationId ?? req.user?.organization_id ?? 1;
}
function getUserId(req: any): number | null {
  return req.user?.id ?? null;
}

// ─── Stats ───────────────────────────────────────────────────────────────────
router.get("/stats", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);

    const stats = await db.execute(sql`
      SELECT
        COUNT(*)::int as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END)::int as open,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END)::int as in_progress,
        SUM(CASE WHEN status = 'pending_parts' THEN 1 ELSE 0 END)::int as pending_parts,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END)::int as resolved,
        SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END)::int as escalated,
        SUM(CASE WHEN priority = 'critical' AND status NOT IN ('resolved','cancelled') THEN 1 ELSE 0 END)::int as critical_open,
        SUM(CASE WHEN priority = 'high' AND status NOT IN ('resolved','cancelled') THEN 1 ELSE 0 END)::int as high_open,
        SUM(CASE WHEN due_date < NOW() AND status NOT IN ('resolved','cancelled') THEN 1 ELSE 0 END)::int as overdue,
        ROUND(AVG(CASE WHEN status = 'resolved' AND actual_duration_min IS NOT NULL THEN actual_duration_min END))::int as avg_resolution_min,
        COALESCE(SUM(CASE WHEN status = 'resolved' THEN actual_cost ELSE 0 END), 0)::numeric as total_cost_resolved,
        COALESCE(SUM(CASE WHEN status NOT IN ('resolved','cancelled') THEN estimated_cost ELSE 0 END), 0)::numeric as total_cost_pending
      FROM maintenance_requests
      WHERE organization_id = ${orgId}
    `);

    const byCategory = await db.execute(sql`
      SELECT category::text, COUNT(*)::int as count,
        SUM(CASE WHEN status NOT IN ('resolved','cancelled') THEN 1 ELSE 0 END)::int as open_count
      FROM maintenance_requests
      WHERE organization_id = ${orgId}
      GROUP BY category ORDER BY count DESC
    `);

    const upcoming = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM maintenance_schedules
      WHERE organization_id = ${orgId} AND is_active = TRUE
        AND next_due_at <= NOW() + INTERVAL '7 days'
    `);

    res.json({
      ...stats.rows[0],
      byCategory: byCategory.rows,
      upcomingScheduled: upcoming.rows[0]?.count ?? 0,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── List requests ────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { status, priority, category, propertyId, search, page, limit: lim, assignedToMe } = req.query as any;
    const offset = ((parseInt(page) || 1) - 1) * (parseInt(lim) || 50);
    const limitN = parseInt(lim) || 50;
    const statusVal = (status && status !== "all") ? status : null;
    const priorityVal = priority || null;
    const categoryVal = category || null;
    const propVal = propertyId ? parseInt(propertyId) : null;
    const searchVal = search ? "%" + search + "%" : null;
    const userId2 = assignedToMe === "true" ? getUserId(req) : null;

    const rows = await db.execute(sql`
      SELECT mr.*,
        p.name as property_name,
        u.name as unit_name,
        reporter.name as reported_by_name,
        assignee.name as assigned_to_name
      FROM maintenance_requests mr
      LEFT JOIN properties p ON p.id = mr.property_id
      LEFT JOIN units u ON u.id = mr.unit_id
      LEFT JOIN users reporter ON reporter.id = mr.reported_by_user_id
      LEFT JOIN users assignee ON assignee.id = mr.assigned_to_user_id
      WHERE mr.organization_id = ${orgId}
        AND (${statusVal}::text IS NULL OR mr.status::text = ${statusVal})
        AND (${priorityVal}::text IS NULL OR mr.priority::text = ${priorityVal})
        AND (${categoryVal}::text IS NULL OR mr.category::text = ${categoryVal})
        AND (${propVal}::int IS NULL OR mr.property_id = ${propVal})
        AND (${searchVal}::text IS NULL OR mr.title ILIKE ${searchVal} OR mr.description ILIKE ${searchVal})
        AND (${userId2}::int IS NULL OR mr.assigned_to_user_id = ${userId2})
      ORDER BY
        CASE mr.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        mr.created_at DESC
      LIMIT ${limitN} OFFSET ${offset}
    `);

    const total = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM maintenance_requests mr
      WHERE mr.organization_id = ${orgId}
        AND (${statusVal}::text IS NULL OR mr.status::text = ${statusVal})
        AND (${priorityVal}::text IS NULL OR mr.priority::text = ${priorityVal})
        AND (${categoryVal}::text IS NULL OR mr.category::text = ${categoryVal})
        AND (${propVal}::int IS NULL OR mr.property_id = ${propVal})
        AND (${searchVal}::text IS NULL OR mr.title ILIKE ${searchVal} OR mr.description ILIKE ${searchVal})
        AND (${userId2}::int IS NULL OR mr.assigned_to_user_id = ${userId2})
    `);

    res.json({ requests: rows.rows, total: total.rows[0]?.count ?? 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Get single request ───────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);

    const row = await db.execute(sql`
      SELECT mr.*,
        p.name as property_name,
        u.name as unit_name,
        reporter.name as reported_by_name,
        assignee.name as assigned_to_name
      FROM maintenance_requests mr
      LEFT JOIN properties p ON p.id = mr.property_id
      LEFT JOIN units u ON u.id = mr.unit_id
      LEFT JOIN users reporter ON reporter.id = mr.reported_by_user_id
      LEFT JOIN users assignee ON assignee.id = mr.assigned_to_user_id
      WHERE mr.id = ${id} AND mr.organization_id = ${orgId}
    `);

    if (!row.rows[0]) return res.status(404).json({ error: "Not found" });

    const logs = await db.execute(sql`
      SELECT ml.*, u2.name as user_name
      FROM maintenance_logs ml
      LEFT JOIN users u2 ON u2.id = ml.user_id
      WHERE ml.request_id = ${id}
      ORDER BY ml.created_at DESC
    `);

    res.json({ request: row.rows[0], logs: logs.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Create request ───────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const userId = getUserId(req);
    const {
      propertyId, unitId, title, description, category, priority,
      assignedToUserId, estimatedDurationMin, estimatedCost,
      partsCost, laborCost, vendorName, notes, dueDate, tags
    } = req.body;

    const nullStr = (v: any) => (v === "" || v === null || v === undefined) ? null : v;
    const nullNum = (v: any) => (v === "" || v === null || v === undefined) ? null : Number(v);

    const r = await db.execute(sql`
      INSERT INTO maintenance_requests (
        organization_id, property_id, unit_id, title, description, category, priority,
        reported_by_user_id, assigned_to_user_id, estimated_duration_min, estimated_cost,
        parts_cost, labor_cost, vendor_name, notes, due_date, tags
      ) VALUES (
        ${orgId},
        ${nullNum(propertyId)}, ${nullNum(unitId)},
        ${title}, ${nullStr(description)},
        ${category ?? 'other'}::maintenance_category,
        ${priority ?? 'medium'}::maintenance_priority,
        ${userId}, ${nullNum(assignedToUserId)},
        ${nullNum(estimatedDurationMin)}, ${nullNum(estimatedCost)},
        ${nullNum(partsCost)}, ${nullNum(laborCost)},
        ${nullStr(vendorName)}, ${nullStr(notes)},
        ${nullStr(dueDate)},
        ${JSON.stringify(tags ?? [])}::jsonb
      )
      RETURNING *
    `);

    const newReq = r.rows[0] as any;

    await db.execute(sql`
      INSERT INTO maintenance_logs (request_id, user_id, action, new_status, note)
      VALUES (${newReq.id}, ${userId}, 'created', 'open'::maintenance_status, 'Заявку створено')
    `);

    const priorityEmoji: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" };
    const pushPayload = {
      title: `${priorityEmoji[newReq.priority] ?? "🔧"} Нова заявка ТО`,
      body: `${newReq.title}`,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: `maintenance-${newReq.id}`,
      data: { url: "/maintenance" }
    };
    if (newReq.assigned_to_user_id) {
      sendPushToUsers([newReq.assigned_to_user_id], pushPayload).catch(() => {});
    } else {
      sendPushToOrg(orgId, pushPayload, userId ?? undefined).catch(() => {});
    }

    res.status(201).json({ request: newReq });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Update request ───────────────────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const userId = getUserId(req);
    const id = parseInt(req.params.id);
    const {
      title, description, category, priority, status,
      assignedToUserId, estimatedDurationMin, actualDurationMin,
      estimatedCost, actualCost, partsCost, laborCost,
      vendorName, vendorInvoice, notes, resolutionNotes,
      dueDate, guestRating, guestFeedback, tags
    } = req.body;

    const old = await db.execute(sql`SELECT status FROM maintenance_requests WHERE id = ${id} AND organization_id = ${orgId}`);
    if (!old.rows[0]) return res.status(404).json({ error: "Not found" });
    const oldStatus = (old.rows[0] as any).status;

    const r = await db.execute(sql`
      UPDATE maintenance_requests SET
        title = COALESCE(${title ?? null}, title),
        description = COALESCE(${description ?? null}, description),
        category = COALESCE(${category ? sql`${category}::maintenance_category` : null}, category),
        priority = COALESCE(${priority ? sql`${priority}::maintenance_priority` : null}, priority),
        status = COALESCE(${status ? sql`${status}::maintenance_status` : null}, status),
        assigned_to_user_id = COALESCE(${assignedToUserId ?? null}, assigned_to_user_id),
        estimated_duration_min = COALESCE(${estimatedDurationMin ?? null}, estimated_duration_min),
        actual_duration_min = COALESCE(${actualDurationMin ?? null}, actual_duration_min),
        estimated_cost = COALESCE(${estimatedCost ?? null}, estimated_cost),
        actual_cost = COALESCE(${actualCost ?? null}, actual_cost),
        parts_cost = COALESCE(${partsCost ?? null}, parts_cost),
        labor_cost = COALESCE(${laborCost ?? null}, labor_cost),
        vendor_name = COALESCE(${vendorName ?? null}, vendor_name),
        vendor_invoice = COALESCE(${vendorInvoice ?? null}, vendor_invoice),
        notes = COALESCE(${notes ?? null}, notes),
        resolution_notes = COALESCE(${resolutionNotes ?? null}, resolution_notes),
        due_date = COALESCE(${dueDate ?? null}, due_date),
        guest_rating = COALESCE(${guestRating ?? null}, guest_rating),
        guest_feedback = COALESCE(${guestFeedback ?? null}, guest_feedback),
        tags = COALESCE(${tags ? sql`${JSON.stringify(tags)}::jsonb` : null}, tags),
        started_at = CASE WHEN ${status ?? null} = 'in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
        resolved_at = CASE WHEN ${status ?? null} IN ('resolved','cancelled') THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
      WHERE id = ${id} AND organization_id = ${orgId}
      RETURNING *
    `);

    if (status && status !== oldStatus) {
      await db.execute(sql`
        INSERT INTO maintenance_logs (request_id, user_id, action, old_status, new_status, note)
        VALUES (${id}, ${userId}, 'status_changed', ${oldStatus}::maintenance_status, ${status}::maintenance_status, ${'Статус змінено з ' + oldStatus + ' на ' + status})
      `);
    }

    res.json({ request: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Delete request ───────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    await db.execute(sql`DELETE FROM maintenance_requests WHERE id = ${id} AND organization_id = ${orgId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Add log/comment ──────────────────────────────────────────────────────────
router.post("/:id/logs", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const id = parseInt(req.params.id);
    const { note } = req.body;

    const r = await db.execute(sql`
      INSERT INTO maintenance_logs (request_id, user_id, action, note)
      VALUES (${id}, ${userId}, 'comment', ${note})
      RETURNING *
    `);
    res.status(201).json({ log: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Schedules list ───────────────────────────────────────────────────────────
router.get("/schedules/list", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { propertyId, category } = req.query as any;
    const propVal = propertyId ? parseInt(propertyId) : null;
    const catVal = category || null;

    const rows = await db.execute(sql`
      SELECT ms.*,
        p.name as property_name,
        u.name as unit_name,
        a.name as assigned_to_name,
        CASE WHEN ms.next_due_at < NOW() THEN TRUE ELSE FALSE END as is_overdue,
        CASE WHEN ms.next_due_at <= NOW() + INTERVAL '7 days' THEN TRUE ELSE FALSE END as due_soon
      FROM maintenance_schedules ms
      LEFT JOIN properties p ON p.id = ms.property_id
      LEFT JOIN units u ON u.id = ms.unit_id
      LEFT JOIN users a ON a.id = ms.assigned_to_user_id
      WHERE ms.organization_id = ${orgId}
        AND (${propVal}::int IS NULL OR ms.property_id = ${propVal})
        AND (${catVal}::text IS NULL OR ms.category::text = ${catVal})
      ORDER BY ms.next_due_at ASC NULLS LAST
    `);
    res.json({ schedules: rows.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Create schedule ──────────────────────────────────────────────────────────
router.post("/schedules", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const {
      propertyId, unitId, title, description, category, frequency,
      estimatedDurationMin, estimatedCost, assignedToUserId,
      vendorName, checklist, nextDueAt, advanceNoticeDays
    } = req.body;

    const r = await db.execute(sql`
      INSERT INTO maintenance_schedules (
        organization_id, property_id, unit_id, title, description, category, frequency,
        estimated_duration_min, estimated_cost, assigned_to_user_id,
        vendor_name, checklist, next_due_at, advance_notice_days
      ) VALUES (
        ${orgId},
        ${propertyId ?? null}, ${unitId ?? null},
        ${title}, ${description ?? null},
        ${category ?? 'other'}::maintenance_category,
        ${frequency ?? 'monthly'}::schedule_frequency,
        ${estimatedDurationMin ?? null}, ${estimatedCost ?? null},
        ${assignedToUserId ?? null}, ${vendorName ?? null},
        ${JSON.stringify(checklist ?? [])}::jsonb,
        ${nextDueAt ?? null}, ${advanceNoticeDays ?? 3}
      )
      RETURNING *
    `);
    res.status(201).json({ schedule: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Update schedule ──────────────────────────────────────────────────────────
router.patch("/schedules/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    const {
      title, description, category, frequency, estimatedDurationMin,
      estimatedCost, assignedToUserId, vendorName, checklist,
      nextDueAt, lastPerformedAt, isActive, advanceNoticeDays
    } = req.body;

    const r = await db.execute(sql`
      UPDATE maintenance_schedules SET
        title = COALESCE(${title ?? null}, title),
        description = COALESCE(${description ?? null}, description),
        category = COALESCE(${category ? sql`${category}::maintenance_category` : null}, category),
        frequency = COALESCE(${frequency ? sql`${frequency}::schedule_frequency` : null}, frequency),
        estimated_duration_min = COALESCE(${estimatedDurationMin ?? null}, estimated_duration_min),
        estimated_cost = COALESCE(${estimatedCost ?? null}, estimated_cost),
        assigned_to_user_id = COALESCE(${assignedToUserId ?? null}, assigned_to_user_id),
        vendor_name = COALESCE(${vendorName ?? null}, vendor_name),
        checklist = COALESCE(${checklist ? sql`${JSON.stringify(checklist)}::jsonb` : null}, checklist),
        next_due_at = COALESCE(${nextDueAt ?? null}, next_due_at),
        last_performed_at = COALESCE(${lastPerformedAt ?? null}, last_performed_at),
        is_active = COALESCE(${isActive ?? null}, is_active),
        advance_notice_days = COALESCE(${advanceNoticeDays ?? null}, advance_notice_days),
        updated_at = NOW()
      WHERE id = ${id} AND organization_id = ${orgId}
      RETURNING *
    `);
    res.json({ schedule: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Mark schedule performed → auto-create request ────────────────────────────
router.post("/schedules/:id/perform", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const userId = getUserId(req);
    const id = parseInt(req.params.id);
    const { notes, actualCost, nextDueAt } = req.body;

    const sched = await db.execute(sql`SELECT * FROM maintenance_schedules WHERE id = ${id} AND organization_id = ${orgId}`);
    if (!sched.rows[0]) return res.status(404).json({ error: "Not found" });
    const s = sched.rows[0] as any;

    const freqMap: Record<string, string> = {
      daily: '1 day', weekly: '7 days', biweekly: '14 days',
      monthly: '1 month', quarterly: '3 months', semiannual: '6 months', annual: '1 year'
    };
    const interval = freqMap[s.frequency] ?? '1 month';
    const newNextDue = nextDueAt || null;

    await db.execute(sql`
      UPDATE maintenance_schedules SET
        last_performed_at = NOW(),
        next_due_at = COALESCE(${newNextDue}, NOW() + ${interval}::interval),
        updated_at = NOW()
      WHERE id = ${id}
    `);

    const req2 = await db.execute(sql`
      INSERT INTO maintenance_requests (
        organization_id, property_id, unit_id, title, description,
        category, priority, status, reported_by_user_id, recurring_schedule_id,
        actual_cost, notes, resolved_at
      ) VALUES (
        ${orgId}, ${s.property_id ?? null}, ${s.unit_id ?? null},
        ${'[ТО] ' + s.title}, ${s.description ?? null},
        ${s.category}::maintenance_category, 'low'::maintenance_priority, 'resolved'::maintenance_status,
        ${userId}, ${id},
        ${actualCost ?? s.estimated_cost ?? null},
        ${notes ?? null}, NOW()
      )
      RETURNING id
    `);

    res.json({ success: true, requestId: (req2.rows[0] as any).id, nextDueAt: newNextDue ?? 'auto-calculated' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Delete schedule ──────────────────────────────────────────────────────────
router.delete("/schedules/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    await db.execute(sql`DELETE FROM maintenance_schedules WHERE id = ${id} AND organization_id = ${orgId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Cost analytics ───────────────────────────────────────────────────────────
router.get("/analytics/costs", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { period } = req.query as any;
    const months = parseInt(period) || 6;

    const monthly = await db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        COUNT(*)::int as total,
        SUM(CASE WHEN status = 'resolved' THEN actual_cost ELSE estimated_cost END)::numeric as cost,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END)::int as resolved,
        ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600))::int as avg_hours
      FROM maintenance_requests
      WHERE organization_id = ${orgId}
        AND created_at >= NOW() - (${months} || ' months')::interval
      GROUP BY month ORDER BY month ASC
    `);

    const byCat = await db.execute(sql`
      SELECT category::text,
        COUNT(*)::int as count,
        COALESCE(SUM(CASE WHEN status = 'resolved' THEN actual_cost ELSE estimated_cost END), 0)::numeric as total_cost,
        ROUND(AVG(CASE WHEN status = 'resolved' AND actual_duration_min IS NOT NULL THEN actual_duration_min END))::int as avg_min
      FROM maintenance_requests
      WHERE organization_id = ${orgId}
        AND created_at >= NOW() - (${months} || ' months')::interval
      GROUP BY category ORDER BY total_cost DESC
    `);

    const byPriority = await db.execute(sql`
      SELECT priority::text,
        COUNT(*)::int as count,
        ROUND(AVG(CASE WHEN status = 'resolved' THEN EXTRACT(EPOCH FROM (resolved_at - created_at))/3600 END))::int as avg_hours
      FROM maintenance_requests
      WHERE organization_id = ${orgId}
      GROUP BY priority ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
    `);

    res.json({ monthly: monthly.rows, byCategory: byCat.rows, byPriority: byPriority.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
