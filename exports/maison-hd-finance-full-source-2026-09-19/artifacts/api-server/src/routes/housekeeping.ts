import { Router } from "express";
import { db } from "@workspace/db";
import { housekeepingTasksTable, unitsTable, usersTable, propertiesTable } from "@workspace/db/schema";
import { eq, and, inArray, count, lt } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// ── Org-aware helpers ──────────────────────────────────────────────────────────

/** Returns unit IDs that belong to the caller's organization. Empty array if org has no units. */
async function getOrgUnitIds(orgId: number): Promise<number[]> {
  const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
    .where(eq(propertiesTable.organizationId, orgId));
  if (props.length === 0) return [];
  const propIds = props.map(p => p.id);
  const units = await db.select({ id: unitsTable.id }).from(unitsTable)
    .where(inArray(unitsTable.propertyId, propIds));
  return units.map(u => u.id);
}

/** Verifies that a unit belongs to the caller's org. Returns false if not. */
async function isUnitInOrg(unitId: number, orgId: number): Promise<boolean> {
  const [u] = await db.select({ id: unitsTable.id }).from(unitsTable)
    .innerJoin(propertiesTable, and(
      eq(unitsTable.propertyId, propertiesTable.id),
      eq(propertiesTable.organizationId, orgId),
    ))
    .where(eq(unitsTable.id, unitId))
    .limit(1);
  return !!u;
}

/** Verifies that a housekeeping task belongs to the caller's org via unit→property. */
async function isTaskInOrg(taskId: number, orgId: number): Promise<boolean> {
  const [t] = await db.select({ id: housekeepingTasksTable.id }).from(housekeepingTasksTable)
    .innerJoin(unitsTable, eq(housekeepingTasksTable.unitId, unitsTable.id))
    .innerJoin(propertiesTable, and(
      eq(unitsTable.propertyId, propertiesTable.id),
      eq(propertiesTable.organizationId, orgId),
    ))
    .where(eq(housekeepingTasksTable.id, taskId))
    .limit(1);
  return !!t;
}

async function fetchTaskWithJoins(taskId: number) {
  const [task] = await db.select({
    id: housekeepingTasksTable.id,
    unitId: housekeepingTasksTable.unitId,
    assignedToId: housekeepingTasksTable.assignedToId,
    title: housekeepingTasksTable.title,
    description: housekeepingTasksTable.description,
    taskType: housekeepingTasksTable.taskType,
    status: housekeepingTasksTable.status,
    priority: housekeepingTasksTable.priority,
    dueDate: housekeepingTasksTable.dueDate,
    checklist: housekeepingTasksTable.checklist,
    estimatedMinutes: housekeepingTasksTable.estimatedMinutes,
    startTime: housekeepingTasksTable.startTime,
    endTime: housekeepingTasksTable.endTime,
    verifiedById: housekeepingTasksTable.verifiedById,
    verifiedAt: housekeepingTasksTable.verifiedAt,
    verificationNotes: housekeepingTasksTable.verificationNotes,
    notes: housekeepingTasksTable.notes,
    createdAt: housekeepingTasksTable.createdAt,
    unitName: unitsTable.name,
    assignedToName: usersTable.name,
  }).from(housekeepingTasksTable)
    .leftJoin(unitsTable, eq(housekeepingTasksTable.unitId, unitsTable.id))
    .leftJoin(usersTable, eq(housekeepingTasksTable.assignedToId, usersTable.id))
    .where(eq(housekeepingTasksTable.id, taskId))
    .limit(1);
  return task || null;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/dashboard", requireAuth, async (req, res) => {
  const user = (req as any).user;
  let unitIds: number[] = [];
  if (user.organizationId) {
    unitIds = await getOrgUnitIds(user.organizationId);
  }

  // If org exists but has no units → return zeroed stats
  if (user.organizationId && unitIds.length === 0) {
    return res.json({ totalTasks: 0, pendingTasks: 0, inProgressTasks: 0, completedTasks: 0, verifiedTasks: 0, cancelledTasks: 0, overdueCount: 0, staffAvailableCount: 0 });
  }

  const baseCondition = unitIds.length > 0 ? inArray(housekeepingTasksTable.unitId, unitIds) : undefined;
  const allTasks = await db.select({
    status: housekeepingTasksTable.status,
    dueDate: housekeepingTasksTable.dueDate,
  }).from(housekeepingTasksTable).where(baseCondition);

  const today = new Date().toISOString().split("T")[0];
  res.json({
    totalTasks: allTasks.length,
    pendingTasks: allTasks.filter(t => t.status === "pending").length,
    inProgressTasks: allTasks.filter(t => t.status === "in_progress").length,
    completedTasks: allTasks.filter(t => t.status === "completed").length,
    verifiedTasks: allTasks.filter(t => t.status === "verified").length,
    cancelledTasks: allTasks.filter(t => t.status === "cancelled").length,
    overdueCount: allTasks.filter(t =>
      t.dueDate && t.dueDate < today && !["completed", "verified", "cancelled"].includes(t.status)
    ).length,
    staffAvailableCount: 0,
  });
});

