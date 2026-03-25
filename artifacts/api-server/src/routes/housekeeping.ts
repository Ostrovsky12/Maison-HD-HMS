import { Router } from "express";
import { db } from "@workspace/db";
import { housekeepingTasksTable, unitsTable, usersTable, propertiesTable } from "@workspace/db/schema";
import { eq, and, inArray, gte, lte } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

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
    status: housekeepingTasksTable.status,
    priority: housekeepingTasksTable.priority,
    dueDate: housekeepingTasksTable.dueDate,
    checklist: housekeepingTasksTable.checklist,
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
  const { unitId, assignedToId, title, description, priority, dueDate, checklist } = req.body;
  const [task] = await db.insert(housekeepingTasksTable).values({
    unitId,
    assignedToId,
    title,
    description,
    priority: priority || "medium",
    dueDate,
    checklist: checklist || [],
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
  const { assignedToId, title, description, status, priority, dueDate, checklist } = req.body;
  const [task] = await db.update(housekeepingTasksTable).set({
    ...(assignedToId !== undefined && { assignedToId }),
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(status !== undefined && { status }),
    ...(priority !== undefined && { priority }),
    ...(dueDate !== undefined && { dueDate }),
    ...(checklist !== undefined && { checklist }),
    updatedAt: new Date(),
  }).where(eq(housekeepingTasksTable.id, taskId)).returning();
  if (!task) {
    res.status(404).json({ error: "Not Found", message: "Task not found" });
    return;
  }
  const [unit] = await db.select({ name: unitsTable.name }).from(unitsTable).where(eq(unitsTable.id, task.unitId)).limit(1);
  res.json({ ...task, unitName: unit?.name || null, assignedToName: null });
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
