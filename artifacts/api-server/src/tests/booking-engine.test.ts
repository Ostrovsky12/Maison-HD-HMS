import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), encrypt: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: fixture.query, connect: fixture.connect } }));
vi.mock("../lib/encrypt.js", () => ({ encrypt: fixture.encrypt }));
vi.mock("../lib/auth.js", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) { res.status(401).json({ error: "Unauthorized" }); return; }
    req.user = { organizationId: Number(req.headers["x-test-org"] || 1), role: req.headers["x-test-role"] || "owner" };
    next();
  },
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }),
}));
import router, { publicEngineRouter } from "../routes/booking-engine.js";
import { engineConfig, engineIssues, engineQuote, engineSalesGuard, publicEngineConfig, validBookingDates } from "../lib/booking-engine.js";

const app = express();
app.use(express.json());
app.use("/api/booking-engine", router);
app.use("/api/public/booking-engine", publicEngineRouter);
app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: err.message }));
// Structured request logger for the successful mutation path.
app.request.log = { info: vi.fn() } as any;

const ready = () => ({
  provider: "maison" as const, published: false, displayName: "Test hotel", description: "Actual hotel description",
  accentColor: "#1f5648", logoUrl: "", phone: "+380000000000", email: "",
  checkInTime: "14:00", checkOutTime: "12:00", terms: "Hotel booking terms",
  privacy: "Hotel privacy policy", servioBaseUrl: "", servioHotelId: "",
});
let org: any;
let units = 2;

beforeEach(() => {
  vi.clearAllMocks(); units = 2;
  org = { id: 1, name: "Test hotel", slug: "test-hotel", is_active: true, booking_engine_config: ready() };
  fixture.encrypt.mockImplementation(() => "enc:opaque-test-value");
  fixture.connect.mockResolvedValue({ query: fixture.query, release: vi.fn() });
  fixture.query.mockImplementation(async (sql: string, values: any[] = []) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.includes("FROM organizations")) return { rows: values[0] === 2 ? [] : [{ ...org }] };
    if (sql.includes("FROM properties WHERE")) return { rows: [{ id: 10, name: "Property" }] };
    if (sql.includes("count(*)::int AS count")) return { rows: [{ count: units }] };
    if (sql.startsWith("UPDATE organizations")) { org.booking_engine_config = JSON.parse(values[1]); return { rows: [] }; }
    if (sql.includes("FROM bookings")) return { rows: [] };
    throw new Error("Unexpected fixture SQL");
  });
});

describe("configuration and tenant isolation", () => {
  it("starts as an unpublished local module", () => {
    const config = engineConfig({ name: "Hotel" });
    expect(config.published).toBe(false);
    expect(config.provider).toBe("maison");
    expect(config.terms).toBe("");
  });
  it("rejects unauthenticated settings", async () => {
    expect((await request(app).get("/api/booking-engine/settings")).status).toBe(401);
    expect(fixture.query).not.toHaveBeenCalled();
  });
  it("rejects unsupported staff roles before reading data", async () => {
    expect((await request(app).get("/api/booking-engine/settings").set("Authorization", "Bearer test").set("x-test-role", "reception")).status).toBe(403);
    expect(fixture.query).not.toHaveBeenCalled();
  });
  it("requires a selected tenant even for super admin", async () => {
    expect((await request(app).get("/api/booking-engine/settings").set("Authorization", "Bearer test").set("x-test-org", "0")).status).toBe(400);
  });
  it("cannot choose another tenant through query or body", async () => {
    const res = await request(app).get("/api/booking-engine/settings?organizationId=2").set("Authorization", "Bearer test");
    expect(res.status).toBe(200);
    expect(res.body.organization.id).toBe(1);
    expect(fixture.query.mock.calls.every(([, values]) => values[0] === 1)).toBe(true);
  });
  it("returns 404 for an unavailable tenant", async () => {
    expect((await request(app).get("/api/booking-engine/settings").set("Authorization", "Bearer test").set("x-test-org", "2")).status).toBe(404);
  });
  it("never returns encrypted or plaintext credentials", async () => {
    org.booking_engine_config.servioToken = "enc:secret-ciphertext";
    const res = await request(app).get("/api/booking-engine/settings").set("Authorization", "Bearer test");
    expect(res.body.config.hasServioToken).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("secret-ciphertext");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
  it("persists edited branding and publication", async () => {
    const res = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), displayName: "Published hotel", published: true });
    expect(res.status).toBe(200);
    expect(res.body.config.published).toBe(true);
    const reload = await request(app).get("/api/booking-engine/settings").set("Authorization", "Bearer test");
    expect(reload.body.config.displayName).toBe("Published hotel");
  });
  it("allows a Servio draft but rejects live Servio publication", async () => {
    const draft = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), provider: "servio" });
    expect(draft.status).toBe(200);
    expect(draft.body.readiness.canPublish).toBe(false);
    const published = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), provider: "servio", published: true });
    expect(published.status).toBe(409);
    expect(org.booking_engine_config.published).toBe(false);
  });
  it("requires legal texts and real inventory for publication", async () => {
    units = 0;
    const res = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), terms: "", privacy: "", published: true });
    expect(res.status).toBe(409);
    expect(res.body.issues.length).toBeGreaterThanOrEqual(3);
  });
  it.each(["http://example.test", "javascript:alert(1)", "https://u:password@example.test", "https://example.test/#token"])(
    "rejects unsafe endpoint syntax %s", async url => {
      const res = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
        .send({ ...ready(), servioBaseUrl: url });
      expect(res.status).toBe(400);
    });
  it("encrypts a new tenant token, preserves it when blank, and explicitly clears it", async () => {
    const save = (extra: any) => request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), ...extra });
    expect((await save({ servioToken: "test-only-not-a-real-secret" })).status).toBe(200);
    expect(org.booking_engine_config.servioToken).toBe("enc:opaque-test-value");
    expect((await save({ servioToken: "" })).body.config.hasServioToken).toBe(true);
    expect((await save({ clearServioToken: true })).body.config.hasServioToken).toBe(false);
  });
  it("clears credentials when upstream identity changes without a new token", async () => {
    org.booking_engine_config.servioToken = "enc:previous-account";
    await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), servioBaseUrl: "https://different.example.test" });
    expect(org.booking_engine_config.servioToken).toBeUndefined();
  });
  it("public response contains only published branding, not upstream settings", async () => {
    org.booking_engine_config = { ...ready(), published: true, servioToken: "enc:private", servioBaseUrl: "https://private.example.test" };
    const res = await request(app).get("/api/public/booking-engine/test-hotel");
    expect(res.status).toBe(200);
    expect(res.body.properties).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("private");
    expect(publicEngineConfig(org.booking_engine_config)).not.toHaveProperty("servioToken");
  });
  it("does not expose draft, inactive or unsupported-provider pages", async () => {
    expect((await request(app).get("/api/public/booking-engine/test-hotel")).status).toBe(404);
    org.booking_engine_config.provider = "servio";
    expect((await request(app).get("/api/public/booking-engine/test-hotel")).status).toBe(503);
    org.is_active = false;
    expect((await request(app).get("/api/public/booking-engine/test-hotel")).status).toBe(404);
  });
});