router.get("/tasks", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { unitId, status, date } = req.query;

  let unitIds: number[] = [];

  if (unitId) {
    const qUnitId = parseInt(unitId as string);
    // Validate the requested unit belongs to caller's org
    if (user.organizationId && !(await isUnitInOrg(qUnitId, user.organizationId))) {
      res.status(403).json({ error: "Forbidden", message: "Unit not in your organization" });
      return;
    }
    unitIds = [qUnitId];
  } else if (user.organizationId) {
    unitIds = await getOrgUnitIds(user.organizationId);
    // org exists but has no units → return empty
    if (unitIds.length === 0) { res.json([]); return; }
  } else if (user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const conditions: any[] = [];
  if (unitIds.length > 0) conditions.push(inArray(housekeepingTasksTable.unitId, unitIds));
  if (status) conditions.push(eq(housekeepingTasksTable.status, status as any));
  if (date) conditions.push(eq(housekeepingTasksTable.dueDate, date as string));

  const tasks = await db.select({
    id: housekeepingTasksTable.id,
    unitId: housekeepingTasksTable.unitId,
    assignedToId: housekeepingTasksTable.assignedToId,
    title: housekeepingTasksTable.title,
    description: housekeepingTasksTable.description,
    taskType: housekeepingTasksTable.taskType,
    status: housekeepingTasksTable.status,
    priority: housekeepingTasksTable.priority,
    dueDate: housekeepingTasksTable.dueDate,
    checklist: housekeepingTasksTable.checklist,
    estimatedMinutes: housekeepingTasksTable.estimatedMinutes,
    startTime: housekeepingTasksTable.startTime,
    endTime: housekeepingTasksTable.endTime,
    verifiedById: housekeepingTasksTable.verifiedById,
    verifiedAt: housekeepingTasksTable.verifiedAt,
    verificationNotes: housekeepingTasksTable.verificationNotes,
    notes: housekeepingTasksTable.notes,
    createdAt: housekeepingTasksTable.createdAt,
    unitName: unitsTable.name,
    assignedToName: usersTable.name,
  }).from(housekeepingTasksTable)
    .leftJoin(unitsTable, eq(housekeepingTasksTable.unitId, unitsTable.id))
    .leftJoin(usersTable, eq(housekeepingTasksTable.assignedToId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(tasks);
});

router.post("/tasks", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { unitId, assignedToId, title, description, taskType, priority, dueDate, checklist, estimatedMinutes, notes } = req.body;

  if (!unitId) { res.status(400).json({ error: "unitId is required" }); return; }

  // Verify unit belongs to caller's org
  if (user.organizationId && !(await isUnitInOrg(unitId, user.organizationId))) {
    res.status(403).json({ error: "Forbidden", message: "Unit not in your organization" });
    return;
  }

  const [task] = await db.insert(housekeepingTasksTable).values({
    unitId,
    assignedToId,
    title,
    description,
    taskType: taskType || "cleaning",
    priority: priority || "medium",
    dueDate,
    checklist: checklist || [],
    estimatedMinutes: estimatedMinutes || 30,
    notes,
  }).returning();

  const [unit] = await db.select({ name: unitsTable.name }).from(unitsTable).where(eq(unitsTable.id, unitId)).limit(1);
  let assignedToName: string | null = null;
  if (assignedToId) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, assignedToId)).limit(1);
    assignedToName = u?.name || null;
  }

  res.status(201).json({ ...task, unitName: unit?.name || null, assignedToName });
});

