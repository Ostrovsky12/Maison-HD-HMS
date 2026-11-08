import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", () => ({ pool: {} }));
vi.mock("../lib/encrypt.js", () => ({ decrypt: () => null }));
import { openServicePoint, resolveServicePoint, releaseStaffItems, readServicePointBill, requestCashPayment } from "../lib/fb-service-points.js";
import { recordGuestLiqPayResult } from "../lib/fb-liqpay-review.js";

describe.skipIf(process.env.QR_SERVICE_DB_TEST !== "1")("shared service point sessions with PostgreSQL", () => {
  const schema = `test_service_qr_${randomUUID().replaceAll("-", "")}`;
  let pool: any, database: any;
  const sql = async (text: string, values?: any[]) => {
    const client = await database.connect();
    try { return await client.query(text, values); } finally { client.release(); }
  };
  beforeAll(async () => {
    const { Pool } = createRequire(new URL("../../../../lib/db/package.json", import.meta.url))("pg");
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 3000 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    database = { connect: async () => {
      const client = await pool.connect();
      await client.query(`SET search_path TO "${schema}"`);
      const release = client.release.bind(client);
      return { query: client.query.bind(client), release: () => { void client.query("RESET search_path").finally(release); } };
    }, query: sql };
    await sql(`CREATE TABLE organizations(id int PRIMARY KEY,slug text);
      CREATE TABLE fb_table_groups(id int PRIMARY KEY,organization_id int,name text,is_active boolean);
      CREATE TABLE fb_tables(id int PRIMARY KEY,organization_id int,number text,location text,group_id int,
        status text DEFAULT 'free',current_order_id int,is_active boolean DEFAULT true);
      CREATE TABLE fb_orders(id serial PRIMARY KEY,organization_id int,table_id int,order_type text,
        guest_name text,guest_count int,status text,paid_amount numeric DEFAULT 0,total_amount numeric DEFAULT 0,
        opened_at timestamptz DEFAULT now(),outlet_id int);
      CREATE TABLE fb_outlets(id int PRIMARY KEY,organization_id int,is_active boolean);
      CREATE TABLE fb_order_items(id serial PRIMARY KEY,organization_id int,order_id int,name text DEFAULT 'Страва',
        quantity numeric DEFAULT 1,total_price numeric DEFAULT 50,status text DEFAULT 'pending',
        requires_confirmation boolean DEFAULT false,confirmed_at timestamptz,sent_at timestamptz);
      CREATE TABLE fb_table_notifications(id serial PRIMARY KEY,organization_id int,table_id int,
        table_number text,table_location text,type text,payload jsonb,status text,created_at timestamptz DEFAULT now());
      CREATE TABLE legal_entities(organization_id int,liqpay_public_key text,liqpay_private_key text,is_active boolean,is_default boolean);`);
  });
  afterAll(async () => {
    if (!pool) return;
    try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); }
  });
  beforeEach(async () => {
    await sql(`TRUNCATE organizations,fb_table_groups,fb_tables,fb_orders,fb_order_items,fb_outlets,fb_table_notifications,legal_entities RESTART IDENTITY;
      INSERT INTO organizations VALUES (1,'dogoda'),(2,'other');
      INSERT INTO legal_entities VALUES (1,'fixture-merchant','fixture-signing-key',true,true);
      INSERT INTO fb_table_groups VALUES (1,1,'Будинки',true),(2,1,'Тераса',true),(3,2,'Other',true);
      INSERT INTO fb_tables(id,organization_id,number,location,group_id) VALUES
        (11,1,'1','Будинки',1),(12,1,'1','Тераса',2),(13,2,'1','Other',3);`);
  });
  async function readyBill() {
    const { orderId } = await openServicePoint(1, 11, database);
    await sql("UPDATE fb_orders SET total_amount=300 WHERE id=$1", [orderId]);
    await sql("INSERT INTO fb_order_items(organization_id,order_id,total_price) VALUES (1,$1,300)", [orderId]);
    return { expectedOrderId: orderId, expectedTotal: 300 };
  }
  function signedEvent(orderId: number, extra: Record<string, unknown> = {}) {
    const data = Buffer.from(JSON.stringify({ public_key: "fixture-merchant", order_id: `fb-${orderId}-123`,
      payment_id: 101, currency: "UAH", amount: 345, status: "success", ...extra })).toString("base64");
    return { data, signature: createHash("sha1").update(`fixture-signing-key${data}fixture-signing-key`).digest("base64") };
  }
  it("durably records concurrent successful legacy callbacks exactly once, without moving tips or closing a bill", async () => {
    const expected = await readyBill();
    const { data, signature } = signedEvent(expected.expectedOrderId);
    const results = await Promise.all([recordGuestLiqPayResult(data, signature, database),
      recordGuestLiqPayResult(data, signature, database)]);
    expect(results.filter(r => "duplicate" in r && r.duplicate)).toHaveLength(1);
    const rows = (await sql("SELECT * FROM fb_table_notifications WHERE type='payment_review'")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ orderId: expected.expectedOrderId, total: 345, needsReconciliation: true });
    const order = (await sql("SELECT * FROM fb_orders WHERE id=$1", [expected.expectedOrderId])).rows[0];
    expect(order.status).toBe("open"); expect(Number(order.paid_amount)).toBe(0);
  });
  it("does not record forged signatures or cross-merchant callbacks", async () => {
    const expected = await readyBill();
    const { data } = signedEvent(expected.expectedOrderId);
    await expect(recordGuestLiqPayResult(data, "forged", database)).rejects.toMatchObject({ status: 403 });
    const wrong = signedEvent(expected.expectedOrderId, { public_key: "different-merchant" });
    await expect(recordGuestLiqPayResult(wrong.data, wrong.signature, database)).rejects.toMatchObject({ status: 403 });
    expect((await sql("SELECT id FROM fb_table_notifications")).rows).toHaveLength(0);
  });
  it.each(["processing", "sandbox", "failure"])("does not treat %s as collected money", async status => {
    const { data, signature } = signedEvent(999, { status });
    expect(await recordGuestLiqPayResult(data, signature, { connect: () => { throw new Error("No DB access expected"); } }))
      .toEqual({ ignored: true });
  });
  it("deduplicates concurrent cash requests and never collects money or closes the bill", async () => {
    const expected = await readyBill();
    const results = await Promise.all([requestCashPayment("dogoda", 11, expected, database),
      requestCashPayment("dogoda", 11, expected, database)]);
    expect(results[0].id).toBe(results[1].id);
    expect(results.filter(r => r.duplicate)).toHaveLength(1);
    const notifications = (await sql("SELECT * FROM fb_table_notifications")).rows;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].payload).toMatchObject({
      orderId: expected.expectedOrderId, total: 300, tipPct: 0, tipAmount: 0, groupName: "Будинки", destination: "maison_hd",
    });
    const order = (await sql("SELECT * FROM fb_orders WHERE id=$1", [expected.expectedOrderId])).rows[0];
    expect(order.status).toBe("open"); expect(Number(order.paid_amount)).toBe(0);
    expect((await readServicePointBill("dogoda", 11, database)).cashRequestPending).toBe(true);
  });
  it("rejects another tenant, stale session and changed totals without notifying the cashier", async () => {
    const expected = await readyBill();
    await expect(requestCashPayment("other", 11, expected, database)).rejects.toMatchObject({ status: 404 });
    await expect(requestCashPayment("dogoda", 11, { ...expected, expectedOrderId: 999 }, database)).rejects.toMatchObject({ status: 409 });
    await expect(requestCashPayment("dogoda", 11, { ...expected, expectedTotal: 250 }, database)).rejects.toMatchObject({ status: 409 });
    expect((await sql("SELECT id FROM fb_table_notifications")).rows).toHaveLength(0);
  });
  it("refuses payment requests for unaccepted guest additions and partially paid bills", async () => {
    const expected = await readyBill();
    await sql("UPDATE fb_order_items SET requires_confirmation=true");
    await expect(requestCashPayment("dogoda", 11, expected, database)).rejects.toMatchObject({ status: 409 });
    await sql("UPDATE fb_order_items SET confirmed_at=now()");
    await sql("UPDATE fb_orders SET paid_amount=10 WHERE id=$1", [expected.expectedOrderId]);
    await expect(requestCashPayment("dogoda", 11, expected, database)).rejects.toMatchObject({ status: 409 });
    expect((await sql("SELECT id FROM fb_table_notifications")).rows).toHaveLength(0);
  });
  it("resolves identical display numbers to different groups without creating orders", async () => {
    const house = await resolveServicePoint(1, "/maison-hd/qr-menu/dogoda/11", database);
    const terrace = await resolveServicePoint(1, "/maison-hd/qr-menu/dogoda/12", database);
    expect(house.point.groupName).toBe("Будинки"); expect(terrace.point.groupName).toBe("Тераса");
    expect(house.orderId).toBeNull();
    expect((await sql("SELECT count(*)::int AS n FROM fb_orders")).rows[0].n).toBe(0);
  });
  it("does not resolve or open another tenant's point", async () => {
    await expect(openServicePoint(1, 13, database)).rejects.toMatchObject({ status: 404 });
    await expect(resolveServicePoint(1, "/qr-menu/other/13", database)).rejects.toMatchObject({ status: 404 });
  });
  it("rejects inactive groups and inactive points", async () => {
    await sql("UPDATE fb_table_groups SET is_active=false WHERE id=1");
    await expect(openServicePoint(1, 11, database)).rejects.toMatchObject({ status: 404 });
    await sql("UPDATE fb_tables SET is_active=false WHERE id=12");
    await expect(openServicePoint(1, 12, database)).rejects.toMatchObject({ status: 404 });
  });
  it("two simultaneous staff scans open only one shared bill", async () => {
    const results = await Promise.all([openServicePoint(1, 11, database), openServicePoint(1, 11, database)]);
    expect(results[0].orderId).toBe(results[1].orderId);
    expect(results.filter(r => r.created)).toHaveLength(1);
    expect((await sql("SELECT count(*)::int AS n FROM fb_orders")).rows[0].n).toBe(1);
  });
  it("reuses guest-created open bills instead of creating a second account", async () => {
    await sql("INSERT INTO fb_orders(id,organization_id,table_id,status) VALUES(10,1,11,'new_guest')");
    expect(await openServicePoint(1, 11, database)).toEqual({ orderId: 10, created: false });
  });
  it("the reusable sticker opens a new session after closure", async () => {
    const first = await openServicePoint(1, 11, database);
    await sql("UPDATE fb_orders SET status='billed' WHERE id=$1", [first.orderId]);
    const second = await openServicePoint(1, 11, database);
    expect(second.created).toBe(true); expect(second.orderId).not.toBe(first.orderId);
    const bill = await readServicePointBill("dogoda", 11, database);
    expect(bill.order?.id).toBe(second.orderId);
  });
  it("does not guess when historical data has multiple open accounts", async () => {
    await sql("INSERT INTO fb_orders(organization_id,table_id,status) VALUES(1,11,'open'),(1,11,'open')");
    await expect(openServicePoint(1, 11, database)).rejects.toMatchObject({ status: 409 });
  });
  it("preserves outlet menu selection and rejects a foreign outlet", async () => {
    await sql("INSERT INTO fb_outlets VALUES(1,1,true),(2,2,true)");
    await expect(openServicePoint(1, 11, database, 2)).rejects.toMatchObject({ status: 404 });
    const result = await openServicePoint(1, 11, database, 1);
    expect((await sql("SELECT outlet_id FROM fb_orders WHERE id=$1", [result.orderId])).rows[0].outlet_id).toBe(1);
  });
  it("releases only the reviewed staff item IDs and is idempotent", async () => {
    const { orderId } = await openServicePoint(1, 11, database);
    await sql("INSERT INTO fb_order_items(id,organization_id,order_id) VALUES(1,1,$1),(2,1,$1)", [orderId]);
    expect(await releaseStaffItems(1, orderId, [1], database)).toBe(1);
    expect(await releaseStaffItems(1, orderId, [1], database)).toBe(0);
    expect((await sql("SELECT sent_at FROM fb_order_items WHERE id=2")).rows[0].sent_at).toBeNull();
  });
  it("rolls back the selection if one item is unaccepted QR or missing", async () => {
    const { orderId } = await openServicePoint(1, 11, database);
    await sql("INSERT INTO fb_order_items(id,organization_id,order_id,requires_confirmation) VALUES(1,1,$1,false),(2,1,$1,true)", [orderId]);
    await expect(releaseStaffItems(1, orderId, [1, 2], database)).rejects.toMatchObject({ status: 409 });
    await expect(releaseStaffItems(1, orderId, [1, 99], database)).rejects.toMatchObject({ status: 409 });
    expect((await sql("SELECT sent_at FROM fb_order_items WHERE id=1")).rows[0].sent_at).toBeNull();
  });
  it("blocks release to an already paid or closed account", async () => {
    const { orderId } = await openServicePoint(1, 11, database);
    await sql("UPDATE fb_orders SET paid_amount=1 WHERE id=$1", [orderId]);
    await expect(releaseStaffItems(1, orderId, [1], database)).rejects.toMatchObject({ status: 409 });
    await expect(openServicePoint(1, 11, database)).rejects.toMatchObject({ status: 409 });
  });
  it("public bill contains no guest personal fields and no items from another session", async () => {
    const { orderId } = await openServicePoint(1, 11, database);
    await sql("INSERT INTO fb_order_items(organization_id,order_id,name) VALUES(1,$1,'Борщ')", [orderId]);
    const bill = await readServicePointBill("dogoda", 11, database);
    expect(bill.items).toHaveLength(1);
    expect(bill.order).not.toHaveProperty("guest_name");
    await sql("UPDATE fb_orders SET status='billed' WHERE id=$1", [orderId]);
    expect((await readServicePointBill("dogoda", 11, database)).items).toEqual([]);
  });
});
