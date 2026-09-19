/**
 * Poster POS Integration
 * Poster API docs: https://developers.joinposter.com/
 * Auth: ?token=ACCESS_TOKEN in all requests
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { organizationsTable, unitsTable, propertiesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;
const POSTER_BASE = "https://joinposter.com/api";

// Helper: get org's Poster config from enabledModules
async function getPosterConfig(orgId: number): Promise<{ apiKey?: string; accountId?: string; lastSync?: string; syncedData?: any } | null> {
  const [org] = await db.select({ enabledModules: organizationsTable.enabledModules })
    .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  if (!org) return null;
  const mods: any = org.enabledModules || {};
  return mods.posterConfig || null;
}

// Helper: save Poster config
async function savePosterConfig(orgId: number, config: any) {
  const [org] = await db.select({ enabledModules: organizationsTable.enabledModules })
    .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  const mods: any = org?.enabledModules || {};
  await db.update(organizationsTable)
    .set({ enabledModules: { ...mods, posterConfig: config } })
    .where(eq(organizationsTable.id, orgId));
}

// Helper: call Poster API
async function posterCall(token: string, method: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ token, ...params });
  const url = `${POSTER_BASE}/${method}?${qs}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Poster API error: ${r.status}`);
  const data = await r.json();
  if (data.error) throw new Error(`Poster: ${data.error}`);
  return data.response || data;
}

// Demo revenue data (used when no API key or for testing)
function demoRevenue(days = 30) {
  const result: any[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const isWeekend = d.getDay() === 5 || d.getDay() === 6 || d.getDay() === 0;
    const base = isWeekend ? 12000 : 7500;
    const revenue = Math.round(base + (Math.random() - 0.5) * 3000);
    result.push({
      date: dateStr,
      revenue,
      transactions: Math.round(revenue / 250),
      avgCheck: 250 + Math.round(Math.random() * 100),
    });
  }
  return result;
}

// GET /poster/status — check connection status
router.get("/status", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const config = await getPosterConfig(orgId);
    if (!config?.apiKey) {
      return res.json({ connected: false, lastSync: null, lastRevenue: null });
    }
    res.json({
      connected: true,
      accountId: config.accountId,
      lastSync: config.lastSync,
      lastRevenue: config.syncedData?.totalRevenue || null,
      lastTransactions: config.syncedData?.totalTransactions || null,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /poster/connect — save API key and test connection
router.post("/connect", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { apiKey, accountId } = req.body;
    if (!apiKey) return res.status(400).json({ error: "apiKey required" });

    // Test the connection
    let verified = false;
    let accountName = accountId || "Poster аккаунт";
    try {
      const info = await posterCall(apiKey, "auth.checkToken");
      if (info) {
        verified = true;
        accountName = info.name || info.account?.name || accountName;
      }
    } catch (e) {
      // If token check fails, still save but mark as unverified
      verified = false;
    }

    const config = {
      apiKey,
      accountId: accountId || accountName,
      connected: true,
      verified,
      connectedAt: new Date().toISOString(),
      lastSync: null,
      syncedData: null,
    };
    await savePosterConfig(orgId, config);

    res.json({ ok: true, verified, accountName });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /poster/disconnect
router.delete("/disconnect", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const [org] = await db.select({ enabledModules: organizationsTable.enabledModules })
      .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
    const mods: any = org?.enabledModules || {};
    delete mods.posterConfig;
    await db.update(organizationsTable).set({ enabledModules: mods }).where(eq(organizationsTable.id, orgId));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /poster/sync — sync revenue from Poster API (or use demo data)
router.post("/sync", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const config = await getPosterConfig(orgId);
    const dateFrom = (req.body.dateFrom as string) || (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); })();
    const dateTo = (req.body.dateTo as string) || new Date().toISOString().slice(0, 10);

    let dailyRevenue: any[] = [];
    let totalRevenue = 0;
    let totalTransactions = 0;
    let source = "demo";
    let syncError: string | null = null;

    if (config?.apiKey) {
      try {
        // Try to fetch real Poster data
        const dateFromPoster = dateFrom.replace(/-/g, "");
        const dateToPoster = dateTo.replace(/-/g, "");
        const analytics = await posterCall(config.apiKey, "dash.getAnalytics", {
          dateFrom: dateFromPoster, dateTo: dateToPoster,
        });

        if (Array.isArray(analytics) && analytics.length > 0) {
          dailyRevenue = analytics.map((a: any) => ({
            date: `${a.date.slice(0, 4)}-${a.date.slice(4, 6)}-${a.date.slice(6, 8)}`,
            revenue: parseFloat(a.revenue || 0) / 100, // Poster stores in kopecks
            transactions: parseInt(a.visitors || 0),
            avgCheck: parseFloat(a.average_receipt || 0) / 100,
          }));
          totalRevenue = dailyRevenue.reduce((s, d) => s + d.revenue, 0);
          totalTransactions = dailyRevenue.reduce((s, d) => s + d.transactions, 0);
          source = "live";
        } else if (Array.isArray(analytics) && analytics.length === 0) {
          // Empty period — still live data, just no revenue
          dailyRevenue = [];
          source = "live";
        } else {
          throw new Error(`Неочікуваний формат відповіді Poster: ${JSON.stringify(analytics).slice(0, 200)}`);
        }
      } catch (e: any) {
        syncError = e.message || "Помилка Poster API";
        dailyRevenue = demoRevenue(30);
        totalRevenue = dailyRevenue.reduce((s, d) => s + d.revenue, 0);
        totalTransactions = dailyRevenue.reduce((s, d) => s + d.transactions, 0);
        source = "demo";
      }
    } else {
      dailyRevenue = demoRevenue(30);
      totalRevenue = dailyRevenue.reduce((s, d) => s + d.revenue, 0);
      totalTransactions = dailyRevenue.reduce((s, d) => s + d.transactions, 0);
    }

    const avgCheck = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;
    const syncedData = { dailyRevenue, totalRevenue: Math.round(totalRevenue), totalTransactions, avgCheck, dateFrom, dateTo, source };

    // Save synced data
    if (config) {
      await savePosterConfig(orgId, { ...config, lastSync: new Date().toISOString(), syncedData });
    }

    res.json({ ok: true, source, totalRevenue: Math.round(totalRevenue), totalTransactions, avgCheck, dailyRevenue, dateFrom, dateTo, syncError });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /poster/revenue — get cached synced revenue
router.get("/revenue", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const config = await getPosterConfig(orgId);
    if (!config?.syncedData) {
      // Return demo preview even if not connected
      const demo = demoRevenue(30);
      return res.json({
        connected: false,
        source: "demo",
        totalRevenue: demo.reduce((s, d) => s + d.revenue, 0),
        totalTransactions: demo.reduce((s, d) => s + d.transactions, 0),
        avgCheck: Math.round(demo.reduce((s, d) => s + d.avgCheck, 0) / demo.length),
        dailyRevenue: demo,
        lastSync: null,
      });
    }
    res.json({ connected: !!config?.apiKey, ...config.syncedData, lastSync: config.lastSync });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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
    res.json({
      ok: true,
      chargeRef,
      bookingId,
      amount,
      description: description || "Замовлення з ресторану",
      posterOrderId,
      createdAt: new Date().toISOString(),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
