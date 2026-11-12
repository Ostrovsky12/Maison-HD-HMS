import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), open: vi.fn(), release: vi.fn(), bill: vi.fn(),
  managed: vi.fn(), dispatch: vi.fn(), cash: vi.fn() }));
vi.mock("../lib/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) { res.status(401).json({ error: "Unauthorized" }); return; }
  req.user = { organizationId: 1, role: req.headers.authorization === "Bearer guest" ? "guest" : "waiter" }; next();
} }));
vi.mock("../lib/fb-service-points.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/fb-service-points.js")>(),
  resolveServicePoint: fixture.resolve, openServicePoint: fixture.open, releaseStaffItems: fixture.release,
  readServicePointBill: fixture.bill,
  requestCashPayment: fixture.cash,
}));
vi.mock("../lib/poster-order-bridge.js", () => ({
  isPosterManagedOrder: fixture.managed, dispatchPosterOrder: fixture.dispatch,
}));
import router from "../routes/fb-service-points.js";
const app = express();
app.use(express.json(), (req: any, _res: any, next: any) => { req.log = { warn: vi.fn() }; next(); });
app.use("/api/fb", router);
// Unmatched routes must not be accidentally made private by service point middleware.
app.get("/api/fb/public/other", (_req, res) => res.json({ ok: true }));
const point = { id: 11, number: "1", groupId: 1, groupName: "Будинки", location: "Будинки" };
beforeEach(() => {
  vi.clearAllMocks();
  fixture.resolve.mockResolvedValue({ point, orderId: null });
  fixture.open.mockResolvedValue({ orderId: 10, created: false });
  fixture.release.mockResolvedValue(1);
  fixture.managed.mockResolvedValue(false);
  fixture.bill.mockResolvedValue({ point, order: null, items: [], payable: false, orgId: 1 });
});
describe("service point API boundaries", () => {
  it("keeps the minimal current bill public without making staff actions public", async () => {
    expect((await request(app).get("/api/fb/public/service-points/dogoda/11/bill")).status).toBe(200);
    expect((await request(app).post("/api/fb/service-points/resolve").send({ qr: "/qr-menu/dogoda/11" })).status).toBe(401);
    expect((await request(app).get("/api/fb/public/other")).status).toBe(200);
  });
  it("does not grant staff access based on merely possessing a QR", async () => {
    const result = await request(app).post("/api/fb/service-points/resolve").set("Authorization", "Bearer guest")
      .send({ qr: "/qr-menu/dogoda/11" });
    expect(result.status).toBe(403); expect(fixture.resolve).not.toHaveBeenCalled();
  });
  it("requires an exact bill snapshot for a public cash request", async () => {
    const url = "/api/fb/public/service-points/dogoda/11/cash-request";
    expect((await request(app).post(url).send({})).status).toBe(400);
    expect(fixture.cash).not.toHaveBeenCalled();
    fixture.cash.mockResolvedValue({ ok: true, id: 44, duplicate: false, destination: "poster", delivery: "queued", message: "Очікуємо Poster" });
    const result = await request(app).post(url).send({ expectedOrderId: 10, expectedTotal: 300 });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: 44, destination: "poster", delivery: "queued" });
    expect(fixture.cash).toHaveBeenCalledWith("dogoda", 11, { expectedOrderId: 10, expectedTotal: 300 });
  });
  it("does not offer tips or claim Poster checkout availability just because a bill exists", async () => {
    fixture.bill.mockResolvedValue({ point, order: { id: 10, status: "open", totalAmount: 300 },
      items: [], payable: true, orgId: 1, cashRequestPending: true, cashChannelOnline: true, cashRequestDelivery: "queued" });
    const result = await request(app).get("/api/fb/public/service-points/dogoda/11/bill");
    expect(result.body).toMatchObject({ paymentAvailable: false, tipsAvailable: false,
      cashRequestAvailable: true, cashRequestPending: true, cashRequestDestination: "poster", cashRequestDelivery: "queued" });
  });
  it("resolves only using the signed-in organization", async () => {
    const result = await request(app).post("/api/fb/service-points/resolve").set("Authorization", "Bearer staff")
      .send({ qr: "/qr-menu/dogoda/11", organizationId: 999 });
    expect(result.status).toBe(200);
    expect(fixture.resolve).toHaveBeenCalledWith(1, "/qr-menu/dogoda/11");
  });
  it("opens idempotently with optional outlet selection", async () => {
    const result = await request(app).post("/api/fb/service-points/11/open").set("Authorization", "Bearer staff")
      .send({ outletId: 5 });
    expect(result.body).toEqual({ orderId: 10, created: false });
    expect(fixture.open).toHaveBeenCalledWith(1, 11, undefined, 5);
  });
  it("releases the snapshot without falsely reporting printer success", async () => {
    const result = await request(app).post("/api/fb/orders/10/dispatch-items").set("Authorization", "Bearer staff")
      .send({ itemIds: [1] });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ releasedCount: 1, posterManaged: false });
    expect(fixture.release).toHaveBeenCalledWith(1, 10, [1]);
    expect(fixture.dispatch).not.toHaveBeenCalled();
  });
});
