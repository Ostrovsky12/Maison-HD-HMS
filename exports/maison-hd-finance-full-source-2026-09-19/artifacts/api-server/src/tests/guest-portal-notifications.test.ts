import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../lib/notify.js", () => ({
  sendTelegram: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../routes/push.js", () => ({
  sendPushToOrg: vi.fn().mockResolvedValue(undefined),
}));

const { broadcastToAll } = vi.hoisted(() => ({
  broadcastToAll: vi.fn(),
}));

vi.mock("../lib/ws-broadcaster.js", () => ({
  broadcastToAll,
}));

import { db } from "@workspace/db";
import guestPortalRouter from "../routes/guest-portal.js";
import { signToken } from "../lib/auth.js";

const app = express();
app.use(express.json());
app.use("/api/guest", guestPortalRouter);

function makeChain(rows: any[] = []) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    then(resolve: (value: any[]) => unknown, reject: (error: unknown) => unknown) {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return chain;
}

function configureMessageInsert(message: Record<string, unknown>) {
  const returning = vi.fn().mockResolvedValue([message]);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as any);
  return { values, returning };
}

function staffToken() {
  return signToken({
    userId: 7,
    email: "manager@example.com",
    role: "manager",
    organizationId: 17,
    propertyId: null,
  });
}

/**
 * Supertest waits for a normal response body to finish, but an SSE response
 * intentionally stays open. Listen for the response event instead and abort
 * after the assertion has observed the event we need.
 */
function openSse(code: string): Promise<{
  response: any;
  waitForEvent: (type: string) => Promise<Record<string, unknown>>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const test = request(app).get(`/api/guest/${code}/events`).buffer(false);
    let settled = false;

    test.on("response", (response: any) => {
      const events: Record<string, unknown>[] = [];
      const waiters = new Map<string, Array<(event: Record<string, unknown>) => void>>();
      let buffer = "";

      response.setEncoding("utf8");
      response.on("error", () => {});
      response.on("data", (chunk: string) => {
        buffer += chunk;
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          const event = JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>;
          events.push(event);
          const type = typeof event.type === "string" ? event.type : "";
          for (const waiter of waiters.get(type) || []) waiter(event);
          waiters.delete(type);
        }
      });

      const waitForEvent = (type: string) => new Promise<Record<string, unknown>>((resolveEvent) => {
        const event = events.find((candidate) => candidate.type === type);
        if (event) return resolveEvent(event);
        waiters.set(type, [...(waiters.get(type) || []), resolveEvent]);
      });

      settled = true;
      resolve({
        response,
        waitForEvent,
        close: () => {
          response.destroy();
          test.abort();
        },
      });
    });
    test.on("error", (error: Error) => {
      if (!settled) reject(error);
    });
    test.end();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.select).mockReset();
  vi.mocked(db.insert).mockReset();
});

describe("Guest portal real-time notifications", () => {
  it("broadcasts a guest message with its organization and booking context", async () => {
    const booking = { id: 42, firstName: "Ada", lastName: "Lovelace" };
    const inserted = {
      id: 901,
      bookingId: 42,
      direction: "guest_to_hotel",
      senderName: "Ada Lovelace",
      message: "Need towels",
    };

    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([booking]) as any)
      .mockReturnValueOnce(makeChain([{ orgId: 17, unitName: "Room 101" }]) as any)
      .mockReturnValueOnce(makeChain([]) as any);
    const { values } = configureMessageInsert(inserted);

    const response = await request(app)
      .post("/api/guest/guest-code/message")
      .send({ message: "  Need towels  " });

    expect(response.status).toBe(200);
    expect(values).toHaveBeenCalledWith({
      bookingId: 42,
      direction: "guest_to_hotel",
      senderName: "Ada Lovelace",
      message: "Need towels",
    });
    await vi.waitFor(() => expect(broadcastToAll).toHaveBeenCalledOnce());
    expect(broadcastToAll).toHaveBeenCalledWith({
      type: "guest_portal_message",
      orgId: 17,
      messageId: 901,
      bookingId: 42,
      guestName: "Ada Lovelace",
      unitName: "Room 101",
      message: "Need towels",
    });
  });

  it("sends staff messages through SSE and persists hotel_to_guest direction", async () => {
    const createdAt = new Date("2026-09-01T12:00:00.000Z");
    const hotelMessage = {
      id: 902,
      bookingId: 42,
      direction: "hotel_to_guest",
      senderName: "manager@example.com",
      message: "Your towels are on the way",
      createdAt,
    };

    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 42 }]) as any)
      .mockReturnValueOnce(makeChain([{ orgId: 17 }]) as any);
    const { values } = configureMessageInsert(hotelMessage);
    const stream = await openSse("guest-code");

    try {
      expect(stream.response.statusCode).toBe(200);
      expect(stream.response.headers["content-type"]).toMatch(/^text\/event-stream/);
      await expect(stream.waitForEvent("connected")).resolves.toMatchObject({ type: "connected" });

      const response = await request(app)
        .post("/api/guest/message/42")
        .set("Authorization", `Bearer ${staffToken()}`)
        .send({ message: hotelMessage.message });

      expect(response.status).toBe(200);
      expect(values).toHaveBeenCalledWith({
        bookingId: 42,
        direction: "hotel_to_guest",
        senderName: "manager@example.com",
        message: "Your towels are on the way",
        isRead: false,
      });
      await expect(stream.waitForEvent("hotel_message")).resolves.toEqual({
        type: "hotel_message",
        messageId: 902,
        message: "Your towels are on the way",
        senderName: "manager@example.com",
        createdAt: createdAt.toISOString(),
      });
    } finally {
      stream.close();
    }
  });

  it("returns 404 for an invalid guest access code", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as any);

    const response = await request(app).get("/api/guest/not-a-real-code/events");

    expect(response.status).toBe(404);
  });
});