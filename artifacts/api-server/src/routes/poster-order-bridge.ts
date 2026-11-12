import { Router } from "express";
import { pool } from "@workspace/db";
import { UpdatePosterOrderBridgeBody } from "@workspace/api-zod";
import { bridgeAccount, bridgeCall, dispatchPosterOrder } from "../lib/poster-order-bridge.js";
import { visiblePosterDiagnostic } from "../lib/poster-diagnostics.js";
import { visibleKitchen, kitchenTerminalReady } from "../lib/poster-kitchen.js";
import { posChannelOnline } from "../lib/poster-pos-notifications.js";

const router = Router();
const input = UpdatePosterOrderBridgeBody;
const canConfigure = (req: any) => ["owner", "manager", "admin", "super_admin"].includes(req.user?.role);
function visibleState(state: any, kitchen?: ReturnType<typeof visibleKitchen>) {
  if (!state) return null;
  return { status: state.status, remoteOrderId: state.remoteOrderId, message: state.message, lastSync: state.lastSync,
    diagnostic: visiblePosterDiagnostic(state.diagnostic), ...(kitchen ? { kitchen } : {}) };
}
async function view(orgId: number) {
  const { account, config } = await bridgeAccount(orgId);
  const [tables, items] = await Promise.all([
    pool.query("SELECT id, number AS name FROM fb_tables WHERE organization_id=$1 AND is_active=true ORDER BY number", [orgId]),
    pool.query("SELECT id,name,price FROM fb_items WHERE organization_id=$1 ORDER BY name", [orgId]),
  ]);
  return { config, localTables: tables.rows, localItems: items.rows, printSupported: config.kitchenEnabled === true,
    kitchenTerminalReady: kitchenTerminalReady(account, config) };
}
async function catalog(orgId: number, suppliedAccount?: any) {
  const account = suppliedAccount || (await bridgeAccount(orgId)).account;
  if (!account?.apiKey) throw new Error("Спочатку підключіть Poster.");
  const result = await Promise.all([
    bridgeCall(account.apiKey, "spots.getSpots"), bridgeCall(account.apiKey, "access.getTablets"),
    bridgeCall(account.apiKey, "access.getEmployees"), bridgeCall(account.apiKey, "menu.getProducts"),
    bridgeCall(account.apiKey, "spots.getTableHallTables", { without_deleted: 1 }),
  ]);
  if (result.some(r => !Array.isArray(r))) throw new Error("Poster повернув непідтримуваний довідник.");
  // Never forward employee PII or unrelated provider credential fields.
  return {
    spots: result[0].map((x: any) => ({ spot_id: Number(x.spot_id), name: x.name })),
    tablets: result[1].map((x: any) => ({ tablet_id: Number(x.tablet_id), spot_id: Number(x.spot_id), name: x.tablet_name })),
    employees: result[2].map((x: any) => ({ user_id: Number(x.user_id), name: x.name })),
    products: result[3].map((x: any) => ({ product_id: Number(x.product_id), product_name: x.product_name, price: x.price })),
    tables: result[4].map((x: any) => ({ table_id: Number(x.table_id), table_name: x.table_title || x.table_num, spot_id: Number(x.spot_id) })),
  };
}
router.get("/", async (req: any, res) => {
  try { return res.json(await view(req.user.organizationId)); }
  catch { return res.status(500).json({ error: "Не вдалося прочитати налаштування обміну." }); }
});
router.get("/catalog", async (req: any, res) => {
  if (!canConfigure(req)) return res.status(403).json({ error: "Налаштування доступні керівнику закладу." });
  try { return res.json(await catalog(req.user.organizationId)); }
  catch { return res.status(502).json({ error: "Не вдалося завантажити довідники Poster. Перевірте доступ до меню, кас і працівників." }); }
});
router.put("/", async (req: any, res) => {
  if (!canConfigure(req)) return res.status(403).json({ error: "Налаштування доступні керівнику закладу." });
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Перевірте ідентифікатори каси, працівника, столів і страв." });
  const orgId = req.user.organizationId;
  try {
    const { account } = await bridgeAccount(orgId);
    const local = await view(orgId);
    const config = parsed.data;
    if (Object.keys(config.tableMap).some(id => !local.localTables.some(t => String(t.id) === id))
      || Object.keys(config.productMap).some(id => !local.localItems.some(t => String(t.id) === id))) {
      return res.status(400).json({ error: "Не можна зіставити дані іншого закладу." });
    }
    if (config.enabled) {
      if (!config.spotId || !config.tabletId || !config.waiterId || !Object.keys(config.tableMap).length || !Object.keys(config.productMap).length) {
        return res.status(400).json({ error: "Перед увімкненням виберіть заклад, касу, працівника і зіставте столи та страви." });
      }
      const remote = await catalog(orgId, account);
      if (!remote.spots.some((s: any) => Number(s.spot_id) === config.spotId)
        || !remote.tablets.some((s: any) => Number(s.tablet_id) === config.tabletId && Number(s.spot_id) === config.spotId)
        || !remote.employees.some((s: any) => Number(s.user_id) === config.waiterId)
        || Object.values(config.tableMap).some(id => !remote.tables.some((t: any) => Number(t.table_id) === id && Number(t.spot_id) === config.spotId))
        || Object.values(config.productMap).some(id => !remote.products.some((t: any) => Number(t.product_id) === id))) {
        return res.status(400).json({ error: "Налаштування не відповідають довідникам цього акаунту Poster." });
      }
      // Check that the journal column has been applied by the normal dev/publish flow.
      await pool.query("SELECT poster_sync FROM fb_orders WHERE organization_id=$1 LIMIT 0", [orgId]);
    }
    if (config.kitchenEnabled && (!config.enabled || !kitchenTerminalReady(account, config) || !posChannelOnline(account?.posNotifications)
      || account.posNotifications.account !== account.accountId
      || account.posNotifications.spotId !== config.spotId || account.posNotifications.tabletId !== config.tabletId)) {
      return res.status(409).json({ error: "Для бігунків увімкніть обмін і підключіть саме вибрану касу Poster. Каса має бути онлайн." });
    }
    const activatedAt = config.enabled ? (local.config.enabled ? local.config.activatedAt : new Date().toISOString()) : undefined;
    const kitchenActivatedAt = config.enabled && config.kitchenEnabled
      ? (local.config.kitchenEnabled ? local.config.kitchenActivatedAt : new Date().toISOString()) : undefined;
    // Update just the bridge subtree, not a stale copy of credentials/report caches.
    const updated = await pool.query(`UPDATE organizations
      SET enabled_modules=jsonb_set(enabled_modules,'{posterConfig,orderBridge}',$2::jsonb)
      WHERE id=$1 AND enabled_modules->'posterConfig'->>'apiKey'=$3
      AND enabled_modules->'posterConfig'->>'accountId'=$4
      AND enabled_modules->'posterConfig'->'orderBridge' IS NOT DISTINCT FROM $5::jsonb
      AND ($6::boolean=false OR (enabled_modules->'posterConfig'->'posNotifications'->>'tokenHash'=$7
        AND enabled_modules->'posterConfig'->'posNotifications'->>'enabled'='true')) RETURNING id`,
    [orgId, JSON.stringify({ ...config, activatedAt, kitchenActivatedAt }), account?.apiKey,
      account?.accountId, account?.orderBridge ? JSON.stringify(account.orderBridge) : null,
      config.kitchenEnabled, account?.posNotifications?.tokenHash || null]);
    if (!updated.rows.length) return res.status(409).json({ error: "Підключення Poster або налаштування змінилися. Оновіть сторінку перед збереженням." });
    return res.json(await view(orgId));
  } catch { return res.status(500).json({ error: "Налаштування не збережено. Перевірте доступ Poster та застосування оновлення схеми." }); }
});
router.get("/orders/:id", async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Некоректне замовлення." });
  try {
    const { rows } = await pool.query("SELECT to_jsonb(o) AS data FROM fb_orders o WHERE id=$1 AND organization_id=$2", [id, req.user.organizationId]);
    if (!rows.length) return res.status(404).json({ error: "Замовлення не знайдено." });
    const { account, config } = await bridgeAccount(req.user.organizationId);
    return res.json({ enabled: config.enabled, state: visibleState(rows[0].data.poster_sync,
      visibleKitchen(rows[0].data, account, config)), printSupported: config.kitchenEnabled === true });
  } catch { return res.status(500).json({ error: "Не вдалося прочитати статус Poster." }); }
});
router.post("/orders/:id/send", async (req: any, res) => {
  const id = Number(req.params.id), orgId = req.user.organizationId;
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Некоректне замовлення." });
  try {
    const order = (await pool.query("SELECT id FROM fb_orders WHERE id=$1 AND organization_id=$2", [id, orgId])).rows[0];
    if (!order) return res.status(404).json({ error: "Замовлення не знайдено." });
    const { config } = await bridgeAccount(orgId);
    if (!config.enabled) return res.status(409).json({ error: "Передавання в Poster вимкнено керівником закладу." });
    return res.json({ enabled: true, state: visibleState(await dispatchPosterOrder(orgId, id)), printSupported: config.kitchenEnabled === true });
  } catch { return res.status(500).json({ error: "Не вдалося передати замовлення. Перевірте його статус перед повтором." }); }
});
export default router;
