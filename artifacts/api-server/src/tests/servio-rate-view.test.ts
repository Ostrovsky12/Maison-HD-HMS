import { describe, expect, it } from "vitest";
import { servioRateViewOnlyReason } from "../../../maison-hd/src/lib/servio-rate-view";

describe("Servio price viewing versus booking", () => {
  const eligible = { name: "NR Site", nonRefundable: true, saleAllowed: true, total: 200 };
  it("allows a verified nonrefundable quote to be selected", () => {
    expect(servioRateViewOnlyReason(eligible)).toBeUndefined();
  });
  it("does not use the provider refund flag to block NR Site", () => {
    expect(servioRateViewOnlyReason({ ...eligible, nonRefundable: false })).toBeUndefined();
  });
  it("does not allow a different price list even with a true provider refund flag", () => {
    expect(servioRateViewOnlyReason({ ...eligible, name: "Standard" })).toContain("NR Site");
  });
  it("ignores harmless casing and whitespace, not extra name suffixes", () => {
    expect(servioRateViewOnlyReason({ ...eligible, name: " nr   SITE " })).toBeUndefined();
    expect(servioRateViewOnlyReason({ ...eligible, name: "NR Site Promo" })).toContain("NR Site");
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
