import { createHash, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Before the real @workspace/db pool is imported, route every connection into
// this run's private schema. Excluding public makes missing fixtures fail closed.
const isolation = vi.hoisted(() => {
  const schema = `payment_races_${process.pid}_${Math.random().toString(36).slice(2)}`;
  const previousOptions = process.env.PGOPTIONS;
  process.env.PGOPTIONS = `-c search_path=${schema},pg_catalog`;
  return { schema, previousOptions };
});

vi.mock("../services/prro-signer.js", () => ({
  prroSigner: { sign: vi.fn() },
}));
// XML conformance has its own suite. This suite isolates payment allocation
// and submission state transitions, not the external XML validation boundary.
vi.mock("../services/prro-xsd.js", () => ({
  validateAgainstOfficialDpsXsd: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/dps-prro.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../services/dps-prro.js")>();
  return { ...actual, dpsPrroClient: { sendCheck: vi.fn() } };
});

import { pool } from "@workspace/db";
import paymentsRouter from "../routes/payment-layer.js";
import invoicesRouter from "../routes/invoices.js";
import spaRouter from "../routes/spa.js";
import { submitDocument } from "../routes/prro.js";
import { signToken } from "../lib/auth.js";
import { orchestrateFiscalization } from "../services/prro-orchestrator.js";
import { DpsPrroError, dpsPrroClient } from "../services/dps-prro.js";
import { prroSigner } from "../services/prro-signer.js";
import { provisionPaymentFixture } from "./helpers/payment-postgres-fixture.js";

const app = express();
app.use(express.json());
app.use("/payments", paymentsRouter);
app.use("/invoices", invoicesRouter);
app.use("/spa", spaRouter);
const admin = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=pg_catalog",
});
const sign = vi.mocked(prroSigner.sign);
const send = vi.mocked(dpsPrroClient.sendCheck);
const testKey = "synthetic-liqpay-key-not-a-real-credential";
let org: number;
let user: number;
let sellerA: number;
let sellerB: number;
let token: string;

const cents = (value: unknown) => Math.round(Number(value) * 100);
const burst = <T>(run: () => PromiseLike<T>, count = 8) =>
  Promise.all(Array.from({ length: count }, () => Promise.resolve(run())));

function assertPaymentResponse(response: request.Response) {
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const error = response.body.fiscalization?.error;
  // Losing a submission claim is expected while another callback owns it.
  // All other errors (including swallowed route errors) must fail the test.
  if (error !== undefined) expect(error).toBe("Документ уже обробляється іншим процесом");
}

async function invoice(items = [
  { name: "Hotel", amount: 60, legalEntityId: sellerA },
  { name: "Dinner", amount: 40, legalEntityId: sellerB },
]) {
  const { rows } = await pool.query(
    `INSERT INTO invoices (organization_id, invoice_number, amount, invoice_items, legal_entity_id)
     VALUES ($1,$2,100,$3,$4) RETURNING id`,
    [org, randomUUID(), JSON.stringify(items), sellerA],
  );
  return Number(rows[0].id);
}

function payInvoice(id: number, paidAmount: number) {
  return request(app).post(`/invoices/${id}/pay`).auth(token, { type: "bearer" })
    .send({ paidAmount, paymentMethod: "cash" });
}

async function events(sourceId: string) {
  return (await pool.query(
    "SELECT * FROM payment_events WHERE organization_id=$1 AND source_id=$2 ORDER BY target_amount",
    [org, sourceId],
  )).rows;
}

async function documents(keyPrefix: string) {
  return (await pool.query(
    "SELECT * FROM fiscal_documents WHERE organization_id=$1 AND starts_with(idempotency_key,$2) ORDER BY legal_entity_id",
    [org, keyPrefix],
  )).rows;
}

async function assertAllocation(event: any, expected: [number, number][], status: string) {
  const docs = await documents(`payment-event:${org}:${event.id}:seller:`);
  expect(docs).toHaveLength(expected.length);
  expect(docs.map(doc => [doc.legal_entity_id, cents(doc.total_amount)])).toEqual(
    [...expected].sort((a, b) => a[0] - b[0]),
  );
  expect(docs.reduce((sum, doc) => sum + cents(doc.total_amount), 0)).toBe(cents(event.delta_amount));
  for (const doc of docs) {
    expect(doc.status).toBe(status);
    expect(doc.payload_snapshot.lines.every((line: any) =>
      line.legalEntityId === doc.legal_entity_id && cents(line.amount) > 0)).toBe(true);
    expect(doc.payload_snapshot.lines.reduce((sum: number, line: any) => sum + cents(line.amount), 0))
      .toBe(cents(doc.total_amount));
  }
  return docs;
}

