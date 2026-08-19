export type InvoiceLine = {
  description: string;
  detail?: string;
  qty: number;
  unit: string;
  price: number;
  discount?: number;
  vatRate: 0 | 7 | 20;
  vatAmount: number;
  amount: number;
  totalPrice: number;
};

export type InvoiceTotals = {
  items: InvoiceLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function toFiniteNumber(value: unknown, fallback?: number): number {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error("Невірне числове значення позиції рахунку");
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error("Невірне числове значення позиції рахунку");
  return numeric;
}

function normalizeVatRate(value: unknown): 0 | 7 | 20 {
  if (value === undefined || value === null || value === "" || value === "exempt") return 0;
  const rate = Number(value);
  if (rate === 0 || rate === 7 || rate === 20) return rate;
  throw new Error("Ставка ПДВ може бути лише 7%, 20% або «без ПДВ»");
}

/**
 * Amounts in the invoice UI are gross: VAT is already included in the line total.
 * The server always derives VAT totals from the line totals rather than trusting
 * a client-supplied tax summary.
 */
export function calculateInvoiceTotals(input: unknown): InvoiceTotals {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("Додайте хоча б одну позицію до рахунку");
  }

  const items = input.map((raw, index): InvoiceLine => {
    if (!raw || typeof raw !== "object") {
      throw new Error(`Позиція ${index + 1} має некоректний формат`);
    }

    const line = raw as Record<string, unknown>;
    const description = String(line.description ?? line.name ?? "").trim();
    if (!description) throw new Error(`Вкажіть найменування для позиції ${index + 1}`);

    const qty = toFiniteNumber(line.qty ?? line.quantity, 1);
    const price = toFiniteNumber(line.price ?? line.unitPrice, 0);
    const discount = toFiniteNumber(line.discount, 0);
    if (qty <= 0 || price < 0 || discount < 0) {
      throw new Error(`Позиція ${index + 1} має некоректну кількість, ціну або знижку`);
    }

    const computedAmount = Math.max(0, qty * price - discount);
    const amount = roundMoney(toFiniteNumber(line.amount ?? line.totalPrice, computedAmount));
    const vatRate = normalizeVatRate(line.vatRate ?? line.vat_rate);
    const vatAmount = vatRate === 0
      ? 0
      : roundMoney(amount - amount / (1 + vatRate / 100));

    return {
      description,
      ...(line.detail ? { detail: String(line.detail) } : {}),
      qty,
      unit: String(line.unit || "послуга"),
      price: roundMoney(price),
      ...(discount > 0 ? { discount: roundMoney(discount) } : {}),
      vatRate,
      vatAmount,
      amount,
      totalPrice: amount,
    };
  });

  const total = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
  const taxAmount = roundMoney(items.reduce((sum, item) => sum + item.vatAmount, 0));

  return {
    items,
    subtotal: roundMoney(total - taxAmount),
    taxAmount,
    total,
  };
}