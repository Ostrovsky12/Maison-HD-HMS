export type AccountantReport = {
  id: number;
  registerId: number | null;
  shiftId: number | null;
  documentType: string;
  status: string;
  fiscalNumber: string | null;
  dpsDocumentId: string | null;
  totalAmount: string;
  createdAt: Date;
  fiscalizedAt: Date | null;
};

export type RegisterReportSummary = {
  lastXReport: AccountantReport | null;
  lastZReport: AccountantReport | null;
  latestXReportAttempt: AccountantReport | null;
  latestZReportAttempt: AccountantReport | null;
};

export function summarizeRegisterReports(reports: AccountantReport[]): Map<number, RegisterReportSummary> {
  const summaries = new Map<number, RegisterReportSummary>();
  for (const report of reports) {
    if (!report.registerId) continue;
    const current = summaries.get(report.registerId) ?? {
      lastXReport: null,
      lastZReport: null,
      latestXReportAttempt: null,
      latestZReportAttempt: null,
    };
    if (report.documentType === "x_report") {
      if (!current.latestXReportAttempt) current.latestXReportAttempt = report;
      if (report.status === "fiscalized" && !current.lastXReport) current.lastXReport = report;
    }
    if (report.documentType === "z_report") {
      if (!current.latestZReportAttempt) current.latestZReportAttempt = report;
      if (report.status === "fiscalized" && !current.lastZReport) current.lastZReport = report;
    }
    summaries.set(report.registerId, current);
  }
  return summaries;
}

export function reclassificationError(document: { status: string; fiscalizedAt: Date | null }): string | null {
  if (document.status === "fiscalized" || document.status === "completed" || document.fiscalizedAt) {
    return "IMMUTABLE";
  }
  if (!["exempt", "review"].includes(document.status)) return "NOT_REVIEWABLE";
  return null;
}