import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ServioWriteRequest } from "../lib/servio-connection.js";
import { createHash } from "node:crypto";
vi.mock("@workspace/db", () => ({ pool: { query: vi.fn() } }));
import {
  createServioReservation, checkoutServioReservation, recordServioPayment, cancelServioReservation,
  validServioCallback, reservationView, type Attempt, type AttemptStore, type ReservationConnection,
} from "../lib/servio-reservations.js";
import { servioAccount, parseServioBill, reservationPayload } from "../lib/servio-reservation-protocol.js";
import { BOOKING_TARIFF_POLICY } from "../lib/booking-tariff.js";

const input: any = {
  checkIn: "2026-12-01", checkOut: "2026-12-03", adults: 2, childAges: [6], useExtraBed: true,
  companyId: 0, companyCodeId: 0, conditionId: 0, categoryId: 11, priceListId: 90, rateConditionId: 1, propertyId: 4,
  requestId: "00000000-0000-4000-8000-000000000001", firstName: "Test", lastName: "Guest", phone: "+380000000000", email: "test@example.invalid",
  expectedTotal: 200, authorizeProviderWrite: true, agreeTerms: true, agreeNonRefundable: true, tariffPolicyVersion: BOOKING_TARIFF_POLICY.version,
};
const connection: ReservationConnection = {
  base: "https://example.servio.support/ReservationService_1_10", token: "fixture-token",
  hotelId: 7, publicKey: "fixture-public", secretKey: "fixture-secret", propertyId: 4, legalEntityId: 8,
  mode: "live", origin: "https://example.invalid", checkInTime: "14:00", checkOutTime: "12:00",
};
const rate: any = { priceListId: 90, conditionId: 1, name: "NR", nonRefundable: true, saleAllowed: true,
  total: 200, charges: [
    { serviceId: 10, serviceName: "Stay", date: "2026-12-01", amount: 100 },
    { serviceId: 10, serviceName: "Stay", date: "2026-12-02", amount: 100 },
  ] };
