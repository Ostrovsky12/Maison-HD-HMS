import express from "express";
import request from "supertest";
import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), fiscalize: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: f.query, connect: f.connect } }));
vi.mock("../lib/encrypt.js", () => ({ decrypt: (value: string) => value }));
vi.mock("express-rate-limit", () => ({ default: () => (_r: any, _s: any, next: any) => next() }));
import { bookingCheckoutRouter } from "../routes/booking-checkout.js";
import { BOOKING_TARIFF_POLICY } from "../lib/booking-tariff.js";

const app = express();
app.use(express.json());
app.use("/api/public/booking-engine", bookingCheckoutRouter(f.fiscalize));
let booking: any, merchant: any, paid: boolean, conflict: boolean, blocked: boolean;
beforeEach(() => {
  vi.clearAllMocks(); paid = false; conflict = false; blocked = false;
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://booking.example.invalid");
  booking = { id: 100, organization_id: 1, unit_id: 10, status: "pending", payment_status: "unpaid", paid_amount: "0", total_amount: "2400",
    guest_access_code: "TESTACCESS", booking_ref: "QA-ONLY", check_in: "2030-05-10", check_out: "2030-05-12",
    draft_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    booking_policy_receipt: { ...BOOKING_TARIFF_POLICY, acceptedAt: "2030-01-01T00:00:00Z" } };
  merchant = { id: 7, liqpay_public_key: "test-public", liqpay_private_key: "test-only-private" };
  f.fiscalize.mockResolvedValue({ documents: [] });
  f.connect.mockResolvedValue({ query: f.query, release: vi.fn() });
  f.query.mockImplementation(async (sql: string, values: any[] = []) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.includes("SELECT b.*")) return { rows: values[1] === "hotel" ? [structuredClone(booking)] : [] };
    if (sql.includes("JOIN legal_entities") || sql.includes("FROM legal_entities")) return { rows: merchant ? [merchant] : [] };
    if (sql.startsWith("SELECT id,status FROM units")) return { rows: [{ id: 10, status: "active" }] };
    if (sql.startsWith("SELECT id FROM payments")) return { rows: paid ? [{ id: 500 }] : [] };
    if (sql.includes("FROM accommodation_blocks")) return { rows: blocked ? [{ id: 40 }] : [] };
    if (sql.includes("SELECT id FROM bookings")) return { rows: conflict ? [{ id: 200 }] : [] };
    if (sql.startsWith("UPDATE bookings SET booking_policy_receipt=")) {
      booking.booking_policy_receipt.checkout = JSON.parse(values[1]); return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO payments")) { paid = true; return { rows: [{ id: 500 }] }; }
    if (sql.startsWith("UPDATE bookings SET paid_amount=")) {
      booking.paid_amount = Number(booking.paid_amount) + Number(values[1]);
      booking.payment_status = "paid"; if (!values[2]) booking.status = "confirmed";
      booking.booking_policy_receipt.checkout.status = values[3]; return { rows: [] };
    }
    throw new Error("Unexpected checkout fixture query");
  });
});
const checkout = (extra = {}, slug = "hotel") => request(app).post(`/api/public/booking-engine/${slug}/checkout`).send({
  bookingId: 100, guestAccessCode: "TESTACCESS", agreeNonRefundable: true, tariffPolicyVersion: BOOKING_TARIFF_POLICY.version, ...extra,
});
function callback(extra = {}, key = "test-only-private") {
  const payload = { order_id: booking.booking_policy_receipt.checkout.orderId, public_key: "test-public", status: "success", amount: 2400, currency: "UAH", payment_id: "qa-1", ...extra };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64");
  const signature = crypto.createHash("sha1").update(key + data + key).digest("base64");
  return request(app).post("/api/public/booking-engine/hotel/liqpay-callback").send({ data, signature });
}
describe("100% non-refundable checkout", () => {
  it.each([{ agreeNonRefundable: false }, { tariffPolicyVersion: "old" }])("requires exact separate consent %j", async body => {
    expect((await checkout(body)).status).toBe(400); expect(f.query).not.toHaveBeenCalled();
  });
  it("signs the full server amount regardless of client amount or requested percentage", async () => {
    const res = await checkout({ amount: 1, percentage: 30 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.amount).toBe(2400);
    const payload = JSON.parse(Buffer.from(res.body.data, "base64").toString());
    expect(payload.amount).toBe(2400); expect(payload.public_key).toBe("test-public");
    expect(payload.server_url).toContain("/hotel/liqpay-callback");
    expect(res.body.checkoutUrl).toBe("https://www.liqpay.ua/api/3/checkout");
    expect(JSON.stringify(res.body)).not.toContain("test-only-private");
  });
  it("reuses a single merchant/order identity for retries", async () => {
    const first = await checkout(); const second = await checkout();
    expect(second.status).toBe(200);
    expect(second.body.data).toBe(first.body.data);
    expect(f.query.mock.calls.filter(([sql]) => sql.startsWith("UPDATE bookings SET booking_policy_receipt="))).toHaveLength(1);
  });
  it("rejects another hotel's slug and wrong guest bearer codes", async () => {
    expect((await checkout({}, "other-hotel")).status).toBe(404);
    expect((await checkout({ guestAccessCode: "NOTACCESS!" })).status).toBe(404);
  });
  it("rejects expired or partially paid reservations without a second charge", async () => {
    booking.draft_expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await checkout()).status).toBe(410);
    booking.draft_expires_at = new Date(Date.now() + 60_000).toISOString(); booking.paid_amount = 100;
    expect((await checkout()).status).toBe(409);
  });
  it("fails closed when the property's own merchant is unavailable", async () => {
    merchant = null; expect((await checkout()).status).toBe(503);
  });
  it("never changes merchants after generating a checkout", async () => {
    await checkout(); merchant.id = 8;
    expect((await checkout()).status).toBe(409);
  });
  it("records only a signed full payment and confirms the reservation once", async () => {
    await checkout(); expect((await callback()).status).toBe(200); expect((await callback()).status).toBe(200);
    expect(booking.paid_amount).toBe(2400); expect(booking.status).toBe("confirmed");
    expect(f.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO payments"))).toHaveLength(1);
  });
  it.each([{ amount: 1200 }, { currency: "USD" }, { public_key: "another-merchant" }])("rejects incorrect signed payment identity %j", async change => {
    await checkout(); expect((await callback(change)).status).toBe(400); expect(paid).toBe(false);
  });
  it("rejects forged signatures", async () => {
    await checkout(); expect((await callback({}, "wrong-key")).status).toBe(400); expect(paid).toBe(false);
  });
  it("never treats sandbox or processing states as paid", async () => {
    await checkout(); expect((await callback({ status: "sandbox" })).status).toBe(200); expect(paid).toBe(false);
    expect((await callback({ status: "processing" })).status).toBe(200); expect(paid).toBe(false);
  });
  it("records late funds for review without silently reviving a cancelled reservation", async () => {
    await checkout(); booking.status = "cancelled";
    expect((await callback()).status).toBe(200);
    expect(booking.paid_amount).toBe(2400); expect(booking.status).toBe("cancelled");
    expect(booking.booking_policy_receipt.checkout.status).toBe("review");
  });
  it("does not confirm inventory that became blocked during payment", async () => {
    await checkout(); blocked = true;
    expect((await callback()).status).toBe(200);
    expect(booking.booking_policy_receipt.checkout.status).toBe("review");
    expect(booking.status).toBe("pending");
  });
  it("does not lose committed money when fiscalization fails", async () => {
    await checkout(); f.fiscalize.mockRejectedValue(new Error("Fiscal provider unavailable"));
    expect((await callback()).status).toBe(200); expect(paid).toBe(true); expect(booking.paid_amount).toBe(2400);
  });
  it("reports paid only from persisted status, never from a return URL flag", async () => {
    const path = "/api/public/booking-engine/hotel/payment-status?bookingId=100&code=TESTACCESS&success=1";
    expect((await request(app).get(path)).body.status).toBe("awaiting_payment");
    await checkout(); await callback();
    const res = await request(app).get(path);
    expect(res.body.status).toBe("paid"); expect(res.headers["cache-control"]).toBe("no-store");
  });
});
