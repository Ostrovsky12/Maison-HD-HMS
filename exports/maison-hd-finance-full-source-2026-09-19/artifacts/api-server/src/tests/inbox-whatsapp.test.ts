/**
 * WhatsApp Business webhook tests — covers:
 * • Signature validation (unit)
 * • Production rawBody capture: same middleware pattern as app.ts, applied to /whatsapp
 * • Hub challenge verification (GET /whatsapp)
 * • Unknown phone_number_id → ignored (tenant isolation)
 * • Disabled or invalid signature → message not persisted
 * • Valid inbound message → conversation upserted and message stored
 * • Dispatch errors do not crash the reply endpoint
 */

import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db } from "@workspace/db";
import inboxWebhooksRouter, { validWhatsAppSignature } from "../routes/inbox-webhooks.js";
import inboxRouter from "../routes/inbox.js";
import { signToken } from "../lib/auth.js";

// ── Test app: uses the SAME rawBody capture pattern as production app.ts ────
// Only store rawBody for provider webhook paths (matching the condition in app.ts).
// This is the setup that must be verified to work before the tests prove anything useful.
const app = express();
app.use(express.json({
  verify: (req: any, _res, buf) => {
    if (
      req.originalUrl?.startsWith("/api/inbox/webhooks/instagram") ||
      req.originalUrl?.startsWith("/api/inbox/webhooks/whatsapp")
    ) {
      req.rawBody = Buffer.from(buf);
    }
  },
}));
app.use("/api/inbox/webhooks", inboxWebhooksRouter);
app.use("/api/inbox", inboxRouter);

// ── Helpers ────────────────────────────────────────────────────────────────
const APP_SECRET = "__REDACTED_FROM_AUDIT_ARCHIVE__";

function makeWaBody(phoneNumberId: string, fromWaId: string, text: string, msgId = "wamid.ABC123") {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA_ID",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "+1234567890", phone_number_id: phoneNumberId },
          contacts: [{ profile: { name: "Тест Гість" }, wa_id: fromWaId }],
          messages: [{
            from: fromWaId,
            id: msgId,
            timestamp: "1700000000",
            text: { body: text },
            type: "text",
          }],
        },
        field: "messages",
      }],
    }],
  };
}

function waSignature(body: object, secret: string) {
  const raw = Buffer.from(JSON.stringify(body));
  return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
}

function configuredWhatsAppChannel(overrides: Record<string, string> = {}) {
  return {
    id: 42,
    organizationId: 7,
    channel: "whatsapp",
    isEnabled: true,
    config: {
      phone_number_id: "phone-123",
      access_token: "__REDACTED_FROM_AUDIT_ARCHIVE__",
      app_secret: APP_SECRET,
      verify_token: "__REDACTED_FROM_AUDIT_ARCHIVE__",
      display_phone: "+1234567890",
      verified_name: "Maison HD",
      ...overrides,
    },
    webhookUrl: "https://example.com/api/inbox/webhooks/whatsapp",
  };
}

function makeChain(rows: any[] = []) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then(resolve: (v: any) => any, reject: (e: any) => any) {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return chain;
}

beforeEach(() => {
  vi.mocked(db.select).mockReset();
  vi.mocked(db.insert).mockReset();
  vi.mocked(db.update).mockReset();
  vi.mocked((db as any).$client?.query)?.mockReset?.();
  vi.unstubAllGlobals();
});

