import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import { createHash } from "node:crypto";

export type BridgeConfig = {
  enabled: boolean; spotId: number; tabletId: number; waiterId: number;
  tableMap: Record<string, number>; productMap: Record<string, number>; activatedAt?: string;
};
export const emptyBridge: BridgeConfig = { enabled: false, spotId: 0, tabletId: 0, waiterId: 0, tableMap: {}, productMap: {} };
export type BridgeState = {
  status: string; remoteOrderId?: number; message?: string; lastSync?: string;
  spotId?: number; tabletId?: number; tableId?: number;
  accountBinding?: string;
  quantities?: Record<string, number>; prices?: Record<string, number>; comment?: string;
  pending?: { method: string; at: string; params: Record<string, any> };
};

class PosterWriteError extends Error {
  constructor(message: string, public uncertain = false) { super(message); }
}

// Never expose provider URLs (they contain the tenant's bearer token).
export async function bridgeCall(token: string, method: string, params: Record<string, any> = {}, write = false): Promise<any> {
  let r: Response;
  try {
    const url = new URL(`https://joinposter.com/api/${method}`);
    url.searchParams.set("token", token);
    const options: RequestInit = { signal: AbortSignal.timeout(15000) };
    if (write) {
      options.method = "POST";
      options.headers = { "Content-Type": "application/x-www-form-urlencoded" };
      options.body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    } else for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    r = await fetch(url, options);
  } catch { throw new PosterWriteError("Зв’язок із Poster перервано.", write); }
  if (!r.ok) throw new PosterWriteError(`Poster HTTP ${r.status}.`, write);
  let body: any;
  try { body = await r.json(); } catch { throw new PosterWriteError("Некоректна відповідь Poster.", write); }
  if (!body || typeof body !== "object") throw new PosterWriteError("Порожня відповідь Poster.", write);
  if (body.error || (body.error_code !== undefined && Number(body.error_code) !== 0)) {
    throw new PosterWriteError("Poster відхилив запит. Перевірте доступ і налаштування каси.");
  }
  if (body.response === undefined || body.response === null) throw new PosterWriteError("Непідтверджений результат Poster.", write);
  if (body.response.err_code !== undefined && Number(body.response.err_code) !== 0) {
    throw new PosterWriteError("Poster не виконав операцію з рахунком.");
  }
  return body.response;
}

export async function bridgeAccount(orgId: number, client: any = pool) {
  const { rows } = await client.query("SELECT enabled_modules FROM organizations WHERE id=$1", [orgId]);
  const account = rows[0]?.enabled_modules?.posterConfig;
  return { account, config: { ...emptyBridge, ...account?.orderBridge } as BridgeConfig };
}

export async function isPosterManagedOrder(orgId: number, orderId: number) {
  const { config } = await bridgeAccount(orgId);
  const order = (await pool.query("SELECT to_jsonb(o) AS data FROM fb_orders o WHERE id=$1 AND organization_id=$2", [orderId, orgId])).rows[0]?.data;
  if (!order) return false;
  return !!(order.poster_sync?.remoteOrderId || order.poster_sync?.pending
    || (config.enabled && config.activatedAt && config.tableMap[String(order.table_id)]
      && Date.parse(order.opened_at) >= Date.parse(config.activatedAt)));
}

