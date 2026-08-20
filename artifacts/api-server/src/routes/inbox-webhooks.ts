import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { db } from "@workspace/db";
import { channelConfigsTable, conversationsTable, messagesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Helper: find or create conversation ─────────────────────────────────────
async function upsertConversation(
  orgId: number,
  channel: "telegram" | "instagram",
  externalId: string,
  guestName: string,
  text: string,
  metadata: Record<string, string> = {},
) {
  const [existing] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.organizationId, orgId),
      eq(conversationsTable.externalId, externalId),
      eq(conversationsTable.channel, channel as any),
    )).limit(1);

  if (existing) {
    await db.update(conversationsTable).set({
      lastMessageAt: new Date(),
      lastMessagePreview: text.slice(0, 100),
      unreadCount: (existing.unreadCount || 0) + 1,
      updatedAt: new Date(),
    }).where(eq(conversationsTable.id, existing.id));
    return existing;
  }

  const [newConv] = await db.insert(conversationsTable).values({
    organizationId: orgId,
    channel: channel as any,
    externalId,
    guestName,
    status: "open" as any,
    lastMessagePreview: text.slice(0, 100),
    lastMessageAt: new Date(),
    unreadCount: 1,
    metadata,
  }).returning();
  return newConv;
}

type TelegramBusinessConnection = {
  isEnabled: boolean;
  canReply: boolean;
};

function parseBusinessConnections(config: Record<string, unknown> | undefined) {
  const raw = config?.business_connections;
  if (typeof raw !== "string") return {} as Record<string, TelegramBusinessConnection>;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, TelegramBusinessConnection>
      : {};
  } catch {
    return {};
  }
}

function webhookSecretMatches(expected: string, provided: string | string[] | undefined) {
  if (!expected || typeof provided !== "string") return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length
    && timingSafeEqual(expectedBuffer, providedBuffer);
}

async function rememberBusinessConnection(config: any, connection: any) {
  const currentConfig = (config.config || {}) as Record<string, string>;
  const connections = parseBusinessConnections(currentConfig);
  connections[String(connection.id)] = {
    isEnabled: Boolean(connection.is_enabled),
    canReply: Boolean(connection.can_reply),
  };
  await db.update(channelConfigsTable).set({
    config: {
      ...currentConfig,
      business_connections: JSON.stringify(connections),
    },
    updatedAt: new Date(),
  }).where(eq(channelConfigsTable.id, config.id));
}

// ── Helper: store inbound message (dedup by externalMessageId) ───────────────
async function storeInboundMessage(
  conversationId: number,
  text: string,
  senderName: string,
  externalMessageId: string,
) {
  const [dup] = await db.select({ id: messagesTable.id }).from(messagesTable)
    .where(eq(messagesTable.externalMessageId, externalMessageId)).limit(1);
  if (dup) return null;

  const [msg] = await db.insert(messagesTable).values({
    conversationId,
    direction: "inbound" as any,
    messageType: "text" as any,
    content: text,
    senderName,
    isRead: false,
    externalMessageId,
  }).returning();
  return msg;
}

