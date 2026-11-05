import { describe, expect, it } from "vitest";
// Test-only import: validate the actual client formatter against the provider
// contract without starting a browser or creating a real reservation.
import { normalizeAdditionalServices, serviceRequestText } from "../../../maison-hd/src/lib/booking-additional-services";

describe("booking additional wishes client formatter", () => {
  it("provides starter wishes only for an unconfigured list", () => {
    expect(normalizeAdditionalServices(undefined).map(item => item.id)).toEqual(["pet", "baby-cot"]);
    expect(normalizeAdditionalServices([])).toEqual([]);
  });
  it("combines selection and free text without inventing charges", () => {
    const options = normalizeAdditionalServices(undefined);
    expect(serviceRequestText(options, ["pet", "baby-cot"], "  Пізній заїзд  "))
      .toBe("Додаткові побажання: З твариною; Дитяче ліжко.\nПізній заїзд");
  });
  it("excludes disabled, deleted and unknown selections", () => {
    const options = normalizeAdditionalServices(undefined).map(item => ({ ...item, enabled: false }));
    expect(serviceRequestText(options, ["pet", "deleted"], "Коментар")).toBe("Коментар");
    expect(serviceRequestText([], ["pet"], "")).toBe("");
  });
  it("uses edited names and keeps each checkbox once", () => {
    const options = [{ id: "pet", name: "З собакою", description: "За погодженням", enabled: true }];
    expect(serviceRequestText(options, ["pet", "pet"], "")).toBe("Додаткові побажання: З собакою.");
  });
});
