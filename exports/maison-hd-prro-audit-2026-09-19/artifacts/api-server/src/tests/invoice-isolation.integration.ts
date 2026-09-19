import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import invoicesRouter from "../routes/invoices.js";
import accountingRouter from "../routes/accounting.js";
import { signToken } from "../lib/auth.js";

const app = express();
app.use(express.json());
app.use("/api/invoices", invoicesRouter);
app.use("/api/accounting", accountingRouter);

const runId = randomUUID();
const organizationA = {
  name: `Invoice isolation A ${runId}`,
  slug: `invoice-isolation-a-${runId}`,
};
const organizationB = {
  name: `Invoice isolation B ${runId}`,
  slug: `invoice-isolation-b-${runId}`,
};

let organizationAId: number;
let organizationBId: number;
let userAId: number;
let userBId: number;
let tokenA: string;
let tokenB: string;
const previousPublicAppUrl = process.env.PUBLIC_APP_URL;

function tokenFor(userId: number, organizationId: number, email: string) {
  return signToken({
    userId,
    email,
    role: "owner",
    organizationId,
    propertyId: null,
  });
}

describe("Invoice tenant isolation (database-backed API)", () => {
  beforeAll(async () => {
    process.env.PUBLIC_APP_URL = "https://safe.example.test";
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ($1, $2), ($3, $4)
       RETURNING id`,
      [
        organizationA.name,
        organizationA.slug,
        organizationB.name,
        organizationB.slug,
      ],
    );
    [organizationAId, organizationBId] = organizations.rows.map((row) => row.id);

    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, password_hash, role, organization_id)
       VALUES ($1, $2, 'invoice-isolation-test', 'owner', $3),
              ($4, $5, 'invoice-isolation-test', 'owner', $6)
       RETURNING id`,
      [
        `invoice-isolation-a-${runId}@example.test`,
        "Invoice isolation tenant A",
        organizationAId,
        `invoice-isolation-b-${runId}@example.test`,
        "Invoice isolation tenant B",
        organizationBId,
      ],
    );
    [userAId, userBId] = users.rows.map((row) => row.id);

    tokenA = tokenFor(
      userAId,
      organizationAId,
      `invoice-isolation-a-${runId}@example.test`,
    );
    tokenB = tokenFor(
      userBId,
      organizationBId,
      `invoice-isolation-b-${runId}@example.test`,
    );
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM accounting_documents WHERE organization_id IN ($1, $2)`,
      [organizationAId, organizationBId],
    );
    await pool.query(
      `DELETE FROM counterparties WHERE organization_id IN ($1, $2)`,
      [organizationAId, organizationBId],
    );
    await pool.query(
      `DELETE FROM invoices WHERE organization_id IN ($1, $2)`,
      [organizationAId, organizationBId],
    );
    await pool.query(
      `DELETE FROM users WHERE id IN ($1, $2)`,
      [userAId, userBId],
    );
    await pool.query(
      `DELETE FROM organizations WHERE id IN ($1, $2)`,
      [organizationAId, organizationBId],
    );
    if (previousPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousPublicAppUrl;
    await pool.end();
  });

  it("creates one invoice per tenant and scopes list and detail reads", async () => {
    const createA = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        invoiceNumber: `INV-A-${runId}`,
        amount: 125,
        taxAmount: 20.83,
        description: "Tenant A invoice",
        buyer: { name: `Tenant A buyer ${runId}`, taxCode: "12345678" },
        items: [
          { description: "Accommodation", unit: "<img src=x onerror=alert(1)>", qty: 1, price: 50, amount: 50, vatRate: 20 },
          { description: "Breakfast", unit: "service", qty: 3, price: 25, amount: 75, vatRate: 20 },
        ],
      });
    const createB = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({
        invoiceNumber: `INV-B-${runId}`,
        amount: 250,
        description: "Tenant B invoice",
      });

    expect(createA.status).toBe(201);
    expect(createB.status).toBe(201);
    expect(createA.body.organizationId).toBe(organizationAId);
    expect(createB.body.organizationId).toBe(organizationBId);
    expect(createA.body.amount).toBe("125.00");
    expect(createA.body.taxAmount).toBe("20.83");
    expect(createA.body.invoiceItems.map((item: any) => item.vatAmount)).toEqual([8.33, 12.5]);

    const invoicesForA = await request(app)
      .get("/api/invoices")
      .set("Authorization", `Bearer ${tokenA}`);
    const invoicesForB = await request(app)
      .get("/api/invoices")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(invoicesForA.status).toBe(200);
    expect(invoicesForA.body.map((invoice: any) => invoice.id)).toContain(
      createA.body.id,
    );
    expect(invoicesForA.body.map((invoice: any) => invoice.id)).not.toContain(
      createB.body.id,
    );
    expect(invoicesForB.status).toBe(200);
    expect(invoicesForB.body.map((invoice: any) => invoice.id)).toContain(
      createB.body.id,
    );
    expect(invoicesForB.body.map((invoice: any) => invoice.id)).not.toContain(
      createA.body.id,
    );

    const crossTenantRead = await request(app)
      .get(`/api/invoices/${createB.body.id}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(crossTenantRead.status).toBe(403);
    expect(crossTenantRead.body).toEqual({ error: "Forbidden" });

    const bookingSendLink = await request(app)
      .post(`/api/invoices/${createA.body.id}/send`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Host", "attacker.example.test")
      .set("X-Forwarded-Host", "attacker.example.test")
      .send({ channel: "link" });
    expect(bookingSendLink.status).toBe(200);
    expect(bookingSendLink.body.invoiceUrl).toMatch(/^https:\/\/safe\.example\.test\/invoice\//);
    expect(bookingSendLink.body.invoiceUrl).not.toContain("attacker.example.test");

    const bookingPublicToken = decodeURIComponent(new URL(bookingSendLink.body.invoiceUrl).pathname.split("/").pop()!);
    const bookingPublicView = await request(app).get(`/api/invoices/public/${bookingPublicToken}`);
    expect(bookingPublicView.status).toBe(200);
    expect(bookingPublicView.body.invoiceNumber).toBe(createA.body.invoiceNumber);
    expect(bookingPublicView.body.invoiceItems).toHaveLength(2);

    const crossTenantActCreate = await request(app)
      .post(`/api/accounting/documents/from-invoice/${createB.body.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ invoiceSource: "booking_invoice", adjustedAmount: 250 });
    expect(crossTenantActCreate.status).toBe(404);

    const createAct = await request(app)
      .post(`/api/accounting/documents/from-invoice/${createA.body.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        invoiceSource: "booking_invoice",
        adjustedAmount: 125,
        subject: "Act cloned from multi-line invoice",
      });

    expect(createAct.status).toBe(200);
    expect(createAct.body.document.organizationId).toBe(organizationAId);
    expect(createAct.body.document.totalAmount).toBe("125.00");
    expect(createAct.body.items).toHaveLength(2);
    expect(createAct.body.items.map((item: any) => item.description)).toEqual([
      "Accommodation",
      "Breakfast",
    ]);
    expect(createAct.body.items.map((item: any) => item.totalPrice)).toEqual([
      "50.00",
      "75.00",
    ]);

    const changedTotal = await request(app)
      .post(`/api/accounting/documents/from-invoice/${createA.body.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ invoiceSource: "booking_invoice", adjustedAmount: 100 });
    expect(changedTotal.status).toBe(400);
    expect(changedTotal.body.error).toContain("повинна відповідати сумі рахунку");

    const crossTenantSend = await request(app)
      .post(`/api/accounting/documents/${createAct.body.document.id}/send`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ channel: "link" });
    expect(crossTenantSend.status).toBe(404);

    const sendLink = await request(app)
      .post(`/api/accounting/documents/${createAct.body.document.id}/send`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Host", "attacker.example.test")
      .set("X-Forwarded-Host", "attacker.example.test")
      .send({ channel: "link" });
    expect(sendLink.status).toBe(200);
    expect(sendLink.body.documentUrl).toMatch(/^https:\/\/safe\.example\.test\//);
    expect(sendLink.body.documentUrl).not.toContain("attacker.example.test");

    const publicPath = new URL(sendLink.body.documentUrl).pathname;
    const publicView = await request(app).get(publicPath);
    expect(publicView.status).toBe(200);
    expect(publicView.text).toContain(createAct.body.document.docNumber);
    expect(publicView.text).toContain("Accommodation");
    expect(publicView.text).toContain("Breakfast");
    expect(publicView.text).toMatch(/Accommodation[\s\S]*?<b>50\.00<\/b>/);
    expect(publicView.text).toMatch(/Breakfast[\s\S]*?<b>75\.00<\/b>/);
    expect(publicView.text).not.toContain("<img src=x onerror=alert(1)>");
    expect(publicView.text).toContain("&lt;img src=x onerror=alert(1)&gt;");

    const accountingInvoice = await pool.query<{ id: number }>(
      `INSERT INTO accounting_documents (
         organization_id, doc_type, status, doc_number, doc_date,
         counterparty_name, subtotal, vat_amount, total_amount, subject, created_by_id
       )
       VALUES ($1, 'invoice', 'draft', $2, CURRENT_DATE, $3, 75, 15, 90, $4, $5)
       RETURNING id`,
      [
        organizationAId,
        `ACC-INV-${runId}`,
        `Accounting buyer ${runId}`,
        "Accounting multi-line invoice",
        userAId,
      ],
    );
    const accountingInvoiceId = accountingInvoice.rows[0].id;
    await pool.query(
      `INSERT INTO document_items (
         document_id, sort_order, description, unit, quantity,
         unit_price, vat_rate, vat_amount, total_price
       )
       VALUES
         ($1, 0, 'Conference room', '<svg onload=alert(2)>', 2, 20, '20', 6.67, 40),
         ($1, 1, 'Coffee break', 'service', 1, 50, '20', 8.33, 50)`,
      [accountingInvoiceId],
    );

    const accountingInvoiceLink = await request(app)
      .post(`/api/accounting/documents/${accountingInvoiceId}/send`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ channel: "link" });
    expect(accountingInvoiceLink.status).toBe(200);
    const accountingInvoicePublicPath = new URL(accountingInvoiceLink.body.documentUrl).pathname;
    const accountingInvoicePublicView = await request(app).get(accountingInvoicePublicPath);
    expect(accountingInvoicePublicView.status).toBe(200);
    expect(accountingInvoicePublicView.text).toMatch(/Conference room[\s\S]*?<b>40\.00<\/b>/);
    expect(accountingInvoicePublicView.text).toMatch(/Coffee break[\s\S]*?<b>50\.00<\/b>/);
    expect(accountingInvoicePublicView.text).not.toContain("<svg onload=alert(2)>");
    expect(accountingInvoicePublicView.text).toContain("&lt;svg onload=alert(2)&gt;");

    const crossTenantAccountingAct = await request(app)
      .post(`/api/accounting/documents/from-invoice/${accountingInvoiceId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ invoiceSource: "accounting_document", adjustedAmount: 90 });
    expect(crossTenantAccountingAct.status).toBe(404);

    const accountingAct = await request(app)
      .post(`/api/accounting/documents/from-invoice/${accountingInvoiceId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        invoiceSource: "accounting_document",
        adjustedAmount: 90,
        subject: "Act cloned from accounting invoice",
      });
    expect(accountingAct.status).toBe(200);
    expect(accountingAct.body.document.parentDocId).toBe(accountingInvoiceId);
    expect(accountingAct.body.document.totalAmount).toBe("90.00");
    expect(accountingAct.body.items.map((item: any) => item.description)).toEqual([
      "Conference room",
      "Coffee break",
    ]);
    expect(accountingAct.body.items.map((item: any) => item.totalPrice)).toEqual([
      "40.00",
      "50.00",
    ]);
  });
});