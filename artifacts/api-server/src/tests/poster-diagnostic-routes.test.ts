import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { GetPosterOrderBridgeOrderResponse } from "@workspace/api-zod";

const fixture = vi.hoisted(() => ({ query: vi.fn(), account: vi.fn(), dispatch: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: fixture.query } }));
vi.mock("../lib/poster-order-bridge.js", () => ({
  bridgeAccount: fixture.account, dispatchPosterOrder: fixture.dispatch, bridgeCall: vi.fn(),
}));
import router from "../routes/poster-order-bridge.js";

const secret = "never-expose-this-provider-token";
const state = {
  status: "blocked", message: "Poster відхилив запит.", accountBinding: secret,
  pending: { params: { token: secret } },
  diagnostic: { operation: "transactions.createTransaction", outcome: "rejected", providerCode: 20,
    httpStatus: 200, recommendation: secret, rawBody: secret, token: secret },
};
async function request(path: string, method = "GET") {
  const app = express();
  app.use((req: any, _res, next) => { req.user = { organizationId: 1, role: "manager" }; next(); });
  app.use("/poster", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/poster${path}`, { method });
    return { status: response.status, body: await response.json() as Record<string, any> };
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.query.mockResolvedValue({ rows: [{ id: 49, state }] });
  fixture.account.mockResolvedValue({ config: { enabled: false } });
  fixture.dispatch.mockResolvedValue(state);
});
describe("Tenant-scoped, read-only Poster diagnostic projection", () => {
  it("shows a safe persisted failure with forwarding disabled, without dispatching", async () => {
    const { status, body } = await request("/orders/49");
    expect(status).toBe(200);
    expect(body).toMatchObject({ enabled: false, state: { status: "blocked", diagnostic: { providerCode: 20 } } });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(body.state.pending).toBeUndefined();
    expect(body.state.accountBinding).toBeUndefined();
    expect(GetPosterOrderBridgeOrderResponse.safeParse(body).success).toBe(true);
    expect(fixture.dispatch).not.toHaveBeenCalled();
    expect(fixture.query).toHaveBeenCalledWith(expect.stringContaining("organization_id=$2"), [49, 1]);
  });
  it("does not leak diagnostics from an order outside the authenticated tenant", async () => {
    fixture.query.mockResolvedValue({ rows: [] });
    expect((await request("/orders/49")).status).toBe(404);
    expect(fixture.account).not.toHaveBeenCalled();
    expect(fixture.dispatch).not.toHaveBeenCalled();
  });
  it("does not dispatch when forwarding is disabled", async () => {
    expect((await request("/orders/49/send", "POST")).status).toBe(409);
    expect(fixture.dispatch).not.toHaveBeenCalled();
  });
  it("applies the same redaction to explicit dispatch responses", async () => {
    fixture.account.mockResolvedValue({ config: { enabled: true } });
    const { status, body } = await request("/orders/49/send", "POST");
    expect(status).toBe(200);
    expect(body.state.diagnostic.providerCode).toBe(20);
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(fixture.dispatch).toHaveBeenCalledWith(1, 49);
  });
});
