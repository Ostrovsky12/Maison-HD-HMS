import { describe, expect, it } from "vitest";
import {
  reclassificationError,
  summarizeRegisterReports,
  type AccountantReport,
} from "../services/prro-accountant.js";

function report(overrides: Partial<AccountantReport>): AccountantReport {
  return {
    id: 1,
    registerId: 10,
    shiftId: 20,
    documentType: "x_report",
    status: "fiscalized",
    fiscalNumber: "FN-1",
    dpsDocumentId: "DPS-1",
    totalAmount: "100.00",
    createdAt: new Date("2026-09-18T08:00:00Z"),
    fiscalizedAt: new Date("2026-09-18T08:00:05Z"),
    ...overrides,
  };
}

describe("accountant PRRO report summaries", () => {
  it("keeps the latest successful report separate from a newer failed attempt", () => {
    const failed = report({
      id: 2,
      status: "failed_safe_to_retry",
      fiscalNumber: null,
      dpsDocumentId: null,
      fiscalizedAt: null,
      createdAt: new Date("2026-09-18T09:00:00Z"),
    });
    const successful = report({ id: 1 });
    const summary = summarizeRegisterReports([failed, successful]).get(10);

    expect(summary?.latestXReportAttempt?.id).toBe(2);
    expect(summary?.lastXReport?.id).toBe(1);
  });

  it("tracks X and Z report attempts independently", () => {
    const x = report({ id: 3 });
    const z = report({ id: 4, documentType: "z_report" });
    const summary = summarizeRegisterReports([z, x]).get(10);

    expect(summary?.lastXReport?.id).toBe(3);
    expect(summary?.lastZReport?.id).toBe(4);
  });
});

describe("accountant PRRO reclassification guard", () => {
  it("rejects every fiscalized document as immutable", () => {
    expect(reclassificationError({ status: "fiscalized", fiscalizedAt: new Date() })).toBe("IMMUTABLE");
    expect(reclassificationError({ status: "review", fiscalizedAt: new Date() })).toBe("IMMUTABLE");
  });

  it("allows only non-fiscalized exempt and review documents", () => {
    expect(reclassificationError({ status: "review", fiscalizedAt: null })).toBeNull();
    expect(reclassificationError({ status: "exempt", fiscalizedAt: null })).toBeNull();
    expect(reclassificationError({ status: "draft", fiscalizedAt: null })).toBe("NOT_REVIEWABLE");
  });
});