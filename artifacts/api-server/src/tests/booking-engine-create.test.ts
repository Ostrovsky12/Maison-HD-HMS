import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ query: vi.fn(), select: vi.fn(), connect: vi.fn(), selections: [] as any[][] }));
vi.mock("@workspace/db", async (importOriginal) => ({
  ...await importOriginal<any>(), db: { select: f.select }, pool: { query: f.query, connect: f.connect },
  ...await import("./__mocks__/workspace-db-schema.js"),
}));
vi.mock("express-rate-limit", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../lib/notify.js", () => ({
  sendGuestConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendGuestConfirmationSms: vi.fn().mockResolvedValue(undefined),
  notifyBookingCreated: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/automation-runner.js", () => ({ fireBookingEvent: vi.fn().mockResolvedValue(undefined) }));
import router from "../routes/public-booking.js";

const app = express();
app.use(express.json());
app.use("/api/public", router);
const payload = () => ({
  slug: "test", bookingEngine: true, bookingRequestId: "fd2f4b6a-a493-4a47-a267-850a450f4020",
  unitId: 10, checkIn: "2030-05-10", checkOut: "2030-05-12",
  firstName: "Test", lastName: "Guest", email: "", phone: "+380000000000",
  adults: 2, children: 0, guestsCount: 2, expectedTotal: 2400, agreeTerms: true, specialRequests: "",
});
let org: any, unit: any, saved: any, rate: any, conflict: boolean, loseCommit: boolean;

beforeEach(() => {
  vi.clearAllMocks(); f.selections.length = 0; conflict = false; loseCommit = false; saved = null;
  org = { id: 1, name: "Test Hotel", slug: "test", is_active: true,
    booking_engine_config: { provider: "maison", published: true } };
  unit = { id: 10, propertyId: 20, name: "Test Room", basePrice: "1200", capacity: 2, status: "active" };
  rate = { id: 10, base_price: "1200", capacity: 2, status: "active", is_hidden: false, rate_id: null };
  f.select.mockImplementation(() => {
    const result = f.selections.shift() || [];
    const chain: any = {};
    for (const method of ["from", "where", "limit", "innerJoin", "leftJoin", "orderBy"]) chain[method] = () => chain;
    chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
    chain.catch = (reject: any) => Promise.resolve(result).catch(reject);
    return chain;
  });
  f.connect.mockResolvedValue({ query: f.query, release: vi.fn() });
  f.query.mockImplementation(async (sql: string, values: any[] = []) => {
    if (sql.includes("FROM organizations")) return { rows: [org] };
    if (sql.includes("LEFT JOIN LATERAL")) return { rows: [rate] };
    if (sql === "COMMIT" && loseCommit) { loseCommit = false; throw new Error("Commit acknowledgement lost"); }
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.startsWith("SELECT * FROM bookings")) return { rows: saved ? [{ ...saved }] : [] };
    if (sql.includes("SELECT id FROM units")) return { rows: [{ id: 10 }] };
    if (sql.includes("FROM bookings") && sql.includes("unit_id")) return { rows: conflict ? [{ id: 99 }] : [] };
    if (sql.includes("accommodation_blocks")) return { rows: [] };
    if (sql.includes("FROM guests")) return { rows: [] };
    if (sql.includes("INSERT INTO guests")) return { rows: [{ id: 5 }] };
    if (sql.includes("INSERT INTO bookings")) {
      saved = { id: 100, organization_id: 1, first_name: values[3], last_name: values[4], email: values[5],
        phone: values[6], total_amount: values[13], booking_ref: values[15], guest_access_code: values[16],
        status: "pending" };
      return { rows: [saved] };
    }
    if (sql.startsWith("UPDATE bookings SET utm_source")) {
      saved.utm_content = values[1]; saved.utm_campaign = values[2]; return { rows: [] };
    }
    throw new Error("Unexpected fixture SQL: " + sql.slice(0, 100));
  });
});
function prepare() { f.selections.length = 0; f.selections.push([org], [unit], [{ id: 20, name: "Test Hotel", organizationId: 1 }], [], []); }
function post(extra = {}) { prepare(); return request(app).post("/api/public/bookings").send({ ...payload(), ...extra }); }

describe("new module booking submission", () => {
  it("creates an actual local pending booking with server-calculated amount and durable request identity", async () => {
    const res = await post();
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.booking.status).toBe("pending");
    expect(res.body.booking.totalAmount).toBe(2400);
    expect(res.body.booking.guestAccessCode).toHaveLength(20);
    expect(saved.utm_content).toBe(payload().bookingRequestId);
    expect(saved.utm_campaign).toHaveLength(64);
    expect(f.query.mock.calls.some(([sql]) => sql.includes("FOR SHARE"))).toBe(true);
  });
  it("replays the same result rather than inserting a duplicate", async () => {
    const first = await post();
    const second = await post();
    expect(second.status).toBe(200);
    expect(second.body.booking.bookingRef).toBe(first.body.booking.bookingRef);
    expect(second.body.booking.guestAccessCode).toBe(first.body.booking.guestAccessCode);
    expect(f.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO bookings"))).toHaveLength(1);
  });
  it("rejects reuse of the same request key with changed guest data", async () => {
    await post();
    expect((await post({ firstName: "Different" })).status).toBe(409);
    expect(f.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO bookings"))).toHaveLength(1);
  });
  it("recovers a committed booking after a lost commit acknowledgement", async () => {
    loseCommit = true;
    expect((await post()).status).toBe(500);
    const retry = await post();
    expect(retry.status).toBe(200);
    expect(retry.body.booking.id).toBe(100);
    expect(f.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO bookings"))).toHaveLength(1);
  });
  it("does not create when quoted price changed", async () => {
    const res = await post({ expectedTotal: 2000 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PRICE_CHANGED");
    expect(saved).toBeNull();
  });
  it("does not create over an overlapping booking", async () => {
    conflict = true;
    expect((await post()).status).toBe(409);
    expect(saved).toBeNull();
  });
  it("does not silently substitute local booking for Servio", async () => {
    org.booking_engine_config.provider = "servio";
    expect((await post()).status).toBe(503);
    expect(f.select).not.toHaveBeenCalled();
    expect(saved).toBeNull();
  });
  it("rejects a direct API bypass of publication", async () => {
    org.booking_engine_config.published = false;
    expect((await post()).status).toBe(403);
    expect(saved).toBeNull();
  });
  it.each([
    { agreeTerms: false }, { bookingRequestId: "" }, { checkIn: "2030-02-30" },
    { email: "not-an-email" }, { phone: "", email: "" }, { guestsCount: 3 },
    { adults: 1.5 }, { children: 1 }, { addonIds: ["spa"] }, { promoCode: "FAKE" },
  ])("validates the complete contract before creating %j", async extra => {
    expect((await post(extra)).status).toBe(400);
    expect(saved).toBeNull();
  });
});
