import { beforeEach, describe, expect, it, vi } from "vitest";

const { gmail, info, warn } = vi.hoisted(() => ({
  gmail: vi.fn(), info: vi.fn(), warn: vi.fn(),
}));
vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class { createProxyFetch() { return gmail; } },
}));
vi.mock("../lib/logger.js", () => ({ logger: { info, warn } }));
import { leadEmailRaw, notifyLandingLead, sendLeadEmail, sendLeadTelegram } from "../lib/lead-notifications.js";

const lead = { id: 42, name: "Тест [А]", email: "visitor@example.com", company: "Компанія", message: "Аудит *процесів*" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv("MAISONHD_LEADS_EMAIL_ENABLED", "true");
  vi.stubEnv("MAISONHD_LEADS_EMAIL", "owner@example.com");
  vi.stubEnv("MAISONHD_TG_BOT_TOKEN", "");
  vi.stubEnv("MAISONHD_TG_CHAT_ID", "");
});

describe("landing lead Gmail", () => {
  it("encodes Ukrainian text and uses only the configured recipient", () => {
    const decoded = Buffer.from(leadEmailRaw(lead, "owner@example.com", "sender@example.com"), "base64url").toString();
    expect(decoded).toContain("To: owner@example.com\r\n");
    expect(decoded).toContain("Reply-To: visitor@example.com\r\n");
    expect(Buffer.from(decoded.split("\r\n\r\n")[1], "base64").toString()).toContain(lead.message);
    expect(() => leadEmailRaw({ ...lead, email: "x@y.com\r\nBcc: thief@example.com" }, "owner@example.com", "sender@example.com")).toThrow();
  });

  it("confirms a Gmail message id only after a successful send", async () => {
    gmail.mockResolvedValueOnce(Response.json({ emailAddress: "sender@example.com" }))
      .mockResolvedValueOnce(Response.json({ id: "sent-id" }));
    expect(await sendLeadEmail(lead)).toEqual({ status: "sent", messageId: "sent-id" });
    expect(gmail.mock.calls[1][0]).toBe("/gmail/v1/users/me/messages/send");
    const raw = JSON.parse(gmail.mock.calls[1][1].body).raw;
    expect(Buffer.from(raw, "base64url").toString()).toContain("To: owner@example.com");
  });

  it("reports missing setup without attempting Gmail", async () => {
    vi.stubEnv("MAISONHD_LEADS_EMAIL_ENABLED", "");
    expect(await sendLeadEmail(lead)).toEqual({ status: "not_configured" });
    expect(gmail).not.toHaveBeenCalled();
  });

  it("reports denied authorization and does not send", async () => {
    gmail.mockResolvedValueOnce(new Response("", { status: 403 }));
    expect(await sendLeadEmail(lead)).toEqual({ status: "failed", httpStatus: 403 });
    expect(gmail).toHaveBeenCalledTimes(1);
  });

  it("does not automatically resend an ambiguous network outcome", async () => {
    gmail.mockResolvedValueOnce(Response.json({ emailAddress: "sender@example.com" }))
      .mockRejectedValueOnce(new Error("lost response"));
    expect(await sendLeadEmail(lead)).toEqual({ status: "unknown" });
    expect(gmail).toHaveBeenCalledTimes(2);
  });
});

describe("landing lead Telegram", () => {
  it("reports missing configuration", async () => {
    expect(await sendLeadTelegram(lead)).toEqual({ status: "not_configured" });
  });

  it("does not treat Telegram API errors as successful delivery", async () => {
    vi.stubEnv("MAISONHD_TG_BOT_TOKEN", "test-token");
    vi.stubEnv("MAISONHD_TG_CHAT_ID", "test-chat");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: false }, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendLeadTelegram(lead)).toEqual({ status: "failed", httpStatus: 400 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("parse_mode");
  });

  it("logs missing Telegram independently of successful email", async () => {
    gmail.mockResolvedValueOnce(Response.json({ emailAddress: "sender@example.com" }))
      .mockResolvedValueOnce(Response.json({ id: "sent-id" }));
    await notifyLandingLead(lead);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ channel: "gmail", status: "sent" }), expect.any(String));
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ channel: "telegram", status: "not_configured" }), expect.any(String));
  });
});