// ══════════════════════════════════════════════════════════════════════════════
// TELEGRAM
// URL format: POST /api/inbox/webhooks/telegram/:orgId
// (orgId in path so one API server can serve many orgs)
// ══════════════════════════════════════════════════════════════════════════════
router.post("/telegram/:orgId", async (req, res) => {
  try {
    const orgId = parseInt(req.params.orgId);
    if (!orgId || isNaN(orgId)) {
      res.sendStatus(404);
      return;
    }

    const update = req.body;
    const [config] = await db.select().from(channelConfigsTable)
      .where(and(
        eq(channelConfigsTable.organizationId, orgId),
        eq(channelConfigsTable.channel, "telegram" as any),
      ))
      .limit(1);
    if (!config?.isEnabled) {
      res.sendStatus(404);
      return;
    }

    const telegramConfig = (config.config || {}) as Record<string, string>;
    const isBusinessUpdate = Boolean(
      update?.business_connection
      || update?.business_message
      || update?.edited_business_message
      || update?.deleted_business_messages,
    );
    const suppliedSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (!telegramConfig.webhook_secret || !webhookSecretMatches(telegramConfig.webhook_secret, suppliedSecret)) {
      logger.warn({ organizationId: orgId }, "Rejected Telegram webhook with invalid secret");
      res.sendStatus(401);
      return;
    }
    if (isBusinessUpdate && (!telegramConfig.webhook_secret || telegramConfig.business_enabled !== "true")) {
      logger.warn({ organizationId: orgId }, "Rejected inactive Telegram Business webhook");
      res.sendStatus(403);
      return;
    }

    res.sendStatus(200); // Telegram requires a fast acknowledgement

    if (update.business_connection) {
      await rememberBusinessConnection(config, update.business_connection);
      logger.info({ organizationId: orgId }, "Telegram Business connection updated");
      return;
    }

    const businessMessage = update.business_message || update.edited_business_message;
    if (businessMessage) {
      const connectionId = businessMessage.business_connection_id;
      const connection = parseBusinessConnections(telegramConfig)[connectionId];
      if (!connection?.isEnabled || !connection?.canReply) {
        logger.warn({ organizationId: orgId }, "Ignored Telegram Business message from unavailable connection");
        return;
      }

      const chatId = String(businessMessage.chat?.id || "");
      if (!chatId || !businessMessage.message_id) return;
      const text = businessMessage.text || businessMessage.caption || "[медіа-повідомлення]";
      const from = businessMessage.from;
      const senderName = from
        ? [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Telegram User"
        : businessMessage.chat?.title || "Telegram User";
      const externalId = `telegram_business:${connectionId}:${chatId}`;
      const messageId = `tgb_${connectionId}_${chatId}_${businessMessage.message_id}`;
      const conv = await upsertConversation(
        orgId,
        "telegram",
        externalId,
        senderName,
        text,
        {
          telegram_delivery: "business",
          telegram_business_connection_id: connectionId,
          telegram_chat_id: chatId,
        },
      );
      await storeInboundMessage(conv.id, text, senderName, messageId);
      logger.info({ organizationId: orgId }, "Telegram Business message stored");
      return;
    }

    const message = update.message || update.edited_message;
    if (!message) return;

    const chatId = String(message.chat.id);
    const text = message.text || message.caption || "[медіа-повідомлення]";
    const from = message.from;
    const senderName = from
      ? [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Telegram User"
      : message.chat.title || "Telegram User";
    const messageId = `tg_${message.message_id}`;

    const conv = await upsertConversation(orgId, "telegram", chatId, senderName, text);
    await storeInboundMessage(conv.id, text, senderName, messageId);

    logger.info({ organizationId: orgId }, "Telegram bot message stored");
  } catch (err) {
    logger.error({ err }, "Telegram webhook processing failed");
    if (!res.headersSent) res.sendStatus(500);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INSTAGRAM
// Meta sends ALL events to one URL, we identify org by page_id in config
// ══════════════════════════════════════════════════════════════════════════════

// GET — webhook verification (hub.challenge)
router.get("/instagram", async (req, res) => {
  const mode = req.query["hub.mode"] as string;
  const token = req.query["hub.verify_token"] as string;
  const challenge = req.query["hub.challenge"] as string;

  if (mode === "subscribe" && token) {
    try {
      const configs = await db.select().from(channelConfigsTable)
        .where(eq(channelConfigsTable.channel, "instagram" as any));
      const match = configs.find(c => c.config?.verify_token === token);
      if (match) {
        logger.info({ organizationId: match.organizationId }, "Instagram webhook verification succeeded");
        return res.status(200).send(challenge);
      }
    } catch (err) {
      logger.error({ err }, "Instagram webhook verification failed");
    }
    return res.sendStatus(403);
  }
  res.sendStatus(403);
});

// POST — incoming DMs from Instagram
router.post("/instagram", async (req, res) => {
  res.sendStatus(200); // Meta requires fast 200

  try {
    const body = req.body;
    if (body.object !== "instagram" && body.object !== "page") return;

    const configs = await db.select().from(channelConfigsTable)
      .where(eq(channelConfigsTable.channel, "instagram" as any));

    for (const entry of (body.entry || [])) {
      const pageId = String(entry.id);
      const config = configs.find(c => c.config?.page_id === pageId || c.config?.ig_user_id === pageId);
      if (!config) {
        logger.warn("Instagram webhook received an unknown page");
        continue;
      }
      const orgId = config.organizationId;

      const messaging = entry.messaging || entry.messages || [];
      for (const event of messaging) {
        if (!event.message) continue;
        if (event.message.is_echo) continue; // Skip our own outbound messages

        const senderId = String(event.sender.id);
        const text = event.message.text || "[медіа]";
        const msgId = `ig_${event.message.mid}`;

        // Try to get sender name via Graph API
        let senderName = "Instagram User";
        try {
          const accessToken = config.config?.access_token;
          if (accessToken) {
            const r = await fetch(`https://graph.facebook.com/v19.0/${senderId}?fields=name&access_token=${accessToken}`);
            if (r.ok) {
              const u = await r.json() as any;
              if (u.name) senderName = u.name;
            }
          }
        } catch {}

        const conv = await upsertConversation(orgId, "instagram", senderId, senderName, text);
        await storeInboundMessage(conv.id, text, senderName, msgId);

        logger.info({ organizationId: orgId }, "Instagram message stored");
      }
    }
  } catch (err) {
    logger.error({ err }, "Instagram webhook processing failed");
  }
});

export default router;
