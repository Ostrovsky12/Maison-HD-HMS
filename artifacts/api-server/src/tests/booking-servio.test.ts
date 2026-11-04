import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), check: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: f.query, connect: f.connect } }));
vi.mock("../lib/auth.js", () => ({
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }),
}));
vi.mock("express-rate-limit", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../lib/servio-connection.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/servio-connection.js")>(), checkServioConnection: f.check,
}));
import router from "../routes/booking-servio.js";
import { encrypt } from "../lib/encrypt.js";
import { servioFingerprint } from "../lib/servio-connection.js";
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
