import { Router } from "express";
import { db } from "@workspace/db";
import {
  counterpartiesTable, accountingDocumentsTable, documentItemsTable,
  accountingIntegrationsTable, legalEntitiesTable,
} from "@workspace/db";
import { eq, and, desc, asc, ilike, or, sql, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
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
    const fields = req.body;
    const sets = Object.entries(fields)
      .filter(([k]) => !["id", "organizationId", "createdAt"].includes(k))
      .map(([k, v]) => `${k.replace(/([A-Z])/g, '_$1').toLowerCase()} = ${v === null ? 'NULL' : `'${v}'`}`)
      .join(", ");

    if (!sets) return res.json({ success: true });
    if (fields.isDefault) {
      await db.execute(sql`UPDATE legal_entities SET is_default = false WHERE organization_id = ${orgId}`);
    }
    await db.execute(sql`UPDATE legal_entities SET ${sql.raw(sets)}, updated_at = NOW() WHERE id = ${id} AND organization_id = ${orgId}`);
    const [updated] = await db.select().from(legalEntitiesTable).where(eq(legalEntitiesTable.id, id));
    res.json({ entity: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
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

    let whereClause = `organization_id = ${orgId}`;
    if (type) whereClause += ` AND doc_type = '${type}'::acc_doc_type`;
    if (status) whereClause += ` AND status = '${status}'::acc_doc_status`;
    if (year) whereClause += ` AND EXTRACT(YEAR FROM doc_date) = ${year}`;
    if (search) whereClause += ` AND (doc_number ILIKE '%${search}%' OR counterparty_name ILIKE '%${search}%' OR subject ILIKE '%${search}%')`;

    const docs = await db.execute(sql`
      SELECT d.*, le.name as legal_entity_name, le.short_name as legal_entity_short_name,
             c.name as counterparty_name_from_table, c.edrpou as counterparty_edrpou_from_table
      FROM accounting_documents d
      LEFT JOIN legal_entities le ON le.id = d.legal_entity_id
      LEFT JOIN counterparties c ON c.id = d.counterparty_id
      WHERE d.${sql.raw(whereClause)}
      ORDER BY d.doc_date DESC, d.id DESC
      LIMIT ${parseInt(lim as string) || 200}
    `);

    // Summary stats
    const stats = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        SUM(total_amount) as total_amount,
        SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as paid,
        SUM(CASE WHEN status = 'overdue' THEN total_amount - paid_amount ELSE 0 END) as overdue,
        SUM(CASE WHEN status IN ('issued','sent') THEN total_amount - paid_amount ELSE 0 END) as pending
      FROM accounting_documents
      WHERE organization_id = ${orgId}
    `);

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
    const orgId = req.user?.organizationId;
    const userId = req.user?.id;
    const {
      docType, docDate, dueDate, deliveryDate,
      legalEntityId, counterpartyId, counterpartyName, counterpartyEdrpou,
      subject, description, paymentTerms, notes, currency, bookingId,
      items = [], status,
    } = req.body;

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

    const [doc] = await db.insert(accountingDocumentsTable).values({
      organizationId: orgId, docType: docType as any, status: (status || "draft") as any,
      docNumber, docDate, dueDate: dueDate || null, deliveryDate: deliveryDate || null,
      legalEntityId: legalEntityId || null, counterpartyId: counterpartyId || null,
      counterpartyName: counterpartyName || null, counterpartyEdrpou: counterpartyEdrpou || null,
      subject: subject || null, description: description || null, paymentTerms: paymentTerms || null,
      notes: notes || null, currency: currency || "UAH",
      subtotal: subtotal.toString(), vatAmount: vatAmount.toString(), totalAmount: totalAmount.toString(),
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

router.patch("/documents/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId = req.user?.organizationId;
    const { status, paidAmount, signedAt, paidAt, medocRegNumber, vchasnoId, vchasnoStatus, notes } = req.body;

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (paidAmount !== undefined) updates.paidAmount = paidAmount.toString();
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

    // JSON export
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

export default router;
