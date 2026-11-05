import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  query: vi.fn(), create: vi.fn(), get: vi.fn(), checkout: vi.fn(), cancel: vi.fn(), valid: vi.fn(), record: vi.fn(), search: vi.fn(),
}));
vi.mock("@workspace/db", () => ({ pool: { query: f.query } }));
vi.mock("../lib/servio-booking-notifications.js", () => ({ deliverServioBookingNotifications: vi.fn() }));
vi.mock("../lib/auth.js", () => ({
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }),
}));
vi.mock("express-rate-limit", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../lib/servio-reservations.js", () => ({
  attemptStore: { get: f.get }, createServioReservation: f.create, checkoutServioReservation: f.checkout,
  cancelServioReservation: f.cancel, reservationView: (row: any) => row,
  validServioCallback: f.valid, recordServioPayment: f.record, hashReservationRequest: () => "fixture-hash",
}));
vi.mock("../lib/servio-availability.js", async original => ({
  ...await original<typeof import("../lib/servio-availability.js")>(), searchServioAvailability: f.search,
}));
import router, { servioReservationPaymentCallback } from "../routes/booking-servio-reservations.js";
import { encrypt } from "../lib/encrypt.js";
import { servioFingerprint } from "../lib/servio-connection.js";
import { liqpayCredentialFingerprint } from "../lib/liqpay-connection.js";
import { BOOKING_TARIFF_POLICY } from "../lib/booking-tariff.js";
const app = express();
app.use(express.json(), (req: any, _res, next) => {
  req.user = { organizationId: 7, role: req.headers["x-role"] || "owner" }; req.log = { info: vi.fn() }; next();
});
app.post("/callback", servioReservationPaymentCallback);
app.use("/reservations", router);
const id = "00000000-0000-4000-8000-000000000001";
const input = { checkIn: "2026-12-01", checkOut: "2026-12-03", adults: 2, childAges: [], useExtraBed: false,
  companyId: 0, companyCodeId: 0, conditionId: 0, categoryId: 11, priceListId: 90, rateConditionId: 1, propertyId: 4,
  requestId: id, firstName: "Test", lastName: "Guest", phone: "+380000000000", email: "test@example.invalid",
  expectedTotal: 200, authorizeProviderWrite: true, agreeTerms: true, agreeNonRefundable: true, tariffPolicyVersion: BOOKING_TARIFF_POLICY.version };
const row: any = { id, requestId: id, state: "bill_ready", message: "Final bill", createdAt: "2026-11-04T10:00:00Z", updatedAt: "2026-11-04T10:00:00Z",
  categoryName: "House", rateName: "NR", checkIn: input.checkIn, checkOut: input.checkOut, total: 225, currency: "UAH",
  account: "0000000123", mode: "live", policyVersion: BOOKING_TARIFF_POLICY.version, acknowledgementText: BOOKING_TARIFF_POLICY.acknowledgementText,
  organization_id: 7, bill: { totalMinor: 22500 } };
