import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), pair: vi.fn(), poll: vi.fn(), ack: vi.fn() }));
vi.mock("../lib/poster-pos-notifications.js", () => ({
  verifyPosSignature: mocks.verify, authenticatePos: mocks.pair, pollPos: mocks.poll, acknowledgePos: mocks.ack,
  PosterPosError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
import router from "../routes/poster-pos.js";
import { PosterPosError } from "../lib/poster-pos-notifications.js";
const app = express(); app.use(express.json()); app.use("/api/poster-pos", router);
const session = { account: "hotel", spotId: 1, tabletId: 2, token: `1.${"a".repeat(64)}` };
beforeEach(() => {
  vi.clearAllMocks(); mocks.verify.mockImplementation(() => {});
  mocks.poll.mockResolvedValue({ notifications: [] }); mocks.ack.mockResolvedValue({ ok: true });
});
describe("signed Poster terminal endpoints", () => {
  it("rejects unsigned requests before accessing the inbox", async () => {
    mocks.verify.mockImplementation(() => { throw new PosterPosError(403, "Invalid signature"); });
    expect((await request(app).post("/api/poster-pos/poll").send(session)).status).toBe(403);
    expect(mocks.poll).not.toHaveBeenCalled();
  });
  it("validates input and returns only the notification contract with no cache", async () => {
    expect((await request(app).post("/api/poster-pos/poll").send({})).status).toBe(400);
    const result = await request(app).post("/api/poster-pos/poll").send(session);
    expect(result.status).toBe(200); expect(result.body).toEqual({ notifications: [] });
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(mocks.poll).toHaveBeenCalledWith(session, session.token);
  });
  it("never acknowledges a payment, only an identified native notification display", async () => {
    expect((await request(app).post("/api/poster-pos/ack").send(session)).status).toBe(400);
    const result = await request(app).post("/api/poster-pos/ack").send({ ...session, id: 10, posterNotificationId: 20 });
    expect(result.body).toEqual({ ok: true });
    expect(mocks.ack).toHaveBeenCalledWith(expect.objectContaining({ account: "hotel" }), session.token, 10, 20);
  });
  it("does not return a success response after durable storage fails", async () => {
    mocks.poll.mockRejectedValue(new Error("DB failure"));
    expect((await request(app).post("/api/poster-pos/poll").send(session)).status).toBe(503);
  });
});
