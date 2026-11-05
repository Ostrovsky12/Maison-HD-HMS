import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ query: vi.fn(), ready: vi.fn(), search: vi.fn(), create: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: f.query } }));
vi.mock("express-rate-limit", () => ({ default: () => (_q: any, _s: any, next: any) => next() }));
vi.mock("../lib/servio-sales.js", async original => ({
  ...await original<typeof import("../lib/servio-sales.js")>(), servioSalesReadiness: f.ready,
}));
vi.mock("../routes/booking-checkout.js", () => ({ bookingPaymentOrigin: () => "https://example.invalid" }));
vi.mock("../lib/servio-availability.js", async original => ({
  ...await original<typeof import("../lib/servio-availability.js")>(), searchServioAvailability: f.search,
}));
vi.mock("../lib/servio-reservations.js", () => ({
  createServioReservation: f.create, hashReservationRequest: () => "hash", reservationView: (row: any) => row.view,
}));
import router from "../routes/booking-servio-public.js";
import { encrypt } from "../lib/encrypt.js";
import { servioFingerprint } from "../lib/servio-connection.js";
import { BOOKING_TARIFF_POLICY } from "../lib/booking-tariff.js";
import { createServioGuestAccess, encodeServioGuestAccess } from "../lib/servio-guest-access.js";
import { ServioInventoryConflict } from "../lib/servio-inventory.js";

const app = express();
app.use(express.json(), (req: any, _res, next) => { req.log = { info: vi.fn() }; next(); });
app.use(router);
const id = "00000000-0000-4000-8000-000000000001";
const search = { checkIn: "2027-01-02", checkOut: "2027-01-04", adults: 2, childAges: [4, 9] };
const input = { ...search, requestId: id, categoryId: 11, priceListId: 12, rateConditionId: 0,
  firstName: "Test", lastName: "Guest", phone: "+380000000000", email: "test@example.invalid",
  specialRequests: "Дитяче ліжечко", expectedTotal: 200, agreeTerms: true, agreeNonRefundable: true, tariffPolicyVersion: BOOKING_TARIFF_POLICY.version };
