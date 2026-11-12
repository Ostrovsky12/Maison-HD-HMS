import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./terminal.js", import.meta.url), "utf8");
const token = `1.${"a".repeat(64)}`;
const key = "maison-pos-v1:fixture-account:1:2";
const notice = { id: 10, orderId: 100, point: "Будинки · №1", total: 300, delivered: false };
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
function harness({ storage = new Map([[key, token]]), failShow = false, failAck = false, unauthorized = false } = {}) {
  const requests = [], displays = [], timers = [], intervals = [];
  const element = () => ({ children: [], append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; }, replaceChildren(...children) { this.children = children; },
    setAttribute() {} });
  const root = element(), document = { getElementById: () => root, createElement: element, body: element(), head: element() };
  const sdk = {
    settings: { accountUrl: "fixture-account", spotId: 1, spotTabletId: 2 },
    interface: { showApplicationIconAt() {}, popup() {}, async showNotification(data) {
      displays.push(data); if (failShow) throw new Error("Display rejected"); return { id: 345 };
    } },
    on() {},
    makeRequest(url, options, callback) {
      requests.push({ url, data: options.data });
      if (unauthorized) { callback({ code: 403, result: JSON.stringify({ error: "Revoked" }) }); return; }
      if (url.endsWith("/poll")) callback({ code: 200, result: JSON.stringify({ notifications: [notice] }) });
      else if (url.endsWith("/ack")) callback({ code: failAck ? 503 : 200, result: JSON.stringify(failAck ? { error: "Offline" } : { ok: true }) });
    },
  };
  const context = vm.createContext({
    window: { Poster: sdk }, document,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, v) => storage.set(key, v), removeItem: key => storage.delete(key) },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    setInterval: fn => { intervals.push(fn); return intervals.length; },
  });
  vm.runInContext(source.replace("__MAISON_POS_ORIGIN__", "https://app.example"), context);
  return { requests, displays, root, interval: () => intervals[0](), storage };
}
test("shows native notification, acknowledges display, and never invokes payment or order creation", async () => {
  const h = harness(); await flush();
  assert.equal(h.displays.length, 1);
  assert.match(h.displays[0].message, /300\.00 ₴/);
  assert.match(h.displays[0].message, /Це не оплата/);
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[1].data)), {
    account: "fixture-account", spotId: 1, tabletId: 2, token, id: 10, posterNotificationId: 345,
  });
  assert.ok(h.requests.every(r => /\/(poll|ack)$/.test(r.url)));
  h.interval(); await flush();
  assert.equal(h.displays.length, 1);
});
test("does not claim display when the Poster SDK rejects it", async () => {
  const h = harness({ failShow: true }); await flush();
  assert.equal(h.displays.length, 1);
  assert.equal(h.requests.filter(r => r.url.endsWith("/ack")).length, 0);
});
test("retries acknowledgement without duplicating a native notification, including after reload", async () => {
  const storage = new Map([[key, token]]);
  const h = harness({ storage, failAck: true }); await flush();
  h.interval(); await flush();
  assert.equal(h.displays.length, 1);
  assert.equal(h.requests.filter(r => r.url.endsWith("/ack")).length, 2);
  const afterReload = harness({ storage }); await flush();
  assert.equal(afterReload.displays.length, 0);
  assert.equal(afterReload.requests.filter(r => r.url.endsWith("/ack")).length, 1);
});
test("revoked access drops the terminal credential and stops polling", async () => {
  const h = harness({ unauthorized: true }); await flush();
  assert.equal(h.storage.has(key), false);
  h.interval(); await flush();
  assert.equal(h.requests.length, 1);
});
test("an unpaired register never fetches another register's inbox", async () => {
  const h = harness({ storage: new Map([["maison-pos-v1:other-account:1:2", token]]) }); await flush();
  assert.equal(h.requests.length, 0);
});
