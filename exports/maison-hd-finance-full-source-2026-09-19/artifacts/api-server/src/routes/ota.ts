import { Router } from "express";
import { db } from "@workspace/db";
import { otaChannelConfigsTable, otaUnitMappingsTable, otaWebhookLogsTable, unitsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;

const CHANNEL_META: Record<string, { label: string; color: string; logo: string }> = {
  booking_com: { label: "Booking.com", color: "bg-blue-600", logo: "🏨" },
  airbnb: { label: "Airbnb", color: "bg-red-500", logo: "🏠" },
  expedia: { label: "Expedia", color: "bg-yellow-500", logo: "✈️" },
  agoda: { label: "Agoda", color: "bg-red-700", logo: "🌏" },
  ostrovok: { label: "Ostrovok.ru", color: "bg-orange-500", logo: "🏝️" },
  direct: { label: "Прямий канал", color: "bg-green-600", logo: "📲" },
};

async function seedDemoOTA(orgId: number) {
  const ex = await db.select({ id: otaChannelConfigsTable.id })
    .from(otaChannelConfigsTable).where(eq(otaChannelConfigsTable.organizationId, orgId)).limit(1);
  if (ex.length > 0) return;

  const units = await db.select({ id: unitsTable.id, name: unitsTable.name })
    .from(unitsTable).limit(10);

  const channels = await db.insert(otaChannelConfigsTable).values([
    {
      organizationId: orgId, channel: "booking_com" as any,
      displayName: "Booking.com — Dogoda Resort",
      status: "active" as any,
      propertyIdExt: "12345678",
      apiKey: "__REDACTED_FROM_AUDIT_ARCHIVE__",
      webhookSecret: "__REDACTED_FROM_AUDIT_ARCHIVE__",
      lastSyncAt: new Date(Date.now() - 1000 * 60 * 15),
      settings: { autoConfirm: true, syncInterval: 15, currency: "UAH" },
    },
    {
      organizationId: orgId, channel: "airbnb" as any,
      displayName: "Airbnb — Dogoda Bungalows",
      status: "active" as any,
      propertyIdExt: "987654321",
      apiKey: "__REDACTED_FROM_AUDIT_ARCHIVE__",
      lastSyncAt: new Date(Date.now() - 1000 * 60 * 45),
      settings: { autoConfirm: false, syncInterval: 30, currency: "USD" },
    },
    {
      organizationId: orgId, channel: "expedia" as any,
      displayName: "Expedia / Hotels.com",
      status: "error" as any,
      propertyIdExt: "EX-4567",
      lastError: "Authentication failed: invalid API key. Please reconnect.",
      settings: {},
    },
    {
      organizationId: orgId, channel: "ostrovok" as any,
      displayName: "Ostrovok.ru",
      status: "inactive" as any,
      settings: {},
    },
  ]).returning();

  if (channels.length >= 2 && units.length >= 3) {
    await db.insert(otaUnitMappingsTable).values([
      { organizationId: orgId, channelId: channels[0].id, unitId: units[0].id, extRoomId: "RM-101", extRoomName: "Standard Room", markupPercent: "0" },
      { organizationId: orgId, channelId: channels[0].id, unitId: units[1].id, extRoomId: "RM-102", extRoomName: "Deluxe Room", markupPercent: "5" },
      { organizationId: orgId, channelId: channels[0].id, unitId: units[2].id, extRoomId: "RM-201", extRoomName: "Family Suite", markupPercent: "0" },
      { organizationId: orgId, channelId: channels[1].id, unitId: units[0].id, extRoomId: "ABB-A1", extRoomName: "Cozy Bungalow", markupPercent: "10" },
      { organizationId: orgId, channelId: channels[1].id, unitId: units[2].id, extRoomId: "ABB-A2", extRoomName: "Family Bungalow", markupPercent: "8" },
    ]);
  }

  await db.insert(otaWebhookLogsTable).values([
    { organizationId: orgId, channelId: channels[0]?.id, eventType: "reservation_created" as any, status: "processed", bookingRef: "BDC-4891234", payload: { guest: "Müller Hans", checkIn: "2026-04-05", checkOut: "2026-04-08", amount: 12600, currency: "UAH" }, processedAt: new Date(Date.now() - 1000 * 60 * 14) },
    { organizationId: orgId, channelId: channels[0]?.id, eventType: "reservation_created" as any, status: "processed", bookingRef: "BDC-4891187", payload: { guest: "Smith John", checkIn: "2026-04-10", checkOut: "2026-04-12", amount: 8400, currency: "UAH" }, processedAt: new Date(Date.now() - 1000 * 60 * 60 * 2) },
    { organizationId: orgId, channelId: channels[0]?.id, eventType: "reservation_cancelled" as any, status: "processed", bookingRef: "BDC-4889002", payload: { guest: "Kovács Béla", reason: "Guest request" }, processedAt: new Date(Date.now() - 1000 * 60 * 60 * 5) },
    { organizationId: orgId, channelId: channels[1]?.id, eventType: "reservation_created" as any, status: "processed", bookingRef: "ABB-XY7892", payload: { guest: "Marie Dupont", checkIn: "2026-04-14", checkOut: "2026-04-17", amount: 285, currency: "USD" }, processedAt: new Date(Date.now() - 1000 * 60 * 40) },
    { organizationId: orgId, channelId: channels[1]?.id, eventType: "reservation_modified" as any, status: "processed", bookingRef: "ABB-XY7801", payload: { guest: "Tanaka Yuki", change: "dates_extended", newCheckOut: "2026-04-20" }, processedAt: new Date(Date.now() - 1000 * 60 * 60 * 3) },
    { organizationId: orgId, channelId: channels[0]?.id, eventType: "availability_update" as any, status: "processed", payload: { rooms: 3, date: "2026-04-15" }, processedAt: new Date(Date.now() - 1000 * 60 * 15) },
    { organizationId: orgId, channelId: channels[2]?.id, eventType: "ping" as any, status: "error", errorMessage: "Channel is not active or API key is invalid", receivedAt: new Date(Date.now() - 1000 * 60 * 30) },
  ]);
}

router.get("/stats", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemoOTA(orgId);
    const [channels, logs] = await Promise.all([
      db.select({ id: otaChannelConfigsTable.id, status: otaChannelConfigsTable.status })
        .from(otaChannelConfigsTable).where(eq(otaChannelConfigsTable.organizationId, orgId)),
      db.select({ id: otaWebhookLogsTable.id, status: otaWebhookLogsTable.status, eventType: otaWebhookLogsTable.eventType })
        .from(otaWebhookLogsTable).where(eq(otaWebhookLogsTable.organizationId, orgId)),
    ]);
    res.json({
      totalChannels: channels.length,
      activeChannels: channels.filter(c => c.status === "active").length,
      errorChannels: channels.filter(c => c.status === "error").length,
      totalEvents: logs.length,
      newReservations: logs.filter(l => l.eventType === "reservation_created").length,
      cancelledReservations: logs.filter(l => l.eventType === "reservation_cancelled").length,
      errors: logs.filter(l => l.status === "error").length,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/channels", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemoOTA(orgId);
    const channels = await db.select().from(otaChannelConfigsTable)
      .where(eq(otaChannelConfigsTable.organizationId, orgId))
      .orderBy(desc(otaChannelConfigsTable.createdAt));
    res.json({ channels, channelMeta: CHANNEL_META });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/channels", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { channel, displayName, apiKey, propertyIdExt, settings } = req.body;
    const [ch] = await db.insert(otaChannelConfigsTable).values({
      organizationId: orgId, channel, displayName, apiKey, propertyIdExt,
      settings: settings || {}, status: "pending" as any,
    }).returning();
    res.json({ channel: ch });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/channels/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const updates: any = { ...req.body, updatedAt: new Date() };
    if (req.body.status === "active") { updates.lastError = null; updates.lastSyncAt = new Date(); }
    const [ch] = await db.update(otaChannelConfigsTable).set(updates)
      .where(and(eq(otaChannelConfigsTable.id, parseInt(req.params.id)), eq(otaChannelConfigsTable.organizationId, orgId)))
      .returning();
    res.json({ channel: ch });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/channels/:id/sync", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const channelId = parseInt(req.params.id);
    const [ch] = await db.select().from(otaChannelConfigsTable)
      .where(and(eq(otaChannelConfigsTable.id, channelId), eq(otaChannelConfigsTable.organizationId, orgId)));
    if (!ch) return res.status(404).json({ error: "Channel not found" });
    if (ch.status !== "active") return res.status(400).json({ error: "Channel is not active" });

    await db.update(otaChannelConfigsTable).set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(otaChannelConfigsTable.id, channelId));

    await db.insert(otaWebhookLogsTable).values({
      organizationId: orgId, channelId,
      eventType: "availability_update" as any,
      status: "processed",
      payload: { type: "manual_sync", timestamp: new Date().toISOString() },
      processedAt: new Date(),
    });

    res.json({ ok: true, message: `${ch.displayName} — синхронізацію виконано` });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/logs", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { limit = 50, channelId } = req.query;
    const cond: any[] = [eq(otaWebhookLogsTable.organizationId, orgId)];
    if (channelId) cond.push(eq(otaWebhookLogsTable.channelId, parseInt(channelId as string)));
    const logs = await db.select({
      id: otaWebhookLogsTable.id,
      channelId: otaWebhookLogsTable.channelId,
      eventType: otaWebhookLogsTable.eventType,
      status: otaWebhookLogsTable.status,
      bookingRef: otaWebhookLogsTable.bookingRef,
      errorMessage: otaWebhookLogsTable.errorMessage,
      receivedAt: otaWebhookLogsTable.receivedAt,
      processedAt: otaWebhookLogsTable.processedAt,
      payload: otaWebhookLogsTable.payload,
      channelName: otaChannelConfigsTable.displayName,
      channelType: otaChannelConfigsTable.channel,
    }).from(otaWebhookLogsTable)
      .leftJoin(otaChannelConfigsTable, eq(otaWebhookLogsTable.channelId, otaChannelConfigsTable.id))
      .where(and(...cond))
      .orderBy(desc(otaWebhookLogsTable.receivedAt))
      .limit(parseInt(limit as string));
    res.json({ logs, channelMeta: CHANNEL_META });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/mappings", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const mappings = await db.select({
      id: otaUnitMappingsTable.id,
      channelId: otaUnitMappingsTable.channelId,
      unitId: otaUnitMappingsTable.unitId,
      extRoomId: otaUnitMappingsTable.extRoomId,
      extRoomName: otaUnitMappingsTable.extRoomName,
      markupPercent: otaUnitMappingsTable.markupPercent,
      isActive: otaUnitMappingsTable.isActive,
      unitName: unitsTable.name,
      channelName: otaChannelConfigsTable.displayName,
      channelType: otaChannelConfigsTable.channel,
    }).from(otaUnitMappingsTable)
      .innerJoin(unitsTable, eq(otaUnitMappingsTable.unitId, unitsTable.id))
      .innerJoin(otaChannelConfigsTable, eq(otaUnitMappingsTable.channelId, otaChannelConfigsTable.id))
      .where(eq(otaUnitMappingsTable.organizationId, orgId));
    res.json({ mappings, channelMeta: CHANNEL_META });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Public webhook receiver
router.post("/webhook/:channelSecret", async (req, res) => {
  try {
    const channel = await db.select().from(otaChannelConfigsTable)
      .where(eq(otaChannelConfigsTable.webhookSecret, req.params.channelSecret)).limit(1);
    if (!channel.length) return res.status(404).json({ error: "Unknown channel" });
    const ch = channel[0];
    await db.insert(otaWebhookLogsTable).values({
      organizationId: ch.organizationId, channelId: ch.id,
      eventType: (req.body.event_type || "ping") as any,
      payload: req.body, status: "received",
      bookingRef: req.body.reservation_id || req.body.booking_ref || null,
    });
    res.json({ ok: true, received: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
