import { pool } from "@workspace/db";
import { decrypt } from "./encrypt.js";
import { parseLiqPayData, verifyLiqPayCallbackWithKey } from "./liqpay.js";

export class GuestPaymentCallbackError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Legacy checkout has no immutable settlement attempt. Do not derive payouts
 * from a mutable bill, acknowledge processing as payment, or replay card transfers.
 * Preserve verified received funds for cashier reconciliation instead.
 */
export async function recordGuestLiqPayResult(data: unknown, signature: unknown, database: any = pool) {
  if (typeof data !== "string" || data.length > 32768 || typeof signature !== "string" || signature.length > 256) {
    throw new GuestPaymentCallbackError(400, "Invalid callback");
  }
  let event: Record<string, any>;
  try { event = parseLiqPayData(data); }
  catch { throw new GuestPaymentCallbackError(400, "Invalid callback"); }
  if (!event || typeof event !== "object") throw new GuestPaymentCallbackError(400, "Invalid callback");
  // Sandbox and processing are not collected money.
  if (event.status !== "success") return { ignored: true };
  const match = /^fb-([1-9]\d*)-\d+$/.exec(String(event.order_id ?? ""));
  if (!match || !Number.isSafeInteger(Number(match[1])) ||
    !/^\d+$/.test(String(event.payment_id ?? "")) ||
    event.currency !== "UAH" || !/^\d+(\.\d{1,2})?$/.test(String(event.amount)) ||
    !Number.isFinite(Number(event.amount)) || Number(event.amount) <= 0) {
    throw new GuestPaymentCallbackError(400, "Invalid payment identity or amount");
  }
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const order = (await client.query(`SELECT id,organization_id,table_id FROM fb_orders
      WHERE id=$1 FOR UPDATE`, [Number(match[1])])).rows[0];
    if (!order) throw new GuestPaymentCallbackError(404, "Order not found");
    const le = (await client.query(`SELECT liqpay_public_key,liqpay_private_key FROM legal_entities
      WHERE organization_id=$1 AND is_active=true AND liqpay_public_key IS NOT NULL
      ORDER BY is_default DESC NULLS LAST LIMIT 1`, [order.organization_id])).rows[0];
    if (!le?.liqpay_private_key || event.public_key !== le.liqpay_public_key ||
      !verifyLiqPayCallbackWithKey(data, signature, decrypt(le.liqpay_private_key) || le.liqpay_private_key)) {
      throw new GuestPaymentCallbackError(403, "Invalid signature");
    }
    const existing = (await client.query(`SELECT id FROM fb_table_notifications
      WHERE organization_id=$1 AND type='payment_review' AND payload->>'gatewayOrderId'=$2
        AND payload->>'paymentId'=$3 LIMIT 1`,
    [order.organization_id, event.order_id, String(event.payment_id)])).rows[0];
    if (!existing) {
      await client.query(`INSERT INTO fb_table_notifications
        (organization_id,table_id,table_number,table_location,type,payload,status)
        SELECT $1,t.id,t.number,t.location,'payment_review',$3,'pending'
        FROM (SELECT 1) placeholder LEFT JOIN fb_tables t ON t.id=$2 AND t.organization_id=$1`,
      [order.organization_id, order.table_id, JSON.stringify({
        orderId: order.id, gatewayOrderId: event.order_id, paymentId: String(event.payment_id),
        total: Number(event.amount), currency: "UAH", needsReconciliation: true,
        message: "LiqPay повідомив про отриманий платіж. Потрібна ручна звірка; чайові автоматично не переказані.",
      })]);
    }
    await client.query("COMMIT");
    return { recorded: true, duplicate: !!existing };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}
