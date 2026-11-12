import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ query: vi.fn(), account: vi.fn(), call: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: fixture.query } }));
vi.mock("../lib/poster-order-bridge.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/poster-order-bridge.js")>(),
  bridgeAccount: fixture.account, bridgeCall: fixture.call,
}));
import router from "../routes/poster-order-bridge.js";
const app = express(); app.use(express.json());
app.use((req: any, _res, next) => { req.user = { organizationId: 39, role: "manager" }; next(); });
app.use("/bridge", router);
const config = { enabled: true, kitchenEnabled: false, spotId: 1, tabletId: 2, waiterId: 3,
  tableMap: { "10": 7 }, productMap: { "20": 200 }, activatedAt: "2026-11-01T00:00:00Z" };
let account: any;
beforeEach(() => {
  vi.clearAllMocks();
  account = { accountId: "hotel", apiKey: "fixture-secret", orderBridge: { ...config },
    posNotifications: { enabled: true, account: "hotel", spotId: 1, tabletId: 2, tokenHash: "fixture-hash",
      lastSeenAt: new Date().toISOString(), kitchenReadyAt: new Date().toISOString() } };
  fixture.account.mockImplementation(async () => ({ account, config: account.orderBridge }));
  fixture.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT id, number")) return { rows: [{ id: 10, name: "1" }] };
    if (sql.startsWith("SELECT id,name,price")) return { rows: [{ id: 20, name: "Soup", price: 20 }] };
    if (sql.startsWith("SELECT poster_sync")) return { rows: [] };
    if (sql.includes("UPDATE organizations")) return { rows: [{ id: 39 }] };
    throw new Error("Unexpected query");
  });
  fixture.call.mockImplementation(async (_token: string, method: string) => ({
    "spots.getSpots": [{ spot_id: 1, name: "DOGODA" }],
    "access.getTablets": [{ tablet_id: 2, spot_id: 1, tablet_name: "Бар" }],
    "access.getEmployees": [{ user_id: 3, name: "Waiter" }],
    "menu.getProducts": [{ product_id: 200, product_name: "Soup" }],
    "spots.getTableHallTables": [{ table_id: 7, spot_id: 1 }],
  })[method]);
});
describe("explicit kitchen activation", () => {
  it("does not expose tokens when reporting terminal readiness", async () => {
    const response = await request(app).get("/bridge");
    expect(response.body.kitchenTerminalReady).toBe(true);
    expect(response.body.printSupported).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain("fixture-secret");
    expect(JSON.stringify(response.body)).not.toContain("fixture-hash");
  });
  it("records a fresh kitchen cutoff only after explicit activation", async () => {
    const response = await request(app).put("/bridge").send({ ...config, kitchenEnabled: true });
    expect(response.status).toBe(200);
    const update = fixture.query.mock.calls.find(([sql]) => sql.includes("UPDATE organizations"));
    expect(JSON.parse(update![1][1])).toMatchObject({ kitchenEnabled: true,
      kitchenActivatedAt: expect.any(String), activatedAt: config.activatedAt });
  });
  for (const mode of ["old-bundle", "offline", "other-register", "disabled-bridge"]) {
    it(`does not activate kitchen printing with ${mode}`, async () => {
      if (mode === "old-bundle") delete account.posNotifications.kitchenReadyAt;
      if (mode === "offline") account.posNotifications.lastSeenAt = "2026-01-01T00:00:00Z";
      if (mode === "other-register") account.posNotifications.tabletId = 99;
      const response = await request(app).put("/bridge").send({ ...config, kitchenEnabled: true, enabled: mode !== "disabled-bridge" });
      expect(response.status).toBe(409);
      expect(fixture.query.mock.calls.some(([sql]) => sql.includes("UPDATE organizations"))).toBe(false);
    });
  }
  it("allows turning off physical commands even while the terminal is offline", async () => {
    delete account.posNotifications.kitchenReadyAt;
    expect((await request(app).put("/bridge").send({ ...config, kitchenEnabled: false })).status).toBe(200);
    const update = fixture.query.mock.calls.find(([sql]) => sql.includes("UPDATE organizations"));
    expect(JSON.parse(update![1][1]).kitchenActivatedAt).toBeUndefined();
  });
});
