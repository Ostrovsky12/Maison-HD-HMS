import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db, pool } from "@workspace/db";
import {
  guestsTable, bookingsTable, unitsTable, organizationsTable,
} from "@workspace/db/schema";
import { eq, and, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

const DOGODA_URL = "https://dogoda.me/dogodaStatsDumperGet.php";
const DOGODA_SCODE = "D0gdsa3crt";

// GET /api/import/fetch — try to fetch raw data from dogoda.me
router.get("/fetch", requireAuth, async (req, res) => {
  const { start_date = "2024-01-01" } = req.query;
  const url = `${DOGODA_URL}?scode=${DOGODA_SCODE}&start_date=${start_date}`;

  try {
    logger.info({ url }, "Fetching data from dogoda.me");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "DogodaHMS/2.0",
        "Accept": "application/json, text/plain, */*",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      res.status(502).json({ error: "Upstream error", status: response.status });
      return;
    }

    const text = await response.text();
    if (!text || text.trim() === "") {
      res.status(502).json({ error: "Empty response from dogoda.me" });
      return;
    }

    // Try parse as JSON
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      // Return raw text for inspection
      res.json({ raw: text.slice(0, 2000), format: "unknown" });
      return;
    }

    res.json({ data, format: "json", size: text.length });
  } catch (err: any) {
    if (err.name === "AbortError") {
      res.status(504).json({ error: "timeout", message: "dogoda.me не відповів за 55 секунд" });
    } else {
      logger.error({ err }, "Fetch from dogoda.me failed");
      res.status(502).json({ error: "fetch_failed", message: err.message });
    }
  }
});

// POST /api/import/data — import pre-fetched data
router.post("/data", requireAuth, async (req, res) => {
  const { data, organizationId } = req.body;
  if (!data || !organizationId) {
    res.status(400).json({ error: "data and organizationId are required" });
    return;
  }

  const stats = { guests: 0, bookings: 0, skipped: 0 };

  try {
    // Try to handle various dogoda.me data shapes
    const bookingsArr: any[] = Array.isArray(data)
      ? data
      : data.bookings || data.reservations || data.orders || [];

    const guestsMap = new Map<string, number>(); // email/name -> guest.id

    // Get existing units for lookup
    const units = await db.select({ id: unitsTable.id, name: unitsTable.name })
      .from(unitsTable);
    const unitByName = new Map(units.map(u => [u.name.toLowerCase(), u.id]));

    for (const row of bookingsArr) {
      try {
        // --- GUEST ---
        const firstName = row.guest_firstname || row.firstName || row.first_name || row.name?.split(" ")[0] || "Невідомо";
        const lastName = row.guest_lastname || row.lastName || row.last_name || row.name?.split(" ").slice(1).join(" ") || "";
        const email = row.guest_email || row.email || null;
        const phone = row.guest_phone || row.phone || null;

        const guestKey = email || `${firstName}-${lastName}`;
        let guestId = guestsMap.get(guestKey);

        if (!guestId) {
          const [guest] = await db.insert(guestsTable).values({
            organizationId,
            firstName,
            lastName,
            email,
            phone,
          }).onConflictDoNothing().returning();

          if (guest) {
            guestId = guest.id;
            guestsMap.set(guestKey, guest.id);
            stats.guests++;
          } else {
            // Find existing
            const [existing] = await db.select().from(guestsTable)
              .where(and(eq(guestsTable.organizationId, organizationId), email ? eq(guestsTable.email, email) : eq(guestsTable.firstName, firstName)))
              .limit(1);
            if (existing) guestId = existing.id;
          }
        }

        if (!guestId) { stats.skipped++; continue; }

        // --- UNIT ---
        const unitRaw = row.room || row.unit || row.room_name || row.unit_name || "";
        const unitId = unitByName.get(String(unitRaw).toLowerCase()) ||
          unitByName.get(String(unitRaw).toLowerCase().replace(/\s+/g, " ").trim());

        if (!unitId) { stats.skipped++; continue; }

        // --- DATES ---
        const checkIn = row.check_in || row.checkin || row.arrival || row.start_date || row.date_from;
        const checkOut = row.check_out || row.checkout || row.departure || row.end_date || row.date_to;

        if (!checkIn || !checkOut) { stats.skipped++; continue; }

        // --- BOOKING STATUS ---
        const statusRaw = (row.status || "confirmed").toLowerCase();
        const statusMap: Record<string, string> = {
          confirmed: "confirmed", подтверджено: "confirmed", підтверджено: "confirmed",
          checked_in: "checked_in", "check-in": "checked_in", заселено: "checked_in",
          checked_out: "checked_out", "check-out": "checked_out", виїхав: "checked_out",
          cancelled: "cancelled", скасовано: "cancelled",
          pending: "pending", очікує: "pending",
        };
        const status = (statusMap[statusRaw] || "confirmed") as any;

        const totalAmount = String(row.total || row.amount || row.price || row.total_price || "0");
        const paidAmount = String(row.paid || row.paid_amount || "0");
        const guestsCount = Number(row.guests_count || row.guests || row.pax || 1);
        const source = (row.source || row.channel || "direct").toLowerCase().replace(/[^a-z]/g, "_");

        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          if (["pending", "confirmed", "checked_in"].includes(status)) {
            const lockedUnit = await client.query("SELECT id FROM units WHERE id = $1 FOR UPDATE", [unitId]);
            if (!lockedUnit.rows.length) {
              await client.query("ROLLBACK");
              stats.skipped++;
              continue;
            }

            const overlap = await client.query(
              `SELECT id FROM bookings
               WHERE unit_id = $1
                 AND status IN ('pending', 'confirmed', 'checked_in')
                 AND check_in < $3::date
                 AND check_out > $2::date
               LIMIT 1`,
              [unitId, checkIn, checkOut],
            );
            const block = await client.query(
              `SELECT id FROM accommodation_blocks
               WHERE is_active = true
                 AND $1 = ANY(ARRAY(SELECT jsonb_array_elements_text(unit_ids))::int[])
                 AND start_date < $3::date
                 AND end_date > $2::date
               LIMIT 1`,
              [unitId, checkIn, checkOut],
            );
            if (overlap.rows.length || block.rows.length) {
              await client.query("ROLLBACK");
              stats.skipped++;
              continue;
            }
          }

          await client.query(
            `INSERT INTO bookings (
               unit_id, guest_id, organization_id, check_in, check_out, status,
               payment_status, source, guests_count, total_amount, paid_amount
             ) VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, $11)
             ON CONFLICT DO NOTHING`,
            [
              unitId, guestId, organizationId, checkIn, checkOut, status,
              Number(paidAmount) >= Number(totalAmount) && Number(totalAmount) > 0 ? "paid" : Number(paidAmount) > 0 ? "partial" : "unpaid",
              source.slice(0, 50), guestsCount, totalAmount, paidAmount,
            ],
          );
          await client.query("COMMIT");
        } catch (rowErr) {
          await client.query("ROLLBACK");
          throw rowErr;
        } finally {
          client.release();
        }

        stats.bookings++;
      } catch (rowErr) {
        logger.warn({ rowErr, row }, "Skipping row due to error");
        stats.skipped++;
      }
    }

    res.json({ success: true, stats });
  } catch (err) {
    logger.error({ err }, "Import failed");
    res.status(500).json({ error: "import_failed", message: String(err) });
  }
});

export default router;
