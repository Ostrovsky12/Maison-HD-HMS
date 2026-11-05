import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: f.query } }));
import { bookingDrafts, publicBookingDrafts } from "../routes/booking-drafts.js";
import { linkBookingDraft } from "../lib/booking-drafts.js";

describe.skipIf(process.env.BOOKING_DRAFT_DB_TEST !== "1")("booking draft privacy and real PostgreSQL persistence", () => {
  const schema = `test_booking_drafts_${randomUUID().replaceAll("-", "")}`;
  let pool: any;
  const app = express(); app.use(express.json()); app.use("/public", publicBookingDrafts);
  app.use("/admin", (req: any, _res, next) => { req.user = { organizationId: Number(req.headers["x-test-org"] || 1) }; next(); }, bookingDrafts);
  const token = randomUUID();
  const body = (revision = 1) => ({ token, revision, noticeVersion: "booking-draft-v1",
    guestName: "Fixture Guest", phone: "+380000000000", email: "fixture@example.invalid",
    checkIn: "2027-02-01", checkOut: "2027-02-03", adults: 2, children: 0,
    categoryName: "Fixture category", rateName: "Fixture rate", totalAmount: 1200, currency: "UAH", stage: "contacts" });
  const capture = (data = body()) => request(app).post("/public/fixture/draft").send(data);
  const list = (org = 1, filter = "all") => request(app).get(`/admin?filter=${filter}`).set("x-test-org", String(org));
  beforeAll(async () => {
    const { Pool } = createRequire(new URL("../../../../lib/db/package.json", import.meta.url))("pg");
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 3000 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    f.query.mockImplementation(async (text: string, values?: any[]) => {
      const client = await pool.connect();
      try { await client.query(`SET search_path TO "${schema}"`); return await client.query(text, values); }
      finally { await client.query("RESET search_path"); client.release(); }
    });
    await f.query(`CREATE TABLE organizations(id int PRIMARY KEY,name text,slug text,is_active boolean DEFAULT true,booking_engine_config jsonb);
      INSERT INTO organizations VALUES(1,'Fixture','fixture',true,'{"published":true}'),(2,'Other','other',true,'{"published":true}');
      CREATE TABLE servio_booking_attempts(id uuid PRIMARY KEY,organization_id int,state text);
      CREATE TABLE bookings(id int PRIMARY KEY,organization_id int,payment_status text);`);
    await f.query(await readFile(new URL("../../../../lib/db/migrations/0014_booking_drafts.sql", import.meta.url), "utf8"));
  });
  afterAll(async () => {
    if (!pool) return;
    try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); }
  });
  beforeEach(async () => { await f.query("TRUNCATE booking_drafts,servio_booking_attempts,bookings"); });
  it("captures partial contact once, returns no personal information, and never creates a reservation", async () => {
    const result = await capture({ ...body(), phone: "+38", email: "g@" });
    expect(result.status).toBe(204); expect(result.text).toBe("");
    const rows = (await list()).body;
    expect(rows.total).toBe(1); expect(rows.items[0].details.phone).toBe("+38");
    expect(rows.items[0]).not.toHaveProperty("tokenHash");
    expect(rows.items[0]).not.toHaveProperty("token_hash");
    expect((await f.query("SELECT count(*) FROM bookings")).rows[0].count).toBe("0");
    expect((await f.query("SELECT count(*) FROM servio_booking_attempts")).rows[0].count).toBe("0");
  });
  it("updates the same draft, rejects stale request order, and preserves staff notes", async () => {
    expect((await capture()).status).toBe(204);
    const row = (await list()).body.items[0];
    expect((await request(app).patch(`/admin/${row.id}`).send({ status: "working", notes: "Call later", expectedUpdatedAt: row.updatedAt })).status).toBe(204);
    await capture({ ...body(3), guestName: "Latest name" }); await capture({ ...body(2), guestName: "Old name" });
    const current = (await list()).body;
    expect(current.total).toBe(1); expect(current.items[0].details.guestName).toBe("Latest name");
    expect(current.items[0].status).toBe("working"); expect(current.items[0].notes).toBe("Call later");
  });
  it("removes cleared contacts from the journal and cannot resurrect them through an older request", async () => {
    await capture(); await capture({ ...body(3), guestName: "", email: "", phone: "" });
    await capture(body(2)); expect((await list()).body.total).toBe(0);
  });
  it("does not expose active typing as abandonment; idle entries become follow-up candidates", async () => {
    await capture(); expect((await list(1, "abandoned")).body.total).toBe(0);
    await f.query("UPDATE booking_drafts SET last_seen=now()-interval '16 minutes'");
    expect((await list(1, "abandoned")).body.total).toBe(1);
  });
  it("isolates list, edit and delete by organization", async () => {
    await capture(); const row = (await list()).body.items[0];
    expect((await list(2)).body.total).toBe(0);
    expect((await request(app).patch(`/admin/${row.id}`).set("x-test-org", "2")
      .send({ notes: "not allowed", expectedUpdatedAt: row.updatedAt })).status).toBe(404);
    expect((await request(app).delete(`/admin/${row.id}`).set("x-test-org", "2")).status).toBe(404);
    expect((await list()).body.total).toBe(1);
  });
  it("detects concurrent manager updates without losing the first manager's notes", async () => {
    await capture(); const row = (await list()).body.items[0];
    const update = (notes: string) => request(app).patch(`/admin/${row.id}`).send({ notes, expectedUpdatedAt: row.updatedAt });
    expect((await update("First manager")).status).toBe(204); expect((await update("Stale manager")).status).toBe(409);
    expect((await list()).body.items[0].notes).toBe("First manager");
  });
  it("associates only this organization's server-created attempt and automatically recognizes conversion", async () => {
    await capture(); const attemptId = randomUUID();
    await f.query("INSERT INTO servio_booking_attempts VALUES($1,1,'awaiting_payment')", [attemptId]);
    await linkBookingDraft(2, token, { attemptId }, { warn: vi.fn() });
    expect((await list()).body.items[0].stage).toBe("contacts");
    await linkBookingDraft(1, token, { attemptId }, { warn: vi.fn() });
    expect((await list()).body.items[0].stage).toBe("awaiting_payment");
    await capture(body(2)); expect((await list()).body.items[0].stage).toBe("awaiting_payment");
    await f.query("UPDATE servio_booking_attempts SET state='confirmed'");
    expect((await list(1, "converted")).body.total).toBe(1);
    expect((await list(1, "abandoned")).body.total).toBe(0);
  });
  it("recognizes a paid local booking and deletion never cancels that booking", async () => {
    await capture(); await f.query("INSERT INTO bookings VALUES(10,1,'paid')");
    await linkBookingDraft(1, token, { bookingId: 10 }, { warn: vi.fn() });
    const row = (await list()).body.items[0]; expect(row.status).toBe("converted");
    expect((await request(app).delete(`/admin/${row.id}`)).status).toBe(204);
    expect((await list()).body.total).toBe(0); expect((await f.query("SELECT count(*) FROM bookings")).rows[0].count).toBe("1");
  });
  it("hides records beyond the retention period", async () => {
    await capture(); await f.query("UPDATE booking_drafts SET last_seen=now()-interval '91 days'");
    expect((await list()).body.total).toBe(0);
  });
  it.each([
    { noticeVersion: "hidden" }, { token: "not-a-token" }, { adults: 1.5 },
    { stage: "confirmed" }, { checkOut: "2027-01-01" }, { notes: "attempt to overwrite manager notes", stage: "unknown" },
  ])("rejects invalid or forged capture data %j", async invalid => {
    expect((await capture({ ...body(), ...invalid } as any)).status).toBe(400);
  });
  it("disables capture for unpublished pages", async () => {
    await f.query(`UPDATE organizations SET booking_engine_config='{"published":false}' WHERE id=1`);
    try { expect((await capture()).status).toBe(404); }
    finally { await f.query(`UPDATE organizations SET booking_engine_config='{"published":true}' WHERE id=1`); }
  });
});