// Explicit maps only: never match by name, local id, or table number implicitly.
export function bridgePlan(order: any, items: any[], config: BridgeConfig) {
  const tableId = config.tableMap[String(order.table_id)];
  if (!tableId) throw new Error("Зіставте стіл, номер або будинок із місцем обслуговування Poster.");
  if (Number(order.discount_amount || 0) !== 0) throw new Error("Рахунок зі знижкою потребує окремого узгодження з Poster.");
  const quantities: Record<string, number> = {};
  const prices: Record<string, number> = {};
  const notes: string[] = [];
  for (const item of items.filter(i => i.status !== "cancelled")) {
    const productId = config.productMap[String(item.item_id)];
    if (!productId) throw new Error(`Не зіставлено страву «${String(item.name).slice(0, 100)}» з Poster.`);
    const mods = typeof item.modifiers === "string" ? JSON.parse(item.modifiers) : item.modifiers;
    if (mods && (!Array.isArray(mods) || mods.length)) throw new Error("Страви з модифікаторами потребують окремого зіставлення; їх не буде відправлено без модифікаторів.");
    const qty = Number(item.quantity), price = Number(item.price);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 100 || !Number.isFinite(price) || price < 0) {
      throw new Error("Непідтримувана кількість або ціна страви.");
    }
    const key = String(productId);
    if (prices[key] !== undefined && prices[key] !== price) throw new Error("Різні ціни для однієї позиції Poster.");
    prices[key] = price;
    quantities[key] = (quantities[key] || 0) + qty;
    if (item.notes) notes.push(`${item.name}: ${String(item.notes).slice(0, 200)}`);
  }
  const comment = [`Maison HD #${order.id}`, order.room_number ? `Номер/будинок: ${order.room_number}` : "",
    order.notes || "", ...notes].filter(Boolean).join("\n").slice(0, 2000);
  return { tableId, quantities, prices, comment };
}

export function assertRemoteUnchanged(remote: any, state: BridgeState, config: BridgeConfig) {
  if (!remote || Number(remote.transaction_id) !== state.remoteOrderId || Number(remote.spot_id) !== config.spotId
    || Number(remote.table_id) !== state.tableId || !Array.isArray(remote.products)) throw new Error("Не вдалося підтвердити відповідність рахунку Poster.");
  if (Number(remote.status) !== 1) throw new Error("Рахунок у Poster вже закрито або видалено. Автоматично повторно не відкриваємо.");
  if (Number(remote.discount || 0) !== 0) throw new Error("Знижку на касі змінено. Потрібна звірка рахунку.");
  const observed: Record<string, number> = {};
  for (const product of remote.products) {
    if (Number(product.modification_id || 0) !== 0) throw new Error("Рахунок змінено на касі: потрібна ручна перевірка модифікаторів.");
    const key = String(product.product_id);
    if (state.prices?.[key] !== undefined && (!Number.isFinite(Number(product.product_price)) || Math.abs(Number(product.product_price) / 100 - state.prices[key]) > 0.005)) {
      throw new Error("Ціну в рахунку Poster змінено. Потрібна ручна перевірка.");
    }
    observed[key] = (observed[key] || 0) + Number(product.num);
  }
  const expected = state.quantities || {};
  if (Object.keys(observed).length !== Object.keys(expected).length
    || Object.entries(observed).some(([k, v]) => v !== expected[k])) {
    throw new Error("Рахунок змінено безпосередньо на касі. Передавання призупинено, щоб не перезаписати зміни.");
  }
  if (state.comment && remote.transaction_comment !== state.comment) throw new Error("Коментар рахунку змінено на касі. Потрібна ручна перевірка.");
}

async function saveState(client: any, orgId: number, orderId: number, state: BridgeState) {
  const saved = await client.query(
    "UPDATE fb_orders SET poster_sync=$3::jsonb WHERE id=$1 AND organization_id=$2 RETURNING id",
    [orderId, orgId, JSON.stringify(state)]);
  if (!saved.rows.length) throw new Error("Замовлення не знайдено.");
}