let config: any, seller: any, rate: any;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET", "test-only-session-secret-longer-than-32-bytes");
  vi.stubEnv("PUBLIC_APP_URL", "https://example.invalid");
  config = { provider: "servio", servioBaseUrl: "https://example.servio.support/ReservationService_1_10",
    servioHotelId: "7", servioToken: encrypt("fixture-token"), terms: "Rules", privacy: "Privacy", checkInTime: "14:00", checkOutTime: "12:00" };
  config.servioVerification = { fingerprint: servioFingerprint(config), result: {
    status: "connected", code: "categories_read", message: "ok", pingOk: true, checkedAt: "2026-11-04T00:00:00Z", categories: [{ id: 11, name: "House", hotelId: 7 }],
  } };
  seller = { id: 4, legal_entity_id: 8, liqpay_public_key: "fixture-public", liqpay_private_key: encrypt("fixture-secret") };
  config.liqpayVerification = { "8": { status: "connected", fingerprint: liqpayCredentialFingerprint(seller.liqpay_public_key, seller.liqpay_private_key) } };
  rate = { priceListId: 90, conditionId: 1, total: 200, nonRefundable: true, saleAllowed: true, name: "NR Site", charges: [] };
  f.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("FROM organizations") ? [{ name: "Fixture", booking_engine_config: config }]
    : sql.includes("FROM properties") ? seller ? [seller] : [] : [] }));
  f.search.mockImplementation(async () => ({ status: "complete", currency: "грн", categories: [{ id: 11, name: "House", freeRooms: 2, rates: [rate] }] }));
  f.create.mockResolvedValue(row); f.get.mockResolvedValue(row); f.valid.mockReturnValue(true); f.record.mockResolvedValue(row);
  f.checkout.mockResolvedValue({ reservation: row, url: "https://www.liqpay.ua/api/3/checkout", data: "fixture", signature: "fixture" });
});
describe("controlled Servio route boundaries", () => {
  it.each(["staff", "manager"])("denies %s before any provider or database work", async role => {
    expect((await request(app).post("/reservations").set("x-role", role).send(input)).status).toBe(403);
    expect(f.query).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled();
  });
  it.each(["staff", "manager"])("does not let %s issue private guest payment links", async role => {
    expect((await request(app).post(`/reservations/${id}/guest-link`).set("x-role", role).send({ authorizeGuestAccess: true })).status).toBe(403);
    expect(f.query).not.toHaveBeenCalled();
  });
  it.each(["agreeNonRefundable", "authorizeProviderWrite", "agreeTerms"])("requires explicit %s before any writes", async flag => {
    expect((await request(app).post("/reservations").send({ ...input, [flag]: false })).status).toBe(400);
    expect(f.query).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled();
  });
  it("derives connection and merchant from the session, not forged client fields", async () => {
    const response = await request(app).post("/reservations").send({ ...input, organizationId: 999, token: "attacker", total: 1 });
    expect(response.status).toBe(200);
    expect(f.create).toHaveBeenCalledWith(7, input, expect.objectContaining({ token: "fixture-token", hotelId: 7, legalEntityId: 8, propertyId: 4, secretKey: "fixture-secret" }), "House", rate);
    expect(f.query.mock.calls.filter(([sql]) => sql.includes("FROM properties")).every(([, values]) => JSON.stringify(values) === "[4,7]")).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(/fixture-token|fixture-secret|attacker|organization_id/);
    expect(response.body).not.toHaveProperty("bill");
  });
  it("blocks a foreign seller instead of using another tenant's merchant", async () => {
    seller = null;
    expect((await request(app).post("/reservations").send(input)).status).toBe(409);
    expect(f.search).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled();
  });
  it.each(["price", "refundable", "unknown_restrictions"])("rechecks %s before creating a reservation", async variant => {
    if (variant === "price") rate.total = 250;
    if (variant === "refundable") rate.name = "Standard";
    if (variant === "unknown_restrictions") rate.saleAllowed = null;
    expect((await request(app).post("/reservations").send(input)).status).toBe(409);
    expect(f.create).not.toHaveBeenCalled();
  });
  it("accepts NR Site without relying on the provider refund flag", async () => {
    rate.nonRefundable = false;
    expect((await request(app).post("/reservations").send(input)).status).toBe(200);
    expect(f.create).toHaveBeenCalledOnce();
  });
  it("requires new acknowledgement of the FINAL bill, not the earlier quote", async () => {
    const consent = { expectedTotal: 200, agreeNonRefundable: true, tariffPolicyVersion: BOOKING_TARIFF_POLICY.version };
    expect((await request(app).post(`/reservations/${id}/checkout`).send(consent)).status).toBe(409);
    expect(f.checkout).not.toHaveBeenCalled();
    expect((await request(app).post(`/reservations/${id}/checkout`).send({ ...consent, expectedTotal: 225 })).status).toBe(200);
    expect(f.get).toHaveBeenCalledWith(id, 7);
  });
  it("never returns another tenant's attempt on checkout", async () => {
    f.get.mockResolvedValue(null);
    expect((await request(app).post(`/reservations/${id}/checkout`).send({ expectedTotal: 225, agreeNonRefundable: true, tariffPolicyVersion: BOOKING_TARIFF_POLICY.version })).status).toBe(404);
    expect(f.checkout).not.toHaveBeenCalled();
  });
});
describe("public callback boundary", () => {
  const callback = () => ({ data: Buffer.from(JSON.stringify({ order_id: `mhd_servio_${id}`, status: "success" })).toString("base64"), signature: "fixture" });
  beforeEach(() => f.query.mockResolvedValue({ rows: [row] }));
  it("rejects forged callbacks before recording or guaranteeing anything", async () => {
    f.valid.mockReturnValue(false);
    expect((await request(app).post("/callback").send(callback())).status).toBe(400);
    expect(f.record).not.toHaveBeenCalled();
  });
  it("returns a retryable status on database failure rather than acknowledging lost money", async () => {
    f.record.mockRejectedValue(new Error("database_unavailable"));
    expect((await request(app).post("/callback").send(callback())).status).toBe(503);
  });
  it("rejects an invalid amount rather than submitting confirmation", async () => {
    f.record.mockRejectedValue(new Error("payment_mismatch"));
    expect((await request(app).post("/callback").send(callback())).status).toBe(400);
  });
});
