import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db } from "@workspace/db";

vi.mock("@workspace/db", async (importOriginal) => ({
  ...await importOriginal<any>(),
  organizationsTable: { id: "id", enabledModules: "enabled_modules" },
}));

let organizationId: number | null = 39;
vi.mock("../lib/auth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.user = { organizationId }; next(); },
}));
import router from "../routes/poster.js";

const app = express();
app.use(express.json());
app.use("/poster", router);
let config: any;
let saved: any;
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  organizationId = 39;
  saved = undefined;
  config = { apiKey: "test-only-fake-token", verified: false, lastSync: "2026-01-01T00:00:00Z",
    syncedData: { source: "live", totalRevenue: 55, totalTransactions: 1 } };
  const chain: any = {};
  for (const key of ["from", "where"]) chain[key] = vi.fn(() => chain);
  chain.limit = vi.fn(async () => [{ enabledModules: { posterConfig: config } }]);
  vi.mocked(db.select).mockReturnValue(chain);
  const update: any = {};
  update.set = vi.fn((value: any) => { saved = value; return update; });
  update.where = vi.fn(() => update);
  update.returning = vi.fn(async () => [{ id: organizationId }]);
  vi.mocked(db.update).mockReturnValue(update);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("Poster sync routes", () => {
  it("saves documented real analytics with a successful sync timestamp", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ response: {
      data: ["82512.5000", "50077.2500"],
      counters: { revenue: "132589.7500", transactions: "100", visitors: "250" },
    } })));
    const r = await request(app).post("/poster/sync").send({ dateFrom: "2026-10-31", dateTo: "2026-11-01" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, source: "live", totalRevenue: 132589.75, totalTransactions: 100, avgCheck: 1325.9 });
    expect(r.body.lastSync).toBeTruthy();
    expect(saved).toBeDefined();
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("interpolate")).toBe("day");
  });
  it("preserves the previous cache on transport failure and does not leak the request URL", async () => {
    fetchMock.mockRejectedValue(new Error("https://example.invalid?token=test-only-fake-token"));
    const r = await request(app).post("/poster/sync").send({});
    expect(r.status).toBe(502);
    expect(db.update).not.toHaveBeenCalled();
    expect(JSON.stringify(r.body)).not.toContain("test-only-fake-token");
    expect(r.body.totalRevenue).toBeUndefined();
    const cached = await request(app).get("/poster/revenue");
    expect(cached.body.totalRevenue).toBe(55);
  });
  it("rejects malformed provider data without overwriting a good report", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ response: { data: ["unexpected"] } })));
    const r = await request(app).post("/poster/sync").send({});
    expect(r.status).toBe(502);
    expect(db.update).not.toHaveBeenCalled();
  });
  it("does not show previously saved demo reports or a fake successful sync date", async () => {
    config.syncedData = { source: "demo", totalRevenue: 284337 };
    const r = await request(app).get("/poster/revenue");
    expect(r.body).toMatchObject({ source: "unavailable", totalRevenue: null, dailyRevenue: [], lastSync: null });
    const status = await request(app).get("/poster/status");
    expect(status.body.lastSync).toBeNull();
    expect(status.body.verified).toBe(false);
  });
  it("rejects accounts with no organization before any database or provider access", async () => {
    organizationId = null;
    const r = await request(app).post("/poster/connect").send({ apiKey: "test" });
    expect(r.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects synchronization when no connection exists", async () => {
    config = null;
    expect((await request(app).post("/poster/sync").send({})).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await request(app).get("/poster/revenue")).body.totalRevenue).toBeNull();
  });
  it("does not replace a saved connection if verification fails", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Invalid token" })));
    expect((await request(app).post("/poster/connect").send({ apiKey: "bad-test-key" })).status).toBe(502);
    expect(db.update).not.toHaveBeenCalled();
  });
  it("checks read-only venue access before saving a new connection", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ response: [{ spot_id: 1, name: "Test" }] })));
    const r = await request(app).post("/poster/connect").send({ apiKey: "new-test-key" });
    expect(r.status).toBe(200);
    expect(r.body.verified).toBe(true);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe("/api/spots.getSpots");
    expect(db.update).toHaveBeenCalled();
    expect(JSON.stringify(r.body)).not.toContain("new-test-key");
  });
});
