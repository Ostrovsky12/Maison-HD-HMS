import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals } from "../lib/invoice-totals.js";

const actVatTotalsModule = new URL(
  "../../../maison-hd/src/lib/act-vat-totals.ts",
  import.meta.url,
).href;

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

  it("uses separately rounded stored item VAT in the Act preview totals", async () => {
    const invoiceItems = [
      { description: "Послуга 1", totalPrice: 0.03, vatRate: 20, vatAmount: 0.01 },
      { description: "Послуга 2", totalPrice: 0.03, vatRate: 20, vatAmount: 0.01 },
    ];

    const { calculateActVatByRate } = await import(actVatTotalsModule);
    const vatByRate = calculateActVatByRate(invoiceItems);
    const vatDerivedFromGross = invoiceItems.reduce(
      (sum, item) => sum + (item.totalPrice - item.totalPrice / (1 + item.vatRate / 100)),
      0,
    );

    expect(vatByRate[20]).toBe(0.02);
    expect(vatDerivedFromGross).toBeCloseTo(0.01, 10);
    expect(vatByRate[20]).not.toBeCloseTo(vatDerivedFromGross, 2);
  });
});