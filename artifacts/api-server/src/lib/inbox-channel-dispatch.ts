import { db } from "@workspace/db";
import { channelConfigsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

export type AutoReplyChannel = "telegram" | "instagram";

export type ChannelDispatchResult = {
  channel: AutoReplyChannel;
  providerMessageId: string | null;
};

export async function dispatchInboxChannelMessage(input: {
  organizationId: number;
  channel: AutoReplyChannel;
  recipientId: string;
  text: string;
}): Promise<ChannelDispatchResult> {
  const [config] = await db.select()
    .from(channelConfigsTable)
    .where(and(
      eq(channelConfigsTable.organizationId, input.organizationId),
      eq(channelConfigsTable.channel, input.channel as any),
      eq(channelConfigsTable.isEnabled, true),
    ))
    .limit(1);

  if (!config) {
    throw new Error(`The ${input.channel} channel is not enabled for this organization.`);
  }

  if (input.channel === "telegram") {
    const token = config.config?.bot_token;
    if (!token) throw new Error("Telegram is missing its bot token.");

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: input.recipientId, text: input.text, parse_mode: "HTML" }),
    });
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok || !payload?.ok) {
      throw new Error(`Telegram rejected the message (${payload?.description || response.status}).`);
    }
    return {
      channel: input.channel,
      providerMessageId: payload?.result?.message_id ? String(payload.result.message_id) : null,
    };
  }

  const accessToken = config.config?.access_token;
  const instagramUserId = config.config?.ig_user_id;
  if (!accessToken || !instagramUserId) {
    throw new Error("Instagram is missing its messaging configuration.");
  }

  const response = await fetch(`https://graph.facebook.com/v19.0/${instagramUserId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: input.recipientId },
      message: { text: input.text },
      access_token: accessToken,
    }),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || payload?.error) {
    throw new Error(`Instagram rejected the message (${payload?.error?.message || response.status}).`);
  }
  return {
    channel: input.channel,
    providerMessageId: payload?.message_id ? String(payload.message_id) : null,
  };
}