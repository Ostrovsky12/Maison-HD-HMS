import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";

export type PosterSignatureFailure =
  | "missing_headers" | "invalid_time" | "invalid_signature" | "expired_request" | "signature_mismatch";
export class PosterPosError extends Error {
  constructor(public status: number, message: string, public signatureFailure?: PosterSignatureFailure) { super(message); }
}
export type PosContext = { account: string; spotId: number; tabletId: number };
export const digestPosToken = (s: string) => createHash("sha256").update(s).digest("hex");
const same = (a: string, b: string) => a.length === b.length
  && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const credential = (orgId: number) => `${orgId}.${randomBytes(32).toString("hex")}`;

export function posChannelOnline(config: any, now = Date.now()) {
  const age = now - Date.parse(config?.lastSeenAt);
  return config?.enabled === true && !!config?.tokenHash && Number.isFinite(age) && age >= -5000 && age < 45000;
}
export function visiblePosChannel(config: any) {
  return { enabled: config?.enabled === true, online: posChannelOnline(config),
    spotId: config?.spotId || 0, tabletId: config?.tabletId || 0, lastSeenAt: config?.lastSeenAt || null };
}
export async function readPosChannel(orgId: number, database: any = pool) {
  const row = (await database.query(`SELECT enabled_modules->'posterConfig'->'posNotifications' AS config
    FROM organizations WHERE id=$1`, [orgId])).rows[0];
  return row?.config || {};
}

/** Poster signs canonical URL + JSON body + Unix time + application secret.
 * Account headers are NOT part of this documented signature. Pairing provides
 * a separate tenant/terminal credential; never authorize from those headers alone.
 */
export function verifyPosSignature(path: string, body: unknown, headers: Record<string, any>,
  secret = process.env.POSTER_POS_APPLICATION_SECRET, origin = process.env.PUBLIC_APP_URL,
  now = Date.now()) {
  if (!secret || !origin) throw new PosterPosError(503, "Касовий модуль ще не налаштовано.");
  let url: URL;
  try { url = new URL(origin); } catch { throw new PosterPosError(503, "Некоректна адреса касового модуля."); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new PosterPosError(503, "Потрібна канонічна HTTPS-адреса.");
  }
  const time = headers["x-poster-time"], sign = headers["x-poster-signature"];
  if (typeof time !== "string" || typeof sign !== "string" || !time || !sign) {
    throw new PosterPosError(403, "Poster не передав заголовки підпису запиту. Підключення каси не підтверджено.", "missing_headers");
  }
  if (!/^\d{10}$/.test(time)) {
    throw new PosterPosError(403, "Poster передав некоректний час підпису запиту. Підключення каси не підтверджено.", "invalid_time");
  }
  if (!/^[a-f0-9]{32}$/i.test(sign)) {
    throw new PosterPosError(403, "Poster передав підпис некоректного формату. Підключення каси не підтверджено.", "invalid_signature");
  }
  if (Math.abs(now / 1000 - Number(time)) > 60) {
    throw new PosterPosError(403, "Час підписаного запиту Poster відрізняється від часу сервера більш ніж на 60 секунд. Підключення каси не підтверджено.", "expired_request");
  }
  const expected = createHash("md5").update(`${url.origin}${path}${JSON.stringify(body)}${time}${secret}`).digest("hex");
  if (!same(expected, sign.toLowerCase())) {
    throw new PosterPosError(403, "Підпис Poster не збігається з налаштуваннями Maison HD. Потрібно перевірити застосунок, адресу запиту та спосіб підписання.", "signature_mismatch");
  }
}

function orgFromCredential(token: string) {
  const match = /^([1-9]\d*)\.[a-f0-9]{64}$/.exec(token);
  const id = Number(match?.[1]);
  if (!match || !Number.isSafeInteger(id) || id > 2147483647) throw new PosterPosError(403, "Каса не підключена.");
  return id;
}
export async function configurePosChannel(orgId: number, input: { enabled: boolean; spotId: number; tabletId: number },
  account: string, database: any = pool) {
  const code = credential(orgId);
  const config = input.enabled ? { ...input, account, channelId: randomBytes(16).toString("hex"),
    pairingHash: digestPosToken(code), pairingExpiresAt: new Date(Date.now() + 15 * 60000).toISOString() }
    : { enabled: false, spotId: input.spotId, tabletId: input.tabletId };
  const result = await database.query(`UPDATE organizations
    SET enabled_modules=jsonb_set(enabled_modules,'{posterConfig,posNotifications}',$2::jsonb)
    WHERE id=$1 AND enabled_modules->'posterConfig'->>'accountId'=$3 RETURNING id`,
  [orgId, JSON.stringify(config), account]);
  if (!result.rows.length) throw new PosterPosError(409, "Підключення Poster змінилося. Оновіть налаштування.");
  return { ...visiblePosChannel(config), ...(input.enabled ? { pairingCode: code } : {}) };
}

