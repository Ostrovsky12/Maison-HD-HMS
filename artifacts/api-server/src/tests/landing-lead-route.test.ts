import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { insert, values, returning, notify } = vi.hoisted(() => ({
  insert: vi.fn(), values: vi.fn(), returning: vi.fn(), notify: vi.fn(),
}));
vi.mock("@workspace/db", () => ({ db: { insert } }));
vi.mock("@workspace/db/schema", () => ({ demoRequestsTable: {} }));
vi.mock("../lib/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/lead-notifications.js", () => ({ notifyLandingLead: notify }));
import router from "../routes/demo-requests.js";

const app = express();
app.use(express.json());
app.use("/leads", router);
const input = { name: "Тест", email: "visitor@example.com", company: "Тестова компанія", message: "Аудит" };

beforeEach(() => {
  vi.resetAllMocks();
  insert.mockReturnValue({ values });
  values.mockReturnValue({ returning });
  returning.mockResolvedValue([{ ...input, id: 101 }]);
  notify.mockResolvedValue(undefined);
});

describe("landing lead acceptance", () => {
  it("saves the lead before notification and retains the original success contract", async () => {
    notify.mockImplementation(async (lead) => {
      expect(returning).toHaveBeenCalled();
      expect(lead).toMatchObject({ id: 101, email: input.email });
    });
    const response = await request(app).post("/leads").send(input);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, id: 101 });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("does not reject an already saved lead when notifications fail", async () => {
    notify.mockRejectedValue(new Error("provider unavailable"));
    const response = await request(app).post("/leads").send(input);
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(returning).toHaveBeenCalledTimes(1);
  });

  it("does not send notifications when persistence fails", async () => {
    returning.mockRejectedValue(new Error("database unavailable"));
    expect((await request(app).post("/leads").send(input)).status).toBe(500);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each([
    { email: "wrong" },
    { name: { value: "wrong type" } },
    { email: "a@b.com\r\nBcc: someone@example.com" },
    { message: "x".repeat(10_001) },
  ])("rejects malformed fields without persistence or mail: %j", async (invalid) => {
    expect((await request(app).post("/leads").send({ ...input, ...invalid })).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
