import { test } from "node:test";
import assert from "node:assert/strict";
import { requestPosterPos, readPosterPairingCode } from "./poster-pos-request";

test("passes the exact request and its cancellation signal through", async () => {
  const result = await requestPosterPos(async (path, opts) => {
    assert.equal(path, "/poster/pos-notifications");
    assert.equal(opts?.method, "PUT");
    assert.equal(opts?.body, '{"enabled":true,"spotId":1,"tabletId":2}');
    assert.ok(opts?.signal instanceof AbortSignal);
    return { enabled: true };
  }, { method: "PUT", body: '{"enabled":true,"spotId":1,"tabletId":2}' });
  assert.deepEqual(result, { enabled: true });
});

test("a stalled read times out even when the caller ignores cancellation", async () => {
  let signal: AbortSignal | null | undefined;
  await assert.rejects(requestPosterPos(async (_path, opts) => {
    signal = opts?.signal;
    return new Promise(() => {});
  }, {}, 5), /Оновити стан каси/);
  assert.equal(signal?.aborted, true);
});

test("a stalled write reports an unknown outcome without retrying the mutation", async () => {
  let calls = 0;
  await assert.rejects(requestPosterPos(async () => {
    calls++;
    return new Promise(() => {});
  }, { method: "PUT" }, 5), /Результат зміни невідомий/);
  assert.equal(calls, 1);
});

test("preserves the actual server refusal", async () => {
  await assert.rejects(requestPosterPos(async () => {
    throw new Error("Вибрана каса не належить цьому закладу Poster.");
  }), /Вибрана каса не належить/);
});

test("requires a full pairing code before reporting successful creation", () => {
  const code = `1.${"a".repeat(64)}`;
  assert.equal(readPosterPairingCode({ pairingCode: code }), code);
  for (const pairingCode of [undefined, null, "", "1", "masked", `1.${"a".repeat(63)}`]) {
    assert.throws(() => readPosterPairingCode({ pairingCode }), /не повернув повний код/);
  }
});
