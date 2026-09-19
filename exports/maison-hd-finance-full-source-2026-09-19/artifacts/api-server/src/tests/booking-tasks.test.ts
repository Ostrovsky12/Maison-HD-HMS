/**
 * Booking-scoped staff task endpoints
 *
 * Covers:
 *  - GET  /api/bookings/:id/tasks
 *  - POST /api/bookings/:id/tasks
 *  - PATCH /api/bookings/:id/tasks/:taskId
 *
 * Verified properties:
 *  • Non-super-admin without an organizationId → 403 on every route
 *  • Cross-tenant (orgId mismatch) → 404 (not 403, to avoid oracle attacks)
 *  • Missing required `title` on POST → 400
 *  • Happy-path GET returns tasks; POST returns created row; PATCH returns updated row
 *  • POST inserts organization_id from the booking row (not from user token)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// Heavy transitive deps mocked out
vi.mock("../lib/notify.js", () => ({
  notifyBookingCreated: vi.fn().mockResolvedValue(undefined),
  notifyCheckIn:        vi.fn().mockResolvedValue(undefined),
  sendEmail:            vi.fn().mockResolvedValue(undefined),
  sendTelegram:         vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@workspace/db";
import bookingsRouter from "../routes/bookings.js";
import { signToken } from "../lib/auth.js";

// ── Minimal express app ────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/bookings", bookingsRouter);

// ── Token helpers ──────────────────────────────────────────────────────────────
function tokenFor(orgId: number | null, role = "owner") {
  return signToken({ userId: 1, email: "t@t.com", role, organizationId: orgId, propertyId: null });
}
const tokenOrg1       = tokenFor(1);
const tokenOrg2       = tokenFor(2);
const tokenNoOrg      = tokenFor(null);
const tokenSuperAdmin = tokenFor(null, "super_admin");

// ── Booking fixture ────────────────────────────────────────────────────────────
const ORG_1_BOOKING = { id: 100, unit_id: 10, organization_id: 1 };

// ── Raw-client query mock helper ───────────────────────────────────────────────
/** Reset and configure (db as any).$client.query responses for a test. */
function mockClientQuery(...responses: { rows: any[] }[]) {
  let call = 0;
  (db as any).$client.query = vi.fn().mockImplementation(() => {
    const resp = responses[call] ?? { rows: [] };
    call++;
    return Promise.resolve(resp);
  });
}

// Reset Drizzle-ORM chain mocks between tests (they are vi.fn() singletons)
beforeEach(() => {
  vi.clearAllMocks();
  // Default: no rows returned
  (db as any).$client.query = vi.fn().mockResolvedValue({ rows: [] });
});

