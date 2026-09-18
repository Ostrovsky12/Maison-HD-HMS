import { Router } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { requireAuth, requireRole } from "../lib/auth.js";
import { db } from "../db/index.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq, and, desc, asc, gte, count, sql } from "drizzle-orm";
import {
  pgTable, serial, integer, smallint, varchar, text, boolean,
  timestamp, date, numeric,
} from "drizzle-orm/pg-core";
import { broadcastToOrganization } from "../lib/ws-broadcaster.js";
import { decrypt, encrypt } from "../lib/encrypt.js";
import { logger } from "../lib/logger.js";

// Binotel server IPs (for webhook security)
const BINOTEL_IPS = new Set([
  "194.88.218.116","194.88.218.114","194.88.218.117","194.88.218.118",
  "194.88.219.67","194.88.219.78","194.88.219.70","194.88.219.71",
  "194.88.219.72","194.88.219.79","194.88.219.80","194.88.219.81",
  "194.88.219.82","194.88.219.83","194.88.219.84","194.88.219.85",
  "194.88.219.86","194.88.219.87",
]);

// ── Inline schemas ────────────────────────────────────────────────────────────
export const settingsTable = pgTable("telephony_settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  greetingMessage: text("greeting_message"),
  businessHoursStart: varchar("business_hours_start", { length: 5 }).default("08:00"),
  businessHoursEnd: varchar("business_hours_end", { length: 5 }).default("22:00"),
  afterHoursAction: varchar("after_hours_action", { length: 20 }).default("voicemail"),
  maxQueueSize: smallint("max_queue_size").default(5),
  ringTimeoutSec: smallint("ring_timeout_sec").default(30),
  ivrEnabled: boolean("ivr_enabled").notNull().default(true),
  recordingEnabled: boolean("recording_enabled").notNull().default(true),
  aiSummaryEnabled: boolean("ai_summary_enabled").notNull().default(true),
  mainNumber: varchar("main_number", { length: 30 }),
  // Binotel integration
  binotelEnabled: boolean("binotel_enabled").notNull().default(false),
  binotelCompanyId: varchar("binotel_company_id", { length: 50 }),
  binotelApiKey: varchar("binotel_api_key", { length: 255 }),
  binotelApiSecret: varchar("binotel_api_secret", { length: 255 }),
  binotelSecretToken: varchar("binotel_secret_token", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const linesTable = pgTable("phone_lines", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  extension: varchar("extension", { length: 10 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  assignedUserId: integer("assigned_user_id"),
  department: varchar("department", { length: 50 }),
  status: varchar("status", { length: 20 }).notNull().default("offline"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const callLogsTable = pgTable("call_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  direction: varchar("direction", { length: 10 }).notNull().default("inbound"),
  callerNumber: varchar("caller_number", { length: 30 }),
  calleeNumber: varchar("callee_number", { length: 30 }),
  callerName: varchar("caller_name", { length: 255 }),
  lineId: integer("line_id"),
  assignedUserId: integer("assigned_user_id"),
  guestId: integer("guest_id"),
  status: varchar("status", { length: 20 }).notNull().default("completed"),
  durationSec: integer("duration_sec").default(0),
  waitTimeSec: integer("wait_time_sec").default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  notes: text("notes"),
  aiSummary: text("ai_summary"),
  aiSentiment: varchar("ai_sentiment", { length: 20 }),
  aiActionItems: text("ai_action_items"),
  recordingUrl: text("recording_url"),
  ivrPath: text("ivr_path"),
  // Binotel integration fields
  externalCallId: varchar("external_call_id", { length: 100 }),
  operatorName: varchar("operator_name", { length: 255 }),
  operatorEmail: varchar("operator_email", { length: 255 }),
  isNewCaller: boolean("is_new_caller").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

const scriptsTable = pgTable("call_scripts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  scenario: varchar("scenario", { length: 50 }).notNull().default("general"),
  content: text("content").notNull(),
  tags: text("tags"),
  isActive: boolean("is_active").notNull().default(true),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const voicemailsTable = pgTable("voicemails", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  callerNumber: varchar("caller_number", { length: 30 }),
  callerName: varchar("caller_name", { length: 255 }),
  durationSec: integer("duration_sec").default(0),
  transcript: text("transcript"),
  aiSummary: text("ai_summary"),
  isRead: boolean("is_read").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  recordingUrl: text("recording_url"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

const ivrMenusTable = pgTable("ivr_menus", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  parentId: integer("parent_id"),
  keyPress: varchar("key_press", { length: 1 }),
  label: varchar("label", { length: 100 }).notNull(),
  action: varchar("action", { length: 30 }).notNull().default("submenu"),
  target: varchar("target", { length: 255 }),
  sortOrder: smallint("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

const router = Router();
const getOrgId = (req: any) => req.user?.organizationId;
const MASKED_SECRET = "••••••••";
const BINOTEL_API_BASE = "https://api.binotel.com/api/4.0";

function safeSettings(settings: any) {
  return {
    ...settings,
    binotelApiKey: settings.binotelApiKey ? MASKED_SECRET : "",
    binotelApiSecret: settings.binotelApiSecret ? MASKED_SECRET : "",
    binotelSecretToken: undefined,
    binotelApiKeyConfigured: Boolean(settings.binotelApiKey),
    binotelApiSecretConfigured: Boolean(settings.binotelApiSecret),
  };
}

function isMaskedSecret(value: unknown): boolean {
  return typeof value === "string" && value.includes("•");
}

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

// ── Settings ──────────────────────────────────────────────────────────────────
router.get("/settings", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const [s] = await db.select().from(settingsTable).where(eq(settingsTable.organizationId, orgId));
    if (!s) {
      const [created] = await db.insert(settingsTable).values({ organizationId: orgId }).returning();
      return res.json(safeSettings(created));
    }
    res.json(safeSettings(s));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/settings", requireAuth, requireRole("super_admin", "owner", "manager"), async (req: any, res) => {
  const orgId = getOrgId(req);
  const upd: any = {};
  for (const f of [
    "isEnabled","greetingMessage","businessHoursStart","businessHoursEnd","afterHoursAction",
    "maxQueueSize","ringTimeoutSec","ivrEnabled","recordingEnabled","aiSummaryEnabled","mainNumber",
    "binotelEnabled","binotelCompanyId",
  ]) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  for (const field of ["binotelApiKey", "binotelApiSecret"] as const) {
    const value = req.body[field];
    if (value === undefined || value === "" || isMaskedSecret(value)) continue;
    upd[field] = value === null ? null : encrypt(String(value).trim());
  }
  upd.updatedAt = new Date();
  try {
    const [current] = await db.select().from(settingsTable).where(eq(settingsTable.organizationId, orgId));
    if (req.body.binotelEnabled && !current?.binotelSecretToken) {
      upd.binotelSecretToken = encrypt(randomBytes(32).toString("base64url"));
    }
    const [s] = await db.update(settingsTable).set(upd).where(eq(settingsTable.organizationId, orgId)).returning();
    if (!s) return res.status(404).json({ error: "Telephony settings not found" });
    res.json(safeSettings(s));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Phone lines ───────────────────────────────────────────────────────────────
router.get("/lines", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const rows = await db.select().from(linesTable)
      .where(and(eq(linesTable.organizationId, orgId), eq(linesTable.isActive, true)))
      .orderBy(asc(linesTable.extension));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/lines", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { extension, label, department } = req.body;
  if (!extension || !label) return res.status(400).json({ error: "extension and label required" });
  try {
    const [line] = await db.insert(linesTable).values({ organizationId: orgId, extension, label, department }).returning();
    res.status(201).json(line);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/lines/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const upd: any = {};
  for (const f of ["label","department","status","isActive","assignedUserId"]) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  try {
    const [line] = await db.update(linesTable).set(upd)
      .where(and(eq(linesTable.id, id), eq(linesTable.organizationId, orgId))).returning();
    res.json(line);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Call logs ─────────────────────────────────────────────────────────────────
router.get("/calls", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { limit = "50" } = req.query as any;
  try {
    const rows = await db.select().from(callLogsTable)
      .where(eq(callLogsTable.organizationId, orgId))
      .orderBy(desc(callLogsTable.startedAt))
      .limit(parseInt(limit));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/calls", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { direction, callerNumber, callerName, calleeNumber, lineId, status, durationSec, waitTimeSec, notes } = req.body;
  try {
    const [call] = await db.insert(callLogsTable).values({
      organizationId: orgId, direction: direction || "inbound", callerNumber, callerName, calleeNumber,
      lineId, status: status || "completed", durationSec, waitTimeSec, notes,
      startedAt: new Date(), endedAt: status !== "missed" ? new Date() : undefined,
    }).returning();
    res.status(201).json(call);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/calls/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const upd: any = {};
  for (const f of ["status","durationSec","notes","aiSummary","aiSentiment","aiActionItems"]) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  try {
    const [call] = await db.update(callLogsTable).set(upd)
      .where(and(eq(callLogsTable.id, id), eq(callLogsTable.organizationId, orgId))).returning();
    res.json(call);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── AI Summarize call ─────────────────────────────────────────────────────────
router.post("/calls/:id/summarize", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  try {
    const [call] = await db.select().from(callLogsTable)
      .where(and(eq(callLogsTable.id, id), eq(callLogsTable.organizationId, orgId)));
    if (!call) return res.status(404).json({ error: "Call not found" });

    const notesText = call.notes || "Нотатки відсутні";
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      max_completion_tokens: 1024,
      messages: [{
        role: "system",
        content: `Ти асистент call-центру готелю. Аналізуй нотатки дзвінків та генеруй структуровані підсумки.
Відповідай строго в JSON форматі:
{
  "summary": "Короткий підсумок 1-2 речення",
  "sentiment": "positive|neutral|negative",
  "sentimentReason": "Чому такий настрій",
  "actionItems": ["дія 1", "дія 2"],
  "category": "booking|complaint|inquiry|upsell|confirmation|other",
  "urgency": "low|medium|high"
}`
      }, {
        role: "user",
        content: `Проаналізуй дзвінок:
Напрямок: ${call.direction === "inbound" ? "Вхідний" : "Вихідний"}
Тривалість: ${call.durationSec}с
Статус: ${call.status}
Нотатки оператора: ${notesText}`,
      }],
    });

    let parsed: any = {};
    try {
      const raw = completion.choices[0]?.message?.content || "{}";
      parsed = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch { parsed = { summary: completion.choices[0]?.message?.content, sentiment: "neutral", actionItems: [] }; }

    const [updated] = await db.update(callLogsTable).set({
      aiSummary: parsed.summary,
      aiSentiment: parsed.sentiment,
      aiActionItems: JSON.stringify(parsed.actionItems || []),
    }).where(eq(callLogsTable.id, id)).returning();

    res.json({ ...updated, aiCategory: parsed.category, aiUrgency: parsed.urgency, aiSentimentReason: parsed.sentimentReason, aiActionItemsParsed: parsed.actionItems || [] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── AI Suggest script ─────────────────────────────────────────────────────────
router.post("/ai/suggest-script", requireAuth, async (req: any, res) => {
  const { scenario, context } = req.body;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      max_completion_tokens: 1024,
      messages: [{
        role: "system",
        content: "Ти досвідчений тренер для операторів готельного call-центру. Генеруй чіткі, ввічливі та ефективні скрипти розмов українською мовою."
      }, {
        role: "user",
        content: `Згенеруй скрипт для сценарію "${scenario}"${context ? `. Контекст: ${context}` : ""}. Використовуй кроки, підказки та варіанти відповідей.`,
      }],
    });
    res.json({ script: completion.choices[0]?.message?.content });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Call scripts ──────────────────────────────────────────────────────────────
router.get("/scripts", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const rows = await db.select().from(scriptsTable)
      .where(and(eq(scriptsTable.organizationId, orgId), eq(scriptsTable.isActive, true)))
      .orderBy(desc(scriptsTable.usageCount));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/scripts", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { title, scenario, content, tags } = req.body;
  if (!title || !content) return res.status(400).json({ error: "title and content required" });
  try {
    const [s] = await db.insert(scriptsTable).values({ organizationId: orgId, title, scenario: scenario || "general", content, tags }).returning();
    res.status(201).json(s);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/scripts/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const upd: any = { updatedAt: new Date() };
  for (const f of ["title","scenario","content","tags","isActive","usageCount"]) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  try {
    const [s] = await db.update(scriptsTable).set(upd)
      .where(and(eq(scriptsTable.id, id), eq(scriptsTable.organizationId, orgId))).returning();
    res.json(s);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/scripts/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  try {
    await db.delete(scriptsTable).where(and(eq(scriptsTable.id, id), eq(scriptsTable.organizationId, orgId)));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Voicemails ────────────────────────────────────────────────────────────────
router.get("/voicemails", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const rows = await db.select().from(voicemailsTable)
      .where(and(eq(voicemailsTable.organizationId, orgId), eq(voicemailsTable.isArchived, false)))
      .orderBy(desc(voicemailsTable.receivedAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/voicemails/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const upd: any = {};
  for (const f of ["isRead","isArchived"]) { if (req.body[f] !== undefined) upd[f] = req.body[f]; }
  try {
    const [vm] = await db.update(voicemailsTable).set(upd)
      .where(and(eq(voicemailsTable.id, id), eq(voicemailsTable.organizationId, orgId))).returning();
    res.json(vm);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── IVR ───────────────────────────────────────────────────────────────────────
router.get("/ivr", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const nodes = await db.select().from(ivrMenusTable)
      .where(eq(ivrMenusTable.organizationId, orgId))
      .orderBy(asc(ivrMenusTable.sortOrder));
    res.json(nodes);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/ivr", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { parentId, keyPress, label, action, target, sortOrder } = req.body;
  if (!label || !action) return res.status(400).json({ error: "label and action required" });
  try {
    const [node] = await db.insert(ivrMenusTable).values({ organizationId: orgId, parentId, keyPress, label, action, target, sortOrder }).returning();
    res.status(201).json(node);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/ivr/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const upd: any = {};
  for (const f of ["keyPress","label","action","target","sortOrder"]) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  try {
    const [node] = await db.update(ivrMenusTable).set(upd)
      .where(and(eq(ivrMenusTable.id, id), eq(ivrMenusTable.organizationId, orgId))).returning();
    res.json(node);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/ivr/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  try {
    await db.delete(ivrMenusTable).where(and(eq(ivrMenusTable.id, id), eq(ivrMenusTable.organizationId, orgId)));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Statistics ────────────────────────────────────────────────────────────────
router.get("/stats", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const calls = await db.select().from(callLogsTable).where(eq(callLogsTable.organizationId, orgId));
    const todayCalls = calls.filter(c => new Date(c.startedAt) >= todayStart);
    const lines = await db.select().from(linesTable).where(and(eq(linesTable.organizationId, orgId), eq(linesTable.isActive, true)));
    const unreadVoicemails = await db.select({ c: count() }).from(voicemailsTable)
      .where(and(eq(voicemailsTable.organizationId, orgId), eq(voicemailsTable.isRead, false)));

    const answered = calls.filter(c => c.status === "completed");
    const avgDur = answered.length ? Math.round(answered.reduce((s, c) => s + (c.durationSec || 0), 0) / answered.length) : 0;
    const avgWait = answered.length ? Math.round(answered.reduce((s, c) => s + (c.waitTimeSec || 0), 0) / answered.length) : 0;

    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: calls.filter(c => new Date(c.startedAt).getHours() === h).length,
    }));

    res.json({
      totalCalls: calls.length,
      todayCalls: todayCalls.length,
      answered: calls.filter(c => c.status === "completed").length,
      missed: calls.filter(c => c.status === "missed").length,
      voicemail: calls.filter(c => c.status === "voicemail").length,
      avgDurationSec: avgDur,
      avgWaitSec: avgWait,
      answerRate: calls.length ? Math.round(calls.filter(c => c.status === "completed").length / calls.length * 100) : 0,
      linesTotal: lines.length,
      linesOnline: lines.filter(l => l.status === "online").length,
      linesBusy: lines.filter(l => l.status === "busy").length,
      unreadVoicemails: Number(unreadVoicemails[0]?.c ?? 0),
      sentimentBreakdown: {
        positive: calls.filter(c => c.aiSentiment === "positive").length,
        neutral: calls.filter(c => c.aiSentiment === "neutral").length,
        negative: calls.filter(c => c.aiSentiment === "negative").length,
      },
      byHour,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Binotel Webhooks (no auth — IP filtered) ──────────────────────────────────

// Helper: look up guest by phone number
async function findGuestByPhone(orgId: number, phone: string) {
  try {
    // Normalize: remove spaces, dashes; ensure 38 prefix for Ukrainian numbers
    const clean = phone.replace(/[\s\-\(\)]/g, "");
    const variants = [clean, clean.replace(/^380/, "0"), clean.replace(/^0/, "380")];
    const rows = await db.execute(sql`
      SELECT id, first_name || ' ' || last_name AS name FROM guests
      WHERE organization_id = ${orgId}
        AND REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', '') = ANY(${variants})
      LIMIT 1
    `);
    return rows.rows[0] as { id: number; name: string } | undefined;
  } catch { return undefined; }
}

// Helper: get org by Binotel company ID (for webhook routing)
async function findOrgByBinotelCompanyId(companyId: string) {
  try {
    const rows = await db.execute(sql`
      SELECT ts.organization_id as id,
             ts.binotel_secret_token as "secretToken",
             o.name
      FROM telephony_settings ts
      JOIN organizations o ON o.id = ts.organization_id
      WHERE ts.binotel_company_id = ${companyId} AND ts.binotel_enabled = true
      LIMIT 1
    `);
    return rows.rows[0] as { id: number; name: string; secretToken: string | null } | undefined;
  } catch { return undefined; }
}

function hasValidWebhookToken(provided: unknown, stored: string | null): boolean {
  const expected = decrypt(stored) || "";
  return typeof provided === "string" && Boolean(expected) && secureEqual(provided, expected);
}

// Middleware to check Binotel IP (allow local for testing)
function binotelIpGuard(req: any, res: any, next: any) {
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim();
  // Allow Binotel IPs + localhost for dev testing
  if (BINOTEL_IPS.has(ip) || ip === "127.0.0.1" || ip === "::1" || ip?.startsWith("::ffff:127.") || ip?.startsWith("10.") || ip?.startsWith("172.") || ip?.startsWith("192.168.")) {
    return next();
  }
  return res.status(403).json({ error: "Forbidden" });
}

// POST /telephony/binotel/call-settings
// Called by Binotel on EVERY incoming call (before operator answers)
// We respond with customerData to show caller info in Binotel's Chrome plugin
router.post("/binotel/call-settings", binotelIpGuard, async (req: any, res) => {
  try {
    const body = req.body;
    const companyId = String(body.companyID || "");
    const callerNumber = String(body.callerIDNum || body.externalNumber || "");
    const callType = Number(body.callType ?? 0); // 0=in, 1=out, 2=internal

    // Find org
    const org = await findOrgByBinotelCompanyId(companyId);
    if (!org) return res.json({}); // Unknown org — return empty, Binotel continues normally
    if (!hasValidWebhookToken(req.query.token, org.secretToken)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const orgId = org.id;

    // Look up guest by phone
    const guest = callerNumber ? await findGuestByPhone(orgId, callerNumber) : undefined;

    // Broadcast real-time incoming call notification to all connected staff
    broadcastToOrganization(orgId, {
      type: "binotel-incoming",
      callerNumber,
      callerName: guest?.name || null,
      guestId: guest?.id || null,
      generalCallId: body.generalCallID,
      internalNumber: body.internalNumber,
      isGuest: !!guest,
      callType,
    });

    // Respond with customer data for Binotel Chrome plugin
    const baseUrl = process.env["PUBLIC_URL"] || "";
    if (guest) {
      return res.json({
        customerData: {
          name: guest.name,
          description: `Гість ${org.name}`,
          linkToCrmUrl: `${baseUrl}/maison-hd/guests`,
          linkToCrmTitle: "Відкрити в CRM",
        },
      });
    }

    // New caller — show link to create guest
    return res.json({
      customerData: {
        name: "Новий гість",
        linkToCrmUrl: `${baseUrl}/maison-hd/guests`,
        linkToCrmTitle: "Додати гостя",
      },
    });
  } catch (e: any) {
    logger.error({ err: e }, "Binotel call-settings failed");
    res.json({});
  }
});

// POST /telephony/binotel/call-completed
// Called by Binotel after each call ends — auto-log the call
router.post("/binotel/call-completed", binotelIpGuard, async (req: any, res) => {
  try {
    const body = req.body;
    const callDetails = body.callDetails || {};
    let acceptedCalls = 0;

    for (const [generalCallId, call] of Object.entries(callDetails as Record<string, any>)) {
      const companyId = String(call.companyID || "");
      const org = await findOrgByBinotelCompanyId(companyId);
      if (!org) continue;
      if (!hasValidWebhookToken(req.query.token, org.secretToken)) continue;
      acceptedCalls += 1;

      const orgId = org.id;
      const externalNumber = call.externalNumber || call.callerIDNum || "";
      const callType: number = call.callType ?? 0;
      const direction = callType === 1 ? "outbound" : callType === 2 ? "internal" : "inbound";
      const billsec: number = call.billsec || 0;
      const waitsec: number = call.waitsec || 0;
      const disposition: string = call.disposition || "NOANSWER";
      const startTime: number = call.startTime || Math.floor(Date.now() / 1000);
      const operatorName: string = call.employeeData?.name || "";
      const operatorEmail: string = call.employeeData?.email || "";
      const clientName: string = call.customerData?.name || "";
      const isNewCaller: boolean = (call.isNewCall ?? 0) === 1;
      const recordingUrl: string = call.recordingURL || call.recordingUrl || "";

      // Map Binotel disposition to our status
      let status = "completed";
      if (disposition === "NOANSWER" || disposition === "BUSY" || disposition === "FAILED") {
        status = "missed";
      }

      // Find guest by phone
      const guest = externalNumber ? await findGuestByPhone(orgId, externalNumber) : undefined;

      // Look up settings for AI summary toggle
      const [settings] = await db.select({ aiEnabled: settingsTable.aiSummaryEnabled })
        .from(settingsTable).where(eq(settingsTable.organizationId, orgId));

      // Create call log entry
      const [callLog] = await db.insert(callLogsTable).values({
        organizationId: orgId,
        direction,
        callerNumber: externalNumber,
        callerName: clientName || guest?.name || null,
        status,
        durationSec: billsec,
        waitTimeSec: waitsec,
        startedAt: new Date(startTime * 1000),
        endedAt: billsec > 0 ? new Date((startTime + billsec) * 1000) : new Date(),
        recordingUrl: recordingUrl || null,
        externalCallId: String(generalCallId),
        operatorName: operatorName || null,
        operatorEmail: operatorEmail || null,
        guestId: guest?.id || null,
        isNewCaller,
        notes: `Binotel: ${direction === "inbound" ? "Вхідний" : "Вихідний"} дзвінок. Оператор: ${operatorName || "невідомо"}`,
      }).returning();

      // Auto AI summary for completed calls
      if (settings?.aiEnabled && status === "completed" && billsec > 30) {
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4.1-nano",
            max_completion_tokens: 512,
            messages: [{
              role: "system",
              content: `Ти асистент call-центру готелю. Відповідай в JSON: {"summary":"...","sentiment":"positive|neutral|negative","actionItems":["..."]}`
            }, {
              role: "user",
              content: `Дзвінок від ${clientName || externalNumber}, тривалість ${billsec}с, оператор ${operatorName}. Тип: ${direction}. Нові гості: ${isNewCaller}.`,
            }],
          });
          const raw = completion.choices[0]?.message?.content || "{}";
          const parsed = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
          await db.update(callLogsTable).set({
            aiSummary: parsed.summary,
            aiSentiment: parsed.sentiment,
            aiActionItems: JSON.stringify(parsed.actionItems || []),
          }).where(eq(callLogsTable.id, callLog.id));
        } catch { /* AI summary optional */ }
      }

      // Broadcast completion to UI
      broadcastToOrganization(orgId, {
        type: "binotel-completed",
        callLogId: callLog.id,
        callerNumber: externalNumber,
        callerName: clientName || guest?.name || null,
        status,
        durationSec: billsec,
        direction,
        operatorName,
        isNewCaller,
      });
    }

    if (Object.keys(callDetails).length > 0 && acceptedCalls === 0) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json({ status: "ok" });
  } catch (e: any) {
    logger.error({ err: e }, "Binotel call-completed failed");
    res.status(500).json({ error: "Failed to process Binotel webhook" });
  }
});

// GET /telephony/binotel/test
// Test endpoint — allows manual testing of the webhook (no IP check)
router.get("/binotel/test", requireAuth, requireRole("super_admin", "owner", "manager"), async (req: any, res) => {
  const orgId = getOrgId(req);
  const publicUrl = process.env.PUBLIC_URL?.replace(/\/+$/, "");
  if (!publicUrl?.startsWith("https://")) {
    return res.status(503).json({ error: "PUBLIC_URL is not configured" });
  }
  let [settings] = await db.select().from(settingsTable).where(eq(settingsTable.organizationId, orgId));
  if (!settings) return res.status(404).json({ error: "Telephony settings not found" });
  if (!settings.binotelSecretToken) {
    [settings] = await db.update(settingsTable)
      .set({ binotelSecretToken: encrypt(randomBytes(32).toString("base64url")), updatedAt: new Date() })
      .where(eq(settingsTable.organizationId, orgId))
      .returning();
  }
  const token = decrypt(settings.binotelSecretToken);
  const base = `${publicUrl}/api/telephony/binotel`;
  const query = `?token=${encodeURIComponent(token || "")}`;
  res.json({
    callSettingsUrl: `${base}/call-settings${query}`,
    callCompletedUrl: `${base}/call-completed${query}`,
    instructions: {
      step1: "Зайдіть в Binotel кабінет → API та інтеграції",
      step2: `Вставте URL API CALL SETTINGS: ${base}/call-settings`,
      step3: `Вставте URL API CALL COMPLETED: ${base}/call-completed`,
      step4: "Збережіть Company ID з Binotel в налаштуваннях системи",
    },
  });
});

router.post("/binotel/test-connection", requireAuth, requireRole("super_admin", "owner", "manager"), async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.organizationId, orgId));
    const key = decrypt(settings?.binotelApiKey) || "";
    const secret = decrypt(settings?.binotelApiSecret) || "";
    if (!key || !secret) {
      return res.status(400).json({ error: "Збережіть API Key та API Secret перед перевіркою" });
    }
    const response = await fetch(`${BINOTEL_API_BASE}/stats/all-incoming-calls-since.json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        timestamp: Math.floor(Date.now() / 1000) - 300,
        key,
        secret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json().catch(() => ({})) as any;
    if (!response.ok || result.status !== "success") {
      logger.warn({ orgId, status: response.status, binotelCode: result.code }, "Binotel connection test rejected");
      return res.status(502).json({
        error: "Binotel відхилив підключення. Перевірте нові API Key та API Secret.",
        code: result.code || null,
      });
    }
    res.json({ status: "success" });
  } catch (e: any) {
    logger.error({ err: e, orgId }, "Binotel connection test failed");
    res.status(502).json({ error: "Не вдалося з'єднатися з Binotel" });
  }
});

export default router;

