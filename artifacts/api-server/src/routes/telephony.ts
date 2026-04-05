import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq, and, desc, asc, gte, count, sql } from "drizzle-orm";
import {
  pgTable, serial, integer, smallint, varchar, text, boolean,
  timestamp, date, numeric,
} from "drizzle-orm/pg-core";

// ── Inline schemas ────────────────────────────────────────────────────────────
const settingsTable = pgTable("telephony_settings", {
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

const callLogsTable = pgTable("call_logs", {
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

// ── Settings ──────────────────────────────────────────────────────────────────
router.get("/settings", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const [s] = await db.select().from(settingsTable).where(eq(settingsTable.organizationId, orgId));
    if (!s) {
      const [created] = await db.insert(settingsTable).values({ organizationId: orgId }).returning();
      return res.json(created);
    }
    res.json(s);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/settings", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const upd: any = {};
  for (const f of ["isEnabled","greetingMessage","businessHoursStart","businessHoursEnd","afterHoursAction","maxQueueSize","ringTimeoutSec","ivrEnabled","recordingEnabled","aiSummaryEnabled","mainNumber"]) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  upd.updatedAt = new Date();
  try {
    const [s] = await db.update(settingsTable).set(upd).where(eq(settingsTable.organizationId, orgId)).returning();
    res.json(s);
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
      model: "gpt-5-nano",
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
      model: "gpt-5-nano",
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

export default router;
