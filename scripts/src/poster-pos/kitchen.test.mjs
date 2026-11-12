import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(new URL("./kitchen.js", import.meta.url), "utf8");
const job = { orderId: 1, remoteOrderId: 123, tableId: 8, revision: "a".repeat(64),
  quantities: { "10": 2 }, prices: { "10": 20 } };
const active = { id: 1794495120000, orderName: 123, tableId: 8, status: 1, products: { "0": { id: 10, count: 2, price: 20, printedNum: 0 } } };
const attemptId = "b".repeat(64);
function harness(options = {}) {
  const calls = [], requests = [], notices = [], storage = options.storage || new Map();
  let sdkCalls = 0;
  const sdk = {
    environment: options.web ? {} : { desktop: true },
    orders: {
      async getActive() {
        sdkCalls++;
        return { order: structuredClone(sdkCalls > 1 && options.afterClaim ? options.afterClaim : options.order || active) };
      },
      async sendToKitchen(id) {
        calls.push(id);
        if (options.sdkFailure) throw new Error("Printer uncertain");
        return { success: options.sdkFalse ? false : true };
      },
    },
    interface: { async showNotification(n) { notices.push(n); return { id: 1 }; } },
  };
  const request = async (path, data) => {
    requests.push({ path, data });
    if (path === "kitchen/poll") return { enabled: options.enabled !== false, jobs: options.jobs || [job] };
    if (path === "kitchen/claim") {
      if (options.claimFailure) throw new Error("Already claimed");
      return { attemptId };
    }
    if (path === "kitchen/result") {
      if (options.reportFailure) throw new Error("Offline");
      return { ok: true };
    }
    throw new Error("Unexpected request");
  };
  const context = vm.createContext({ setTimeout, clearTimeout,
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => { if (options.storageFailure) throw new Error("Quota"); storage.set(key, value); },
    },
  });
  vm.runInContext(source, context);
  const kitchen = context.createMaisonKitchen(sdk, request, { account: "fixture", spotId: 1, tabletId: 2 }, "fixture-session");
  return { kitchen, calls, requests, notices, storage };
}
test("uses the matched terminal millisecond ID, never the server receipt number", async () => {
  const h = harness(); await h.kitchen.poll("token");
  assert.deepEqual(h.calls, [active.id]);
  assert.ok(h.requests.some(r => r.path === "kitchen/result" && r.data.outcome === "submitted"));
  assert.match(h.kitchen.message, /Фізичний друк/);
});
test("does not enable physical kitchen commands in the web cashier", async () => {
  const h = harness({ web: true }); await h.kitchen.poll("token");
  assert.equal(h.calls.length, 0); assert.equal(h.requests.length, 0);
  assert.match(h.kitchen.message, /Вебкаса/);
});
for (const [name, order] of Object.entries({
  otherBill: { ...active, orderName: 124 },
  otherTable: { ...active, tableId: 9 },
  closed: { ...active, status: 2 },
  serverId: { ...active, id: 123 },
  paid: { ...active, payedSum: 1 },
  card: { ...active, payedCard: 1 },
  discounted: { ...active, discount: 1 },
  changedQuantity: { ...active, products: { "0": { id: 10, count: 3, price: 20, printedNum: 0 } } },
  changedPrice: { ...active, products: { "0": { id: 10, count: 2, price: 21, printedNum: 0 } } },
  modifiers: { ...active, products: { "0": { id: 10, count: 2, price: 20, printedNum: 0, modification: 5 } } },
  extraDish: { ...active, products: { ...active.products, "1": { id: 11, count: 1, price: 10, printedNum: 0 } } },
})) {
  test(`never claims or prints a mismatched active order: ${name}`, async () => {
    const h = harness({ order }); await h.kitchen.poll("token");
    assert.equal(h.calls.length, 0);
    assert.equal(h.requests.filter(r => r.path === "kitchen/claim").length, 0);
  });
}
test("reports already sent quantities without a second SDK command", async () => {
  const h = harness({ order: { ...active, products: { "0": { ...active.products["0"], printedNum: 2 } } } });
  await h.kitchen.poll("token");
  assert.equal(h.calls.length, 0);
  assert.ok(h.requests.some(r => r.path === "kitchen/result" && r.data.outcome === "already_sent"));
});
test("never prints when the durable server claim is rejected", async () => {
  const h = harness({ claimFailure: true }); await h.kitchen.poll("token");
  assert.equal(h.calls.length, 0);
});
test("rechecks the active bill after receiving the claim", async () => {
  const h = harness({ afterClaim: { ...active, orderName: 999 } }); await h.kitchen.poll("token");
  assert.equal(h.calls.length, 0);
  assert.ok(h.requests.some(r => r.path === "kitchen/result" && r.data.outcome === "review"));
});
for (const failure of ["sdkFailure", "sdkFalse"]) {
  test(`records ${failure} as uncertain, not printed`, async () => {
    const h = harness({ [failure]: true }); await h.kitchen.poll("token");
    assert.equal(h.calls.length, 1);
    assert.ok(h.requests.some(r => r.path === "kitchen/result" && r.data.outcome === "review"));
  });
}
test("retries only the stored result after reload, never the physical command", async () => {
  const h = harness({ reportFailure: true }); await h.kitchen.poll("token");
  assert.equal(h.calls.length, 1);
  // The server removes claimed work from the queue, including on every later poll.
  const afterReload = harness({ storage: h.storage, jobs: [] });
  await afterReload.kitchen.poll("token");
  assert.equal(afterReload.calls.length, 0);
  assert.equal(afterReload.requests[0].path, "kitchen/result");
  assert.equal(afterReload.requests[0].data.outcome, "submitted");
});
test("a crash uncertainty marker reports review on reload without a print", async () => {
  const storage = new Map([["fixture-session:kitchen-results", JSON.stringify([{ orderId: 1, attemptId, outcome: "review" }])]]);
  const h = harness({ storage, jobs: [] }); await h.kitchen.poll("token");
  assert.equal(h.calls.length, 0);
  assert.equal(h.requests[0].data.outcome, "review");
});
test("does not print without a writable local uncertainty journal", async () => {
  const h = harness({ storageFailure: true }); await h.kitchen.poll("token");
  assert.equal(h.calls.length, 0);
  await h.kitchen.poll("token"); assert.equal(h.calls.length, 0);
});
test("disabled printing never claims a task", async () => {
  const h = harness({ enabled: false }); await h.kitchen.poll("token");
  assert.equal(h.requests.length, 1); assert.equal(h.calls.length, 0);
});
