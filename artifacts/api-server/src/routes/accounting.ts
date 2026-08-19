import { Router } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { db, pool } from "@workspace/db";
import {
  counterpartiesTable, accountingDocumentsTable, documentItemsTable,
  accountingIntegrationsTable, legalEntitiesTable, usersTable, channelConfigsTable,
} from "@workspace/db";
import { eq, and, desc, asc, ilike, or, sql, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

const PUBLIC_DOCUMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getPublicDocumentSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("SESSION_SECRET or JWT_SECRET is required for public document links");
  return secret;
}

function createPublicDocumentToken(documentId: number, organizationId: number): string {
  const payload = Buffer.from(JSON.stringify({
    documentId,
    organizationId,
    expiresAt: Date.now() + PUBLIC_DOCUMENT_TTL_MS,
  })).toString("base64url");
  const signature = createHmac("sha256", getPublicDocumentSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyPublicDocumentToken(token: string): { documentId: number; organizationId: number } | null {
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = createHmac("sha256", getPublicDocumentSecret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      !Number.isInteger(decoded.documentId) ||
      !Number.isInteger(decoded.organizationId) ||
      !Number.isFinite(decoded.expiresAt) ||
      decoded.expiresAt < Date.now()
    ) return null;
    return { documentId: decoded.documentId, organizationId: decoded.organizationId };
  } catch {
    return null;
  }
}

function getPublicDocumentBaseUrl(): string {
  const configuredOrigin = process.env.PUBLIC_APP_URL
    || process.env.PUBLIC_APP_ORIGIN
    || process.env.FRONTEND_URL
    || (process.env.NODE_ENV !== "production"
      ? process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
      : undefined);
  if (!configuredOrigin) {
    throw new Error("PUBLIC_APP_URL is required for public document links in production");
  }
  const parsed = new URL(configuredOrigin.includes("://") ? configuredOrigin : `https://${configuredOrigin}`);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Public document origin must use HTTPS");
  }
  return parsed.origin;
}

