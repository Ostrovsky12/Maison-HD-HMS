import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import {
  attemptConnection, attemptStore, recordServioPayment, type Attempt, type AttemptStore,
} from "./servio-reservations.js";
import { servioMoney } from "./servio-availability.js";
import { servioWriteRequest, type ServioWriteRequest } from "./servio-connection.js";
import { providerSuccess } from "./servio-reservation-protocol.js";

export type PaymentLookup = { kind: "unpaid" } | { kind: "pending" } | { kind: "paid"; payload: any };
export type LookupPayment = (row: Attempt) => Promise<PaymentLookup>;

/** A signed, read-only merchant lookup. Unknown/network/in-flight results NEVER release a room. */
export const lookupServioPayment: LookupPayment = async row => {
  const connection = attemptConnection(row), orderId = `mhd_servio_${row.id}`;
  const data = Buffer.from(JSON.stringify({
    public_key: connection.publicKey, version: 3, action: "status", order_id: orderId,
  })).toString("base64");
  const signature = createHash("sha1").update(connection.secretKey + data + connection.secretKey).digest("base64");
  const response = await fetch("https://www.liqpay.ua/api/request", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data, signature }).toString(),
  });
  if (!response.ok) return { kind: "pending" };
  const text = await response.text();
  if (text.length > 32_000) return { kind: "pending" };
  const payload = JSON.parse(text);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { kind: "pending" };
  if ((payload.order_id != null && payload.order_id !== orderId)
    || (payload.public_key != null && payload.public_key !== connection.publicKey)) return { kind: "pending" };
  if (["invalid_signature", "err_signature", "err_auth", "public_key_not_found"].includes(payload.err_code)
    || ["1", 1, true].includes(payload.sandbox)) return { kind: "pending" };
  // expired_date prevents an old checkout form from initiating another payment.
  // Do not interpret other API errors (authentication/outage/etc.) as "unpaid".
  if (payload.err_code === "payment_not_found" && payload.status === "error") return { kind: "unpaid" };
  if (payload.order_id !== orderId || payload.public_key !== connection.publicKey) return { kind: "pending" };
  const amount = servioMoney(payload.amount);
  if (!row.bill || payload.currency !== "UAH" || Math.round(amount * 100) !== row.bill.totalMinor)
    return { kind: "pending" };
  if (payload.status === "success") return { kind: "paid", payload };
  if (["failure", "reversed"].includes(payload.status)) return { kind: "unpaid" };
  return { kind: "pending" };
};

/** Only new public bookings get an immutable deadline; older controlled attempts are untouched. */
export async function expireServioReservation(
  row: Attempt, store: AttemptStore = attemptStore, send: ServioWriteRequest = servioWriteRequest,
  lookup: LookupPayment = lookupServioPayment, now = Date.now(),
): Promise<Attempt> {
  if (row.payload.source !== "public_booking" || !row.payment_deadline || !row.account
    || new Date(row.payment_deadline).getTime() > now || row.payment?.status === "success"
    || !["bill_ready", "awaiting_payment", "expiring"].includes(row.state)) return row;

  let current = row;
  if (row.state !== "bill_ready") {
    const claimed = await store.transition(row.id, row.organization_id, ["awaiting_payment", "expiring"], { state: "expiring" });
    if (!claimed) return (await store.get(row.id, row.organization_id)) ?? row;
    current = claimed;
    let status: PaymentLookup;
    try { status = await lookup(current); } catch { status = { kind: "pending" }; }
    if (status.kind === "paid") return recordServioPayment(current, status.payload, store, send);
    if (status.kind !== "unpaid") {
      return await store.transition(row.id, row.organization_id, ["expiring"], {
        state: "expiring", issue: "expiry_payment_unresolved",
      }) ?? (await store.get(row.id, row.organization_id)) ?? current;
    }
  }
  const cancelling = await store.transition(row.id, row.organization_id,
    current.state === "bill_ready" ? ["bill_ready"] : ["expiring"], {
      state: "cancelling", issue: "payment_window_expired",
    });
  if (!cancelling) return (await store.get(row.id, row.organization_id)) ?? current;
  const connection = attemptConnection(cancelling);
  try {
    providerSuccess(await send(connection.base, connection.token, "CancelReservation", { Account: cancelling.account }));
    return await store.transition(row.id, row.organization_id, ["cancelling"], {
      state: "cancelled", issue: "payment_window_expired",
    }) ?? (await store.get(row.id, row.organization_id)) ?? cancelling;
  } catch {
    // An uncertain cancellation is never automatically replayed.
    return await store.transition(row.id, row.organization_id, ["cancelling"], {
      state: "review", issue: "expiry_cancellation_unconfirmed",
    }) ?? (await store.get(row.id, row.organization_id)) ?? cancelling;
  }
}

export function startServioPaymentExpiry() {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const rows = (await pool.query(`SELECT * FROM servio_booking_attempts
        WHERE payment_deadline<=now() AND state IN ('bill_ready','awaiting_payment','expiring')
          AND payload->>'source'='public_booking'
          AND account IS NOT NULL AND coalesce(payment->>'status','')<>'success'
          AND updated_at<now()-interval '15 seconds'
        ORDER BY updated_at,payment_deadline LIMIT 20`)).rows;
      for (const row of rows) {
        try { await expireServioReservation(row); }
        catch { logger.warn({ organizationId: row.organization_id, attemptId: row.id }, "Servio expiry requires reconciliation"); }
      }
    } catch { logger.warn("Servio payment expiry worker unavailable; no bookings were released"); }
    finally { busy = false; }
  };
  setInterval(() => void tick(), 15_000).unref();
  void tick();
}
