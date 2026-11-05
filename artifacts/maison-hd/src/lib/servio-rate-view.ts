/** Displaying a provider quote is not permission to create a reservation. */
export function servioRateViewOnlyReason(rate: {
  name?: unknown; nonRefundable?: unknown; saleAllowed?: unknown; total?: unknown;
}): string | undefined {
  if (typeof rate.name !== "string" || rate.name.trim().replace(/\s+/g, " ").toLowerCase() !== "nr site")
    return "Лише перегляд: цей тариф недоступний для онлайн-бронювання.";
  if (rate.saleAllowed === false)
    return "Лише перегляд: обмеження Servio не дозволяють онлайн-бронювання на ці дати.";
  if (rate.saleAllowed !== true)
    return "Лише перегляд: умови продажу Servio ще не перевірені.";
  if (typeof rate.total !== "number" || !Number.isFinite(rate.total) || rate.total <= 0)
    return "Лише перегляд: немає підтвердженої ціни для оплати.";
  return undefined;
}