const finalBill = () => ({
  Result: 0, Account: "0000000123", Amount: "110.00",
  Services: [{ ServiceID: 10, ServiceName: "Stay", ServiceCode: 1, ServiceSystemCode: "stay", ServiceTypeName: "",
    PriceDates: [
      { Date: "2026-12-01 14:00:00", Price: "110.00", CustomerAccount: "0000000123" },
      { Date: "2026-12-02 14:00:00", Price: 115, CustomerAccount: "0000000123" },
    ] }],
});
function memoryStore() {
  const rows = new Map<string, Attempt>();
  const store: AttemptStore = {
    async insert(row) {
      const existing = [...rows.values()].find(r => r.organization_id === row.organization_id && r.request_id === row.request_id);
      if (existing) {
        if (existing.request_hash !== row.request_hash) throw new Error("request_conflict");
        return { row: structuredClone(existing), inserted: false };
      }
      rows.set(row.id, structuredClone(row));
      return { row: structuredClone(row), inserted: true };
    },
    async get(id, orgId) { const row = rows.get(id); return row?.organization_id === orgId ? structuredClone(row) : null; },
    async transition(id, orgId, from, patch) {
      const row = rows.get(id);
      if (!row || row.organization_id !== orgId || !from.includes(row.state)) return null;
      const updated = { ...row, ...patch, updated_at: new Date() };
      rows.set(id, structuredClone(updated)); return structuredClone(updated);
    },
  };
  return { store, rows };
}
let store: AttemptStore;
let send: Mock<ServioWriteRequest>;
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-only-session-secret-more-than-32-bytes");
  ({ store } = memoryStore());
  send = vi.fn<ServioWriteRequest>().mockResolvedValueOnce({ Result: 0, Account: 123 }).mockResolvedValueOnce(finalBill());
});
const create = () => createServioReservation(7, input, connection, "House", rate, store, send);
const payment = { status: "success", currency: "UAH", amount: "225.00", payment_id: 999, rrn: "123456789" };
async function payable() {
  const row = await create();
  await checkoutServioReservation(row, store);
  return (await store.get(row.id, 7))!;
}
describe("durable Servio controlled booking workflow", () => {
  it("creates once, stores account before billing and uses final service charges, not the search total", async () => {
    const row = await create();
    expect(row).toMatchObject({ state: "bill_ready", account: "0000000123", bill: { totalMinor: 22500, firstDayAmount: 110 } });
    expect(send.mock.calls.map(call => call[2])).toEqual(["AddRoomReservation", "SetReservationBill"]);
    expect(send.mock.calls[0][3]).toMatchObject({ RoomTypeID: 11, ContractConditionID: 1, CompanyID: 0, PaidType: 200, ChildAges: [6] });
    expect(send.mock.calls[1][3]).toMatchObject({ Account: "0000000123", Amount: 100 });
    expect(row.connection).not.toContain("fixture-secret");
    expect(row.connection).not.toContain("fixture-token");
    expect(row.consent).toBeNull();
  });
  it("deduplicates simultaneous submits and never performs the provider writes twice", async () => {
    const rows = await Promise.all([create(), create()]);
    expect(rows[0].id).toBe(rows[1].id);
    expect(send).toHaveBeenCalledTimes(2);
    await create();
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("rejects reuse of a request identity for another guest or selection", async () => {
    await create();
    await expect(createServioReservation(7, { ...input, categoryId: 12 }, connection, "House", rate, store, send)).rejects.toThrow("request_conflict");
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("does not retry an ambiguous create or lose its durable review state", async () => {
    send.mockReset().mockRejectedValue(new Error("timeout"));
    expect((await create()).state).toBe("review");
    expect((await create()).state).toBe("review");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("retains the known account when bill formation is uncertain", async () => {
    send.mockReset().mockResolvedValueOnce({ Result: 0, Account: 123 }).mockRejectedValueOnce(new Error("timeout"));
    const row = await create();
    expect(row).toMatchObject({ state: "review", account: "0000000123", bill: null });
    await expect(checkoutServioReservation(row, store)).rejects.toThrow("not_payable");
    await create(); expect(send).toHaveBeenCalledTimes(2);
  });
  it("does not accept an unvalidated account from create", async () => {
    send.mockReset().mockResolvedValue({ Result: 0, Account: "0000000123" });
    expect((await create()).state).toBe("review");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("distinguishes an explicit create rejection from a timeout", async () => {
    send.mockReset().mockResolvedValue({ Result: 1 });
    expect((await create()).state).toBe("failed");
  });
  it("forms a 100% final-bill payment and records exact consent and seller identity", async () => {
    const row = await create();
    const checkout = await checkoutServioReservation(row, store);
    const decoded = JSON.parse(Buffer.from(checkout.data, "base64").toString("utf8"));
    expect(decoded).toMatchObject({
      amount: 225, currency: "UAH", order_id: `mhd_servio_${row.id}`,
      result_url: "https://example.invalid/booking-studio",
      server_url: "https://example.invalid/api/public/booking-engine/servio/payment-callback",
      public_key: "fixture-public",
    });
    expect(checkout.reservation.state).toBe("awaiting_payment");
    const saved = (await store.get(row.id, 7))!;
    expect(saved.consent).toMatchObject({ version: BOOKING_TARIFF_POLICY.version, amountMinor: 22500,
      prepaymentPercent: 100, legalEntityId: 8, propertyId: 4, hotelId: 7, acknowledgementText: BOOKING_TARIFF_POLICY.acknowledgementText });
    const again = await checkoutServioReservation(saved, store);
    expect(again.data).toBe(checkout.data); expect(again.signature).toBe(checkout.signature);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("never marks payment from the return URL or creation/checkout alone", async () => {
    const row = await payable();
    expect(row.state).toBe("awaiting_payment"); expect(row.payment).toBeNull();
    expect(send.mock.calls.every(call => call[2] !== "SetReservationType")).toBe(true);
  });
  it("requires a valid signature and exact order and merchant from immutable credentials", async () => {
    const row = await payable();
    const payload = { ...payment, order_id: `mhd_servio_${row.id}`, public_key: "fixture-public" };
    const data = Buffer.from(JSON.stringify(payload)).toString("base64");
    const signature = createHash("sha1").update("fixture-secret" + data + "fixture-secret").digest("base64");
    expect(validServioCallback(row, data, signature, payload)).toBe(true);
    expect(validServioCallback(row, data, signature, { ...payload, public_key: "foreign-seller" })).toBe(false);
    expect(validServioCallback(row, data, signature, { ...payload, order_id: "another-order" })).toBe(false);
    expect(validServioCallback(row, data, "attacker", payload)).toBe(false);
  });
  it.each([{ ...payment, amount: 200 }, { ...payment, currency: "EUR" }, { ...payment, sandbox: "1" }])("blocks mismatched signed money before any guarantee %j", async payload => {
    const row = await payable(); send.mockReset();
    await expect(recordServioPayment(row, payload, store, send)).rejects.toThrow("payment_mismatch");
    expect(send).not.toHaveBeenCalled(); expect((await store.get(row.id, 7))?.state).toBe("awaiting_payment");
  });
  it("sends the first-day Amount separately from all final Services after real 100% payment", async () => {
    const row = await payable(); send.mockReset().mockResolvedValue({ Result: 0 });
    const result = await recordServioPayment(row, payment, store, send);
    expect(result.state).toBe("confirmed");
    expect(result.payment).toMatchObject({ amountMinor: 22500, paymentId: "999", rrn: payment.rrn });
    expect(send).toHaveBeenCalledWith(connection.base, connection.token, "SetReservationType", {
      Account: "0000000123", Amount: 110, RRN: payment.rrn, Services: row.bill!.services,
    });
    await recordServioPayment(result, payment, store, send);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("serializes simultaneous payment callbacks using a persisted claim", async () => {
    const row = await payable(); send.mockReset().mockResolvedValue({ Result: 0 });
    await Promise.all([recordServioPayment(row, payment, store, send), recordServioPayment(row, payment, store, send)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await store.get(row.id, 7))?.state).toBe("confirmed");
  });
  it("retains received money but never resends a timed-out confirmation", async () => {
    const row = await payable(); send.mockReset().mockRejectedValue(new Error("timeout"));
    const reviewed = await recordServioPayment(row, payment, store, send);
    expect(reviewed).toMatchObject({ state: "review", payment: { status: "success", amountMinor: 22500 } });
    await recordServioPayment(reviewed, payment, store, send);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("retains a genuine payment without inventing an RRN or claiming confirmation", async () => {
    const row = await payable(); send.mockReset();
    const reviewed = await recordServioPayment(row, { ...payment, rrn: "" }, store, send);
    expect(reviewed).toMatchObject({ state: "review", issue: "rrn_missing", payment: { amountMinor: 22500 } });
    expect(send).not.toHaveBeenCalled();
  });
  it("never guarantees a real Servio account on a sandbox callback", async () => {
    const row = await createServioReservation(7, input, { ...connection, mode: "test", publicKey: "sandbox_fixture" }, "House", rate, store, send);
    await checkoutServioReservation(row, store);
    const payableRow = (await store.get(row.id, 7))!; send.mockReset();
    const updated = await recordServioPayment(payableRow, { ...payment, status: "sandbox" }, store, send);
    expect(updated).toMatchObject({ state: "review", issue: "sandbox_payment" });
    expect(reservationView(updated).message).toContain("Реальні кошти не отримано");
    expect(send).not.toHaveBeenCalled();
  });
  it("never cancels after a live checkout link has been issued", async () => {
    const row = await payable(); send.mockReset();
    await expect(cancelServioReservation(row, store, send)).rejects.toThrow("not_cancellable");
    expect(send).not.toHaveBeenCalled();
  });
  it("claims cancellation before the provider call and does not make the account payable again", async () => {
    const row = await create(); send.mockReset().mockResolvedValue({ Result: 0 });
    const cancelled = await cancelServioReservation(row, store, send);
    expect(cancelled.state).toBe("cancelled");
    expect(send).toHaveBeenCalledWith(connection.base, connection.token, "CancelReservation", { Account: "0000000123" });
    await expect(checkoutServioReservation(row, store)).rejects.toThrow("not_payable");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("puts uncertain cancellation in review, with no automatic retry", async () => {
    const row = await create(); send.mockReset().mockRejectedValue(new Error("timeout"));
    const reviewed = await cancelServioReservation(row, store, send);
    expect(reviewed.state).toBe("review");
    await expect(cancelServioReservation(reviewed, store, send)).rejects.toThrow("not_cancellable");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("flags a different signed transaction for the same order instead of guaranteeing twice", async () => {
    const row = await payable(); send.mockReset().mockResolvedValue({ Result: 0 });
    const confirmed = await recordServioPayment(row, payment, store, send);
    const reviewed = await recordServioPayment(confirmed, { ...payment, payment_id: 1000 }, store, send);
    expect(reviewed).toMatchObject({ state: "review", payment: { additionalPaymentId: "1000" } });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("flags refunds without losing the original received-payment identity", async () => {
    const row = await payable(); send.mockReset().mockResolvedValue({ Result: 0 });
    const confirmed = await recordServioPayment(row, payment, store, send);
    const reviewed = await recordServioPayment(confirmed, { status: "reversed" }, store, send);
    expect(reviewed).toMatchObject({ state: "review", payment: { paymentId: "999", refundStatus: "reversed" } });
  });
  it("keeps the public journal free of keys, contacts and payloads", async () => {
    const row = await create();
    const json = JSON.stringify(reservationView(row));
    expect(json).not.toMatch(/fixture-|test@example|000000000000|connection|firstName|phone/);
    const stale = reservationView({ ...row, state: "confirming", updated_at: new Date(Date.now() - 180_000) });
    expect(stale.state).toBe("review");
  });
});
describe("strict Servio protocol parsing", () => {
  it("does not conflate the account or company/query condition namespaces", () => {
    expect(servioAccount(123)).toBe("0000000123");
    expect(() => servioAccount("123")).toThrow();
    expect(() => servioAccount("A000000123")).toThrow();
    expect(reservationPayload(input, 7, "14:00", "12:00", "reference")).toMatchObject({ ContractConditionID: 1, CompanyID: 0, PriceListID: 90 });
  });
  it.each([
    (b: any) => { b.Account = "0000000124"; },
    (b: any) => { b.Services[0].PriceDates[0].CustomerAccount = "0000000124"; },
    (b: any) => { b.Services[0].PriceDates[0].Price = "110,00"; },
    (b: any) => { b.Services[0].PriceDates[0].Date = "2027-01-01"; },
    (b: any) => { b.Services = []; },
    (b: any) => { b.Result = 1; },
  ])("rejects malformed or foreign final bill data", mutate => {
    const bill = finalBill(); mutate(bill);
    expect(() => parseServioBill(bill, "0000000123", input.checkIn, input.checkOut)).toThrow();
  });
});
