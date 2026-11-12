import { pool } from "@workspace/db";
import { posChannelOnline, readPosChannel } from "./poster-pos-notifications.js";

// A merchant key or a recipient PAN is not proof of settlement/payout capability.
// Keep both server and guest UI fail-closed until the durable payment lifecycle exists.
export const sharedQrPaymentReadiness = Object.freeze({ checkout: false, tipPayout: false });

export class ServicePointError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function parseServicePointQr(raw: string) {
  let url: URL;
  try { url = new URL(raw.trim(), "https://qr.invalid"); }
  catch { throw new ServicePointError(400, "Некоректне посилання QR."); }
  const match = /\/qr-menu\/([^/]+)\/([1-9]\d*)\/?$/.exec(url.pathname);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !match) {
    throw new ServicePointError(400, "Відскануйте QR конкретного столу, будинку або номера.");
  }
  const id = Number(match[2]);
  let slug: string;
  try { slug = decodeURIComponent(match[1]); } catch { throw new ServicePointError(400, "Некоректний QR."); }
  if (!Number.isSafeInteger(id) || id > 2147483647 || !slug || slug.length > 200) {
    throw new ServicePointError(400, "Некоректний QR.");
  }
  return { id, slug };
}

async function loadPoint(client: any, orgId: number, id: number, lock = false) {
  const point = (await client.query(`SELECT t.id, t.number, t.location, t.group_id,
      g.name AS group_name, t.status, t.current_order_id, org.slug
    FROM fb_tables t JOIN organizations org ON org.id=t.organization_id
    LEFT JOIN fb_table_groups g ON g.id=t.group_id AND g.organization_id=t.organization_id
    WHERE t.id=$1 AND t.organization_id=$2 AND t.is_active=true
      AND (t.group_id IS NULL OR g.is_active=true)
    ${lock ? "FOR UPDATE OF t" : ""}`, [id, orgId])).rows[0];
  if (!point) throw new ServicePointError(404, "Місце не знайдено у вашому закладі або групу вимкнено.");
  return point;
}

async function currentOrder(client: any, orgId: number, tableId: number, lock = false) {
  const rows = (await client.query(`SELECT id, paid_amount, total_amount, status FROM fb_orders
    WHERE organization_id=$1 AND table_id=$2 AND status NOT IN ('billed','cancelled')
    ORDER BY opened_at DESC LIMIT 2 ${lock ? "FOR UPDATE" : ""}`, [orgId, tableId])).rows;
  if (rows.length > 1) throw new ServicePointError(409, "Для цього місця відкрито кілька рахунків. Потрібна звірка на касі.");
  return rows[0] || null;
}

export async function resolveServicePoint(orgId: number, qr: string, database: any = pool) {
  const { id, slug } = parseServicePointQr(qr);
  const point = await loadPoint(database, orgId, id);
  if (point.slug !== slug) throw new ServicePointError(404, "QR належить іншому закладу.");
  const order = await currentOrder(database, orgId, id);
  return { point: { id: point.id, number: point.number, location: point.location,
    groupId: point.group_id, groupName: point.group_name ?? null }, orderId: order?.id ?? null };
}

