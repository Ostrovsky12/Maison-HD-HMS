import { Router } from "express";
import { db } from "@workspace/db";
import { channelConfigsTable, conversationsTable, messagesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// ── Helper: find or create conversation ─────────────────────────────────────
async function upsertConversation(
  orgId: number,
  channel: "telegram" | "instagram",
  externalId: string,
  guestName: string,
  text: string,
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
  }).returning();
  return newConv;
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
  res.sendStatus(200); // Telegram requires fast 200

  try {
    const orgId = parseInt(req.params.orgId);
    if (!orgId || isNaN(orgId)) return;

    const update = req.body;
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

    console.log(`[telegram-webhook] org=${orgId} chat=${chatId} msg="${text.slice(0, 40)}"`);
  } catch (err) {
    console.error("[telegram-webhook] error:", err);
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
        console.log(`[instagram-webhook] verification OK for org=${match.organizationId}`);
        return res.status(200).send(challenge);
      }
    } catch (err) {
      console.error("[instagram-webhook] verify error:", err);
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
        console.warn(`[instagram-webhook] no config for page_id=${pageId}`);
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

        console.log(`[instagram-webhook] org=${orgId} sender=${senderId} msg="${text.slice(0, 40)}"`);
      }
    }
  } catch (err) {
    console.error("[instagram-webhook] error:", err);
  }
});

export default router;
