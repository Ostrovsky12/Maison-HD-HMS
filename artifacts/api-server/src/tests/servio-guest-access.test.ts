import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), checkout: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: f.query, connect: f.connect } }));
vi.mock("express-rate-limit", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../lib/servio-reservations.js", async original => ({
  ...await original<typeof import("../lib/servio-reservations.js")>(), checkoutServioReservation: f.checkout,
}));
import router, { issueServioGuestLink } from "../routes/booking-servio-guest.js";
import { createServioGuestAccess, encodeServioGuestAccess, verifiesServioGuestAccess, decodeServioGuestAccess } from "../lib/servio-guest-access.js";
import { encrypt } from "../lib/encrypt.js";
import { BOOKING_TARIFF_POLICY } from "../lib/booking-tariff.js";
const id = "00000000-0000-4000-8000-000000000001";
const path = `/hotel/servio/reservations/${id}`;
const app = express();
app.use(express.json(), (req: any, _res, next) => { req.user = { organizationId: 7 }; next(); });
app.post("/issue/:id", issueServioGuestLink);
app.use(router);
let row: any, access: ReturnType<typeof createServioGuestAccess>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET", "test-only-session-secret-longer-than-32-bytes");
  access = createServioGuestAccess("hotel", id, { hotelName: "Hotel", sellerName: "Legal seller", phone: "+380000000000", email: "hotel@example.invalid" });
  row = {
    id, organization_id: 7, request_id: id, request_hash: "private-request-hash", state: "bill_ready", account: "0000000123",
    created_at: new Date(), updated_at: new Date(), consent: null, payment: null,
    payload: { input: { checkIn: "2026-12-01", checkOut: "2026-12-03", firstName: "Private guest", email: "private@example.invalid", phone: "private-phone" }, categoryName: "House", rateName: "NR" },
    bill: { totalMinor: 22500, firstDayAmount: 100, services: [] },
    connection: encrypt(JSON.stringify({ mode: "live", secretKey: "private-key", token: "provider-token", publicKey: "merchant-public",
      terms: "Saved hotel terms", privacy: "Saved privacy", legalEntityId: 8, origin: "https://example.invalid" })),
    guest_access: encodeServioGuestAccess(access), slug: "hotel", hotel_name: "Hotel",
  };
  f.query.mockImplementation(async (sql: string, values: any[] = []) => {
    if (sql.includes("JOIN organizations")) return { rows: values[0] === id && values[1] === "hotel" ? [row] : [] };
    return { rows: [] };
  });
  f.connect.mockResolvedValue({ query: vi.fn(async (sql: string, values: any[] = []) => {
    if (sql.includes("FOR UPDATE")) return { rows: values[0] === id && values[1] === 7 ? [row] : [] };
    if (sql.includes("FROM legal_entities")) return { rows: [{ name: "Legal seller" }] };
    if (sql.startsWith("UPDATE")) { row.guest_access = values[2]; return { rows: [] }; }
    return { rows: [] };
  }), release: vi.fn() });
  f.checkout.mockImplementation(async () => ({
    reservation: { id, requestId: id, state: "awaiting_payment", message: "Waiting",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), categoryName: "House", rateName: "NR",
      checkIn: "2026-12-01", checkOut: "2026-12-03", total: 225, currency: "UAH", account: "0000000123", mode: "live",
      policyVersion: BOOKING_TARIFF_POLICY.version, acknowledgementText: BOOKING_TARIFF_POLICY.acknowledgementText },
    url: "https://www.liqpay.ua/api/3/checkout", data: "signed-form", signature: "signature",
  }));
});
describe("private Servio guest access", () => {
  it("uses 256-bit random tokens encrypted at rest and scoped to one hotel and attempt", () => {
    expect(access.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row.guest_access).not.toContain(access.token);
    expect(verifiesServioGuestAccess(row, "hotel", access.token)).toBe(true);
    expect(verifiesServioGuestAccess(row, "other-hotel", access.token)).toBe(false);
    expect(verifiesServioGuestAccess({ ...row, id: id.replace(/1$/, "2") }, "hotel", access.token)).toBe(false);
    expect(verifiesServioGuestAccess(row, "hotel", "A".repeat(43))).toBe(false);
  });
  it("rejects expired, corrupt and absent tokens without inferring access from a session", async () => {
    expect((await request(app).get(path)).status).toBe(404);
    expect(f.query).not.toHaveBeenCalled();
    row.guest_access = encodeServioGuestAccess({ ...access, expiresAt: new Date(Date.now() - 1).toISOString() });
    expect((await request(app).get(path).set("X-Booking-Access", access.token)).status).toBe(404);
    row.guest_access = "corrupt";
    expect(decodeServioGuestAccess(row)).toBeNull();
    expect((await request(app).get(path).set("X-Booking-Access", access.token)).status).toBe(404);
  });
  it("does not accept a bearer token in the query string or leak private payloads in guest responses", async () => {
    expect((await request(app).get(`${path}?access=${access.token}`)).status).toBe(404);
    const response = await request(app).get(path).set("X-Booking-Access", access.token);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toContain("noindex");
    expect(response.body).toMatchObject({ sellerName: "Legal seller", terms: "Saved hotel terms", reservation: { total: 225, state: "bill_ready" } });
    expect(JSON.stringify(response.body)).not.toMatch(/Private guest|private@example|private-phone|private-key|provider-token|merchant-public|private-request-hash|guest_access/);
    expect(JSON.stringify(response.body)).not.toContain(access.token);
    expect(f.checkout).not.toHaveBeenCalled();
  });
  it("cannot retrieve an attempt under another hotel slug", async () => {
    expect((await request(app).get(path.replace("/hotel/", "/other/")).set("X-Booking-Access", access.token)).status).toBe(404);
  });
  const consent = () => ({ expectedTotal: 225, agreeTerms: true, agreeNonRefundable: true, tariffPolicyVersion: BOOKING_TARIFF_POLICY.version });
  it.each(["agreeTerms", "agreeNonRefundable"])("requires the guest's explicit %s", async flag => {
    expect((await request(app).post(`${path}/checkout`).set("X-Booking-Access", access.token).send({ ...consent(), [flag]: false })).status).toBe(400);
    expect(f.checkout).not.toHaveBeenCalled();
  });
  it("pays exactly the final existing bill without creating a new reservation", async () => {
    const mismatch = await request(app).post(`${path}/checkout`).set("X-Booking-Access", access.token).send({ ...consent(), expectedTotal: 200 });
    expect(mismatch.status).toBe(409); expect(f.checkout).not.toHaveBeenCalled();
    const response = await request(app).post(`${path}/checkout`).set("X-Booking-Access", access.token).send(consent());
    expect(response.status).toBe(200);
    expect(f.checkout).toHaveBeenCalledWith(row, undefined, "guest");
    expect(f.connect).not.toHaveBeenCalled();
  });
  it("issues only after explicit administrator authorization and reuses the same valid access link", async () => {
    expect((await request(app).post(`/issue/${id}`).send({ authorizeGuestAccess: false })).status).toBe(400);
    expect(f.connect).not.toHaveBeenCalled();
    const one = await request(app).post(`/issue/${id}`).send({ authorizeGuestAccess: true });
    const two = await request(app).post(`/issue/${id}`).send({ authorizeGuestAccess: true });
    expect(one.status).toBe(200); expect(two.body.url).toBe(one.body.url);
    expect(one.body.url).toBe(`https://example.invalid/booking/hotel/servio/${id}#access=${access.token}`);
    expect(f.connect.mock.results[0].value).toBeDefined();
    expect(f.checkout).not.toHaveBeenCalled();
  });
  it("will not create a fresh guest link for an already-issued bank checkout or an uncertain reservation", async () => {
    row.guest_access = null; row.state = "awaiting_payment";
    expect((await request(app).post(`/issue/${id}`).send({ authorizeGuestAccess: true })).status).toBe(409);
    row.state = "review";
    expect((await request(app).post(`/issue/${id}`).send({ authorizeGuestAccess: true })).status).toBe(409);
    expect(f.checkout).not.toHaveBeenCalled();
  });
  it("creates new access only for a final bill and retains tokens only in the encrypted column and intended fragment link", async () => {
    row.guest_access = null;
    const response = await request(app).post(`/issue/${id}`).send({ authorizeGuestAccess: true });
    expect(response.status).toBe(200);
    const generated = decodeServioGuestAccess(row)!;
    expect(generated.token).toHaveLength(43);
    expect(response.body.url).toContain(`#access=${generated.token}`);
    expect(row.guest_access).not.toContain(generated.token);
    expect(f.checkout).not.toHaveBeenCalled();
  });
});
