import { Router } from "express";
import { db } from "@workspace/db";
import { otaChannelsTable, webhookEndpointsTable, integrationLogsTable } from "@workspace/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
const getOrg = (req: any): number => (req as any).user?.organizationId;

// ─── OTA Channels ────────────────────────────────────────────────────────────

router.get("/ota", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  const channels = await db.select().from(otaChannelsTable)
    .where(orgId ? sql`ota_channels.organization_id = ${orgId}` : undefined)
    .orderBy(desc(otaChannelsTable.createdAt));
  res.json(channels);
});

router.post("/ota", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  const { name, channelType, apiKey, apiSecret, apiUrl, commissionRate, syncEnabled, syncInterval } = req.body;
  if (!name || !channelType) {
    return res.status(400).json({ error: "name and channelType are required" });
  }
  const [channel] = await db.insert(otaChannelsTable).values({
    organizationId: orgId,
    name,
    channelType,
    apiKey: apiKey || null,
    apiSecret: apiSecret || null,
    apiUrl: apiUrl || null,
    commissionRate: commissionRate ?? 15.0,
    syncEnabled: syncEnabled ?? true,
    syncInterval: syncInterval ?? 15,
  } as any).returning();
  res.status(201).json(channel);
});

router.put("/ota/:id", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  const id = parseInt(req.params.id);
  const { name, channelType, apiKey, apiSecret, apiUrl, commissionRate, syncEnabled, syncInterval, isActive } = req.body;
  const db_ = (db as any).$client;
  const existingR = await db_.query(`SELECT * FROM ota_channels WHERE id = $1 LIMIT 1`, [id]);
  const existing = existingR.rows[0];
  if (!existing) return res.status(404).json({ error: "Channel not found" });
  if (orgId && existing.organization_id !== orgId) return res.status(403).json({ error: "Forbidden" });
  const [updated] = await db.update(otaChannelsTable)
    .set({ name, channelType, apiKey, apiSecret, apiUrl, commissionRate, syncEnabled, syncInterval, isActive, updatedAt: new Date() })
    .where(eq(otaChannelsTable.id, id))
    .returning();
  res.json(updated);
});

router.patch("/ota/:id/toggle", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  const id = parseInt(req.params.id);
  const db_ = (db as any).$client;
  const cR = await db_.query(`SELECT * FROM ota_channels WHERE id = $1 LIMIT 1`, [id]);
  const channel = cR.rows[0];
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (orgId && channel.organization_id !== orgId) return res.status(403).json({ error: "Forbidden" });

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
  const orgId = getOrg(req);
  const id = parseInt(req.params.id);
  const db_ = (db as any).$client;
  const cR = await db_.query(`SELECT organization_id FROM ota_channels WHERE id = $1 LIMIT 1`, [id]);
  const channel = cR.rows[0];
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (orgId && channel.organization_id !== orgId) return res.status(403).json({ error: "Forbidden" });
  await db.delete(otaChannelsTable).where(eq(otaChannelsTable.id, id));
  res.status(204).send();
});

router.post("/ota/:id/sync", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  const id = parseInt(req.params.id);
  const db_ = (db as any).$client;
  const cR = await db_.query(`SELECT * FROM ota_channels WHERE id = $1 LIMIT 1`, [id]);
  const channel = cR.rows[0];
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (orgId && channel.organization_id !== orgId) return res.status(403).json({ error: "Forbidden" });

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
  const orgId = getOrg(req);
  const webhooks = await db.select().from(webhookEndpointsTable)
    .where(orgId ? sql`webhook_endpoints.organization_id = ${orgId}` : undefined)
    .orderBy(desc(webhookEndpointsTable.createdAt));
  res.json(webhooks);
});

router.post("/webhooks", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  const { name, url, secret, events, isActive } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: "name and url are required" });
  }
  const [webhook] = await db.insert(webhookEndpointsTable).values({
    organizationId: orgId,
    name,
    url,
    secret: secret || null,
    events: events || [],
    isActive: isActive ?? true,
  } as any).returning();

  await db.insert(integrationLogsTable).values({
    type: "webhook_created",
    status: "success",
    message: `Webhook endpoint "${name}" created`,
  });

  res.status(201).json(webhook);
});

router.put("/webhooks/:id", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  const id = parseInt(req.params.id);
  const db_ = (db as any).$client;
  const eR = await db_.query(`SELECT organization_id FROM webhook_endpoints WHERE id = $1 LIMIT 1`, [id]);
  if (!eR.rows[0]) return res.status(404).json({ error: "Webhook not found" });
  if (orgId && eR.rows[0].organization_id !== orgId) return res.status(403).json({ error: "Forbidden" });
  const { name, url, secret, events, isActive } = req.body;
  const [updated] = await db.update(webhookEndpointsTable)
    .set({ name, url, secret, events, isActive })
    .where(eq(webhookEndpointsTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/webhooks/:id", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  const id = parseInt(req.params.id);
  const db_ = (db as any).$client;
  const eR = await db_.query(`SELECT organization_id FROM webhook_endpoints WHERE id = $1 LIMIT 1`, [id]);
  if (!eR.rows[0]) return res.status(404).json({ error: "Webhook not found" });
  if (orgId && eR.rows[0].organization_id !== orgId) return res.status(403).json({ error: "Forbidden" });
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
