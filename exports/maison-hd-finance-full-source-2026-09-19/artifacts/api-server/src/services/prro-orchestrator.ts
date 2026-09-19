import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import { decideFiscalization, type FiscalPolicyInput, type FiscalPolicyDecision } from "./prro-policy.js";

const DB = () => (db as any).$client;

export async function resolvePaymentSessionFiscalSource(session: any, paidAmount: number) {
  const sessionType = String(session.type || "").toLowerCase();
  if (sessionType.includes("minibar")) {
    if (!session.booking_id) throw new Error("Minibar payment session has no booking");
    const { rows } = await DB().query(
      `SELECT mc.id, mc.item_name, mc.item_price, mc.quantity, mc.total_amount,
              NULLIF(to_jsonb(mi)->>'legal_entity_id', '')::int AS legal_entity_id
         FROM minibar_charges mc
         JOIN bookings b ON b.id = mc.booking_id AND b.organization_id = $2
         JOIN units u ON u.id = b.unit_id
         JOIN properties p ON p.id = u.property_id AND p.organization_id = $2
         LEFT JOIN minibar_items mi ON mi.id = mc.item_id
        WHERE mc.booking_id = $1 ORDER BY mc.id`,
      [session.booking_id, session.organization_id],
    );
    if (!rows.length) throw new Error("Minibar payment session has no persisted minibar charge");
    const sourceItems = rows.map((charge: any) => ({
      name: charge.item_name,
      quantity: Number(charge.quantity || 1),
      unitPrice: Number(charge.item_price),
      amount: Number(charge.total_amount),
      legalEntityId: charge.legal_entity_id || session.legal_entity_id,
      metadata: { source: "minibar", minibarChargeId: charge.id },
    }));
    return {
      sourceType: "minibar",
      sourceId: `minibar:${rows.map((charge: any) => charge.id).join(",")}:session:${session.id}`,
      items: allocatePositiveFiscalItems(sourceItems, paidAmount),
    };
  }
  const sourceType = sessionType.includes("spa") ? "spa_booking" : "booking";
  return {
    sourceType,
    sourceId: `session:${session.id}`,
    items: [{
      name: session.description || "Онлайн-оплата",
      quantity: 1,
      unitPrice: paidAmount,
      amount: paidAmount,
      legalEntityId: session.legal_entity_id,
    }],
  };
}

export type FiscalSourceItem = {
  name: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  unitName?: string;
  taxCode?: string | null;
  productCode?: string | null;
  legalEntityId?: number | null;
  metadata?: Record<string, unknown>;
};

export type NormalizedFiscalItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  unitName: string;
  taxCode?: string;
  productCode?: string;
  legalEntityId: number;
  metadata?: Record<string, unknown>;
};

export type FiscalizationInput = {
  organizationId: number;
  sourceType: string;
  sourceId: string;
  items: FiscalSourceItem[];
  defaultLegalEntityId?: number | null;
  totalAmount?: number;
  currency?: string;
  paymentChannel: FiscalPolicyInput["paymentChannel"];
  itemKind?: FiscalPolicyInput["itemKind"];
  exclusivelyRemoteServicePayments?: boolean;
  exemptionAuthority?: FiscalPolicyInput["exemptionAuthority"];
  exemptionReference?: string;
  documentType?: "sale" | "refund" | "service_deposit";
  originalDpsDocumentId?: string;
  idempotencyKey?: string;
  createdBy?: number;
  requestId?: string;
  policyEvidence?: Record<string, unknown>;
};

export type FiscalizationResult = {
  documents: any[];
  replayed: boolean;
  policy: FiscalPolicyDecision;
};

/**
 * Normalize source adapters at the fiscal boundary. Seller ids are deliberately
 * resolved here rather than trusted from a register or a client payload.
 */
