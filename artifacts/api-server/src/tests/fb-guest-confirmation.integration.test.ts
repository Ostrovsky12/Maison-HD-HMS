import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", () => ({ pool: {} }));
import { confirmGuestItems, hasUnconfirmedGuestItems } from "../lib/fb-guest-confirmation.js";

describe.skipIf(process.env.QR_CONFIRM_DB_TEST !== "1")("waiter approval with real PostgreSQL transactions", () => {
  const schema = `test_qr_confirm_${randomUUID().replaceAll("-", "")}`;
  let pool: any, database: any;
  const approve = (ids = [1], org = 1, user = 7) => confirmGuestItems(org, 10, user, ids, database);
  const sql = async (text: string, values?: any[]) => {
    const client = await database.connect();
    try { return await client.query(text, values); } finally { client.release(); }
  };
  beforeAll(async () => {
    const { Pool } = createRequire(new URL("../../../../lib/db/package.json", import.meta.url))("pg");
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 3000 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    database = { connect: async () => {
      const client = await pool.connect(); await client.query(`SET search_path TO "${schema}"`);
      const release = client.release.bind(client);
      return { query: client.query.bind(client), release: () => { void client.query("RESET search_path").finally(release); } };
    }};
    await sql(`CREATE TABLE fb_orders(id int PRIMARY KEY,organization_id int,status text,paid_amount numeric,updated_at timestamptz);
      CREATE TABLE fb_order_items(id int PRIMARY KEY,order_id int,organization_id int,status text,
        requires_confirmation boolean NOT NULL DEFAULT false,confirmed_at timestamptz,confirmed_by int);`);
  });
  afterAll(async () => {
    if (!pool) return;
    try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); }
  });
  beforeEach(async () => {
    await sql(`TRUNCATE fb_orders,fb_order_items;
      INSERT INTO fb_orders VALUES(10,1,'new_guest',0,now());
      INSERT INTO fb_order_items(id,order_id,organization_id,status,requires_confirmation) VALUES(1,10,1,'pending',true);`);
  });
  it("records staff identity and opens the existing bill after approval", async () => {
    expect(await approve()).toEqual({ confirmedCount: 1, confirmedIds: [1] });
    const item = (await sql("SELECT * FROM fb_order_items")).rows[0];
    expect(item.confirmed_by).toBe(7); expect(item.confirmed_at).toBeInstanceOf(Date);
    expect((await sql("SELECT status FROM fb_orders")).rows[0].status).toBe("open");
  });
  it("is idempotent, including two concurrent approvals", async () => {
    const results = await Promise.all([approve(), approve()]);
    expect(results.map(r => r.confirmedCount).sort()).toEqual([0, 1]);
  });
  it("approves only the reviewed IDs, not a later addition", async () => {
    await sql("INSERT INTO fb_order_items(id,order_id,organization_id,status,requires_confirmation) VALUES(2,10,1,'pending',true)");
    await approve();
    expect((await sql("SELECT confirmed_at FROM fb_order_items WHERE id=2")).rows[0].confirmed_at).toBeNull();
    expect(await hasUnconfirmedGuestItems(1, 10, { query: sql })).toBe(true);
  });
  it("preserves confirmation requirements for unreviewed legacy rows when opening the bill", async () => {
    await sql("UPDATE fb_order_items SET requires_confirmation=false; INSERT INTO fb_order_items(id,order_id,organization_id,status) VALUES(2,10,1,'pending')");
    await approve();
    const row = (await sql("SELECT * FROM fb_order_items WHERE id=2")).rows[0];
    expect(row.requires_confirmation).toBe(true); expect(row.confirmed_at).toBeNull();
  });
  it("never confirms a different tenant's bill", async () => {
    await expect(approve([1], 2)).rejects.toMatchObject({ status: 404 });
    expect((await sql("SELECT confirmed_at FROM fb_order_items")).rows[0].confirmed_at).toBeNull();
  });
  it("rolls back the whole approval when a selected item was cancelled", async () => {
    await sql("INSERT INTO fb_order_items(id,order_id,organization_id,status,requires_confirmation) VALUES(2,10,1,'cancelled',true)");
    await expect(approve([1, 2])).rejects.toMatchObject({ status: 409 });
    expect((await sql("SELECT confirmed_at FROM fb_order_items WHERE id=1")).rows[0].confirmed_at).toBeNull();
  });
  it("rejects unknown item IDs without accepting the other rows", async () => {
    await expect(approve([1, 999])).rejects.toMatchObject({ status: 409 });
    expect((await sql("SELECT confirmed_at FROM fb_order_items WHERE id=1")).rows[0].confirmed_at).toBeNull();
  });
  it.each(["billed", "cancelled"])("does not approve a %s bill", async status => {
    await sql("UPDATE fb_orders SET status=$1", [status]);
    await expect(approve()).rejects.toMatchObject({ status: 409 });
  });
  it("does not approve an already paying bill", async () => {
    await sql("UPDATE fb_orders SET paid_amount=1");
    await expect(approve()).rejects.toMatchObject({ status: 409 });
  });
  it("does not change a staff-entered item into a guest approval", async () => {
    await sql("UPDATE fb_orders SET status='open'; UPDATE fb_order_items SET requires_confirmation=false");
    await expect(approve()).rejects.toMatchObject({ status: 409 });
  });
  it("serializes safely with a guest adding a new pending row while the waiter confirms an older snapshot", async () => {
    const guest = await database.connect();
    try {
      await guest.query("BEGIN"); await guest.query("SELECT * FROM fb_orders WHERE id=10 FOR UPDATE");
      const approval = approve();
      await guest.query("INSERT INTO fb_order_items(id,order_id,organization_id,status,requires_confirmation) VALUES(2,10,1,'pending',true)");
      await guest.query("COMMIT"); await approval;
      expect((await sql("SELECT confirmed_at FROM fb_order_items WHERE id=2")).rows[0].confirmed_at).toBeNull();
    } finally { guest.release(); }
  });
});