router.put("/tasks/:taskId", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const taskId = parseInt(req.params.taskId);

  if (user.organizationId && !(await isTaskInOrg(taskId, user.organizationId))) {
    res.status(403).json({ error: "Forbidden", message: "Task not in your organization" });
    return;
  }

  const { assignedToId, title, description, taskType, status, priority, dueDate, checklist, estimatedMinutes, notes } = req.body;
  const [task] = await db.update(housekeepingTasksTable).set({
    ...(assignedToId !== undefined && { assignedToId }),
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(taskType !== undefined && { taskType }),
    ...(status !== undefined && { status }),
    ...(priority !== undefined && { priority }),
    ...(dueDate !== undefined && { dueDate }),
    ...(checklist !== undefined && { checklist }),
    ...(estimatedMinutes !== undefined && { estimatedMinutes }),
    ...(notes !== undefined && { notes }),
    updatedAt: new Date(),
  }).where(eq(housekeepingTasksTable.id, taskId)).returning();
  if (!task) { res.status(404).json({ error: "Not Found", message: "Task not found" }); return; }
  const result = await fetchTaskWithJoins(taskId);
  res.json(result || task);
});

router.post("/tasks/:taskId/start", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const taskId = parseInt(req.params.taskId);
  if (user.organizationId && !(await isTaskInOrg(taskId, user.organizationId))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const [task] = await db.update(housekeepingTasksTable).set({ status: "in_progress", startTime: new Date(), updatedAt: new Date() })
    .where(eq(housekeepingTasksTable.id, taskId)).returning();
  if (!task) { res.status(404).json({ error: "Not Found", message: "Task not found" }); return; }
  const result = await fetchTaskWithJoins(taskId);
  res.json(result || task);
});

router.post("/tasks/:taskId/complete", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const taskId = parseInt(req.params.taskId);
  if (user.organizationId && !(await isTaskInOrg(taskId, user.organizationId))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const { notes } = req.body || {};
  const [task] = await db.update(housekeepingTasksTable).set({
    status: "completed", endTime: new Date(),
    ...(notes !== undefined && { notes }),
    updatedAt: new Date(),
  }).where(eq(housekeepingTasksTable.id, taskId)).returning();
  if (!task) { res.status(404).json({ error: "Not Found", message: "Task not found" }); return; }
  const result = await fetchTaskWithJoins(taskId);
  res.json(result || task);
});

router.post("/tasks/:taskId/verify", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const taskId = parseInt(req.params.taskId);
  if (user.organizationId && !(await isTaskInOrg(taskId, user.organizationId))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const { verificationNotes } = req.body || {};
  const [task] = await db.update(housekeepingTasksTable).set({
    status: "verified", verifiedById: user.id, verifiedAt: new Date(),
    ...(verificationNotes !== undefined && { verificationNotes }),
    updatedAt: new Date(),
  }).where(eq(housekeepingTasksTable.id, taskId)).returning();
  if (!task) { res.status(404).json({ error: "Not Found", message: "Task not found" }); return; }
  const result = await fetchTaskWithJoins(taskId);
  res.json(result || task);
});

router.get("/unit-statuses", requireAuth, async (req, res) => {
  const user = (req as any).user;
  let propIds: number[] = [];
  if (user.organizationId) {
    const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    propIds = props.map(p => p.id);
    if (propIds.length === 0) { res.json([]); return; }
  } else if (user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const conditions = propIds.length > 0 ? inArray(unitsTable.propertyId, propIds) : undefined;
  const units = await db.select({
    unitId: unitsTable.id,
    unitName: unitsTable.name,
    housekeepingStatus: unitsTable.housekeepingStatus,
    propertyName: propertiesTable.name,
  }).from(unitsTable)
    .leftJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
    .where(conditions);
  res.json(units);
});

router.patch("/unit-statuses", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { unitId, housekeepingStatus } = req.body;

  if (!unitId) { res.status(400).json({ error: "unitId is required" }); return; }

  // Verify unit belongs to caller's org before updating
  if (user.organizationId && !(await isUnitInOrg(unitId, user.organizationId))) {
    res.status(403).json({ error: "Forbidden", message: "Unit not in your organization" });
    return;
  }

  const [unit] = await db.update(unitsTable).set({ housekeepingStatus, updatedAt: new Date() })
    .where(eq(unitsTable.id, unitId)).returning();
  if (!unit) { res.status(404).json({ error: "Not Found", message: "Unit not found" }); return; }
  const [prop] = await db.select({ name: propertiesTable.name }).from(propertiesTable)
    .where(eq(propertiesTable.id, unit.propertyId)).limit(1);
  res.json({ unitId: unit.id, unitName: unit.name, housekeepingStatus: unit.housekeepingStatus, propertyName: prop?.name || null });
});

export default router;
