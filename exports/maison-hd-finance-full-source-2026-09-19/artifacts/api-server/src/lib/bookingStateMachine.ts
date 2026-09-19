/**
 * Booking State Machine
 * Defines all valid status transitions and enforces them server-side.
 * No status change should bypass this module.
 */

export type BookingStatus =
  | "draft"
  | "pending"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled";

/** Actor roles allowed to perform each type of transition */
const TRANSITION_ROLES: Record<string, string[]> = {
  "draft:pending":        ["owner", "manager", "reception", "super_admin"],
  "draft:confirmed":      ["owner", "manager", "reception", "super_admin"],
  "draft:cancelled":      ["owner", "manager", "reception", "super_admin"],
  "pending:confirmed":    ["owner", "manager", "reception", "super_admin"],
  "pending:cancelled":    ["owner", "manager", "reception", "super_admin"],
  "confirmed:checked_in": ["owner", "manager", "reception", "super_admin"],
  "confirmed:cancelled":  ["owner", "manager", "super_admin"],
  "checked_in:checked_out": ["owner", "manager", "reception", "super_admin"],
};

/** All valid forward transitions */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  draft:       ["pending", "confirmed", "cancelled"],
  pending:     ["confirmed", "cancelled"],
  confirmed:   ["checked_in", "cancelled"],
  checked_in:  ["checked_out"],
  checked_out: [],
  cancelled:   [],
};

export interface TransitionResult {
  ok: boolean;
  error?: string;
  httpStatus?: number;
}

/**
 * Validates whether a status transition is allowed.
 * @param from   Current booking status
 * @param to     Requested new status
 * @param role   JWT role of the actor
 */
export function validateTransition(
  from: BookingStatus,
  to: BookingStatus,
  role: string,
): TransitionResult {
  if (from === to) {
    return { ok: false, error: `Бронювання вже має статус "${from}"`, httpStatus: 422 };
  }

  const allowed = BOOKING_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      error: `Перехід "${from}" → "${to}" заборонений. Дозволено: ${allowed.join(", ") || "немає"}`,
      httpStatus: 409,
    };
  }

  const key = `${from}:${to}`;
  const roles = TRANSITION_ROLES[key];
  if (roles && !roles.includes(role)) {
    return {
      ok: false,
      error: `Роль "${role}" не може виконати перехід "${from}" → "${to}"`,
      httpStatus: 403,
    };
  }

  return { ok: true };
}

/**
 * Returns true if the status is terminal (no further transitions possible).
 */
export function isTerminalStatus(status: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[status]?.length === 0;
}

/**
 * Returns true if the booking can be cancelled from the given status.
 */
export function canCancel(status: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[status]?.includes("cancelled") ?? false;
}
