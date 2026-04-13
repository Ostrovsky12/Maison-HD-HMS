import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { eq, and, gte, lte, asc, inArray } from "drizzle-orm";
import {
  pgTable, serial, integer, smallint, varchar, text, boolean,
  numeric, timestamp, date,
} from "drizzle-orm/pg-core";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ratesTable, propertiesTable, organizationsTable } from "@workspace/db/schema";

// ── Inline schemas ──────────────────────────────────────────────────────────
const rateCompetitorsTable = pgTable("rate_competitors", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  websiteUrl: text("website_url"),
  otaLink: text("ota_link"),
  starRating: smallint("star_rating").default(3),
  roomType: varchar("room_type", { length: 100 }),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

const competitorRatesTable = pgTable("competitor_rates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  competitorId: integer("competitor_id").notNull(),
  checkDate: date("check_date").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  roomType: varchar("room_type", { length: 100 }),
  currency: varchar("currency", { length: 10 }).default("UAH"),
  availabilityPct: smallint("availability_pct"),
  source: varchar("source", { length: 50 }).default("manual"),
  notes: text("notes"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

const rateSnapshotsTable = pgTable("rate_snapshots", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  snapDate: date("snap_date").notNull(),
  ourPrice: numeric("our_price", { precision: 10, scale: 2 }).notNull(),
  roomType: varchar("room_type", { length: 100 }),
  currency: varchar("currency", { length: 10 }).default("UAH"),
  occupancyPct: smallint("occupancy_pct"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

const router = Router();
const getOrgId = (req: any): number => req.user?.organizationId;

// ── Helpers ─────────────────────────────────────────────────────────────────
function dateRange(days: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

async function fetchWebContent(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HotelRateBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return "";
    const html = await res.text();
    // Strip scripts, styles, and excessive whitespace
    const clean = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 10000);
    return clean;
  } catch {
    return "";
  }
}

async function getOrgAndProperty(orgId: number) {
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  const [prop] = await db.select().from(propertiesTable).where(eq(propertiesTable.organizationId, orgId)).limit(1);
  return { org, prop };
}

// ── Competitors ──────────────────────────────────────────────────────────────
router.get("/competitors", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const rows = await db.select().from(rateCompetitorsTable)
      .where(and(eq(rateCompetitorsTable.organizationId, orgId), eq(rateCompetitorsTable.isActive, true)))
      .orderBy(asc(rateCompetitorsTable.name));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/competitors", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { name, websiteUrl, otaLink, starRating, roomType, notes } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const [comp] = await db.insert(rateCompetitorsTable)
      .values({ organizationId: orgId, name, websiteUrl, otaLink, starRating, roomType, notes })
      .returning();
    res.status(201).json(comp);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/competitors/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const upd: any = {};
  for (const f of ["name", "websiteUrl", "otaLink", "starRating", "roomType", "notes", "isActive"]) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  try {
    const [comp] = await db.update(rateCompetitorsTable).set(upd)
      .where(and(eq(rateCompetitorsTable.id, id), eq(rateCompetitorsTable.organizationId, orgId)))
      .returning();
    res.json(comp);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/competitors/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  try {
    await db.delete(rateCompetitorsTable)
      .where(and(eq(rateCompetitorsTable.id, id), eq(rateCompetitorsTable.organizationId, orgId)));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── AI: Fetch competitor prices from their website ───────────────────────────
router.post("/competitors/:id/fetch-prices", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const compId = parseInt(req.params.id);

  try {
    const [comp] = await db.select().from(rateCompetitorsTable)
      .where(and(eq(rateCompetitorsTable.id, compId), eq(rateCompetitorsTable.organizationId, orgId)))
      .limit(1);
    if (!comp) return res.status(404).json({ error: "Competitor not found" });

    const dates = dateRange(14);
    const today = dates[0];
    const lastDate = dates[dates.length - 1];

    // Try to fetch website content
    let webContent = "";
    const urlsToTry = [comp.websiteUrl, comp.otaLink].filter(Boolean) as string[];
    for (const url of urlsToTry) {
      const content = await fetchWebContent(url);
      if (content.length > 200) {
        webContent = content;
        break;
      }
    }

    const companyName = comp.name;
    const websiteHint = webContent.length > 100
      ? `\n\nВміст сайту конкурента (перші 10 000 символів):\n${webContent}`
      : `\n\nСайт недоступний або захищений. Використай свої загальні знання про ${companyName}.`;

    const systemPrompt = `Ти — аналітик ринку готельного бізнесу. Твоє завдання — витягнути або оцінити ціни номерів для готелю.
Відповідай ЛИШЕ валідним JSON масивом. Ніякого пояснювального тексту до або після JSON.`;

    const userPrompt = `Визнач ціни за одну ніч для готелю "${companyName}" на кожен з наступних 14 днів (${today} - ${lastDate}).
Якщо точних цін немає — оціни ціни, виходячи з категорії готелю, сезону та ринку (Україна, UAH).
Якщо є кілька категорій номерів, бери стандартну (Стандарт або Basic).
${websiteHint}

Поверни JSON масив у форматі:
[
  {"date": "YYYY-MM-DD", "price": 1500, "roomType": "Стандарт", "confidence": "high|medium|low", "notes": "..."},
  ...
]

Дати мають бути: ${dates.join(", ")}
Ціни мають бути в гривнях (UAH), реалістичними для українського ринку.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2000,
    });

    let extracted: any[] = [];
    try {
      const raw = completion.choices[0]?.message?.content || "[]";
      // Extract JSON from response (may have markdown code block)
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : raw;
      const parsed = JSON.parse(jsonStr.trim());
      extracted = Array.isArray(parsed) ? parsed : (parsed.prices || parsed.data || Object.values(parsed)[0] || []);
    } catch {
      return res.status(422).json({ error: "AI не зміг розпізнати відповідь", raw: completion.choices[0]?.message?.content });
    }

    if (!extracted.length) {
      return res.status(422).json({ error: "AI не знайшов цін", raw: completion.choices[0]?.message?.content });
    }

    // Delete old AI-fetched rates for this competitor in the date range (keep manual ones)
    await db.delete(competitorRatesTable).where(
      and(
        eq(competitorRatesTable.competitorId, compId),
        eq(competitorRatesTable.organizationId, orgId),
        eq(competitorRatesTable.source, "ai"),
        gte(competitorRatesTable.checkDate, today),
        lte(competitorRatesTable.checkDate, lastDate),
      )
    );

    // Insert new rates
    const toInsert = extracted
      .filter((r: any) => r.date && r.price && parseFloat(r.price) > 0)
      .map((r: any) => ({
        organizationId: orgId,
        competitorId: compId,
        checkDate: r.date,
        price: String(Math.round(parseFloat(r.price))),
        roomType: r.roomType || comp.roomType || "Стандарт",
        currency: "UAH",
        source: "ai",
        notes: [
          r.confidence ? `Впевненість: ${r.confidence}` : "",
          webContent.length > 100 ? "Джерело: сайт" : "Джерело: AI-оцінка",
          r.notes || "",
        ].filter(Boolean).join("; ") || null,
      }));

    if (toInsert.length) {
      await db.insert(competitorRatesTable).values(toInsert);
    }

    res.json({
      saved: toInsert.length,
      websiteFetched: webContent.length > 100,
      rates: toInsert,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI: Suggest competitors ──────────────────────────────────────────────────
router.post("/suggest-competitors", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const { org, prop } = await getOrgAndProperty(orgId);

    const existing = await db.select({ name: rateCompetitorsTable.name })
      .from(rateCompetitorsTable)
      .where(eq(rateCompetitorsTable.organizationId, orgId));
    const existingNames = existing.map(c => c.name);

    const propName = prop?.name || org?.name || "готель";
    const propAddress = prop?.address || org?.address || "";
    const propType = (prop as any)?.type || "hotel";

    // Extract region/city from address for better context
    const regionHint = propAddress
      ? `Адреса: ${propAddress}.`
      : "";

    const systemPrompt = `Ти — досвідчений аналітик готельного ринку України. 
Твоє завдання — запропонувати конкурентів для моніторингу цін.
ЗАВЖДИ повертай рівно 6 об'єктів у вигляді JSON масиву. 
Без жодних пояснень, без markdown, тільки чистий JSON масив.`;

    const userPrompt = `Готель для аналізу: "${propName}"
${regionHint}
Тип об'єкту: ${propType}
${existingNames.length > 0 ? `Вже відстежуються (виключи їх): ${existingNames.join(", ")}` : ""}

Запропонуй 6 конкурентів — готелі, котеджні комплекси або бази відпочинку схожого типу та цінової категорії, що знаходяться в тому ж регіоні (Карпати, та ж область або сусідня область в межах 100 км).

Якщо це котеджний або заміський комплекс — шукай аналогічні заміські об'єкти.
Якщо це SPA-готель — шукай SPA та wellness об'єкти.
Якщо це бюджетний об'єкт — шукай аналоги в тій же ціновій категорії.

Реальні відомі об'єкти мають перевагу, але якщо не знаєш точних — використай типові назви що відповідають регіону.

Поверни ТІЛЬКИ JSON масив (без \`\`\`json, без пояснень):
[{"name":"...","websiteUrl":"https://...","starRating":3,"roomType":"Котедж","notes":"...","confidence":"high"}]`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 3000,
    });

    const raw = (completion.choices[0]?.message?.content || "").trim();
    console.log("[suggest-competitors] raw AI response:", raw.slice(0, 500));

    // Robust JSON extraction
    let suggestions: any[] = [];
    const extractJson = (text: string): any[] => {
      // Try direct parse first
      try { const p = JSON.parse(text); return Array.isArray(p) ? p : []; } catch {}
      // Strip markdown code blocks
      const stripped = text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
      try { const p = JSON.parse(stripped); return Array.isArray(p) ? p : []; } catch {}
      // Extract first [...] block
      const match = stripped.match(/\[[\s\S]*?\]/);
      if (match) {
        try { const p = JSON.parse(match[0]); return Array.isArray(p) ? p : []; } catch {}
      }
      // Extract objects line by line
      const objMatches = [...stripped.matchAll(/\{[^{}]+\}/g)];
      if (objMatches.length > 0) {
        try { return objMatches.map(m => JSON.parse(m[0])).filter(Boolean); } catch {}
      }
      return [];
    };

    suggestions = extractJson(raw);

    if (suggestions.length === 0) {
      console.error("[suggest-competitors] failed to parse:", raw);
      return res.status(422).json({ error: `AI повернув неочікуваний формат. Спробуйте ще раз.` });
    }

    // Normalize fields
    suggestions = suggestions.map(s => ({
      name: s.name || s.title || "Невідомий",
      websiteUrl: s.websiteUrl || s.website || s.url || "",
      starRating: (typeof s.starRating === "number" && s.starRating > 0) ? s.starRating : (parseInt(s.stars) || 3),
      roomType: s.roomType || s.room_type || s.type || "Стандарт",
      notes: s.notes || s.description || s.reason || "",
      confidence: s.confidence || "medium",
    })).filter(s => s.name && s.name !== "Невідомий");

    res.json(suggestions);
  } catch (e: any) {
    console.error("[suggest-competitors] error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── AI: Full analysis with SSE streaming ────────────────────────────────────
router.post("/analyze", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { org, prop } = await getOrgAndProperty(orgId);

    // Fetch last 30 days + next 14 days of data
    const today = new Date().toISOString().split("T")[0];
    const past30 = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const future14 = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

    const [competitors, compRates, ourRates, ourTariffs] = await Promise.all([
      db.select().from(rateCompetitorsTable)
        .where(and(eq(rateCompetitorsTable.organizationId, orgId), eq(rateCompetitorsTable.isActive, true))),
      db.select({
        date: competitorRatesTable.checkDate,
        price: competitorRatesTable.price,
        compName: rateCompetitorsTable.name,
        source: competitorRatesTable.source,
      })
        .from(competitorRatesTable)
        .innerJoin(rateCompetitorsTable, eq(competitorRatesTable.competitorId, rateCompetitorsTable.id))
        .where(and(
          eq(competitorRatesTable.organizationId, orgId),
          gte(competitorRatesTable.checkDate, past30),
          lte(competitorRatesTable.checkDate, future14),
        ))
        .orderBy(asc(competitorRatesTable.checkDate)),
      db.select().from(rateSnapshotsTable)
        .where(and(
          eq(rateSnapshotsTable.organizationId, orgId),
          gte(rateSnapshotsTable.snapDate, past30),
          lte(rateSnapshotsTable.snapDate, future14),
        )),
      db.select({
        id: ratesTable.id,
        pricePerNight: ratesTable.pricePerNight,
        dateFrom: ratesTable.dateFrom,
        dateTo: ratesTable.dateTo,
      }).from(ratesTable)
        .innerJoin(propertiesTable, eq(ratesTable.propertyId, propertiesTable.id))
        .where(and(
          eq(propertiesTable.organizationId, orgId),
          eq(ratesTable.isStopSale, false),
        )),
    ]);

    if (!compRates.length && !ourRates.length && !ourTariffs.length) {
      send({ type: "error", message: "Недостатньо даних для аналізу. Додайте конкурентів та завантажте їх ціни." });
      res.end();
      return;
    }

    // Build compact data summary for the prompt
    const avgCompByDate: Record<string, number[]> = {};
    compRates.forEach(r => {
      const d = String(r.date);
      if (!avgCompByDate[d]) avgCompByDate[d] = [];
      avgCompByDate[d].push(parseFloat(String(r.price)));
    });

    const marketData = Object.entries(avgCompByDate).slice(0, 21).map(([d, prices]) => ({
      date: d,
      marketMin: Math.min(...prices),
      marketMax: Math.max(...prices),
      marketAvg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    }));

    const ourPriceByDate: Record<string, number> = {};
    ourRates.forEach(r => { ourPriceByDate[String(r.snapDate)] = parseFloat(String(r.ourPrice)); });
    ourTariffs.forEach(t => {
      const dateFrom = t.dateFrom || "2020-01-01";
      const dateTo = t.dateTo || "2099-12-31";
      for (const md of marketData) {
        if (md.date >= dateFrom && md.date <= dateTo && !ourPriceByDate[md.date]) {
          ourPriceByDate[md.date] = parseFloat(String(t.pricePerNight));
        }
      }
    });

    const propertyInfo = [
      `Назва: ${prop?.name || org?.name}`,
      `Тип: ${prop?.type || "готель"}`,
      `Адреса: ${prop?.address || org?.address || "Україна"}`,
    ].join("\n");

    const competitorList = competitors.map(c =>
      `- ${c.name} (${c.starRating}★, сайт: ${c.websiteUrl || "немає"})`
    ).join("\n");

    const rateTable = marketData.map(md => {
      const our = ourPriceByDate[md.date];
      const gap = our ? our - md.marketAvg : null;
      return `${md.date}: наш=${our ? our + "₴" : "немає"}, ринок min=${md.marketMin}₴ avg=${md.marketAvg}₴ max=${md.marketMax}₴${gap !== null ? ` (різниця: ${gap > 0 ? "+" : ""}${Math.round(gap)}₴)` : ""}`;
    }).join("\n");

    const prompt = `Ти — Senior Revenue Manager готелів з 15 роками досвіду. Проаналізуй тарифну ситуацію та дай конкретні стратегічні рекомендації.

## Об'єкт
${propertyInfo}

## Конкуренти (${competitors.length} шт.)
${competitorList || "Не визначені"}

## Тарифна таблиця (наш тариф vs ринок)
${rateTable || "Даних немає"}

## Завдання
1. **Позиціонування**: де зараз знаходиться готель відносно ринку (вище/нижче/паритет)?
2. **Короткострокові рекомендації** (наступні 7 днів): конкретні дати та суми
3. **Середньострокові рекомендації** (2-4 тижні): тенденції та коригування
4. **Ризики**: що може піти не так?
5. **Можливості**: де можна підняти ціну без ризику? Де є попит?
6. **Конкретний план дій**: 3-5 конкретних кроків з числами

Відповідай українською мовою. Будь конкретним — вказуй конкретні відсотки, суми, дати. Уникай загальних фраз.`;

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Ти — провідний Revenue Manager для готельного бізнесу. Даєш конкретні, дієві рекомендації з числами." },
        { role: "user", content: prompt },
      ],
      max_tokens: 4096,
      stream: true,
    });

    send({ type: "start" });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) send({ type: "token", content: delta });
    }

    send({ type: "done" });
    res.end();
  } catch (e: any) {
    send({ type: "error", message: e.message });
    res.end();
  }
});

// ── Our rates (from tariff table — auto) ────────────────────────────────────
router.get("/our-rates-auto", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { from, to } = req.query as any;
  try {
    // Get all properties for this org
    const props = await db.select().from(propertiesTable).where(eq(propertiesTable.organizationId, orgId));
    const propIds = props.map(p => p.id);
    if (!propIds.length) return res.json([]);

    // Get active tariffs for these properties
    const tariffs = await db.select().from(ratesTable)
      .where(and(
        eq(ratesTable.isStopSale, false),
        inArray(ratesTable.propertyId, propIds),
      ));

    // Build a rate for each day in the range
    const fromDate = from || new Date().toISOString().split("T")[0];
    const toDate = to || new Date(Date.now() + 13 * 86400000).toISOString().split("T")[0];

    const result: { snapDate: string; ourPrice: number; source: string }[] = [];
    const d = new Date(fromDate + "T00:00:00");
    const end = new Date(toDate + "T00:00:00");

    while (d <= end) {
      const dateStr = d.toISOString().split("T")[0];
      // Find a matching tariff for this date
      const matching = tariffs.filter(t => {
        const df = t.dateFrom || "2020-01-01";
        const dt = t.dateTo || "2099-12-31";
        return dateStr >= df && dateStr <= dt;
      });

      if (matching.length) {
        // Take the cheapest matching tariff as base
        const minPrice = Math.min(...matching.map(t => parseFloat(String(t.pricePerNight))));
        result.push({ snapDate: dateStr, ourPrice: minPrice, source: "tariff" });
      }

      d.setDate(d.getDate() + 1);
    }

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Competitor rates ─────────────────────────────────────────────────────────
router.get("/competitor-rates", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { from, to, competitorId } = req.query as any;
  try {
    const conds: any[] = [eq(competitorRatesTable.organizationId, orgId)];
    if (from) conds.push(gte(competitorRatesTable.checkDate, from));
    if (to) conds.push(lte(competitorRatesTable.checkDate, to));
    if (competitorId) conds.push(eq(competitorRatesTable.competitorId, parseInt(competitorId)));
    const rows = await db.select({
      id: competitorRatesTable.id,
      competitorId: competitorRatesTable.competitorId,
      checkDate: competitorRatesTable.checkDate,
      price: competitorRatesTable.price,
      roomType: competitorRatesTable.roomType,
      currency: competitorRatesTable.currency,
      source: competitorRatesTable.source,
      notes: competitorRatesTable.notes,
      competitorName: rateCompetitorsTable.name,
    })
      .from(competitorRatesTable)
      .innerJoin(rateCompetitorsTable, eq(competitorRatesTable.competitorId, rateCompetitorsTable.id))
      .where(and(...conds))
      .orderBy(asc(competitorRatesTable.checkDate), asc(rateCompetitorsTable.name));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/competitor-rates", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { competitorId, checkDate, price, roomType, availabilityPct, notes } = req.body;
  if (!competitorId || !checkDate || price === undefined) {
    return res.status(400).json({ error: "competitorId, checkDate, price required" });
  }
  try {
    const [rate] = await db.insert(competitorRatesTable).values({
      organizationId: orgId,
      competitorId: parseInt(competitorId),
      checkDate,
      price: String(price),
      roomType,
      availabilityPct,
      notes,
      source: "manual",
    }).returning();
    res.status(201).json(rate);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Our rates (manual snapshots) ─────────────────────────────────────────────
router.get("/our-rates", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { from, to } = req.query as any;
  try {
    const conds: any[] = [eq(rateSnapshotsTable.organizationId, orgId)];
    if (from) conds.push(gte(rateSnapshotsTable.snapDate, from));
    if (to) conds.push(lte(rateSnapshotsTable.snapDate, to));
    const rows = await db.select().from(rateSnapshotsTable)
      .where(and(...conds))
      .orderBy(asc(rateSnapshotsTable.snapDate));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/our-rates", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { snapDate, ourPrice, roomType, occupancyPct } = req.body;
  if (!snapDate || ourPrice === undefined) return res.status(400).json({ error: "snapDate, ourPrice required" });
  try {
    const [snap] = await db.insert(rateSnapshotsTable).values({
      organizationId: orgId, snapDate, ourPrice: String(ourPrice), roomType, occupancyPct,
    }).returning();
    res.status(201).json(snap);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get("/dashboard", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { from, to } = req.query as any;
  try {
    const conds: any[] = [eq(competitorRatesTable.organizationId, orgId)];
    if (from) conds.push(gte(competitorRatesTable.checkDate, from));
    if (to) conds.push(lte(competitorRatesTable.checkDate, to));

    const compRates = await db.select().from(competitorRatesTable).where(and(...conds));
    const ourRateConds: any[] = [eq(rateSnapshotsTable.organizationId, orgId)];
    if (from) ourRateConds.push(gte(rateSnapshotsTable.snapDate, from));
    if (to) ourRateConds.push(lte(rateSnapshotsTable.snapDate, to));
    const ourRates = await db.select().from(rateSnapshotsTable).where(and(...ourRateConds));
    const competitors = await db.select().from(rateCompetitorsTable)
      .where(eq(rateCompetitorsTable.organizationId, orgId));

    // Also pull auto rates from tariffs if no manual rates
    let avgOurPrice = ourRates.length
      ? ourRates.reduce((s, r) => s + parseFloat(String(r.ourPrice)), 0) / ourRates.length
      : 0;

    if (!avgOurPrice) {
      const fromDate = from || new Date().toISOString().split("T")[0];
      const props = await db.select().from(propertiesTable).where(eq(propertiesTable.organizationId, orgId));
      if (props.length) {
        const tariffs = await db.select().from(ratesTable)
          .where(and(
            eq(ratesTable.isStopSale, false),
            eq(ratesTable.propertyId, props[0].id),
          ));
        const matching = tariffs.filter(t => {
          const df = t.dateFrom || "2020-01-01";
          const dt = t.dateTo || "2099-12-31";
          return fromDate >= df && fromDate <= dt;
        });
        if (matching.length) {
          avgOurPrice = matching.reduce((s, t) => s + parseFloat(String(t.pricePerNight)), 0) / matching.length;
        }
      }
    }

    const avgCompPrice = compRates.length
      ? compRates.reduce((s, r) => s + parseFloat(String(r.price)), 0) / compRates.length
      : 0;
    const minCompPrice = compRates.length ? Math.min(...compRates.map(r => parseFloat(String(r.price)))) : 0;
    const maxCompPrice = compRates.length ? Math.max(...compRates.map(r => parseFloat(String(r.price)))) : 0;

    const position = avgCompPrice > 0
      ? avgOurPrice >= avgCompPrice * 1.05 ? "above"
        : avgOurPrice >= avgCompPrice * 0.95 ? "parity"
          : "below"
      : "unknown";

    res.json({
      avgCompPrice: Math.round(avgCompPrice),
      minCompPrice: Math.round(minCompPrice),
      maxCompPrice: Math.round(maxCompPrice),
      avgOurPrice: Math.round(avgOurPrice),
      position,
      totalDataPoints: compRates.length,
      competitorCount: competitors.length,
      ourRateCount: ourRates.length,
      priceGap: Math.round(avgOurPrice - avgCompPrice),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
