// dash.getAnalytics (default type, interpolate=day) returns amounts in UAH,
// unlike transaction APIs whose amounts are in minor currency units.
export function posterDates(dateFrom: string, dateTo: string): string[] {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(dateFrom) || !valid(dateTo)) throw new Error("Вкажіть коректні дати у форматі РРРР-ММ-ДД.");
  const count = (Date.parse(dateTo) - Date.parse(dateFrom)) / 86400000 + 1;
  if (count < 1 || count > 366) throw new Error("Період має становити від 1 до 366 днів.");
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.parse(dateFrom) + i * 86400000).toISOString().slice(0, 10));
}

export function parsePosterAnalytics(value: unknown, dateFrom: string, dateTo: string) {
  const dates = posterDates(dateFrom, dateTo);
  const invalid = () => new Error("Poster повернув непідтримуваний формат звіту. Дані не збережено.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const { data, counters } = value as Record<string, any>;
  if (!Array.isArray(data) || !counters || typeof counters !== "object") throw invalid();
  const number = (v: unknown) => {
    if ((typeof v !== "number" && typeof v !== "string") || (typeof v === "string" && !v.trim())) throw invalid();
    const n = Number(v);
    if (!Number.isFinite(n)) throw invalid();
    return n;
  };
  const money = (v: unknown) => Math.round(number(v) * 100) / 100;
  const totalRevenue = money(counters.revenue);
  const totalTransactions = number(counters.transactions);
  if (!Number.isInteger(totalTransactions) || totalTransactions < 0) throw invalid();
  // Never guess which dates a shortened series belongs to.
  if (data.length !== dates.length && !(data.length === 0 && totalRevenue === 0 && totalTransactions === 0)) throw invalid();
  const dailyRevenue = data.map((amount, i) => ({ date: dates[i], revenue: money(amount) }));
  return {
    source: "live" as const,
    totalRevenue,
    totalTransactions,
    avgCheck: totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions * 100) / 100 : 0,
    dailyRevenue, dateFrom, dateTo,
  };
}
