import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: fixture.query,
  connect: async () => ({ query: fixture.query, release: fixture.release }) } }));
import { digestPosToken } from "../lib/poster-pos-notifications.js";
import { kitchenJob, kitchenRevision, kitchenTerminalReady, visibleKitchen, pollKitchen, claimKitchen, recordKitchen } from "../lib/poster-kitchen.js";
import { dispatchPosterOrder } from "../lib/poster-order-bridge.js";

const context = { account: "hotel", spotId: 1, tabletId: 2 };
const token = `39.${"a".repeat(64)}`;
let account: any, order: any, items: any[], locked: boolean, saveAllowed: boolean;
const call = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); locked = true; saveAllowed = true;
  account = { apiKey: "fixture-key", verified: true, accountId: "hotel",
    orderBridge: { enabled: true, kitchenEnabled: true, spotId: 1, tabletId: 2, waiterId: 3,
      activatedAt: "2026-11-01T00:00:00Z", kitchenActivatedAt: "2026-11-12T10:00:00Z",
      tableMap: { "10": 7 }, productMap: { "20": 200 } },
    posNotifications: { enabled: true, account: "hotel", spotId: 1, tabletId: 2, channelId: "channel",
      tokenHash: digestPosToken(token), kitchenReadyAt: new Date().toISOString() } };
  order = { id: 5, organization_id: 39, table_id: 10, opened_at: "2026-11-12T12:00:00Z",
    status: "open", paid_amount: 0, poster_sync: { status: "synced", remoteOrderId: 500,
      tableId: 7, spotId: 1, tabletId: 2, accountBinding: digestPosToken(account.apiKey),
      quantities: { "200": 2 }, prices: { "200": 20 }, comment: "Maison HD #5" } };
  items = [{ id: 1, item_id: 20, quantity: 2, price: 20, status: "new", sent_at: "2026-11-12T12:01:00Z" }];
  call.mockResolvedValue([{ transaction_id: 500, status: 1, spot_id: 1, table_id: 7,
    transaction_comment: "Maison HD #5", products: [{ product_id: 200, num: 2, product_price: 2000 }] }]);
  fixture.query.mockImplementation(async (sql: string, params: any[]) => {
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked }] };
    if (sql.includes("pg_advisory_unlock")) return { rows: [] };
    if (sql.includes(" AS poster")) return { rows: [{ poster: account }] };
    if (sql.includes("SELECT enabled_modules")) return { rows: [{ enabled_modules: { posterConfig: account } }] };
    if (sql.includes("SELECT * FROM fb_orders")) return { rows: [structuredClone(order)] };
    if (sql.includes("SELECT * FROM fb_order_items")) return { rows: items };
    if (sql.includes("UPDATE fb_orders o")) {
      if (!saveAllowed || order.poster_sync.kitchen) return { rows: [] };
      order.poster_sync.kitchen = JSON.parse(params[2]);
      return { rows: [{ id: 5 }] };
    }
    if (sql.includes("UPDATE fb_orders SET poster_sync=jsonb_set")) {
      const k = order.poster_sync.kitchen;
      if (!k || k.attemptId !== params[2] || k.channelId !== params[4] || !["claimed", params[5]].includes(k.status)) return { rows: [] };
      Object.assign(k, JSON.parse(params[3])); return { rows: [{ id: 5 }] };
    }
    if (sql.includes("UPDATE organizations")) return { rows: [{ id: 39 }] };
    throw new Error(`Unexpected query: ${sql}`);
  });
});
const claim = () => claimKitchen(context, token, {
  orderId: 5, revision: kitchenRevision(order.poster_sync), terminalOrderId: 1794495120000,
}, undefined, call);
describe("tenant-bound, opt-in kitchen command journal", () => {
  it("offers only a new, synced, unpaid bill and exposes no private journal values", async () => {
    const inbox = await pollKitchen(context, token);
    expect(inbox.jobs).toHaveLength(1);
    expect(inbox.jobs[0]).toMatchObject({ orderId: 5, remoteOrderId: 500, tableId: 7, quantities: { "200": 2 } });
    expect(JSON.stringify(inbox)).not.toContain(account.apiKey);
    expect(JSON.stringify(inbox)).not.toContain(order.poster_sync.accountBinding);
    expect(fixture.query.mock.calls.find(([sql]) => sql.includes("SELECT * FROM fb_orders"))?.[1]).toEqual([39, account.orderBridge.kitchenActivatedAt]);
  });
  it("requires a current ready heartbeat on the correct paired terminal", () => {
    expect(kitchenTerminalReady(account, account.orderBridge)).toBe(true);
    account.posNotifications.tabletId = 9;
    expect(kitchenTerminalReady(account, account.orderBridge)).toBe(false);
    account.posNotifications.tabletId = 2;
    account.posNotifications.kitchenReadyAt = new Date(Date.now() - 46000).toISOString();
    expect(kitchenTerminalReady(account, account.orderBridge)).toBe(false);
  });
  for (const [label, change] of [
    ["disabled", () => { account.orderBridge.kitchenEnabled = false; }],
    ["old", () => { order.opened_at = "2026-11-01T00:00:00Z"; }],
    ["paid", () => { order.paid_amount = 1; }],
    ["closed", () => { order.status = "billed"; }],
    ["pending", () => { order.poster_sync.pending = {}; }],
    ["unsynced", () => { order.poster_sync.status = "pending"; }],
    ["changed account", () => { account.apiKey = "other-key"; }],
    ["changed table", () => { account.orderBridge.tableMap["10"] = 8; }],
    ["changed register", () => { account.orderBridge.tabletId = 3; }],
  ] as const) {
    it(`does not offer ${label} work`, () => {
      change(); expect(kitchenJob(order, account, account.orderBridge)).toBeNull();
    });
  }
  it("rejects another account or terminal before reading the bill", async () => {
    await expect(pollKitchen({ ...context, account: "other" }, token)).rejects.toMatchObject({ status: 403 });
    expect(fixture.query.mock.calls.some(([sql]) => sql.includes("FROM fb_orders"))).toBe(false);
  });
  it("journals one attempt before granting permission and never grants it again", async () => {
    const permit = await claim();
    expect(permit.attemptId).toMatch(/^[a-f0-9]{64}$/);
    expect(order.poster_sync.kitchen).toMatchObject({ status: "claimed", attemptId: permit.attemptId, terminalOrderId: 1794495120000 });
    await expect(claim()).rejects.toMatchObject({ status: 409 });
    expect(call).toHaveBeenCalledTimes(1);
    expect(fixture.release).toHaveBeenCalledTimes(2);
  });
  it("does not grant permission while the same order is being dispatched", async () => {
    locked = false; await expect(claim()).rejects.toMatchObject({ status: 409 });
    expect(call).not.toHaveBeenCalled(); expect(order.poster_sync.kitchen).toBeUndefined();
  });
  it("rejects a stale revision before a remote read", async () => {
    await expect(claimKitchen(context, token, { orderId: 5, revision: "0".repeat(64), terminalOrderId: 1794495120000 }, undefined, call))
      .rejects.toMatchObject({ status: 409 });
    expect(call).not.toHaveBeenCalled();
  });
  it("does not claim released additions not yet synchronized to Poster", async () => {
    items[0].quantity = 3; await expect(claim()).rejects.toMatchObject({ status: 409 });
    expect(call).not.toHaveBeenCalled();
  });
  it("does not claim a bill changed by the cashier", async () => {
    call.mockResolvedValueOnce([{ transaction_id: 500, status: 1, spot_id: 1, table_id: 7, products: [] }]);
    await expect(claim()).rejects.toThrow();
    expect(order.poster_sync.kitchen).toBeUndefined();
  });
  it("does not grant an attempt when configuration was revoked during the provider read", async () => {
    saveAllowed = false; await expect(claim()).rejects.toMatchObject({ status: 409 });
  });
  it("blocks additions during a claimed or uncertain physical command", async () => {
    await claim();
    expect((await dispatchPosterOrder(39, 5)).message).toMatch(/призупинено/);
    order.poster_sync.kitchen.status = "review";
    expect((await dispatchPosterOrder(39, 5)).message).toMatch(/призупинено/);
  });
  it("records only a matching attempt and reports submitted without claiming physical printing", async () => {
    const { attemptId } = await claim();
    await expect(recordKitchen(context, token, { orderId: 5, attemptId: "0".repeat(64), outcome: "submitted" })).rejects.toMatchObject({ status: 409 });
    expect(await recordKitchen(context, token, { orderId: 5, attemptId, outcome: "submitted" })).toEqual({ ok: true });
    expect(await recordKitchen(context, token, { orderId: 5, attemptId, outcome: "submitted" })).toEqual({ ok: true });
    expect(kitchenJob(order, account, account.orderBridge)).toBeNull();
    expect(visibleKitchen(order, account, account.orderBridge)).toEqual({ status: "submitted", updatedAt: expect.any(String) });
    expect(JSON.stringify(visibleKitchen(order, account, account.orderBridge))).not.toContain(attemptId);
  });
  it("accepts the last result after disabling printing and never overwrites it with another outcome", async () => {
    const { attemptId } = await claim(); account.orderBridge.kitchenEnabled = false;
    expect(await recordKitchen(context, token, { orderId: 5, attemptId, outcome: "review" })).toEqual({ ok: true });
    await expect(recordKitchen(context, token, { orderId: 5, attemptId, outcome: "submitted" })).rejects.toMatchObject({ status: 409 });
  });
  it("does not let a re-paired channel report an earlier attempt", async () => {
    const { attemptId } = await claim(); account.posNotifications.channelId = "new-channel";
    await expect(recordKitchen(context, token, { orderId: 5, attemptId, outcome: "submitted" })).rejects.toMatchObject({ status: 409 });
  });
  it("allows a new synchronized addition only after a resolved preceding command", async () => {
    const { attemptId } = await claim();
    order.poster_sync.quantities["200"] = 3;
    expect(kitchenJob(order, account, account.orderBridge)).toBeNull();
    await recordKitchen(context, token, { orderId: 5, attemptId, outcome: "submitted" });
    expect(kitchenJob(order, account, account.orderBridge)).not.toBeNull();
  });
});
