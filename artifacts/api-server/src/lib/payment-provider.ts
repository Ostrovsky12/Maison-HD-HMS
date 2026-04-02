import crypto from "crypto";

// ─── Universal Payment Provider Interface ─────────────────────────────────────
export interface CreateSessionParams {
  amount: number;
  currency: string;
  description: string;
  orderId: string;
  sessionRef: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  serverCallbackUrl?: string;
  resultUrl?: string;
  type?: "full" | "deposit" | "partial" | "installment";
  expiryHours?: number;
  publicKey?: string;
  privateKey?: string;
}

export interface ProviderSessionResult {
  checkoutUrl: string;
  providerOrderId: string;
  providerData: Record<string, any>;
  expiresAt?: Date;
}

export interface ProviderStatusResult {
  status: "pending" | "paid" | "failed" | "expired" | "refunded" | "processing";
  providerStatus: string;
  amount?: number;
  paidAt?: Date;
  feeAmount?: number;
  providerTxId?: string;
  rawData?: Record<string, any>;
}

export interface ProviderCallbackResult {
  isValid: boolean;
  status: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  providerTxId?: string;
  feeAmount?: number;
  paidAt?: Date;
  rawData?: Record<string, any>;
}

export interface PaymentProviderAdapter {
  name: string;
  createSession(params: CreateSessionParams): Promise<ProviderSessionResult>;
  getStatus(orderId: string, keys: { publicKey: string; privateKey: string }): Promise<ProviderStatusResult>;
  verifyCallback(data: string, signature: string, privateKey: string): boolean;
  parseCallback(data: string, signature: string, privateKey: string): ProviderCallbackResult;
}

// ─── LiqPay Provider ─────────────────────────────────────────────────────────
export class LiqPayProvider implements PaymentProviderAdapter {
  name = "liqpay";

  private sign(privateKey: string, data: string): string {
    return crypto.createHash("sha1").update(privateKey + data + privateKey).digest("base64");
  }

  private encode(payload: Record<string, any>): string {
    return Buffer.from(JSON.stringify(payload)).toString("base64");
  }

  async createSession(params: CreateSessionParams): Promise<ProviderSessionResult> {
    const pubKey = params.publicKey || process.env.LIQPAY_PUBLIC_KEY || "";
    const privKey = params.privateKey || process.env.LIQPAY_PRIVATE_KEY || "";
    const SERVER_BASE = process.env.API_URL || process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:8080";

    const expiryHours = params.expiryHours || 72;
    const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000);

    const payload: Record<string, any> = {
      public_key: pubKey,
      version: 3,
      action: "pay",
      amount: params.amount,
      currency: params.currency || "UAH",
      description: params.description,
      order_id: params.orderId,
      language: "uk",
      server_url: params.serverCallbackUrl || `${SERVER_BASE}/api/payment-layer/webhook/liqpay`,
      result_url: params.resultUrl || `${SERVER_BASE}/payment-success`,
      expired_date: expiresAt.toISOString().slice(0, 16).replace("T", " "),
    };

    if (params.guestName) payload.sender_first_name = params.guestName.split(" ")[0] || "";
    if (params.guestEmail) payload.sender_email = params.guestEmail;
    if (params.guestPhone) payload.sender_phone = params.guestPhone;

    const data = this.encode(payload);
    const signature = this.sign(privKey, data);
    const checkoutUrl = `https://www.liqpay.ua/api/3/checkout?data=${encodeURIComponent(data)}&signature=${encodeURIComponent(signature)}`;

