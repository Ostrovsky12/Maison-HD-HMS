/** Local room tariffs are per room; every occupant still counts toward capacity. */
export function parseBookingParty(adults: unknown, children: unknown, guestsCount: unknown, childrenAges: unknown) {
  const integer = (value: unknown) => typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))
    ? Number(value) : Number.NaN;
  const a = integer(adults);
  const c = integer(children === undefined ? 0 : children);
  const total = integer(guestsCount);
  const ages = childrenAges === undefined ? [] : childrenAges;
  if (!Number.isInteger(a) || a < 1 || a > 20 || !Number.isInteger(c) || c < 0 || c > 19
    || !Number.isInteger(total) || total !== a + c || total > 20
    || !Array.isArray(ages) || ages.length !== c
    || ages.some(age => typeof age !== "number" || !Number.isInteger(age) || age < 0 || age > 17)) return null;
  return {
    adults: a, children: c, guestsCount: total, childrenAges: ages as number[],
    under6: ages.filter(age => age < 6).length,
    over6: ages.filter(age => age >= 6).length,
  };
}
