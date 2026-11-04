import crypto from "crypto";

export interface LiqPayParams {
  action: "pay" | "subscribe" | "paydonate";
  amount: number;
  currency: "UAH" | "USD" | "EUR";
  description: string;
  orderId: string;
  resultUrl?: string;
  serverUrl?: string;
  publicKey?: string;
  privateKey?: string;
}

function getKeys(overridePublic?: string, overridePrivate?: string) {
  const pub = overridePublic || process.env.LIQPAY_PUBLIC_KEY || "";
  const priv = overridePrivate || process.env.LIQPAY_PRIVATE_KEY || "";
  return { pub, priv };
}

export function generateLiqPayForm(params: LiqPayParams): { data: string; signature: string; url: string } {
  const { pub, priv } = getKeys(params.publicKey, params.privateKey);
  const payload = {
    public_key: pub,
    version: 3,
    action: params.action,
    amount: params.amount,
    currency: params.currency,
    description: params.description,
    order_id: params.orderId,
    result_url: params.resultUrl || "",
    server_url: params.serverUrl || "",
  };

  const dataBase64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  const signature = crypto
    .createHash("sha1")
    .update(priv + dataBase64 + priv)
    .digest("base64");

  const url = `https://www.liqpay.ua/api/3/checkout?data=${encodeURIComponent(dataBase64)}&signature=${encodeURIComponent(signature)}`;
  return { data: dataBase64, signature, url };
}

export function verifyLiqPayCallback(data: string, signature: string): boolean {
  const { priv } = getKeys();
  const expected = crypto
    .createHash("sha1")
    .update(priv + data + priv)
    .digest("base64");
  return expected === signature;
}

export function verifyLiqPayCallbackWithKey(data: string, signature: string, privateKey: string): boolean {
  const expected = crypto
    .createHash("sha1")
    .update(privateKey + data + privateKey)
    .digest("base64");
  const actual = Buffer.from(String(signature)), target = Buffer.from(expected);
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

export function parseLiqPayData(data: string): Record<string, any> {
  return JSON.parse(Buffer.from(data, "base64").toString("utf-8"));
}

/**
 * Send a p2p card transfer via LiqPay API.
 * Used to automatically forward tip amount to a waiter's card after successful payment.
 * Returns { ok: boolean; liqpayStatus?: string; error?: string }
 */
export async function sendLiqPayP2P(params: {
  amount: number;
  cardNumber: string;
  description: string;
  orderId: string;
  publicKey?: string;
  privateKey?: string;
}): Promise<{ ok: boolean; liqpayStatus?: string; paymentId?: string; error?: string }> {
  const { pub, priv } = getKeys(params.publicKey, params.privateKey);
  if (!pub || !priv) return { ok: false, error: "LiqPay keys not configured" };
  if (!params.cardNumber || params.cardNumber.replace(/\s/g, "").length < 16) {
    return { ok: false, error: "Invalid card number" };
  }
  if (params.amount < 1) return { ok: false, error: "Tip amount too small" };

  const payload = {
    public_key: pub,
    version: 3,
    action: "p2p",
    amount: Math.round(params.amount * 100) / 100,
    currency: "UAH",
    description: params.description,
    order_id: params.orderId,
    receiver_card: params.cardNumber.replace(/\s/g, ""),
  };

  const dataBase64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  const signature = crypto
    .createHash("sha1")
    .update(priv + dataBase64 + priv)
    .digest("base64");

  try {
    const resp = await fetch("https://www.liqpay.ua/api/request", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: dataBase64, signature }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    const json: any = await resp.json();
    if (json.result === "ok" || json.status === "success" || json.status === "processing") {
      return { ok: true, liqpayStatus: json.status, paymentId: json.payment_id };
    }
    return { ok: false, liqpayStatus: json.status, error: json.err_description || json.err_code || "p2p failed" };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