    return {
      checkoutUrl,
      providerOrderId: params.orderId,
      providerData: { data, signature, payload },
      expiresAt,
    };
  }

  async getStatus(orderId: string, keys: { publicKey: string; privateKey: string }): Promise<ProviderStatusResult> {
    const { publicKey: pubKey, privateKey: privKey } = keys;
    if (!pubKey || !privKey) {
      return { status: "pending", providerStatus: "no_keys", rawData: { error: "LiqPay keys not configured" } };
    }
    try {
      const payload = { action: "status", version: 3, public_key: pubKey, order_id: orderId };
      const data = this.encode(payload);
      const signature = this.sign(privKey, data);

      const body = new URLSearchParams({ data, signature });
      const resp = await fetch("https://www.liqpay.ua/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const result: any = await resp.json();

      const statusMap: Record<string, ProviderStatusResult["status"]> = {
        success: "paid", wait_accept: "pending", processing: "processing",
        failure: "failed", error: "failed", reversed: "refunded",
        hold_wait: "processing", expired: "expired", sandbox: "paid",
      };

      return {
        status: statusMap[result.status] || "pending",
        providerStatus: result.status || "unknown",
        amount: result.amount,
        paidAt: result.end_date ? new Date(result.end_date) : undefined,
        feeAmount: result.commission_credit,
        providerTxId: String(result.payment_id || ""),
        rawData: result,
      };
    } catch (e: any) {
      return { status: "pending", providerStatus: "fetch_error", rawData: { error: e.message } };
    }
  }

  verifyCallback(data: string, signature: string, privateKey: string): boolean {
    const expected = crypto.createHash("sha1").update(privateKey + data + privateKey).digest("base64");
    return expected === signature;
  }

  parseCallback(data: string, signature: string, privateKey: string): ProviderCallbackResult {
    const isValid = this.verifyCallback(data, signature, privateKey);
    let parsed: Record<string, any> = {};
    try { parsed = JSON.parse(Buffer.from(data, "base64").toString("utf-8")); } catch { return { isValid: false, status: "parse_error" }; }

    const statusMap: Record<string, string> = {
      success: "paid", wait_accept: "pending", processing: "processing",
      failure: "failed", error: "failed", reversed: "refunded",
      hold_wait: "processing", expired: "expired", sandbox: "paid",
    };

    return {
      isValid,
      status: statusMap[parsed.status] || parsed.status || "unknown",
      orderId: parsed.order_id,
      amount: parsed.amount,
      currency: parsed.currency,
      providerTxId: String(parsed.payment_id || ""),
      feeAmount: parsed.commission_credit,
      paidAt: parsed.end_date ? new Date(parsed.end_date) : undefined,
      rawData: parsed,
    };
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────
export const PROVIDERS: Record<string, PaymentProviderAdapter> = {
  liqpay:   new LiqPayProvider(),
  // fondy:    new FondyProvider(),      // placeholder
  // wayforpay: new WayForPayProvider(), // placeholder
  // stripe:   new StripeProvider(),     // placeholder
  // mono:     new MonobankProvider(),   // placeholder
};

export function getProvider(name: string): PaymentProviderAdapter {
  const p = PROVIDERS[name || "liqpay"];
  if (!p) throw new Error(`Payment provider '${name}' not found. Available: ${Object.keys(PROVIDERS).join(", ")}`);
  return p;
}

// ─── Error classification ─────────────────────────────────────────────────────
export function classifyError(error: string): { category: string; resolution: string } {
  const err = (error || "").toLowerCase();
  if (err.includes("insufficient") || err.includes("limit")) return { category: "card_limit", resolution: "Ліміт картки. Спробуйте іншу картку або зв'яжіться з банком." };
  if (err.includes("expired") || err.includes("expir")) return { category: "session_expired", resolution: "Посилання застаріло. Генеруйте нове." };
  if (err.includes("key") || err.includes("signature")) return { category: "config_error", resolution: "Перевірте LiqPay ключі в налаштуваннях юр. особи." };
  if (err.includes("block") || err.includes("fraud")) return { category: "fraud_block", resolution: "Картка заблокована. Зв'яжіться з гостем." };
  if (err.includes("no_keys") || err.includes("not configured")) return { category: "config_error", resolution: "LiqPay ключі не налаштовані. Перейдіть Фінанси → Юр. особи." };
  if (err.includes("amount") || err.includes("min")) return { category: "amount_error", resolution: "Некоректна сума. Мінімальна транзакція LiqPay — 1 UAH." };
  return { category: "unknown", resolution: "Спробуйте ще раз або зверніться до підтримки." };
}
