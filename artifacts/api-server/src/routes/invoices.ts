import { Router } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@workspace/db";
import { invoicesTable, bookingsTable, guestsTable, usersTable, channelConfigsTable, legalEntitiesTable } from "@workspace/db/schema";
import { eq, and, desc, gte, lte, sql, isNull, or } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { calculateInvoiceTotals } from "../lib/invoice-totals.js";

const router = Router();
const PUBLIC_INVOICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getPublicInvoiceSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("SESSION_SECRET or JWT_SECRET is required for public invoice links");
  return secret;
}

function createPublicInvoiceToken(invoiceId: number, organizationId: number): string {
  const payload = Buffer.from(JSON.stringify({
    invoiceId,
    organizationId,
    expiresAt: Date.now() + PUBLIC_INVOICE_TTL_MS,
  })).toString("base64url");
  const signature = createHmac("sha256", getPublicInvoiceSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyPublicInvoiceToken(token: string): { invoiceId: number; organizationId: number } | null {
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = createHmac("sha256", getPublicInvoiceSecret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      !Number.isInteger(decoded.invoiceId) ||
      !Number.isInteger(decoded.organizationId) ||
      !Number.isFinite(decoded.expiresAt) ||
      decoded.expiresAt < Date.now()
    ) return null;
    return { invoiceId: decoded.invoiceId, organizationId: decoded.organizationId };
  } catch {
    return null;
  }
}

function getPublicInvoiceBaseUrl(): string {
  const configuredOrigin = process.env.PUBLIC_APP_URL
    || process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
    || process.env.API_BASE_URL;
  if (!configuredOrigin) {
    throw new Error("PUBLIC_APP_URL, REPLIT_DOMAINS, or API_BASE_URL is required for public invoice links");
  }
  const parsed = new URL(configuredOrigin.includes("://") ? configuredOrigin : `https://${configuredOrigin}`);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Public invoice origin must use HTTPS");
  }
  return parsed.origin;
}

