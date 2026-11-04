import { createHash, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import type { BookingServioReservation, BookingServioReservationInput, BookingServioRate } from "@workspace/api-zod";
import { encrypt, decrypt } from "./encrypt.js";
import { BOOKING_TARIFF_POLICY } from "./booking-tariff.js";
import { generateLiqPayForm, verifyLiqPayCallbackWithKey } from "./liqpay.js";
import { servioMoney } from "./servio-availability.js";
import { servioWriteRequest, type ServioWriteRequest } from "./servio-connection.js";
import { billPayload, parseServioBill, providerSuccess, reservationPayload, servioAccount, ServioRejected, type ServioBill } from "./servio-reservation-protocol.js";

export type ReservationConnection = {
  base: string; token: string; hotelId: number; publicKey: string; secretKey: string;
  propertyId: number; legalEntityId: number; mode: "live" | "test"; origin: string;
  checkInTime: string; checkOutTime: string;
  terms?: string; privacy?: string;
};
export type Attempt = {
  id: string; organization_id: number; request_id: string; request_hash: string; state: BookingServioReservation["state"];
  account: string | null; payload: { input: BookingServioReservationInput; categoryName: string; rateName: string };
  connection: string; bill: ServioBill | null; consent: any; payment: any; issue: string | null; created_at: Date | string; updated_at: Date | string;
};
export type AttemptPatch = { state: Attempt["state"]; account?: string; bill?: ServioBill; consent?: any; payment?: any; issue?: string };
export interface AttemptStore {
  insert(row: Attempt): Promise<{ row: Attempt; inserted: boolean }>;
  get(id: string, orgId: number): Promise<Attempt | null>;
  transition(id: string, orgId: number, from: Attempt["state"][], patch: AttemptPatch): Promise<Attempt | null>;
}
export const attemptStore: AttemptStore = {
  async insert(row) {
    const inserted = (await pool.query(`INSERT INTO servio_booking_attempts
      (id,organization_id,request_id,request_hash,state,payload,connection)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
      ON CONFLICT (organization_id,request_id) DO NOTHING RETURNING *`,
      [row.id, row.organization_id, row.request_id, row.request_hash, row.state, JSON.stringify(row.payload), row.connection])).rows[0];
    if (inserted) return { row: inserted, inserted: true };
    const existing = (await pool.query("SELECT * FROM servio_booking_attempts WHERE organization_id=$1 AND request_id=$2", [row.organization_id, row.request_id])).rows[0];
    if (!existing || existing.request_hash !== row.request_hash) throw new Error("request_conflict");
    return { row: existing, inserted: false };
  },
  async get(id, orgId) {
    return (await pool.query("SELECT * FROM servio_booking_attempts WHERE id=$1 AND organization_id=$2", [id, orgId])).rows[0] ?? null;
  },
  async transition(id, orgId, from, patch) {
    return (await pool.query(`UPDATE servio_booking_attempts SET state=$4,
      account=coalesce($5,account),bill=coalesce($6::jsonb,bill),consent=coalesce($7::jsonb,consent),
      payment=coalesce($8::jsonb,payment),issue=$9,updated_at=now()
      WHERE id=$1 AND organization_id=$2 AND state=ANY($3::text[]) RETURNING *`,
      [id, orgId, from, patch.state, patch.account ?? null, patch.bill ? JSON.stringify(patch.bill) : null,
        patch.consent ? JSON.stringify(patch.consent) : null, patch.payment ? JSON.stringify(patch.payment) : null, patch.issue ?? null])).rows[0] ?? null;
  },
};
const messages: Record<string, string> = {
  creating: "Запит створення бронювання відправляється. Не створюйте іншу спробу для того самого гостя.",
  billing: "Бронь створено; Servio готує остаточні нарахування.",
  bill_ready: "Остаточний рахунок отримано. Перевірте суму й окремо підтвердьте умови перед переходом до оплати.",
  awaiting_payment: "Платіжне посилання сформовано. Повернення з LiqPay не означає, що оплату підтверджено.",
  confirming: "LiqPay підтвердив оплату. Передаємо гарантування в Servio; не повторюйте оплату.",
  confirmed: "LiqPay підтвердив 100% оплати, Servio прийняв гарантування бронювання.",
  review: "Потрібна ручна звірка. Не повторюйте бронювання або оплату автоматично.",
  failed: "Servio явно відхилив створення бронювання. Платіжне посилання не створене.",
  cancelling: "Надіслано запит скасування. Не повторюйте його до звірки результату.",
  cancelled: "Servio підтвердив скасування. Платіжне посилання в цій спробі не формується.",
};
export function attemptConnection(row: Attempt): ReservationConnection {
  const plain = decrypt(row.connection);
  if (!plain) throw new Error("connection_unavailable");
  return JSON.parse(plain);
}
export function reservationView(row: Attempt): BookingServioReservation {
  const stale = ["creating", "billing", "confirming", "cancelling"].includes(row.state) && Date.now() - new Date(row.updated_at).getTime() > 120_000;
  return {
    id: row.id, requestId: row.request_id, state: stale ? "review" : row.state,
    message: row.issue === "sandbox_payment" ? "LiqPay повернув тестову оплату. Реальні кошти не отримано; гарантування Servio не виконувалося."
      : stale ? "Операція перервалася або ще не завершена. Потрібна звірка із Servio; автоматично запит не повторюється." : messages[row.state],
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
    categoryName: row.payload.categoryName, rateName: row.payload.rateName,
    checkIn: row.payload.input.checkIn, checkOut: row.payload.input.checkOut,
    total: row.bill ? row.bill.totalMinor / 100 : null, currency: "UAH", account: row.account,
    mode: attemptConnection(row).mode, policyVersion: BOOKING_TARIFF_POLICY.version,
    acknowledgementText: BOOKING_TARIFF_POLICY.acknowledgementText,
  };
}
export function hashReservationRequest(input: BookingServioReservationInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
/** Each provider mutation is preceded by a committed state transition. Never retry an ambiguous result. */
export async function createServioReservation(
  orgId: number, input: BookingServioReservationInput, connection: ReservationConnection,
  categoryName: string, rate: BookingServioRate, store: AttemptStore = attemptStore, send: ServioWriteRequest = servioWriteRequest,
): Promise<Attempt> {
  const id = randomUUID(), now = new Date();
  const candidate: Attempt = {
    id, organization_id: orgId, request_id: input.requestId, request_hash: hashReservationRequest(input),
    state: "creating", account: null, payload: { input, categoryName, rateName: rate.name },
    connection: encrypt(JSON.stringify(connection))!, bill: null, consent: null, payment: null, issue: null,
    created_at: now, updated_at: now,
  };
  const inserted = await store.insert(candidate);
  if (!inserted.inserted) return inserted.row;
  let row = inserted.row;
  let step: "creating" | "billing" = "creating";
  try {
    const created = providerSuccess(await send(connection.base, connection.token, "AddRoomReservation",
      reservationPayload(input, connection.hotelId, connection.checkInTime, connection.checkOutTime, id)));
    // AddRoomReservation returns an integer; accepting strings here would hide
    // a protocol mismatch and make recovery unsafe.
    if (!Number.isSafeInteger(created.Account)) throw new Error("invalid_create_account");
    const account = servioAccount(created.Account);
    const billing = await store.transition(id, orgId, ["creating"], { state: "billing", account });
    if (!billing) throw new Error("transition_failed");
    row = billing; step = "billing";
    const bill = parseServioBill(await send(connection.base, connection.token, "SetReservationBill",
      billPayload(account, rate, input.checkIn)), account, input.checkIn, input.checkOut);
    const ready = await store.transition(id, orgId, ["billing"], { state: "bill_ready", bill });
    if (!ready) throw new Error("transition_failed");
    return ready;
  } catch (error) {
    return await store.transition(id, orgId, [step], {
      state: step === "creating" && error instanceof ServioRejected ? "failed" : "review",
      issue: step === "creating" ? "create_not_confirmed" : "bill_not_confirmed",
    }) ?? row;
  }
}
export async function checkoutServioReservation(row: Attempt, store: AttemptStore = attemptStore) {
  if (!row.bill || !["bill_ready", "awaiting_payment"].includes(row.state)) throw new Error("not_payable");
  const connection = attemptConnection(row);
  if (!row.consent) {
    const updated = await store.transition(row.id, row.organization_id, ["bill_ready"], {
      state: "awaiting_payment", consent: {
        ...BOOKING_TARIFF_POLICY, acceptedAt: new Date().toISOString(), amountMinor: row.bill.totalMinor,
        legalEntityId: connection.legalEntityId, propertyId: connection.propertyId, hotelId: connection.hotelId,
        hotelTerms: connection.terms ?? "", hotelPrivacy: connection.privacy ?? "",
      },
    });
    if (!updated) {
      const current = await store.get(row.id, row.organization_id);
      if (!current || current.state !== "awaiting_payment" || !current.consent) throw new Error("not_payable");
      row = current;
    } else row = updated;
  }
  const form = generateLiqPayForm({
    action: "pay", amount: row.bill!.totalMinor / 100, currency: "UAH",
    orderId: `mhd_servio_${row.id}`, description: `Maison HD Servio ${row.account}: 100% передоплата`,
    publicKey: connection.publicKey, privateKey: connection.secretKey,
    resultUrl: `${connection.origin}/booking-studio`,
    serverUrl: `${connection.origin}/api/public/booking-engine/servio/payment-callback`,
  });
  return { reservation: reservationView(row), ...form };
}
export function validServioCallback(row: Attempt, data: string, signature: string, payload: any): boolean {
  const connection = attemptConnection(row);
  return payload?.order_id === `mhd_servio_${row.id}` && payload.public_key === connection.publicKey
    && verifyLiqPayCallbackWithKey(data, signature, connection.secretKey);
}
export async function recordServioPayment(
  row: Attempt, payment: any, store: AttemptStore = attemptStore, send: ServioWriteRequest = servioWriteRequest,
): Promise<Attempt> {
  if (["reversed", "refund"].includes(payment.status)) {
    return await store.transition(row.id, row.organization_id, ["confirmed", "confirming", "awaiting_payment"], {
      state: "review", payment: { ...row.payment, refundStatus: payment.status }, issue: "payment_reversed",
    }) ?? row;
  }
  const connection = attemptConnection(row);
  if (connection.mode === "test" && ["sandbox", "success"].includes(payment.status)) {
    return await store.transition(row.id, row.organization_id, ["awaiting_payment"], {
      state: "review", payment: { status: "sandbox" }, issue: "sandbox_payment",
    }) ?? row;
  }
  if (payment.status !== "success") return row;
  const amount = typeof payment.amount === "number" || typeof payment.amount === "string" ? servioMoney(payment.amount) : NaN;
  if (!row.bill || !row.consent || payment.currency !== "UAH" || !Number.isFinite(amount)
    || Math.round(amount * 100) !== row.bill.totalMinor || ["1", 1, true].includes(payment.sandbox))
    throw new Error("payment_mismatch");
  const paymentId = String(payment.payment_id ?? "");
  if (!/^[0-9]{1,40}$/.test(paymentId)) throw new Error("invalid_payment_identity");
  if (row.payment?.paymentId && row.payment.paymentId !== paymentId) {
    return await store.transition(row.id, row.organization_id, ["confirmed", "confirming", "review"], {
      state: "review", payment: { ...row.payment, additionalPaymentId: paymentId }, issue: "additional_payment",
    }) ?? row;
  }
  if (["confirmed", "confirming", "review"].includes(row.state)) return row;
  const rrn = typeof payment.rrn === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(payment.rrn) ? payment.rrn : null;
  const claimed = await store.transition(row.id, row.organization_id, ["awaiting_payment"], {
    state: rrn ? "confirming" : "review",
    payment: { status: "success", paymentId, rrn, amountMinor: row.bill.totalMinor, receivedAt: new Date().toISOString() },
    ...(rrn ? {} : { issue: "rrn_missing" }),
  });
  if (!claimed || !rrn) return claimed ?? (await store.get(row.id, row.organization_id)) ?? row;
  try {
    providerSuccess(await send(connection.base, connection.token, "SetReservationType", {
      Account: row.account, Amount: row.bill.firstDayAmount, RRN: rrn, Services: row.bill.services,
    }));
    return await store.transition(row.id, row.organization_id, ["confirming"], { state: "confirmed" }) ?? claimed;
  } catch {
    return await store.transition(row.id, row.organization_id, ["confirming"], {
      state: "review", issue: "confirmation_not_confirmed",
    }) ?? claimed;
  }
}
export async function cancelServioReservation(row: Attempt, store: AttemptStore = attemptStore, send: ServioWriteRequest = servioWriteRequest) {
  // Never cancel a live reservation after a payment link has been issued:
  // a payment could be in flight even without a delivered callback.
  if (row.state !== "bill_ready" || !row.account) throw new Error("not_cancellable");
  const claimed = await store.transition(row.id, row.organization_id, ["bill_ready"], { state: "cancelling" });
  if (!claimed) throw new Error("not_cancellable");
  const connection = attemptConnection(row);
  try {
    providerSuccess(await send(connection.base, connection.token, "CancelReservation", { Account: row.account }));
    return await store.transition(row.id, row.organization_id, ["cancelling"], { state: "cancelled" }) ?? claimed;
  } catch {
    return await store.transition(row.id, row.organization_id, ["cancelling"], {
      state: "review", issue: "cancellation_not_confirmed",
    }) ?? claimed;
  }
}