export function normalizeFiscalItems(
  items: FiscalSourceItem[],
  defaultLegalEntityId?: number | null,
): NormalizedFiscalItem[] {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Фіскальний платіж не містить позицій");
  return items.map((item, index) => {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unitPrice ?? (item.amount !== undefined ? Number(item.amount) / quantity : NaN));
    const amount = Number(item.amount ?? quantity * unitPrice);
    if (!name || name.length > 500 || !Number.isFinite(quantity) || quantity <= 0 ||
        !Number.isFinite(unitPrice) || unitPrice < 0 ||
        !Number.isFinite(amount) || amount < 0) {
      throw new Error(`Некоректна фіскальна позиція #${index + 1}`);
    }
    const legalEntityId = item.legalEntityId ?? defaultLegalEntityId ?? undefined;
    if (!legalEntityId || !Number.isInteger(Number(legalEntityId)) || Number(legalEntityId) <= 0) {
      throw new Error(`Для позиції «${name}» не визначено продавця`);
    }
    return {
      name,
      quantity,
      unitPrice,
      amount: Math.round(amount * 100) / 100,
      unitName: item.unitName?.trim() || "шт",
      ...(item.taxCode ? { taxCode: item.taxCode.trim() } : {}),
      ...(item.productCode ? { productCode: item.productCode.trim() } : {}),
      legalEntityId: Number(legalEntityId),
      ...(item.metadata ? { metadata: item.metadata } : {}),
    };
  });
}

export function assertAmountConservation(items: NormalizedFiscalItem[], totalAmount: number): void {
  const lineCents = items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  const totalCents = Math.round(Number(totalAmount) * 100);
  if (lineCents !== totalCents) {
    throw new Error(`Фіскальні позиції не сходяться із сумою платежу: ${lineCents} коп. != ${totalCents} коп.`);
  }
}

/** Allocate a partial/full payable amount without emitting negative fiscal lines. */
export function allocatePositiveFiscalItems(items: FiscalSourceItem[], totalAmount: number): FiscalSourceItem[] {
  const normalized = normalizeFiscalItems(items);
  const targetCents = Math.round(Number(totalAmount) * 100);
  const source = normalized
    .map((item, index) => ({ item, index, cents: Math.round(item.amount * 100) }))
    .filter(entry => entry.cents > 0);
  const sourceCents = source.reduce((sum, entry) => sum + entry.cents, 0);
  if (targetCents <= 0 || targetCents > sourceCents) {
    throw new Error("Сума платежу перевищує позитивні фіскальні позиції");
  }
  const allocated = source.map(entry => Math.floor(targetCents * entry.cents / sourceCents));
  let residual = targetCents - allocated.reduce((sum, cents) => sum + cents, 0);
  for (let i = 0; residual > 0; i = (i + 1) % allocated.length) {
    allocated[i] += 1;
    residual -= 1;
  }
  return source
    .map((entry, index) => ({ item: entry.item, cents: allocated[index] }))
    .filter(entry => entry.cents > 0)
    .map(entry => ({
      ...entry.item,
      quantity: 1,
      unitPrice: entry.cents / 100,
      amount: entry.cents / 100,
    }));
}

async function resolveSeller(organizationId: number, legalEntityId: number) {
  const { rows } = await DB().query(
    `SELECT id, name, edrpou
       FROM legal_entities
      WHERE id = $1 AND organization_id = $2 AND is_active = true
      LIMIT 1`,
    [legalEntityId, organizationId],
  );
  if (!rows[0]) throw new Error("Продавця не знайдено, він не належить організації або неактивний");
  return rows[0];
}

export async function resolveFiscalSeller(organizationId: number, legalEntityId: number) {
  return resolveSeller(organizationId, legalEntityId);
}

