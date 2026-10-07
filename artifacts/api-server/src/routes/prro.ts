import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import iconv from "iconv-lite";
import {
  db, fiscalDocumentsTable, fiscalEventsTable, legalEntitiesTable, prroRegistersTable,
  prroShiftsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../lib/auth.js";
import { logger } from "../lib/logger.js";
import { DpsPrroError, dpsPrroClient } from "../services/dps-prro.js";
import { reclassificationError, summarizeRegisterReports } from "../services/prro-accountant.js";
import { decideFiscalization, type FiscalPolicyInput } from "../services/prro-policy.js";
import { prroSigner } from "../services/prro-signer.js";
import { buildPrroXml, type PrroDocumentKind, type PrroXmlLine } from "../services/prro-xml.js";
import { validateAgainstOfficialDpsXsd } from "../services/prro-xsd.js";

const router: IRouter = Router();
const orgId = (req: any): number | undefined => req.user?.organizationId;
const userId = (req: any): number | undefined => req.user?.userId;
const clean = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined;
const positiveInt = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
const inSet = (value: unknown, values: readonly string[]): value is string =>
  typeof value === "string" && values.includes(value);
const canonicalXmlHash = (xml: string): string => createHash("sha256")
  .update(xml.replace(/^\uFEFF/, "").replace(/>\s+</g, "><").trim())
  .digest("hex");

router.get("/readiness", requireAuth, requireRole("super_admin", "owner", "admin", "manager"), (_req, res): void => {
  const missing = [
    !process.env.PRRO_SIGNER_URL && "PRRO_SIGNER_URL",
    !process.env.PRRO_SIGNER_AUTH_TOKEN && "PRRO_SIGNER_AUTH_TOKEN",
  ].filter(Boolean);
  res.status(missing.length ? 503 : 200).json({
    ready: missing.length === 0,
    dpsEndpoint: process.env.DPS_PRRO_GRPC_URL || "cabinet.tax.gov.ua:9443",
    schemaProfile: "DPS SZZD RRO 2.1.7",
    signerAuthenticated: missing.length === 0,
    ...(missing.length ? { missing } : {}),
  });
});

function parsePolicy(body: any): FiscalPolicyInput | null {
  if (!body || !inSet(body.itemKind, ["goods", "service", "mixed"]) ||
      !inSet(body.paymentChannel, ["cash", "pos_card", "online_card", "iban_transfer", "remote_banking", "money_transfer_service"])) return null;
  if (body.exemptionAuthority !== undefined &&
      !inSet(body.exemptionAuthority, ["individual_tax_consultation", "statutory"])) return null;
  return {
    itemKind: body.itemKind,
    paymentChannel: body.paymentChannel,
    exclusivelyRemoteServicePayments: body.exclusivelyRemoteServicePayments === true,
    exemptionAuthority: body.exemptionAuthority,
    exemptionReference: clean(body.exemptionReference, 500),
  };
}

async function addEvent(
  organizationId: number,
  documentId: number,
  eventType: string,
  eventStatus: string,
  payload: Record<string, unknown> = {},
  requestId?: string,
) {
  await db.insert(fiscalEventsTable).values({
    organizationId, fiscalDocumentId: documentId, eventType, eventStatus, payload, requestId,
  });
}

async function loadContext(organizationId: number, documentId: number) {
  const [row] = await db.select({
    document: fiscalDocumentsTable,
    register: prroRegistersTable,
    seller: legalEntitiesTable,
    shift: prroShiftsTable,
  }).from(fiscalDocumentsTable)
    .innerJoin(prroRegistersTable, and(
      eq(prroRegistersTable.id, fiscalDocumentsTable.registerId),
      eq(prroRegistersTable.organizationId, organizationId),
      eq(prroRegistersTable.legalEntityId, fiscalDocumentsTable.legalEntityId),
    ))
    .innerJoin(legalEntitiesTable, eq(legalEntitiesTable.id, fiscalDocumentsTable.legalEntityId))
    .leftJoin(prroShiftsTable, and(
      eq(prroShiftsTable.id, fiscalDocumentsTable.shiftId),
      eq(prroShiftsTable.organizationId, organizationId),
      eq(prroShiftsTable.legalEntityId, fiscalDocumentsTable.legalEntityId),
      eq(prroShiftsTable.registerId, fiscalDocumentsTable.registerId),
    ))
    .where(and(
      eq(fiscalDocumentsTable.id, documentId),
      eq(fiscalDocumentsTable.organizationId, organizationId),
      eq(prroRegistersTable.organizationId, organizationId),
      eq(legalEntitiesTable.organizationId, organizationId),
      eq(legalEntitiesTable.isActive, true),
      eq(prroRegistersTable.isActive, true),
      sql`${prroRegistersTable.status} in ('registered', 'active')`,
    ));
  return row;
}

function documentKind(type: string): PrroDocumentKind {
  if (type === "service_deposit") return "sale";
  if (inSet(type, ["open_shift", "sale", "refund", "x_report", "z_report"])) return type as PrroDocumentKind;
  throw new Error(`Unsupported PRRO document type: ${type}`);
}

export async function submitDocument(organizationId: number, documentId: number, requestId?: string) {
  const context = await loadContext(organizationId, documentId);
  if (!context) throw new Error("Фіскальний документ не знайдено");
  const { document, register, seller, shift } = context;
  if (document.status === "fiscalized" || document.status === "completed") return document;
  if (!seller.isActive) throw new Error("Продавець неактивний");
  if (!register.isActive || !["registered", "active"].includes(register.status)) {
    throw new Error("Каса неактивна або не зареєстрована");
  }
  if (!shift || shift.legalEntityId !== document.legalEntityId ||
      shift.registerId !== register.id || !shift.signerKeyId) {
    throw new Error("Зміна не належить продавцю або не має scoped КЕП");
  }
  if (document.documentType !== "open_shift" && shift.status !== "open") {
    throw new Error("Для фіскального документа потрібна відкрита зміна");
  }
  if (!register.fiscalNumber) throw new Error("Для каси не задано фіскальний номер ДПС");
  if (!shift?.signerKeyId) throw new Error("Для зміни не задано ідентифікатор КЕП");
  if (!seller.edrpou) throw new Error("Для продавця не задано податковий номер");

  const attempt = document.attemptCount + 1;
  const [claimed] = await db.update(fiscalDocumentsTable).set({
    status: "signing", attemptCount: attempt, lastError: null, nextRetryAt: null, updatedAt: new Date(),
  }).where(and(
    eq(fiscalDocumentsTable.id, document.id),
    eq(fiscalDocumentsTable.organizationId, organizationId),
    sql`${fiscalDocumentsTable.status} in ('draft', 'failed', 'failed_safe_to_retry', 'pending_retry')`,
  )).returning({ id: fiscalDocumentsTable.id });
  if (!claimed) {
    const [current] = await db.select().from(fiscalDocumentsTable).where(and(
      eq(fiscalDocumentsTable.id, document.id),
      eq(fiscalDocumentsTable.organizationId, organizationId),
    ));
    if (current && ["fiscalized", "completed"].includes(current.status)) return current;
    throw new Error("Документ уже обробляється іншим процесом");
  }
  await addEvent(organizationId, document.id, attempt > 1 ? "retry_started" : "submission_started", "signing", { attempt }, requestId);

  try {
    const snapshot = document.payloadSnapshot as any;
    const kind = documentKind(document.documentType);
    const lines: PrroXmlLine[] = Array.isArray(snapshot.lines) ? snapshot.lines : [];
    const xml = buildPrroXml({
      kind,
      fiscalNumber: register.fiscalNumber,
      localNumber: document.localNumber ?? 0,
      occurredAt: document.createdAt,
      sellerTaxId: seller.edrpou,
      sellerName: seller.name,
      locationName: register.locationName || register.name,
      locationAddress: register.locationAddress || seller.address || "-",
      deviceId: register.deviceId,
      cashierName: snapshot.cashierName || "Касир",
      totalAmount: Number(document.totalAmount),
      paymentChannel: document.paymentChannel,
      lines,
      previousHash: document.previousHash,
    });
    await validateAgainstOfficialDpsXsd(xml, kind);
    await addEvent(organizationId, document.id, "xml_validated", "valid", {
      profile: "DPS SZZD RRO 2.1.7",
      sha256: createHash("sha256").update(xml).digest("hex"),
    }, requestId);
    const xmlBytes = iconv.encode(xml, "windows-1251");
    const signed = await prroSigner.sign(shift.signerKeyId, xmlBytes, {
      organizationId,
      legalEntityId: document.legalEntityId,
      registerId: register.id,
      userId: document.createdBy ?? undefined,
    });
    await addEvent(organizationId, document.id, "document_signed", "signed", {
      signerKeyId: shift.signerKeyId,
      signatureSha256: createHash("sha256").update(signed).digest("hex"),
    }, requestId);

    if (kind === "x_report") {
      const [updated] = await db.update(fiscalDocumentsTable).set({
        status: "completed", xmlPayload: xml, signedPayload: signed.toString("base64"),
        submittedAt: new Date(), fiscalizedAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(fiscalDocumentsTable.id, document.id), eq(fiscalDocumentsTable.organizationId, organizationId))).returning();
      await addEvent(organizationId, document.id, "x_report_completed", "completed", { attempt }, requestId);
      return updated;
    }

    await db.update(fiscalDocumentsTable).set({
      status: "submitting", xmlPayload: xml, signedPayload: signed.toString("base64"),
      submittedAt: new Date(), updatedAt: new Date(),
    }).where(and(eq(fiscalDocumentsTable.id, document.id), eq(fiscalDocumentsTable.organizationId, organizationId)));
    const result = await dpsPrroClient.sendCheck({
      fiscalNumber: register.fiscalNumber,
      dateTime: document.createdAt,
      signedXml: signed,
      localNumber: document.localNumber ?? 0,
      type: kind === "z_report" ? 2 : kind === "open_shift" ? 3 : 1,
      cancelId: kind === "refund" ? clean(snapshot.originalDpsDocumentId, 100) : undefined,
    });
    const [updated] = await db.transaction(async tx => {
      const [saved] = await tx.update(fiscalDocumentsTable).set({
        status: "fiscalized", fiscalNumber: result.id, dpsDocumentId: result.id,
        dpsSignedId: result.signedId?.toString("base64"),
        dpsSignedData: result.signedData?.toString("base64"),
        dpsResponse: { status: result.status, errorMessage: result.errorMessage },
        fiscalizedAt: new Date(), lastError: null, nextRetryAt: null, updatedAt: new Date(),
      }).where(and(eq(fiscalDocumentsTable.id, document.id), eq(fiscalDocumentsTable.organizationId, organizationId))).returning();
      await tx.insert(fiscalEventsTable).values({
        organizationId, fiscalDocumentId: document.id, eventType: "dps_accepted",
        eventStatus: "fiscalized", requestId,
        payload: { attempt, dpsDocumentId: result.id, dpsStatus: result.status },
      });
      if (kind === "open_shift" && document.shiftId) {
        await tx.update(prroShiftsTable).set({
          status: "open", dpsShiftId: result.id, openedAt: new Date(),
        }).where(and(eq(prroShiftsTable.id, document.shiftId), eq(prroShiftsTable.organizationId, organizationId)));
      }
      if (kind === "z_report" && document.shiftId) {
        await tx.update(prroShiftsTable).set({
          status: "closed", closedAt: new Date(),
        }).where(and(eq(prroShiftsTable.id, document.shiftId), eq(prroShiftsTable.organizationId, organizationId)));
      }
      return [saved];
    });
    return updated;
  } catch (error) {
    const retryable = error instanceof DpsPrroError && error.retryable;
    const outcomeUnknown = error instanceof DpsPrroError &&
      !retryable &&
      (error.status === undefined || error.status > 1 || error.status === -3 || error.status === -4);
    const message = error instanceof Error ? error.message : "Невідома помилка ДПС";
    const safeBeforeDps = !(error instanceof DpsPrroError);
    const canRetry = retryable && attempt < 5;
    const nextRetryAt = canRetry ? new Date(Date.now() + Math.min(300_000, 5_000 * 2 ** (attempt - 1))) : null;
    await db.update(fiscalDocumentsTable).set({
      status: canRetry ? "pending_retry" : outcomeUnknown ? "outcome_unknown" : safeBeforeDps ? "failed_safe_to_retry" : "failed",
      lastError: message,
      nextRetryAt,
      dpsResponse: error instanceof DpsPrroError ? { status: error.status, retryable } : { retryable: false },
      updatedAt: new Date(),
    }).where(and(eq(fiscalDocumentsTable.id, document.id), eq(fiscalDocumentsTable.organizationId, organizationId)));
    await addEvent(organizationId, document.id, "submission_failed", canRetry ? "pending_retry" : outcomeUnknown ? "outcome_unknown" : safeBeforeDps ? "failed_safe_to_retry" : "failed", {
      attempt, retryable, outcomeUnknown, safeBeforeDps, nextRetryAt: nextRetryAt?.toISOString(), error: message,
      dpsStatus: error instanceof DpsPrroError ? error.status : undefined,
    }, requestId);
    throw error;
  }
}

async function createSystemDocument(input: {
  organizationId: number;
  legalEntityId: number;
  registerId: number;
  shiftId: number;
  documentType: PrroDocumentKind;
  sourceId: string;
  paymentChannel?: string;
  totalAmount?: number;
  lines?: PrroXmlLine[];
  createdBy?: number;
  requestId?: string;
}) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(${input.organizationId}, ${input.registerId})`);
    const [unfinished] = await tx.select({ id: fiscalDocumentsTable.id }).from(fiscalDocumentsTable)
      .where(and(
        eq(fiscalDocumentsTable.organizationId, input.organizationId),
        eq(fiscalDocumentsTable.registerId, input.registerId),
        sql`${fiscalDocumentsTable.status} in ('draft', 'signing', 'submitting', 'pending_retry', 'outcome_unknown', 'failed', 'failed_safe_to_retry')`,
        sql`${fiscalDocumentsTable.documentType} <> 'x_report'`,
      )).limit(1);
    if (unfinished) throw new Error("Попередній документ каси ще не має остаточного статусу");
    const [last] = await tx.select({
      localNumber: fiscalDocumentsTable.localNumber,
      contentHash: fiscalDocumentsTable.contentHash,
      xmlPayload: fiscalDocumentsTable.xmlPayload,
    })
      .from(fiscalDocumentsTable)
      .where(and(
        eq(fiscalDocumentsTable.organizationId, input.organizationId),
        eq(fiscalDocumentsTable.registerId, input.registerId),
        eq(fiscalDocumentsTable.shiftId, input.shiftId),
        eq(fiscalDocumentsTable.status, "fiscalized"),
        sql`${fiscalDocumentsTable.documentType} <> 'x_report'`,
      )).orderBy(desc(fiscalDocumentsTable.localNumber)).limit(1);
    const localNumber = input.documentType === "open_shift" ? 0 : (last?.localNumber ?? 0) + 1;
    const snapshot = {
      legalEntityId: input.legalEntityId, registerId: input.registerId, shiftId: input.shiftId,
      sourceType: "prro_operation", sourceId: input.sourceId, documentType: input.documentType,
      paymentChannel: input.paymentChannel ?? "cash", totalAmount: input.totalAmount ?? 0,
      currency: "UAH", lines: input.lines ?? [],
    };
    const contentHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    const [created] = await tx.insert(fiscalDocumentsTable).values({
      organizationId: input.organizationId, legalEntityId: input.legalEntityId,
      registerId: input.registerId, shiftId: input.shiftId,
      sourceType: "prro_operation", sourceId: input.sourceId, documentType: input.documentType,
      paymentChannel: input.paymentChannel ?? "cash",
      policyDecision: "fiscalize", policyCode: "prro_operation",
      policyReason: "Операційний документ ПРРО", policyVersion: "2026-09-12.1",
      status: "draft", currency: "UAH", totalAmount: (input.totalAmount ?? 0).toFixed(2),
      idempotencyKey: `${input.documentType}:${input.registerId}:${input.sourceId}`,
      contentHash,
      previousHash: last?.xmlPayload
        ? createHash("sha256").update(iconv.encode(last.xmlPayload, "windows-1251")).digest("hex")
        : last?.contentHash,
      localNumber, payloadSnapshot: snapshot,
      createdBy: input.createdBy,
    }).returning();
    await tx.insert(fiscalEventsTable).values({
      organizationId: input.organizationId, fiscalDocumentId: created.id,
      eventType: "document_created", eventStatus: "draft", requestId: input.requestId,
      payload: { documentType: input.documentType, localNumber },
    });
    return created;
  });
}

router.post("/classify", requireAuth, (req, res): void => {
  const parsed = parsePolicy(req.body);
  if (!parsed) return void res.status(400).json({ error: "Некоректні параметри фіскальної політики" });
  res.json(decideFiscalization(parsed));
});

router.get("/registers", requireAuth, async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  const registers = await db.select().from(prroRegistersTable)
    .where(eq(prroRegistersTable.organizationId, organizationId)).orderBy(desc(prroRegistersTable.createdAt));
  res.json({ registers });
});

router.get("/accountant/overview", requireAuth, requireRole("super_admin", "owner", "admin", "manager", "accountant"), async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });

  const [entities, registers, shifts, reports] = await Promise.all([
    db.select({
      id: legalEntitiesTable.id,
      name: legalEntitiesTable.name,
      type: legalEntitiesTable.type,
      edrpou: legalEntitiesTable.edrpou,
    }).from(legalEntitiesTable).where(and(
      eq(legalEntitiesTable.organizationId, organizationId),
      eq(legalEntitiesTable.isActive, true),
    )).orderBy(legalEntitiesTable.name),
    db.select().from(prroRegistersTable).where(and(
      eq(prroRegistersTable.organizationId, organizationId),
      eq(prroRegistersTable.isActive, true),
    )).orderBy(prroRegistersTable.name),
    db.select().from(prroShiftsTable).where(and(
      eq(prroShiftsTable.organizationId, organizationId),
      sql`${prroShiftsTable.status} in ('opening', 'open', 'closing')`,
    )).orderBy(desc(prroShiftsTable.createdAt)),
    db.select({
      id: fiscalDocumentsTable.id,
      registerId: fiscalDocumentsTable.registerId,
      shiftId: fiscalDocumentsTable.shiftId,
      documentType: fiscalDocumentsTable.documentType,
      status: fiscalDocumentsTable.status,
      fiscalNumber: fiscalDocumentsTable.fiscalNumber,
      dpsDocumentId: fiscalDocumentsTable.dpsDocumentId,
      totalAmount: fiscalDocumentsTable.totalAmount,
      createdAt: fiscalDocumentsTable.createdAt,
      fiscalizedAt: fiscalDocumentsTable.fiscalizedAt,
    }).from(fiscalDocumentsTable).where(and(
      eq(fiscalDocumentsTable.organizationId, organizationId),
      sql`${fiscalDocumentsTable.documentType} in ('x_report', 'z_report')`,
    )).orderBy(desc(fiscalDocumentsTable.createdAt)).limit(500),
  ]);

  const reportByRegister = summarizeRegisterReports(reports);
  const activeShiftByRegister = new Map(shifts.map(shift => [shift.registerId, shift]));

  res.json({
    legalEntities: entities.map(entity => ({
      ...entity,
      registers: registers.filter(register => register.legalEntityId === entity.id).map(register => ({
        ...register,
        activeShift: activeShiftByRegister.get(register.id) ?? null,
        ...(reportByRegister.get(register.id) ?? {
          lastXReport: null,
          lastZReport: null,
          latestXReportAttempt: null,
          latestZReportAttempt: null,
        }),
      })),
    })),
  });
});

router.get("/accountant/journal", requireAuth, requireRole("super_admin", "owner", "admin", "manager", "accountant"), async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  const decision = typeof req.query.decision === "string" ? req.query.decision : undefined;
  const legalEntityId = positiveInt(req.query.legalEntityId);
  const limit = Math.min(200, positiveInt(req.query.limit) ?? 100);
  if (decision && !inSet(decision, ["fiscalize", "exempt", "manual_review"])) {
    return void res.status(400).json({ error: "Некоректний тип рішення" });
  }
  const conditions = [eq(fiscalDocumentsTable.organizationId, organizationId)];
  if (decision) conditions.push(eq(fiscalDocumentsTable.policyDecision, decision));
  if (legalEntityId) conditions.push(eq(fiscalDocumentsTable.legalEntityId, legalEntityId));
  const rows = await db.select({
    document: fiscalDocumentsTable,
    sellerName: legalEntitiesTable.name,
    registerName: prroRegistersTable.name,
  }).from(fiscalDocumentsTable)
    .innerJoin(legalEntitiesTable, and(
      eq(legalEntitiesTable.id, fiscalDocumentsTable.legalEntityId),
      eq(legalEntitiesTable.organizationId, organizationId),
    ))
    .leftJoin(prroRegistersTable, and(
      eq(prroRegistersTable.id, fiscalDocumentsTable.registerId),
      eq(prroRegistersTable.organizationId, organizationId),
    ))
    .where(and(...conditions)).orderBy(desc(fiscalDocumentsTable.createdAt)).limit(limit);
  res.json({
    documents: rows.map(({ document: { signedPayload, xmlPayload, dpsSignedData, ...document }, sellerName, registerName }) => {
      const evidence = typeof document.policyEvidence === "object" && document.policyEvidence
        ? document.policyEvidence as Record<string, unknown>
        : {};
      return {
        ...document,
        sellerName,
        registerName,
        reviewLegalBasis: evidence.legalBasis ?? null,
        reviewLegalReference: evidence.legalReference ?? null,
        reviewedBy: evidence.confirmedByUserId ?? null,
        reviewedAt: evidence.confirmedAt ?? null,
      };
    }),
  });
});

router.post("/accountant/documents/:documentId/reclassify", requireAuth, requireRole("super_admin", "owner", "admin", "manager", "accountant"), async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const documentId = positiveInt(req.params.documentId);
  const decision = req.body?.decision;
  const legalBasis = clean(req.body?.legalBasis, 2000);
  const legalReference = clean(req.body?.legalReference, 500);
  const reason = clean(req.body?.reason, 1000);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  if (!documentId || !inSet(decision, ["fiscalize", "exempt", "manual_review"]) || !legalBasis || !legalReference || !reason) {
    return void res.status(400).json({ error: "Потрібні рішення, причина та підтверджена правова підстава з посиланням" });
  }

  try {
    const document = await db.transaction(async tx => {
      const [current] = await tx.select().from(fiscalDocumentsTable).where(and(
        eq(fiscalDocumentsTable.id, documentId),
        eq(fiscalDocumentsTable.organizationId, organizationId),
      )).limit(1);
      if (!current) throw new Error("NOT_FOUND");
      const reviewError = reclassificationError(current);
      if (reviewError) throw new Error(reviewError);

      const nextStatus = decision === "fiscalize" ? "draft" : decision === "exempt" ? "exempt" : "review";
      const [updated] = await tx.update(fiscalDocumentsTable).set({
        policyDecision: decision,
        policyCode: "accountant_confirmed",
        policyReason: reason,
        policyEvidence: {
          ...(typeof current.policyEvidence === "object" && current.policyEvidence ? current.policyEvidence : {}),
          legalBasis,
          legalReference,
          confirmedByUserId: userId(req),
          confirmedAt: new Date().toISOString(),
        },
        status: nextStatus,
        updatedAt: new Date(),
      }).where(and(
        eq(fiscalDocumentsTable.id, documentId),
        eq(fiscalDocumentsTable.organizationId, organizationId),
        sql`${fiscalDocumentsTable.status} in ('exempt', 'review')`,
        sql`${fiscalDocumentsTable.fiscalizedAt} is null`,
      )).returning();
      if (!updated) throw new Error("CONCURRENT_CHANGE");
      await tx.insert(fiscalEventsTable).values({
        organizationId,
        fiscalDocumentId: documentId,
        eventType: "accountant_reclassified",
        eventStatus: nextStatus,
        requestId: String(req.id ?? ""),
        payload: {
          previousDecision: current.policyDecision,
          decision,
          reason,
          legalBasis,
          legalReference,
          reviewedBy: userId(req),
        },
      });
      return updated;
    });

    if (decision === "fiscalize") {
      try {
        const fiscalized = await submitDocument(organizationId, documentId, String(req.id ?? ""));
        return void res.json({ document: fiscalized });
      } catch (error) {
        return void res.status(502).json({
          error: error instanceof Error ? error.message : "Помилка ДПС",
          documentId,
        });
      }
    }
    res.json({ document });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return void res.status(404).json({ error: "Документ не знайдено" });
    if (message === "IMMUTABLE") return void res.status(409).json({ error: "Фіскалізований документ незмінний" });
    if (message === "NOT_REVIEWABLE") return void res.status(409).json({ error: "Перегляд доступний лише для exempt або manual_review" });
    if (message === "CONCURRENT_CHANGE") return void res.status(409).json({ error: "Документ уже змінено іншим користувачем" });
    throw error;
  }
});

router.post("/registers", requireAuth, requireRole("super_admin", "owner", "admin", "manager", "accountant"), async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const legalEntityId = positiveInt(req.body?.legalEntityId);
  const name = clean(req.body?.name, 255);
  const deviceId = clean(req.body?.deviceId, 100);
  const fiscalNumber = clean(req.body?.fiscalNumber, 32);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  if (!legalEntityId || !name || name.length < 2 || !deviceId || deviceId.length < 3 || !fiscalNumber) {
    return void res.status(400).json({ error: "legalEntityId, name, deviceId і fiscalNumber обов'язкові" });
  }
  const [seller] = await db.select({ id: legalEntitiesTable.id }).from(legalEntitiesTable)
    .where(and(
      eq(legalEntitiesTable.id, legalEntityId),
      eq(legalEntitiesTable.organizationId, organizationId),
      eq(legalEntitiesTable.isActive, true),
    ));
  if (!seller) return void res.status(404).json({ error: "Продавця не знайдено" });
  const [register] = await db.insert(prroRegistersTable).values({
    organizationId, legalEntityId, name, deviceId, fiscalNumber,
    locationName: clean(req.body?.locationName, 255),
    locationAddress: clean(req.body?.locationAddress, 1000),
    status: "registered",
  }).returning();
  res.status(201).json({ register });
});

router.patch("/registers/:registerId", requireAuth, requireRole("super_admin", "owner", "admin", "manager", "accountant"), async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const registerId = positiveInt(req.params.registerId);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  if (!registerId) return void res.status(400).json({ error: "Некоректна каса" });
  const patch: Record<string, unknown> = {};
  if (req.body?.name !== undefined) {
    const name = clean(req.body.name, 255);
    if (!name || name.length < 2) return void res.status(400).json({ error: "Некоректна назва каси" });
    patch.name = name;
  }
  if (req.body?.deviceId !== undefined) {
    const deviceId = clean(req.body.deviceId, 100);
    if (!deviceId || deviceId.length < 3) return void res.status(400).json({ error: "Некоректний deviceId" });
    patch.deviceId = deviceId;
  }
  if (req.body?.fiscalNumber !== undefined) {
    const fiscalNumber = clean(req.body.fiscalNumber, 32);
    if (!fiscalNumber) return void res.status(400).json({ error: "Некоректний фіскальний номер" });
    patch.fiscalNumber = fiscalNumber;
  }
  if (req.body?.locationName !== undefined) patch.locationName = clean(req.body.locationName, 255) ?? null;
  if (req.body?.locationAddress !== undefined) patch.locationAddress = clean(req.body.locationAddress, 1000) ?? null;
  if (!Object.keys(patch).length) return void res.status(400).json({ error: "Немає змін для збереження" });
  patch.updatedAt = new Date();
  const [register] = await db.update(prroRegistersTable).set(patch).where(and(
    eq(prroRegistersTable.id, registerId),
    eq(prroRegistersTable.organizationId, organizationId),
    eq(prroRegistersTable.isActive, true),
  )).returning();
  if (!register) return void res.status(404).json({ error: "Касу не знайдено" });
  res.json({ register });
});

router.post("/registers/:registerId/shifts/open", requireAuth, requireRole("super_admin", "owner", "admin", "manager", "accountant"), async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const registerId = positiveInt(req.params.registerId);
  const signerKeyId = clean(req.body?.signerKeyId, 255);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  if (!registerId || !signerKeyId) return void res.status(400).json({ error: "signerKeyId обов'язковий" });
  const [register] = await db.select().from(prroRegistersTable).where(and(
    eq(prroRegistersTable.id, registerId), eq(prroRegistersTable.organizationId, organizationId),
    eq(prroRegistersTable.isActive, true),
    sql`${prroRegistersTable.status} in ('registered', 'active')`,
  ));
  if (!register) return void res.status(404).json({ error: "Касу не знайдено" });
  try {
    await prroSigner.authorize(signerKeyId, {
      organizationId,
      legalEntityId: register.legalEntityId,
      registerId,
    });
  } catch (error) {
    return void res.status(403).json({ error: error instanceof Error ? error.message : "КЕП не авторизовано" });
  }
  let shift;
  try {
    shift = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(${organizationId}, ${registerId})`);
      const [active] = await tx.select().from(prroShiftsTable).where(and(
        eq(prroShiftsTable.organizationId, organizationId), eq(prroShiftsTable.registerId, registerId),
        sql`${prroShiftsTable.status} in ('opening', 'open', 'closing')`,
      )).limit(1);
      if (active) throw new Error("ACTIVE_SHIFT");
      const [created] = await tx.insert(prroShiftsTable).values({
        organizationId, legalEntityId: register.legalEntityId, registerId,
        cashierUserId: userId(req), signerKeyId, status: "opening",
      }).returning();
      return created;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ACTIVE_SHIFT") {
      return void res.status(409).json({ error: "Для цієї каси вже є активна зміна" });
    }
    throw error;
  }
  const document = await createSystemDocument({
    organizationId, legalEntityId: register.legalEntityId, registerId, shiftId: shift.id,
    documentType: "open_shift", sourceId: String(shift.id), createdBy: userId(req), requestId: String(req.id ?? ""),
  });
  try {
    const fiscalized = await submitDocument(organizationId, document.id, String(req.id ?? ""));
    res.status(201).json({ shift: { ...shift, status: "open" }, document: fiscalized });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Помилка ДПС", shift, documentId: document.id });
  }
});

