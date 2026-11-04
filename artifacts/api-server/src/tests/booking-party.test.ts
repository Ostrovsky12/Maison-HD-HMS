import { describe, expect, it } from "vitest";
import { parseBookingParty } from "../lib/booking-party.js";

describe("local booking family occupancy", () => {
  it("keeps adult-only requests compatible", () => {
    expect(parseBookingParty(2, 0, 2, undefined)).toMatchObject({ adults: 2, children: 0, under6: 0, over6: 0 });
  });
  it("classifies genuine child ages rather than splitting the count arbitrarily", () => {
    expect(parseBookingParty(2, 4, 6, [0, 5, 6, 17])).toMatchObject({ under6: 2, over6: 2, guestsCount: 6 });
    expect(parseBookingParty(1, 3, 4, [0, 2, 5])).toMatchObject({ under6: 3, over6: 0 });
  });
  it.each([
    [2, 1, 2, [5]], [2, 1, 3, undefined], [2, 1, 3, []],
    [2, 1, 3, [18]], [2, 1, 3, [-1]], [2, 1, 3, [1.5]],
    [2, 1, 3, ["5"]], [2, 0, 2, [5]], [0, 1, 1, [5]],
    [20, 1, 21, [5]], [1.5, 0, 1.5, []], [2, 0.5, 2.5, []],
    [true, 0, 1, []], [2, 0, 2, null],
  ])("rejects mismatched or malformed party %j", (a, c, total, ages) => {
    expect(parseBookingParty(a, c, total, ages)).toBeNull();
  });
});
