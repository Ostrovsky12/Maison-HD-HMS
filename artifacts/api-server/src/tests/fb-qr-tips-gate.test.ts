import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import router from "../routes/fb-guest.js";

const app = express();
app.use(express.json());
app.use("/api/fb", router);
describe("QR tip payout readiness", () => {
  it.each([10, 15, 20])("never charges %s%% tips without verified card payouts", async tipPct => {
    vi.mocked(pool.query).mockClear();
    const result = await request(app).post("/api/fb/public/liqpay-checkout")
      .send({ tableId: 11, expectedOrderId: 10, expectedTotal: 300, tipPct });
    expect(result.status).toBe(422);
    expect(result.body.url).toBeUndefined();
    expect(pool.query).not.toHaveBeenCalled();
  });
  it("rejects an unsupported percentage", async () => {
    expect((await request(app).post("/api/fb/public/liqpay-checkout")
      .send({ tableId: 11, tipPct: -10 })).status).toBe(400);
  });
  it("enforces checkout readiness on the server even if a guest bypasses the disabled button", async () => {
    const result = await request(app).post("/api/fb/public/liqpay-checkout")
      .send({ tableId: 11, expectedOrderId: 10, expectedTotal: 300, tipPct: 0 });
    expect(result.status).toBe(503);
    expect(result.body.url).toBeUndefined();
  });
  it("does not acknowledge successful callbacks before a failed durable write can be retried", async () => {
    vi.mocked(pool.connect).mockRejectedValueOnce(new Error("Temporary database failure"));
    const data = Buffer.from(JSON.stringify({ public_key: "fixture", order_id: "fb-10-123",
      payment_id: 101, currency: "UAH", amount: 300, status: "success" })).toString("base64");
    expect((await request(app).post("/api/fb/public/liqpay-callback").send({ data, signature: "fixture" })).status).toBe(503);
  });
});
