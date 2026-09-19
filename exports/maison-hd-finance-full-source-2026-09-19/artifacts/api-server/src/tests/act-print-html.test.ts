import { describe, expect, it } from "vitest";
import { generateActHtml } from "../routes/accounting.js";

describe("generateActHtml", () => {
  it("shows each line's VAT rate and accurate VAT totals for mixed-rate services", () => {
    const html = generateActHtml({
      doc_number: "АКТ-001",
      doc_date: "2026-08-20",
      subtotal: "250.00",
      vat_amount: "27.00",
      total_amount: "277.00",
    }, [
      { description: "Проживання", unit: "послуга", quantity: 1, unit_price: "120.00", vat_rate: "20", vat_amount: "20.00", total_price: "120.00" },
      { description: "Туристичні послуги", unit: "послуга", quantity: 1, unit_price: "107.00", vat_rate: "7", vat_amount: "7.00", total_price: "107.00" },
      { description: "Звільнена послуга", unit: "послуга", quantity: 1, unit_price: "50.00", vat_rate: "exempt", vat_amount: "0.00", total_price: "50.00" },
    ], {}, {});

    expect(html).toContain("Ціна без ПДВ, ₴");
    expect(html).toContain("ПДВ%</th>");
    expect(html).toContain(">20%</td>");
    expect(html).toContain(">7%</td>");
    expect(html).toContain(">0%</td>");
    expect(html).not.toContain("NaN%");
    expect(html).toContain("Без ПДВ:</td><td class=\"right\">250.00 ₴");
    expect(html).toContain("ПДВ 7%:</td><td class=\"right\">7.00 ₴");
    expect(html).toContain("ПДВ 20%:</td><td class=\"right\">20.00 ₴");
    expect(html).toContain("Разом:</b></td><td class=\"right\"><b>277.00 ₴");
  });
});