import { Router } from "express";
import { db } from "@workspace/db";
import {
  bookingsTable, unitsTable, spaServicesTable,
  fbItemsTable, tvScreensTable, eventsTable,
} from "@workspace/db";
import { eq, and, lte, gte, or, ne, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;

// ── SEED ──────────────────────────────────────────────────────────────────────
async function seedTvScreens(orgId: number) {
  const ex = await db.select({ id: tvScreensTable.id })
    .from(tvScreensTable).where(eq(tvScreensTable.organizationId, orgId)).limit(1);
  if (ex.length > 0) return;

  const units = await db.select({ id: unitsTable.id, name: unitsTable.name })
    .from(unitsTable).limit(6);
  if (!units.length) return;

  const branding = {
    hotelName: "Dogoda Resort",
    logo: "🏨",
    primaryColor: "#1e40af",
    accentColor: "#f59e0b",
    tagline: "Ваш ідеальний відпочинок",
  };
  const contentConfig = { slideInterval: 8000, showWeather: true, showEvents: true, showUpsells: true };

  for (let i = 0; i < Math.min(units.length, 4); i++) {
    const u = units[i];
    await db.insert(tvScreensTable).values({
      organizationId: orgId,
      unitId: u.id,
      roomCode: `TV-${String(u.id).padStart(3, "0")}`,
      displayName: `TV — ${u.name}`,
      isActive: i < 3,
      branding,
      contentConfig,
    }).onConflictDoNothing();
  }
}

// ── STAFF ROUTES ──────────────────────────────────────────────────────────────

router.get("/stats", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedTvScreens(orgId);
    const screens = await db.select({ id: tvScreensTable.id, isActive: tvScreensTable.isActive, lastPingAt: tvScreensTable.lastPingAt })
      .from(tvScreensTable).where(eq(tvScreensTable.organizationId, orgId));
    const now = Date.now();
    const online = screens.filter(s => s.lastPingAt && now - new Date(s.lastPingAt).getTime() < 60_000);
    res.json({
      totalScreens: screens.length,
      activeScreens: screens.filter(s => s.isActive).length,
      onlineScreens: online.length,
      featuredUpsells: 6,
      qrScans: 127,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/screens", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedTvScreens(orgId);
    const screens = await db.select({
      id: tvScreensTable.id,
      roomCode: tvScreensTable.roomCode,
      displayName: tvScreensTable.displayName,
      isActive: tvScreensTable.isActive,
      branding: tvScreensTable.branding,
      contentConfig: tvScreensTable.contentConfig,
      lastPingAt: tvScreensTable.lastPingAt,
      unitId: tvScreensTable.unitId,
      unitName: sql<string | null>`"units"."name"`,
      floor: sql<number | null>`"units"."floor"`,
    }).from(tvScreensTable)
      .leftJoin(unitsTable, eq(tvScreensTable.unitId, unitsTable.id))
      .where(eq(tvScreensTable.organizationId, orgId))
      .orderBy(asc(tvScreensTable.createdAt));
    res.json({ screens });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/screens/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    const allowed: any = {};
    if (req.body.isActive !== undefined) allowed.isActive = req.body.isActive;
    if (req.body.displayName !== undefined) allowed.displayName = req.body.displayName;
    if (req.body.branding !== undefined) allowed.branding = req.body.branding;
    if (req.body.contentConfig !== undefined) allowed.contentConfig = req.body.contentConfig;
    if (Object.keys(allowed).length === 0) return res.json({ ok: true });
    await db.update(tvScreensTable).set(allowed)
      .where(and(eq(tvScreensTable.id, id), eq(tvScreensTable.organizationId, orgId)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── PUBLIC TV DISPLAY ─────────────────────────────────────────────────────────

router.get("/display/:roomCode", async (req, res) => {
  try {
    const { roomCode } = req.params;

    const [screen] = await db.select({
      id: tvScreensTable.id,
      organizationId: tvScreensTable.organizationId,
      displayName: tvScreensTable.displayName,
      isActive: tvScreensTable.isActive,
      branding: tvScreensTable.branding,
      contentConfig: tvScreensTable.contentConfig,
      unitId: tvScreensTable.unitId,
    }).from(tvScreensTable)
      .where(eq(tvScreensTable.roomCode, roomCode));

    if (!screen || !screen.isActive) return res.status(404).json({ error: "TV not found or inactive" });

    const orgId = screen.organizationId;
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    // Unit name via raw SQL to avoid Drizzle .name column shadow
    let unitName: string | null = null;
    let floor: number | null = null;
    if (screen.unitId) {
      const uRes = await db.execute<{nm: string, fl: number | null}>(
        sql`SELECT name AS nm, floor AS fl FROM units WHERE id = ${screen.unitId} LIMIT 1`
      );
      unitName = uRes.rows?.[0]?.nm ?? null;
      floor = uRes.rows?.[0]?.fl ?? null;
    }

    // Current booking
    let currentBooking: any = null;
    if (screen.unitId) {
      const bRes = await db.execute<any>(
        sql`SELECT id, first_name AS "firstName", last_name AS "lastName",
            check_in AS "checkIn", check_out AS "checkOut",
            status, booking_ref AS "bookingRef"
            FROM bookings
            WHERE unit_id = ${screen.unitId}
              AND check_in <= ${today} AND check_out >= ${today}
              AND status IN ('confirmed','checked_in') LIMIT 1`
      );
      if (bRes.rows?.length) currentBooking = bRes.rows[0];
    }

    // SPA upsells
    const spaRes = await db.execute<any>(
      sql`SELECT id, name, duration_minutes AS duration, price, category FROM spa_services
          WHERE organization_id = ${orgId} AND is_active = true
          ORDER BY sort_order LIMIT 4`
    );
    const spa = spaRes.rows || [];

    // F&B
    const fbRes = await db.execute<any>(
      sql`SELECT id, name, price, description FROM fb_items
          WHERE is_available = true AND is_popular = true LIMIT 6`
    );
    const fb = fbRes.rows || [];

    // Events
    const evRes = await db.execute<any>(
      sql`SELECT id, client_name AS "clientName", event_date AS "eventDate", start_time AS "startTime"
          FROM events
          WHERE organization_id = ${orgId}
            AND event_date >= ${today} AND event_date <= ${tomorrow}
            AND status NOT IN ('cancelled','completed')
          ORDER BY event_date, start_time LIMIT 5`
    );
    const events = evRes.rows || [];

    const guestAppUrl = currentBooking?.bookingRef
      ? `/maison-hd/guest-app?ref=${currentBooking.bookingRef}`
      : `/maison-hd/guest-app`;

    res.json({
      screen: { roomCode, displayName: screen.displayName, unitName, floor, branding: screen.branding, contentConfig: screen.contentConfig },
      currentBooking,
      guestAppUrl,
      hotel: { name: "Dogoda Resort", wifi: { ssid: "Dogoda_Guest", password: "welcome2026" }, checkOutTime: "12:00", phone: "+380 44 123 4567", address: "вул. Гірська 12, Яремче" },
      upsells: { spa, fb },
      events,
    });
  } catch (e: any) {
    console.error("TV display error:", e.stack || e.message);
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

router.post("/display/:roomCode/ping", async (req, res) => {
  try {
    await db.update(tvScreensTable).set({ lastPingAt: new Date() })
      .where(eq(tvScreensTable.roomCode, req.params.roomCode));
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

export default router;
