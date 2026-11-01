import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), fetch: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { connect: async () => ({ query: fixture.query, release: fixture.release }), query: fixture.query } }));
vi.mock("../lib/logger.js", () => ({ logger: { warn: vi.fn() } }));
import { bridgePlan, assertRemoteUnchanged, dispatchPosterOrder } from "../lib/poster-order-bridge.js";

const config = { enabled: true, spotId: 1, tabletId: 2, waiterId: 3, tableMap: { "10": 20 }, productMap: { "100": 200 } };
const item = { item_id: 100, name: "Soup", price: "50.00", quantity: 2, status: "pending" };
let order: any;
let items: any[];
let writes: string[];
let loseCreateResponse: boolean;
let remotelyEdited: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  order = { id: 5, table_id: 10, status: "open", paid_amount: 0, guest_count: 2, poster_sync: null };
  items = [{ ...item }]; writes = []; loseCreateResponse = false; remotelyEdited = false;
  fixture.query.mockImplementation(async (q: string, values: any[] = []) => {
    if (q.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
    if (q.includes("pg_advisory_unlock")) return { rows: [{}] };
    if (q.startsWith("SELECT enabled_modules")) return { rows: [{ enabled_modules: { posterConfig: { apiKey: "fake-provider-token", orderBridge: config } } }] };
    if (q.startsWith("SELECT * FROM fb_orders")) return { rows: [{ ...order }] };
    if (q.startsWith("SELECT * FROM fb_order_items")) return { rows: items };
    if (q.startsWith("UPDATE fb_orders SET poster_sync")) {
      order.poster_sync = JSON.parse(values[2]); return { rows: [{ id: 5 }] };
    }
    throw new Error("Unexpected test query");
  });
  fixture.fetch.mockImplementation(async (url: URL, opts: RequestInit) => {
    const method = url.pathname.replace("/api/", "");
    let response: any;
    if (opts.method === "POST") {
      writes.push(method);
      if (method === "transactions.createTransaction") {
        if (loseCreateResponse) throw new Error("Network lost after accepting request");
        response = { transaction_id: 500 };
      } else if (method === "transactions.addTransactionProduct") response = { transaction_product: 111 };
      else response = { err_code: 0 };
    } else if (method === "menu.getProducts") response = [{ product_id: 200, price: { "1": "5000" } }];
    else if (method === "dash.getTransaction") response = [{
      transaction_id: 500, spot_id: 1, table_id: 20, status: 1,
      transaction_comment: order.poster_sync.comment,
      products: Object.entries(order.poster_sync.quantities || {}).map(([id, n]) =>
        ({ product_id: id, modification_id: 0, product_price: "5000", num: remotelyEdited ? 8 : n })),
    }];
    else throw new Error("Unexpected test request");
    return new Response(JSON.stringify({ response }));
  });
  vi.stubGlobal("fetch", fixture.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("Poster open-order dispatch", () => {
  it("creates one remote bill and subsequent waiter/QR additions use the same bill", async () => {
    expect(await dispatchPosterOrder(39, 5)).toMatchObject({ status: "synced", remoteOrderId: 500, quantities: { "200": 2 } });
    expect(writes).toEqual(["transactions.createTransaction", "transactions.changeComment", "transactions.addTransactionProduct", "transactions.changeTransactionProductCount"]);
    writes = [];
    items[0].quantity = 3;
    expect(await dispatchPosterOrder(39, 5)).toMatchObject({ status: "synced", remoteOrderId: 500, quantities: { "200": 3 } });
    expect(writes).toEqual(["transactions.changeTransactionProductCount"]);
    writes = [];
    await dispatchPosterOrder(39, 5);
    expect(writes).toEqual([]);
  });
  it("durably holds an uncertain create and never creates a duplicate on retry", async () => {
    loseCreateResponse = true;
    expect(await dispatchPosterOrder(39, 5)).toMatchObject({ status: "review", pending: { method: "transactions.createTransaction" } });
    loseCreateResponse = false;
    await dispatchPosterOrder(39, 5);
    expect(writes.filter(x => x === "transactions.createTransaction")).toHaveLength(1);
    expect(order.poster_sync.status).toBe("review");
  });
  it("does not overwrite changes made on the register", async () => {
    await dispatchPosterOrder(39, 5); writes = [];
    remotelyEdited = true; items[0].quantity = 4;
    expect(await dispatchPosterOrder(39, 5)).toMatchObject({ status: "blocked" });
    expect(writes).toEqual([]);
  });
  it("refuses cancellations/decreases after export rather than silently dropping dishes", async () => {
    await dispatchPosterOrder(39, 5); writes = [];
    items[0].status = "cancelled";
    // An all-empty cancelled cart is not exported; non-empty decreases are blocked.
    items.push({ ...item, quantity: 1 });
    expect(await dispatchPosterOrder(39, 5)).toMatchObject({ status: "blocked" });
    expect(writes).toEqual([]);
  });
  it("blocks unmapped products before creating a bill", async () => {
    items[0].item_id = 999;
    expect(await dispatchPosterOrder(39, 5)).toMatchObject({ status: "blocked" });
    expect(writes).toEqual([]);
  });
  it("blocks price divergence before creating a bill", async () => {
    items[0].price = "70";
    expect(await dispatchPosterOrder(39, 5)).toMatchObject({ status: "blocked" });
    expect(writes).toEqual([]);
  });
  it("does not close or fiscalize any bill", async () => {
    await dispatchPosterOrder(39, 5);
    expect(writes.some(m => /close|fiscal|pay|print/i.test(m))).toBe(false);
  });
});

describe("Poster mapping preflight", () => {
  it("requires explicit table mappings, even if numbers happen to match", () => {
    expect(() => bridgePlan(order, [item], { ...config, tableMap: {} })).toThrow();
  });
  it("never strips guest modifiers to send an incorrect dish", () => {
    expect(() => bridgePlan(order, [{ ...item, modifiers: [{ optionId: 10 }] }], config)).toThrow(/модифікаторами/);
  });
  it("groups repeated lines for the same mapped Poster product", () => {
    expect(bridgePlan(order, [item, { ...item, quantity: 1 }], config).quantities).toEqual({ "200": 3 });
  });
  it("rejects a closed or wrong-location remote bill", () => {
    expect(() => assertRemoteUnchanged({ transaction_id: 500, spot_id: 99, table_id: 20, status: 1, products: [] },
      { status: "synced", remoteOrderId: 500, tableId: 20 }, config)).toThrow();
    expect(() => assertRemoteUnchanged({ transaction_id: 500, spot_id: 1, table_id: 20, status: 2, products: [] },
      { status: "synced", remoteOrderId: 500, tableId: 20 }, config)).toThrow(/закрито/);
  });
});