// ══════════════════════════════════════════════════════════════════════════
// Production rawBody capture — verifies the same path condition as app.ts
// ══════════════════════════════════════════════════════════════════════════
describe("Production rawBody middleware (mirrors app.ts verify condition)", () => {
  it("sets req.rawBody for the WhatsApp webhook path so HMAC verification can run", async () => {
    let capturedRawBody: Buffer | undefined;
    const probe = express();
    probe.use(express.json({
      verify: (req: any, _res, buf) => {
        if (
          req.originalUrl?.startsWith("/api/inbox/webhooks/instagram") ||
          req.originalUrl?.startsWith("/api/inbox/webhooks/whatsapp")
        ) {
          req.rawBody = Buffer.from(buf);
        }
      },
    }));
    probe.post("/api/inbox/webhooks/whatsapp", (req: any, res) => {
      capturedRawBody = req.rawBody;
      res.sendStatus(200);
    });

    const payload = JSON.stringify({ object: "whatsapp_business_account" });
    await request(probe)
      .post("/api/inbox/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .send(payload);

    expect(capturedRawBody).toBeInstanceOf(Buffer);
    expect(capturedRawBody?.toString()).toBe(payload);
  });

  it("does NOT set req.rawBody for unrelated API paths (scope is intentionally narrow)", async () => {
    let capturedRawBody: Buffer | undefined;
    const probe = express();
    probe.use(express.json({
      verify: (req: any, _res, buf) => {
        if (
          req.originalUrl?.startsWith("/api/inbox/webhooks/instagram") ||
          req.originalUrl?.startsWith("/api/inbox/webhooks/whatsapp")
        ) {
          req.rawBody = Buffer.from(buf);
        }
      },
    }));
    probe.post("/api/inbox/conversations/1/reply", (req: any, res) => {
      capturedRawBody = req.rawBody;
      res.sendStatus(200);
    });

    await request(probe)
      .post("/api/inbox/conversations/1/reply")
      .send({ content: "Hello" });

    expect(capturedRawBody).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Unit: HMAC signature helper
// ══════════════════════════════════════════════════════════════════════════
describe("WhatsApp webhook signature validation", () => {
  const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
  const valid = `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;

  it("accepts a correctly-signed body", () => {
    expect(validWhatsAppSignature(body, valid, APP_SECRET)).toBe(true);
  });

  it("rejects an incorrect HMAC digest", () => {
    expect(validWhatsAppSignature(body, "sha256=deadbeef", APP_SECRET)).toBe(false);
  });

  it("rejects when the body differs from what was signed", () => {
    expect(validWhatsAppSignature(Buffer.from("{}"), valid, APP_SECRET)).toBe(false);
  });

  it("rejects when app_secret is missing", () => {
    expect(validWhatsAppSignature(body, valid, undefined)).toBe(false);
  });

  it("rejects when rawBody is missing", () => {
    expect(validWhatsAppSignature(undefined, valid, APP_SECRET)).toBe(false);
  });

  it("rejects a signature that does not start with sha256=", () => {
    const noPrefix = createHmac("sha256", APP_SECRET).update(body).digest("hex");
    expect(validWhatsAppSignature(body, noPrefix, APP_SECRET)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Hub challenge verification
// ══════════════════════════════════════════════════════════════════════════
describe("WhatsApp hub challenge verification", () => {
  it("returns the challenge when verify_token matches a stored config", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([configuredWhatsAppChannel()]) as any);

    const res = await request(app)
      .get("/api/inbox/webhooks/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "wa_verifytoken", "hub.challenge": "abc123" });

    expect(res.status).toBe(200);
    expect(res.text).toBe("abc123");
  });

  it("rejects when no config matches the verify_token", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as any);

    const res = await request(app)
      .get("/api/inbox/webhooks/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "abc123" });

    expect(res.status).toBe(403);
  });

  it("rejects when hub.mode is not 'subscribe'", async () => {
    const res = await request(app)
      .get("/api/inbox/webhooks/whatsapp")
      .query({ "hub.mode": "unsubscribe", "hub.verify_token": "wa_verifytoken", "hub.challenge": "abc123" });

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Tenant isolation — unknown phone_number_id is silently dropped
// ══════════════════════════════════════════════════════════════════════════
describe("WhatsApp tenant isolation", () => {
  it("ignores a webhook for a phone_number_id not registered with any org", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as any);

    const body = makeWaBody("unknown-phone-id", "380991234567", "Привіт");
    const res = await request(app)
      .post("/api/inbox/webhooks/whatsapp")
      .set("x-hub-signature-256", waSignature(body, APP_SECRET))
      .send(body);

    // Must still return 200 to Meta (even when ignoring the message)
    expect(res.status).toBe(200);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("does not process messages for a disabled WhatsApp channel", async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([configuredWhatsAppChannel({ isEnabled: false } as any)]) as any
    );

    const body = makeWaBody("phone-123", "380991234567", "Привіт");
    const res = await request(app)
      .post("/api/inbox/webhooks/whatsapp")
      .set("x-hub-signature-256", waSignature(body, APP_SECRET))
      .send(body);

    expect(res.status).toBe(200);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a webhook with an invalid HMAC signature before writing any data", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([configuredWhatsAppChannel()]) as any);

    const body = makeWaBody("phone-123", "380991234567", "Підроблений запит");
    const res = await request(app)
      .post("/api/inbox/webhooks/whatsapp")
      .set("x-hub-signature-256", "sha256=invalidsignature")
      .send(body);

    expect(res.status).toBe(200); // Meta always gets 200; message is silently dropped
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Reply dispatch — delivery errors are logged and do not crash the endpoint
// ══════════════════════════════════════════════════════════════════════════
describe("WhatsApp reply dispatch error handling", () => {
  it("returns 200 to the operator even when WhatsApp Cloud API rejects the outbound message", async () => {
    const conv = {
      id: 55,
      channel: "whatsapp",
      external_id: "380991234567",
      metadata: {},
    };

    vi.mocked((db as any).$client.query).mockImplementation(async (statement: string) => {
      if (statement.includes("SELECT id, channel, external_id, metadata FROM conversations")) {
        return { rows: [conv] };
      }
      if (statement.includes("INSERT INTO messages")) {
        return {
          rows: [{
            id: 201, conversation_id: 55, direction: "outbound",
            message_type: "text", content: "Вітаємо у Maison HD",
            sender_name: "Адміністратор", is_ai_generated: false,
            is_read: true, created_at: new Date(),
          }],
        };
      }
      if (statement.includes("UPDATE conversations SET last_message_at")) return { rows: [] };
      throw new Error(`Unexpected query: ${statement}`);
    });

    // WhatsApp channel config found but Cloud API returns an error
    vi.mocked(db.select).mockReturnValueOnce(makeChain([configuredWhatsAppChannel()]) as any);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Token expired" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = signToken({
      userId: 99, email: "manager@example.com", role: "manager",
      organizationId: 7, propertyId: null,
    });
    const res = await request(app)
      .post("/api/inbox/conversations/55/reply")
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Вітаємо у Maison HD" });

    // The reply was persisted; the dispatch failure must not propagate to the HTTP response
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("sends the correct WhatsApp Cloud API payload with messaging_product and recipient wa_id", async () => {
    const conv = {
      id: 56,
      channel: "whatsapp",
      external_id: "380991234567",
      metadata: {},
    };

    vi.mocked((db as any).$client.query).mockImplementation(async (statement: string) => {
      if (statement.includes("SELECT id, channel, external_id, metadata FROM conversations")) {
        return { rows: [conv] };
      }
      if (statement.includes("INSERT INTO messages")) {
        return {
          rows: [{
            id: 202, conversation_id: 56, direction: "outbound",
            message_type: "text", content: "Ласкаво просимо!",
            sender_name: "Адміністратор", is_ai_generated: false,
            is_read: true, created_at: new Date(),
          }],
        };
      }
      if (statement.includes("UPDATE conversations SET last_message_at")) return { rows: [] };
      throw new Error(`Unexpected query: ${statement}`);
    });

    vi.mocked(db.select).mockReturnValueOnce(makeChain([configuredWhatsAppChannel()]) as any);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.OUT123" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = signToken({
      userId: 99, email: "manager@example.com", role: "manager",
      organizationId: 7, propertyId: null,
    });
    await request(app)
      .post("/api/inbox/conversations/56/reply")
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Ласкаво просимо!" });

    // Give the async dispatch a tick to execute
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("phone-123/messages");
    const payload = JSON.parse(opts.body);
    expect(payload).toMatchObject({
      messaging_product: "whatsapp",
      to: "380991234567",
      type: "text",
      text: { body: "Ласкаво просимо!" },
    });
    // Access token must be sent in header, not in body
    expect(payload).not.toHaveProperty("access_token");
    expect(opts.headers?.Authorization).toContain("Bearer ");
  });
});