export async function authenticatePos(context: PosContext, token: string, pairing = false, database: any = pool) {
  const orgId = orgFromCredential(token), hash = digestPosToken(token);
  const { rows } = await database.query(`SELECT enabled_modules->'posterConfig' AS poster
    FROM organizations WHERE id=$1`, [orgId]);
  const poster = rows[0]?.poster, config = poster?.posNotifications;
  const expected = pairing ? config?.pairingHash : config?.tokenHash;
  // Never disclose another tenant's configuration until its bearer code is proven.
  if (!poster?.apiKey || poster.verified !== true || !config?.enabled || !expected || !same(hash, expected)) {
    throw new PosterPosError(403, pairing
      ? "Код підключення недійсний або відкликаний. Створіть новий код у кабінеті Maison HD."
      : "Каса не підключена або доступ відкликано.");
  }
  if (pairing) {
    if (!(Date.parse(config.pairingExpiresAt) > Date.now())) {
      throw new PosterPosError(403, "Термін дії коду минув. Створіть новий код у кабінеті Maison HD.");
    }
    if (poster.accountId !== config.account) {
      throw new PosterPosError(403, "Підключення Poster змінилося. Створіть новий код у кабінеті Maison HD.");
    }
    if (poster.accountId !== context.account) {
      throw new PosterPosError(403,
        `Код створено для акаунту Poster «${config.account}», а ця каса працює в «${context.account}». Відкрийте касу потрібного акаунту.`);
    }
    if (config.spotId !== context.spotId) {
      throw new PosterPosError(403,
        `Код створено для закладу Poster ID ${config.spotId}, а ця каса належить закладу ID ${context.spotId}. Виберіть потрібний заклад у Maison HD і створіть новий код.`);
    }
    if (config.tabletId !== context.tabletId) {
      throw new PosterPosError(403,
        `Код створено для каси Poster ID ${config.tabletId}, а поточна каса має ID ${context.tabletId}. Виберіть поточну касу в Maison HD і створіть новий код.`);
    }
  } else if (poster.accountId !== context.account || config.account !== context.account
    || config.spotId !== context.spotId || config.tabletId !== context.tabletId) {
    throw new PosterPosError(403, "Каса не підключена або доступ відкликано.");
  }
  if (pairing) {
    const next = credential(orgId);
    // Atomic one-time exchange; concurrent replays cannot obtain two credentials.
    const saved = await database.query(`UPDATE organizations SET enabled_modules=jsonb_set(enabled_modules,
      '{posterConfig,posNotifications}', ((enabled_modules->'posterConfig'->'posNotifications')
        - 'pairingHash' - 'pairingExpiresAt') || $3::jsonb)
      WHERE id=$1 AND enabled_modules->'posterConfig'->'posNotifications'->>'pairingHash'=$2
      AND enabled_modules->'posterConfig'->'posNotifications'->>'channelId'=$4 RETURNING id`,
    [orgId, hash, JSON.stringify({ tokenHash: digestPosToken(next), lastSeenAt: new Date().toISOString() }), config.channelId]);
    if (!saved.rows.length) throw new PosterPosError(403, "Код уже використано або відкликано.");
    return { orgId, config, token: next, hash };
  }
  return { orgId, config, hash };
}

export const activePosNoticeSql = `SELECT n.id, n.payload, t.number, t.location, g.name AS group_name
  FROM fb_table_notifications n
  JOIN fb_tables t ON t.id=n.table_id AND t.organization_id=n.organization_id AND t.is_active=true
  LEFT JOIN fb_table_groups g ON g.id=t.group_id AND g.organization_id=t.organization_id
  JOIN fb_orders o ON o.id=t.current_order_id AND o.organization_id=n.organization_id AND o.table_id=t.id
  WHERE n.organization_id=$1 AND n.type='payment_cash' AND n.status='pending'
    AND o.id::text=n.payload->>'orderId' AND o.status NOT IN ('new_guest','billed','cancelled')
    AND coalesce(o.paid_amount,0)=0 AND o.total_amount::numeric=(n.payload->>'total')::numeric
    AND n.payload->>'destination'='poster' AND n.payload->>'posterChannelId'=$2
    AND (t.group_id IS NULL OR g.is_active=true)
    AND NOT EXISTS (SELECT 1 FROM fb_order_items i WHERE i.order_id=o.id AND i.organization_id=o.organization_id
      AND i.status<>'cancelled' AND i.requires_confirmation=true AND i.confirmed_at IS NULL)`;

export async function pollPos(context: PosContext, token: string, database: any = pool) {
  const session = await authenticatePos(context, token, false, database);
  const beat = await database.query(`UPDATE organizations SET enabled_modules=jsonb_set(enabled_modules,
    '{posterConfig,posNotifications,lastSeenAt}',to_jsonb($3::text))
    WHERE id=$1 AND enabled_modules->'posterConfig'->'posNotifications'->>'tokenHash'=$2 RETURNING id`,
  [session.orgId, session.hash, new Date().toISOString()]);
  if (!beat.rows.length) throw new PosterPosError(403, "Доступ каси відкликано.");
  const rows = (await database.query(`${activePosNoticeSql} ORDER BY n.id LIMIT 100`,
    [session.orgId, session.config.channelId])).rows;
  return { notifications: rows.map((n: any) => ({ id: n.id, orderId: Number(n.payload.orderId),
    point: [n.group_name || n.location, `№${n.number}`].filter(Boolean).join(" · "),
    total: Number(n.payload.total), delivered: !!n.payload.posterDelivery?.shownAt })) };
}

export async function acknowledgePos(context: PosContext, token: string, id: number, posterNotificationId: number,
  database: any = pool) {
  const session = await authenticatePos(context, token, false, database);
  const active = (await database.query(`${activePosNoticeSql} AND n.id=$3`,
    [session.orgId, session.config.channelId, id])).rows[0];
  if (!active) throw new PosterPosError(409, "Запит уже неактуальний.");
  const saved = await database.query(`UPDATE fb_table_notifications SET payload=jsonb_set(payload,'{posterDelivery}',$3::jsonb)
    WHERE id=$1 AND organization_id=$2 AND status='pending' AND payload->>'posterChannelId'=$4
      AND NOT (payload ? 'posterDelivery') RETURNING id`,
  [id, session.orgId, JSON.stringify({ shownAt: new Date().toISOString(), posterNotificationId,
    spotId: context.spotId, tabletId: context.tabletId }), session.config.channelId]);
  // An idempotent receipt of display only: never modify bill, money or notification pending state.
  return { ok: saved.rows.length > 0 || !!active.payload.posterDelivery };
}
