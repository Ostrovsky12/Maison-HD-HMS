import { describe, expect, it } from "vitest";
import { buildPrroXml, validatePrroXml, type PrroXmlInput } from "../services/prro-xml.js";

const base: PrroXmlInput = {
  kind: "sale",
  fiscalNumber: "4000123456",
  localNumber: 1,
  occurredAt: new Date("2026-09-12T09:10:11Z"),
  sellerTaxId: "12345678",
  sellerName: "ТОВ «Мезон»",
  locationName: "Ресторан",
  locationAddress: "Київ",
  deviceId: "restaurant-1",
  cashierName: "Касир",
  totalAmount: 125,
  paymentChannel: "pos_card",
  lines: [{ name: "Сніданок & кава", quantity: 1, unitPrice: 125, taxCode: "А" }],
  previousHash: "abc123",
};

describe("DPS PRRO XML", () => {
  it("builds and validates a sale receipt with escaped content", () => {
    const xml = buildPrroXml(base);
    expect(xml).toContain('<CHECK CT="0">');
    expect(xml).toContain("<NAME>Сніданок &amp; кава</NAME>");
    expect(xml).toContain("<SUM>125.00</SUM>");
    expect(xml).toContain("<ORDERDATE>20260912</ORDERDATE>");
    expect(xml).toMatch(/<ORDERTIME>\d{6}<\/ORDERTIME>/);
    expect(() => validatePrroXml(xml, "sale")).not.toThrow();
  });

  it("uses DPS service-check code 108 to open a shift", () => {
    const xml = buildPrroXml({ ...base, kind: "open_shift", localNumber: 0, totalAmount: 0, lines: [] });
    expect(xml).toContain('<CHECK CT="108">');
    expect(xml).toContain("<ORDERNUM>0</ORDERNUM>");
  });

  it("builds the Z-report document expected by sendChkV2", () => {
    const xml = buildPrroXml({ ...base, kind: "z_report", localNumber: 5, lines: [] });
    expect(xml).toContain("<ZREPORT>");
    expect(xml).toContain("<ZREPHEAD>");
    expect(xml).toContain("<ZREPREALIZ>");
    expect(() => validatePrroXml(xml, "z_report")).not.toThrow();
  });

  it("rejects malformed documents before signing", () => {
    expect(() => validatePrroXml("<CHECK></CHECK>", "sale")).toThrow("DPS XML schema");
  });

  it("rejects totals that do not reconcile with receipt lines", () => {
    expect(() => buildPrroXml({ ...base, totalAmount: 124.99 })).toThrow("line total");
  });
});