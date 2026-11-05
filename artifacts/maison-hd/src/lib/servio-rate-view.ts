/** Displaying a provider quote is not permission to create a reservation. */
export function servioRateViewOnlyReason(rate: {
  nonRefundable?: unknown; saleAllowed?: unknown; total?: unknown;
}): string | undefined {
  if (rate.nonRefundable !== true)
    return "Лише перегляд: Servio не підтвердив неповоротність цього тарифу.";
  if (rate.saleAllowed === false)
    return "Лише перегляд: обмеження Servio не дозволяють онлайн-бронювання на ці дати.";
  if (rate.saleAllowed !== true)
    return "Лише перегляд: умови продажу Servio ще не перевірені.";
  if (typeof rate.total !== "number" || !Number.isFinite(rate.total) || rate.total <= 0)
    return "Лише перегляд: немає підтвердженої ціни для оплати.";
  return undefined;
}
