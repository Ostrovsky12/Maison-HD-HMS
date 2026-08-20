import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db } from "@workspace/db";
import inboxWebhooksRouter from "../routes/inbox-webhooks.js";
import inboxRouter from "../routes/inbox.js";
import { signToken } from "../lib/auth.js";

const app = express();
app.use(express.json());
app.use("/api/inbox/webhooks", inboxWebhooksRouter);
app.use("/api/inbox", inboxRouter);

function makeChain(rows: any[] = []) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then(resolve: (value: any) => any, reject: (error: any) => any) {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return chain;
}

function configuredTelegramChannel(overrides: Record<string, string> = {}) {
  return {
    id: 8,
    organizationId: 1,
    channel: "telegram",
    isEnabled: true,
    config: {
      bot_token: "not-a-real-token",
      webhook_secret: "expected-secret",
      business_enabled: "true",
      business_connections: "{}",
      ...overrides,
    },
  };
}

function businessMessageUpdate(connectionId = "connection-1") {
  return {
    business_message: {
      business_connection_id: connectionId,
      message_id: 42,
      date: 1_700_000_000,
      chat: { id: 555, type: "private" },
      from: { id: 7, first_name: "Тестовий" },
      text: "Доброго дня",
    },
  };
}

beforeEach(() => {
  vi.mocked(db.select).mockReset();
  vi.mocked(db.insert).mockReset();
  vi.mocked(db.update).mockReset();
  vi.mocked((db as any).$client.query).mockReset();
  vi.unstubAllGlobals();
});

describe("Telegram Business webhook safety", () => {
  it("rejects a Business webhook when the organization has no Telegram configuration", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as any);

    const response = await request(app)
      .post("/api/inbox/webhooks/telegram/1")
      .send(businessMessageUpdate());

    expect(response.status).toBe(404);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a forged Business webhook before it can write a conversation", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([configuredTelegramChannel()]) as any);

    const response = await request(app)
      .post("/api/inbox/webhooks/telegram/1")
      .set("x-telegram-bot-api-secret-token", "wrong-secret")
      .send(businessMessageUpdate());

    expect(response.status).toBe(401);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects an unsigned legacy Bot webhook before it can write a conversation", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([configuredTelegramChannel({
      webhook_secret: "",
      business_enabled: "false",
    })]) as any);

    const response = await request(app)
      .post("/api/inbox/webhooks/telegram/1")
      .send({
        message: {
          message_id: 21,
          chat: { id: 555, type: "private" },
          from: { first_name: "Тестовий" },
          text: "Підроблений запит",
        },
      });

    expect(response.status).toBe(401);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("ignores a signed Business message from a connection not authorized for this organization", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([configuredTelegramChannel()]) as any);

    const response = await request(app)
      .post("/api/inbox/webhooks/telegram/1")
      .set("x-telegram-bot-api-secret-token", "expected-secret")
      .send(businessMessageUpdate());

    expect(response.status).toBe(200);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("records a signed Business connection without exposing it through the webhook response", async () => {
    const config = configuredTelegramChannel();
    vi.mocked(db.select).mockReturnValueOnce(makeChain([config]) as any);
    const updateChain: any = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(db.update).mockReturnValueOnce(updateChain);

    const response = await request(app)
      .post("/api/inbox/webhooks/telegram/1")
      .set("x-telegram-bot-api-secret-token", "expected-secret")
      .send({
        business_connection: {
          id: "connection-1",
          is_enabled: true,
          can_reply: true,
        },
      });

    expect(response.status).toBe(200);
    expect(response.text).not.toContain("connection-1");
    expect(updateChain.set).toHaveBeenCalledOnce();
    const savedConfig = updateChain.set.mock.calls[0][0].config;
    expect(JSON.parse(savedConfig.business_connections)["connection-1"]).toEqual({
      isEnabled: true,
      canReply: true,
    });
  });
});

describe("Telegram Business replies", () => {
  it("sends the real chat ID and connection ID to Telegram instead of the internal conversation key", async () => {
    const businessConversation = {
      id: 12,
      channel: "telegram",
      external_id: "telegram_business:connection-1:555",
      metadata: {
        telegram_delivery: "business",
        telegram_business_connection_id: "connection-1",
        telegram_chat_id: "555",
      },
    };
    vi.mocked((db as any).$client.query).mockImplementation(async (statement: string) => {
      if (statement.includes("SELECT id, channel, external_id, metadata FROM conversations")) {
        return { rows: [businessConversation] };
      }
      if (statement.includes("INSERT INTO messages")) {
        return {
          rows: [{
            id: 90,
            conversation_id: 12,
            direction: "outbound",
            message_type: "text",
            content: "Вітаємо",
            sender_name: "Адміністратор",
            is_ai_generated: false,
            is_read: true,
            created_at: new Date(),
          }],
        };
      }
      if (statement.includes("UPDATE conversations SET last_message_at")) return { rows: [] };
      throw new Error(`Unexpected query: ${statement}`);
    });
    vi.mocked(db.select).mockReturnValueOnce(makeChain([configuredTelegramChannel({
      business_connections: JSON.stringify({
        "connection-1": { isEnabled: true, canReply: true },
      }),
    })]) as any);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = signToken({
      userId: 99,
      email: "manager@example.com",
      role: "manager",
      organizationId: 1,
      propertyId: null,
    });
    const response = await request(app)
      .post("/api/inbox/conversations/12/reply")
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Вітаємо" });

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const requestPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestPayload).toMatchObject({
      chat_id: "555",
      business_connection_id: "connection-1",
      text: "Вітаємо",
    });
    expect(requestPayload.chat_id).not.toContain("telegram_business:");
  });
});

describe("Telegram Business routing privacy", () => {
  it("does not return internal Telegram connection routing metadata in conversation details", async () => {
    vi.mocked((db as any).$client.query).mockImplementation(async (statement: string) => {
      if (statement.includes("SELECT c.*, u.name as assigned_to_name")) {
        return {
          rows: [{
            id: 12,
            organization_id: 1,
            channel: "telegram",
            external_id: "telegram_business:connection-1:555",
            metadata: {
              telegram_delivery: "business",
              telegram_business_connection_id: "connection-1",
              telegram_chat_id: "555",
            },
            guest_name: "Тестовий гість",
            guest_phone: null,
            guest_email: null,
            guest_avatar_url: null,
            guest_id: null,
            booking_id: null,
            status: "open",
            assigned_to_id: null,
            assigned_to_name: null,
            subject: null,
            last_message_at: new Date(),
            last_message_preview: "Доброго дня",
            unread_count: 1,
            tags: [],
            ai_summary: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        };
      }
      if (statement.includes("SELECT * FROM messages")) return { rows: [] };
      if (statement.includes("UPDATE conversations SET unread_count")) return { rows: [] };
      if (statement.includes("UPDATE messages SET is_read")) return { rows: [] };
      if (statement.includes("SELECT id, name, role FROM users")) return { rows: [] };
      throw new Error(`Unexpected query: ${statement}`);
    });
    const token = signToken({
      userId: 99,
      email: "manager@example.com",
      role: "manager",
      organizationId: 1,
      propertyId: null,
    });

    const response = await request(app)
      .get("/api/inbox/conversations/12")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.conversation).toMatchObject({
      id: 12,
      channel: "telegram",
      guestName: "Тестовий гість",
    });
    expect(response.body.conversation).not.toHaveProperty("external_id");
    expect(response.body.conversation).not.toHaveProperty("metadata");
    expect(JSON.stringify(response.body)).not.toContain("connection-1");
    expect(JSON.stringify(response.body)).not.toContain("telegram_business:");
  });
});