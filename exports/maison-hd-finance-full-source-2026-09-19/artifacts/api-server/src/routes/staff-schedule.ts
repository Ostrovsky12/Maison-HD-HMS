import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { staffShiftsTable, usersTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

const router = Router();
const getOrgId = (req: any): number => req.user?.organizationId;

// ── GET /staff — list staff members for org ───────────────────────────────────
router.get("/staff", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const staff = await db
      .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, email: usersTable.email })
      .from(usersTable)
      .where(and(eq(usersTable.organizationId, orgId), eq(usersTable.isActive, true)));
    res.json(staff);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /shifts?from=&to= ─────────────────────────────────────────────────────
router.get("/shifts", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { from, to, department, userId } = req.query as any;
  try {
    const conditions: any[] = [eq(staffShiftsTable.organizationId, orgId)];
    if (from) conditions.push(gte(staffShiftsTable.shiftDate, from));
    if (to) conditions.push(lte(staffShiftsTable.shiftDate, to));
    if (department) conditions.push(eq(staffShiftsTable.department, department));
    if (userId) conditions.push(eq(staffShiftsTable.userId, parseInt(userId)));

    const shifts = await db
      .select({
        id: staffShiftsTable.id,
        userId: staffShiftsTable.userId,
        shiftDate: staffShiftsTable.shiftDate,
        startTime: staffShiftsTable.startTime,
        endTime: staffShiftsTable.endTime,
        department: staffShiftsTable.department,
        status: staffShiftsTable.status,
        notes: staffShiftsTable.notes,
        breakMinutes: staffShiftsTable.breakMinutes,
        isOvertime: staffShiftsTable.isOvertime,
        staffName: usersTable.name,
        staffRole: usersTable.role,
        staffEmail: usersTable.email,
      })
      .from(staffShiftsTable)
      .innerJoin(usersTable, eq(staffShiftsTable.userId, usersTable.id))
      .where(and(...conditions))
      .orderBy(staffShiftsTable.shiftDate, staffShiftsTable.startTime);

    res.json(shifts);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /shifts — create shift ───────────────────────────────────────────────
router.post("/shifts", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { userId, shiftDate, startTime, endTime, department, notes, breakMinutes, isOvertime } = req.body;
  if (!userId || !shiftDate || !startTime || !endTime) {
    return res.status(400).json({ error: "userId, shiftDate, startTime, endTime required" });
  }
  try {
    const [shift] = await db.insert(staffShiftsTable).values({
      organizationId: orgId,
      userId: parseInt(userId),
      shiftDate,
      startTime,
      endTime,
      department: department || "reception",
      notes,
      breakMinutes: breakMinutes || 30,
      isOvertime: isOvertime || false,
      createdBy: req.user?.id,
    }).returning();
    res.status(201).json(shift);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /shifts/:id — update shift ─────────────────────────────────────────
router.patch("/shifts/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const { userId, shiftDate, startTime, endTime, department, status, notes, breakMinutes, isOvertime } = req.body;
  try {
    const upd: any = { updatedAt: new Date() };
    if (userId !== undefined) upd.userId = parseInt(userId);
    if (shiftDate !== undefined) upd.shiftDate = shiftDate;
    if (startTime !== undefined) upd.startTime = startTime;
    if (endTime !== undefined) upd.endTime = endTime;
    if (department !== undefined) upd.department = department;
    if (status !== undefined) upd.status = status;
    if (notes !== undefined) upd.notes = notes;
    if (breakMinutes !== undefined) upd.breakMinutes = breakMinutes;
    if (isOvertime !== undefined) upd.isOvertime = isOvertime;

    const [shift] = await db.update(staffShiftsTable)
      .set(upd)
      .where(and(eq(staffShiftsTable.id, id), eq(staffShiftsTable.organizationId, orgId)))
      .returning();
    if (!shift) return res.status(404).json({ error: "Shift not found" });
    res.json(shift);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /shifts/:id ────────────────────────────────────────────────────────
router.delete("/shifts/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  try {
    await db.delete(staffShiftsTable)
      .where(and(eq(staffShiftsTable.id, id), eq(staffShiftsTable.organizationId, orgId)));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /stats?from=&to= — aggregate stats ────────────────────────────────────
router.get("/stats", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { from, to } = req.query as any;
  try {
    const conditions: any[] = [eq(staffShiftsTable.organizationId, orgId)];
    if (from) conditions.push(gte(staffShiftsTable.shiftDate, from));
    if (to) conditions.push(lte(staffShiftsTable.shiftDate, to));

    const shifts = await db.select().from(staffShiftsTable).where(and(...conditions));
    const byDept: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalShifts = 0;
    shifts.forEach(s => {
      byDept[s.department] = (byDept[s.department] || 0) + 1;
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      totalShifts++;
    });
    res.json({ totalShifts, byDept, byStatus });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
