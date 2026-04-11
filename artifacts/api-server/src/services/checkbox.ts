/**
 * Checkbox.ua ПРРО API Service
 * Docs: https://docs.checkbox.ua/
 */

const CHECKBOX_API = "https://api.checkbox.in.ua/api/v1";

export type CheckboxCredentials = {
  login: string;
  password: string;
  licenseKey: string;
};

export type CheckboxGood = {
  code: string;         // internal item code
  name: string;
  price: number;        // in kopecks (e.g. 10000 = 100.00 UAH)
  quantity: number;     // in milliunits (e.g. 1000 = 1 unit)
  taxCode?: string;     // "A" (ПДВ 20%), "Б" (ПДВ 7%), "В" (без ПДВ), "Г" (акциз)
  uktzed?: string;
  exciseBarcode?: string;
};

export type CheckboxPayment = {
  type: "CASH" | "CASHLESS";
  value: number;        // in kopecks
};

// ── Map VAT rate to Checkbox tax code ─────────────────────────────────────────
export function vatToTaxCode(vatRate: number | string | null, isAlcohol?: boolean): string {
  if (isAlcohol) return "Г";  // акциз
  const v = Number(vatRate ?? 20);
  if (v === 20) return "А";
  if (v === 7)  return "Б";
  return "В";  // 0% / без ПДВ
}

// ── Authenticate cashier ──────────────────────────────────────────────────────
export async function checkboxSignin(creds: CheckboxCredentials): Promise<string> {
  const r = await fetch(`${CHECKBOX_API}/cashier/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: creds.login, password: creds.password }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(`Checkbox signin failed: ${e.message || r.status}`);
  }
  const d = await r.json();
  return d.access_token as string;
}

// ── Get or open shift ─────────────────────────────────────────────────────────
export async function ensureShiftOpen(token: string, licenseKey: string): Promise<string> {
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "X-License-Key": licenseKey,
  };

  // Check current shift
  const shiftR = await fetch(`${CHECKBOX_API}/cashier/shift`, { headers });
  if (shiftR.ok) {
    const shift = await shiftR.json();
    if (shift?.status === "OPENED") return shift.id as string;
  }

  // Open new shift
  const openR = await fetch(`${CHECKBOX_API}/shifts`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  if (!openR.ok) {
    const e = await openR.json().catch(() => ({}));
    throw new Error(`Cannot open Checkbox shift: ${e.message || openR.status}`);
  }
  const s = await openR.json();
  return s.id as string;
}

// ── Create fiscal receipt ─────────────────────────────────────────────────────
export async function createFiscalReceipt(
  creds: CheckboxCredentials,
  goods: CheckboxGood[],
  payments: CheckboxPayment[],
  tipAmount = 0
): Promise<{ id: string; receiptUrl: string; qrUrl: string; fiscalNumber?: string }> {

  const token    = await checkboxSignin(creds);
  await ensureShiftOpen(token, creds.licenseKey);

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "X-License-Key": creds.licenseKey,
  };

  const body: any = {
    goods: goods.map(g => ({
      good: {
        code:     g.code,
        name:     g.name,
        price:    g.price,
        ...(g.taxCode ? { taxes: [{ code: g.taxCode, label: "", symbol: g.taxCode, rate: 0, extra_rate: 0, included: true }] } : {}),
        ...(g.uktzed  ? { uktzed_commodity_code: g.uktzed } : {}),
      },
      quantity: g.quantity,
    })),
    payments,
  };

  // Add tip as a separate line item if present
  if (tipAmount > 0) {
    body.rounding_amount = 0;
    body.delivery = tipAmount;  // Checkbox supports "delivery" field for tips/service charge
  }

  const r = await fetch(`${CHECKBOX_API}/receipts/sell`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(`Checkbox receipt failed: ${e.message || JSON.stringify(e) || r.status}`);
  }

  const receipt = await r.json();
  const id = receipt.id as string;

  return {
    id,
    receiptUrl: `https://receipt.checkbox.ua/${id}`,
    qrUrl:      `https://receipt.checkbox.ua/${id}/qrcode`,
    fiscalNumber: receipt.fiscal_code || receipt.id,
  };
}

// ── Build goods from POS order items ─────────────────────────────────────────
export function buildCheckboxGoods(items: any[]): CheckboxGood[] {
  return items.map(it => ({
    code:     String(it.item_id || it.id || "0"),
    name:     it.name || "Позиція",
    price:    Math.round(Number(it.price ?? 0) * 100),          // UAH → kopecks
    quantity: Math.round(Number(it.quantity ?? 1) * 1000),      // units → milliUnits
    taxCode:  vatToTaxCode(it.vat_rate ?? 20, it.is_alcohol),
    uktzed:   it.uktzed_code || undefined,
  }));
}

// ── Convert payment method to Checkbox type ───────────────────────────────────
export function toCheckboxPaymentType(method: string): "CASH" | "CASHLESS" {
  return method === "cash" ? "CASH" : "CASHLESS";
}
