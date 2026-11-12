import { createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { authenticatePos, digestPosToken, PosterPosError, type PosContext } from "./poster-pos-notifications.js";
import { bridgeAccount, bridgeCall, bridgePlan, assertRemoteUnchanged, type BridgeConfig, type BridgeState } from "./poster-order-bridge.js";

// Never substitute a server transaction number for the terminal's millisecond ID.
export function kitchenRevision(state: BridgeState) {
  const sorted = (map: Record<string, number> = {}) => Object.keys(map).sort().map(key => [key, map[key]]);
  return createHash("sha256").update(JSON.stringify([
    state.remoteOrderId, state.tableId, sorted(state.quantities), sorted(state.prices),
  ])).digest("hex");
}
export function kitchenTerminalReady(account: any, config: BridgeConfig, now = Date.now()) {
  const channel = account?.posNotifications;
  const age = now - Date.parse(channel?.kitchenReadyAt);
  return channel?.enabled === true && !!channel.tokenHash
    && channel.account === account.accountId && channel.spotId === config.spotId && channel.tabletId === config.tabletId
    && Number.isFinite(age) && age >= -5000 && age < 45000;
}
export function kitchenEligible(order: any, account: any, config: BridgeConfig) {
  const state: BridgeState | undefined = order.poster_sync;
  return !!(config.enabled && config.kitchenEnabled && config.kitchenActivatedAt
    && Date.parse(order.opened_at) >= Date.parse(config.kitchenActivatedAt)
    && !["billed", "cancelled", "new_guest"].includes(order.status) && Number(order.paid_amount || 0) === 0
    && state?.status === "synced" && !state.pending && state.remoteOrderId && state.tableId
    && state.spotId === config.spotId && state.tabletId === config.tabletId
    && state.tableId === config.tableMap[String(order.table_id)]
    && state.accountBinding === digestPosToken(account?.apiKey || "")
    && Object.keys(state.quantities || {}).length > 0
    && Object.entries(state.quantities || {}).every(([key, qty]) =>
      Number.isInteger(qty) && qty > 0 && Number.isFinite(state.prices?.[key])));
}
export function kitchenJob(order: any, account: any, config: BridgeConfig) {
  if (!kitchenEligible(order, account, config)) return null;
  const state: BridgeState = order.poster_sync, revision = kitchenRevision(state);
  if (state.kitchen && (["claimed", "review"].includes(state.kitchen.status) || state.kitchen.revision === revision)) return null;
  return { orderId: order.id, remoteOrderId: state.remoteOrderId!, tableId: state.tableId!,
    revision, quantities: state.quantities!, prices: state.prices! };
}
export function visibleKitchen(order: any, account: any, config: BridgeConfig) {
  const k: BridgeState["kitchen"] = order.poster_sync?.kitchen;
  if (k && (["claimed", "review"].includes(k.status) || k.revision === kitchenRevision(order.poster_sync))) {
    return { status: k.status, updatedAt: k.updatedAt };
  }
  return kitchenJob(order, account, config) ? { status: "waiting" as const } : undefined;
}
async function kitchenSession(context: PosContext, token: string, database: any) {
  const session = await authenticatePos(context, token, false, database);
  const { account, config } = await bridgeAccount(session.orgId, database);
  if (!config.enabled || !config.kitchenEnabled || !config.kitchenActivatedAt) return { ...session, account, bridge: config, enabled: false };
  if (account.accountId !== context.account || config.spotId !== context.spotId || config.tabletId !== context.tabletId) {
    throw new PosterPosError(409, "Касу для бігунків змінено. Перевірте налаштування Poster.");
  }
  return { ...session, account, bridge: config, enabled: true };
}
export async function pollKitchen(context: PosContext, token: string, database: any = pool) {
  const session = await kitchenSession(context, token, database);
  const heartbeat = await database.query(`UPDATE organizations SET enabled_modules=jsonb_set(enabled_modules,
    '{posterConfig,posNotifications,kitchenReadyAt}',to_jsonb($3::text))
    WHERE id=$1 AND enabled_modules->'posterConfig'->'posNotifications'->>'tokenHash'=$2 RETURNING id`,
  [session.orgId, session.hash, new Date().toISOString()]);
  if (!heartbeat.rows.length) throw new PosterPosError(403, "Доступ каси відкликано.");
  if (!session.enabled) return { enabled: false, jobs: [] };
  const rows = (await database.query(`SELECT * FROM fb_orders
    WHERE organization_id=$1 AND opened_at >= $2::timestamptz
      AND status NOT IN ('billed','cancelled','new_guest') AND coalesce(paid_amount,0)=0
      AND poster_sync->>'status'='synced'
      AND coalesce(poster_sync->'kitchen'->>'status','') NOT IN ('claimed','review')
      AND (poster_sync->'kitchen' IS NULL
        OR poster_sync->'kitchen'->'quantities' IS DISTINCT FROM poster_sync->'quantities'
        OR poster_sync->'kitchen'->'prices' IS DISTINCT FROM poster_sync->'prices')
    ORDER BY opened_at LIMIT 100`, [session.orgId, session.bridge.kitchenActivatedAt])).rows;
  return { enabled: true, jobs: rows.map((row: any) => kitchenJob(row, session.account, session.bridge)).filter(Boolean) };
}
type Claim = { orderId: number; revision: string; terminalOrderId: number };
export async function claimKitchen(context: PosContext, token: string, input: Claim, database: any = pool, call = bridgeCall) {
  const client = await database.connect();
  let locked = false;
  try {
    const session = await kitchenSession(context, token, client);
    if (!session.enabled) throw new PosterPosError(409, "Друк бігунків вимкнено.");
    locked = (await client.query("SELECT pg_try_advisory_lock($1::int,$2::int) AS locked", [session.orgId, input.orderId])).rows[0]?.locked;
    if (!locked) throw new PosterPosError(409, "Рахунок зараз змінюється. Дочекайтеся синхронізації.");
    const order = (await client.query("SELECT * FROM fb_orders WHERE id=$1 AND organization_id=$2", [input.orderId, session.orgId])).rows[0];
    const job = order && kitchenJob(order, session.account, session.bridge);
    if (!job || job.revision !== input.revision) throw new PosterPosError(409, "Завдання бігунків змінилося або вже отримано касою.");
    const state: BridgeState = order.poster_sync;
    const items = (await client.query("SELECT * FROM fb_order_items WHERE order_id=$1 AND organization_id=$2 ORDER BY id", [input.orderId, session.orgId])).rows;
    const plan = bridgePlan(order, items, session.bridge);
    if (kitchenRevision({ ...state, ...plan }) !== job.revision) {
      throw new PosterPosError(409, "Нові страви ще не синхронізовано з Poster.");
    }
    // A read failure or cashier edits cannot grant permission to print a stale bill.
    const remote = await call(session.account.apiKey, "dash.getTransaction", { transaction_id: state.remoteOrderId, include_products: "true" });
    assertRemoteUnchanged(Array.isArray(remote) ? remote[0] : null, state, session.bridge);
    const attemptId = randomBytes(32).toString("hex");
    const kitchen = { revision: job.revision, status: "claimed", attemptId,
      channelId: session.config.channelId, terminalOrderId: input.terminalOrderId, updatedAt: new Date().toISOString(),
      quantities: state.quantities, prices: state.prices };
    // Atomic configuration check after the provider read: revoked or re-paired terminals cannot claim.
    const saved = await client.query(`UPDATE fb_orders o SET poster_sync=jsonb_set(o.poster_sync,'{kitchen}',$3::jsonb)
      FROM organizations g WHERE o.id=$1 AND o.organization_id=$2 AND g.id=o.organization_id
      AND g.enabled_modules->'posterConfig'->'orderBridge'=$4::jsonb
      AND g.enabled_modules->'posterConfig'->'posNotifications'->>'tokenHash'=$5
      AND g.enabled_modules->'posterConfig'->'posNotifications'->>'enabled'='true'
      AND g.enabled_modules->'posterConfig'->>'apiKey'=$6
      AND g.enabled_modules->'posterConfig'->>'verified'='true'
      AND g.enabled_modules->'posterConfig'->>'accountId'=$7
      AND o.poster_sync=$8::jsonb AND o.status NOT IN ('billed','cancelled','new_guest')
      AND coalesce(o.paid_amount,0)=0 RETURNING o.id`,
    [input.orderId, session.orgId, JSON.stringify(kitchen), JSON.stringify(session.account.orderBridge),
      session.hash, session.account.apiKey, context.account, JSON.stringify(state)]);
    if (!saved.rows.length) throw new PosterPosError(409, "Налаштування змінилися. Бігунки не відправлено.");
    return { attemptId };
  } finally {
    let broken = false;
    if (locked) try { await client.query("SELECT pg_advisory_unlock($1::int,$2::int)", [Number(token.split(".")[0]), input.orderId]); } catch { broken = true; }
    client.release(broken);
  }
}
type Result = { orderId: number; attemptId: string; outcome: "submitted" | "already_sent" | "review" };
export async function recordKitchen(context: PosContext, token: string, input: Result, database: any = pool) {
  // Allow reporting a previously granted attempt even after the owner disables printing.
  const session = await authenticatePos(context, token, false, database);
  const result = await database.query(`UPDATE fb_orders SET poster_sync=jsonb_set(poster_sync,'{kitchen}',
    (poster_sync->'kitchen') || $4::jsonb) WHERE id=$1 AND organization_id=$2
    AND poster_sync->'kitchen'->>'attemptId'=$3
    AND poster_sync->'kitchen'->>'channelId'=$5
    AND poster_sync->'kitchen'->>'status' IN ('claimed',$6) RETURNING id`,
  [input.orderId, session.orgId, input.attemptId,
    JSON.stringify({ status: input.outcome, updatedAt: new Date().toISOString() }), session.config.channelId, input.outcome]);
  if (!result.rows.length) throw new PosterPosError(409, "Спроба друку вже змінена. Повторний друк заборонено.");
  return { ok: true };
}
