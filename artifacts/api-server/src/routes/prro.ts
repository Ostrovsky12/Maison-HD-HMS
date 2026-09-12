import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db, fiscalDocumentsTable, fiscalEventsTable, legalEntitiesTable, prroRegistersTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { decideFiscalization, type FiscalPolicyInput } from "../services/prro-policy.js";

const router: IRouter = Router();
const orgId = (req: any): number | undefined => req.user?.organizationId;
const userId = (req: any): number | undefined => req.user?.userId;

const inSet = (value: unknown, values: readonly string[]): value is string =>
  typeof value === "string" && values.includes(value);
const clean = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined;
const positiveInt = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

function parsePolicy(body: any): FiscalPolicyInput | null {
  if (!body || !inSet(body.itemKind, ["goods", "service", "mixed"]) ||
      !inSet(body.paymentChannel, ["cash", "pos_card", "online_card", "iban_transfer", "remote_banking", "money_transfer_service"])) return null;
  if (body.exemptionAuthority !== undefined &&
      !inSet(body.exemptionAuthority, ["individual_tax_consultation", "statutory"])) return null;
  return {
    itemKind: body.itemKind as FiscalPolicyInput["itemKind"],
    paymentChannel: body.paymentChannel as FiscalPolicyInput["paymentChannel"],
    exclusivelyRemoteServicePayments: body.exclusivelyRemoteServicePayments === true,
    exemptionAuthority: body.exemptionAuthority,
    exemptionReference: clean(body.exemptionReference, 500),
  };
}

router.post("/classify", requireAuth, (req, res): void => {
  const parsed = parsePolicy(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Некоректні параметри фіскальної політики" });
    return;
  }
  res.json(decideFiscalization(parsed));
});

router.get("/registers", requireAuth, async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  if (!organizationId) {
    res.status(403).json({ error: "No organization" });
    return;
  }
  const registers = await db.select().from(prroRegistersTable)
    .where(eq(prroRegistersTable.organizationId, organizationId))
    .orderBy(desc(prroRegistersTable.createdAt));
  res.json({ registers });
});

router.post("/registers", requireAuth, async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const legalEntityId = positiveInt(req.body?.legalEntityId);
  const name = clean(req.body?.name, 255);
  const deviceId = clean(req.body?.deviceId, 100);
  if (!organizationId) {
    res.status(403).json({ error: "No organization" });
    return;
  }
  if (!legalEntityId || !name || name.length < 2 || !deviceId || deviceId.length < 3) {
    res.status(400).json({ error: "legalEntityId, name і deviceId обов'язкові" });
    return;
  }
  const [seller] = await db.select({ id: legalEntitiesTable.id }).from(legalEntitiesTable)
    .where(and(eq(legalEntitiesTable.id, legalEntityId), eq(legalEntitiesTable.organizationId, organizationId)));
  if (!seller) {
    res.status(404).json({ error: "Продавця не знайдено" });
    return;
  }
  const [register] = await db.insert(prroRegistersTable).values({
    organizationId,
    legalEntityId,
    name,
    deviceId,
    locationName: clean(req.body?.locationName, 255),
    locationAddress: clean(req.body?.locationAddress, 1000),
  }).returning();
  res.status(201).json({ register });
});

router.get("/documents", requireAuth, async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  if (!organizationId) {
    res.status(403).json({ error: "No organization" });
    return;
  }
  const documents = await db.select().from(fiscalDocumentsTable)
    .where(eq(fiscalDocumentsTable.organizationId, organizationId))
    .orderBy(desc(fiscalDocumentsTable.createdAt))
    .limit(100);
  res.json({ documents });
});

