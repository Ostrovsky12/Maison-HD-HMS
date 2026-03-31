import { Router } from "express";
import { db } from "@workspace/db";
import { housekeepingTasksTable, unitsTable, usersTable, propertiesTable } from "@workspace/db/schema";
import { eq, and, inArray, count, lt } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

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

router.get("/dashboard", requireAuth, async (req, res) => {
  const user = (req as any).user;
  let unitIds: number[] = [];
  if (user.organizationId) {
    const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    const propIds = props.map(p => p.id);
    if (propIds.length > 0) {
      const units = await db.select({ id: unitsTable.id }).from(unitsTable)
        .where(inArray(unitsTable.propertyId, propIds));
      unitIds = units.map(u => u.id);
    }
  }

  const baseCondition = unitIds.length > 0 ? inArray(housekeepingTasksTable.unitId, unitIds) : undefined;

  const allTasks = await db.select({
    status: housekeepingTasksTable.status,
    dueDate: housekeepingTasksTable.dueDate,
  }).from(housekeepingTasksTable)
    .where(baseCondition);

  const today = new Date().toISOString().split("T")[0];

  const stats = {
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
  };

  res.json(stats);
});

router.get("/tasks", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { unitId, status, date } = req.query;

  let unitIds: number[] = [];
  if (unitId) {
    unitIds = [parseInt(unitId as string)];
  } else if (user.organizationId) {
    const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    const propIds = props.map(p => p.id);
    if (propIds.length > 0) {
      const units = await db.select({ id: unitsTable.id }).from(unitsTable)
        .where(inArray(unitsTable.propertyId, propIds));
      unitIds = units.map(u => u.id);
    }
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
  const { unitId, assignedToId, title, description, taskType, priority, dueDate, checklist, estimatedMinutes, notes } = req.body;
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
  const taskId = parseInt(req.params.taskId);
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
  if (!task) {
    res.status(404).json({ error: "Not Found", message: "Task not found" });
    return;
  }
  const result = await fetchTaskWithJoins(taskId);
  res.json(result || task);
});

router.post("/tasks/:taskId/start", requireAuth, async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const [task] = await db.update(housekeepingTasksTable).set({
    status: "in_progress",
    startTime: new Date(),
    updatedAt: new Date(),
  }).where(eq(housekeepingTasksTable.id, taskId)).returning();
  if (!task) {
    res.status(404).json({ error: "Not Found", message: "Task not found" });
    return;
  }
  const result = await fetchTaskWithJoins(taskId);
  res.json(result || task);
});

router.post("/tasks/:taskId/complete", requireAuth, async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const { notes } = req.body || {};
  const [task] = await db.update(housekeepingTasksTable).set({
    status: "completed",
    endTime: new Date(),
    ...(notes !== undefined && { notes }),
    updatedAt: new Date(),
  }).where(eq(housekeepingTasksTable.id, taskId)).returning();
  if (!task) {
    res.status(404).json({ error: "Not Found", message: "Task not found" });
    return;
  }
  const result = await fetchTaskWithJoins(taskId);
  res.json(result || task);
});

router.post("/tasks/:taskId/verify", requireAuth, async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const user = (req as any).user;
  const { verificationNotes } = req.body || {};
  const [task] = await db.update(housekeepingTasksTable).set({
    status: "verified",
    verifiedById: user.id,
    verifiedAt: new Date(),
    ...(verificationNotes !== undefined && { verificationNotes }),
    updatedAt: new Date(),
  }).where(eq(housekeepingTasksTable.id, taskId)).returning();
  if (!task) {
    res.status(404).json({ error: "Not Found", message: "Task not found" });
    return;
  }
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
  const { unitId, housekeepingStatus } = req.body;
  const [unit] = await db.update(unitsTable).set({ housekeepingStatus, updatedAt: new Date() })
    .where(eq(unitsTable.id, unitId)).returning();
  if (!unit) {
    res.status(404).json({ error: "Not Found", message: "Unit not found" });
    return;
  }
  const [prop] = await db.select({ name: propertiesTable.name }).from(propertiesTable)
    .where(eq(propertiesTable.id, unit.propertyId)).limit(1);
  res.json({ unitId: unit.id, unitName: unit.name, housekeepingStatus: unit.housekeepingStatus, propertyName: prop?.name || null });
});

export default router;