let org: any, ready: any, snapshot: any, prior: any, row: any;
beforeEach(() => {
  vi.clearAllMocks(); prior = null;
  const config: any = { provider: "servio", published: true, displayName: "DOGODA", phone: "123",
    terms: "Terms", privacy: "Privacy", servioBaseUrl: "https://example.servio.support/ReservationService_1_10",
    servioHotelId: "7", servioToken: encrypt("fixture-token"), servioSellerPropertyId: 4 };
  config.servioSellerFingerprint = servioFingerprint(config);
  config.servioVerification = { fingerprint: servioFingerprint(config), result: {
    status: "connected", code: "CONNECTED", message: "Ready", pingOk: true,
    checkedAt: "2026-01-01T00:00:00.000Z", hotelId: 7,
    categories: [{ id: 11, hotelId: 7, name: "House" }],
  } };
  org = { id: 7, slug: "dogoda", name: "DOGODA", booking_engine_config: config };
  ready = { issues: [], mailbox: "welcome@dogoda.ua", categories: [{ id: 11, hotelId: 7, name: "House" }],
    seller: { id: 4, legal_entity_id: 8, name: "Hotel seller", liqpay_public_key: "public-key", liqpay_private_key: encrypt("fixture-secret") } };
  snapshot = { status: "complete", code: "ok", message: "ok", checkedAt: new Date().toISOString(),
    query: { ...search, useExtraBed: false, companyId: 0, companyCodeId: 0, conditionId: 0 }, hotelId: 7, currency: "UAH",
    categories: [{ id: 11, name: "House", freeRooms: 1, mainPlaces: 2, nearestDate: null,
      rates: [{ priceListId: 12, name: "NR", conditionId: 0, nonRefundable: true, specialRate: false,
        total: 200, charges: [], restrictions: [], saleAllowed: true }] }] };
  row = { view: { id, requestId: id, state: "bill_ready", message: "Ready", createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), categoryName: "House", rateName: "NR", checkIn: input.checkIn, checkOut: input.checkOut,
    total: 200, currency: "UAH", account: "0000000007", mode: "live", policyVersion: BOOKING_TARIFF_POLICY.version,
    acknowledgementText: BOOKING_TARIFF_POLICY.acknowledgementText },
    guest_access: encodeServioGuestAccess(createServioGuestAccess("dogoda", id, { hotelName: "DOGODA", sellerName: "Seller", phone: "", email: "" })),
    request_hash: "hash" };
  f.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("FROM organizations") ? [org] : prior ? [prior] : [] }));
  f.ready.mockImplementation(async () => ready);
  f.search.mockImplementation(async () => structuredClone(snapshot));
  f.create.mockImplementation(async () => row);
});
describe("public Servio booking", () => {
  it("reads real Servio search parameters with all child ages; ignores forged corporate IDs", async () => {
    const res = await request(app).post("/dogoda/servio/search").send({ ...search, companyId: 999, useExtraBed: true });
    expect(res.status).toBe(200);
    expect(f.search.mock.calls[0][1]).toEqual({ ...search, companyId: 0, companyCodeId: 0, conditionId: 0, useExtraBed: false });
    expect(f.create).not.toHaveBeenCalled();
  });
  it.each(["draft", "configuration", "ages"])("blocks %s without a provider mutation", async kind => {
    if (kind === "draft") org.booking_engine_config.published = false;
    if (kind === "configuration") delete org.booking_engine_config.servioVerification;
    const res = await request(app).post("/dogoda/servio/search").send(kind === "ages" ? { ...search, childAges: [null] } : search);
    expect(res.status).toBeGreaterThanOrEqual(400); expect(f.create).not.toHaveBeenCalled();
  });
  it("searches without seller, LiqPay, SMTP or legal texts, but still blocks reservation creation", async () => {
    delete org.booking_engine_config.servioSellerPropertyId;
    org.booking_engine_config.terms = "";
    org.booking_engine_config.privacy = "";
    ready.issues = ["no seller", "no LiqPay", "no mail", "no legal texts"];
    const res = await request(app).post("/dogoda/servio/search").send(search);
    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(1);
    expect(f.ready).not.toHaveBeenCalled();
    expect(f.search).toHaveBeenCalledOnce();
    expect(f.create).not.toHaveBeenCalled();
    const reserve = await request(app).post("/dogoda/servio/reservations").send(input);
    expect(reserve.status).toBeGreaterThanOrEqual(400);
    expect(f.create).not.toHaveBeenCalled();
  });
  it("blocks search with stale verification after a Servio connection change", async () => {
    org.booking_engine_config.servioHotelId = "8";
    const res = await request(app).post("/dogoda/servio/search").send(search);
    expect(res.status).toBe(503);
    expect(f.search).not.toHaveBeenCalled();
  });
  it.each(["sold_out", "currency"])("does not display %s prices as available UAH quotes", async kind => {
    const category = snapshot.categories[0], rate = category.rates[0];
    if (kind === "sold_out") category.freeRooms = 0;
    if (kind === "currency") snapshot.currency = "USD";
    const res = await request(app).post("/dogoda/servio/search").send(search);
    expect(res.status).toBe(200); expect(res.body.categories[0].rates).toEqual([]);
  });
  it.each([
    ["nonRefundable", false],
    ["saleAllowed", null],
    ["saleAllowed", false],
  ])("shows %s=%s quotes for viewing but refuses reservation creation", async (field, value) => {
    (snapshot.categories[0].rates[0] as any)[field as string] = value;
    const res = await request(app).post("/dogoda/servio/search").send(search);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe("view_only_rates");
    expect(res.body.categories[0].freeRooms).toBeGreaterThan(0);
    expect(res.body.categories[0].rates).toHaveLength(1);
    expect(res.body.categories[0].rates[0]).toMatchObject({ [field as string]: value, total: 200 });
    expect(f.create).not.toHaveBeenCalled();
    const reserve = await request(app).post("/dogoda/servio/reservations").send(input);
    expect(reserve.status).toBeGreaterThanOrEqual(400);
    expect(f.create).not.toHaveBeenCalled();
  });
  it("preserves eligible and view-only quotes in the same category", async () => {
    snapshot.categories[0].rates.push({ ...snapshot.categories[0].rates[0], priceListId: 13, nonRefundable: false, total: 250 });
    const res = await request(app).post("/dogoda/servio/search").send(search);
    expect(res.status).toBe(200);
    expect(res.body.categories[0].rates).toHaveLength(2);
    expect(res.body.categories[0].rates.map((rate: any) => rate.nonRefundable)).toEqual([true, false]);
    expect(res.body.code).not.toBe("view_only_rates");
  });
  it("does not label actual zero availability as a tariff failure", async () => {
    snapshot.categories[0].freeRooms = 0;
    const res = await request(app).post("/dogoda/servio/search").send(search);
    expect(res.status).toBe(200);
    expect(res.body.code).not.toBe("no_eligible_rates");
  });
  it("creates a reservation from a revalidated rate, using only the configured seller", async () => {
    const res = await request(app).post("/dogoda/servio/reservations").send({ ...input, propertyId: 999, organizationId: 999 });
    expect(res.status).toBe(200);
    expect(f.create.mock.calls[0][0]).toBe(7);
    expect(f.create.mock.calls[0][1]).toMatchObject({ propertyId: 4, companyId: 0, childAges: [4, 9], specialRequests: "Дитяче ліжечко" });
    expect(f.create.mock.calls[0][2]).toMatchObject({ legalEntityId: 8, notificationMailbox: "welcome@dogoda.ua" });
    expect(res.body.url).toContain(`/booking/dogoda/servio/${id}#access=`);
    expect(JSON.stringify(res.body)).not.toContain("fixture-secret");
  });
  it("rejects changed rates before creating anything", async () => {
    snapshot.categories[0].rates[0].total = 201;
    const res = await request(app).post("/dogoda/servio/reservations").send(input);
    expect(res.status).toBe(409); expect(res.body.code).toBe("PRICE_CHANGED"); expect(f.create).not.toHaveBeenCalled();
  });
  it.each(["SOLD_OUT", "INVENTORY_BUSY", "INVENTORY_UNCERTAIN"] as const)("returns an actionable %s response without a payment link", async code => {
    f.create.mockRejectedValueOnce(new ServioInventoryConflict(code));
    const res = await request(app).post("/dogoda/servio/reservations").send(input);
    expect(res.status).toBe(409); expect(res.body.code).toBe(code);
    expect(res.body.url).toBeUndefined(); expect(res.body.reservation).toBeUndefined();
  });
  it("returns the same private reservation on retry even after sales close", async () => {
    prior = row; org.booking_engine_config.published = false;
    const res = await request(app).post("/dogoda/servio/reservations").send(input);
    expect(res.status).toBe(200); expect(f.create).not.toHaveBeenCalled(); expect(f.search).not.toHaveBeenCalled();
  });
  it("rejects idempotency conflicts", async () => {
    prior = { ...row, request_hash: "different" };
    expect((await request(app).post("/dogoda/servio/reservations").send(input)).status).toBe(409);
    expect(f.create).not.toHaveBeenCalled();
  });
  it.each(["agreeTerms", "agreeNonRefundable", "email"])("requires %s", async key => {
    const res = await request(app).post("/dogoda/servio/reservations").send({ ...input, [key]: key === "email" ? "" : false });
    expect(res.status).toBe(400); expect(f.create).not.toHaveBeenCalled();
  });
});