describe("sales guard", () => {
  it("preserves legacy unconfigured local sales but new module requires publication", async () => {
    org.booking_engine_config = null;
    expect(await engineSalesGuard("test-hotel")).toBeNull();
    expect((await engineSalesGuard("test-hotel", true))?.status).toBe(403);
  });
  it("blocks legacy bypass after explicit Servio selection", async () => {
    org.booking_engine_config.provider = "servio";
    expect((await engineSalesGuard("test-hotel"))?.status).toBe(503);
  });
  it("guards inactive organizations even if published", async () => {
    org.is_active = false;
    expect((await engineSalesGuard("test-hotel"))?.status).toBe(404);
  });
  it("can lock the organization while finalizing an order", async () => {
    org.booking_engine_config.published = true;
    expect(await engineSalesGuard("test-hotel", true, { query: fixture.query }, true)).toBeNull();
    expect(fixture.query.mock.calls[0][0]).toContain("FOR SHARE");
  });
});

describe("quote correctness", () => {
  const base = { id: 10, base_price: "1200", capacity: 2, status: "active", is_hidden: false, rate_id: null };
  const quote = (row: any, guests = 2) => {
    const client = { query: vi.fn().mockResolvedValue({ rows: row ? [row] : [] }) };
    return engineQuote(10, "2030-05-10", "2030-05-12", guests, client);
  };
  it("calculates the real base price without synthetic packages", async () => {
    expect(await quote(base)).toEqual({ nightlyRate: 1200, totalPrice: 2400, nights: 2 });
  });
  it("uses per-unit online rate before generic rate", async () => {
    expect((await quote({ ...base, rate_id: 1, actual_rate_id: 1, price_per_night: "1500", unit_prices: { "10": 1350 } }))?.totalPrice).toBe(2700);
  });
  it.each([
    { status: "inactive" }, { is_hidden: true }, { capacity: 1 }, { base_price: null },
    { base_price: "NaN" }, { base_price: "-1" },
    { rate_id: 1, actual_rate_id: null },
    { rate_id: 1, actual_rate_id: 1, is_stop_sale: true },
    { rate_id: 1, actual_rate_id: 1, min_nights: 3 },
    { rate_id: 1, actual_rate_id: 1, date_from: "2030-05-11" },
    { rate_id: 1, actual_rate_id: 1, date_to: "2030-05-11" },
  ])("does not sell invalid or forbidden inventory %j", async overrides => {
    expect(await quote({ ...base, ...overrides })).toBeNull();
  });
  it("permits an explicitly configured free tariff", async () => {
    expect((await quote({ ...base, base_price: "0" }))?.totalPrice).toBe(0);
  });
  it("rejects impossible dates, reversed ranges and overly long stays", () => {
    expect(validBookingDates("2030-02-30", "2030-03-02")).toBe(false);
    expect(validBookingDates("2030-05-12", "2030-05-10")).toBe(false);
    expect(validBookingDates("2030-01-01", "2032-01-01")).toBe(false);
    expect(validBookingDates("2030-05-10", "2030-05-12")).toBe(true);
  });
  it("requires contact, legal policy and inventory independently", () => {
    const config = { ...ready(), phone: "", email: "", terms: "", privacy: "" };
    expect(engineIssues(config, 0, 0)).toHaveLength(5);
  });
});
