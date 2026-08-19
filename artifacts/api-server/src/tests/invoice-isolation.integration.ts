import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import invoicesRouter from "../routes/invoices.js";
import { signToken } from "../lib/auth.js";

const app = express();
app.use(express.json());
app.use("/api/invoices", invoicesRouter);

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
    await pool.end();
  });

  it("creates one invoice per tenant and scopes list and detail reads", async () => {
    const createA = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        invoiceNumber: `INV-A-${runId}`,
        amount: 125,
        description: "Tenant A invoice",
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
  });
});