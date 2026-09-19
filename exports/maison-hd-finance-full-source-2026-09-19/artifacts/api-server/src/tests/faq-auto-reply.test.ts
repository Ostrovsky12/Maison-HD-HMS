import { beforeEach, describe, expect, it, vi } from "vitest";

const { completionCreate } = vi.hoisted(() => ({
  completionCreate: vi.fn(),
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: completionCreate } } },
}));

import { db } from "@workspace/db";
import { faqAutoBlocker, tryFaqAutoReply } from "../lib/faq-auto-reply.js";

function selectChain(rows: any[]) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then(resolve: (value: any[]) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return chain;
}

const enabledSettings = { enabled: true, mode: "faq_auto" };
let insertValues: ReturnType<typeof vi.fn>;
const faqArticle = {
  id: 42,
  title: "Час сніданку",
  content: "Сніданок подається щодня з 08:00 до 11:00.",
  tags: "сніданок, година",
  category: "faq",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function prepareSelects(...results: any[][]) {
  const queued = [...results];
  (db.select as any).mockImplementation(() => selectChain(queued.shift() || []));
}

describe("FAQ auto-reply safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.select as any).mockReset();
    insertValues = vi.fn().mockResolvedValue(undefined);
    (db.insert as any).mockReturnValue({ values: insertValues });
    (db.$client.query as any).mockResolvedValue({ rows: [] });
    completionCreate.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("keeps manual mode review-only", async () => {
    prepareSelects([{ enabled: true, mode: "manual" }]);

    await tryFaqAutoReply({
      organizationId: 7,
      conversationId: 11,
      channel: "telegram",
      externalId: "guest-1",
      text: "О котрій сніданок?",
    });

    expect(completionCreate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect((db.$client.query as any)).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("sends only a grounded FAQ answer and records its source and delivery result", async () => {
    prepareSelects(
      [enabledSettings],
      [faqArticle],
      [{ isEnabled: true, config: { bot_token: "__REDACTED_FROM_AUDIT_ARCHIVE__" } }],
    );
    completionCreate.mockResolvedValue({
      choices: [{ message: { content: '{"safe":true,"sourceId":42,"answer":"Сніданок подається щодня з 08:00 до 11:00."}' } }],
    });
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true, result: { message_id: 555 } }),
    });

    await tryFaqAutoReply({
      organizationId: 7,
      conversationId: 11,
      channel: "telegram",
      externalId: "guest-1",
      text: "О котрій сніданок?",
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("api.telegram.org"),
      expect.objectContaining({ method: "POST" }),
    );
    expect((db.$client.query as any).mock.calls[0][0]).toContain("INSERT INTO messages");
    expect((db.$client.query as any).mock.calls[0][1][2]).toContain('"source_ids":"42"');
    expect(insertValues.mock.calls[0][0].sources).toEqual([42]);
    expect(insertValues.mock.calls[0][0].details).toMatchObject({
      channel: "telegram",
      delivery: "delivered",
      providerMessageId: "555",
    });
  });

  it("routes pricing and booking requests to the manager before any source lookup or send", async () => {
    expect(faqAutoBlocker("Яка ціна на проживання?")).toBe("pricing_request");
    expect(faqAutoBlocker("Чи є вільний номер на вихідні?")).toBe("booking_intake");
    prepareSelects([enabledSettings]);

    await tryFaqAutoReply({
      organizationId: 7,
      conversationId: 11,
      channel: "instagram",
      externalId: "guest-1",
      text: "Яка ціна на проживання?",
    });

    expect(completionCreate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect((db.$client.query as any).mock.calls[0][0]).toContain("UPDATE conversations");
    expect((db.$client.query as any).mock.calls[1][1][1]).toContain("ціни або тарифу");
    expect(insertValues.mock.calls[0][0]).toMatchObject({
      action: "inbox_faq_auto_handoff",
      outcome: "pricing_request",
    });
  });

  it("hands off when AI is uncertain or the channel rejects the delivery", async () => {
    prepareSelects([enabledSettings], [faqArticle]);
    completionCreate.mockResolvedValue({
      choices: [{ message: { content: '{"safe":false,"sourceId":null,"answer":""}' } }],
    });

    await tryFaqAutoReply({
      organizationId: 7,
      conversationId: 11,
      channel: "telegram",
      externalId: "guest-1",
      text: "О котрій сніданок?",
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(insertValues.mock.calls[0][0].outcome).toBe("uncertain_response");

    vi.clearAllMocks();
    (db.select as any).mockReset();
    insertValues = vi.fn().mockResolvedValue(undefined);
    (db.insert as any).mockReturnValue({ values: insertValues });
    (db.$client.query as any).mockResolvedValue({ rows: [] });
    prepareSelects(
      [enabledSettings],
      [faqArticle],
      [{ isEnabled: true, config: { bot_token: "__REDACTED_FROM_AUDIT_ARCHIVE__" } }],
    );
    completionCreate.mockResolvedValue({
      choices: [{ message: { content: '{"safe":true,"sourceId":42,"answer":"Сніданок подається щодня з 08:00 до 11:00."}' } }],
    });
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({ description: "forbidden" }),
    });

    await tryFaqAutoReply({
      organizationId: 7,
      conversationId: 11,
      channel: "telegram",
      externalId: "guest-1",
      text: "О котрій сніданок?",
    });

    expect((db.$client.query as any).mock.calls[1][1][1]).toContain("не вдалося доставити");
    expect(insertValues.mock.calls[0][0]).toMatchObject({
      action: "inbox_faq_auto_handoff",
      outcome: "channel_dispatch_failed",
      sources: [42],
    });
  });
});