export async function readServicePointBill(slug: string, id: number, database: any = pool) {
  const org = (await database.query("SELECT id FROM organizations WHERE slug=$1", [slug])).rows[0];
  if (!org) throw new ServicePointError(404, "Заклад не знайдено.");
  const resolved = await resolveServicePoint(org.id, `/qr-menu/${encodeURIComponent(slug)}/${id}`, database);
  if (!resolved.orderId) return { ...resolved, orgId: org.id, order: null, items: [], payable: false,
    cashRequestPending: false, cashRequestDelivery: "none" as const, cashChannelOnline: false };
  const order = (await database.query(`SELECT id,status,total_amount,paid_amount FROM fb_orders
    WHERE id=$1 AND organization_id=$2 AND table_id=$3 AND status NOT IN ('billed','cancelled')`,
  [resolved.orderId, org.id, id])).rows[0];
  if (!order) return { ...resolved, orgId: org.id, order: null, items: [], payable: false,
    cashRequestPending: false, cashRequestDelivery: "none" as const, cashChannelOnline: false };
  const items = (await database.query(`SELECT id,name,quantity,total_price,requires_confirmation,confirmed_at,sent_at
    FROM fb_order_items WHERE order_id=$1 AND organization_id=$2 AND status<>'cancelled' ORDER BY id`,
  [order.id, org.id])).rows;
  const cashRequest = (await database.query(`SELECT id,payload FROM fb_table_notifications
    WHERE organization_id=$1 AND table_id=$2 AND type='payment_cash' AND status='pending'
    AND payload->>'orderId'=$3 AND (payload->>'total')::numeric=$4 ORDER BY id DESC LIMIT 1`,
  [org.id, id, String(order.id), order.total_amount])).rows[0];
  const channel = await readPosChannel(org.id, database);
  const activeRequest = cashRequest?.payload?.destination === "poster"
    && cashRequest.payload.posterChannelId === channel.channelId ? cashRequest : null;
  return { ...resolved, orgId: org.id, order: { id: order.id, status: order.status,
    totalAmount: Number(order.total_amount) }, cashRequestPending: !!activeRequest,
    cashRequestDelivery: activeRequest ? (activeRequest.payload.posterDelivery ? "delivered" : "queued") : "none",
    cashChannelOnline: posChannelOnline(channel), payable: Number(order.paid_amount || 0) === 0
      && order.status !== "new_guest" && items.length > 0
      && !items.some((item: any) => item.requires_confirmation && !item.confirmed_at),
    items: items.map((item: any) => ({ id: item.id, name: item.name, quantity: Number(item.quantity),
      total: Number(item.total_price), awaitingAcceptance: !!(item.requires_confirmation && !item.confirmed_at),
      released: !!item.sent_at })) };
}