function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── List invoices with filters ─────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { bookingId, status, guestId, legalEntityId, dateFrom, dateTo } = req.query;

    const orgId = user?.organizationId ?? null;

    // Non-super-admin callers must have an org — otherwise we'd return all invoices
    if (user?.role !== "super_admin" && !orgId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const conditions: any[] = [];

    // ── Tenant isolation via direct organizationId column ────────────────────
    if (orgId) {
      conditions.push(eq(invoicesTable.organizationId, orgId));
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
      organizationId: invoicesTable.organizationId,
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

    return res.json(invoices.map(inv => ({
      ...inv,
      guestName: inv.guestFirstName
        ? `${inv.guestFirstName} ${inv.guestLastName || ""}`.trim()
        : inv.counterpartyName || null,
    })));
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Create invoice ──────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;

    // Guard: every invoice must belong to a tenant (super_admin without org is rejected too)
    if (!user.organizationId) {
      return res.status(400).json({ error: "organization_id is required — cannot create an invoice without a tenant" });
    }

    const {
      bookingId, guestId, invoiceType, amount, taxAmount, currency,
      description, dueDate, legalEntityId, buyer, items, seller, invoiceNumber,
    } = req.body;

    const orgId = user.organizationId;

    // Validate related booking belongs to caller's org
    if (bookingId) {
      const bCheck = await db.execute(sql`
        SELECT b.id FROM bookings b
        JOIN units u ON u.id = b.unit_id
        JOIN properties p ON p.id = u.property_id
        WHERE b.id = ${bookingId} AND p.organization_id = ${orgId} LIMIT 1
      `);
      if (!bCheck.rows.length) {
        return res.status(403).json({ error: "Forbidden", message: "Бронювання не належить вашій організації" });
      }
    }

    // Validate related legal entity belongs to caller's org
    if (legalEntityId) {
      const leCheck = await db.execute(sql`
        SELECT id FROM legal_entities WHERE id = ${legalEntityId} AND organization_id = ${orgId} LIMIT 1
      `);
      if (!leCheck.rows.length) {
        return res.status(403).json({ error: "Forbidden", message: "Юридична особа не належить вашій організації" });
      }
    }

    const hasItems = items !== undefined;
    let lineTotals;
    try {
      lineTotals = hasItems ? calculateInvoiceTotals(items) : null;
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
    const total = lineTotals ? lineTotals.total : Number(amount);
    if (!Number.isFinite(total) || total < 0) {
      return res.status(400).json({ error: "Некоректна сума рахунку" });
    }
    const derivedTaxAmount = lineTotals ? lineTotals.taxAmount : Number(taxAmount || 0);
    if (!Number.isFinite(derivedTaxAmount) || derivedTaxAmount < 0) {
      return res.status(400).json({ error: "Некоректна сума ПДВ" });
    }

    const num = invoiceNumber || `Р-${new Date().getFullYear()}-${String(bookingId || 0).padStart(4, "0")}`;

    const [invoice] = await db.insert(invoicesTable).values({
      organizationId: user.organizationId,
      invoiceNumber: num,
      bookingId: bookingId || null,
      guestId: guestId || null,
      invoiceType: invoiceType || "accommodation",
      amount: total.toFixed(2),
      taxAmount: derivedTaxAmount.toFixed(2),
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
      invoiceItems: lineTotals?.items || [],
      sellerSnapshot: seller || null,
      status: "pending",
    }).returning();

    return res.status(201).json(invoice);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Helper: verify invoice belongs to caller's org ──────────────────────────
async function assertInvoiceAccess(invoiceId: number, user: any): Promise<{ invoice: any } | { error: string; status: number }> {
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
  if (!invoice) return { error: "Not found", status: 404 };
  if (user.role === "super_admin") return { invoice };
  if (!user.organizationId) return { error: "Forbidden", status: 403 };
  // Direct organizationId check — no JOIN required
  if (invoice.organizationId !== user.organizationId) return { error: "Forbidden", status: 403 };
  return { invoice };
}

// ─── Get single invoice ──────────────────────────────────────────────────────
router.get("/:invoiceId", requireAuth, async (req, res) => {
  try {
    const invoiceId = parseInt(String(req.params.invoiceId), 10);
    const result = await assertInvoiceAccess(invoiceId, (req as any).user);
    if ("error" in result) return res.status(result.status).json({ error: result.error });
    return res.json(result.invoice);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Update invoice ──────────────────────────────────────────────────────────
router.put("/:invoiceId", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const invoiceId = parseInt(String(req.params.invoiceId), 10);
    const access = await assertInvoiceAccess(invoiceId, user);
    if ("error" in access) return res.status(access.status).json({ error: access.error });
    const { invoiceType, status, amount, description, dueDate, buyer, items, seller, legalEntityId, bookingId: updBookingId, notes } = req.body;

    // Validate related IDs belong to caller's org if provided
    const orgId = user.organizationId;
    if (orgId) {
      if (updBookingId) {
        const bCheck = await db.execute(sql`
          SELECT b.id FROM bookings b
          JOIN units u ON u.id = b.unit_id
          JOIN properties p ON p.id = u.property_id
          WHERE b.id = ${updBookingId} AND p.organization_id = ${orgId} LIMIT 1
        `);
        if (!bCheck.rows.length) {
          return res.status(403).json({ error: "Forbidden", message: "Бронювання не належить вашій організації" });
        }
      }
      if (legalEntityId) {
        const leCheck = await db.execute(sql`
          SELECT id FROM legal_entities WHERE id = ${legalEntityId} AND organization_id = ${orgId} LIMIT 1
        `);
        if (!leCheck.rows.length) {
          return res.status(403).json({ error: "Forbidden", message: "Юридична особа не належить вашій організації" });
        }
      }
    }

    let lineTotals;
    try {
      lineTotals = items !== undefined ? calculateInvoiceTotals(items) : null;
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
    const total = lineTotals?.total;

    // Scope write to organization for tenant callers
    const writeCondition = orgId
      ? and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, orgId))
      : eq(invoicesTable.id, invoiceId);

    const [invoice] = await db.update(invoicesTable).set({
      ...(invoiceType !== undefined && { invoiceType }),
      ...(status !== undefined && { status }),
      ...(total !== undefined && { amount: total.toFixed(2) }),
      ...(lineTotals && { taxAmount: lineTotals.taxAmount.toFixed(2) }),
      ...(amount !== undefined && total === undefined && { amount: String(amount) }),
      ...(description !== undefined && { description }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(legalEntityId !== undefined && { legalEntityId }),
      ...(updBookingId !== undefined && { bookingId: updBookingId }),
      ...(buyer && { counterpartyName: buyer.name, counterpartyEdrpou: buyer.taxCode, buyerAddress: buyer.address, buyerVatNumber: buyer.vatNumber }),
      ...(lineTotals && { invoiceItems: lineTotals.items }),
      ...(seller && { sellerSnapshot: seller }),
      ...(notes !== undefined && { notes }),
      updatedAt: new Date(),
    }).where(writeCondition).returning();

    if (!invoice) return res.status(404).json({ error: "Not found" });
    return res.json(invoice);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Delete invoice ──────────────────────────────────────────────────────────
router.delete("/:invoiceId", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const invoiceId = parseInt(String(req.params.invoiceId), 10);
    const access = await assertInvoiceAccess(invoiceId, user);
    if ("error" in access) return res.status(access.status).json({ error: access.error });
    // Scope delete predicate to organization for tenant callers
    const orgId = user.organizationId;
    const deleteCondition = orgId
      ? and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, orgId))
      : eq(invoicesTable.id, invoiceId);
    await db.delete(invoicesTable).where(deleteCondition);
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Pay invoice ─────────────────────────────────────────────────────────────
router.post("/:invoiceId/pay", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const invoiceId = parseInt(String(req.params.invoiceId), 10);
    const access = await assertInvoiceAccess(invoiceId, user);
    if ("error" in access) return res.status(access.status).json({ error: access.error });
    const existing = access.invoice;
    const { paymentMethod, paidAmount } = req.body;

    // Overflow protection: paidAmount must not exceed invoice amount
    const invoiceAmount = parseFloat(existing.amount || "0");
    const paid = parseFloat(String(paidAmount ?? existing.amount));
    if (!Number.isFinite(paid) || paid < 0 || paid > invoiceAmount) {
      return res.status(400).json({ error: `paidAmount must be between 0 and ${invoiceAmount}` });
    }

    // Scope update to organization for tenant callers
    const orgId = user.organizationId;
    const payCondition = orgId
      ? and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, orgId))
      : eq(invoicesTable.id, invoiceId);

    const [invoice] = await db.update(invoicesTable).set({
      status: "paid",
      paymentMethod,
      paidAmount: paid.toFixed(2),
      paidAt: new Date(),
      updatedAt: new Date(),
    }).where(payCondition).returning();

    return res.json(invoice);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Public invoice view (no auth) ───────────────────────────────────────────
router.get("/public/:token", async (req, res) => {
  try {
    // Only accept expiring tenant-bound signed tokens — no legacy public_token fallback
    const signedAccess = verifyPublicInvoiceToken(req.params.token);
    if (!signedAccess) return res.status(401).json({ error: "Invalid or expired token" });

    const [invoice] = await db.execute<any>(
      sql`SELECT * FROM invoices
          WHERE id = ${signedAccess.invoiceId}
            AND organization_id = ${signedAccess.organizationId}
          LIMIT 1`
    ).then(r => r.rows);
    if (!invoice) return res.status(404).json({ error: "Not found" });
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
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
    return res.status(500).json({ error: e.message });
  }
});

// ─── Generate / return public link for an invoice ─────────────────────────────
router.post("/:invoiceId/public-link", requireAuth, async (req, res) => {
  try {
    const invoiceId = parseInt(String(req.params.invoiceId), 10);
    const access = await assertInvoiceAccess(invoiceId, (req as any).user);
    if ("error" in access) return res.status(access.status).json({ error: access.error });
    const invoice = access.invoice;
    const token = createPublicInvoiceToken(invoiceId, invoice.organizationId);
    const link = `${getPublicInvoiceBaseUrl()}/invoice/${encodeURIComponent(token)}`;
    return res.json({ link, token });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Send invoice (via Telegram / SMS / link) ────────────────────────────────
router.post("/:invoiceId/send", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const invoiceId = parseInt(String(req.params.invoiceId), 10);
    const { channel, recipient } = req.body; // channel: telegram|sms|link

    const access = await assertInvoiceAccess(invoiceId, user);
    if ("error" in access) return res.status(access.status).json({ error: access.error });
    const invoice = access.invoice;

    const publicToken = createPublicInvoiceToken(invoiceId, invoice.organizationId);
    const invoiceUrl = `${getPublicInvoiceBaseUrl()}/invoice/${encodeURIComponent(publicToken)}`;

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
        `🧾 <b>Рахунок № ${escapeTelegramHtml(invoice.invoiceNumber)}</b>`,
        invoice.counterpartyName ? `👤 ${escapeTelegramHtml(invoice.counterpartyName)}` : null,
        invoice.description ? `📋 ${escapeTelegramHtml(invoice.description)}` : null,
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

      const orgId = user.organizationId;
      if (orgId) {
        await db.execute(sql`UPDATE invoices SET status = 'pending', updated_at = NOW() WHERE id = ${invoiceId} AND organization_id = ${orgId}`);
      } else {
        await db.execute(sql`UPDATE invoices SET status = 'pending', updated_at = NOW() WHERE id = ${invoiceId}`);
      }
      return res.json({ success: true, channel: "telegram", recipient: chatId, invoiceUrl });
    }

    // link / sms: just return the public link
    const orgId2 = user.organizationId;
    if (orgId2) {
      await db.execute(sql`UPDATE invoices SET status = 'pending', updated_at = NOW() WHERE id = ${invoiceId} AND organization_id = ${orgId2}`);
    } else {
      await db.execute(sql`UPDATE invoices SET status = 'pending', updated_at = NOW() WHERE id = ${invoiceId}`);
    }
    return res.json({ success: true, channel, recipient, invoiceUrl, invoiceNumber: invoice.invoiceNumber });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
