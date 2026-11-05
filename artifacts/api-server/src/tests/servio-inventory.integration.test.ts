import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
vi.mock("@workspace/db", () => ({ pool: {} }));
import { withServioInventory, servioInventoryKey, ServioInventoryConflict, applyServioLocalCapacity } from "../lib/servio-inventory.js";
import type { Attempt, ReservationConnection } from "../lib/servio-reservations.js";
import type { BookingServioReservationInput } from "@workspace/api-zod";

// Explicit opt-in. Isolated schema, real PostgreSQL sessions, NO Servio/LiqPay/SMTP calls.
describe.skipIf(process.env.SERVIO_INVENTORY_DB_TEST !== "1")("real PostgreSQL Servio inventory admission", () => {
  const schema = `test_servio_inventory_${randomUUID().replaceAll("-", "")}`;
  let pool: any, db: any, writes = 0, stock = 1;
  let daily: Record<string, number> = {};
  const connection: ReservationConnection = {
    base: `https://${schema.replaceAll("_", "-")}.servio.support/ReservationService_1_10`, token: "fixture-only", hotelId: 7,
    publicKey: "fixture", secretKey: "fixture", propertyId: 1, legalEntityId: 1, mode: "test",
    origin: "https://example.invalid", checkInTime: "14:00", checkOutTime: "12:00",
  };
  const input = (patch: Partial<BookingServioReservationInput> = {}) => ({
    requestId: randomUUID(), categoryId: 11, checkIn: "2035-06-01", checkOut: "2035-06-02",
    adults: 2, childAges: [], companyCodeId: 0, useExtraBed: false, ...patch,
  } as BookingServioReservationInput);
  const read = vi.fn(async (_base: string, _token: string, _method: string, payload: any) => ({
    Result: 0, RoomTypes: [11, 22].map(ID => ({ ID, FreeRoom: daily[payload.DateArrival] ?? stock })),
  }));
  async function admit(data = input(), orgId = 7, patch: { state?: string } = {}) {
    return withServioInventory(orgId, data, connection, JSON.stringify(data), async client => {
      writes++;
      return (await client.query(`INSERT INTO servio_booking_attempts
        (id,organization_id,request_id,request_hash,state,inventory_key,payload)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
        [randomUUID(), orgId, data.requestId, JSON.stringify(data), patch.state ?? "bill_ready",
          servioInventoryKey(connection, data.categoryId), JSON.stringify({ input: data })])).rows[0] as Attempt;
    }, db, read);
  }
  async function retryBusy(data = input(), orgId = 7): Promise<Attempt> {
    for (let i = 0; i < 100; i++) {
      try { return await admit(data, orgId); }
      catch (error) {
        if (!(error instanceof ServioInventoryConflict) || error.code !== "INVENTORY_BUSY") throw error;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    throw new Error("fixture lock did not become available");
  }
  const sql = (query: string, values: any[] = []) => pool.query(query.replaceAll("FIXTURE.", `"${schema}".`), values);
  beforeAll(async () => {
    // Vitest aliases @workspace/db (even importActual) to mocks. Resolve the
    // installed PostgreSQL driver directly so this really tests separate sessions.
    const { Pool } = createRequire(new URL("../../../../lib/db/package.json", import.meta.url))("pg");
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 12, connectionTimeoutMillis: 3000 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`CREATE TABLE "${schema}".servio_booking_attempts (
      id uuid PRIMARY KEY, organization_id integer NOT NULL,request_id uuid NOT NULL,request_hash text NOT NULL,
      state text NOT NULL,inventory_key text,payload jsonb NOT NULL,UNIQUE(organization_id,request_id))`);
    await pool.query(`CREATE TABLE "${schema}".servio_inventory_days (
      inventory_key text NOT NULL,stay_date date NOT NULL,capacity integer NOT NULL CHECK(capacity>=0),
      PRIMARY KEY(inventory_key,stay_date))`);
    db = { connect: async () => {
      const client = await pool.connect();
      await client.query(`SET search_path TO "${schema}"`);
      return { query: client.query.bind(client), release: (destroy: boolean) => {
        if (destroy) { client.release(true); return; }
        // Never return a fixture search_path to the application pool.
        void client.query("RESET search_path").then(() => client.release(), () => client.release(true));
      } };
    } };
  });
  beforeEach(async () => {
    await sql("TRUNCATE FIXTURE.servio_booking_attempts,FIXTURE.servio_inventory_days");
    writes = 0; stock = 1; daily = {}; read.mockClear();
  });
  afterAll(async () => {
    if (pool) { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end(); }
  });

  it("admits exactly one of ten concurrent guests for the last room despite stale PMS counts", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => retryBusy()));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(writes).toBe(1);
    expect(Number((await sql("SELECT count(*) AS n FROM FIXTURE.servio_booking_attempts")).rows[0].n)).toBe(1);
  });
  it("admits all three available rooms, but no fourth, even if PMS keeps returning three", async () => {
    stock = 3;
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => retryBusy()));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(3); expect(writes).toBe(3);
  });
  it("updates guest search without subtracting a PMS-visible hold twice", async () => {
    stock = 3; await admit();
    const client = await db.connect();
    try {
      for (const providerFree of [2, 3]) {
        const snapshot: any = { query: input(), categories: [{ id: 11, freeRooms: providerFree }] };
        await applyServioLocalCapacity(snapshot, connection, client);
        expect(snapshot.categories[0].freeRooms).toBe(2);
      }
    } finally { client.release(false); }
  });
  it("returns the same durable attempt on retry even when the category is now sold out", async () => {
    const data = input(), first = await admit(data), reads = read.mock.calls.length;
    expect((await admit(data)).id).toBe(first.id); expect(writes).toBe(1); expect(read.mock.calls).toHaveLength(reads);
  });
  it("shares the quota between different rates and tenant connections to the same physical hotel", async () => {
    await admit(input({ priceListId: 10 }));
    await expect(admit(input({ priceListId: 20 }), 8)).rejects.toMatchObject({ code: "SOLD_OUT" });
    expect(writes).toBe(1);
  });
  it("keeps unrelated categories independent", async () => {
    await admit();
    await admit(input({ categoryId: 22 }));
    expect(writes).toBe(2);
  });
  it("blocks overlapping stays, not an arrival on the preceding guest's departure date", async () => {
    await admit(input({ checkOut: "2035-06-03" }));
    await expect(admit(input({ checkIn: "2035-06-02", checkOut: "2035-06-04" }))).rejects.toMatchObject({ code: "SOLD_OUT" });
    await admit(input({ checkIn: "2035-06-03", checkOut: "2035-06-04" }));
    expect(writes).toBe(2);
  });
  it("uses each night's real stock, not the minimum for the whole longer stay", async () => {
    daily = { "2035-06-01": 1, "2035-06-02": 3 };
    await admit(input({ checkOut: "2035-06-03" }));
    await admit(input({ checkIn: "2035-06-02", checkOut: "2035-06-03" }));
    await admit(input({ checkIn: "2035-06-02", checkOut: "2035-06-03" }));
    await expect(admit(input({ checkIn: "2035-06-02", checkOut: "2035-06-03" }))).rejects.toMatchObject({ code: "SOLD_OUT" });
    expect(writes).toBe(3);
  });
  it.each(["creating", "awaiting_payment", "cancelling", "expiring", "review", "confirmed"])("does not release a %s hold based on a timer or process restart", async state => {
    await admit(input(), 7, { state });
    await expect(admit()).rejects.toMatchObject({ code: "SOLD_OUT" }); expect(writes).toBe(1);
  });
  it.each(["cancelled", "failed"])("releases only a definitive %s result", async state => {
    await admit(input(), 7, { state });
    await admit(); expect(writes).toBe(2);
  });
  it("fails closed for active legacy attempts whose stock admission cannot be proved", async () => {
    await sql(`INSERT INTO FIXTURE.servio_booking_attempts VALUES($1,7,$2,'old','review',NULL,$3::jsonb)`,
      [randomUUID(), randomUUID(), JSON.stringify({ input: input() })]);
    await expect(admit()).rejects.toMatchObject({ code: "INVENTORY_UNCERTAIN" }); expect(writes).toBe(0);
  });
  it("never admits when the current PMS stock is zero, even if the earlier quota had spare rooms", async () => {
    stock = 3; await admit(); stock = 0;
    await expect(admit()).rejects.toMatchObject({ code: "SOLD_OUT" }); expect(writes).toBe(1);
  });
  it("does not increase a live quota just because a later PMS response returns a larger count", async () => {
    await admit(); stock = 3;
    await expect(admit()).rejects.toMatchObject({ code: "SOLD_OUT" }); expect(writes).toBe(1);
  });
  it("keeps a committed hold after the simulated provider connection fails", async () => {
    const data = input();
    await expect(withServioInventory(7, data, connection, JSON.stringify(data), async client => {
      await client.query(`INSERT INTO servio_booking_attempts VALUES($1,7,$2,$3,'review',$4,$5::jsonb)`,
        [randomUUID(), data.requestId, JSON.stringify(data), servioInventoryKey(connection, data.categoryId), JSON.stringify({ input: data })]);
      throw new Error("fixture provider timeout");
    }, db, read)).rejects.toThrow("fixture provider timeout");
    await expect(admit()).rejects.toMatchObject({ code: "SOLD_OUT" }); expect(writes).toBe(0);
  });
});