export async function dispatchPosterOrder(orgId: number, orderId: number) {
  const client = await pool.connect();
  let locked = false;
  let state: BridgeState = { status: "pending", quantities: {} };
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock($1::int,$2::int) AS locked", [orgId, orderId])).rows[0]?.locked;
    if (!locked) return { status: "pending", message: "Передавання вже виконується." };
    const { account, config } = await bridgeAccount(orgId, client);
    if (!config.enabled || !account?.apiKey) return { status: "disabled", message: "Передавання вимкнено." };
    const order = (await client.query("SELECT * FROM fb_orders WHERE id=$1 AND organization_id=$2", [orderId, orgId])).rows[0];
    if (!order) throw new Error("Замовлення не знайдено.");
    state = order.poster_sync || state;
    // A persisted in-flight command may already have succeeded remotely.
    if (state.pending || state.status === "review") {
      state.status = "review";
      state.message = "Результат попереднього запиту невідомий. Повторне надсилання заблоковано до звірки з Poster.";
      await saveState(client, orgId, orderId, state);
      return state;
    }
    if (["billed", "cancelled"].includes(order.status) || Number(order.paid_amount || 0) > 0) {
      if (state.remoteOrderId) {
        state.status = "blocked"; state.message = "Локальний рахунок закрито або оплачено. Оплату та скасування в Poster звірте окремо.";
        await saveState(client, orgId, orderId, state);
      }
      return state;
    }
    const items = (await client.query("SELECT * FROM fb_order_items WHERE order_id=$1 AND organization_id=$2 ORDER BY id", [orderId, orgId])).rows;
    const plan = bridgePlan(order, items, config);
    const accountBinding = createHash("sha256").update(account.apiKey).digest("hex");
    if (state.remoteOrderId && state.accountBinding !== accountBinding) {
      throw new Error("Підключення Poster змінено після створення рахунку. Потрібна ручна перевірка прив’язки.");
    }
    if (state.remoteOrderId && (state.spotId !== config.spotId || state.tabletId !== config.tabletId || state.tableId !== plan.tableId)) {
      throw new Error("Не можна змінювати касу або стіл уже пов’язаного рахунку.");
    }
    // Never remove previously exported dishes automatically.
    for (const [key, count] of Object.entries(state.quantities || {})) {
      if ((plan.quantities[key] || 0) < count) throw new Error("Видалення або зменшення переданої страви потребує звірки на касі Poster.");
    }
    if (!Object.keys(plan.quantities).length) return state;
    // Read current provider prices, not stale mapping-time prices.
    const products = await bridgeCall(account.apiKey, "menu.getProducts");
    if (!Array.isArray(products)) throw new Error("Не вдалося перевірити меню Poster.");
    for (const [id, localPrice] of Object.entries(plan.prices)) {
      const product = products.find((p: any) => String(p.product_id) === id);
      const raw = product?.price;
      const minor = typeof raw === "object" && raw !== null ? raw[String(config.spotId)] : raw;
      const remotePrice = Number(minor) / 100;
      if (!product || minor === undefined || minor === null || !Number.isFinite(remotePrice) || Math.abs(remotePrice - localPrice) > 0.005) {
        throw new Error("Ціна страви відрізняється від Poster або не підтверджена для вибраного закладу. Передавання зупинено.");
      }
    }
    if (state.remoteOrderId) {
      const remote = await bridgeCall(account.apiKey, "dash.getTransaction", { transaction_id: state.remoteOrderId, include_products: "true" });
      assertRemoteUnchanged(Array.isArray(remote) ? remote[0] : null, state, config);
    }
    const write = async (method: string, params: Record<string, any>, accept: (r: any) => void) => {
      const current = await bridgeAccount(orgId, client);
      if (!current.config.enabled || current.account?.apiKey !== account.apiKey
        || JSON.stringify(current.config) !== JSON.stringify(config)) {
        throw new Error("Налаштування передавання змінено під час обробки. Подальші запити зупинено.");
      }
      // The Web API has no compare-and-swap. Recheck immediately before each
      // command; simultaneous edits on the POS are explicitly unsupported.
      if (state.remoteOrderId) {
        const observed = await bridgeCall(account.apiKey, "dash.getTransaction", { transaction_id: state.remoteOrderId, include_products: "true" });
        assertRemoteUnchanged(Array.isArray(observed) ? observed[0] : null, state, config);
      }
      // Persist BEFORE crossing the network. A process crash must never lead to a blind replay.
      state.pending = { method, at: new Date().toISOString(), params };
      state.accountBinding = accountBinding;
      state.status = "pending";
      await saveState(client, orgId, orderId, state);
      let result: any;
      try { result = await bridgeCall(account.apiKey, method, params, true); }
      catch (e) {
        if (e instanceof PosterWriteError && !e.uncertain) delete state.pending;
        throw e;
      }
      accept(result);
      delete state.pending;
      await saveState(client, orgId, orderId, state);
    };
    if (!state.remoteOrderId) {
      await write("transactions.createTransaction", {
        spot_id: config.spotId, spot_tablet_id: config.tabletId, table_id: plan.tableId,
        user_id: config.waiterId, guests_count: Math.max(1, Number(order.guest_count) || 1), service_mode: 1,
      }, result => {
        if (!Number.isSafeInteger(Number(result.transaction_id)) || Number(result.transaction_id) <= 0) {
          throw new PosterWriteError("Poster не підтвердив номер створеного рахунку.", true);
        }
        state.remoteOrderId = Number(result.transaction_id); state.spotId = config.spotId;
        state.tabletId = config.tabletId; state.tableId = plan.tableId; state.quantities = {};
      });
    }
    const base = { spot_id: config.spotId, spot_tablet_id: config.tabletId, transaction_id: state.remoteOrderId };
    if (state.comment !== plan.comment) {
      await write("transactions.changeComment", { ...base, comment: plan.comment }, r => {
        if (Number(r.err_code) !== 0) throw new PosterWriteError("Не підтверджено коментар рахунку.", true);
        state.comment = plan.comment;
      });
    }
    for (const [productId, count] of Object.entries(plan.quantities)) {
      if (!state.quantities?.[productId]) {
        await write("transactions.addTransactionProduct", { ...base, product_id: productId }, r => {
          if (!Number(r.transaction_product)) throw new PosterWriteError("Не підтверджено додавання страви.", true);
          state.quantities = { ...state.quantities, [productId]: 1 };
          state.prices = { ...state.prices, [productId]: plan.prices[productId] };
        });
      }
      if (state.quantities![productId] !== count) {
        await write("transactions.changeTransactionProductCount", { ...base, product_id: productId, count }, r => {
          if (Number(r.err_code) !== 0) throw new PosterWriteError("Не підтверджено кількість страви.", true);
          state.quantities![productId] = count;
        });
      }
    }
    state.status = "synced"; state.message = "Передано у відкритий рахунок Poster. Друк бігунків окремо не підтверджено.";
    state.lastSync = new Date().toISOString();
    await saveState(client, orgId, orderId, state);
    return state;
  } catch (error) {
    state.status = state.pending ? "review" : "blocked";
    state.message = state.pending ? "Результат запиту невідомий. Потрібна звірка з Poster; автоматичний повтор заборонено."
      : error instanceof PosterWriteError ? error.message
        : error instanceof Error && !("query" in error) ? error.message : "Не вдалося обробити передавання.";
    // Do not propagate database errors (they may contain query parameters).
    if (locked) await saveState(client, orgId, orderId, state).catch(() => {});
    return state;
  } finally {
    let broken = false;
    if (locked) {
      try { await client.query("SELECT pg_advisory_unlock($1::int,$2::int)", [orgId, orderId]); }
      catch { broken = true; }
    }
    client.release(broken);
  }
}

let running = false;
export function startPosterOrderBridge() {
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      // Disabled by default. No pre-existing orders are automatically exported on activation.
      const orgs = (await pool.query(`SELECT id, enabled_modules->'posterConfig'->'orderBridge' AS config
        FROM organizations WHERE enabled_modules->'posterConfig'->'orderBridge'->>'enabled'='true'`)).rows;
      for (const org of orgs) {
        if (!org.config.activatedAt) continue;
        const orders = (await pool.query(`SELECT id FROM fb_orders WHERE organization_id=$1
          AND ((opened_at >= $2::timestamptz AND status NOT IN ('billed','cancelled')) OR poster_sync->>'remoteOrderId' IS NOT NULL)
          AND coalesce(poster_sync->>'status','') NOT IN ('review','blocked')
          ORDER BY coalesce((poster_sync->>'lastSync')::timestamptz, opened_at) LIMIT 10`,
        [org.id, org.config.activatedAt])).rows;
        for (const order of orders) await dispatchPosterOrder(org.id, order.id);
      }
    } catch { logger.warn("Poster order bridge scan unavailable; no provider write retried."); }
    finally { running = false; }
  }, 10000);
  timer.unref();
}