async function resolveRegisterAndShift(organizationId: number, legalEntityId: number) {
  const { rows } = await DB().query(
    `SELECT r.id AS register_id, s.id AS shift_id
       FROM prro_registers r
       JOIN prro_shifts s
         ON s.register_id = r.id
        AND s.organization_id = r.organization_id
        AND s.legal_entity_id = r.legal_entity_id
        AND s.status = 'open'
      WHERE r.organization_id = $1
        AND r.legal_entity_id = $2
        AND r.is_active = true
        AND r.status IN ('registered', 'active')
        AND r.fiscal_number IS NOT NULL
        AND s.signer_key_id IS NOT NULL
      ORDER BY s.opened_at DESC NULLS LAST, r.id
      LIMIT 1`,
    [organizationId, legalEntityId],
  );
  if (!rows[0]) {
    throw new Error("Для продавця немає активної каси й відкритої зміни зі scoped КЕП");
  }
  return { registerId: Number(rows[0].register_id), shiftId: Number(rows[0].shift_id) };
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Create one immutable fiscal document per seller. The function does not call
 * DPS itself; callers submit returned draft documents through submitDocument.
 * This keeps all source modules on one allocation/idempotency boundary while
 * retaining the existing unknown-outcome safety in the DPS transport.
 */
export async function orchestrateFiscalization(input: FiscalizationInput): Promise<FiscalizationResult> {
  if (!Number.isInteger(input.organizationId) || input.organizationId <= 0) throw new Error("Некоректна організація");
  if (!input.sourceType || !input.sourceId) throw new Error("sourceType і sourceId обов'язкові");
  if (!["hotel_folio", "booking", "fb_order", "bar_order", "spa_booking", "minibar", "other"].includes(input.sourceType)) {
    throw new Error("Непідтримуване джерело фіскального платежу");
  }
  const normalized = normalizeFiscalItems(input.items, input.defaultLegalEntityId);
  const itemKind = input.itemKind ?? "goods";
  const policyInput: FiscalPolicyInput = {
    itemKind,
    paymentChannel: input.paymentChannel,
    exclusivelyRemoteServicePayments: input.exclusivelyRemoteServicePayments === true,
    exemptionAuthority: input.exemptionAuthority,
    exemptionReference: input.exemptionReference,
  };
  const policy = decideFiscalization(policyInput);
  const total = money(input.totalAmount ?? normalized.reduce((sum, item) => sum + item.amount, 0));
  if (!Number.isFinite(total) || total <= 0) throw new Error("Сума фіскального платежу має бути додатною");
  assertAmountConservation(normalized, total);
  const groups = new Map<number, NormalizedFiscalItem[]>();
  for (const item of normalized) {
    await resolveSeller(input.organizationId, item.legalEntityId!);
    const group = groups.get(item.legalEntityId!) ?? [];
    group.push(item);
    groups.set(item.legalEntityId!, group);
  }
  const baseKey = input.idempotencyKey ||
    `${input.sourceType}:${input.sourceId}:${input.documentType ?? "sale"}`;
  if (baseKey.length > 140) throw new Error("Ключ ідемпотентності задовгий");

  // Resolve every seller and its fiscal resources before opening the write
  // transaction. Nothing is inserted until all mixed-seller allocations are
  // known to be valid.
  const allocations = [];
  for (const [legalEntityId, group] of groups) {
    const seller = await resolveSeller(input.organizationId, legalEntityId);
    const resource = policy.decision === "fiscalize"
      ? await resolveRegisterAndShift(input.organizationId, legalEntityId)
      : { registerId: null, shiftId: null };
    allocations.push({
      legalEntityId,
      group,
      seller,
      resource,
      groupAmount: money(group.reduce((sum, item) => sum + item.amount, 0)),
      idempotencyKey: `${baseKey}:seller:${legalEntityId}`,
    });
  }

  const client = await DB().connect();
  try {
    await client.query("BEGIN");
    // Register locks are acquired in a stable order to prevent both local
    // number races and deadlocks between mixed-seller payments.
    const registerIds = [...new Set(
      allocations.map(allocation => allocation.resource.registerId).filter((id): id is number => id !== null),
    )].sort((a, b) => a - b);
    for (const registerId of registerIds) {
      await client.query("SELECT pg_advisory_xact_lock($1, $2)", [input.organizationId, registerId]);
    }

    // A register/shift can be closed between preflight and BEGIN. Re-check
    // under the transaction locks so a partial mixed payment is impossible.
    if (policy.decision === "fiscalize") {
      for (const allocation of allocations) {
        const { rows } = await client.query(
          `SELECT r.id AS register_id, s.id AS shift_id
             FROM prro_registers r
             JOIN prro_shifts s
               ON s.register_id = r.id
              AND s.organization_id = r.organization_id
              AND s.legal_entity_id = r.legal_entity_id
              AND s.status = 'open'
              AND s.signer_key_id IS NOT NULL
            WHERE r.id = $1
              AND r.organization_id = $2
              AND r.legal_entity_id = $3
              AND r.is_active = true
              AND r.status IN ('registered', 'active')
              AND r.fiscal_number IS NOT NULL
            LIMIT 1`,
          [allocation.resource.registerId, input.organizationId, allocation.legalEntityId],
        );
        if (!rows[0] || Number(rows[0].shift_id) !== allocation.resource.shiftId) {
          throw new Error("Для продавця змінився стан активної каси або зміни; платіж не створено");
        }
      }
    }

    const documents: any[] = [];
    let replayed = true;
    for (const allocation of allocations) {
      const { legalEntityId, group, seller, resource, groupAmount, idempotencyKey } = allocation;
      let localNumber: number | null = null;
      if (resource.shiftId) {
        const { rows: last } = await client.query(
          `SELECT COALESCE(MAX(local_number), 0) + 1 AS next_local_number
             FROM fiscal_documents
            WHERE organization_id = $1 AND register_id = $2 AND shift_id = $3
              AND status NOT IN ('cancelled', 'exempt', 'review')`,
          [input.organizationId, resource.registerId, resource.shiftId],
        );
        localNumber = Number(last[0]?.next_local_number || 1);
      }
      const snapshot = {
        legalEntityId,
        registerId: resource.registerId,
        shiftId: resource.shiftId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        documentType: input.documentType ?? "sale",
        paymentChannel: input.paymentChannel,
        totalAmount: groupAmount,
        currency: input.currency ?? "UAH",
        policy: policyInput,
        lines: group,
        originalDpsDocumentId: input.originalDpsDocumentId,
      };
      const contentHash = stableHash(snapshot);
      const evidence = {
        ...(input.policyEvidence ?? {}),
        authority: input.exemptionAuthority,
        reference: input.exemptionReference,
      };
      const { rows: inserted } = await client.query(
        `INSERT INTO fiscal_documents (
           organization_id, legal_entity_id, register_id, shift_id, source_type, source_id,
           document_type, payment_channel, policy_decision, policy_code, policy_reason,
           policy_version, status, currency, total_amount, idempotency_key, content_hash,
           local_number, payload_snapshot, policy_evidence, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (organization_id, idempotency_key) DO NOTHING
         RETURNING *`,
        [
          input.organizationId, seller.id, resource.registerId, resource.shiftId,
          input.sourceType, input.sourceId, input.documentType ?? "sale", input.paymentChannel,
          policy.decision, policy.code, policy.reason, policy.version,
          policy.decision === "exempt" ? "exempt" : policy.decision === "manual_review" ? "review" : "draft",
          input.currency ?? "UAH", groupAmount.toFixed(2), idempotencyKey, contentHash,
          localNumber, JSON.stringify(snapshot), JSON.stringify(evidence), input.createdBy ?? null,
        ],
      );
      let document = inserted[0];
      const wasReplayed = !document;
      if (!document) {
        const { rows: existing } = await client.query(
          `SELECT * FROM fiscal_documents WHERE organization_id = $1 AND idempotency_key = $2 LIMIT 1`,
          [input.organizationId, idempotencyKey],
        );
        document = existing[0];
        if (!document) throw new Error("Не вдалося отримати ідемпотентний фіскальний документ");
        if (document.content_hash !== contentHash && document.contentHash !== contentHash) {
          throw new Error("Ключ ідемпотентності вже використано для іншого платежу");
        }
      } else {
        replayed = false;
        await client.query(
          `INSERT INTO fiscal_events (organization_id, fiscal_document_id, event_type, event_status, request_id, payload)
           VALUES ($1,$2,'document_created',$3,$4,$5)`,
          [input.organizationId, document.id, document.status, input.requestId ?? null, JSON.stringify({ policy, sellerId: legalEntityId })],
        );
      }
      if (wasReplayed) {
        await client.query(
          `INSERT INTO fiscal_events (organization_id, fiscal_document_id, event_type, event_status, request_id, payload)
           VALUES ($1,$2,'document_replayed',$3,$4,$5)`,
          [input.organizationId, document.id, document.status, input.requestId ?? null, JSON.stringify({ idempotencyKey })],
        );
      }
      documents.push(document);
    }
    await client.query("COMMIT");
    return { documents, replayed, policy };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export const fiscalizePayment = orchestrateFiscalization;

export function calculatePaymentDelta(previousPaid: number, nextPaid: number): number {
  const previousCents = Math.round(Number(previousPaid) * 100);
  const nextCents = Math.round(Number(nextPaid) * 100);
  return Math.max(0, nextCents - previousCents) / 100;
}

export function isSubmissionEligible(status: string): boolean {
  return ["draft", "failed_safe_to_retry", "pending_retry"].includes(status);
}