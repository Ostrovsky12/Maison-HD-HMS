import { createHash, randomBytes } from "node:crypto";

export function liqpayCredentialFingerprint(publicKey: string, encryptedSecret: string) {
  return createHash("sha256").update(publicKey + "\0" + encryptedSecret).digest("hex");
}

/** A signed status lookup for a fresh, nonexistent order. Never creates or charges a payment. */
export async function checkLiqpayCredentials(publicKey: string, secretKey: string) {
  const mode = publicKey.startsWith("sandbox_") ? "test" as const : "live" as const;
  const checkedAt = new Date().toISOString();
  const result = (status: "connected" | "failed", code: string, message: string) => ({ status, checkedAt, mode, code, message });
  const data = Buffer.from(JSON.stringify({
    public_key: publicKey, version: 3, action: "status",
    order_id: `mhd_connection_${randomBytes(16).toString("hex")}`,
  })).toString("base64");
  const signature = createHash("sha1").update(secretKey + data + secretKey).digest("base64");
  try {
    const response = await fetch("https://www.liqpay.ua/api/request", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data, signature }).toString(),
    });
    if (!response.ok) return result("failed", "provider_unavailable", "LiqPay тимчасово недоступний. Спробуйте перевірити пізніше.");
    const body = await response.text();
    if (body.length > 30_000) return result("failed", "unexpected_response", "Неочікувана відповідь LiqPay. Спробуйте пізніше.");
    const payload = JSON.parse(body);
    // Official LiqPay error: the authenticated request found no such payment.
    // Other errors must never be mistaken for accepted credentials.
    if (payload.err_code === "payment_not_found") {
      return result("connected", "authenticated", mode === "test"
        ? "Тестові ключі прийняті LiqPay. Це не підтверджує готовність до реальних платежів."
        : "LiqPay прийняв підписаний запит. Перевірка не списувала коштів; активація еквайрингу та доставка callback перевіряються окремо.");
    }
    if (["invalid_signature", "err_signature", "err_auth", "public_key_not_found"].includes(payload.err_code)) {
      return result("failed", "invalid_credentials", "LiqPay не прийняв ключі. Перевірте Public key і Secret key одного й того самого мерчанта.");
    }
    return result("failed", "unexpected_response", "LiqPay не підтвердив доступ. Перевірте налаштування мерчанта та повторіть перевірку.");
  } catch {
    return result("failed", "connection_failed", "Не вдалося отримати відповідь LiqPay. Перевірте з’єднання пізніше.");
  }
}
