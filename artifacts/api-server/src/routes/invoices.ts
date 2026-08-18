import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { invoicesTable, bookingsTable, guestsTable, usersTable, channelConfigsTable, legalEntitiesTable } from "@workspace/db/schema";
import { eq, and, desc, gte, lte, sql, isNull, or } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// ─── List invoices with filters ─────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { bookingId, status, guestId, legalEntityId, dateFrom, dateTo } = req.query;

    const orgId = user?.organizationId ?? null;

    const conditions: any[] = [];

    // ── Tenant isolation ──────────────────────────────────────────────────────
    // invoicesTable has no organizationId column; scope via legalEntitiesTable
    // (org invoices always have a legalEntityId; orphan rows without one are
    //  excluded when an org context is present — safer than leaking all orgs)
    if (orgId) {
      conditions.push(eq(legalEntitiesTable.organizationId, orgId));
    }

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
      .leftJoin(legalEntitiesTable, eq(invoicesTable.legalEntityId, legalEntitiesTable.id))
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

// ─── Public invoice view (no auth) ───────────────────────────────────────────
router.get("/public/:token", async (req, res) => {
  try {
    const [invoice] = await db.execute<any>(
      sql`SELECT * FROM invoices WHERE public_token = ${req.params.token} LIMIT 1`
    ).then(r => r.rows);
    if (!invoice) return res.status(404).json({ error: "Not found" });
    res.json({
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      amount: invoice.amount,
      taxAmount: invoice.tax_amount,
      paidAmount: invoice.paid_amount,
      currency: invoice.currency || "UAH",
      description: invoice.description,
      dueDate: invoice.due_date,
      counterpartyName: invoice.counterparty_name,
      counterpartyEdrpou: invoice.counterparty_edrpou,
      buyerAddress: invoice.buyer_address,
      buyerVatNumber: invoice.buyer_vat_number,
      invoiceItems: invoice.invoice_items,
      sellerSnapshot: invoice.seller_snapshot,
      notes: invoice.notes,
      createdAt: invoice.created_at,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Generate / return public link for an invoice ─────────────────────────────
router.post("/:invoiceId/public-link", requireAuth, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    let [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
    if (!invoice) return res.status(404).json({ error: "Not found" });

    // Generate token if not exists
    if (!(invoice as any).public_token) {
      const token = randomUUID();
      await db.execute(sql`UPDATE invoices SET public_token = ${token} WHERE id = ${invoiceId}`);
      (invoice as any).public_token = token;
    }

    const siteUrl = process.env.API_BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN || req.headers.host}`;
    const link = `${siteUrl}/invoice/${(invoice as any).public_token}`;
    res.json({ link, token: (invoice as any).public_token });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Send invoice (via Telegram / SMS / link) ────────────────────────────────
router.post("/:invoiceId/send", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const invoiceId = parseInt(req.params.invoiceId);
    const { channel, recipient } = req.body; // channel: telegram|sms|link

    let [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
    if (!invoice) return res.status(404).json({ error: "Not found" });

    // ── Generate / reuse public token ────────────────────────────────────────
    let publicToken = (invoice as any).public_token as string | null;
    if (!publicToken) {
      publicToken = randomUUID();
      await db.execute(sql`UPDATE invoices SET public_token = ${publicToken} WHERE id = ${invoiceId}`);
    }
    const siteUrl = process.env.API_BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN || req.headers.host}`;
    const invoiceUrl = `${siteUrl}/invoice/${publicToken}`;

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

      const chatId = recipient.trim();
      const uah = (v: any) => `${Number(v).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴`;
      const due = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("uk-UA") : null;

      const text = [
        `🧾 <b>Рахунок № ${invoice.invoiceNumber}</b>`,
        invoice.counterpartyName ? `👤 ${invoice.counterpartyName}` : null,
        invoice.description ? `📋 ${invoice.description}` : null,
        ``,
        `💰 <b>До сплати: ${uah(invoice.amount)}</b>`,
        due ? `📅 Термін оплати: ${due}` : null,
        ``,
        `👉 <a href="${invoiceUrl}">Переглянути рахунок</a>`,
      ].filter(l => l !== null).join("\n");

      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: false }),
      });
      const tgData = await tgRes.json() as any;

      if (!tgRes.ok) {
        const desc: string = tgData?.description || "Telegram API error";
        if (desc.includes("chat not found") || desc.includes("user not found")) {
          return res.status(400).json({ error: "chat_not_found", message: "Гість не знайдений. Переконайтесь що він написав /start нашому боту або перевірте @username." });
        }
        if (desc.includes("bot can't initiate") || desc.includes("Forbidden")) {
          return res.status(400).json({ error: "bot_cant_initiate", message: "Бот не може першим написати гостю. Попросіть гостя написати /start боту — після цього відправка спрацює." });
        }
        return res.status(400).json({ error: "telegram_error", message: desc });
      }

      await db.execute(sql`UPDATE invoices SET status = 'pending', updated_at = NOW() WHERE id = ${invoiceId}`);
      return res.json({ success: true, channel: "telegram", recipient: chatId, invoiceUrl });
    }

    // link / sms: just return the public link
    await db.execute(sql`UPDATE invoices SET status = 'pending', updated_at = NOW() WHERE id = ${invoiceId}`);
    res.json({ success: true, channel, recipient, invoiceUrl, invoiceNumber: invoice.invoiceNumber });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
