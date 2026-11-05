import { describe, expect, it } from "vitest";
import { servioRateViewOnlyReason } from "../../../maison-hd/src/lib/servio-rate-view";

describe("Servio price viewing versus booking", () => {
  const eligible = { nonRefundable: true, saleAllowed: true, total: 200 };
  it("allows a verified nonrefundable quote to be selected", () => {
    expect(servioRateViewOnlyReason(eligible)).toBeUndefined();
  });
  it("labels a refundable provider quote as view-only, not nonrefundable", () => {
    expect(servioRateViewOnlyReason({ ...eligible, nonRefundable: false })).toContain("не підтвердив неповоротність");
  });
  it.each([null, false, undefined])("keeps unverified or blocked sale status %s view-only", saleAllowed => {
    expect(servioRateViewOnlyReason({ ...eligible, saleAllowed })).toContain("Лише перегляд");
  });
  it.each([0, -1, NaN, Infinity, "200"])("cannot select invalid payment total %s", total => {
    expect(servioRateViewOnlyReason({ ...eligible, total })).toContain("Лише перегляд");
  });
  it("fails closed if the provider's eligibility flags are absent", () => {
    expect(servioRateViewOnlyReason({ total: 200 })).toContain("Лише перегляд");
  });
});
