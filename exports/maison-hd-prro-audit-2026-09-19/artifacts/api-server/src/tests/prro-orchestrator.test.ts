import { describe, expect, it } from "vitest";
import { allocatePositiveFiscalItems, assertAmountConservation, calculatePaymentDelta, normalizeFiscalItems } from "../services/prro-orchestrator.js";
import { decideFiscalization } from "../services/prro-policy.js";

describe("shared PRRO orchestration boundary", () => {
  it("normalizes mixed-seller source lines without collapsing sellers", () => {
    const items = normalizeFiscalItems([
      { name: "Номер", quantity: 1, unitPrice: 2400, legalEntityId: 11 },
      { name: "Вечеря", quantity: 2, unitPrice: 350, legalEntityId: 22 },
    ]);
    expect(items).toHaveLength(2);
    expect(items.map(item => item.legalEntityId)).toEqual([11, 22]);
    expect(items[1].amount).toBe(700);
  });

  it("rejects an item with no seller instead of creating an unknown-entity document", () => {
    expect(() => normalizeFiscalItems([{ name: "Невідомо", amount: 100 }]))
      .toThrow("не визначено продавця");
  });

  it("requires evidence before a remote service payment can be exempt", () => {
    expect(decideFiscalization({
      itemKind: "service",
      paymentChannel: "remote_banking",
      exclusivelyRemoteServicePayments: true,
    }).decision).toBe("manual_review");
    expect(decideFiscalization({
      itemKind: "service",
      paymentChannel: "remote_banking",
      exclusivelyRemoteServicePayments: true,
      exemptionAuthority: "individual_tax_consultation",
      exemptionReference: "ІПК-2026/01",
    }).decision).toBe("exempt");
  });

  it("keeps SPA LiqPay/card payments in review even when a client asks for exemption", () => {
    expect(decideFiscalization({
      itemKind: "service",
      paymentChannel: "online_card",
      exclusivelyRemoteServicePayments: true,
      exemptionAuthority: "individual_tax_consultation",
      exemptionReference: "ІПК-2026/01",
    }).decision).toBe("manual_review");
  });

  it("enforces kopeck-exact conservation", () => {
    const lines = normalizeFiscalItems([
      { name: "Товар", quantity: 1, unitPrice: 100, amount: 100, legalEntityId: 11 },
      { name: "Коригування", quantity: 1, unitPrice: 0.01, amount: 0.01, legalEntityId: 11 },
    ]);
    expect(() => assertAmountConservation(lines, 100.01)).not.toThrow();
    expect(() => assertAmountConservation(lines, 100)).toThrow("не сходяться");
  });

  it("calculates immutable positive payment deltas", () => {
    expect(calculatePaymentDelta(0, 50)).toBe(50);
    expect(calculatePaymentDelta(50, 100)).toBe(50);
    expect(calculatePaymentDelta(100, 100)).toBe(0);
    expect(calculatePaymentDelta(100, 50)).toBe(0);
  });

  it("allocates partial payments in cents with no negative lines", () => {
    const allocated = allocatePositiveFiscalItems([
      { name: "A", quantity: 1, amount: 60, legalEntityId: 11, taxCode: "A" },
      { name: "B", quantity: 1, amount: 40, legalEntityId: 22, taxCode: "B" },
    ], 33.33);
    expect(allocated.every(item => Number(item.amount) > 0)).toBe(true);
    expect(allocated.reduce((sum, item) => sum + Number(item.amount), 0)).toBe(33.33);
    expect(allocated.map(item => item.taxCode)).toEqual(["A", "B"]);
  });
});