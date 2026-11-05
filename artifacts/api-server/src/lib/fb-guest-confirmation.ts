import { pool } from "@workspace/db";

export const awaitsWaiterConfirmation = (order: any, item: any) =>
  item.status !== "cancelled" && !item.confirmed_at
    && (item.requires_confirmation === true || order.status === "new_guest");
export const canConfirmGuestItems = (role: string) =>
  ["owner", "admin", "super_admin", "manager", "waiter", "staff", "cashier"].includes(role);

export class GuestConfirmationError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export async function hasUnconfirmedGuestItems(orgId: number, orderId: number, client: any = pool) {
  return (await client.query(`SELECT qi.id FROM fb_order_items qi JOIN fb_orders qo ON qo.id=qi.order_id
    AND qo.organization_id=qi.organization_id WHERE qo.organization_id=$1 AND qo.id=$2
    AND qi.status<>'cancelled' AND qi.confirmed_at IS NULL
    AND (qi.requires_confirmation OR qo.status='new_guest') LIMIT 1`, [orgId, orderId])).rows.length > 0;
}

/** Approve only the exact rows the waiter reviewed, not a newly arrived basket.
 * Shares the dispatcher's advisory lock; all changes commit before export.
 */
export async function confirmGuestItems(orgId: number, orderId: number, userId: number, ids: number[], database = pool) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::int,$2::int)", [orgId, orderId]);
    const order = (await client.query("SELECT * FROM fb_orders WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [orderId, orgId])).rows[0];
    if (!order) throw new GuestConfirmationError(404, "Замовлення не знайдено.");
    if (["billed", "cancelled"].includes(order.status) || Number(order.paid_amount || 0) > 0)
      throw new GuestConfirmationError(409, "Рахунок закрито або вже оплачується.");
    // Legacy guest baskets must not become auto-approved when their parent opens.
    if (order.status === "new_guest") await client.query(`UPDATE fb_order_items SET requires_confirmation=true
      WHERE order_id=$1 AND organization_id=$2 AND confirmed_at IS NULL AND status<>'cancelled'`, [orderId, orgId]);
    const rows = (await client.query(`SELECT * FROM fb_order_items
      WHERE order_id=$1 AND organization_id=$2 AND id=ANY($3::int[]) FOR UPDATE`, [orderId, orgId, ids])).rows;
    if (rows.length !== ids.length || rows.some((item: any) => item.status === "cancelled" || !item.requires_confirmation))
      throw new GuestConfirmationError(409, "Склад замовлення змінився. Оновіть рахунок і перевірте страви.");
    const approved = await client.query(`UPDATE fb_order_items SET confirmed_at=now(),confirmed_by=$4
      WHERE order_id=$1 AND organization_id=$2 AND id=ANY($3::int[]) AND confirmed_at IS NULL RETURNING id`,
      [orderId, orgId, ids, userId]);
    await client.query(`UPDATE fb_orders SET status=CASE WHEN status='new_guest' THEN 'open' ELSE status END,
      updated_at=now() WHERE id=$1 AND organization_id=$2`, [orderId, orgId]);
    await client.query("COMMIT");
    return { confirmedCount: approved.rows.length, confirmedIds: approved.rows.map(row => Number(row.id)) };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}
