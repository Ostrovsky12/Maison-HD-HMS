import { Router } from "express";
import { db } from "@workspace/db";
import {
  subscriptionsTable,
  subscriptionInvoicesTable,
  subscriptionPaymentsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { requireAuth } from "../lib/auth.js";

const router = Router();

async function activateSubscription(invoiceId: number) {
  const [invoice] = await db
    .select()
    .from(subscriptionInvoicesTable)
    .where(eq(subscriptionInvoicesTable.id, invoiceId));

  if (!invoice) return;

  await db
    .update(subscriptionInvoicesTable)
    .set({ status: "paid", paidAt: new Date() })
    .where(eq(subscriptionInvoicesTable.id, invoiceId));

  const periodEnd = new Date();
  if (invoice.period === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const existing = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.organizationId, invoice.organizationId));

  if (existing.length > 0) {
    await db
      .update(subscriptionsTable)
      .set({
        tier: invoice.tier,
        period: invoice.period,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.organizationId, invoice.organizationId));
  } else {
    await db.insert(subscriptionsTable).values({
      organizationId: invoice.organizationId,
      tier: invoice.tier,
      period: invoice.period,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    });
  }
}

router.post("/liqpay", async (req, res) => {
  try {
    const { data, signature } = req.body;
    const privateKey = process.env.LIQPAY_PRIVATE_KEY || "sandbox_private_key";
    const expectedSignature = crypto
      .createHash("sha1")
      .update(privateKey + data + privateKey)
      .digest("base64");

    if (signature !== expectedSignature) {
      console.warn("LiqPay invalid signature");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const decoded = JSON.parse(Buffer.from(data, "base64").toString());
    const { order_id, status } = decoded;

    const [payment] = await db
      .select()
      .from(subscriptionPaymentsTable)
      .where(eq(subscriptionPaymentsTable.externalPaymentId, order_id));

    if (!payment) return res.status(404).json({ error: "Payment not found" });

    const isSuccess = status === "success";
    await db
      .update(subscriptionPaymentsTable)
      .set({
        status: isSuccess ? "success" : "failure",
        rawResponse: decoded,
        paidAt: isSuccess ? new Date() : undefined,
      })
      .where(eq(subscriptionPaymentsTable.id, payment.id));

    if (isSuccess && payment.invoiceId) {
      await activateSubscription(payment.invoiceId);
    }

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/fondy", async (req, res) => {
  try {
    const response = req.body?.response || req.body;
    const { order_id, order_status } = response;
    const isSuccess = order_status === "approved";

    const [payment] = await db
      .select()
      .from(subscriptionPaymentsTable)
      .where(eq(subscriptionPaymentsTable.externalPaymentId, order_id));

    if (!payment) return res.status(404).json({ error: "Payment not found" });

    await db
      .update(subscriptionPaymentsTable)
      .set({
        status: isSuccess ? "success" : "failure",
        rawResponse: response,
        paidAt: isSuccess ? new Date() : undefined,
      })
      .where(eq(subscriptionPaymentsTable.id, payment.id));

    if (isSuccess && payment.invoiceId) {
      await activateSubscription(payment.invoiceId);
    }

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/simulate-payment", requireAuth, async (req, res) => {
  try {
    const { orderId, success = true } = req.body;

    const [payment] = await db
      .select()
      .from(subscriptionPaymentsTable)
      .where(eq(subscriptionPaymentsTable.externalPaymentId, orderId));

    if (!payment) return res.status(404).json({ error: "Payment not found" });

    await db
      .update(subscriptionPaymentsTable)
      .set({
        status: success ? "success" : "failure",
        paidAt: success ? new Date() : undefined,
      })
      .where(eq(subscriptionPaymentsTable.id, payment.id));

    if (success && payment.invoiceId) {
      await activateSubscription(payment.invoiceId);
    }

    res.json({ success: true, message: success ? "Payment simulated as successful" : "Payment simulated as failed" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
