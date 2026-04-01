import { Router } from "express";
import { db } from "@workspace/db";
import { otaChannelsTable, webhookEndpointsTable, integrationLogsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// ─── OTA Channels ────────────────────────────────────────────────────────────

router.get("/ota", requireAuth, async (req, res) => {
  const channels = await db.select().from(otaChannelsTable).orderBy(desc(otaChannelsTable.createdAt));
  res.json(channels);
});

router.post("/ota", requireAuth, async (req, res) => {
  const { name, channelType, apiKey, apiSecret, apiUrl, commissionRate, syncEnabled, syncInterval } = req.body;
  if (!name || !channelType) {
    return res.status(400).json({ error: "name and channelType are required" });
  }
  const [channel] = await db.insert(otaChannelsTable).values({
    name,
    channelType,
    apiKey: apiKey || null,
    apiSecret: apiSecret || null,
    apiUrl: apiUrl || null,
    commissionRate: commissionRate ?? 15.0,
    syncEnabled: syncEnabled ?? true,
    syncInterval: syncInterval ?? 15,
  }).returning();
  res.status(201).json(channel);
});

router.put("/ota/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, channelType, apiKey, apiSecret, apiUrl, commissionRate, syncEnabled, syncInterval, isActive } = req.body;
  const [updated] = await db.update(otaChannelsTable)
    .set({ name, channelType, apiKey, apiSecret, apiUrl, commissionRate, syncEnabled, syncInterval, isActive, updatedAt: new Date() })
    .where(eq(otaChannelsTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Channel not found" });
  res.json(updated);
});

router.patch("/ota/:id/toggle", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [channel] = await db.select().from(otaChannelsTable).where(eq(otaChannelsTable.id, id)).limit(1);
  if (!channel) return res.status(404).json({ error: "Channel not found" });

  const [updated] = await db.update(otaChannelsTable)
    .set({ syncEnabled: !channel.syncEnabled, updatedAt: new Date() })
    .where(eq(otaChannelsTable.id, id))
    .returning();

  await db.insert(integrationLogsTable).values({
    channelId: id,
    type: "ota_toggle",
    status: "success",
    message: `Sync ${updated.syncEnabled ? "enabled" : "disabled"} for channel "${channel.name}"`,
  });

  res.json(updated);
});

router.delete("/ota/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(otaChannelsTable).where(eq(otaChannelsTable.id, id));
  res.status(204).send();
});

router.post("/ota/:id/sync", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [channel] = await db.select().from(otaChannelsTable).where(eq(otaChannelsTable.id, id)).limit(1);
  if (!channel) return res.status(404).json({ error: "Channel not found" });

  const [updated] = await db.update(otaChannelsTable)
    .set({ lastSync: new Date(), updatedAt: new Date() })
    .where(eq(otaChannelsTable.id, id))
    .returning();

  await db.insert(integrationLogsTable).values({
    channelId: id,
    type: "ota_sync",
    status: "success",
    message: `Manual sync initiated for channel "${channel.name}"`,
    responseData: { importedBookings: 0, timestamp: new Date().toISOString() },
  });

  res.json({ message: "Sync initiated", channel: updated, importedBookings: 0 });
});

// ─── Webhook Endpoints ────────────────────────────────────────────────────────

router.get("/webhooks", requireAuth, async (req, res) => {
  const webhooks = await db.select().from(webhookEndpointsTable).orderBy(desc(webhookEndpointsTable.createdAt));
  res.json(webhooks);
});

router.post("/webhooks", requireAuth, async (req, res) => {
  const { name, url, secret, events, isActive } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: "name and url are required" });
  }
  const [webhook] = await db.insert(webhookEndpointsTable).values({
    name,
    url,
    secret: secret || null,
    events: events || [],
    isActive: isActive ?? true,
  }).returning();

  await db.insert(integrationLogsTable).values({
    type: "webhook_created",
    status: "success",
    message: `Webhook endpoint "${name}" created`,
  });

  res.status(201).json(webhook);
});

router.put("/webhooks/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, url, secret, events, isActive } = req.body;
  const [updated] = await db.update(webhookEndpointsTable)
    .set({ name, url, secret, events, isActive })
    .where(eq(webhookEndpointsTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Webhook not found" });
  res.json(updated);
});

router.delete("/webhooks/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(webhookEndpointsTable).where(eq(webhookEndpointsTable.id, id));
  res.status(204).send();
});

// ─── Integration Logs ─────────────────────────────────────────────────────────

router.get("/logs", requireAuth, async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const channelId = req.query.channelId ? parseInt(req.query.channelId as string) : undefined;

  const conditions = channelId ? [eq(integrationLogsTable.channelId, channelId)] : [];
  const logs = await db.select().from(integrationLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(integrationLogsTable.createdAt))
    .limit(limit);

  res.json(logs);
});

export default router;
