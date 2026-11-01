/**
 * Poster POS Integration
 * Poster API docs: https://developers.joinposter.com/
 * Auth: ?token=ACCESS_TOKEN in all requests
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { organizationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { parsePosterAnalytics, posterDates } from "../lib/poster-analytics.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;
const POSTER_BASE = "https://joinposter.com/api";

router.use(requireAuth, (req: any, res, next) => {
  if (!Number.isInteger(getOrg(req)) || getOrg(req) <= 0) {
    res.status(403).json({ error: "Відкрийте інтеграцію від імені конкретного закладу." });
    return;
  }
  next();
});

// Helper: get org's Poster config from enabledModules
async function getPosterConfig(orgId: number): Promise<{ apiKey?: string; accountId?: string; verified?: boolean; lastSync?: string; syncedData?: any } | null> {
  const [org] = await db.select({ enabledModules: organizationsTable.enabledModules })
    .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  if (!org) return null;
  const mods: any = org.enabledModules || {};
  return mods.posterConfig || null;
}

// Helper: save Poster config
async function savePosterConfig(orgId: number, config: any) {
  const updated = await db.update(organizationsTable)
    .set({ enabledModules: sql`jsonb_set(coalesce(${organizationsTable.enabledModules}, '{}'::jsonb), '{posterConfig}', ${JSON.stringify(config)}::jsonb)` })
    .where(eq(organizationsTable.id, orgId)).returning({ id: organizationsTable.id });
  if (!updated.length) throw new Error("Заклад не знайдено. Підключення не збережено.");
}

// Helper: call Poster API
async function posterCall(token: string, method: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ token, ...params });
  const url = `${POSTER_BASE}/${method}?${qs}`;
  let r: Response;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new Error("Не вдалося зв’язатися з Poster. Спробуйте ще раз пізніше.");
  }
  if (!r.ok) throw new Error(`Poster API error: ${r.status}`);
  let data: any;
  try { data = await r.json(); } catch { throw new Error("Poster повернув некоректну відповідь."); }
  if (data.error || (data.error_code !== undefined && Number(data.error_code) !== 0)) {
    throw new Error("Poster відхилив запит. Перевірте токен доступу та дозволи інтеграції.");
  }
  if (data.response === undefined) throw new Error("Poster повернув непідтримуваний формат відповіді.");
  return data.response;
}

const liveCache = (config: Awaited<ReturnType<typeof getPosterConfig>>) =>
  config?.apiKey && config.syncedData?.source === "live" ? config.syncedData : null;

// GET /poster/status — check connection status
router.get("/status", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const config = await getPosterConfig(orgId);
    if (!config?.apiKey) {
      return res.json({ connected: false, lastSync: null, lastRevenue: null });
    }
    return res.json({
      connected: true,
      verified: config.verified === true,
      accountId: config.accountId,
      lastSync: liveCache(config) ? config.lastSync : null,
      lastRevenue: liveCache(config)?.totalRevenue ?? null,
      lastTransactions: liveCache(config)?.totalTransactions ?? null,
    });
  } catch { return res.status(500).json({ error: "Не вдалося завантажити стан підключення Poster." }); }
});

// POST /poster/connect — save API key and test connection
router.post("/connect", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { apiKey, accountId } = req.body;
    if (typeof apiKey !== "string" || !apiKey.trim()) return res.status(400).json({ error: "Вкажіть токен доступу." });
    if (accountId !== undefined && typeof accountId !== "string") return res.status(400).json({ error: "Некоректна назва акаунту." });

    // Test the connection
    let verified = false;
    let accountName = accountId || "Poster аккаунт";
    try {
      const info = await posterCall(apiKey.trim(), "spots.getSpots");
      if (!Array.isArray(info)) throw new Error("Некоректна відповідь Poster.");
      verified = true;
    } catch (e) {
      return res.status(502).json({ ok: false, error: "Не вдалося перевірити доступ до Poster. Перевірте токен і дозволи або спробуйте пізніше. Попереднє підключення не змінено." });
    }

    const config = {
      apiKey: apiKey.trim(),
      accountId: accountId || accountName,
      connected: true,
      verified,
      connectedAt: new Date().toISOString(),
      lastSync: null,
      syncedData: null,
    };
    await savePosterConfig(orgId, config);

    return res.json({ ok: true, verified, accountName });
  } catch { return res.status(500).json({ error: "Не вдалося зберегти підключення. Перевірте, що заклад існує, та спробуйте ще раз." }); }
});

// DELETE /poster/disconnect
router.delete("/disconnect", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await db.update(organizationsTable)
      .set({ enabledModules: sql`coalesce(${organizationsTable.enabledModules}, '{}'::jsonb) - 'posterConfig'` })
      .where(eq(organizationsTable.id, orgId));
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Не вдалося відключити Poster." }); }
});

// POST /poster/sync — only persist successful, real Poster reports.
router.post("/sync", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const config = await getPosterConfig(orgId);
    const dateFrom = (req.body.dateFrom as string) || (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); })();
    const dateTo = (req.body.dateTo as string) || new Date().toISOString().slice(0, 10);

    if (!config?.apiKey) return res.status(409).json({ ok: false, error: "Спочатку підключіть Poster." });
    try { posterDates(dateFrom, dateTo); } catch (e: any) {
      return res.status(400).json({ ok: false, error: e.message });
    }
    let syncedData;
    try {
      const analytics = await posterCall(config.apiKey, "dash.getAnalytics", {
        dateFrom: dateFrom.replace(/-/g, ""), dateTo: dateTo.replace(/-/g, ""), interpolate: "day", select: "revenue",
      });
      syncedData = parsePosterAnalytics(analytics, dateFrom, dateTo);
    } catch (e: any) {
      return res.status(502).json({ ok: false, error: e.message, syncError: e.message });
    }
    const lastSync = new Date().toISOString();
    await savePosterConfig(orgId, { ...config, verified: true, lastSync, syncedData });
    return res.json({ ok: true, connected: true, ...syncedData, lastSync, syncError: null });
  } catch { return res.status(500).json({ error: "Не вдалося зберегти звіт Poster. Попередній звіт не замінено." }); }
});

// GET /poster/revenue — get cached synced revenue
router.get("/revenue", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const config = await getPosterConfig(orgId);
    if (!liveCache(config)) {
      return res.json({
        connected: !!config?.apiKey,
        source: "unavailable",
        totalRevenue: null,
        totalTransactions: null,
        avgCheck: null,
        dailyRevenue: [],
        lastSync: null,
      });
    }
    return res.json({ connected: true, ...liveCache(config), lastSync: config?.lastSync });
  } catch { return res.status(500).json({ error: "Не вдалося завантажити збережений звіт Poster." }); }
});

// POST /poster/room-charge — create room charge in HMS from Poster order
router.post("/room-charge", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { bookingId, amount, description, posterOrderId } = req.body;
    if (!bookingId || !amount) return res.status(400).json({ error: "bookingId і amount обов'язкові" });

    // In a real implementation this would add a charge to the booking
    // For now, return success with a reference number
    const chargeRef = `PC-${Date.now().toString(36).toUpperCase()}`;
    return res.json({
      ok: true,
      chargeRef,
      bookingId,
      amount,
      description: description || "Замовлення з ресторану",
      posterOrderId,
      createdAt: new Date().toISOString(),
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

export default router;
