import { describe, expect, it } from "vitest";
import { parsePosterAnalytics, posterDates } from "../lib/poster-analytics.js";

const report = {
  data: ["1000.2500", "2000.5000"],
  counters: { revenue: "3000.7500", transactions: "3", visitors: "9", average_receipt: 1000.25 },
};

describe("Poster daily analytics", () => {
  it("reads the documented object, keeps UAH, and counts receipts rather than visitors", () => {
    expect(parsePosterAnalytics(report, "2026-10-31", "2026-11-01")).toMatchObject({
      source: "live", totalRevenue: 3000.75, totalTransactions: 3, avgCheck: 1000.25,
      dailyRevenue: [{ date: "2026-10-31", revenue: 1000.25 }, { date: "2026-11-01", revenue: 2000.5 }],
    });
  });
  it("accepts an honestly empty period", () => {
    expect(parsePosterAnalytics({ data: [], counters: { revenue: "0", transactions: "0" } }, "2026-11-01", "2026-11-01"))
      .toMatchObject({ totalRevenue: 0, totalTransactions: 0, avgCheck: 0, dailyRevenue: [] });
  });
  it.each([null, [], {}, { data: [], counters: {} }, { ...report, data: ["NaN", 1] },
    { ...report, counters: { revenue: null, transactions: 3 } },
    { ...report, counters: { revenue: "Infinity", transactions: 3 } },
    { ...report, counters: { revenue: 20, transactions: 1.5 } },
    { ...report, data: [1] }])("rejects malformed reports instead of manufacturing totals: %j", (value) => {
    expect(() => parsePosterAnalytics(value, "2026-10-31", "2026-11-01")).toThrow();
  });
  it.each([["2026-02-30", "2026-03-01"], ["bad", "2026-03-01"], ["2026-11-02", "2026-11-01"],
    ["2020-01-01", "2026-11-01"]])("rejects invalid dates or ranges: %s %s", (start, end) => {
    expect(() => posterDates(start, end)).toThrow();
  });
});
