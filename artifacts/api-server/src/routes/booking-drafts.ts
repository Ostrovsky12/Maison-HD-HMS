import { randomUUID } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import { SavePublicBookingDraftBody, UpdateBookingDraftBody } from "@workspace/api-zod";
import { engineConfig } from "../lib/booking-engine.js";
import { BOOKING_DRAFT_NOTICE, draftTokenHash, validDraftToken } from "../lib/booking-drafts.js";

export const publicBookingDrafts = Router();
const captureLimit = rateLimit({ windowMs: 60_000, max: 90, standardHeaders: true, legacyHeaders: false });
publicBookingDrafts.post("/:slug/draft", captureLimit, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = SavePublicBookingDraftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Некоректна чернетка." }); return; }
  const { token, revision, noticeVersion, stage, ...details } = parsed.data;
  if (!validDraftToken(token) || noticeVersion !== BOOKING_DRAFT_NOTICE
    || ![revision, details.adults, details.children].every(Number.isSafeInteger)
    || !/^\d{4}-\d{2}-\d{2}$/.test(details.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(details.checkOut)
    || !Number.isFinite(Date.parse(details.checkIn)) || !Number.isFinite(Date.parse(details.checkOut))
    || details.checkOut <= details.checkIn || (Date.parse(details.checkOut) - Date.parse(details.checkIn)) > 31 * 86400000) {
    res.status(400).json({ error: "Перевірте дані й дати чернетки." }); return;
  }
  const org = (await pool.query("SELECT id,name,slug,booking_engine_config FROM organizations WHERE slug=$1 AND is_active=true",
    [String(req.params.slug)])).rows[0];
  if (!org || !engineConfig(org).published) { res.status(404).json({ error: "Сторінка бронювання недоступна." }); return; }
  await pool.query(`INSERT INTO booking_drafts(id,organization_id,token_hash,revision,notice_version,details,stage)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)
    ON CONFLICT(organization_id,token_hash) DO UPDATE SET
      revision=excluded.revision,details=excluded.details,last_seen=now(),updated_at=now(),
      stage=CASE WHEN booking_drafts.servio_attempt_id IS NOT NULL OR booking_drafts.booking_id IS NOT NULL
        THEN 'reservation_created' ELSE excluded.stage END
    WHERE booking_drafts.revision<excluded.revision`,
    [randomUUID(), org.id, draftTokenHash(token), revision, noticeVersion, JSON.stringify(details), stage]);
  res.status(204).end();
});

// Mounted beneath the existing authenticated booking-engine role/org boundary.
export const bookingDrafts = Router();
const projection = `SELECT d.id,d.details,
  CASE WHEN a.state='confirmed' OR b.payment_status='paid' THEN 'converted' ELSE d.status END AS status,
  d.notes,CASE WHEN a.id IS NOT NULL THEN a.state ELSE d.stage END AS stage,
  d.last_seen AS "lastSeen",d.created_at AS "createdAt",
  to_char(d.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt",
  (d.last_seen>now()-interval '15 minutes' AND d.servio_attempt_id IS NULL AND d.booking_id IS NULL) AS active
  FROM booking_drafts d
  LEFT JOIN servio_booking_attempts a ON a.id=d.servio_attempt_id AND a.organization_id=d.organization_id
  LEFT JOIN bookings b ON b.id=d.booking_id AND b.organization_id=d.organization_id
  WHERE d.organization_id=$1 AND d.last_seen>now()-interval '90 days'
    AND greatest(length(trim(d.details->>'guestName')),length(trim(d.details->>'phone')),
      length(trim(d.details->>'email')))>=2`;

bookingDrafts.get("/", async (req: any, res): Promise<void> => {
  const offset = Number(req.query.offset ?? 0), filter = String(req.query.filter ?? "all");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000
    || !["all", "abandoned", "new", "working", "contacted", "closed", "converted"].includes(filter)) {
    res.status(400).json({ error: "Некоректний фільтр." }); return;
  }
  const predicate = `($2='all' OR ($2='abandoned' AND NOT active AND status NOT IN ('converted','closed'))
    OR ($2 NOT IN ('all','abandoned') AND status=$2))`;
  const sql = `WITH journal AS (${projection}) SELECT *,count(*) OVER()::int AS total FROM journal
    WHERE ${predicate} ORDER BY "lastSeen" DESC,id LIMIT 50 OFFSET $3`;
  const rows = (await pool.query(sql, [req.user.organizationId, filter, offset])).rows;
  const items = rows.map(({ total: _total, ...item }) => item);
  // A single count also handles a now-empty final page after another manager deletes a row.
  const total = rows[0]?.total ?? (await pool.query(`WITH journal AS (${projection})
    SELECT count(*)::int AS total FROM journal WHERE ${predicate}`, [req.user.organizationId, filter])).rows[0]?.total ?? 0;
  res.json({ items, total, offset, limit: 50 });
});

bookingDrafts.patch("/:id", async (req: any, res): Promise<void> => {
  const parsed = UpdateBookingDraftBody.safeParse(req.body);
  if (!validDraftToken(req.params.id) || !parsed.success) { res.status(400).json({ error: "Перевірте статус та нотатки." }); return; }
  const { status, notes, expectedUpdatedAt } = parsed.data;
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) { res.status(400).json({ error: "Некоректна версія запису." }); return; }
  const updated = await pool.query(`UPDATE booking_drafts SET status=coalesce($3,status),notes=$4,updated_at=now()
    WHERE organization_id=$1 AND id=$2 AND updated_at=$5::timestamptz
      AND last_seen>now()-interval '90 days' RETURNING id`,
    [req.user.organizationId, req.params.id, status ?? null, notes, expectedUpdatedAt]);
  if (!updated.rows.length) {
    const exists = (await pool.query("SELECT id FROM booking_drafts WHERE organization_id=$1 AND id=$2",
      [req.user.organizationId, req.params.id])).rows.length;
    res.status(exists ? 409 : 404).json({ error: exists
      ? "Дані змінилися. Оновіть запис перед збереженням; ваші нотатки не перезаписано." : "Запис не знайдено." }); return;
  }
  res.status(204).end();
});
bookingDrafts.delete("/:id", async (req: any, res): Promise<void> => {
  if (!validDraftToken(req.params.id)) { res.status(400).json({ error: "Некоректний запис." }); return; }
  const result = await pool.query("DELETE FROM booking_drafts WHERE organization_id=$1 AND id=$2 RETURNING id",
    [req.user.organizationId, req.params.id]);
  if (!result.rows.length) { res.status(404).json({ error: "Запис не знайдено." }); return; }
  res.status(204).end();
});
