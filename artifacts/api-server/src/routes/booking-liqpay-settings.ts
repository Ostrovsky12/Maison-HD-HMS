import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import { SaveBookingLiqpaySettingsBody, CheckBookingLiqpayConnectionBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth.js";
import { encrypt, decrypt } from "../lib/encrypt.js";
import { bookingPaymentOrigin } from "./booking-checkout.js";
import { checkLiqpayCredentials, liqpayCredentialFingerprint } from "../lib/liqpay-connection.js";

const router = Router();
const editors = requireRole("super_admin", "owner", "admin");
const checkLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });
const emptyVerification = { status: "not_checked", checkedAt: null, mode: null, code: null };
const validKey = (key: string) => /^[A-Za-z0-9_+/=-]{8,256}$/.test(key);

async function settings(orgId: number) {
  const properties = (await pool.query('SELECT id,name,legal_entity_id AS "legalEntityId" FROM properties WHERE organization_id=$1 ORDER BY id', [orgId])).rows;
  const sellers = (await pool.query("SELECT id,name,liqpay_public_key,liqpay_private_key FROM legal_entities WHERE organization_id=$1 AND is_active=true ORDER BY name", [orgId])).rows;
  const org = (await pool.query("SELECT booking_engine_config FROM organizations WHERE id=$1", [orgId])).rows[0];
  const checks = org?.booking_engine_config?.liqpayVerification ?? {};
  return { properties, callbackConfigured: !!bookingPaymentOrigin(), legalEntities: sellers.map(seller => {
    const check = checks[String(seller.id)];
    const current = seller.liqpay_public_key && seller.liqpay_private_key
      && check?.fingerprint === liqpayCredentialFingerprint(seller.liqpay_public_key, seller.liqpay_private_key);
    return { id: seller.id, name: seller.name, publicKey: seller.liqpay_public_key || "", hasSecretKey: !!seller.liqpay_private_key,
      verification: current ? { status: check.status, checkedAt: check.checkedAt, mode: check.mode, code: check.code } : emptyVerification };
  }) };
}

router.get("/", async (req: any, res) => {
  res.json(await settings(req.user.organizationId));
});

router.put("/", editors, async (req: any, res) => {
  const parsed = SaveBookingLiqpaySettingsBody.safeParse(req.body);
  if (!parsed.success || !validKey(parsed.data.publicKey)
    || (parsed.data.secretKey !== undefined && !validKey(parsed.data.secretKey))) {
    res.status(400).json({ error: "Перевірте Public key та Secret key. Замасковані значення не приймаються." }); return;
  }
  const { propertyId, legalEntityId, publicKey, secretKey } = parsed.data;
  const orgId = req.user.organizationId;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [orgId]);
    const property = (await client.query("SELECT id,legal_entity_id FROM properties WHERE id=$1 AND organization_id=$2 FOR UPDATE", [propertyId, orgId])).rows[0];
    const seller = (await client.query("SELECT id,liqpay_public_key,liqpay_private_key FROM legal_entities WHERE id=$1 AND organization_id=$2 AND is_active=true FOR UPDATE", [legalEntityId, orgId])).rows[0];
    if (!property || !seller) {
      await client.query("ROLLBACK"); res.status(404).json({ error: "Об’єкт або юрособу вашого готелю не знайдено." }); return;
    }
    if (!secretKey && (!seller.liqpay_private_key || publicKey !== seller.liqpay_public_key)) {
      await client.query("ROLLBACK"); res.status(400).json({ error: "Для нового Public key введіть відповідний Secret key." }); return;
    }
    const keysChanged = publicKey !== seller.liqpay_public_key || (!!secretKey && secretKey !== decrypt(seller.liqpay_private_key));
    if (keysChanged || property.legal_entity_id !== legalEntityId) {
      const outstanding = await client.query(`SELECT b.id FROM bookings b JOIN units u ON u.id=b.unit_id
        WHERE b.organization_id=$1 AND b.utm_source='maison_hd_booking' AND coalesce(b.paid_amount,0)=0
        AND b.booking_policy_receipt->'checkout' IS NOT NULL
        AND ((b.booking_policy_receipt->'checkout'->>'legalEntityId')=$2::text OR u.property_id=$3) LIMIT 1`,
        [orgId, legalEntityId, propertyId]);
      if (outstanding.rows.length) {
        await client.query("ROLLBACK"); res.status(409).json({ error: "Є незвірені платіжні посилання. Спочатку звірте їх із LiqPay, щоб не втратити підтвердження оплати після зміни ключів або продавця." }); return;
      }
    }
    if (keysChanged) {
      await client.query("UPDATE legal_entities SET liqpay_public_key=$1,liqpay_private_key=$2,updated_at=NOW() WHERE id=$3 AND organization_id=$4",
        [publicKey, secretKey ? encrypt(secretKey) : seller.liqpay_private_key, legalEntityId, orgId]);
    }
    await client.query("UPDATE properties SET legal_entity_id=$1 WHERE id=$2 AND organization_id=$3", [legalEntityId, propertyId, orgId]);
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK"); res.status(503).json({ error: "Не вдалося зберегти реквізити LiqPay. Спробуйте пізніше." }); return;
  } finally { client.release(); }
  res.json(await settings(orgId));
});

router.post("/check", editors, checkLimiter, async (req: any, res) => {
  const parsed = CheckBookingLiqpayConnectionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Оберіть юрособу." }); return; }
  const orgId = req.user.organizationId, id = parsed.data.legalEntityId;
  const original = (await pool.query("SELECT id,liqpay_public_key,liqpay_private_key FROM legal_entities WHERE id=$1 AND organization_id=$2 AND is_active=true", [id, orgId])).rows[0];
  if (!original) { res.status(404).json({ error: "Юрособу вашого готелю не знайдено." }); return; }
  if (!original.liqpay_public_key || !original.liqpay_private_key) { res.status(400).json({ error: "Спочатку збережіть обидва ключі." }); return; }
  let result;
  try { result = await checkLiqpayCredentials(original.liqpay_public_key, decrypt(original.liqpay_private_key)!); }
  catch { res.status(503).json({ error: "Не вдалося прочитати збережені реквізити. Збережіть їх заново." }); return; }
  const fingerprint = liqpayCredentialFingerprint(original.liqpay_public_key, original.liqpay_private_key);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [orgId]);
    const current = (await client.query("SELECT id,liqpay_public_key,liqpay_private_key FROM legal_entities WHERE id=$1 AND organization_id=$2 AND is_active=true FOR SHARE", [id, orgId])).rows[0];
    if (!current || fingerprint !== liqpayCredentialFingerprint(current.liqpay_public_key || "", current.liqpay_private_key || "")) {
      await client.query("ROLLBACK"); res.status(409).json({ error: "Ключі змінилися під час перевірки. Повторіть перевірку нових реквізитів." }); return;
    }
    const { message: _message, ...verification } = result;
    await client.query(`UPDATE organizations SET booking_engine_config=jsonb_set(
      jsonb_set(coalesce(booking_engine_config,'{}'::jsonb),'{liqpayVerification}',coalesce(booking_engine_config->'liqpayVerification','{}'::jsonb)),
      ARRAY['liqpayVerification',$2::text],$3::jsonb),updated_at=NOW() WHERE id=$1`,
      [orgId, id, JSON.stringify({ ...verification, fingerprint })]);
    await client.query("COMMIT");
    res.json(result);
  } catch {
    await client.query("ROLLBACK"); res.status(503).json({ error: "Перевірку виконано, але результат не вдалося зберегти. Повторіть її." });
  } finally { client.release(); }
});
export default router;