/** All creators lock the service point before its current order. Scanning never creates an order. */
export async function openServicePoint(orgId: number, id: number, database: any = pool, outletId?: number) {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    throw new ServicePointError(400, "Некоректне місце.");
  }
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const point = await loadPoint(client, orgId, id, true);
    if (outletId && !(await client.query(`SELECT id FROM fb_outlets
      WHERE id=$1 AND organization_id=$2 AND is_active=true`, [outletId, orgId])).rows.length) {
      throw new ServicePointError(404, "Точку продажу не знайдено у вашому закладі.");
    }
    let order = await currentOrder(client, orgId, id, true);
    let created = false;
    if (order && Number(order.paid_amount || 0) > 0) {
      throw new ServicePointError(409, "Рахунок уже оплачується. Перевірте стан на касі.");
    }
    if (!order) {
      if (["cleaning", "reserved"].includes(point.status)) {
        throw new ServicePointError(409, "Місце зарезервоване або на прибиранні. Спочатку змініть його стан.");
      }
      order = (await client.query(`INSERT INTO fb_orders
        (organization_id, table_id, order_type, guest_name, guest_count, status, outlet_id)
        VALUES ($1,$2,'dine_in',$3,1,'open',$4) RETURNING id`,
      [orgId, id, [point.group_name || point.location, point.number].filter(Boolean).join(" · "), outletId ?? null])).rows[0];
      created = true;
    }
    await client.query(`UPDATE fb_tables SET status='occupied', current_order_id=$1
      WHERE id=$2 AND organization_id=$3`, [order.id, id, orgId]);
    await client.query("COMMIT");
    return { orderId: order.id, created };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function releaseStaffItems(orgId: number, orderId: number, ids: number[], database: any = pool) {
  const reviewed = [...new Set(ids)];
  if (!reviewed.length || reviewed.length !== ids.length || reviewed.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new ServicePointError(400, "Перевірте перелік страв для відправлення.");
  }
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const order = (await client.query(`SELECT * FROM fb_orders WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
      [orderId, orgId])).rows[0];
    if (!order) throw new ServicePointError(404, "Замовлення не знайдено.");
    if (["billed", "cancelled", "new_guest"].includes(order.status) || Number(order.paid_amount || 0) > 0) {
      throw new ServicePointError(409, "Рахунок закрито, оплачується або QR-замовлення ще не прийнято на касі.");
    }
    const items = (await client.query(`SELECT * FROM fb_order_items
      WHERE order_id=$1 AND organization_id=$2 AND id=ANY($3::int[]) FOR UPDATE`,
    [orderId, orgId, reviewed])).rows;
    if (items.length !== reviewed.length || items.some((item: any) => item.status === "cancelled"
      || (!item.sent_at && item.status !== "pending")
      || (item.requires_confirmation && !item.confirmed_at))) {
      throw new ServicePointError(409, "Страви змінилися або гостьові позиції ще не прийняті на касі. Оновіть рахунок.");
    }
    const updated = await client.query(`UPDATE fb_order_items SET sent_at=NOW()
      WHERE order_id=$1 AND organization_id=$2 AND id=ANY($3::int[]) AND sent_at IS NULL RETURNING id`,
    [orderId, orgId, reviewed]);
    await client.query("COMMIT");
    return updated.rows.length;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

/** A cash request never records revenue, fiscalizes or closes a receipt. */
export async function requestCashPayment(slug: string, id: number,
  expected: { expectedOrderId: number; expectedTotal: number }, database: any = pool) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const org = (await client.query("SELECT id FROM organizations WHERE slug=$1", [slug])).rows[0];
    if (!org) throw new ServicePointError(404, "Заклад не знайдено.");
    const point = await loadPoint(client, org.id, id, true);
    const order = await currentOrder(client, org.id, id, true);
    if (!order || order.id !== expected.expectedOrderId || point.current_order_id !== order.id) {
      throw new ServicePointError(409, "Рахунок змінився. Оновіть його перед розрахунком.");
    }
    const amount = Number(order.total_amount);
    if (!Number.isFinite(amount) || !Number.isFinite(expected.expectedTotal) || amount <= 0 ||
      Math.abs(amount - expected.expectedTotal) > 0.005) {
      throw new ServicePointError(409, "Сума змінилася. Перевірте актуальний рахунок.");
    }
    const items = (await client.query(`SELECT id,requires_confirmation,confirmed_at FROM fb_order_items
      WHERE organization_id=$1 AND order_id=$2 AND status<>'cancelled'`, [org.id, order.id])).rows;
    if (Number(order.paid_amount || 0) > 0 || order.status === "new_guest" || !items.length ||
      items.some((item: any) => item.requires_confirmation && !item.confirmed_at)) {
      throw new ServicePointError(409, "Рахунок уже оплачується або гостьові позиції ще не прийняті.");
    }
    const channel = await readPosChannel(org.id, client);
    if (!posChannelOnline(channel)) {
      throw new ServicePointError(503, "Каса Poster зараз не підключена до сповіщень. Зверніться до офіціанта.");
    }
    const existing = (await client.query(`SELECT id,payload FROM fb_table_notifications
      WHERE organization_id=$1 AND table_id=$2 AND type='payment_cash' AND status='pending'
      AND payload->>'orderId'=$3 AND (payload->>'total')::numeric=$4
      AND payload->>'posterChannelId'=$5 ORDER BY id DESC LIMIT 1`,
    [org.id, id, String(order.id), amount, channel.channelId])).rows[0];
    let notificationId = existing?.id;
    if (!notificationId) {
      notificationId = (await client.query(`INSERT INTO fb_table_notifications
        (organization_id,table_id,table_number,table_location,type,payload,status)
        VALUES ($1,$2,$3,$4,'payment_cash',$5,'pending') RETURNING id`,
      [org.id, id, point.number, point.location, JSON.stringify({
        method: "cash", orderId: order.id, total: amount, tipPct: 0, tipAmount: 0,
        groupName: point.group_name ?? null, destination: "poster", posterChannelId: channel.channelId,
      })])).rows[0].id;
    }
    await client.query("COMMIT");
    const delivered = !!existing?.payload?.posterDelivery;
    return { ok: true, id: notificationId, duplicate: !!existing, destination: "poster" as const,
      delivery: delivered ? "delivered" as const : "queued" as const,
      message: delivered ? "Poster підтвердив показ сповіщення. Очікуйте офіціанта; рахунок ще не оплачено."
        : "Запит збережено для каси Poster. Очікуємо підтвердження показу; рахунок ще не оплачено." };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}