router.get("/registers/:registerId/status", requireAuth, async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const registerId = positiveInt(req.params.registerId);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  const [row] = await db.select({ register: prroRegistersTable, shift: prroShiftsTable }).from(prroRegistersTable)
    .leftJoin(prroShiftsTable, and(
      eq(prroShiftsTable.registerId, prroRegistersTable.id),
      sql`${prroShiftsTable.status} in ('opening', 'open', 'closing')`,
    )).where(and(eq(prroRegistersTable.id, registerId!), eq(prroRegistersTable.organizationId, organizationId))).limit(1);
  if (!row?.register.fiscalNumber) return void res.status(404).json({ error: "Зареєстровану касу не знайдено" });
  if (!row.shift?.signerKeyId) return void res.json({ register: row.register, shift: null, dps: null });
  try {
    const signedFiscalNumber = await prroSigner.sign(row.shift.signerKeyId, Buffer.from(row.register.fiscalNumber), {
      organizationId,
      legalEntityId: row.register.legalEntityId,
      registerId: row.register.id,
      userId: userId(req),
    });
    const status = await dpsPrroClient.status(signedFiscalNumber);
    if (status.status !== 1) {
      throw new DpsPrroError(status.errorMessage || `DPS status failed (${status.status})`, status.status, false);
    }
    res.json({ register: row.register, shift: row.shift, dps: status });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Помилка статусу ДПС" });
  }
});

