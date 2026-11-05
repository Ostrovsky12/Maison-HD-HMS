/** The notice is editable; the real server-side deadline is not. */
export const PAYMENT_WINDOW_MINUTES = 10;
export const CANONICAL_PAYMENT_NOTICE =
  "Для гарантування бронювання оплату потрібно здійснити протягом 10 хвилин. В іншому випадку бронювання буде скасовано.";
export const PAYMENT_WINDOW_LABEL = "Строк оплати — 10 хвилин від створення бронювання.";
export const supplementaryText = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 2000) : "");
