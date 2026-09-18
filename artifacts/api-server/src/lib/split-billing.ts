/**
 * Split Billing Engine
 * Groups invoice items by legal entity and generates separate LiqPay payment links.
 * Each legal entity gets its own payment link using its own LiqPay credentials.
 */
import { db } from "@workspace/db";
import { decrypt } from "./encrypt.js";
import { LiqPayProvider } from "./payment-provider.js";

// Use the same pattern as payment-layer.ts for raw SQL queries
const DB = () => (db as any).$client ?? (db as any).session?.client ?? (db as any)._client;

const liqpay = new LiqPayProvider();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SplitItem {
  description: string;
  detail?: string;
  qty: number;
  unit: string;
  price: number;
  amount: number;
  vatRate?: number;
  legalEntityId?: number | null;
  source?: "accommodation" | "addon" | "fb" | "rental" | "other";
}

export interface SplitGroup {
  legalEntityId: number;
  entityName: string;
  entityType: string;
  amount: number;
  items: SplitItem[];
  hasLiqpay: boolean;
}

export interface SplitResult {
  splits: Array<{
    splitId: number;
    legalEntityId: number;
    entityName: string;
    amount: number;
    currency: string;
    paymentLink: string | null;
    orderId: string;
    status: string;
    items: SplitItem[];
  }>;
  total: number;
  isSplit: boolean;
  missingKeys: string[];
}

// ─── Resolve legal entity for a booking ───────────────────────────────────────

export async function resolveBookingLegalEntity(
  bookingId: number,
  orgId: number,
): Promise<number | null> {
  const db = DB();

  // 1. Booking may have explicit legal_entity_id
  const { rows: [booking] } = await db.query(
    `SELECT b.legal_entity_id, p.legal_entity_id AS prop_legal_entity_id,
            ble.id AS booking_entity_id, ple.id AS property_entity_id
     FROM bookings b
     LEFT JOIN units u ON u.id = b.unit_id
     LEFT JOIN properties p ON p.id = u.property_id
      LEFT JOIN legal_entities ble
        ON ble.id = b.legal_entity_id AND ble.organization_id = $2 AND ble.is_active = true
      LEFT JOIN legal_entities ple
        ON ple.id = p.legal_entity_id AND ple.organization_id = $2 AND ple.is_active = true
     WHERE b.id = $1 AND b.organization_id = $2`,
    [bookingId, orgId],
  );

  if (!booking) return null;
  // booking-level takes priority, then property-level
  return booking.booking_entity_id || booking.property_entity_id || null;
}

// ─── Group items by legal entity ──────────────────────────────────────────────

