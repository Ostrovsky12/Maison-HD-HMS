import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals } from "../lib/invoice-totals.js";

describe("calculateInvoiceTotals", () => {
  it("keeps multiple gross lines and derives VAT separately for 7%, 20%, and exempt services", () => {
    const result = calculateInvoiceTotals([
      { description: "Послуга тимчасового розміщення", qty: 1, unit: "послуга", price: 5000, vatRate: 7 },
      { description: "Оренда велосипеда", qty: 1, unit: "послуга", price: 400, vatRate: 20 },
      { description: "Туристичний збір", qty: 1, unit: "послуга", price: 42.98, vatRate: 0 },
    ]);

    expect(result.total).toBe(5442.98);
    expect(result.taxAmount).toBe(393.77);
    expect(result.subtotal).toBe(5049.21);
    expect(result.items.map(item => item.vatAmount)).toEqual([327.1, 66.67, 0]);
    expect(result.items.map(item => item.vatRate)).toEqual([7, 20, 0]);
  });

  it("rejects unsupported VAT rates instead of silently storing an invalid tax calculation", () => {
    expect(() => calculateInvoiceTotals([
      { description: "Послуга", qty: 1, price: 100, vatRate: 14 },
    ])).toThrow("Ставка ПДВ");
  });
});