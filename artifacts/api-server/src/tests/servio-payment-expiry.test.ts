import { beforeEach, afterEach, describe, expect, it, vi, type Mock } from "vitest";
vi.mock("@workspace/db", () => ({ pool: { query: vi.fn() } }));
vi.mock("../lib/logger.js", () => ({ logger: { warn: vi.fn() } }));
import { encrypt } from "../lib/encrypt.js";
import { checkoutServioReservation, recordServioPayment, reservationView, type Attempt, type AttemptStore } from "../lib/servio-reservations.js";
import { expireServioReservation, lookupServioPayment, type LookupPayment } from "../lib/servio-payment-expiry.js";
import type { ServioWriteRequest } from "../lib/servio-connection.js";

const id = "00000000-0000-4000-8000-000000000001";
const deadline = "2027-01-01T12:10:00.000Z";
const now = Date.parse("2027-01-01T12:10:01Z");
const payment = { status: "success", currency: "UAH", amount: "200.00", payment_id: 123, rrn: "123456789",
  public_key: "public-key", order_id: `mhd_servio_${id}` };
let row: Attempt, store: AttemptStore, send: Mock<ServioWriteRequest>, lookup: Mock<LookupPayment>;
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-only-session-secret-more-than-32-bytes");
  row = {
    id, organization_id: 7, request_id: id, request_hash: "hash", state: "awaiting_payment", account: "0000000007",
    payload: { input: {} as any, categoryName: "House", rateName: "NR", source: "public_booking" },
    connection: encrypt(JSON.stringify({ base: "https://example.servio.support/ReservationService_1_10", token: "fixture-token",
      publicKey: "public-key", secretKey: "fixture-secret", origin: "https://example.invalid", mode: "live" }))!,
    bill: { account: "0000000007", totalMinor: 20000, firstDayAmount: 100, services: [] },
    consent: { acceptedAt: "2027-01-01T12:01:00Z", actor: "guest" }, payment: null, issue: null,
    payment_deadline: deadline, created_at: "2027-01-01T12:00:00Z", updated_at: "2027-01-01T12:01:00Z",
  };
  store = {
    async insert(candidate) { row = structuredClone(candidate); return { row, inserted: true }; },
    async get(requestId, orgId) { return requestId === id && orgId === 7 ? structuredClone(row) : null; },
    async transition(requestId, orgId, from, patch) {
      if (requestId !== id || orgId !== 7 || !from.includes(row.state)) return null;
      row = { ...row, ...patch, issue: patch.issue ?? null };
      return structuredClone(row);
    },
  };
  send = vi.fn<ServioWriteRequest>().mockResolvedValue({ Result: 0 });
  lookup = vi.fn<LookupPayment>().mockResolvedValue({ kind: "unpaid" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const expire = () => expireServioReservation(structuredClone(row), store, send, lookup, now);

describe("ten-minute Servio payment window", () => {
  it("does not touch a booking before its immutable deadline", async () => {
    expect((await expireServioReservation(row, store, send, lookup, now - 2000)).state).toBe("awaiting_payment");
    expect(send).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
  });
  it("does not apply new expiry rules retroactively to old controlled reservations", async () => {
    row.payment_deadline = null;
    await expire();
    expect(send).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
  });
  it("releases a never-issued checkout without querying the bank", async () => {
    row.state = "bill_ready"; row.consent = null;
    const result = await expire();
    expect(result.state).toBe("cancelled"); expect(result.issue).toBe("payment_window_expired");
    expect(lookup).not.toHaveBeenCalled();
    expect(send.mock.calls[0][2]).toBe("CancelReservation");
    expect(send.mock.calls[0][3]).toEqual({ Account: "0000000007" });
  });
  it("checks LiqPay before releasing a booking with an issued checkout", async () => {
    const result = await expire();
    expect(lookup).toHaveBeenCalledOnce(); expect(result.state).toBe("cancelled");
    expect(send).toHaveBeenCalledOnce();
  });
  it("does not send cancellation twice for concurrent expiry workers", async () => {
    await Promise.all([expire(), expire()]);
    expect(send).toHaveBeenCalledOnce(); expect(row.state).toBe("cancelled");
  });
  it.each(["pending", "network"])("does not release a booking on %s payment results", async variant => {
    if (variant === "network") lookup.mockRejectedValue(new Error("timeout"));
    else lookup.mockResolvedValue({ kind: "pending" });
    expect((await expire()).state).toBe("expiring"); expect(send).not.toHaveBeenCalled();
    expect(row.issue).toBe("expiry_payment_unresolved");
  });
  it("can finish cancellation after a subsequent definitive unpaid lookup", async () => {
    lookup.mockResolvedValueOnce({ kind: "pending" }).mockResolvedValueOnce({ kind: "unpaid" });
    await expire(); expect(row.state).toBe("expiring");
    await expire(); expect(row.state).toBe("cancelled"); expect(send).toHaveBeenCalledOnce();
  });
  it("honors a successful bank payment rather than cancelling", async () => {
    lookup.mockResolvedValue({ kind: "paid", payload: payment });
    const result = await expire();
    expect(result.state).toBe("confirmed"); expect(result.payment.amountMinor).toBe(20000);
    expect(send.mock.calls.map(c => c[2])).toEqual(["SetReservationType"]);
  });
  it("lets a concurrent successful callback win before cancellation is claimed", async () => {
    lookup.mockImplementation(async () => {
      await recordServioPayment(structuredClone(row), payment, store, send);
      return { kind: "unpaid" };
    });
    expect((await expire()).state).toBe("confirmed");
    expect(send.mock.calls.map(c => c[2])).toEqual(["SetReservationType"]);
  });
  it("records a late paid callback as manual review without re-guaranteeing a cancelled room", async () => {
    await expire();
    const result = await recordServioPayment(structuredClone(row), payment, store, send);
    expect(result.state).toBe("review"); expect(result.payment.status).toBe("success");
    expect(result.issue).toBe("paid_after_cancellation");
    expect(send.mock.calls.map(c => c[2])).toEqual(["CancelReservation"]);
  });
  it("also retains payment arriving during an uncertain cancellation", async () => {
    send.mockRejectedValueOnce(new Error("timeout"));
    await expire(); expect(row.state).toBe("review");
    const result = await recordServioPayment(structuredClone(row), payment, store, send);
    expect(result.payment.status).toBe("success"); expect(result.state).toBe("review");
    expect(send).toHaveBeenCalledOnce();
  });
  it("does not replay an ambiguous Servio cancellation", async () => {
    send.mockRejectedValue(new Error("timeout"));
    await expire(); await expire();
    expect(row.state).toBe("review"); expect(send).toHaveBeenCalledOnce();
  });
  it("blocks new checkout at the server deadline, including repeated form requests", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    await expect(checkoutServioReservation(row, store, "guest")).rejects.toThrow("payment_window_expired");
    expect(row.state).toBe("awaiting_payment");
  });
  it("uses the same UTC LiqPay expired_date and order identity on every retry", async () => {
    vi.useFakeTimers(); vi.setSystemTime(Date.parse(deadline) - 1000);
    const first = await checkoutServioReservation(row, store, "guest");
    const second = await checkoutServioReservation(row, store, "guest");
    const a = JSON.parse(Buffer.from(first.data, "base64").toString());
    const b = JSON.parse(Buffer.from(second.data, "base64").toString());
    expect(a.expired_date).toBe("2027-01-01 12:10:00");
    expect(b.expired_date).toBe(a.expired_date); expect(b.order_id).toBe(a.order_id);
    expect(reservationView(row).paymentDeadline).toBe(deadline);
  });
});

describe("read-only LiqPay reconciliation", () => {
  const respond = (payload: any) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(payload) }));
  it("signs the lookup with this reservation's tenant-owned merchant", async () => {
    respond({ status: "error", err_code: "payment_not_found" });
    expect((await lookupServioPayment(row)).kind).toBe("unpaid");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://www.liqpay.ua/api/request");
    const data = JSON.parse(Buffer.from(new URLSearchParams(String(init?.body)).get("data")!, "base64").toString());
    expect(data).toEqual({ public_key: "public-key", version: 3, action: "status", order_id: `mhd_servio_${id}` });
  });
  it.each(["processing", "3ds_verify", "wait_accept", "wait_compensation", "hold_wait", "invoice_wait"])("does not release %s funds", async status => {
    respond({ ...payment, status }); expect((await lookupServioPayment(row)).kind).toBe("pending");
  });
  it.each(["wrong_order", "wrong_merchant", "wrong_amount", "auth_error"])("rejects %s as proof of nonpayment", async variant => {
    const value: any = { ...payment, status: "failure" };
    if (variant === "wrong_order") value.order_id = "another-order";
    if (variant === "wrong_merchant") value.public_key = "another-merchant";
    if (variant === "wrong_amount") value.amount = 1;
    if (variant === "auth_error") { value.err_code = "invalid_signature"; delete value.order_id; }
    respond(value); expect((await lookupServioPayment(row)).kind).toBe("pending");
  });
  it("rejects authenticated-looking API errors and sandbox data as proof of nonpayment", async () => {
    respond({ ...payment, status: "error", err_code: "invalid_signature" });
    expect((await lookupServioPayment(row)).kind).toBe("pending");
    respond({ ...payment, status: "failure", sandbox: 1 });
    expect((await lookupServioPayment(row)).kind).toBe("pending");
  });
});
