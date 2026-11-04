// Payment helpers for Maison HD Booking (100% non-refundable prepayment via LiqPay).
// The browser never decides that a booking is paid: only the server status endpoint does.

export const LIQPAY_CHECKOUT_URL = "https://www.liqpay.ua/api/3/checkout";

export type TariffPolicy = {
  version: string;
  prepaymentPercent: number;
  nonRefundable: boolean;
  dateChangesAllowed: boolean;
  acknowledgementText: string;
};

export function parseTariffPolicy(v: unknown): TariffPolicy | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r.version !== "string" || !r.version) return null;
  if (typeof r.acknowledgementText !== "string" || !r.acknowledgementText.trim()) return null;
  const pct = Number(r.prepaymentPercent);
  if (pct !== 100 || r.nonRefundable !== true || r.dateChangesAllowed !== false) return null;
  return { version: r.version, prepaymentPercent: 100, nonRefundable: true, dateChangesAllowed: false, acknowledgementText: r.acknowledgementText };
}

/** Booking created on the server but not yet confirmed as paid. Kept so payment can be retried without a new reservation. */
export type PendingCheckout = {
  bookingId: number; guestAccessCode: string; bookingRef: string; totalAmount: number;
  tariffPolicyVersion: string; unitName: string; propertyName: string; checkIn: string; checkOut: string; nights: number; createdAt: number;
};

const pendingKey = (slug: string) => `mhd_be_pending:${slug}`;
const returnKey = (slug: string) => `mhd_be_return:${slug}`;

function read<T>(k: string): T | null {
  try { const v = sessionStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function write(k: string, v: unknown) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
function drop(k: string) { try { sessionStorage.removeItem(k); } catch { /* ignore */ } }

export const loadPending = (slug: string) => {
  const p = read<PendingCheckout>(pendingKey(slug));
  return p && Number.isFinite(p.bookingId) && p.bookingId > 0 && typeof p.guestAccessCode === "string" && p.guestAccessCode ? p : null;
};
export const savePending = (slug: string, p: PendingCheckout) => write(pendingKey(slug), p);
export const clearPending = (slug: string) => drop(pendingKey(slug));

export type ReturnRef = { bookingId: number; code: string };
export const loadReturn = (slug: string) => {
  const r = read<ReturnRef>(returnKey(slug));
  return r && r.bookingId > 0 && r.code ? r : null;
};
export const saveReturn = (slug: string, r: ReturnRef) => write(returnKey(slug), r);
export const clearReturn = (slug: string) => drop(returnKey(slug));

/**
 * Reads payment_return params once, stores them in sessionStorage and strips them
 * (including the access code) from the address bar. Does not infer any payment outcome.
 */
export function captureReturnFromUrl(slug: string): ReturnRef | null {
  const url = new URL(window.location.href);
  if (url.searchParams.get("payment_return") !== "1") return null;
  const bookingId = Number(url.searchParams.get("bookingId"));
  const code = (url.searchParams.get("code") ?? "").trim();
  ["payment_return", "bookingId", "code"].forEach((k) => url.searchParams.delete(k));
  window.history.replaceState(window.history.state, "", url.pathname + (url.search ? url.search : "") + url.hash);
  if (!Number.isFinite(bookingId) || bookingId <= 0 || !/^[A-Za-z0-9_-]{4,64}$/.test(code)) return null;
  const ref = { bookingId, code };
  saveReturn(slug, ref);
  return ref;
}

/** Submits data/signature to LiqPay with a native POST form. Refuses any non-allowlisted URL. */
export function redirectToLiqPay(checkoutUrl: string, data: string, signature: string): boolean {
  if (checkoutUrl !== LIQPAY_CHECKOUT_URL || !data || !signature) return false;
  const form = document.createElement("form");
  form.method = "POST";
  form.action = LIQPAY_CHECKOUT_URL;
  form.acceptCharset = "utf-8";
  form.style.display = "none";
  for (const [name, value] of [["data", data], ["signature", signature]] as const) {
    const input = document.createElement("input");
    input.type = "hidden"; input.name = name; input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  return true;
}

export type PaymentStatus = {
  status: "awaiting_payment" | "paid" | "review" | "expired";
  paymentStatus: "unpaid" | "paid";
  bookingRef: string; totalAmount: number; paidAmount: number; currency: string;
};

export function parsePaymentStatus(j: unknown): PaymentStatus | null {
  if (!j || typeof j !== "object") return null;
  const r = j as Record<string, unknown>;
  const st = r.status;
  if (st !== "awaiting_payment" && st !== "paid" && st !== "review" && st !== "expired") return null;
  return {
    status: st,
    paymentStatus: r.paymentStatus === "paid" ? "paid" : "unpaid",
    bookingRef: typeof r.bookingRef === "string" ? r.bookingRef : "",
    totalAmount: Number(r.totalAmount) || 0,
    paidAmount: Number(r.paidAmount) || 0,
    currency: typeof r.currency === "string" ? r.currency : "UAH",
  };
}
