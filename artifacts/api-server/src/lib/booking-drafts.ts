import { createHash } from "node:crypto";
import { pool } from "@workspace/db";

export const BOOKING_DRAFT_NOTICE = "booking-draft-v1";
export const draftTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const validDraftToken = (token: unknown): token is string =>
  typeof token === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);

// Only server-confirmed associations. Never accept booking IDs from a guest.
// Failure to record a CRM association must not make a created booking look failed.
export async function linkBookingDraft(orgId: number, token: unknown,
  target: { attemptId?: string; bookingId?: number }, log: { warn: (...args: any[]) => void }) {
  if (!validDraftToken(token)) return;
  try {
    await pool.query(`UPDATE booking_drafts SET servio_attempt_id=coalesce($3,servio_attempt_id),
      booking_id=coalesce($4,booking_id),stage='reservation_created',updated_at=now()
      WHERE organization_id=$1 AND token_hash=$2 AND last_seen>now()-interval '90 days'`,
      [orgId, draftTokenHash(token), target.attemptId ?? null, target.bookingId ?? null]);
  } catch { log.warn({ organizationId: orgId }, "Booking draft association unavailable"); }
}

export function startBookingDraftCleanup(log: { warn: (...args: any[]) => void }) {
  const clean = () => pool.query("DELETE FROM booking_drafts WHERE last_seen<now()-interval '90 days'")
    .catch(() => log.warn("Booking draft retention cleanup unavailable"));
  void clean();
  const timer = setInterval(() => { void clean(); }, 6 * 60 * 60 * 1000);
  timer.unref();
}