export async function groupItemsByEntity(
  items: SplitItem[],
  orgId: number,
  defaultLegalEntityId: number | null,
): Promise<SplitGroup[]> {
  const db = DB();

  // Load all legal entities for this org
  const { rows: entities } = await db.query(
    `SELECT id, name, type, liqpay_public_key, liqpay_private_key
     FROM legal_entities WHERE organization_id = $1 AND is_active = true`,
    [orgId],
  );

  const entityMap = new Map<number, typeof entities[0]>();
  for (const e of entities) entityMap.set(e.id, e);

  const groups = new Map<number, SplitItem[]>();

  for (const item of items) {
    const entityId = item.legalEntityId ?? defaultLegalEntityId;
    if (!entityId || !entityMap.has(entityId)) {
      throw new Error("Позиція рахунку посилається на невідомого або неактивного продавця");
    }
    const key = entityId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const result: SplitGroup[] = [];

  for (const [entityId, groupItems] of groups.entries()) {
    const entity = entityId ? entityMap.get(entityId) : null;
    const amount = groupItems.reduce((s, i) => s + Number(i.amount), 0);

    result.push({
        legalEntityId: entityId as number,
        entityName: entity!.name,
        entityType: entity!.type,
      amount: Math.round(amount * 100) / 100,
      items: groupItems,
      hasLiqpay: !!(entity?.liqpay_public_key && entity?.liqpay_private_key),
    });
  }

  return result.sort((a, b) => b.amount - a.amount);
}

// ─── Core: generate split payment links ───────────────────────────────────────

export async function generateSplitPaymentLinks(params: {
  invoiceId: number;
  orgId: number;
  bookingId?: number | null;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  currency?: string;
  regenerate?: boolean;
}): Promise<SplitResult> {
  const db = DB();
  const { invoiceId, orgId, guestName, guestEmail, guestPhone, currency = "UAH", regenerate = false } = params;

  // If splits already exist and not regenerating, return existing
  if (!regenerate) {
    const { rows: existing } = await db.query(
      `SELECT s.*, le.name AS entity_name FROM invoice_splits s
       JOIN invoices i ON i.id = s.invoice_id AND i.organization_id = $2
       LEFT JOIN legal_entities le ON le.id = s.legal_entity_id AND le.organization_id = $2
       WHERE s.invoice_id = $1 ORDER BY s.amount DESC`,
      [invoiceId, orgId],
    );
    if (existing.length > 0) {
      return {
        isSplit: existing.length > 1,
        total: existing.reduce((s: number, r: any) => s + Number(r.amount), 0),
        missingKeys: [],
        splits: existing.map((r: any) => ({
          splitId: r.id,
          legalEntityId: r.legal_entity_id,
          entityName: r.entity_name,
          amount: Number(r.amount),
          currency: r.currency,
          paymentLink: r.payment_link,
          orderId: r.order_id,
          status: r.status,
          items: r.items_snapshot || [],
        })),
      };
    }
  }

  // Load invoice
  const { rows: [invoice] } = await db.query(
    `SELECT i.*, b.organization_id, p.legal_entity_id AS prop_entity_id
     FROM invoices i
     LEFT JOIN bookings b ON b.id = i.booking_id
     LEFT JOIN units u ON u.id = b.unit_id
     LEFT JOIN properties p ON p.id = u.property_id
      WHERE i.id = $1 AND i.organization_id = $2`,
    [invoiceId, orgId],
  );

  if (!invoice) throw new Error("Invoice not found");

  const items: SplitItem[] = invoice.invoice_items || [];
  const defaultEntityId = invoice.legal_entity_id || invoice.prop_entity_id;

  const groups = await groupItemsByEntity(items, orgId, defaultEntityId);

  if (groups.length === 0) {
    throw new Error("Немає позицій для оплати");
  }

  // Delete old splits if regenerating
  if (regenerate) {
    await db.query(
      `DELETE FROM invoice_splits s USING invoices i
        WHERE s.invoice_id = i.id AND s.invoice_id = $1 AND i.organization_id = $2`,
      [invoiceId, orgId],
    );
  }

  // Load entity keys
  const entityIds = groups.map(g => g.legalEntityId).filter(Boolean);
  const { rows: entityRows } = await db.query(
    `SELECT id, name, liqpay_public_key, liqpay_private_key FROM legal_entities WHERE id = ANY($1) AND organization_id = $2`,
    [entityIds, orgId],
  );
  const keyMap = new Map<number, { pub: string; priv: string }>();
  for (const e of entityRows) {
    const pub = e.liqpay_public_key || "";
    const priv = decrypt(e.liqpay_private_key) || "";
    if (pub && priv) keyMap.set(e.id, { pub, priv });
  }

  const splits = [];
  const missingKeys: string[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const keys = g.legalEntityId ? keyMap.get(g.legalEntityId) : undefined;
    const orderId = `INV-${invoiceId}-E${g.legalEntityId}`;
    let paymentLink: string | null = null;

    if (keys?.pub && keys?.priv) {
      try {
        const session = await liqpay.createSession({
          amount: g.amount,
          currency,
          description: `Рахунок #${invoice.invoice_number} · ${g.entityName}`,
          orderId,
          sessionRef: orderId,
          guestName,
          guestEmail,
          guestPhone,
          publicKey: keys.pub,
          privateKey: keys.priv,
          expiryHours: 72,
        });
        paymentLink = session.checkoutUrl;
      } catch (e: any) {
        missingKeys.push(`${g.entityName}: помилка генерації (${e.message})`);
      }
    } else {
      missingKeys.push(`${g.entityName}: LiqPay ключі не налаштовані`);
    }

    const { rows: [saved] } = await db.query(
      `INSERT INTO invoice_splits (invoice_id, legal_entity_id, amount, currency, description, order_id, payment_link, status, items_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET payment_link = EXCLUDED.payment_link, updated_at = NOW()
       RETURNING id`,
      [
        invoiceId,
        g.legalEntityId || null,
        g.amount,
        currency,
        `${g.entityName}`,
        orderId,
        paymentLink,
        "pending",
        JSON.stringify(g.items),
      ],
    );

    splits.push({
      splitId: saved.id,
      legalEntityId: g.legalEntityId,
      entityName: g.entityName,
      amount: g.amount,
      currency,
      paymentLink,
      orderId,
      status: "pending",
      items: g.items,
    });
  }

  return {
    splits,
    total: splits.reduce((s, r) => s + r.amount, 0),
    isSplit: splits.length > 1,
    missingKeys,
  };
}

// ─── Get splits for invoice ────────────────────────────────────────────────────

export async function getInvoiceSplits(invoiceId: number, orgId: number) {
  const db = DB();
  const { rows } = await db.query(
    `SELECT s.*, le.name AS entity_name, le.type AS entity_type
      FROM invoice_splits s
      JOIN invoices i ON i.id = s.invoice_id AND i.organization_id = $2
      LEFT JOIN legal_entities le ON le.id = s.legal_entity_id AND le.organization_id = $2
      WHERE s.invoice_id = $1
     ORDER BY s.amount DESC`,
    [invoiceId, orgId],
  );
  return rows;
}

// ─── Revenue by legal entity (for finance reports) ────────────────────────────

export async function revenueByLegalEntity(orgId: number, params: {
  from?: string;
  to?: string;
  includeSubtotals?: boolean;
}) {
  const db = DB();
  const { from, to } = params;

  const dateFilter = from && to
    ? `AND i.created_at BETWEEN $2::date AND ($3::date + INTERVAL '1 day')`
    : from
    ? `AND i.created_at >= $2::date`
    : to
    ? `AND i.created_at < ($2::date + INTERVAL '1 day')`
    : "";

  const dateArgs = [orgId, ...(from && to ? [from, to] : from ? [from] : to ? [to] : [])];

  // 1. Splits-based revenue (precise per-entity)
  const { rows: splitRevenue } = await db.query(
    `SELECT
       le.id             AS entity_id,
       le.name           AS entity_name,
       le.type           AS entity_type,
       SUM(s.amount)     AS total_amount,
       SUM(CASE WHEN s.status = 'paid' THEN s.paid_amount ELSE 0 END) AS paid_amount,
       COUNT(s.id)       AS invoice_count,
       'split'           AS source
     FROM invoice_splits s
     JOIN invoices i ON i.id = s.invoice_id
     JOIN legal_entities le ON le.id = s.legal_entity_id
     WHERE le.organization_id = $1 ${dateFilter}
     GROUP BY le.id, le.name, le.type`,
    dateArgs,
  );

  // 2. Direct invoices with legal_entity_id (not split)
  const { rows: directRevenue } = await db.query(
    `SELECT
       le.id             AS entity_id,
       le.name           AS entity_name,
       le.type           AS entity_type,
       SUM(i.amount)     AS total_amount,
       SUM(COALESCE(i.paid_amount, 0)) AS paid_amount,
       COUNT(i.id)       AS invoice_count,
       'direct'          AS source
     FROM invoices i
     JOIN legal_entities le ON le.id = i.legal_entity_id
     LEFT JOIN invoice_splits s ON s.invoice_id = i.id
     WHERE le.organization_id = $1
       AND s.id IS NULL
       ${dateFilter.replace("i.created_at", "i.created_at")}
     GROUP BY le.id, le.name, le.type`,
    dateArgs,
  );

  // Merge split + direct by entity
  const merged = new Map<number, {
    entityId: number; entityName: string; entityType: string;
    totalAmount: number; paidAmount: number; invoiceCount: number;
  }>();

  for (const row of [...splitRevenue, ...directRevenue]) {
    const existing = merged.get(row.entity_id);
    if (existing) {
      existing.totalAmount += Number(row.total_amount);
      existing.paidAmount += Number(row.paid_amount);
      existing.invoiceCount += Number(row.invoice_count);
    } else {
      merged.set(row.entity_id, {
        entityId: row.entity_id,
        entityName: row.entity_name,
        entityType: row.entity_type,
        totalAmount: Number(row.total_amount),
        paidAmount: Number(row.paid_amount),
        invoiceCount: Number(row.invoice_count),
      });
    }
  }

  const byEntity = Array.from(merged.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .map(e => ({
      ...e,
      outstandingAmount: e.totalAmount - e.paidAmount,
      collectionRate: e.totalAmount > 0 ? Math.round((e.paidAmount / e.totalAmount) * 100) : 0,
    }));

  const grandTotal = byEntity.reduce((s, e) => s + e.totalAmount, 0);
  const grandPaid  = byEntity.reduce((s, e) => s + e.paidAmount, 0);

  return {
    byEntity,
    summary: {
      totalAmount: grandTotal,
      paidAmount: grandPaid,
      outstandingAmount: grandTotal - grandPaid,
      entityCount: byEntity.length,
      collectionRate: grandTotal > 0 ? Math.round((grandPaid / grandTotal) * 100) : 0,
    },
  };
}
