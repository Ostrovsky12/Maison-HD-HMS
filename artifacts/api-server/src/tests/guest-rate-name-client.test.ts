import { describe, expect, it } from "vitest";
import { guestRateName } from "../../../maison-hd/src/lib/guest-rate-name";

describe("guest tariff display", () => {
  it("removes provider naming even inside a configured guest title", () => {
    expect(guestRateName("NR Site")).toBe("Неповоротний");
    expect(guestRateName("Тариф nr site · сніданок")).toBe("Тариф Неповоротний · сніданок");
  });
  it("preserves unrelated names", () => {
    expect(guestRateName("Сімейний відпочинок")).toBe("Сімейний відпочинок");
  });
});
