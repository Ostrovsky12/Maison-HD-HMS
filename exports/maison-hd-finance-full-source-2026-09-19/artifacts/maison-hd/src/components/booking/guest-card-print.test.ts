import { describe, expect, it } from "vitest";
import { guestCardFullName } from "./guest-card-print";

describe("guestCardFullName", () => {
  it("uses the current guest profile name instead of stale booking snapshot fields", () => {
    expect(guestCardFullName({
      guestName: "Марія Кравченко",
      firstName: "Олексій",
      lastName: "Ткаченко",
    })).toBe("Марія Кравченко");
  });

  it("falls back to booking fields when no guest profile is linked", () => {
    expect(guestCardFullName({
      firstName: "Олексій",
      lastName: "Ткаченко",
      middleName: "Іванович",
    })).toBe("Ткаченко Олексій Іванович");
  });
});