import { afterEach, describe, expect, it, vi } from "vitest";
import { bridgeCall } from "../lib/poster-order-bridge.js";
import { posterDiagnostic, visiblePosterDiagnostic } from "../lib/poster-diagnostics.js";
import { GetPosterOrderBridgeOrderResponse } from "@workspace/api-zod";

vi.mock("@workspace/db", () => ({ pool: {} }));
vi.mock("../lib/logger.js", () => ({ logger: { warn: vi.fn() } }));
const method = "transactions.createTransaction";
const secret = "secret-token-not-for-output";
afterEach(() => vi.unstubAllGlobals());

async function failure(body: unknown, status = 200, write = true) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
  return bridgeCall(secret, method, {}, write).catch(e => e);
}
describe("Safe Poster rejection diagnostics", () => {
  it.each([
    [{ error: { code: 20, message: secret } }, 20],
    [{ error: 11, message: secret }, 11],
    [{ error_code: "54", message: secret }, 54],
    [{ response: { err_code: "153", message: secret } }, 153],
  ])("keeps only the numeric code from a declared provider rejection %#", async (body, code) => {
    const e = await failure(body);
    expect(e.uncertain).toBe(false);
    expect(e.diagnostic).toMatchObject({ operation: method, providerCode: code, httpStatus: 200, outcome: "rejected" });
    expect(JSON.stringify(e)).not.toContain(secret);
    expect(e.message).not.toContain(secret);
  });
  it.each([true, {}, { message: secret }, `https://example.invalid/?token=${secret}`])("does not invent a numeric code from error flags or text %#", async error => {
    const e = await failure({ error });
    expect(e.diagnostic.providerCode).toBeUndefined();
    expect(JSON.stringify(e)).not.toContain(secret);
  });
  it.each([-1, 3.5, 1000000000, `11?token=${secret}`, true, null, ""])("holds malformed response codes as uncertain rather than trusting them %#", async err_code => {
    const e = await failure({ response: { err_code } });
    expect(e.uncertain).toBe(true);
    expect(e.diagnostic.providerCode).toBeUndefined();
    expect(e.diagnostic.outcome).toBe("uncertain");
    expect(JSON.stringify(e)).not.toContain(secret);
  });
  it.each([401, 403, 429, 503])("preserves a write hold on HTTP %i even when a JSON code is available", async http => {
    const e = await failure({ error: { code: 20, message: secret } }, http);
    expect(e.uncertain).toBe(true);
    expect(e.diagnostic).toMatchObject({ outcome: "uncertain", httpStatus: http, providerCode: 20 });
  });
  it("keeps a read rejection separate from an uncertain write", async () => {
    const e = await failure({ error: { code: 20 } }, 403, false);
    expect(e.uncertain).toBe(false);
    expect(e.diagnostic).toMatchObject({ outcome: "unavailable", httpStatus: 403, providerCode: 20 });
  });
  it("does not disclose network exception text or classify a timeout as a definite rejection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(`https://joinposter.com/api/${method}?token=${secret}`); }));
    const e = await bridgeCall(secret, method, {}, true).catch(e => e);
    expect(e.diagnostic).toMatchObject({ operation: method, outcome: "uncertain" });
    expect(e.diagnostic.httpStatus).toBeUndefined();
    expect(JSON.stringify(e)).not.toContain(secret);
  });
  it.each([["<html>no</html>", 200], ["invalid", 503], ["null", 200], ['{"response":null}', 200]])("holds unconfirmed responses safely %#", async (text, status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(text, { status })));
    const e = await bridgeCall(secret, method, {}, true).catch(e => e);
    expect(e.uncertain).toBe(true);
    expect(e.diagnostic).toMatchObject({ operation: method, outcome: "uncertain", httpStatus: status });
  });
  it("drops arbitrary fields and regenerates advice when reading persisted diagnostics", () => {
    const d = visiblePosterDiagnostic({ operation: method, outcome: "rejected", providerCode: 20, httpStatus: 200,
      recommendation: secret, token: secret, rawBody: secret, url: secret });
    expect(d?.recommendation).toContain("не має дозволу");
    expect(JSON.stringify(d)).not.toContain(secret);
    expect(GetPosterOrderBridgeOrderResponse.safeParse({ enabled: false, state: { status: "blocked", diagnostic: d }, printSupported: false }).success).toBe(true);
  });
  it("redacts unknown operation identifiers and malformed persisted codes", () => {
    const d = visiblePosterDiagnostic({ operation: secret, outcome: "rejected", providerCode: secret, httpStatus: secret });
    expect(d?.operation).toBe("unknown");
    expect(JSON.stringify(d)).not.toContain(secret);
    expect(visiblePosterDiagnostic({ outcome: secret })).toBeUndefined();
  });
  it("uses documented advice without guessing an unknown provider code", () => {
    expect(posterDiagnostic(method, "rejected", 200, 11).recommendation).toContain("чинність");
    expect(posterDiagnostic(method, "rejected", 200, 34).recommendation).toContain("параметри");
    expect(posterDiagnostic(method, "rejected", 200, 123456).recommendation).toContain("Причину ще не встановлено");
  });
});
