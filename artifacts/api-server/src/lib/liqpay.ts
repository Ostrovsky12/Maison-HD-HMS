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

export function parseLiqPayData(data: string): Record<string, any> {
  return JSON.parse(Buffer.from(data, "base64").toString("utf-8"));
}
