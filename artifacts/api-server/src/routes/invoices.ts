import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, bookingsTable, guestsTable, usersTable, channelConfigsTable } from "@workspace/db/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// ─── List invoices with filters ─────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { bookingId, status, guestId, legalEntityId, dateFrom, dateTo } = req.query;

    const conditions: any[] = [];
    if (bookingId) conditions.push(eq(invoicesTable.bookingId, parseInt(bookingId as string)));
    if (status) conditions.push(eq(invoicesTable.status, status as any));
    if (guestId) conditions.push(eq(invoicesTable.guestId, parseInt(guestId as string)));
    if (legalEntityId && legalEntityId !== "all") {
      conditions.push(eq(invoicesTable.legalEntityId, parseInt(legalEntityId as string)));
    }
    if (dateFrom) conditions.push(gte(invoicesTable.createdAt, new Date(dateFrom as string)));
    if (dateTo) {
      const end = new Date(dateTo as string);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(invoicesTable.createdAt, end));
    }

    const invoices = await db.select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      bookingId: invoicesTable.bookingId,
      guestId: invoicesTable.guestId,
      invoiceType: invoicesTable.invoiceType,
      status: invoicesTable.status,
      amount: invoicesTable.amount,
      currency: invoicesTable.currency,
      description: invoicesTable.description,
      dueDate: invoicesTable.dueDate,
      createdAt: invoicesTable.createdAt,
      legalEntityId: invoicesTable.legalEntityId,
      counterpartyName: invoicesTable.counterpartyName,
      counterpartyEdrpou: invoicesTable.counterpartyEdrpou,
      buyerAddress: invoicesTable.buyerAddress,
      buyerVatNumber: invoicesTable.buyerVatNumber,
      invoiceItems: invoicesTable.invoiceItems,
      sellerSnapshot: invoicesTable.sellerSnapshot,
      notes: invoicesTable.notes,
      guestFirstName: guestsTable.firstName,
      guestLastName: guestsTable.lastName,
    }).from(invoicesTable)
      .leftJoin(guestsTable, eq(invoicesTable.guestId, guestsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(invoicesTable.createdAt));

    res.json(invoices.map(inv => ({
      ...inv,
      guestName: inv.guestFirstName
        ? `${inv.guestFirstName} ${inv.guestLastName || ""}`.trim()
        : inv.counterpartyName || null,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Create invoice ──────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const {
      bookingId, guestId, invoiceType, amount, taxAmount, currency,
      description, dueDate, legalEntityId, buyer, items, seller, invoiceNumber,
    } = req.body;

    const total = items
      ? (items as any[]).reduce((s, it) => s + Number(it.amount), 0)
      : Number(amount);

    const num = invoiceNumber || `Р-${new Date().getFullYear()}-${String(bookingId || 0).padStart(4, "0")}`;

    const [invoice] = await db.insert(invoicesTable).values({
      invoiceNumber: num,
      bookingId: bookingId || null,
      guestId: guestId || null,
      invoiceType: invoiceType || "accommodation",
      amount: total.toFixed(2),
      taxAmount: String(taxAmount || 0),
      paidAmount: "0",
      currency: currency || "UAH",
      description,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: user.id,
      legalEntityId: legalEntityId || null,
      counterpartyName: buyer?.name || null,
      counterpartyEdrpou: buyer?.taxCode || null,
      buyerAddress: buyer?.address || null,
      buyerVatNumber: buyer?.vatNumber || null,
      invoiceItems: items || [],
      sellerSnapshot: seller || null,
      status: "pending",
    }).returning();

    res.status(201).json(invoice);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Get single invoice ──────────────────────────────────────────────────────
router.get("/:invoiceId", requireAuth, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    const [invoice] = await db.select().from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId)).limit(1);
    if (!invoice) return res.status(404).json({ error: "Not found" });
    res.json(invoice);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Update invoice ──────────────────────────────────────────────────────────
router.put("/:invoiceId", requireAuth, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    const { invoiceType, status, amount, description, dueDate, buyer, items, seller, legalEntityId, notes } = req.body;

    const total = items
      ? (items as any[]).reduce((s: number, it: any) => s + Number(it.amount), 0)
      : undefined;

    const [invoice] = await db.update(invoicesTable).set({
      ...(invoiceType !== undefined && { invoiceType }),
      ...(status !== undefined && { status }),
      ...(total !== undefined && { amount: total.toFixed(2) }),
      ...(amount !== undefined && total === undefined && { amount: String(amount) }),
      ...(description !== undefined && { description }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(legalEntityId !== undefined && { legalEntityId }),
      ...(buyer && { counterpartyName: buyer.name, counterpartyEdrpou: buyer.taxCode, buyerAddress: buyer.address, buyerVatNumber: buyer.vatNumber }),
      ...(items && { invoiceItems: items }),
      ...(seller && { sellerSnapshot: seller }),
      ...(notes !== undefined && { notes }),
      updatedAt: new Date(),
    }).where(eq(invoicesTable.id, invoiceId)).returning();

    if (!invoice) return res.status(404).json({ error: "Not found" });
    res.json(invoice);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Delete invoice ──────────────────────────────────────────────────────────
router.delete("/:invoiceId", requireAuth, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    await db.delete(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Pay invoice ─────────────────────────────────────────────────────────────
router.post("/:invoiceId/pay", requireAuth, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    const { paymentMethod, paidAmount } = req.body;

    const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const [invoice] = await db.update(invoicesTable).set({
      status: "paid",
      paymentMethod,
      paidAmount: String(paidAmount ?? existing.amount),
      paidAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(invoicesTable.id, invoiceId)).returning();

    res.json(invoice);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Send invoice (via Telegram / SMS / link) ────────────────────────────────
router.post("/:invoiceId/send", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const invoiceId = parseInt(req.params.invoiceId);
    const { channel, recipient, message } = req.body; // channel: telegram|sms|link

    const [invoice] = await db.select().from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId)).limit(1);
    if (!invoice) return res.status(404).json({ error: "Not found" });

    if (channel === "telegram") {
      // Look up the org's Telegram bot token from channel_configs
      const [cfg] = await db.select().from(channelConfigsTable)
        .where(and(
          eq(channelConfigsTable.organizationId, user.organizationId),
          eq(channelConfigsTable.channel, "telegram" as any),
        ));
      const botToken = cfg?.config?.bot_token as string | undefined;
      if (!botToken) {
        return res.status(400).json({
          error: "telegram_not_configured",
          message: "Telegram бот не налаштований. Перейдіть у Налаштування → Інбокс та підключіть бота.",
        });
      }

      // Normalize recipient: accept @username or numeric chat_id
      const chatId = recipient.trim().startsWith("@") ? recipient.trim() : recipient.trim();

      // Build a nicely formatted invoice message
      const uah = (v: any) => `${Number(v).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴`;
      const lines: string[] = [
        `🧾 <b>Рахунок № ${invoice.invoiceNumber}</b>`,
        ``,
      ];
      if (invoice.counterpartyName) lines.push(`👤 ${invoice.counterpartyName}`);
      if (invoice.description) lines.push(`📋 ${invoice.description}`);
      lines.push(``, `💰 <b>Сума до оплати: ${uah(invoice.amount)}</b>`);
      if (invoice.taxAmount && Number(invoice.taxAmount) > 0) {
        lines.push(`   у т.ч. ПДВ: ${uah(invoice.taxAmount)}`);
      }
      if (invoice.dueDate) {
        const due = new Date(invoice.dueDate).toLocaleDateString("uk-UA");
        lines.push(`📅 Оплатити до: ${due}`);
      }
      if (message && message.trim()) {
        lines.push(``, message.trim());
      }
      lines.push(``, `<i>— Команда ДОГОДА</i>`);

      const text = lines.join("\n");

      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      });
      const tgData = await tgRes.json() as any;

      if (!tgRes.ok) {
        const desc: string = tgData?.description || "Telegram API error";
        // Provide friendly error messages for common cases
        if (desc.includes("chat not found") || desc.includes("user not found")) {
          return res.status(400).json({
            error: "chat_not_found",
            message: `Гість не знайдений. Переконайтесь що він написав /start нашому боту, або перевірте username.`,
          });
        }
        if (desc.includes("bot can't initiate conversation")) {
          return res.status(400).json({
            error: "bot_cant_initiate",
            message: `Бот не може першим написати гостю. Попросіть гостя написати /start нашому Telegram-боту — після цього відправка спрацює.`,
          });
        }
        return res.status(400).json({ error: "telegram_error", message: desc });
      }

      // Mark invoice as sent
      await db.update(invoicesTable).set({ status: "pending", updatedAt: new Date() })
        .where(eq(invoicesTable.id, invoiceId));

      return res.json({ success: true, channel: "telegram", recipient: chatId, invoiceNumber: invoice.invoiceNumber });
    }

    // SMS / link: stub (no integration yet)
    await db.update(invoicesTable).set({ status: "pending", updatedAt: new Date() })
      .where(eq(invoicesTable.id, invoiceId));

    res.json({
      success: true,
      channel,
      recipient,
      invoiceNumber: invoice.invoiceNumber,
      message: message || `Рахунок № ${invoice.invoiceNumber} на суму ${invoice.amount} грн.`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
