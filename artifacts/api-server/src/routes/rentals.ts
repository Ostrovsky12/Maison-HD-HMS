import { Router } from "express";
import { db } from "@workspace/db";
import {
  rentalContractsTable, rentalPaymentsTable, rentalRequestsTable, unitsTable, propertiesTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;

const MONTHS_UA = ["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];

async function seedDemoRentals(orgId: number) {
  const ex = await db.select({ id: rentalContractsTable.id })
    .from(rentalContractsTable).where(eq(rentalContractsTable.organizationId, orgId)).limit(1);
  if (ex.length > 0) return;

  // Get unit IDs belonging to this org
  const units = await db.select({ id: unitsTable.id, name: unitsTable.name })
    .from(unitsTable)
    .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
    .where(eq(propertiesTable.organizationId, orgId))
    .limit(8);
  if (units.length < 3) return;

  // Use org-specific contract numbers to avoid UNIQUE constraint conflicts
  const prefix = `РЕН-${orgId}`;
  const contracts = await db.insert(rentalContractsTable).values([
    {
      organizationId: orgId, unitId: units[0].id,
      tenantName: "Петренко Михайло Вікторович",
      tenantEmail: "petro.mv@gmail.com", tenantPhone: "+380671234567",
      tenantPassport: "АА123456", startDate: "2026-01-01", endDate: "2026-12-31",
      monthlyRate: "8500", depositAmount: "17000", depositPaid: true,
      status: "active" as any, contractNumber: `${prefix}-2026-001`,
      notes: "Довгострокова оренда котеджу",
    },
    {
      organizationId: orgId, unitId: units[1].id,
      tenantName: "Коваленко Олена Степанівна",
      tenantEmail: "kovalenko.o@ukr.net", tenantPhone: "+380502345678",
      startDate: "2026-02-01", endDate: "2026-07-31",
      monthlyRate: "6000", depositAmount: "12000", depositPaid: true,
      status: "active" as any, contractNumber: `${prefix}-2026-002`,
    },
    {
      organizationId: orgId, unitId: units[2].id,
      tenantName: "Іваненко Тарас Олексійович",
      tenantEmail: "taras.i@gmail.com", tenantPhone: "+380633456789",
      startDate: "2026-05-01", endDate: null,
      monthlyRate: "9200", depositAmount: "18400", depositPaid: false,
      status: "upcoming" as any, contractNumber: `${prefix}-2026-003`,
      notes: "Безстроковий договір",
    },
    {
      organizationId: orgId, unitId: units[3]?.id || units[0].id,
      tenantName: "Бондаренко Наталія Іванівна",
      tenantEmail: "bondar.n@yahoo.com", tenantPhone: "+380504567890",
      startDate: "2025-06-01", endDate: "2026-03-31",
      monthlyRate: "7500", depositAmount: "15000", depositPaid: true,
      status: "ended" as any, contractNumber: `${prefix}-2025-008`,
    },
  ]).returning();

  // Seed payments for active contracts
  const today = new Date();
  const paymentRows: any[] = [];
  for (const c of contracts.slice(0, 2)) {
    const rate = parseFloat(String(c.monthlyRate));
    const start = new Date(c.startDate);
    for (let m = 0; m < 6; m++) {
      const mo = new Date(start.getFullYear(), start.getMonth() + m, 1);
      if (mo > today) break;
      const isPaid = m < 3;
      const isOverdue = !isPaid && mo < new Date(today.getFullYear(), today.getMonth(), 1);
      paymentRows.push({
        organizationId: orgId, contractId: c.id,
        periodYear: mo.getFullYear(), periodMonth: mo.getMonth() + 1,
        amount: String(rate),
        status: isPaid ? "paid" : isOverdue ? "overdue" : "pending",
        dueDate: new Date(mo.getFullYear(), mo.getMonth(), 5).toISOString().slice(0, 10),
        paidDate: isPaid ? new Date(mo.getFullYear(), mo.getMonth(), 3).toISOString().slice(0, 10) : null,
        paymentMethod: isPaid ? (Math.random() > 0.5 ? "bank_transfer" : "cash") : null,
      });
    }
  }
  if (paymentRows.length > 0) await db.insert(rentalPaymentsTable).values(paymentRows);

  // Seed maintenance requests
  await db.insert(rentalRequestsTable).values([
    { organizationId: orgId, contractId: contracts[0].id, title: "Несправний змішувач у ванній", description: "Протікає гаряча вода", priority: "high", status: "open" },
    { organizationId: orgId, contractId: contracts[0].id, title: "Заміна лампочки на кухні", description: "LED лампа перегоріла", priority: "low", status: "resolved" },
    { organizationId: orgId, contractId: contracts[1].id, title: "Проблема з wi-fi сигналом", description: "Слабкий сигнал у спальні", priority: "medium", status: "in_progress" },
    { organizationId: orgId, contractId: contracts[1].id, title: "Скрипить підлога", description: "Паркет у вітальні скрипить", priority: "low", status: "open" },
  ]);
}

// ─── GET /stats ───────────────────────────────────────────────────────────────
router.get("/stats", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemoRentals(orgId);
    const [contracts, payments, requests] = await Promise.all([
      db.select({ id: rentalContractsTable.id, status: rentalContractsTable.status, monthlyRate: rentalContractsTable.monthlyRate })
        .from(rentalContractsTable).where(eq(rentalContractsTable.organizationId, orgId)),
      db.select({ id: rentalPaymentsTable.id, status: rentalPaymentsTable.status, amount: rentalPaymentsTable.amount })
        .from(rentalPaymentsTable).where(eq(rentalPaymentsTable.organizationId, orgId)),
      db.select({ id: rentalRequestsTable.id, status: rentalRequestsTable.status, priority: rentalRequestsTable.priority })
        .from(rentalRequestsTable).where(eq(rentalRequestsTable.organizationId, orgId)),
    ]);
    const active = contracts.filter(c => c.status === "active");
    const monthlyRevenue = active.reduce((s, c) => s + parseFloat(String(c.monthlyRate || 0)), 0);
    res.json({
      totalContracts: contracts.length,
      activeContracts: active.length,
      upcomingContracts: contracts.filter(c => c.status === "upcoming").length,
      monthlyRevenue,
      overduePayments: payments.filter(p => p.status === "overdue").length,
      pendingPayments: payments.filter(p => p.status === "pending").length,
      openRequests: requests.filter(r => r.status === "open").length,
      urgentRequests: requests.filter(r => r.priority === "high" && r.status !== "resolved").length,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /contracts ───────────────────────────────────────────────────────────
router.get("/contracts", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemoRentals(orgId);
    const contracts = await db.select({
      id: rentalContractsTable.id,
      contractNumber: rentalContractsTable.contractNumber,
      tenantName: rentalContractsTable.tenantName,
      tenantEmail: rentalContractsTable.tenantEmail,
      tenantPhone: rentalContractsTable.tenantPhone,
      startDate: rentalContractsTable.startDate,
      endDate: rentalContractsTable.endDate,
      monthlyRate: rentalContractsTable.monthlyRate,
      depositAmount: rentalContractsTable.depositAmount,
      depositPaid: rentalContractsTable.depositPaid,
      status: rentalContractsTable.status,
      notes: rentalContractsTable.notes,
      unitName: unitsTable.name,
      unitCategory: unitsTable.category,
    }).from(rentalContractsTable)
      .innerJoin(unitsTable, eq(rentalContractsTable.unitId, unitsTable.id))
      .where(eq(rentalContractsTable.organizationId, orgId))
      .orderBy(desc(rentalContractsTable.createdAt));
    res.json({ contracts });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POST /contracts ──────────────────────────────────────────────────────────
router.post("/contracts", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { unitId, tenantName, tenantEmail, tenantPhone, tenantPassport, startDate, endDate, monthlyRate, depositAmount, notes } = req.body;
    const num = `РЕН-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900 + 100)).padStart(3, "0")}`;
    const [contract] = await db.insert(rentalContractsTable).values({
      organizationId: orgId, unitId: parseInt(unitId),
      tenantName, tenantEmail, tenantPhone, tenantPassport,
      startDate, endDate: endDate || null,
      monthlyRate: String(monthlyRate), depositAmount: String(depositAmount || 0),
      status: new Date(startDate) <= new Date() ? "active" : "upcoming" as any,
      notes, contractNumber: num,
    }).returning();
    res.json({ contract });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /contracts/:id ─────────────────────────────────────────────────────
router.patch("/contracts/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const [c] = await db.update(rentalContractsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(rentalContractsTable.id, parseInt(req.params.id)), eq(rentalContractsTable.organizationId, orgId)))
      .returning();
    res.json({ contract: c });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /payments — all payments for org ────────────────────────────────────
router.get("/payments", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { contractId } = req.query;
    const cond: any[] = [eq(rentalPaymentsTable.organizationId, orgId)];
    if (contractId) cond.push(eq(rentalPaymentsTable.contractId, parseInt(contractId as string)));
    const payments = await db.select({
      id: rentalPaymentsTable.id,
      contractId: rentalPaymentsTable.contractId,
      periodYear: rentalPaymentsTable.periodYear,
      periodMonth: rentalPaymentsTable.periodMonth,
      amount: rentalPaymentsTable.amount,
      status: rentalPaymentsTable.status,
      dueDate: rentalPaymentsTable.dueDate,
      paidDate: rentalPaymentsTable.paidDate,
      paymentMethod: rentalPaymentsTable.paymentMethod,
      tenantName: rentalContractsTable.tenantName,
      unitName: unitsTable.name,
    }).from(rentalPaymentsTable)
      .innerJoin(rentalContractsTable, eq(rentalPaymentsTable.contractId, rentalContractsTable.id))
      .innerJoin(unitsTable, eq(rentalContractsTable.unitId, unitsTable.id))
      .where(and(...cond))
      .orderBy(desc(rentalPaymentsTable.periodYear), desc(rentalPaymentsTable.periodMonth));
    res.json({ payments, monthsUA: MONTHS_UA });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /payments/:id ──────────────────────────────────────────────────────
router.patch("/payments/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const [p] = await db.update(rentalPaymentsTable)
      .set(req.body)
      .where(and(eq(rentalPaymentsTable.id, parseInt(req.params.id)), eq(rentalPaymentsTable.organizationId, orgId)))
      .returning();
    res.json({ payment: p });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /requests ────────────────────────────────────────────────────────────
router.get("/requests", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const reqs = await db.select({
      id: rentalRequestsTable.id,
      contractId: rentalRequestsTable.contractId,
      title: rentalRequestsTable.title,
      description: rentalRequestsTable.description,
      priority: rentalRequestsTable.priority,
      status: rentalRequestsTable.status,
      createdAt: rentalRequestsTable.createdAt,
      resolvedAt: rentalRequestsTable.resolvedAt,
      tenantName: rentalContractsTable.tenantName,
      unitName: unitsTable.name,
    }).from(rentalRequestsTable)
      .innerJoin(rentalContractsTable, eq(rentalRequestsTable.contractId, rentalContractsTable.id))
      .innerJoin(unitsTable, eq(rentalContractsTable.unitId, unitsTable.id))
      .where(eq(rentalRequestsTable.organizationId, orgId))
      .orderBy(desc(rentalRequestsTable.createdAt));
    res.json({ requests: reqs });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /requests/:id ──────────────────────────────────────────────────────
router.patch("/requests/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const updates: any = { ...req.body };
    if (req.body.status === "resolved") updates.resolvedAt = new Date();
    const [r] = await db.update(rentalRequestsTable)
      .set(updates)
      .where(and(eq(rentalRequestsTable.id, parseInt(req.params.id)), eq(rentalRequestsTable.organizationId, orgId)))
      .returning();
    res.json({ request: r });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