async function draft(key = randomUUID()) {
  const result = await orchestrateFiscalization({
    organizationId: org, sourceType: "booking", sourceId: key,
    items: [{ name: "Stay", amount: 10, legalEntityId: sellerA }],
    paymentChannel: "cash", idempotencyKey: key,
  });
  return result.documents[0];
}

describe("PostgreSQL payment/fiscal concurrency (real routes, locks and SQL)", () => {
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA "${isolation.schema}"`);
    // Fail before any fixture DDL if a DATABASE_URL option overrides PGOPTIONS.
    expect((await pool.query("SELECT current_schema() AS name")).rows[0].name).toBe(isolation.schema);
    await provisionPaymentFixture(pool);
    org = (await pool.query(
      "INSERT INTO organizations(name,slug) VALUES ('Payment race fixture',$1) RETURNING id", [randomUUID()],
    )).rows[0].id;
    user = (await pool.query(
      `INSERT INTO users(email,name,password_hash,role,organization_id)
       VALUES ($1,'Test owner','not-a-password','owner',$2) RETURNING id`,
      [`${randomUUID()}@example.test`, org],
    )).rows[0].id;
    token = signToken({ userId: user, organizationId: org, propertyId: null, role: "owner", email: "fixture@example.test" });
    const sellers = await pool.query(
      `INSERT INTO legal_entities(organization_id,name,edrpou,liqpay_private_key)
       VALUES ($1,'Hotel','12345678',$2),($1,'Restaurant','87654321',$2) RETURNING id`, [org, testKey],
    );
    [sellerA, sellerB] = sellers.rows.map(row => row.id);
    for (const seller of [sellerA, sellerB]) {
      const register = (await pool.query(
        `INSERT INTO prro_registers(organization_id,legal_entity_id,name,device_id,fiscal_number,status)
         VALUES ($1,$2,'Test register',$3,'4000123456','active') RETURNING id`, [org, seller, randomUUID()],
      )).rows[0].id;
      await pool.query(
        `INSERT INTO prro_shifts(organization_id,legal_entity_id,register_id,signer_key_id,status,opened_at)
         VALUES ($1,$2,$3,'synthetic-key-id','open',now())`, [org, seller, register],
      );
    }
  }, 60_000);

  beforeEach(() => {
    sign.mockReset().mockImplementation(async (_key, content) => Buffer.from(content));
    send.mockReset().mockImplementation(async () => ({
      id: `TEST-${randomUUID()}`, status: 1,
    }));
  });

  afterAll(async () => {
    await pool.end();
    try {
      await admin.query(`DROP SCHEMA IF EXISTS "${isolation.schema}" CASCADE`);
    } finally {
      await admin.end();
      if (isolation.previousOptions === undefined) delete process.env.PGOPTIONS;
      else process.env.PGOPTIONS = isolation.previousOptions;
    }
  });

  it("deduplicates signed simultaneous LiqPay callbacks into one ledger payment and seller document", async () => {
    const order = randomUUID();
    const session = (await pool.query(
      `INSERT INTO payment_sessions(organization_id,session_ref,legal_entity_id,amount,provider_order_id)
       VALUES ($1,$2,$3,100,$4) RETURNING id`, [org, randomUUID(), sellerA, order],
    )).rows[0].id;
    const data = Buffer.from(JSON.stringify({
      order_id: order, payment_id: "test-transaction", status: "success", amount: 100, currency: "UAH", action: "pay",
    })).toString("base64");
    const signature = createHash("sha1").update(testKey + data + testKey).digest("base64");
    const responses = await burst(() => request(app).post("/payments/webhook/liqpay").send({ data, signature }));
    responses.forEach(response => expect(response.body).toEqual({ ok: true }));
    const ledger = (await pool.query("SELECT * FROM payments WHERE payment_session_id=$1", [session])).rows;
    expect(ledger).toHaveLength(1);
    expect(cents(ledger[0].amount)).toBe(10000);
    const state = (await pool.query("SELECT * FROM payment_sessions WHERE id=$1", [session])).rows[0];
    expect(state.status).toBe("paid");
    expect(state.payment_id).toBe(ledger[0].id);
    expect(cents(state.paid_amount)).toBe(10000);
    const docs = await documents(`payment-session:${org}:${session}:seller:`);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ legal_entity_id: sellerA, status: "review", total_amount: "100.00" });
    expect((await pool.query("SELECT count(*) FROM payment_diagnostics WHERE session_id=$1", [session])).rows[0].count).toBe("0");
    expect((await pool.query("SELECT count(*) FROM payment_webhooks WHERE session_id=$1 AND signature_valid", [session])).rows[0].count).toBe("8");
    expect(send).not.toHaveBeenCalled(); // online acquiring must stay in review
  });

  it("records one immutable event per concurrent invoice cumulative target and conserves both sellers' cents", async () => {
    const id = await invoice();
    for (const target of [33.33, 100]) {
      const responses = await burst(() => payInvoice(id, target));
      responses.forEach(assertPaymentResponse);
    }
    const paid = await events(`invoice:${id}`);
    expect(paid).toHaveLength(2);
    expect(paid.map(event => [event.previous_amount, event.target_amount, event.delta_amount, event.status]))
      .toEqual([["0.00", "33.33", "33.33", "allocated"], ["33.33", "100.00", "66.67", "allocated"]]);
    await assertAllocation(paid[0], [[sellerA, 2000], [sellerB, 1333]], "fiscalized");
    await assertAllocation(paid[1], [[sellerA, 4001], [sellerB, 2666]], "fiscalized");
    expect(send).toHaveBeenCalledTimes(4);
    expect((await pool.query("SELECT paid_amount,status FROM invoices WHERE id=$1", [id])).rows[0])
      .toEqual({ paid_amount: "100.00", status: "paid" });
    const excess = await payInvoice(id, 100.01);
    expect(excess.status).toBe(400);
    expect(await events(`invoice:${id}`)).toHaveLength(2);
  });

  it("serializes SPA cumulative duplicates, records only positive deltas, and rejects stale lower targets", async () => {
    const id = (await pool.query(
      `INSERT INTO spa_appointments(organization_id,appointment_date,start_time,end_time,price)
       VALUES ($1,CURRENT_DATE,'10:00','11:00',100) RETURNING id`, [org],
    )).rows[0].id;
    const update = (paidAmount: number) => request(app).patch(`/spa/appointments/${id}`)
      .auth(token, { type: "bearer" }).send({ paidAmount, method: "cash", legalEntityId: sellerA });
    for (const target of [40, 100]) {
      const responses = await burst(() => update(target));
      responses.forEach(assertPaymentResponse);
    }
    const paid = await events(`spa:${id}`);
    expect(paid).toHaveLength(2);
    expect(paid.map(event => [event.previous_amount, event.delta_amount, event.status]))
      .toEqual([["0.00", "40.00", "allocated"], ["40.00", "60.00", "allocated"]]);
    await assertAllocation(paid[0], [[sellerA, 4000]], "fiscalized");
    await assertAllocation(paid[1], [[sellerA, 6000]], "fiscalized");
    expect((await update(40)).status).toBe(422);
    expect((await pool.query("SELECT paid_amount FROM spa_appointments WHERE id=$1", [id])).rows[0].paid_amount).toBe("100.00");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("never over-receipts when different invoice cumulative targets compete for the same row", async () => {
    const id = await invoice([{ name: "Hotel", amount: 100, legalEntityId: sellerA }]);
    const responses = await Promise.all([33.33, 100, 33.33, 100, 100, 33.33].map(target => payInvoice(id, target)));
    for (const response of responses) {
      if (response.status === 200) assertPaymentResponse(response);
      else {
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/^paidAmount must be between/);
      }
    }
    const paid = await events(`invoice:${id}`);
    expect([1, 2]).toContain(paid.length); // 100 may win before 33.33.
    expect(paid.reduce((sum, event) => sum + cents(event.delta_amount), 0)).toBe(10000);
    for (const event of paid) {
      expect(cents(event.delta_amount)).toBeGreaterThan(0);
      await assertAllocation(event, [[sellerA, cents(event.delta_amount)]], "fiscalized");
    }
    expect(send).toHaveBeenCalledTimes(paid.length);
    expect((await pool.query("SELECT paid_amount FROM invoices WHERE id=$1", [id])).rows[0].paid_amount).toBe("100.00");
  });

  it("never receipts an unpaid seller split, and refuses aggregate invoice replay after a split payment", async () => {
    const id = await invoice();
    const splits: number[] = [];
    for (const [seller, amount] of [[sellerA, 60], [sellerB, 40]]) {
      splits.push((await pool.query(
        `INSERT INTO invoice_splits(invoice_id,legal_entity_id,amount,items_snapshot)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [id, seller, amount, JSON.stringify([{ name: "Split line", amount, legalEntityId: seller }])],
      )).rows[0].id);
    }
    const confirm = (split: number, txId: string, paidAmount: number) => request(app)
      .post(`/payments/invoices/${id}/splits/${split}/mark-paid`).auth(token, { type: "bearer" }).send({ txId, paidAmount });
    const responses = await burst(() => confirm(splits[0], "transaction-A", 60));
    responses.forEach(response => {
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.fiscalization.error).toBeUndefined();
    });
    const paidA = await events(`invoice-split:${splits[0]}`);
    expect(paidA).toHaveLength(1);
    await assertAllocation(paidA[0], [[sellerA, 6000]], "review");
    expect(await events(`invoice-split:${splits[1]}`)).toHaveLength(0);
    expect((await pool.query("SELECT status,paid_amount FROM invoice_splits WHERE id=$1", [splits[1]])).rows[0])
      .toEqual({ status: "pending", paid_amount: null });
    expect((await payInvoice(id, 100)).status).toBe(409);
    expect((await confirm(splits[0], "other-transaction", 60)).status).toBe(409);
    expect((await confirm(splits[1], "wrong-amount", 39)).status).toBe(422);
    expect(await events(`invoice:${id}`)).toHaveLength(0);
    const remaining = await burst(() => confirm(splits[1], "transaction-B", 40));
    remaining.forEach(response => {
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.fiscalization.error).toBeUndefined();
    });
    const paidB = await events(`invoice-split:${splits[1]}`);
    expect(paidB).toHaveLength(1);
    await assertAllocation(paidB[0], [[sellerB, 4000]], "review");
    expect((await pool.query("SELECT status FROM invoices WHERE id=$1", [id])).rows[0].status).toBe("paid");
    expect(send).not.toHaveBeenCalled();
  });

  it("replays the same mixed-seller allocation under contention without duplicate local numbers or documents", async () => {
    const key = randomUUID();
    const input = {
      organizationId: org, sourceType: "hotel_folio", sourceId: key, idempotencyKey: key,
      paymentChannel: "cash" as const,
      items: [{ name: "Hotel", amount: 60, legalEntityId: sellerA }, { name: "Dinner", amount: 40, legalEntityId: sellerB }],
    };
    const results = await burst(() => orchestrateFiscalization(input));
    expect(results.filter(result => !result.replayed)).toHaveLength(1);
    expect(new Set(results.map(result => result.documents.map(doc => doc.id).join(","))).size).toBe(1);
    expect(await documents(`${key}:seller:`)).toHaveLength(2);
    await expect(orchestrateFiscalization({ ...input, items: [
      { name: "Changed hotel", amount: 70, legalEntityId: sellerA },
      { name: "Dinner", amount: 30, legalEntityId: sellerB },
    ] })).rejects.toThrow("Ключ ідемпотентності");
    const duplicates = await pool.query(
      `SELECT register_id,shift_id,local_number FROM fiscal_documents WHERE organization_id=$1
       AND local_number IS NOT NULL GROUP BY register_id,shift_id,local_number HAVING count(*)>1`, [org],
    );
    expect(duplicates.rows).toEqual([]);
  });

  it("rolls back an entire mixed-seller allocation when a seller lacks fiscal resources", async () => {
    const unconfigured = (await pool.query(
      "INSERT INTO legal_entities(organization_id,name) VALUES ($1,'No register') RETURNING id", [org],
    )).rows[0].id;
    const key = randomUUID();
    await expect(orchestrateFiscalization({
      organizationId: org, sourceType: "hotel_folio", sourceId: key, idempotencyKey: key,
      paymentChannel: "cash",
      items: [{ name: "Hotel", amount: 60, legalEntityId: sellerA }, { name: "Unconfigured", amount: 40, legalEntityId: unconfigured }],
    })).rejects.toThrow("немає активної каси");
    expect(await documents(`${key}:seller:`)).toHaveLength(0);
  });

  it("allows a safe pre-DPS failure to retry the same document exactly once under contention", async () => {
    const doc = await draft();
    sign.mockRejectedValueOnce(new Error("Synthetic signer unavailable before DPS"));
    await expect(submitDocument(org, doc.id)).rejects.toThrow("Synthetic signer");
    expect((await pool.query("SELECT status,attempt_count FROM fiscal_documents WHERE id=$1", [doc.id])).rows[0])
      .toEqual({ status: "failed_safe_to_retry", attempt_count: 1 });
    expect(send).not.toHaveBeenCalled();
    await burst(() => submitDocument(org, doc.id).catch(error => {
      expect(error.message).toContain("іншим процесом");
    }));
    const saved = (await pool.query("SELECT * FROM fiscal_documents WHERE id=$1", [doc.id])).rows[0];
    expect(saved).toMatchObject({ status: "fiscalized", attempt_count: 2, idempotency_key: doc.idempotency_key, local_number: doc.local_number });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await documents(doc.idempotency_key)).toHaveLength(1);
  });

  it("retries a retryable provider failure without creating another payment event or seller document", async () => {
    const id = await invoice([{ name: "Hotel", amount: 100, legalEntityId: sellerA }]);
    send.mockRejectedValueOnce(new DpsPrroError("Synthetic provider overload", 8, true));
    const failed = await payInvoice(id, 100);
    expect(failed.status).toBe(200);
    expect(failed.body.fiscalization.error).toBe("Synthetic provider overload");
    const [event] = await events(`invoice:${id}`);
    expect(event.delta_amount).toBe("100.00");
    const [pending] = await assertAllocation(event, [[sellerA, 10000]], "pending_retry");
    expect(pending.attempt_count).toBe(1);
    expect(pending.next_retry_at).toBeInstanceOf(Date);
    const responses = await burst(() => payInvoice(id, 100));
    responses.forEach(assertPaymentResponse);
    expect(await events(`invoice:${id}`)).toHaveLength(1);
    const [fiscalized] = await assertAllocation(event, [[sellerA, 10000]], "fiscalized");
    expect(fiscalized).toMatchObject({
      id: pending.id, content_hash: pending.content_hash, local_number: pending.local_number, attempt_count: 2,
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does not retry an uncertain DPS outcome even when concurrent callers replay the document", async () => {
    const doc = await draft();
    send.mockRejectedValueOnce(new DpsPrroError("Synthetic timeout after send"));
    await expect(submitDocument(org, doc.id)).rejects.toThrow("Synthetic timeout");
    const before = (await pool.query("SELECT * FROM fiscal_documents WHERE id=$1", [doc.id])).rows[0];
    expect(before).toMatchObject({ status: "outcome_unknown", attempt_count: 1 });
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => submitDocument(org, doc.id)));
    expect(attempts.every(result => result.status === "rejected")).toBe(true);
    const after = (await pool.query("SELECT * FROM fiscal_documents WHERE id=$1", [doc.id])).rows[0];
    expect(after).toEqual(before);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(await documents(doc.idempotency_key)).toHaveLength(1);
  });

  it("replays invoice callbacks after an uncertain outcome without submitting again or changing the original allocation", async () => {
    const id = await invoice([{ name: "Hotel", amount: 100, legalEntityId: sellerA }]);
    send.mockRejectedValueOnce(new DpsPrroError("Synthetic timeout after acceptance"));
    const failed = await payInvoice(id, 100);
    expect(failed.status).toBe(200);
    expect(failed.body.fiscalization.error).toBe("Synthetic timeout after acceptance");
    const [event] = await events(`invoice:${id}`);
    const [before] = await assertAllocation(event, [[sellerA, 10000]], "outcome_unknown");
    const responses = await burst(() => payInvoice(id, 100));
    responses.forEach(assertPaymentResponse);
    expect(await events(`invoice:${id}`)).toHaveLength(1);
    expect(await assertAllocation(event, [[sellerA, 10000]], "outcome_unknown")).toEqual([before]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledTimes(1);
  });
});