router.get("/documents", requireAuth, async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  const documents = await db.select().from(fiscalDocumentsTable)
    .where(eq(fiscalDocumentsTable.organizationId, organizationId))
    .orderBy(desc(fiscalDocumentsTable.createdAt)).limit(100);
  res.json({ documents: documents.map(({ signedPayload, ...document }) => document) });
});

router.get("/documents/:documentId/events", requireAuth, async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const documentId = positiveInt(req.params.documentId);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  if (!documentId) return void res.status(400).json({ error: "Некоректний документ" });
  const events = await db.select().from(fiscalEventsTable).where(and(
    eq(fiscalEventsTable.organizationId, organizationId), eq(fiscalEventsTable.fiscalDocumentId, documentId),
  )).orderBy(fiscalEventsTable.createdAt);
  res.json({ events });
});

router.post("/documents", requireAuth, async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const policyInput = parsePolicy(req.body?.policy);
  const legalEntityId = positiveInt(req.body?.legalEntityId);
  const registerId = positiveInt(req.body?.registerId);
  const totalAmount = Number(req.body?.totalAmount);
  const sourceId = clean(req.body?.sourceId, 100);
  const idempotencyKey = clean(req.body?.idempotencyKey, 160);
  const sourceType = req.body?.sourceType;
  const documentType = req.body?.documentType || "sale";
  const lines = Array.isArray(req.body?.lines) ? req.body.lines.map((line: any) => ({
    name: clean(line?.name, 500), quantity: Number(line?.quantity), unitPrice: Number(line?.unitPrice),
    taxCode: clean(line?.taxCode, 30), productCode: clean(line?.productCode, 64), unitName: clean(line?.unitName, 30),
  })) : [];
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  if (!legalEntityId || !registerId || !policyInput || !sourceId || !idempotencyKey || idempotencyKey.length < 8 ||
      !inSet(sourceType, ["hotel_folio", "booking", "fb_order", "bar_order", "spa_booking", "minibar", "other"]) ||
      !inSet(documentType, ["sale", "refund", "service_deposit"]) || !Number.isFinite(totalAmount) || totalAmount <= 0 ||
      !lines.length || lines.some((line: any) => !line.name || !Number.isFinite(line.quantity) ||
        line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0) ||
      (documentType === "refund" && !clean(req.body?.originalDpsDocumentId, 100))) {
    return void res.status(400).json({ error: "Некоректний фіскальний документ" });
  }
  const [register] = await db.select().from(prroRegistersTable).where(and(
    eq(prroRegistersTable.id, registerId), eq(prroRegistersTable.organizationId, organizationId),
    eq(prroRegistersTable.legalEntityId, legalEntityId),
    eq(prroRegistersTable.isActive, true),
    sql`${prroRegistersTable.status} in ('registered', 'active')`,
  ));
  if (!register) return void res.status(400).json({ error: "Каса не належить вибраному продавцю" });
  const [seller] = await db.select({ id: legalEntitiesTable.id }).from(legalEntitiesTable).where(and(
    eq(legalEntitiesTable.id, legalEntityId),
    eq(legalEntitiesTable.organizationId, organizationId),
    eq(legalEntitiesTable.isActive, true),
  ));
  if (!seller) return void res.status(400).json({ error: "Продавця не знайдено або він неактивний" });
  const [shift] = await db.select().from(prroShiftsTable).where(and(
    eq(prroShiftsTable.organizationId, organizationId), eq(prroShiftsTable.registerId, registerId),
    eq(prroShiftsTable.legalEntityId, legalEntityId),
    eq(prroShiftsTable.status, "open"),
    sql`${prroShiftsTable.signerKeyId} is not null`,
  )).orderBy(desc(prroShiftsTable.openedAt)).limit(1);
  if (!shift) return void res.status(409).json({ error: "Спочатку відкрийте зміну" });
  const policy = decideFiscalization(policyInput);
  const snapshot = {
    legalEntityId, registerId, shiftId: shift.id, sourceType, sourceId, documentType,
    totalAmount, currency: "UAH", idempotencyKey, policy: policyInput, lines,
    originalDpsDocumentId: clean(req.body?.originalDpsDocumentId, 100),
  };
  const contentHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  const [existing] = await db.select().from(fiscalDocumentsTable).where(and(
    eq(fiscalDocumentsTable.organizationId, organizationId), eq(fiscalDocumentsTable.idempotencyKey, idempotencyKey),
  ));
  if (existing) {
    if (existing.contentHash !== contentHash) return void res.status(409).json({ error: "Ключ ідемпотентності вже використано" });
    return void res.json({ document: existing, replayed: true });
  }
  const created = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(${organizationId}, ${registerId})`);
    const [unfinished] = await tx.select({ id: fiscalDocumentsTable.id }).from(fiscalDocumentsTable).where(and(
      eq(fiscalDocumentsTable.organizationId, organizationId),
      eq(fiscalDocumentsTable.registerId, registerId),
      sql`${fiscalDocumentsTable.status} in ('draft', 'signing', 'submitting', 'pending_retry', 'outcome_unknown', 'failed', 'failed_safe_to_retry')`,
      sql`${fiscalDocumentsTable.documentType} <> 'x_report'`,
    )).limit(1);
    if (unfinished) throw new Error("Попередній документ каси ще не має остаточного статусу");
    const [previous] = await tx.select({
      contentHash: fiscalDocumentsTable.contentHash,
      localNumber: fiscalDocumentsTable.localNumber,
      xmlPayload: fiscalDocumentsTable.xmlPayload,
    })
      .from(fiscalDocumentsTable).where(and(
        eq(fiscalDocumentsTable.organizationId, organizationId), eq(fiscalDocumentsTable.shiftId, shift.id),
        eq(fiscalDocumentsTable.status, "fiscalized"),
        sql`${fiscalDocumentsTable.documentType} <> 'x_report'`,
      )).orderBy(desc(fiscalDocumentsTable.localNumber)).limit(1);
    const [document] = await tx.insert(fiscalDocumentsTable).values({
      organizationId, legalEntityId, registerId, shiftId: shift.id, sourceType, sourceId, documentType,
      paymentChannel: policyInput.paymentChannel, policyDecision: policy.decision, policyCode: policy.code,
      policyReason: policy.reason, policyVersion: policy.version,
      status: policy.decision === "exempt" ? "exempt" : policy.decision === "manual_review" ? "review" : "draft",
      currency: "UAH", totalAmount: totalAmount.toFixed(2), idempotencyKey, contentHash,
      previousHash: previous?.xmlPayload
        ? createHash("sha256").update(iconv.encode(previous.xmlPayload, "windows-1251")).digest("hex")
        : previous?.contentHash,
      localNumber: (previous?.localNumber ?? 0) + 1,
      payloadSnapshot: snapshot,
      policyEvidence: { authority: policyInput.exemptionAuthority, reference: policyInput.exemptionReference },
      createdBy: userId(req),
    }).returning();
    await tx.insert(fiscalEventsTable).values({
      organizationId, fiscalDocumentId: document.id, eventType: "document_created",
      eventStatus: document.status, requestId: String(req.id ?? ""), payload: { policy },
    });
    return document;
  });
  if (policy.decision !== "fiscalize") return void res.status(201).json({ document: created, replayed: false });
  try {
    const document = await submitDocument(organizationId, created.id, String(req.id ?? ""));
    res.status(201).json({ document, replayed: false });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Помилка ДПС", documentId: created.id });
  }
});

router.post("/documents/:documentId/retry", requireAuth, requireRole("super_admin", "owner", "admin", "manager", "accountant"), async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const documentId = positiveInt(req.params.documentId);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  if (!documentId) return void res.status(400).json({ error: "Некоректний документ" });
  const [document] = await db.select().from(fiscalDocumentsTable).where(and(
    eq(fiscalDocumentsTable.id, documentId), eq(fiscalDocumentsTable.organizationId, organizationId),
  ));
  if (!document || !["failed_safe_to_retry", "pending_retry"].includes(document.status)) {
    return void res.status(409).json({ error: "Документ не очікує повторної спроби" });
  }
  try {
    const result = await submitDocument(organizationId, documentId, String(req.id ?? ""));
    res.json({ document: result });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Помилка ДПС", documentId });
  }
});

router.post("/documents/:documentId/reconcile", requireAuth, requireRole("super_admin", "owner", "admin", "manager", "accountant"), async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const documentId = positiveInt(req.params.documentId);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  if (!documentId) return void res.status(400).json({ error: "Некоректний документ" });
  const context = await loadContext(organizationId, documentId);
  if (!context || context.document.status !== "outcome_unknown" || !context.register.fiscalNumber || !context.shift?.signerKeyId) {
    return void res.status(409).json({ error: "Документ не потребує звірки невідомого результату" });
  }
  try {
    const scope = {
      organizationId,
      legalEntityId: context.document.legalEntityId,
      registerId: context.register.id,
      userId: userId(req),
    };
    const signedFn = await prroSigner.sign(
      context.shift.signerKeyId,
      Buffer.from(context.register.fiscalNumber),
      scope,
    );
    const last = await dpsPrroClient.lastCheck(signedFn);
    if (!last.signedData) throw new Error("ДПС не повернула підписаний останній документ");
    const verified = await prroSigner.verify(last.signedData);
    const xml = iconv.decode(verified, "windows-1251");
    const localNumber = Number(xml.match(/<ORDERNUM>(\d+)<\/ORDERNUM>/)?.[1]);
    const fiscalNumber = xml.match(/<CASHREGISTERNUM>([^<]+)<\/CASHREGISTERNUM>/)?.[1];
    if (fiscalNumber !== context.register.fiscalNumber || !Number.isInteger(localNumber)) {
      throw new Error("Підписана відповідь ДПС не відповідає касі");
    }
    if (localNumber === context.document.localNumber) {
      if (!context.document.xmlPayload ||
          canonicalXmlHash(xml) !== canonicalXmlHash(context.document.xmlPayload)) {
        throw new Error("Підписаний документ ДПС не збігається з відправленим XML");
      }
      const document = await db.transaction(async tx => {
        const [saved] = await tx.update(fiscalDocumentsTable).set({
          status: "fiscalized", fiscalNumber: last.id, dpsDocumentId: last.id,
          dpsSignedId: last.signedId?.toString("base64"),
          dpsSignedData: last.signedData.toString("base64"),
          dpsResponse: { status: last.status, reconciled: true },
          fiscalizedAt: new Date(), lastError: null, updatedAt: new Date(),
        }).where(and(
          eq(fiscalDocumentsTable.id, documentId),
          eq(fiscalDocumentsTable.organizationId, organizationId),
          eq(fiscalDocumentsTable.status, "outcome_unknown"),
        )).returning();
        if (!saved) throw new Error("Документ уже звірено іншим процесом");
        if (saved.shiftId && saved.documentType === "open_shift") {
          await tx.update(prroShiftsTable).set({ status: "open", dpsShiftId: last.id, openedAt: new Date() })
            .where(and(eq(prroShiftsTable.id, saved.shiftId), eq(prroShiftsTable.organizationId, organizationId)));
        } else if (saved.shiftId && saved.documentType === "z_report") {
          await tx.update(prroShiftsTable).set({ status: "closed", closedAt: new Date() })
            .where(and(eq(prroShiftsTable.id, saved.shiftId), eq(prroShiftsTable.organizationId, organizationId)));
        }
        await tx.insert(fiscalEventsTable).values({
          organizationId, fiscalDocumentId: documentId, eventType: "dps_reconciled",
          eventStatus: "fiscalized", requestId: String(req.id ?? ""),
          payload: { localNumber, dpsDocumentId: last.id },
        });
        return saved;
      });
      return void res.json({ document, resolution: "accepted_by_dps" });
    }
    if (localNumber < (context.document.localNumber ?? 0)) {
      const [document] = await db.update(fiscalDocumentsTable).set({
        status: "failed_safe_to_retry", dpsResponse: { status: last.status, reconciled: true },
        updatedAt: new Date(),
      }).where(and(
        eq(fiscalDocumentsTable.id, documentId),
        eq(fiscalDocumentsTable.organizationId, organizationId),
        eq(fiscalDocumentsTable.status, "outcome_unknown"),
      )).returning();
      await addEvent(organizationId, documentId, "dps_reconciled", "failed_safe_to_retry", {
        dpsLastLocalNumber: localNumber,
      }, String(req.id ?? ""));
      return void res.json({ document, resolution: "safe_to_retry" });
    }
    throw new Error("Ланцюжок ДПС випереджає локальний документ; потрібне ручне розслідування");
  } catch (error) {
    await addEvent(organizationId, documentId, "reconciliation_failed", "outcome_unknown", {
      error: error instanceof Error ? error.message : "Невідома помилка звірки",
    }, String(req.id ?? ""));
    res.status(502).json({ error: error instanceof Error ? error.message : "Помилка звірки ДПС" });
  }
});

router.post("/documents/:documentId/cancel-rejected", requireAuth, requireRole("super_admin", "owner", "admin"), async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const documentId = positiveInt(req.params.documentId);
  const reason = clean(req.body?.reason, 500);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  if (!documentId || !reason) return void res.status(400).json({ error: "Потрібна причина скасування" });
  try {
    const document = await db.transaction(async tx => {
      const [cancelled] = await tx.update(fiscalDocumentsTable).set({
        status: "cancelled", lastError: reason, updatedAt: new Date(),
      }).where(and(
        eq(fiscalDocumentsTable.id, documentId),
        eq(fiscalDocumentsTable.organizationId, organizationId),
        eq(fiscalDocumentsTable.status, "failed"),
      )).returning();
      if (!cancelled) throw new Error("Можна скасувати лише остаточно відхилений документ");
      if (cancelled.shiftId && cancelled.documentType === "open_shift") {
        await tx.update(prroShiftsTable).set({ status: "cancelled", closedAt: new Date() })
          .where(and(eq(prroShiftsTable.id, cancelled.shiftId), eq(prroShiftsTable.organizationId, organizationId)));
      } else if (cancelled.shiftId && cancelled.documentType === "z_report") {
        await tx.update(prroShiftsTable).set({ status: "open", closedAt: null })
          .where(and(eq(prroShiftsTable.id, cancelled.shiftId), eq(prroShiftsTable.organizationId, organizationId)));
      }
      await tx.insert(fiscalEventsTable).values({
        organizationId, fiscalDocumentId: documentId, eventType: "rejected_document_cancelled",
        eventStatus: "cancelled", requestId: String(req.id ?? ""), payload: { reason },
      });
      return cancelled;
    });
    res.json({ document });
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Скасування неможливе" });
  }
});

router.post("/registers/:registerId/reports/x", requireAuth, async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const registerId = positiveInt(req.params.registerId);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  const [shift] = await db.select().from(prroShiftsTable).where(and(
    eq(prroShiftsTable.organizationId, organizationId), eq(prroShiftsTable.registerId, registerId!),
    eq(prroShiftsTable.status, "open"),
  )).orderBy(desc(prroShiftsTable.openedAt)).limit(1);
  if (!shift) return void res.status(409).json({ error: "Немає відкритої зміни" });
  const documents = await db.select().from(fiscalDocumentsTable).where(and(
    eq(fiscalDocumentsTable.organizationId, organizationId), eq(fiscalDocumentsTable.shiftId, shift.id),
    eq(fiscalDocumentsTable.status, "fiscalized"),
  ));
  const total = documents.reduce((sum, doc) => sum + (doc.documentType === "refund" ? -1 : 1) * Number(doc.totalAmount), 0);
  const created = await createSystemDocument({
    organizationId, legalEntityId: shift.legalEntityId, registerId: registerId!, shiftId: shift.id,
    documentType: "x_report", sourceId: `${shift.id}:${Date.now()}`, totalAmount: Math.max(0, total),
    createdBy: userId(req), requestId: String(req.id ?? ""),
  });
  const document = await submitDocument(organizationId, created.id, String(req.id ?? ""));
  res.status(201).json({ document });
});

router.post("/registers/:registerId/shifts/:shiftId/close", requireAuth, requireRole("super_admin", "owner", "admin", "manager", "accountant"), async (req, res): Promise<void> => {
  const organizationId = orgId(req);
  const registerId = positiveInt(req.params.registerId);
  const shiftId = positiveInt(req.params.shiftId);
  if (!organizationId) return void res.status(403).json({ error: "No organization" });
  const [shift] = await db.select().from(prroShiftsTable).where(and(
    eq(prroShiftsTable.id, shiftId!), eq(prroShiftsTable.organizationId, organizationId),
    eq(prroShiftsTable.registerId, registerId!), eq(prroShiftsTable.status, "open"),
  ));
  if (!shift) return void res.status(409).json({ error: "Відкриту зміну не знайдено" });
  const pending = await db.select({ id: fiscalDocumentsTable.id }).from(fiscalDocumentsTable).where(and(
    eq(fiscalDocumentsTable.organizationId, organizationId), eq(fiscalDocumentsTable.shiftId, shift.id),
    sql`${fiscalDocumentsTable.status} in ('draft', 'signing', 'submitting', 'pending_retry', 'outcome_unknown', 'failed', 'failed_safe_to_retry')`,
  )).limit(1);
  if (pending[0]) return void res.status(409).json({ error: "У зміні є незавершені фіскальні документи" });
  const documents = await db.select().from(fiscalDocumentsTable).where(and(
    eq(fiscalDocumentsTable.organizationId, organizationId), eq(fiscalDocumentsTable.shiftId, shift.id),
    eq(fiscalDocumentsTable.status, "fiscalized"),
  ));
  const total = documents.reduce((sum, doc) => sum + (doc.documentType === "refund" ? -1 : 1) * Number(doc.totalAmount), 0);
  await db.update(prroShiftsTable).set({ status: "closing" }).where(and(
    eq(prroShiftsTable.id, shift.id), eq(prroShiftsTable.organizationId, organizationId),
  ));
  const created = await createSystemDocument({
    organizationId, legalEntityId: shift.legalEntityId, registerId: registerId!, shiftId: shift.id,
    documentType: "z_report", sourceId: String(shift.id), totalAmount: Math.max(0, total),
    createdBy: userId(req), requestId: String(req.id ?? ""),
  });
  try {
    const document = await submitDocument(organizationId, created.id, String(req.id ?? ""));
    res.status(201).json({ document });
  } catch (error) {
    await db.update(prroShiftsTable).set({ status: "open" }).where(and(
      eq(prroShiftsTable.id, shift.id), eq(prroShiftsTable.organizationId, organizationId),
    ));
    res.status(502).json({ error: error instanceof Error ? error.message : "Помилка ДПС", documentId: created.id });
  }
});

const retryTimer = setInterval(async () => {
  try {
    const due = await db.select({
      id: fiscalDocumentsTable.id,
      organizationId: fiscalDocumentsTable.organizationId,
    }).from(fiscalDocumentsTable)
      .where(and(
        eq(fiscalDocumentsTable.status, "pending_retry"),
        sql`${fiscalDocumentsTable.nextRetryAt} <= now()`,
      ))
      .orderBy(fiscalDocumentsTable.nextRetryAt)
      .limit(10);
    for (const document of due) {
      try {
        await submitDocument(document.organizationId, document.id, `retry-worker:${document.id}`);
      } catch (error) {
        logger.warn({ documentId: document.id, err: error }, "PRRO scheduled retry failed");
      }
    }
  } catch (error) {
    logger.error({ err: error }, "PRRO retry worker failed");
  }
}, 15_000);
retryTimer.unref();

export default router;