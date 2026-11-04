import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), check: vi.fn(), search: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: f.query, connect: f.connect } }));
vi.mock("../lib/auth.js", () => ({
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }),
}));
vi.mock("express-rate-limit", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../lib/servio-connection.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/servio-connection.js")>(), checkServioConnection: f.check,
}));
vi.mock("../lib/servio-availability.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/servio-availability.js")>(), searchServioAvailability: f.search,
}));
import router from "../routes/booking-servio.js";
import { encrypt } from "../lib/encrypt.js";
import { servioFingerprint } from "../lib/servio-connection.js";
import { liqpayCredentialFingerprint } from "../lib/liqpay-connection.js";
const app = express();
app.use(express.json(), (req: any, _res, next) => {
  req.user = { organizationId: 7, role: req.headers["x-role"] || "owner" };
  req.log = { info: vi.fn() }; next();
});
app.use("/servio", router);
let config: any, changed: boolean;
const result = { status: "connected", code: "categories_read", message: "ok", pingOk: true, checkedAt: "2026-01-01T00:00:00.000Z", categories: [{ id: 1, name: "Test", hotelId: 7 }] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET", "test-only-session-secret-with-over-32-bytes");
  config = { provider: "servio", servioBaseUrl: "https://example.servio.support/ReservationService_1_10", servioHotelId: "7", servioToken: encrypt("fixture-token") };
  changed = false;
  f.check.mockResolvedValue(result);
  f.connect.mockResolvedValue({ query: f.query, release: vi.fn() });
  f.query.mockImplementation(async (sql: string, values: any[] = []) => {
    if (sql.startsWith("SELECT")) return { rows: [{ name: "Test hotel", booking_engine_config: changed && sql.includes("FOR UPDATE") ? { ...config, servioHotelId: "8" } : config }] };
    if (sql.startsWith("UPDATE")) config.servioVerification = JSON.parse(values[1]);
    return { rows: [] };
  });
});
describe("tenant-owned Servio checks", () => {
  it("shows an honest not-checked state and scopes reads to the session organization", async () => {
    const response = await request(app).get("/servio");
    expect(response.body.status).toBe("not_checked");
    expect(f.query.mock.calls[0][1]).toEqual([7]);
    expect(JSON.stringify(response.body)).not.toContain("servioToken");
  });
  it("uses saved credentials, persists safe results and restores them after reload", async () => {
    const response = await request(app).post("/servio").send({ token: "ignored-attacker-token", organizationId: 999 });
    expect(response.status).toBe(200);
    expect(f.check).toHaveBeenCalledWith(config.servioBaseUrl, 7, "fixture-token");
    const loaded = await request(app).get("/servio");
    expect(loaded.body).toEqual(result);
    expect(JSON.stringify(loaded.body)).not.toMatch(/fixture-token|fingerprint|servioToken/);
    expect(f.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE"))?.[1][0]).toBe(7);
  });
  it("invalidates old checks when the saved account changes", async () => {
    config.servioVerification = { fingerprint: servioFingerprint(config), result };
    config.servioHotelId = "8";
    expect((await request(app).get("/servio")).body.status).toBe("not_checked");
  });
  it("prevents managers from triggering outbound access", async () => {
    expect((await request(app).post("/servio").set("x-role", "manager")).status).toBe(403);
    expect(f.check).not.toHaveBeenCalled();
  });
  it.each(["servioToken", "servioHotelId", "servioBaseUrl"])("requires saved %s before outbound access", async field => {
    config[field] = "";
    expect((await request(app).post("/servio")).status).toBe(400);
    expect(f.check).not.toHaveBeenCalled();
  });
  it("rejects arbitrary URLs without transmitting a credential", async () => {
    config.servioBaseUrl = "https://attacker.invalid/ReservationService_1_10";
    const response = await request(app).post("/servio");
    expect(response.status).toBe(400);
    expect(response.body.field).toBe("servioBaseUrl");
    expect(f.check).not.toHaveBeenCalled();
  });
  it("accepts a saved HotelID with a trailing space without changing credentials", async () => {
    config.servioHotelId = "7 ";
    const response = await request(app).post("/servio");
    expect(response.status).toBe(200);
    expect(f.check).toHaveBeenCalledWith(config.servioBaseUrl, 7, "fixture-token");
  });
  it("identifies an invalid HotelID separately from the API address", async () => {
    config.servioHotelId = "7x";
    const response = await request(app).post("/servio");
    expect(response.status).toBe(400);
    expect(response.body.field).toBe("servioHotelId");
    expect(f.check).not.toHaveBeenCalled();
  });
  it("does not persist a result against changed credentials", async () => {
    changed = true;
    expect((await request(app).post("/servio")).status).toBe(409);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });
});

const searchInput = { checkIn: "2026-12-01", checkOut: "2026-12-03", adults: 2, childAges: [], useExtraBed: false, companyId: 0, companyCodeId: 0, conditionId: 0 };
describe("tenant-owned read-only availability route", () => {
  function verified() {
    config.servioVerification = { fingerprint: servioFingerprint(config), result };
    f.search.mockResolvedValue({
      status: "complete", code: "no_categories", message: "No inventory", checkedAt: "2026-11-01T00:00:00Z",
      query: searchInput, hotelId: 7, currency: null, categories: [],
    });
  }
  it("uses the session's saved connection, ignores injected credentials, and never writes", async () => {
    verified();
    const response = await request(app).post("/servio/availability").send({ ...searchInput, hotelId: 999, organizationId: 999, token: "attacker" });
    expect(response.status).toBe(200);
    expect(f.search).toHaveBeenCalledWith(expect.objectContaining({ hotelId: 7, token: "fixture-token" }), searchInput, result.categories);
    expect(f.query.mock.calls.every(([sql, values]) => sql.startsWith("SELECT") && values[0] === 7)).toBe(true);
    expect(f.connect).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toMatch(/fixture-token|fingerprint|attacker/);
  });
  it.each(["manager", "staff"])("denies %s before querying the provider", async role => {
    verified();
    expect((await request(app).post("/servio/availability").set("x-role", role).send(searchInput)).status).toBe(403);
    expect(f.search).not.toHaveBeenCalled();
  });
  it("requires a successful connection check for the current credentials", async () => {
    verified(); config.servioHotelId = "8";
    expect((await request(app).post("/servio/availability").send(searchInput)).status).toBe(400);
    expect(f.search).not.toHaveBeenCalled();
  });
  it("rejects invalid dates before any database or provider call", async () => {
    expect((await request(app).post("/servio/availability").send({ ...searchInput, checkOut: searchInput.checkIn })).status).toBe(400);
    expect(f.query).not.toHaveBeenCalled();
    expect(f.search).not.toHaveBeenCalled();
  });
  it("rejects a result if the upstream account changed during the search", async () => {
    verified();
    f.query.mockResolvedValueOnce({ rows: [{ name: "Test", booking_engine_config: { ...config } }] })
      .mockResolvedValueOnce({ rows: [{ name: "Test", booking_engine_config: { ...config, servioHotelId: "8" } }] });
    expect((await request(app).post("/servio/availability").send(searchInput)).status).toBe(409);
  });
});

describe("tenant-owned read-only checkout preflight route", () => {
  const selection = { ...searchInput, categoryId: 1, priceListId: 90, rateConditionId: 1, propertyId: 4 };
  const snapshot = { status: "complete", code: "availability_prices_read", message: "ok", checkedAt: "2026-11-01T00:00:00Z",
    query: searchInput, hotelId: 7, currency: "грн", categories: [{
      id: 1, name: "Test", freeRooms: 2, mainPlaces: 3, nearestDate: null,
      rates: [{ priceListId: 90, conditionId: 1, name: "NR Site", nonRefundable: true, specialRate: false, saleAllowed: true, total: 205.35, charges: [], restrictions: [] }],
    }] };
  let seller: any;
  beforeEach(() => {
    vi.stubEnv("PUBLIC_APP_URL", "https://example.invalid");
    seller = { id: 4, legal_entity_id: 8, seller_id: 8, liqpay_public_key: "fixture-public", liqpay_private_key: "fixture-encrypted-key" };
    config.servioVerification = { fingerprint: servioFingerprint(config), result };
    config.terms = "Rules"; config.privacy = "Privacy";
    config.liqpayVerification = { "8": { status: "connected", fingerprint: liqpayCredentialFingerprint(seller.liqpay_public_key, seller.liqpay_private_key) } };
    f.search.mockResolvedValue(snapshot);
    f.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("FROM properties p") ? seller ? [{ ...seller }] : [] : [{ name: "Test hotel", booking_engine_config: config }],
    }));
  });
  it("re-reads Servio, scopes the seller to the authenticated tenant and returns no secrets or write permission", async () => {
    const response = await request(app).post("/servio/preflight").send({ ...selection, organizationId: 999, token: "attacker" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ inputChecksPassed: true, canAcceptPayment: false, canCreateReservation: false, total: 205.35 });
    expect(f.search).toHaveBeenCalledWith(expect.objectContaining({ token: "fixture-token", hotelId: 7 }), searchInput, result.categories);
    expect(f.query.mock.calls.filter(([sql]) => sql.includes("FROM properties p")).every(([, values]) => JSON.stringify(values) === "[4,7]")).toBe(true);
    expect(f.query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
    expect(f.connect).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toMatch(/fixture-token|fixture-public|fixture-encrypted-key|fingerprint|attacker/);
  });
  it.each(["manager", "staff"])("denies %s before accessing credentials or the provider", async role => {
    expect((await request(app).post("/servio/preflight").set("x-role", role).send(selection)).status).toBe(403);
    expect(f.search).not.toHaveBeenCalled(); expect(f.query).not.toHaveBeenCalled();
  });
  it("blocks a missing/foreign property instead of borrowing any other seller", async () => {
    seller = null;
    const response = await request(app).post("/servio/preflight").send(selection);
    expect(response.status).toBe(200);
    expect(response.body.inputChecksPassed).toBe(false);
    expect(response.body.checks.find((check: any) => check.code === "seller_mapping").status).toBe("blocked");
  });
  it("rejects changed credentials before a provider call", async () => {
    config.servioHotelId = "8";
    expect((await request(app).post("/servio/preflight").send(selection)).status).toBe(400);
    expect(f.search).not.toHaveBeenCalled();
  });
  it("discards a result if either connection or seller changes during the provider request", async () => {
    f.search.mockImplementationOnce(async () => { config.servioHotelId = "8"; return snapshot; });
    expect((await request(app).post("/servio/preflight").send(selection)).status).toBe(409);
    config.servioHotelId = "7";
    f.search.mockImplementationOnce(async () => { seller.liqpay_public_key = "rotated"; return snapshot; });
    expect((await request(app).post("/servio/preflight").send(selection)).status).toBe(409);
  });
});
