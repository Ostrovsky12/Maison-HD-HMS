/** The website sells the owner's designated Servio price list, not a refund flag. */
export function isServioSiteTariff(rate: { name?: unknown } | null | undefined): boolean {
  return typeof rate?.name === "string" && rate.name.trim().replace(/\s+/g, " ").toLowerCase() === "nr site";
}
