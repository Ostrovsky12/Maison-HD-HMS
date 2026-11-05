/** Provider identifiers remain unchanged in booking requests and saved drafts. */
export function guestRateName(value: string) {
  return value.replace(/\bNR\s+Site\b/gi, "Неповоротний").trim();
}