function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Public, signed document view. The HMAC token contains tenant and expiry data,
// so no unauthenticated caller can enumerate documents by numeric id.
router.get("/public/documents/:token", async (req, res) => {
  try {
    const access = verifyPublicDocumentToken(req.params.token);
    if (!access) return res.status(404).send("Документ не знайдено або посилання прострочене");

    const { rows: docs } = await pool.query(
      `SELECT *
       FROM accounting_documents
       WHERE id = $1 AND organization_id = $2 AND doc_type IN ('act', 'invoice')
       LIMIT 1`,
      [access.documentId, access.organizationId],
    );
    const doc = docs[0];
    if (!doc) return res.status(404).send("Документ не знайдено");

    const [{ rows: items }, { rows: entities }, { rows: counterparties }] = await Promise.all([
      pool.query(`SELECT * FROM document_items WHERE document_id = $1 ORDER BY sort_order, id`, [doc.id]),
      doc.legal_entity_id
        ? pool.query(`SELECT * FROM legal_entities WHERE id = $1 AND organization_id = $2 LIMIT 1`, [doc.legal_entity_id, access.organizationId])
        : Promise.resolve({ rows: [] }),
      doc.counterparty_id
        ? pool.query(`SELECT * FROM counterparties WHERE id = $1 AND organization_id = $2 LIMIT 1`, [doc.counterparty_id, access.organizationId])
        : Promise.resolve({ rows: [] }),
    ]);

    const generatedHtml = doc.doc_type === "act"
      ? generateActHtml(doc, items, entities[0], counterparties[0])
      : generateInvoiceHtml(doc, items, entities[0], counterparties[0]);
    const html = generatedHtml
      .replace("</style>", `
        .public-document-actions{display:flex;gap:10px;justify-content:center;margin:0 0 20px}
        .public-document-actions button{border:0;border-radius:8px;padding:10px 18px;background:#111827;color:white;font-weight:700;cursor:pointer}
        @media print{.public-document-actions{display:none}}
      </style>`)
      .replace("<body>", `<body><div class="public-document-actions"><button onclick="window.print()">Друкувати / Зберегти PDF</button></div>`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store");
    res.send(html);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.use(requireAuth);

// ─── Document number generation ───────────────────────────────────────────────
async function genDocNumber(orgId: number, type: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefixes: Record<string, string> = {
    contract: "Д", invoice: "Р", act: "А", tax_invoice: "ПН",
    credit_note: "КПН", payment_order: "ПД", reconciliation: "ЗВ", expense: "ВН", other: "Д",
  };
  const prefix = prefixes[type] || "Д";
  const count = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM accounting_documents 
    WHERE organization_id = ${orgId} AND doc_type = ${type}::acc_doc_type
    AND EXTRACT(YEAR FROM doc_date) = ${year}
  `);
  const n = parseInt((count.rows[0] as any)?.cnt || "0") + 1;
  if (type === "tax_invoice") return `${prefix}-${year}-${String(n).padStart(6, "0")}`;
  return `${prefix}-${year}-${String(n).padStart(4, "0")}`;
}

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
router.get("/summary", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const year = new Date().getFullYear();
    const [totals, byType, overdue, counterpartyCnt, legalEntitiesCnt] = await Promise.all([
      db.execute(sql`
        SELECT 
          COUNT(*) as total_docs,
          SUM(total_amount) as total_amount,
          SUM(paid_amount) as paid_amount,
          SUM(total_amount - paid_amount) as receivable
        FROM accounting_documents 
        WHERE organization_id = ${orgId}
        AND EXTRACT(YEAR FROM doc_date) = ${year}
      `),
      db.execute(sql`
        SELECT doc_type, status, COUNT(*) as cnt, SUM(total_amount) as amount
        FROM accounting_documents 
        WHERE organization_id = ${orgId}
        GROUP BY doc_type, status ORDER BY doc_type, status
      `),
      db.execute(sql`
        SELECT COUNT(*) as cnt, SUM(total_amount - paid_amount) as amount
        FROM accounting_documents 
        WHERE organization_id = ${orgId} AND status = 'overdue'
      `),
      db.execute(sql`SELECT COUNT(*) as cnt FROM counterparties WHERE organization_id = ${orgId} AND is_active = true`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM legal_entities WHERE organization_id = ${orgId} AND is_active = true`),
    ]);

    res.json({
      totalDocs: parseInt((totals.rows[0] as any)?.total_docs || "0"),
      totalAmount: parseFloat((totals.rows[0] as any)?.total_amount || "0"),
      paidAmount: parseFloat((totals.rows[0] as any)?.paid_amount || "0"),
      receivable: parseFloat((totals.rows[0] as any)?.receivable || "0"),
      overdueDocs: parseInt((overdue.rows[0] as any)?.cnt || "0"),
      overdueAmount: parseFloat((overdue.rows[0] as any)?.amount || "0"),
      counterpartyCount: parseInt((counterpartyCnt.rows[0] as any)?.cnt || "0"),
      legalEntityCount: parseInt((legalEntitiesCnt.rows[0] as any)?.cnt || "0"),
      byType: overdue.rows,
      breakdown: byType.rows,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── LEGAL ENTITIES ───────────────────────────────────────────────────────────
router.get("/legal-entities", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const entities = await db.select().from(legalEntitiesTable)
      .where(eq(legalEntitiesTable.organizationId, orgId))
      .orderBy(desc(legalEntitiesTable.isDefault), asc(legalEntitiesTable.id));
    res.json({ entities });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/legal-entities", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { name, shortName, fullName, type, edrpou, ipn, vatNumber, isVatPayer,
      iban, bank, mfo, director, accountant, phone, email, legalAddress, actualAddress,
      liqpayPublicKey, liqpayPrivateKey, isDefault } = req.body;

    if (isDefault) {
      await db.execute(sql`UPDATE legal_entities SET is_default = false WHERE organization_id = ${orgId}`);
    }

    const [entity] = await db.execute(sql`
      INSERT INTO legal_entities (organization_id, name, short_name, full_name, type, edrpou, ipn, vat_number, is_vat_payer, iban, bank, mfo, director, accountant, phone, email, legal_address, actual_address, liqpay_public_key, liqpay_private_key, is_default)
      VALUES (${orgId}, ${name}, ${shortName || null}, ${fullName || null}, ${type || 'fop'}, ${edrpou || null}, ${ipn || null}, ${vatNumber || null}, ${isVatPayer || false}, ${iban || null}, ${bank || null}, ${mfo || null}, ${director || null}, ${accountant || null}, ${phone || null}, ${email || null}, ${legalAddress || null}, ${actualAddress || null}, ${liqpayPublicKey || null}, ${liqpayPrivateKey || null}, ${isDefault || false})
      RETURNING *
    `);
    res.json({ entity });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/legal-entities/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId = req.user?.organizationId;
    if (!orgId) { res.status(401).json({ error: "Unauthorized" }); return; }

    // Explicit allowlist — never use arbitrary body keys in SQL (SQL-injection + org_id overwrite risk)
    const {
      name, shortName, fullName, type, edrpou, ipn, vatNumber, isVatPayer,
      iban, bank, mfo, director, accountant, phone, email,
      legalAddress, actualAddress, liqpayPublicKey, liqpayPrivateKey, isDefault, isActive,
    } = req.body;

    // If marking as default, clear all others first (org-scoped)
    if (isDefault) {
      await db.execute(sql`UPDATE legal_entities SET is_default = false WHERE organization_id = ${orgId}`);
    }

    // Build safe parameterized update
    const db_ = (db as any).$client;
    const updates: string[] = ["updated_at = NOW()"];
    const params: any[] = [id, orgId];
    let idx = 3;
    const addField = (col: string, val: any) => {
      if (val !== undefined) { updates.push(`${col} = $${idx++}`); params.push(val); }
    };
    addField("name", name);
    addField("short_name", shortName);
    addField("full_name", fullName);
    addField("type", type);
    addField("edrpou", edrpou);
    addField("ipn", ipn);
    addField("vat_number", vatNumber);
    addField("is_vat_payer", isVatPayer);
    addField("iban", iban);
    addField("bank", bank);
    addField("mfo", mfo);
    addField("director", director);
    addField("accountant", accountant);
    addField("phone", phone);
    addField("email", email);
    addField("legal_address", legalAddress);
    addField("actual_address", actualAddress);
    addField("liqpay_public_key", liqpayPublicKey);
    addField("liqpay_private_key", liqpayPrivateKey);
    addField("is_default", isDefault);
    addField("is_active", isActive);

    const { rows } = await db_.query(
      `UPDATE legal_entities SET ${updates.join(", ")} WHERE id = $1 AND organization_id = $2 RETURNING *`,
      params,
    );
    res.json({ entity: rows[0] || null });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── COUNTERPARTIES FROM PAID INVOICES ───────────────────────────────────────
router.get("/counterparties-from-invoices", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const db_ = db as any;
    const rows = await db_.$client.query(`
      SELECT
        i.counterparty_name AS name,
        i.counterparty_edrpou AS edrpou,
        i.buyer_vat_number AS vat_number,
        i.buyer_address AS address,
        COUNT(*) AS invoice_count,
        SUM(i.amount)::float AS total_amount,
        MAX(i.paid_at) AS last_paid_at
      FROM invoices i
      INNER JOIN legal_entities le ON le.id = i.legal_entity_id AND le.organization_id = $1
      WHERE i.counterparty_name IS NOT NULL
      GROUP BY i.counterparty_name, i.counterparty_edrpou, i.buyer_vat_number, i.buyer_address
      ORDER BY MAX(i.paid_at) DESC NULLS LAST
    `, [orgId]);
    res.json({ counterparties: rows.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── UNIFIED INVOICE LIST ─────────────────────────────────────────────────────
// Booking invoices live in `invoices`, while manually created accounting invoices
// live in `accounting_documents`. The UI must show both in one "Рахунки" list.
router.get("/invoices", async (req: any, res) => {
  try {
    const orgId = Number(req.user?.organizationId);
    if (!orgId) return res.status(403).json({ error: "Виберіть тенанта для перегляду рахунків" });

    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : null;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : null;
    const legalEntityId = req.query.legalEntityId ? Number(req.query.legalEntityId) : null;

    if (legalEntityId !== null && (!Number.isInteger(legalEntityId) || legalEntityId <= 0)) {
      return res.status(400).json({ error: "Некоректна юридична особа" });
    }

    const { rows } = await pool.query(
      `SELECT *
       FROM (
         SELECT
           'booking_invoice'::text AS source,
           i.id,
           i.invoice_number AS "invoiceNumber",
           i.booking_id AS "bookingId",
           i.guest_id AS "guestId",
           i.invoice_type::text AS "invoiceType",
           i.status::text AS status,
           i.amount,
           i.tax_amount AS "taxAmount",
           i.paid_amount AS "paidAmount",
           i.currency,
           i.description,
           i.due_date AS "dueDate",
           i.created_at AS "createdAt",
           i.legal_entity_id AS "legalEntityId",
           i.counterparty_name AS "counterpartyName",
           i.counterparty_edrpou AS "counterpartyEdrpou",
           i.buyer_address AS "buyerAddress",
           i.buyer_vat_number AS "buyerVatNumber",
           i.invoice_items AS "invoiceItems",
           i.seller_snapshot AS "sellerSnapshot"
         FROM invoices i
         WHERE i.organization_id = $1

         UNION ALL

         SELECT
           'accounting_document'::text AS source,
           d.id,
           d.doc_number AS "invoiceNumber",
           d.booking_id AS "bookingId",
           NULL::integer AS "guestId",
           'other'::text AS "invoiceType",
           d.status::text AS status,
           d.total_amount AS amount,
           d.vat_amount AS "taxAmount",
           d.paid_amount AS "paidAmount",
           d.currency,
           COALESCE(d.subject, d.description) AS description,
           d.due_date::timestamp AS "dueDate",
           d.doc_date::timestamp AS "createdAt",
           d.legal_entity_id AS "legalEntityId",
           d.counterparty_name AS "counterpartyName",
           d.counterparty_edrpou AS "counterpartyEdrpou",
           NULL::text AS "buyerAddress",
           NULL::text AS "buyerVatNumber",
           NULL::jsonb AS "invoiceItems",
           NULL::jsonb AS "sellerSnapshot"
         FROM accounting_documents d
         WHERE d.organization_id = $1 AND d.doc_type = 'invoice'
       ) AS unified_invoices
       WHERE ($2::timestamp IS NULL OR "createdAt" >= $2::timestamp)
         AND ($3::timestamp IS NULL OR "createdAt" < ($3::date + INTERVAL '1 day'))
         AND ($4::integer IS NULL OR "legalEntityId" = $4)
       ORDER BY "createdAt" DESC, id DESC`,
      [orgId, dateFrom, dateTo, legalEntityId],
    );

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CREATE ACT FROM INVOICE ──────────────────────────────────────────────────
router.post("/documents/from-invoice/:invoiceId", async (req: any, res) => {
  try {
    const orgId = Number(req.user?.organizationId);
    const userId = req.user?.id;
    const invoiceId = parseInt(req.params.invoiceId);
    const db_ = db as any;

    if (!orgId) return res.status(403).json({ error: "Виберіть тенанта для формування акта" });
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({ error: "Некоректний рахунок" });
    }

    const {
      vatMode = "with_vat", adjustedAmount, subject,
      counterpartyOverride, legalEntityIdOverride, invoiceSource = "booking_invoice",
    } = req.body;

    if (!["booking_invoice", "accounting_document"].includes(invoiceSource)) {
      return res.status(400).json({ error: "Некоректне джерело рахунку" });
    }

    const invRow = invoiceSource === "accounting_document"
      ? await db_.$client.query(
          `SELECT
             d.id,
             d.id AS source_doc_id,
             d.organization_id,
             d.total_amount AS amount,
             d.vat_amount AS tax_amount,
             COALESCE(d.subject, d.description) AS description,
             d.currency,
             d.legal_entity_id,
             d.counterparty_id,
             d.counterparty_name,
             d.counterparty_edrpou,
             cp.legal_address AS buyer_address,
             cp.vat_number AS buyer_vat_number,
             d.booking_id
           FROM accounting_documents d
           LEFT JOIN counterparties cp
             ON cp.id = d.counterparty_id AND cp.organization_id = d.organization_id
           WHERE d.id = $1 AND d.organization_id = $2 AND d.doc_type = 'invoice'
           LIMIT 1`,
          [invoiceId, orgId],
        )
      : await db_.$client.query(
          `SELECT i.*
           FROM invoices i
           WHERE i.id = $1 AND i.organization_id = $2
           LIMIT 1`,
          [invoiceId, orgId],
        );

    if (!invRow.rows.length) return res.status(404).json({ error: "Рахунок не знайдено" });
    const inv = invRow.rows[0];

    const sourceTotal = parseFloat(inv.amount || "0");
    const requestedTotal = adjustedAmount === undefined || adjustedAmount === null || adjustedAmount === ""
      ? sourceTotal
      : parseFloat(adjustedAmount);
    if (!Number.isFinite(sourceTotal) || sourceTotal <= 0) {
      return res.status(400).json({ error: "Сума акта має бути більшою за нуль" });
    }
    if (!Number.isFinite(requestedTotal) || Math.abs(requestedTotal - sourceTotal) > 0.009) {
      return res.status(400).json({
        error: "Сума акта повинна відповідати сумі рахунку. Для іншої суми створіть окремий рахунок.",
      });
    }

    const sourceItems = invoiceSource === "accounting_document"
      ? (await db_.$client.query(
          `SELECT description, unit, quantity, unit_price, vat_rate, vat_amount, total_price
           FROM document_items
           WHERE document_id = $1
           ORDER BY sort_order, id`,
          [invoiceId],
        )).rows
      : (() => {
          if (Array.isArray(inv.invoice_items)) return inv.invoice_items;
          if (typeof inv.invoice_items === "string") {
            try {
              const parsed = JSON.parse(inv.invoice_items);
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          }
          return [];
        })();

    const normalizedItems = sourceItems.map((item: any, index: number) => {
      const quantity = parseFloat(item.quantity ?? item.qty ?? "1") || 1;
      const totalPrice = parseFloat(item.total_price ?? item.totalPrice ?? item.amount ?? "0") || 0;
      const unitPrice = parseFloat(item.unit_price ?? item.unitPrice ?? item.price ?? String(totalPrice / quantity)) || 0;
      const rawVatRate = String(item.vat_rate ?? item.vatRate ?? (vatMode === "with_vat" ? "20" : "exempt"));
      const normalizedVatRate = ["20", "7", "0", "exempt"].includes(rawVatRate) ? rawVatRate : "exempt";
      const numericVatRate = normalizedVatRate === "exempt" ? 0 : parseFloat(normalizedVatRate);
      const explicitVat = parseFloat(item.vat_amount ?? item.vatAmount);
      const itemVatAmount = Number.isFinite(explicitVat)
        ? explicitVat
        : numericVatRate > 0
          ? totalPrice - totalPrice / (1 + numericVatRate / 100)
          : 0;
      return {
        description: item.description || item.name || subject || inv.description || "Послуги з проживання",
        unit: item.unit || "послуга",
        quantity,
        unitPrice,
        vatRate: normalizedVatRate,
        vatAmount: itemVatAmount,
        totalPrice,
        sortOrder: index,
      };
    }).filter((item: any) => item.totalPrice > 0);

    const total = sourceTotal;
    let subtotal: number, vatAmount: number, totalAmount: number;

    if (normalizedItems.length > 0) {
      totalAmount = normalizedItems.reduce((sum: number, item: any) => sum + item.totalPrice, 0);
      vatAmount = normalizedItems.reduce((sum: number, item: any) => sum + item.vatAmount, 0);
      subtotal = totalAmount - vatAmount;
      if (Math.abs(totalAmount - sourceTotal) > 0.02) {
        return res.status(400).json({
          error: "Сума позицій рахунку не відповідає загальній сумі. Виправте рахунок перед формуванням акта.",
        });
      }
    } else if (vatMode === "no_vat") {
      subtotal = total; vatAmount = 0; totalAmount = total;
    } else {
      subtotal = total / 1.2; vatAmount = total - subtotal; totalAmount = total;
    }

    // Resolve legal entity — override from dialog or from invoice
    const resolvedLeId = legalEntityIdOverride || inv.legal_entity_id || null;

    // Verify resolved legal entity belongs to this org
    if (resolvedLeId) {
      const leCheck = await db_.$client.query(
        `SELECT id FROM legal_entities WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [resolvedLeId, orgId]
      );
      if (!leCheck.rows.length) return res.status(403).json({ error: "Юридична особа не знайдена" });
    }

    const docNumber = await genDocNumber(orgId, "act");

    // Find or create counterparty — merge data from invoice + user edits
    const cpName = counterpartyOverride?.name || inv.counterparty_name;
    const cpEdrpou = counterpartyOverride?.edrpou || inv.counterparty_edrpou;
    const cpAddress = counterpartyOverride?.address || inv.buyer_address;
    const cpVatNumber = counterpartyOverride?.vatNumber || inv.buyer_vat_number;

    let cpId: number | null = null;
    if (cpName) {
      const existing = await db_.$client.query(
        `SELECT id FROM counterparties WHERE organization_id = $1 AND (name = $2 OR (edrpou IS NOT NULL AND edrpou = $3)) LIMIT 1`,
        [orgId, cpName, cpEdrpou || ""]
      );
      if (existing.rows.length) {
        cpId = existing.rows[0].id;
        // Update with latest data if fields provided
        await db_.$client.query(
          `UPDATE counterparties SET
            name = $1,
            edrpou = COALESCE($2, edrpou),
            vat_number = COALESCE($3, vat_number),
            legal_address = COALESCE($4, legal_address),
            is_vat_payer = $5,
            updated_at = NOW()
           WHERE id = $6`,
          [cpName, cpEdrpou || null, cpVatNumber || null, cpAddress || null, vatMode === "with_vat", cpId]
        );
      } else {
        const inserted = await db_.$client.query(
          `INSERT INTO counterparties (organization_id, name, edrpou, vat_number, legal_address, is_vat_payer)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [orgId, cpName, cpEdrpou || null, cpVatNumber || null, cpAddress || null, vatMode === "with_vat"]
        );
        cpId = inserted.rows[0].id;
      }
    }

    const [doc] = await db.insert(accountingDocumentsTable).values({
      organizationId: orgId,
      docType: "act" as any,
      status: "draft" as any,
      docNumber,
      docDate: new Date().toISOString().split("T")[0] as any,
      legalEntityId: resolvedLeId,
      counterpartyId: cpId,
      counterpartyName: cpName || null,
      counterpartyEdrpou: cpEdrpou || null,
      subject: subject || inv.description || "Послуги з проживання",
      currency: inv.currency || "UAH",
      subtotal: subtotal.toFixed(2),
      vatAmount: vatAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      bookingId: inv.booking_id || null,
      parentDocId: invoiceSource === "accounting_document" ? inv.source_doc_id : null,
      createdById: userId,
    }).returning();

    const itemsToCreate = normalizedItems.length > 0
      ? normalizedItems.map((item: any) => ({
          documentId: doc.id,
          sortOrder: item.sortOrder,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity.toFixed(3),
          unitPrice: item.unitPrice.toFixed(2),
          vatRate: item.vatRate as any,
          vatAmount: item.vatAmount.toFixed(2),
          totalPrice: item.totalPrice.toFixed(2),
        }))
      : [{
          documentId: doc.id,
          sortOrder: 0,
          description: subject || inv.description || "Послуги з проживання",
          unit: "послуга",
          quantity: "1",
          unitPrice: subtotal.toFixed(2),
          vatRate: (vatMode === "no_vat" ? "exempt" : "20") as any,
          vatAmount: vatAmount.toFixed(2),
          totalPrice: totalAmount.toFixed(2),
        }];
    await db.insert(documentItemsTable).values(itemsToCreate);

    // Fetch full doc with items and legal entity
    const items = await db.select().from(documentItemsTable).where(eq(documentItemsTable.documentId, doc.id));
    let legalEntity = null;
    if (doc.legalEntityId) {
      const [le] = await db.select().from(legalEntitiesTable).where(eq(legalEntitiesTable.id, doc.legalEntityId));
      legalEntity = le;
    }

    res.json({ document: doc, items, legalEntity, invoiceRef: inv });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── SEND ACCOUNTING DOCUMENT ─────────────────────────────────────────────────
router.post("/documents/:id/send", async (req: any, res) => {
  try {
    const orgId = Number(req.user?.organizationId);
    const id = parseInt(req.params.id);
    const channel = typeof req.body?.channel === "string" ? req.body.channel : "link";
    const recipient = typeof req.body?.recipient === "string" ? req.body.recipient.trim() : "";

    if (!orgId) return res.status(403).json({ error: "Виберіть тенанта для надсилання документа" });
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Некоректний документ" });
    if (!["telegram", "sms", "link"].includes(channel)) {
      return res.status(400).json({ error: "Некоректний канал надсилання" });
    }
    if (channel !== "link" && !recipient) {
      return res.status(400).json({ error: "Вкажіть отримувача" });
    }

    const { rows } = await pool.query(
      `SELECT *
       FROM accounting_documents
       WHERE id = $1 AND organization_id = $2 AND doc_type IN ('act', 'invoice')
       LIMIT 1`,
      [id, orgId],
    );
    const document = rows[0];
    if (!document) return res.status(404).json({ error: "Документ не знайдено" });

    const publicToken = createPublicDocumentToken(id, orgId);
    const documentUrl = `${getPublicDocumentBaseUrl()}/api/accounting/public/documents/${encodeURIComponent(publicToken)}`;
    const documentLabel = document.doc_type === "act" ? "Акт" : "Рахунок";
    const documentName = document.doc_type === "act" ? "акт надання послуг" : "рахунок";

    if (channel === "telegram") {
      const [cfg] = await db.select().from(channelConfigsTable)
        .where(and(
          eq(channelConfigsTable.organizationId, orgId),
          eq(channelConfigsTable.channel, "telegram" as any),
        ));
      const botToken = cfg?.config?.bot_token as string | undefined;
      if (!botToken) {
        return res.status(400).json({
          error: "telegram_not_configured",
          message: "Telegram бот не налаштований. Перейдіть у Налаштування → Інбокс та підключіть бота.",
        });
      }

      const total = Number(document.total_amount).toLocaleString("uk-UA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const text = [
        `📄 <b>${documentLabel} № ${escapeTelegramHtml(document.doc_number)}</b>`,
        document.counterparty_name ? `👤 ${escapeTelegramHtml(document.counterparty_name)}` : null,
        document.subject ? `📋 ${escapeTelegramHtml(document.subject)}` : null,
        "",
        `💰 <b>Сума: ${total} ₴</b>`,
        "",
        `👉 <a href="${documentUrl}">Переглянути ${documentName}</a>`,
      ].filter(line => line !== null).join("\n");

      const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: recipient,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
      });
      const tgData = await tgResponse.json() as any;
      if (!tgResponse.ok) {
        const message = tgData?.description || "Telegram API error";
        return res.status(400).json({ error: "telegram_error", message });
      }
    }

    await pool.query(
      `UPDATE accounting_documents
       SET status = CASE WHEN status IN ('draft', 'issued') THEN 'sent'::acc_doc_status ELSE status END,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );

    res.json({
      success: true,
      channel,
      recipient,
      documentUrl,
      documentNumber: document.doc_number,
      documentType: document.doc_type,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── COUNTERPARTIES ───────────────────────────────────────────────────────────
router.get("/counterparties", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { search } = req.query;
    let query = db.select().from(counterpartiesTable)
      .where(eq(counterpartiesTable.organizationId, orgId)).$dynamic();
    if (search) {
      query = query.where(and(
        eq(counterpartiesTable.organizationId, orgId),
        or(
          ilike(counterpartiesTable.name, `%${search}%`),
          ilike(counterpartiesTable.edrpou, `%${search}%`),
          ilike(counterpartiesTable.email, `%${search}%`),
        )
      ));
    }
    const counterparties = await query.orderBy(asc(counterpartiesTable.name));
    res.json({ counterparties });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/counterparties", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { name, shortName, type, edrpou, ipn, vatNumber, isVatPayer,
      legalAddress, actualAddress, phone, email, website,
      iban, bankName, bankMfo, director, accountant, contactPerson, notes } = req.body;

    const [cp] = await db.insert(counterpartiesTable).values({
      organizationId: orgId, name, shortName, type: type || "legal",
      edrpou, ipn, vatNumber, isVatPayer: isVatPayer || false,
      legalAddress, actualAddress, phone, email, website,
      iban, bankName, bankMfo, director, accountant, contactPerson, notes,
    }).returning();
    res.json({ counterparty: cp });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/counterparties/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId = req.user?.organizationId;
    const { name, shortName, edrpou, ipn, vatNumber, isVatPayer, legalAddress, actualAddress,
      phone, email, iban, bankName, bankMfo, director, contactPerson, notes, isActive } = req.body;

    const [updated] = await db.update(counterpartiesTable).set({
      name: name ?? undefined, shortName: shortName ?? undefined,
      edrpou: edrpou ?? undefined, ipn: ipn ?? undefined,
      vatNumber: vatNumber ?? undefined, isVatPayer: isVatPayer ?? undefined,
      legalAddress: legalAddress ?? undefined, actualAddress: actualAddress ?? undefined,
      phone: phone ?? undefined, email: email ?? undefined,
      iban: iban ?? undefined, bankName: bankName ?? undefined,
      bankMfo: bankMfo ?? undefined, director: director ?? undefined,
      contactPerson: contactPerson ?? undefined, notes: notes ?? undefined,
      isActive: isActive ?? undefined, updatedAt: new Date(),
    }).where(and(eq(counterpartiesTable.id, id), eq(counterpartiesTable.organizationId, orgId)))
      .returning();
    res.json({ counterparty: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── ACCOUNTING DOCUMENTS ─────────────────────────────────────────────────────
router.get("/documents", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { type, status, search, year, limit: lim } = req.query;

    // Build parameterized query — never use sql.raw with user input
    const ACC_DOC_TYPES = ["invoice","act","contract","estimate","payment_order","tax_invoice","other"];
    const ACC_DOC_STATUSES_GET = ["draft","sent","approved","signed","paid","cancelled","overdue"];
    const conditions: string[] = ["d.organization_id = $1"];
    const params: any[] = [orgId];
    const add = (clause: string, val: any) => { params.push(val); conditions.push(clause.replace("?", `$${params.length}`)); };
    const selectedTypes = typeof type === "string"
      ? type.split(",").filter(value => ACC_DOC_TYPES.includes(value))
      : [];
    if (selectedTypes.length > 0) {
      const placeholders = selectedTypes.map(value => {
        params.push(value);
        return `$${params.length}::acc_doc_type`;
      });
      conditions.push(`d.doc_type IN (${placeholders.join(", ")})`);
    }
    if (status && ACC_DOC_STATUSES_GET.includes(status as string)) add("d.status = ?::acc_doc_status", status);
    if (year && /^\d{4}$/.test(year as string)) add("EXTRACT(YEAR FROM d.doc_date) = ?", parseInt(year as string));
    if (search) add("(d.doc_number ILIKE ? OR d.counterparty_name ILIKE ? OR d.subject ILIKE ?)", `%${search}%`);
    // search adds one param but three placeholders — fix:
    if (search) {
      // Remove the last added search clause and re-add with proper multi-placeholder
      conditions.pop(); params.pop();
      const s = `%${(search as string).replace(/%/g, "\\%")}%`;
      params.push(s); params.push(s); params.push(s);
      conditions.push(`(d.doc_number ILIKE $${params.length - 2} OR d.counterparty_name ILIKE $${params.length - 1} OR d.subject ILIKE $${params.length})`);
    }
    const db_ = (db as any).$client;
    const docs = await db_.query(
      `SELECT d.*, le.name as legal_entity_name, le.short_name as legal_entity_short_name,
              c.name as counterparty_name_from_table, c.edrpou as counterparty_edrpou_from_table
       FROM accounting_documents d
       LEFT JOIN legal_entities le ON le.id = d.legal_entity_id
       LEFT JOIN counterparties c ON c.id = d.counterparty_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY d.doc_date DESC, d.id DESC
       LIMIT $${params.length + 1}`,
      [...params, parseInt(lim as string) || 200],
    );

    // Summary stats use the same document types as the list so invoices do not
    // inflate the "Договори та акти" totals.
    const statConditions = ["organization_id = $1"];
    const statParams: any[] = [orgId];
    if (selectedTypes.length > 0) {
      const placeholders = selectedTypes.map(value => {
        statParams.push(value);
        return `$${statParams.length}::acc_doc_type`;
      });
      statConditions.push(`doc_type IN (${placeholders.join(", ")})`);
    }
    const stats = await db_.query(
      `SELECT
         COUNT(*) as total,
         SUM(total_amount) as total_amount,
         SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as paid,
         SUM(CASE WHEN status = 'overdue' THEN total_amount - paid_amount ELSE 0 END) as overdue,
         SUM(CASE WHEN status IN ('issued','sent') THEN total_amount - paid_amount ELSE 0 END) as pending
       FROM accounting_documents
       WHERE ${statConditions.join(" AND ")}`,
      statParams,
    );

    res.json({ documents: docs.rows, stats: stats.rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/documents/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId = req.user?.organizationId;
    const [doc] = await db.select().from(accountingDocumentsTable)
      .where(and(eq(accountingDocumentsTable.id, id), eq(accountingDocumentsTable.organizationId, orgId)));
    if (!doc) return res.status(404).json({ error: "Документ не знайдено" });

    const items = await db.select().from(documentItemsTable)
      .where(eq(documentItemsTable.documentId, id))
      .orderBy(asc(documentItemsTable.sortOrder));

    let legalEntity = null;
    if (doc.legalEntityId) {
      [legalEntity] = await db.select().from(legalEntitiesTable).where(eq(legalEntitiesTable.id, doc.legalEntityId));
    }
    let counterparty = null;
    if (doc.counterpartyId) {
      [counterparty] = await db.select().from(counterpartiesTable).where(eq(counterpartiesTable.id, doc.counterpartyId));
    }

    res.json({ document: doc, items, legalEntity, counterparty });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/documents", async (req: any, res) => {
  try {
    const userId = req.user?.userId ?? req.user?.id ?? null;
    let orgId: number | null = req.user?.organizationId ? Number(req.user.organizationId) : null;

    // Fallback: look up orgId from DB (handles old tokens missing organizationId)
    if (!orgId && userId) {
      const [u] = await db.select({ organizationId: usersTable.organizationId })
        .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      orgId = u?.organizationId ?? null;
    }

    const {
      docType, docDate, dueDate, deliveryDate,
      legalEntityId, counterpartyId, counterpartyName, counterpartyEdrpou,
      subject, description, paymentTerms, notes, currency, bookingId,
      items = [], status,
    } = req.body;

    if (!orgId) return res.status(400).json({ error: "Super-admin не може створювати документи напряму. Спочатку увійдіть від імені тенанта." });
    if (!docType || !docDate) return res.status(400).json({ error: "Тип та дата обов'язкові" });

    const docNumber = await genDocNumber(orgId, docType);

    // Calculate totals from items
    let subtotal = 0, vatAmount = 0, totalAmount = 0;
    if (items.length > 0) {
      for (const item of items) {
        const qty = parseFloat(item.quantity || 1);
        const price = parseFloat(item.unitPrice || 0);
        const vatRate = item.vatRate === "exempt" ? 0 : parseFloat(item.vatRate || "20") / 100;
        const lineTotal = qty * price;
        const lineVat = lineTotal * vatRate;
        subtotal += lineTotal;
        vatAmount += lineVat;
        totalAmount += lineTotal + lineVat;
      }
    } else {
      subtotal = parseFloat(req.body.subtotal || 0);
      vatAmount = parseFloat(req.body.vatAmount || 0);
      totalAmount = parseFloat(req.body.totalAmount || 0);
    }

    // Round to 2 decimal places (numeric(14,2) column constraint)
    const subtotalStr   = subtotal.toFixed(2);
    const vatAmountStr  = vatAmount.toFixed(2);
    const totalAmountStr = totalAmount.toFixed(2);

    const [doc] = await db.insert(accountingDocumentsTable).values({
      organizationId: orgId, docType: docType as any, status: (status || "draft") as any,
      docNumber, docDate, dueDate: dueDate || null, deliveryDate: deliveryDate || null,
      legalEntityId: legalEntityId || null, counterpartyId: counterpartyId || null,
      counterpartyName: counterpartyName || null, counterpartyEdrpou: counterpartyEdrpou || null,
      subject: subject || null, description: description || null, paymentTerms: paymentTerms || null,
      notes: notes || null, currency: currency || "UAH",
      subtotal: subtotalStr, vatAmount: vatAmountStr, totalAmount: totalAmountStr,
      bookingId: bookingId || null, createdById: userId,
    }).returning();

    // Insert items
    if (items.length > 0) {
      const itemValues = items.map((item: any, i: number) => {
        const qty = parseFloat(item.quantity || 1);
        const price = parseFloat(item.unitPrice || 0);
        const vatRate = item.vatRate === "exempt" ? 0 : parseFloat(item.vatRate || "20") / 100;
        const lineTotal = qty * price;
        const lineVat = lineTotal * vatRate;
        return {
          documentId: doc.id, sortOrder: i + 1,
          description: item.description, unit: item.unit || "послуга",
          quantity: qty.toString(), unitPrice: price.toString(),
          vatRate: (item.vatRate || "20") as any,
          vatAmount: lineVat.toString(), totalPrice: (lineTotal + lineVat).toString(),
          productCode: item.productCode || null, serviceCode: item.serviceCode || null,
        };
      });
      await db.insert(documentItemsTable).values(itemValues);
    }

    res.json({ document: doc, docNumber });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

const ACC_DOC_STATUSES = ["draft", "signed", "paid", "partially_paid", "cancelled", "overdue"] as const;
router.patch("/documents/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId = req.user?.organizationId;
    if (!orgId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { status, paidAmount, signedAt, paidAt, medocRegNumber, vchasnoId, vchasnoStatus, notes } = req.body;

    // Validate status against known enum
    if (status !== undefined && !ACC_DOC_STATUSES.includes(status)) {
      res.status(422).json({ error: `Invalid document status "${status}". Allowed: ${ACC_DOC_STATUSES.join(", ")}` });
      return;
    }

    // paidAmount must be a non-negative number
    if (paidAmount !== undefined && (isNaN(Number(paidAmount)) || Number(paidAmount) < 0)) {
      res.status(422).json({ error: "paidAmount must be a non-negative number" });
      return;
    }

    // Guard: cannot patch paid/signed documents back to draft without explicit override
    const [doc] = await db.select().from(accountingDocumentsTable)
      .where(and(eq(accountingDocumentsTable.id, id), eq(accountingDocumentsTable.organizationId, orgId)))
      .limit(1);
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    if (["paid", "signed"].includes(doc.status) && status === "draft") {
      res.status(409).json({ error: "Cannot revert a paid or signed document to draft" });
      return;
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (paidAmount !== undefined) updates.paidAmount = Number(paidAmount).toFixed(2);
    if (signedAt !== undefined) updates.signedAt = new Date(signedAt);
    if (paidAt !== undefined) updates.paidAt = new Date(paidAt);
    if (medocRegNumber !== undefined) updates.medocRegNumber = medocRegNumber;
    if (vchasnoId !== undefined) updates.vchasnoId = vchasnoId;
    if (vchasnoStatus !== undefined) updates.vchasnoStatus = vchasnoStatus;
    if (notes !== undefined) updates.notes = notes;

    const [updated] = await db.update(accountingDocumentsTable).set(updates)
      .where(and(eq(accountingDocumentsTable.id, id), eq(accountingDocumentsTable.organizationId, orgId)))
      .returning();

    res.json({ document: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/documents/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId = req.user?.organizationId;
    const [doc] = await db.select({ status: accountingDocumentsTable.status })
      .from(accountingDocumentsTable)
      .where(and(eq(accountingDocumentsTable.id, id), eq(accountingDocumentsTable.organizationId, orgId)));
    if (!doc) return res.status(404).json({ error: "Не знайдено" });
    if (doc.status === "signed" || doc.status === "paid") {
      return res.status(400).json({ error: "Не можна видалити підписаний або оплачений документ" });
    }
    await db.delete(accountingDocumentsTable).where(eq(accountingDocumentsTable.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── SIGN / MARK PAID ─────────────────────────────────────────────────────────
router.post("/documents/:id/sign", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId = req.user?.organizationId;
    const [updated] = await db.update(accountingDocumentsTable)
      .set({ status: "signed", signedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(accountingDocumentsTable.id, id), eq(accountingDocumentsTable.organizationId, orgId)))
      .returning();
    res.json({ document: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/documents/:id/mark-paid", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId = req.user?.organizationId;
    const { paidAmount } = req.body;
    const [doc] = await db.select().from(accountingDocumentsTable)
      .where(and(eq(accountingDocumentsTable.id, id), eq(accountingDocumentsTable.organizationId, orgId)));
    if (!doc) return res.status(404).json({ error: "Не знайдено" });

    const newPaid = parseFloat(paidAmount || doc.totalAmount || "0");
    const isFullyPaid = newPaid >= parseFloat(doc.totalAmount || "0");
    const [updated] = await db.update(accountingDocumentsTable)
      .set({ paidAmount: newPaid.toString(), status: isFullyPaid ? "paid" : "issued", paidAt: isFullyPaid ? new Date() : null, updatedAt: new Date() })
      .where(eq(accountingDocumentsTable.id, id)).returning();
    res.json({ document: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── EXPORT for BAS / M.E.Doc ─────────────────────────────────────────────────
router.get("/documents/:id/export/:format", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId = req.user?.organizationId;
    const { format } = req.params; // bas-xml | medoc-xml | json | csv

    const [doc] = await db.select().from(accountingDocumentsTable)
      .where(and(eq(accountingDocumentsTable.id, id), eq(accountingDocumentsTable.organizationId, orgId)));
    if (!doc) return res.status(404).json({ error: "Не знайдено" });

    const items = await db.select().from(documentItemsTable)
      .where(eq(documentItemsTable.documentId, id)).orderBy(asc(documentItemsTable.sortOrder));
    const [le] = doc.legalEntityId ? await db.select().from(legalEntitiesTable).where(eq(legalEntitiesTable.id, doc.legalEntityId)) : [null];
    const [cp] = doc.counterpartyId ? await db.select().from(counterpartiesTable).where(eq(counterpartiesTable.id, doc.counterpartyId)) : [null];

    if (format === "bas-xml") {
      // BAS XML exchange format (спрощений, для демонстрації)
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ФайлОбміну ВерсіяФормату="1.7" ДатаВиробник="01.01.2025" ЗагальнаКількість="1">
<ЗаголовокФайлу>
  <Відправник>
    <ЄДРПОУ>${(le as any)?.edrpou || ""}</ЄДРПОУ>
    <Найменування>${(le as any)?.name || ""}</Найменування>
  </Відправник>
  <Отримувач>
    <ЄДРПОУ>${doc.counterpartyEdrpou || (cp as any)?.edrpou || ""}</ЄДРПОУ>
    <Найменування>${doc.counterpartyName || (cp as any)?.name || ""}</Найменування>
  </Отримувач>
</ЗаголовокФайлу>
<Документ Порядковий="1" Тип="${doc.docType}" Дата="${doc.docDate}" Номер="${doc.docNumber}">
  <Загальна>
    <СумаБезПДВ>${doc.subtotal}</СумаБезПДВ>
    <СумаПДВ>${doc.vatAmount}</СумаПДВ>
    <СумаЗПДВ>${doc.totalAmount}</СумаЗПДВ>
  </Загальна>
  <Рядки>
    ${items.map((item, i) => `<Рядок НомерРядку="${i+1}">
      <Найменування>${item.description}</Найменування>
      <ОдВим>${item.unit}</ОдВим>
      <Кількість>${item.quantity}</Кількість>
      <Ціна>${item.unitPrice}</Ціна>
      <СтавкаПДВ>${item.vatRate}%</СтавкаПДВ>
      <СумаПДВ>${item.vatAmount}</СумаПДВ>
      <Сума>${item.totalPrice}</Сума>
    </Рядок>`).join("\n    ")}
  </Рядки>
</Документ>
</ФайлОбміну>`;
      const basFilename = encodeURIComponent(doc.docNumber.replace(/\//g, "-")) + "-BAS.xml";
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${basFilename}"`);
      return res.send(xml);
    }

    if (format === "medoc-xml") {
      // M.E.Doc PN format (спрощений)
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DECLAR xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <DECLARHEAD>
    <TIN>${(le as any)?.edrpou || ""}</TIN>
    <C_DOC>ПН</C_DOC>
    <C_DOC_SUB>01</C_DOC_SUB>
    <C_DOC_VER>1</C_DOC_VER>
    <PERIOD_MONTH>${new Date(doc.docDate).getMonth() + 1}</PERIOD_MONTH>
    <PERIOD_YEAR>${new Date(doc.docDate).getFullYear()}</PERIOD_YEAR>
    <C_REG>${(le as any)?.address?.substring(0,2) || "63"}</C_REG>
    <NUM_PN>${doc.series || ""}${doc.docNumber.replace(/\D/g, "")}</NUM_PN>
    <DATE_DOC>${doc.docDate}</DATE_DOC>
    <HNAME>${(le as any)?.name || ""}</HNAME>
    <HTIN>${(le as any)?.edrpou || ""}</HTIN>
    <HKVED>55.10</HKVED>
    <RNAME>${doc.counterpartyName || (cp as any)?.name || ""}</RNAME>
    <RTIN>${doc.counterpartyEdrpou || (cp as any)?.edrpou || ""}</RTIN>
  </DECLARHEAD>
  <TABLEDATA>
    ${items.map((item, i) => `<R${String(i+1).padStart(2,"0")}>
      <RNUM>${i+1}</RNUM>
      <SNAME>${item.description}</SNAME>
      <SKU>${item.unit}</SKU>
      <KOLVO>${item.quantity}</KOLVO>
      <PRICE>${item.unitPrice}</PRICE>
      <SUM>${item.vatAmount}</SUM>
      <TOTAL>${item.totalPrice}</TOTAL>
    </R${String(i+1).padStart(2,"0")}>`).join("\n    ")}
  </TABLEDATA>
</DECLAR>`;
      const medocFilename = encodeURIComponent(doc.docNumber.replace(/\//g, "-")) + "-MEDOC.xml";
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${medocFilename}"`);
      return res.send(xml);
    }

    if (format === "act-ua" || format === "invoice-ua") {
      // Drizzle returns camelCase — normalize to snake_case for HTML generators
      const docSnake = {
        ...doc,
        doc_number:          (doc as any).docNumber          ?? (doc as any).doc_number,
        doc_date:            (doc as any).docDate            ?? (doc as any).doc_date,
        vat_amount:          (doc as any).vatAmount          ?? (doc as any).vat_amount,
        subtotal:            (doc as any).subtotal           ?? (doc as any).subtotal,
        total_amount:        (doc as any).totalAmount        ?? (doc as any).total_amount,
        counterparty_name:   (doc as any).counterpartyName   ?? (doc as any).counterparty_name,
        counterparty_edrpou: (doc as any).counterpartyEdrpou ?? (doc as any).counterparty_edrpou,
        payment_terms:       (doc as any).paymentTerms       ?? (doc as any).payment_terms,
        subject:             (doc as any).subject            ?? (doc as any).subject,
        notes:               (doc as any).notes              ?? (doc as any).notes,
      };
      const itemsSnake = items.map((it: any) => ({
        ...it,
        unit_price:  it.unitPrice  ?? it.unit_price,
        total_price: it.totalPrice ?? it.total_price,
        total_amount: it.totalPrice ?? it.total_amount,
        vat_rate:    it.vatRate    ?? it.vat_rate,
      }));
      const html = format === "act-ua"
        ? generateActHtml(docSnake, itemsSnake, le, cp)
        : generateInvoiceHtml(docSnake, itemsSnake, le, cp);
      const fnameRaw = format === "act-ua" ? `act_${docSnake.doc_number}.html` : `invoice_${docSnake.doc_number}.html`;
      const fnameEncoded = encodeURIComponent(fnameRaw);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${fnameEncoded}`);
      return res.send(html);
    }

    // JSON export (fallback)
    res.json({ document: doc, items, legalEntity: le, counterparty: cp });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Log BAS export
router.post("/documents/:id/mark-exported", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { provider } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (provider === "bas") updates.basExportedAt = new Date();
    if (provider === "medoc") updates.medocSentAt = new Date();
    await db.update(accountingDocumentsTable).set(updates).where(eq(accountingDocumentsTable.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── INTEGRATIONS ─────────────────────────────────────────────────────────────
router.get("/integrations", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const integrations = await db.select().from(accountingIntegrationsTable)
      .where(eq(accountingIntegrationsTable.organizationId, orgId))
      .orderBy(asc(accountingIntegrationsTable.provider));
    res.json({ integrations });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/integrations/:provider", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { provider } = req.params;
    const { isEnabled, config, autoExportDocTypes, autoExportOnSign } = req.body;

    const existing = await db.select().from(accountingIntegrationsTable)
      .where(and(eq(accountingIntegrationsTable.organizationId, orgId), eq(accountingIntegrationsTable.provider, provider as any)));

    const updateData: any = { updatedAt: new Date() };
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
    if (config !== undefined) updateData.config = typeof config === "string" ? config : JSON.stringify(config);
    if (autoExportDocTypes !== undefined) updateData.autoExportDocTypes = JSON.stringify(autoExportDocTypes);
    if (autoExportOnSign !== undefined) updateData.autoExportOnSign = autoExportOnSign;
    if (isEnabled) updateData.status = "active";
    else if (isEnabled === false) updateData.status = "inactive";

    if (existing.length === 0) {
      const [integration] = await db.insert(accountingIntegrationsTable).values({
        organizationId: orgId, provider: provider as any,
        isEnabled: isEnabled || false, status: isEnabled ? "active" : "inactive",
        config: typeof config === "string" ? config : JSON.stringify(config || {}),
        autoExportDocTypes: JSON.stringify(autoExportDocTypes || []),
        autoExportOnSign: autoExportOnSign || false,
      }).returning();
      return res.json({ integration });
    }

    const [updated] = await db.update(accountingIntegrationsTable).set(updateData)
      .where(and(eq(accountingIntegrationsTable.organizationId, orgId), eq(accountingIntegrationsTable.provider, provider as any)))
      .returning();
    res.json({ integration: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/integrations/:provider/test", async (req: any, res) => {
  try {
    const { provider } = req.params;
    // Simulated test connection - in production would call actual API
    await new Promise(r => setTimeout(r, 800));
    const results: Record<string, any> = {
      bas: { success: false, message: "BAS потребує встановленого локального клієнта. Перевірте шлях до папки обміну." },
      medoc: { success: false, message: "M.E.Doc: введіть логін, пароль та ЄДРПОУ для з'єднання з сервером ДПС." },
      vchasno: { success: false, message: "Вчасно: введіть API-ключ для підключення до EDM системи." },
      taxcom: { success: false, message: "Таксер ПРРО: введіть дані ПРРО для підключення." },
      checkbox: { success: false, message: "Checkbox: введіть API-ключ касового апарату." },
    };
    res.json(results[provider] || { success: false, message: "Невідомий провайдер" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── RECONCILIATION ───────────────────────────────────────────────────────────
router.get("/reconciliation/:counterpartyId", async (req: any, res) => {
  try {
    const cpId = parseInt(req.params.counterpartyId);
    const orgId = req.user?.organizationId;

    const docs = await db.select().from(accountingDocumentsTable)
      .where(and(
        eq(accountingDocumentsTable.organizationId, orgId),
        eq(accountingDocumentsTable.counterpartyId, cpId),
      ))
      .orderBy(asc(accountingDocumentsTable.docDate));

    let balance = 0;
    const rows = docs.map(d => {
      const amount = parseFloat(d.totalAmount || "0");
      const paid = parseFloat(d.paidAmount || "0");
      const debit = ["invoice", "act", "tax_invoice"].includes(d.docType) ? amount : 0;
      const credit = d.docType === "payment_order" ? amount : paid;
      balance += debit - credit;
      return { ...d, debit, credit, balance };
    });

    const [cp] = await db.select().from(counterpartiesTable).where(eq(counterpartiesTable.id, cpId));
    res.json({ counterparty: cp, rows, finalBalance: balance });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});


// ═══════════════════════════════════════════════════════════════════════════════
// UKRAINIAN ACCOUNTING LAYER — BAS / M.E.Doc / Vchasno / ПН / Archive / КЕП
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PN (Податкова накладна) number generator ─────────────────────────────────
async function genPnNumber(orgId: number): Promise<string> {
  const m = String(new Date().getMonth() + 1).padStart(2, "0");
  const y = new Date().getFullYear();
  const cnt = await db.execute(sql`
    SELECT COUNT(*) as c FROM ua_tax_invoices
    WHERE organization_id = ${orgId} AND EXTRACT(YEAR FROM pn_date) = ${y} AND EXTRACT(MONTH FROM pn_date) = ${parseInt(m)}
  `);
  const n = parseInt((cnt.rows[0] as any)?.c || "0") + 1;
  return `${String(n).padStart(6, "0")}`;
}

// ─── XML generators ───────────────────────────────────────────────────────────
function generatePnXml(pn: any, items: any[]): string {
  const itemsXml = items.map((it, i) => `
    <ITEM>
      <ROWNUM>${i + 1}</ROWNUM>
      <DESCRIPTION>${escXml(it.description || it.name || "Послуга")}</DESCRIPTION>
      <UNIT>${escXml(it.unit || "шт")}</UNIT>
      <QUANTITY>${parseFloat(it.quantity || 1)}</QUANTITY>
      <PRICE>${parseFloat(it.unit_price || 0).toFixed(2)}</PRICE>
      <COST>${parseFloat(it.total_amount || 0).toFixed(2)}</COST>
      <VATPERCENT>${parseFloat(pn.vat_rate || 20)}</VATPERCENT>
      <VATCOST>${(parseFloat(it.total_amount || 0) * parseFloat(pn.vat_rate || 20) / 100).toFixed(2)}</VATCOST>
    </ITEM>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<DECLAR>
  <DECLARHEAD>
    <TIN>${escXml(pn.seller_ipn || pn.seller_edrpou || "")}</TIN>
    <C_DOC>J1201009</C_DOC>
    <C_DOC_SUB>001</C_DOC_SUB>
    <C_DOC_VER>9</C_DOC_VER>
    <C_DOC_TYPE>${pn.pn_type === 'correction' ? '1' : '0'}</C_DOC_TYPE>
    <C_DOC_CNT>1</C_DOC_CNT>
    <C_REG>00</C_REG>
    <C_RAJ>000</C_RAJ>
    <PERIOD_MONTH>${String(new Date(pn.pn_date).getMonth() + 1).padStart(2, "0")}</PERIOD_MONTH>
    <PERIOD_YEAR>${new Date(pn.pn_date).getFullYear()}</PERIOD_YEAR>
    <C_STI_ORIG>0000</C_STI_ORIG>
    <D_FILL>${new Date().toISOString().split('T')[0]}</D_FILL>
    <SOFTWARE>Maison HD HMS 1.0</SOFTWARE>
  </DECLARHEAD>
  <DECLARBODY>
    <KHNUM>${escXml(pn.pn_number || "")}</KHNUM>
    <HTYPDOC>${pn.pn_type === 'correction' ? '1' : '0'}</HTYPDOC>
    <HFILL>${pn.pn_date || new Date().toISOString().split('T')[0]}</HFILL>
    <HOPER>${pn.operation_code || '07'}</HOPER>
    <SELLER_TIN>${escXml(pn.seller_ipn || pn.seller_edrpou || "")}</SELLER_TIN>
    <SELLER_NM>${escXml(pn.seller_name || "")}</SELLER_NM>
    <BUYER_TIN>${escXml(pn.buyer_ipn || pn.buyer_edrpou || "")}</BUYER_TIN>
    <BUYER_NM>${escXml(pn.buyer_name || "")}</BUYER_NM>
    <BUYER_STATUS>${pn.is_vat_payer_buyer ? '1' : '0'}</BUYER_STATUS>
    <ROZVNUM>${escXml(pn.pn_series || 'А')}</ROZVNUM>
    <NUMR>${escXml(pn.pn_number || "")}</NUMR>
    <HKBOS>${escXml(pn.operation_code || '07')}</HKBOS>
    <HTOTAL>${parseFloat(pn.total_amount || 0).toFixed(2)}</HTOTAL>
    <HPDV>${parseFloat(pn.vat_amount || 0).toFixed(2)}</HPDV>
    <HND>${parseFloat(pn.taxable_amount || 0).toFixed(2)}</HND>
    <T1RXXXXG1S_ROWNUM>1</T1RXXXXG1S_ROWNUM>
    ${itemsXml}
  </DECLARBODY>
</DECLAR>`;
}

function generateInvoiceHtml(doc: any, items: any[], entity: any, cp: any): string {
  // If no line items — use subject as the single row (standard UA invoice format)
  const noItems = items.length === 0;
  const syntheticVatRate = (() => { const vat = parseFloat(doc?.vat_amount || 0); const total = parseFloat(doc?.total_amount || 0); const base = total - vat; return (vat > 0 && base > 0) ? Math.round(vat / base * 100) : 0; })();
  const effectiveItems = noItems ? (doc?.subject ? [{
    name: doc.subject,
    unit: "послуга",
    quantity: 1,
    unit_price: parseFloat(doc?.subtotal || 0),
    vat_rate: syntheticVatRate,
    vat_amount: parseFloat(doc?.vat_amount || 0),
    total_amount: parseFloat(doc?.total_amount || 0),
  }] : []) : items;
  const itemsHtml = effectiveItems.map((it, i) => {
    const unitPrice = it.unit_price ?? it.unitPrice ?? it.price ?? 0;
    const lineTotal = it.total_amount ?? it.total_price ?? it.totalPrice ?? it.amount ?? 0;
    const itemVatAmount = it.vat_amount ?? it.vatAmount;
    const itemVatRate = it.vat_rate ?? it.vatRate ?? 0;
    const vatCell = (itemVatAmount !== undefined && noItems)
      ? `${parseFloat(itemVatAmount).toFixed(2)} ₴`
      : `${parseFloat(itemVatRate || 0)}%`;
    return `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${escXml(it.name || it.description || "Послуга")}</td>
      <td class="center">${escXml(it.unit || "шт")}</td>
      <td class="right">${parseFloat(it.quantity || 1).toFixed(2)}</td>
      <td class="right">${parseFloat(unitPrice).toFixed(2)}</td>
      <td class="right">${vatCell}</td>
      <td class="right"><b>${parseFloat(lineTotal).toFixed(2)}</b></td>
    </tr>`;
  }).join("");
  const vatBreakdown = [7, 20].map((rate) => {
    const amount = effectiveItems.reduce((sum, item) => {
      const itemRate = Number(item.vat_rate ?? item.vatRate ?? 0);
      if (itemRate !== rate) return sum;
      const explicitVat = Number(item.vat_amount ?? item.vatAmount);
      const lineTotal = Number(item.total_amount ?? item.total_price ?? item.totalPrice ?? item.amount ?? 0);
      return sum + (Number.isFinite(explicitVat)
        ? explicitVat
        : lineTotal - lineTotal / (1 + rate / 100));
    }, 0);
    return amount > 0.004
      ? `<tr><td class="label">ПДВ ${rate}%:</td><td class="right">${amount.toFixed(2)} ₴</td></tr>`
      : "";
  }).join("");
  const hasVat = vatBreakdown.length > 0;

  return `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#000}
  .header{display:flex;justify-content:space-between;margin-bottom:20px}
  .title{font-size:18px;font-weight:bold;text-align:center;margin:15px 0;text-transform:uppercase}
  .meta{background:#f5f5f5;padding:10px;border:1px solid #ddd;margin-bottom:15px}
  table{width:100%;border-collapse:collapse;margin-bottom:15px}
  th,td{border:1px solid #999;padding:5px 7px;font-size:11px}
  th{background:#e8e8e8;font-weight:bold}
  .right{text-align:right} .center{text-align:center} .num{text-align:center;width:30px}
  .totals{float:right;width:300px}
  .totals td{border:none;padding:3px 5px}
  .totals .label{text-align:right}
  .footer{margin-top:30px;border-top:1px solid #ccc;padding-top:15px}
  .sign-line{display:flex;gap:40px;margin-top:10px}
  .sign{border-bottom:1px solid #000;width:200px;padding-bottom:3px;font-size:10px}
  @media print{body{margin:10px}}
</style></head><body>
<div class="header">
  <div>
    <b>${escXml(entity?.name || "")}</b><br>
    ЄДРПОУ: ${escXml(entity?.edrpou || "—")}<br>
    IBAN: ${escXml(entity?.iban || "—")}<br>
    ${escXml(entity?.bank || "")}, МФО: ${escXml(entity?.mfo || "")}
  </div>
  <div style="text-align:right">
    <img src="data:image/svg+xml;base64,..." style="display:none" alt="logo">
  </div>
</div>
<div class="title">Рахунок на оплату № ${escXml(doc?.doc_number || "—")} від ${doc?.doc_date || "—"}</div>
<div class="meta">
  <b>Постачальник:</b> ${escXml(entity?.name || "—")} | ЄДРПОУ: ${escXml(entity?.edrpou || "—")}<br>
  <b>Покупець:</b> ${escXml(cp?.name || doc?.counterparty_name || "—")} | ЄДРПОУ: ${escXml(cp?.edrpou || doc?.counterparty_edrpou || "—")}${cp?.iban ? `<br><b>IBAN покупця:</b> ${escXml(cp.iban)}` : ""}
</div>
<table>
  <thead><tr><th class="num">№</th><th>Найменування</th><th>Од.</th><th class="right">К-ть</th><th class="right">Ціна без ПДВ, ₴</th><th class="right">ПДВ</th><th class="right">Сума, ₴</th></tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<div style="overflow:hidden">
  <table class="totals">
    <tr><td class="label">Без ПДВ:</td><td class="right">${parseFloat(doc?.subtotal || 0).toFixed(2)} ₴</td></tr>
    ${hasVat ? vatBreakdown : `<tr><td class="label">Без ПДВ / не обкладається:</td><td class="right">—</td></tr>`}
    <tr><td class="label"><b>Разом до оплати:</b></td><td class="right"><b>${parseFloat(doc?.total_amount || 0).toFixed(2)} ₴</b></td></tr>
  </table>
</div>
${doc?.payment_terms ? `<p>Умови оплати: ${escXml(doc.payment_terms)}</p>` : ""}
<div class="footer">
  <div class="sign-line">
    <div><div class="sign">Директор: ______________ ${escXml(entity?.director || "")}</div></div>
    <div><div class="sign">Бухгалтер: ______________ ${escXml(entity?.accountant || "")}</div></div>
    <div><div class="sign">МП</div></div>
  </div>
</div>
</body></html>`;
}

function generateActHtml(doc: any, items: any[], entity: any, cp: any): string {
  // If no line items — use subject as the single row (same as invoice logic)
  const noItems = items.length === 0;
  const syntheticVatRate = (() => {
    const vat = parseFloat(doc?.vat_amount || 0);
    const total = parseFloat(doc?.total_amount || 0);
    const base = total - vat;
    return (vat > 0 && base > 0) ? Math.round(vat / base * 100) : 0;
  })();
  const effectiveItems = noItems ? (doc?.subject ? [{
    name: doc.subject,
    unit: "послуга",
    quantity: 1,
    unit_price: parseFloat(doc?.subtotal || doc?.total_amount || 0),
    total_amount: parseFloat(doc?.total_amount || 0),
  }] : []) : items;

  const itemsHtml = effectiveItems.map((it, i) => {
    const unitPrice = it.unit_price ?? it.unitPrice ?? it.price ?? 0;
    const lineTotal = it.total_amount ?? it.total_price ?? it.totalPrice ?? it.amount ?? 0;
    return `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${escXml(it.name || it.description || "Послуга")}</td>
      <td class="center">${escXml(it.unit || "послуга")}</td>
      <td class="right">${parseFloat(it.quantity || 1).toFixed(2)}</td>
      <td class="right">${parseFloat(unitPrice).toFixed(2)}</td>
      <td class="right"><b>${parseFloat(lineTotal).toFixed(2)}</b></td>
    </tr>`;
  }).join("");
  const vatBreakdown = [7, 20].map((rate) => {
    const amount = effectiveItems.reduce((sum, item) => {
      const itemRate = Number(item.vat_rate ?? item.vatRate ?? 0);
      if (itemRate !== rate) return sum;
      const explicitVat = Number(item.vat_amount ?? item.vatAmount);
      const lineTotal = Number(item.total_amount ?? item.total_price ?? item.totalPrice ?? item.amount ?? 0);
      return sum + (Number.isFinite(explicitVat)
        ? explicitVat
        : lineTotal - lineTotal / (1 + rate / 100));
    }, 0);
    return amount > 0.004
      ? `<tr><td>ПДВ ${rate}%:</td><td class="right">${amount.toFixed(2)} ₴</td></tr>`
      : "";
  }).join("");

  return `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#000}
  .title{font-size:16px;font-weight:bold;text-align:center;margin:15px 0}
  .parties{margin-bottom:15px;padding:10px;background:#f9f9f9;border:1px solid #ddd}
  table{width:100%;border-collapse:collapse;margin-bottom:15px}
  th,td{border:1px solid #999;padding:5px 7px;font-size:11px}
  th{background:#e8e8e8;font-weight:bold}
  .right{text-align:right} .center{text-align:center} .num{text-align:center;width:30px}
  .totals{float:right;width:300px}
  .sign-block{display:flex;justify-content:space-between;margin-top:30px}
  .sign-col{width:45%}
  .sign-line{border-bottom:1px solid #000;margin-top:30px;padding-bottom:3px;font-size:10px}
</style></head><body>
<div class="title">АКТ НАДАННЯ ПОСЛУГ № ${escXml(doc?.doc_number || "—")} від ${doc?.doc_date || "—"}</div>
<div class="parties">
  <b>Виконавець:</b> ${escXml(entity?.name || "—")}, ЄДРПОУ ${escXml(entity?.edrpou || "—")}, адреса: ${escXml(entity?.address || "—")}<br>
  <b>Замовник:</b> ${escXml(cp?.name || doc?.counterparty_name || "—")}, ЄДРПОУ ${escXml(cp?.edrpou || doc?.counterparty_edrpou || "—")}${cp?.legal_address ? `, адреса: ${escXml(cp.legal_address)}` : ""}
</div>
<p>Виконавець надав, а Замовник прийняв наступні послуги:</p>
<table>
  <thead><tr><th class="num">№</th><th>Найменування</th><th>Од.</th><th class="right">К-ть</th><th class="right">Ціна, ₴</th><th class="right">Сума, ₴</th></tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<div style="overflow:hidden">
  <table class="totals">
    <tr><td>Без ПДВ:</td><td class="right">${parseFloat(doc?.subtotal || 0).toFixed(2)} ₴</td></tr>
    ${vatBreakdown}
    <tr><td><b>Разом:</b></td><td class="right"><b>${parseFloat(doc?.total_amount || 0).toFixed(2)} ₴</b></td></tr>
  </table>
</div>
<p>Вищевказані послуги виконані в повному обсязі, сторони претензій одна до одної не мають.</p>
<div class="sign-block">
  <div class="sign-col">
    <b>ВИКОНАВЕЦЬ</b><br>${escXml(entity?.name || "")}<br>
    <div class="sign-line">Директор ___________ ${escXml(entity?.director || "")}</div>
    <div class="sign-line">МП</div>
  </div>
  <div class="sign-col">
    <b>ЗАМОВНИК</b><br>${escXml(cp?.name || doc?.counterparty_name || "")}<br>
    <div class="sign-line">Директор ___________</div>
    <div class="sign-line">МП</div>
  </div>
</div>
</body></html>`;
}

function generateBasXml(docs: any[], orgId: number): string {
  const docsXml = docs.map(d => `
  <Document>
    <DocType>${escXml(d.doc_type || "invoice")}</DocType>
    <DocNumber>${escXml(d.doc_number || "")}</DocNumber>
    <DocDate>${d.doc_date || ""}</DocDate>
    <Currency>${d.currency || "UAH"}</Currency>
    <Subtotal>${parseFloat(d.subtotal || 0).toFixed(2)}</Subtotal>
    <VatAmount>${parseFloat(d.vat_amount || 0).toFixed(2)}</VatAmount>
    <TotalAmount>${parseFloat(d.total_amount || 0).toFixed(2)}</TotalAmount>
    <CounterpartyName>${escXml(d.counterparty_name || "")}</CounterpartyName>
    <CounterpartyCode>${escXml(d.counterparty_edrpou || "")}</CounterpartyCode>
    <Status>${escXml(d.status || "")}</Status>
    <Subject>${escXml(d.subject || "")}</Subject>
  </Document>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<BAS_Export version="1.0" generated="${new Date().toISOString()}" org_id="${orgId}">
  <Documents count="${docs.length}">${docsXml}
  </Documents>
</BAS_Export>`;
}

function escXml(s: string): string {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// ─── TAX INVOICES (Податкові накладні) ────────────────────────────────────────
router.get("/tax-invoices", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { status, from, to, limit = 50, offset = 0 } = req.query;
    let q = `SELECT pn.*, le.name AS seller_name_entity, cp.name AS buyer_name_cp
             FROM ua_tax_invoices pn
             LEFT JOIN legal_entities le ON le.id = pn.seller_entity_id
             LEFT JOIN counterparties cp ON cp.id = pn.buyer_counterparty_id
             WHERE pn.organization_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (status) { q += ` AND pn.status = $${idx++}`; params.push(status); }
    if (from)   { q += ` AND pn.pn_date >= $${idx++}`; params.push(from); }
    if (to)     { q += ` AND pn.pn_date <= $${idx++}`; params.push(to); }
    q += ` ORDER BY pn.pn_date DESC, pn.id DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));
    const { rows } = await (db as any).$client.query(q, params);

    const cnt = await (db as any).$client.query(
      `SELECT COUNT(*) as c FROM ua_tax_invoices WHERE organization_id = $1${status ? " AND status = $2" : ""}`,
      status ? [orgId, status] : [orgId]
    );
    res.json({ invoices: rows, total: parseInt(cnt.rows[0].c) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/tax-invoices/:id", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { rows } = await (db as any).$client.query(
      `SELECT pn.*, le.name AS seller_name_entity, le.edrpou AS seller_edrpou_entity, le.ipn AS seller_ipn_entity,
              le.director, le.accountant, le.iban, le.bank, le.mfo, le.address AS seller_address,
              cp.name AS buyer_name_cp, cp.edrpou AS buyer_edrpou_cp, cp.ipn AS buyer_ipn_cp
       FROM ua_tax_invoices pn
       LEFT JOIN legal_entities le ON le.id = pn.seller_entity_id
       LEFT JOIN counterparties cp ON cp.id = pn.buyer_counterparty_id
       WHERE pn.id = $1 AND pn.organization_id = $2`, [id, orgId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    // Get items from linked document
    let items: any[] = [];
    if (rows[0].doc_id) {
      const { rows: its } = await (db as any).$client.query(
        `SELECT * FROM document_items WHERE document_id = $1 ORDER BY id`, [rows[0].doc_id]);
      items = its;
    }
    res.json({ invoice: rows[0], items });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/tax-invoices", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const userId = req.user?.userId;
    const {
      docId, sellerEntityId, buyerCounterpartyId, pnType = "standard",
      operationDate, operationCode = "07", taxableAmount, vatAmount, totalAmount,
      vatRate = 20, notes, pnSeries = "А",
    } = req.body;

    const pnNumber = await genPnNumber(orgId);

    // Auto-fill seller/buyer from linked entities
    let sellerEdrpou = "", sellerIpn = "", sellerName = "";
    let buyerEdrpou = "", buyerIpn = "", buyerName = "";
    if (sellerEntityId) {
      const { rows: el } = await (db as any).$client.query(`SELECT * FROM legal_entities WHERE id = $1`, [sellerEntityId]);
      if (el[0]) { sellerEdrpou = el[0].edrpou || ""; sellerIpn = el[0].ipn || ""; sellerName = el[0].name || ""; }
    }
    if (buyerCounterpartyId) {
      const { rows: cp } = await (db as any).$client.query(`SELECT * FROM counterparties WHERE id = $1`, [buyerCounterpartyId]);
      if (cp[0]) { buyerEdrpou = cp[0].edrpou || ""; buyerIpn = cp[0].ipn || ""; buyerName = cp[0].name || ""; }
    }

    const { rows } = await (db as any).$client.query(`
      INSERT INTO ua_tax_invoices (organization_id, doc_id, pn_number, pn_series, pn_date, pn_type,
        seller_entity_id, buyer_counterparty_id, seller_edrpou, seller_ipn, seller_name,
        buyer_edrpou, buyer_ipn, buyer_name, operation_date, operation_code,
        taxable_amount, vat_amount, total_amount, vat_rate, status, notes, created_by)
      VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'draft',$20,$21)
      RETURNING *`,
      [orgId, docId || null, pnNumber, pnSeries, pnType, sellerEntityId || null, buyerCounterpartyId || null,
       sellerEdrpou, sellerIpn, sellerName, buyerEdrpou, buyerIpn, buyerName,
       operationDate || null, operationCode, taxableAmount || 0, vatAmount || 0, totalAmount || 0, vatRate, notes || null, userId]);
    res.json({ invoice: rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/tax-invoices/:id/generate-xml", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { rows } = await (db as any).$client.query(
      `SELECT * FROM ua_tax_invoices WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const pn = rows[0];

    let items: any[] = [];
    if (pn.doc_id) {
      const { rows: its } = await (db as any).$client.query(`SELECT * FROM document_items WHERE document_id = $1`, [pn.doc_id]);
      items = its;
    }
    if (!items.length) {
      items = [{ description: pn.seller_name || "Послуги готелю", quantity: 1, unit_price: pn.taxable_amount, total_amount: pn.taxable_amount, unit: "шт" }];
    }

    const xml = generatePnXml(pn, items);
    await (db as any).$client.query(
      `UPDATE ua_tax_invoices SET xml_content = $1, xml_generated_at = NOW(), status = 'ready' WHERE id = $2`,
      [xml, id]);
    res.json({ xml, status: "ready", message: "XML ПН згенеровано" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/tax-invoices/:id/submit-medoc", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { rows } = await (db as any).$client.query(
      `SELECT pn.*, ai.settings FROM ua_tax_invoices pn
       LEFT JOIN accounting_integrations ai ON ai.organization_id = pn.organization_id AND ai.provider = 'medoc'
       WHERE pn.id = $1 AND pn.organization_id = $2`, [id, orgId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const pn = rows[0];
    if (!pn.xml_content) return res.status(400).json({ error: "Спочатку згенеруйте XML" });

    // Integration placeholder — MEDoc uses file-based exchange
    // Real implementation: write XML to MEDoc exchange folder or use MEDoc API
    const medocPath = (pn.settings as any)?.exchange_path || "/tmp/medoc-exchange";
    const filename = `PN_${pn.pn_number}_${Date.now()}.xml`;

    await (db as any).$client.query(
      `UPDATE ua_tax_invoices SET medoc_sent_at = NOW(), medoc_status = 'sent', status = 'submitted' WHERE id = $1`, [id]);

    res.json({
      success: true,
      message: "ПН передано до M.E.Doc (режим імітації). Для реальної інтеграції налаштуйте папку обміну M.E.Doc.",
      filename, medocPath,
      note: "Відкрийте M.E.Doc → Реєстр → Імпорт XML → вкажіть папку обміну",
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/tax-invoices/:id/submit-vchasno", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { rows } = await (db as any).$client.query(
      `SELECT pn.*, ai.settings, ai.api_key FROM ua_tax_invoices pn
       LEFT JOIN accounting_integrations ai ON ai.organization_id = pn.organization_id AND ai.provider = 'vchasno'
       WHERE pn.id = $1 AND pn.organization_id = $2`, [id, orgId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const pn = rows[0];
    if (!pn.xml_content) return res.status(400).json({ error: "Спочатку згенеруйте XML" });

    // Vchasno REST API integration placeholder
    // Real: POST https://api.vchasno.com.ua/api/v1/documents with JWT auth
    const hasKey = !!(pn.api_key || (pn.settings as any)?.api_key);
    if (!hasKey) {
      await (db as any).$client.query(
        `UPDATE ua_tax_invoices SET vchasno_sent_at = NOW(), vchasno_status = 'pending_config', status = 'submitted' WHERE id = $1`, [id]);
      return res.json({
        success: false,
        message: "Вчасно.КЕП API ключ не налаштований. Перейдіть Бухгалтерія → Інтеграції → Вчасно",
        configRequired: true,
      });
    }

    await (db as any).$client.query(
      `UPDATE ua_tax_invoices SET vchasno_sent_at = NOW(), vchasno_status = 'sent', status = 'submitted' WHERE id = $1`, [id]);
    res.json({
      success: true,
      message: "ПН відправлено до Вчасно.КЕП",
      vchasnoDocId: `VCH-${Date.now()}`,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

const TAX_INVOICE_STATUSES = ["draft", "sent", "registered", "rejected", "cancelled"] as const;
router.patch("/tax-invoices/:id", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = parseInt(req.params.id);
    const { status, registrationNumber, rejectionReason, notes } = req.body;

    if (status !== undefined && !TAX_INVOICE_STATUSES.includes(status)) {
      res.status(422).json({ error: `Invalid tax invoice status "${status}"` });
      return;
    }

    const updates: string[] = ["updated_at = NOW()"];
    const params: any[] = [id, orgId];
    let idx = 3;
    if (status) { updates.push(`status = $${idx++}`); params.push(status); }
    if (registrationNumber) { updates.push(`registration_number = $${idx++}`); params.push(registrationNumber); }
    if (rejectionReason) { updates.push(`rejection_reason = $${idx++}`); params.push(rejectionReason); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes); }
    const { rows } = await (db as any).$client.query(
      `UPDATE ua_tax_invoices SET ${updates.join(", ")} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    res.json({ invoice: rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── BAS / 1C EXPORT ─────────────────────────────────────────────────────────
router.post("/export/bas", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { dateFrom, dateTo, docTypes = [], format = "bas_xml" } = req.body;

    let q = `SELECT * FROM accounting_documents WHERE organization_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (dateFrom) { q += ` AND doc_date >= $${idx++}`; params.push(dateFrom); }
    if (dateTo)   { q += ` AND doc_date <= $${idx++}`; params.push(dateTo); }
    if (docTypes.length) { q += ` AND doc_type = ANY($${idx++}::acc_doc_type[])`; params.push(docTypes); }
    q += ` ORDER BY doc_date, id`;
    const { rows: docs } = await (db as any).$client.query(q, params);

    const xmlContent = generateBasXml(docs, orgId);
    const fileName = `bas_export_${orgId}_${Date.now()}.xml`;

    const { rows } = await (db as any).$client.query(`
      INSERT INTO ua_bas_exports (organization_id, export_type, format, date_from, date_to, doc_count, xml_content, file_name, exported_by)
      VALUES ($1, 'filtered', $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [orgId, format, dateFrom || null, dateTo || null, docs.length, xmlContent, fileName, userId]);

    res.json({
      export: rows[0],
      xml: xmlContent,
      docCount: docs.length,
      fileName,
      instructions: {
        bas: "Відкрийте BAS/1C → Файл → Відкрити → вкажіть XML файл → Завантажити",
        medoc: "M.E.Doc → Реєстр → Імпорт → вибрати XML файл",
      }
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/export/bas/history", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { rows } = await (db as any).$client.query(
      `SELECT id, export_type, format, date_from, date_to, doc_count, file_name, status, exported_at, imported_to_bas_at, notes
       FROM ua_bas_exports WHERE organization_id = $1 ORDER BY exported_at DESC LIMIT 50`, [orgId]);
    res.json({ exports: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/export/bas/:id/mark-imported", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    await (db as any).$client.query(
      `UPDATE ua_bas_exports SET imported_to_bas_at = NOW(), status = 'imported' WHERE id = $1 AND organization_id = $2`,
      [parseInt(req.params.id), orgId]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── SIGNING REQUESTS (КЕП/ЕЦП) ─────────────────────────────────────────────
router.get("/signing-requests", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { status } = req.query;
    let q = `SELECT sr.*, d.doc_number, d.doc_type, d.total_amount
             FROM ua_signing_requests sr
             LEFT JOIN accounting_documents d ON d.id = sr.doc_id
             WHERE sr.organization_id = $1`;
    const params: any[] = [orgId];
    if (status) { q += ` AND sr.status = $2`; params.push(status); }
    q += ` ORDER BY sr.requested_at DESC LIMIT 100`;
    const { rows } = await (db as any).$client.query(q, params);
    res.json({ requests: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/signing-requests", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { docId, taxInvoiceId, signerName, signerRole = "director", signatureMethod = "kep", provider = "manual", notes } = req.body;
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { rows } = await (db as any).$client.query(`
      INSERT INTO ua_signing_requests (organization_id, doc_id, tax_invoice_id, signer_name, signer_role, signature_method, provider, notes, expires_at, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') RETURNING *`,
      [orgId, docId || null, taxInvoiceId || null, signerName || null, signerRole, signatureMethod, provider, notes || null, expires]);
    res.json({ request: rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/signing-requests/:id", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { status, signatureData, certificateInfo, notes } = req.body;
    const updates = ["status = $3"];
    const params: any[] = [id, orgId, status];
    let idx = 4;
    if (status === "signed") { updates.push("signed_at = NOW()"); }
    if (signatureData) { updates.push(`signature_data = $${idx++}`); params.push(signatureData); }
    if (certificateInfo) { updates.push(`certificate_info = $${idx++}`); params.push(JSON.stringify(certificateInfo)); }
    if (notes) { updates.push(`notes = $${idx++}`); params.push(notes); }
    const { rows } = await (db as any).$client.query(
      `UPDATE ua_signing_requests SET ${updates.join(", ")} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);

    // If signed, update document status — scoped to same org to prevent cross-tenant write
    if (status === "signed" && rows[0]?.doc_id) {
      await (db as any).$client.query(
        `UPDATE accounting_documents SET status = 'signed', signed_at = NOW()
         WHERE id = $1 AND organization_id = $2`, [rows[0].doc_id, orgId]);
    }
    res.json({ request: rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── DOCUMENT ARCHIVE ─────────────────────────────────────────────────────────
router.get("/archive", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { category, docType, search, from, to, limit = 50, offset = 0 } = req.query;
    let q = `SELECT * FROM ua_document_archive WHERE organization_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (category) { q += ` AND category = $${idx++}`; params.push(category); }
    if (docType)  { q += ` AND document_type = $${idx++}`; params.push(docType); }
    if (from)     { q += ` AND doc_date >= $${idx++}`; params.push(from); }
    if (to)       { q += ` AND doc_date <= $${idx++}`; params.push(to); }
    if (search)   { q += ` AND (title ILIKE $${idx} OR counterparty_name ILIKE $${idx++})`; params.push(`%${search}%`); }
    q += ` ORDER BY archived_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));
    const { rows } = await (db as any).$client.query(q, params);
    const cnt = await (db as any).$client.query(`SELECT COUNT(*) c FROM ua_document_archive WHERE organization_id = $1`, [orgId]);
    res.json({ documents: rows, total: parseInt(cnt.rows[0].c) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/archive", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const userId = req.user?.userId;
    const {
      docId, taxInvoiceId, category = "primary", documentType, title,
      fileName, counterpartyId, counterpartyName, docDate, amount,
      retentionYears = 10, isOriginal = false, isSigned = false, hasKep = false, notes, tags
    } = req.body;

    const archiveNum = `A-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;
    const retainUntil = new Date(new Date().setFullYear(new Date().getFullYear() + retentionYears)).toISOString().split("T")[0];

    const { rows } = await (db as any).$client.query(`
      INSERT INTO ua_document_archive (organization_id, doc_id, tax_invoice_id, archive_number, category, document_type, title,
        file_name, retention_years, retain_until, is_original, is_signed, has_kep,
        counterparty_id, counterparty_name, doc_date, amount, notes, tags, archived_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [orgId, docId || null, taxInvoiceId || null, archiveNum, category, documentType, title,
       fileName || null, retentionYears, retainUntil, isOriginal, isSigned, hasKep,
       counterpartyId || null, counterpartyName || null, docDate || null, amount || null,
       notes || null, tags || null, userId]);
    res.json({ document: rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/archive/:id", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    await (db as any).$client.query(`DELETE FROM ua_document_archive WHERE id = $1 AND organization_id = $2`, [parseInt(req.params.id), orgId]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── COUNTERPARTY AUTO-CREATE FROM GUEST ─────────────────────────────────────
router.post("/counterparties/from-guest", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { guestId } = req.body;
    const { rows: guests } = await (db as any).$client.query(
      `SELECT * FROM guests WHERE id = $1 AND organization_id = $2`, [guestId, orgId]);
    if (!guests[0]) return res.status(404).json({ error: "Guest not found" });
    const g = guests[0];

    // Check if already mapped
    const { rows: existing } = await (db as any).$client.query(
      `SELECT * FROM counterparties WHERE guest_id = $1 AND organization_id = $2`, [guestId, orgId]);
    if (existing[0]) return res.json({ counterparty: existing[0], created: false });

    const { rows } = await (db as any).$client.query(`
      INSERT INTO counterparties (organization_id, name, short_name, type, email, phone, guest_id)
      VALUES ($1, $2, $3, 'individual', $4, $5, $6) RETURNING *`,
      [orgId, g.full_name || g.first_name + " " + (g.last_name || ""), g.first_name || g.full_name, g.email || null, g.phone || null, guestId]);
    res.json({ counterparty: rows[0], created: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── ENHANCED DOCUMENT EXPORTS ────────────────────────────────────────────────
router.get("/documents/:id/export/invoice-ua", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { rows: docs } = await (db as any).$client.query(
      `SELECT * FROM accounting_documents WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    if (!docs[0]) return res.status(404).json({ error: "Not found" });
    const doc = docs[0];

    const { rows: items } = await (db as any).$client.query(`SELECT * FROM document_items WHERE document_id = $1 ORDER BY id`, [id]);
    let entity = null, cp = null;
    if (doc.legal_entity_id) {
      const { rows: el } = await (db as any).$client.query(`SELECT * FROM legal_entities WHERE id = $1`, [doc.legal_entity_id]);
      entity = el[0];
    }
    if (doc.counterparty_id) {
      const { rows: cps } = await (db as any).$client.query(`SELECT * FROM counterparties WHERE id = $1`, [doc.counterparty_id]);
      cp = cps[0];
    }

    const html = generateInvoiceHtml(doc, items, entity, cp);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(`invoice_${doc.doc_number}.html`)}`);
    res.send(html);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/documents/:id/export/act-ua", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { rows: docs } = await (db as any).$client.query(
      `SELECT * FROM accounting_documents WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    if (!docs[0]) return res.status(404).json({ error: "Not found" });
    const doc = docs[0];

    const { rows: items } = await (db as any).$client.query(`SELECT * FROM document_items WHERE document_id = $1 ORDER BY id`, [id]);
    let entity = null, cp = null;
    if (doc.legal_entity_id) {
      const { rows: el } = await (db as any).$client.query(`SELECT * FROM legal_entities WHERE id = $1`, [doc.legal_entity_id]);
      entity = el[0];
    }
    if (doc.counterparty_id) {
      const { rows: cps } = await (db as any).$client.query(`SELECT * FROM counterparties WHERE id = $1`, [doc.counterparty_id]);
      cp = cps[0];
    }

    const html = generateActHtml(doc, items, entity, cp);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(`act_${doc.doc_number}.html`)}`);
    res.send(html);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/documents/:id/export/bas-xml", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { rows } = await (db as any).$client.query(
      `SELECT * FROM accounting_documents WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const xml = generateBasXml([rows[0]], orgId);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="bas_doc_${id}.xml"`);
    res.send(xml);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/documents/:id/export/pn-xml", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { rows: pns } = await (db as any).$client.query(
      `SELECT * FROM ua_tax_invoices WHERE doc_id = $1 AND organization_id = $2 ORDER BY id DESC LIMIT 1`, [id, orgId]);
    if (!pns[0]) return res.status(404).json({ error: "No tax invoice linked to this document" });
    if (!pns[0].xml_content) return res.status(400).json({ error: "XML not yet generated. Use POST /tax-invoices/:id/generate-xml first" });

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="PN_${pns[0].pn_number}.xml"`);
    res.send(pns[0].xml_content);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── UA ACCOUNTING OVERVIEW ───────────────────────────────────────────────────
router.get("/ua/overview", async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;

    const [pnStats, sigStats, archStats, basStats] = await Promise.all([
      (db as any).$client.query(`
        SELECT status, COUNT(*) as cnt, SUM(total_amount) as total
        FROM ua_tax_invoices WHERE organization_id = $1 GROUP BY status`, [orgId]),
      (db as any).$client.query(`
        SELECT status, COUNT(*) as cnt FROM ua_signing_requests WHERE organization_id = $1 GROUP BY status`, [orgId]),
      (db as any).$client.query(`
        SELECT COUNT(*) as total, SUM(amount) as total_amount FROM ua_document_archive WHERE organization_id = $1`, [orgId]),
      (db as any).$client.query(`
        SELECT COUNT(*) as total, MAX(exported_at) as last_export FROM ua_bas_exports WHERE organization_id = $1`, [orgId]),
    ]);

    const pnByStatus: Record<string, any> = {};
    for (const r of pnStats.rows) pnByStatus[r.status] = { count: parseInt(r.cnt), total: parseFloat(r.total || 0) };

    const sigByStatus: Record<string, any> = {};
    for (const r of sigStats.rows) sigByStatus[r.status] = parseInt(r.cnt);

    res.json({
      taxInvoices: { byStatus: pnByStatus, total: pnStats.rows.reduce((s: number, r: any) => s + parseInt(r.cnt), 0) },
      signing: { byStatus: sigByStatus, pending: sigByStatus.pending || 0 },
      archive: { count: parseInt(archStats.rows[0]?.total || 0), totalAmount: parseFloat(archStats.rows[0]?.total_amount || 0) },
      bas: { exports: parseInt(basStats.rows[0]?.total || 0), lastExport: basStats.rows[0]?.last_export },
      integrations: {
        bas: { status: "adapter_ready", note: "XML export готовий" },
        medoc: { status: "file_exchange_ready", note: "Налаштуйте папку обміну" },
        vchasno: { status: "api_ready", note: "Налаштуйте API ключ Вчасно.КЕП" },
        kep: { status: "placeholder", note: "Підключіть КЕП провайдера: Дія.Підпис / Приват24Бізнес / Вчасно" },
      }
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
