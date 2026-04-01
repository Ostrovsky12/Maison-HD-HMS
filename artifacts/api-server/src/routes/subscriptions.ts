import { Router } from "express";
import { db } from "@workspace/db";
import {
  subscriptionsTable,
  subscriptionInvoicesTable,
  subscriptionPaymentsTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";
import { requireAuth } from "../lib/auth.js";

const router = Router();

const PLANS = {
  basic: { name: "Basic", monthlyPrice: 990, yearlyPrice: 9500 },
  pro: { name: "Pro", monthlyPrice: 2490, yearlyPrice: 23900 },
  enterprise: { name: "Enterprise", monthlyPrice: 4990, yearlyPrice: 47900 },
} as const;

function generateInvoiceNumber() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${y}${m}-${rand}`;
}

function getPeriodEnd(period: "monthly" | "yearly") {
  const d = new Date();
  if (period === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function generateLiqPayData(params: {
  amount: number;
  orderId: string;
  description: string;
  publicKey: string;
  privateKey: string;
  serverUrl: string;
}) {
  const { amount, orderId, description, publicKey, privateKey, serverUrl } = params;
  const data = {
    version: "3",
    public_key: publicKey,
    action: "pay",
    amount: amount.toString(),
    currency: "UAH",
    description,
    order_id: orderId,
    server_url: serverUrl,
    sandbox: "1",
  };
  const dataBase64 = Buffer.from(JSON.stringify(data)).toString("base64");
  const signature = crypto
    .createHash("sha1")
    .update(privateKey + dataBase64 + privateKey)
    .digest("base64");
  return { data: dataBase64, signature };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(403).json({ error: "No organization" });

    const [sub] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.organizationId, orgId));

    const invoices = await db
      .select()
      .from(subscriptionInvoicesTable)
      .where(eq(subscriptionInvoicesTable.organizationId, orgId))
      .orderBy(desc(subscriptionInvoicesTable.createdAt))
      .limit(10);

    res.json({ subscription: sub || null, invoices });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/create-invoice", requireAuth, async (req, res) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(403).json({ error: "No organization" });

    const { tier, period } = req.body as { tier: "basic" | "pro" | "enterprise"; period: "monthly" | "yearly" };
    const plan = PLANS[tier];
    if (!plan) return res.status(400).json({ error: "Invalid tier" });

    const amount = period === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
    const tax = Math.round(amount * 0.2 * 100) / 100;
    const total = amount + tax;

    const invoiceNumber = generateInvoiceNumber();
    const periodEnd = getPeriodEnd(period);
    const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const [invoice] = await db
      .insert(subscriptionInvoicesTable)
      .values({
        organizationId: orgId,
        invoiceNumber,
        tier,
        period,
        amount: amount.toString(),
        tax: tax.toString(),
        total: total.toString(),
        periodStart: new Date(),
        periodEnd,
        dueDate,
      })
      .returning();

    const orderId = `SUB-${invoice.id}-${Date.now()}`;

    const publicKey = process.env.LIQPAY_PUBLIC_KEY || "sandbox_public_key";
    const privateKey = process.env.LIQPAY_PRIVATE_KEY || "sandbox_private_key";
    const appUrl = process.env.APP_URL || "http://localhost:8080";

    const liqpay = generateLiqPayData({
      amount: total,
      orderId,
      description: `Maison HD — ${plan.name} (${period === "yearly" ? "річний" : "місячний"})`,
      publicKey,
      privateKey,
      serverUrl: `${appUrl}/api/webhooks/liqpay`,
    });

    await db.insert(subscriptionPaymentsTable).values({
      invoiceId: invoice.id,
      organizationId: orgId,
      paymentSystem: "liqpay",
      externalPaymentId: orderId,
      amount: total.toString(),
      status: "pending",
    });

    res.json({
      invoice,
      orderId,
      liqpay: {
        ...liqpay,
        formUrl: "https://www.liqpay.ua/api/3/checkout",
        isSandbox: !process.env.LIQPAY_PUBLIC_KEY,
      },
      total,
      amount,
      tax,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/invoices", requireAuth, async (req, res) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(403).json({ error: "No organization" });

    const invoices = await db
      .select()
      .from(subscriptionInvoicesTable)
      .where(eq(subscriptionInvoicesTable.organizationId, orgId))
      .orderBy(desc(subscriptionInvoicesTable.createdAt));

    res.json({ invoices });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/cancel", requireAuth, async (req, res) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(403).json({ error: "No organization" });

    await db
      .update(subscriptionsTable)
      .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(subscriptionsTable.organizationId, orgId));

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