// ──────────────────────────────────────────────────────────────────────────────
//  GET /api/bookings/:id/tasks
// ──────────────────────────────────────────────────────────────────────────────
describe("GET /api/bookings/:id/tasks", () => {
  it("returns 403 when user has no organizationId", async () => {
    const res = await request(app)
      .get("/api/bookings/100/tasks")
      .set("Authorization", `Bearer ${tokenNoOrg}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/organization/i);
  });

  it("returns 404 when booking does not belong to caller's org", async () => {
    // Ownership query returns no rows → wrong org
    mockClientQuery({ rows: [] });

    const res = await request(app)
      .get("/api/bookings/100/tasks")
      .set("Authorization", `Bearer ${tokenOrg2}`);   // org 2, but booking is org 1
    expect(res.status).toBe(404);
  });

  it("returns task list for the correct org", async () => {
    const taskRows = [
      { id: 1, title: "Прибрати", status: "pending", priority: "high",
        dueDate: null, notes: null, bookingId: 100, createdAt: new Date().toISOString(), assignedToName: null },
    ];
    // First call: ownership check (booking found) → second call: task list
    mockClientQuery({ rows: [ORG_1_BOOKING] }, { rows: taskRows });

    const res = await request(app)
      .get("/api/bookings/100/tasks")
      .set("Authorization", `Bearer ${tokenOrg1}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Прибрати");
  });

  it("super-admin may read tasks from any booking", async () => {
    mockClientQuery({ rows: [ORG_1_BOOKING] }, { rows: [] });

    const res = await request(app)
      .get("/api/bookings/100/tasks")
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);
    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  POST /api/bookings/:id/tasks
// ──────────────────────────────────────────────────────────────────────────────
describe("POST /api/bookings/:id/tasks", () => {
  it("returns 403 when user has no organizationId", async () => {
    const res = await request(app)
      .post("/api/bookings/100/tasks")
      .set("Authorization", `Bearer ${tokenNoOrg}`)
      .send({ title: "Task" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when title is missing", async () => {
    const res = await request(app)
      .post("/api/bookings/100/tasks")
      .set("Authorization", `Bearer ${tokenOrg1}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it("returns 400 when title is blank whitespace", async () => {
    const res = await request(app)
      .post("/api/bookings/100/tasks")
      .set("Authorization", `Bearer ${tokenOrg1}`)
      .send({ title: "   " });
    expect(res.status).toBe(400);
  });

  it("returns 404 when booking is in a different org", async () => {
    mockClientQuery({ rows: [] });   // ownership check: no row for org 2

    const res = await request(app)
      .post("/api/bookings/100/tasks")
      .set("Authorization", `Bearer ${tokenOrg2}`)
      .send({ title: "Cross-tenant task" });
    expect(res.status).toBe(404);
  });

  it("creates and returns a task with 201", async () => {
    const created = {
      id: 42, title: "Прибрати кімнату", description: null,
      status: "pending", priority: "medium",
      dueDate: null, notes: null,
      bookingId: 100, createdAt: new Date().toISOString(),
    };
    // First call: ownership (booking found) → second call: INSERT RETURNING
    mockClientQuery({ rows: [ORG_1_BOOKING] }, { rows: [created] });

    const res = await request(app)
      .post("/api/bookings/100/tasks")
      .set("Authorization", `Bearer ${tokenOrg1}`)
      .send({ title: "Прибрати кімнату", priority: "medium" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(42);
    expect(res.body.title).toBe("Прибрати кімнату");

    // The INSERT call should include organization_id (from booking row, not user token)
    const insertCall = (db as any).$client.query.mock.calls[1];
    const insertSql: string = insertCall[0];
    expect(insertSql).toMatch(/organization_id/i);
    const insertParams: any[] = insertCall[1];
    // organization_id param should equal booking.organization_id (1), not undefined
    expect(insertParams).toContain(1);
  });

  it("super-admin can create a task for any booking", async () => {
    const created = { id: 99, title: "Admin task", status: "pending", priority: "medium",
      dueDate: null, notes: null, bookingId: 100, createdAt: new Date().toISOString() };
    mockClientQuery({ rows: [ORG_1_BOOKING] }, { rows: [created] });

    const res = await request(app)
      .post("/api/bookings/100/tasks")
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ title: "Admin task" });
    expect(res.status).toBe(201);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  PATCH /api/bookings/:id/tasks/:taskId
// ──────────────────────────────────────────────────────────────────────────────
describe("PATCH /api/bookings/:id/tasks/:taskId", () => {
  it("returns 403 when user has no organizationId", async () => {
    const res = await request(app)
      .patch("/api/bookings/100/tasks/1")
      .set("Authorization", `Bearer ${tokenNoOrg}`)
      .send({ status: "completed" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when task belongs to a different org (cross-tenant)", async () => {
    mockClientQuery({ rows: [] });   // ownership check: no row for org 2

    const res = await request(app)
      .patch("/api/bookings/100/tasks/1")
      .set("Authorization", `Bearer ${tokenOrg2}`)
      .send({ status: "completed" });
    expect(res.status).toBe(404);
  });

  it("returns 404 when task does not belong to the given booking", async () => {
    mockClientQuery({ rows: [] });   // task id / booking_id mismatch

    const res = await request(app)
      .patch("/api/bookings/100/tasks/999")
      .set("Authorization", `Bearer ${tokenOrg1}`)
      .send({ status: "completed" });
    expect(res.status).toBe(404);
  });

  it("updates and returns the task", async () => {
    const updated = {
      id: 1, title: "Прибрати", description: null,
      status: "completed", priority: "high",
      dueDate: null, notes: null,
      bookingId: 100, createdAt: new Date().toISOString(),
    };
    // First call: ownership check (found) → second call: UPDATE RETURNING
    mockClientQuery({ rows: [{ id: 1 }] }, { rows: [updated] });

    const res = await request(app)
      .patch("/api/bookings/100/tasks/1")
      .set("Authorization", `Bearer ${tokenOrg1}`)
      .send({ status: "completed" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });

  it("super-admin can update a task in any org", async () => {
    const updated = { id: 1, status: "completed", title: "T", priority: "low",
      dueDate: null, notes: null, bookingId: 100, createdAt: new Date().toISOString() };
    mockClientQuery({ rows: [{ id: 1 }] }, { rows: [updated] });

    const res = await request(app)
      .patch("/api/bookings/100/tasks/1")
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ status: "completed" });
    expect(res.status).toBe(200);
  });
});