router.post("/documents", requireAuth, async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const policyInput = parsePolicy(req.body?.policy);
  const legalEntityId = positiveInt(req.body?.legalEntityId);
  const registerId = req.body?.registerId === undefined ? undefined : positiveInt(req.body.registerId);
  const totalAmount = Number(req.body?.totalAmount);
  const sourceId = clean(req.body?.sourceId, 100);
  const idempotencyKey = clean(req.body?.idempotencyKey, 160);
  const sourceType = req.body?.sourceType;
  const documentType = req.body?.documentType || "sale";
  const lines = Array.isArray(req.body?.lines) ? req.body.lines.map((line: any) => ({
    name: clean(line?.name, 500),
    quantity: Number(line?.quantity),
    unitPrice: Number(line?.unitPrice),
    taxCode: clean(line?.taxCode, 30),
  })) : [];
  if (!organizationId) {
    res.status(403).json({ error: "No organization" });
    return;
  }
  if (!legalEntityId || !policyInput || !sourceId || !idempotencyKey || idempotencyKey.length < 8 ||
      !inSet(sourceType, ["hotel_folio", "booking", "fb_order", "bar_order", "spa_booking", "minibar", "other"]) ||
      !inSet(documentType, ["sale", "refund", "service_deposit"]) ||
      !Number.isFinite(totalAmount) || totalAmount <= 0 || !lines.length ||
      lines.some((line: any) => !line.name || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
    res.status(400).json({ error: "Некоректний фіскальний документ" });
    return;
  }

  const input = {
    legalEntityId, registerId, sourceType, sourceId, documentType,
    totalAmount, currency: "UAH" as const, idempotencyKey, policy: policyInput, lines,
  };
  const [seller] = await db.select({ id: legalEntitiesTable.id }).from(legalEntitiesTable)
    .where(and(eq(legalEntitiesTable.id, input.legalEntityId), eq(legalEntitiesTable.organizationId, organizationId)));
  if (!seller) {
    res.status(404).json({ error: "Продавця не знайдено" });
    return;
  }
  if (input.registerId) {
    const [register] = await db.select({ id: prroRegistersTable.id }).from(prroRegistersTable)
      .where(and(
        eq(prroRegistersTable.id, input.registerId),
        eq(prroRegistersTable.organizationId, organizationId),
        eq(prroRegistersTable.legalEntityId, input.legalEntityId),
      ));
    if (!register) {
      res.status(400).json({ error: "Каса не належить вибраному продавцю" });
      return;
    }
  }

  const policy = decideFiscalization(input.policy);
  const snapshot = { ...input, policy };
  const contentHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

  const existing = await db.select().from(fiscalDocumentsTable).where(and(
    eq(fiscalDocumentsTable.organizationId, organizationId),
    eq(fiscalDocumentsTable.idempotencyKey, input.idempotencyKey),
  ));
  if (existing[0]) {
    if (existing[0].contentHash !== contentHash) {
      res.status(409).json({ error: "Цей ключ ідемпотентності вже використано для іншого документа" });
      return;
    }
    res.status(200).json({ document: existing[0], replayed: true });
    return;
  }

  const [previous] = await db.select({ contentHash: fiscalDocumentsTable.contentHash }).from(fiscalDocumentsTable)
    .where(and(eq(fiscalDocumentsTable.organizationId, organizationId), eq(fiscalDocumentsTable.legalEntityId, input.legalEntityId)))
    .orderBy(desc(fiscalDocumentsTable.createdAt)).limit(1);

  const [document] = await db.transaction(async tx => {
    const [created] = await tx.insert(fiscalDocumentsTable).values({
      organizationId,
      legalEntityId: input.legalEntityId,
      registerId: input.registerId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      documentType: input.documentType,
      paymentChannel: input.policy.paymentChannel,
      policyDecision: policy.decision,
      policyCode: policy.code,
      policyReason: policy.reason,
      policyVersion: policy.version,
      status: policy.decision === "exempt" ? "exempt" : policy.decision === "manual_review" ? "review" : "draft",
      currency: input.currency,
      totalAmount: input.totalAmount.toFixed(2),
      idempotencyKey: input.idempotencyKey,
      contentHash,
      previousHash: previous?.contentHash,
      payloadSnapshot: snapshot,
      policyEvidence: {
        authority: input.policy.exemptionAuthority,
        reference: input.policy.exemptionReference,
      },
      createdBy: userId(req),
    }).returning();
    await tx.insert(fiscalEventsTable).values({
      organizationId,
      fiscalDocumentId: created.id,
      eventType: "document_created",
      eventStatus: created.status,
      requestId: req.id ? String(req.id) : undefined,
      payload: { policy },
    });
    return [created];
  });

  res.status(201).json({ document, replayed: false });
});

export default router;