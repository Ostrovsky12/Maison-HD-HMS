import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", () => ({ pool: {} }));
import { verifyPosSignature, posChannelOnline, authenticatePos, digestPosToken } from "../lib/poster-pos-notifications.js";

describe("Poster terminal notification authentication", () => {
  const now = 1805000000000, secret = "test-application-secret", origin = "https://app.example";
  const path = "/api/poster-pos/poll";
  const body = { account: "hotel", spotId: 1, tabletId: 2, token: `1.${"a".repeat(64)}` };
  function headers(payload = body, endpoint = path, time = String(now / 1000)) {
    return { "x-poster-time": time, "x-poster-signature":
      createHash("md5").update(`${origin}${endpoint}${JSON.stringify(payload)}${time}${secret}`).digest("hex") };
  }
  it("accepts the documented signature with a canonical origin", () => {
    expect(() => verifyPosSignature(path, body, headers(), secret, origin, now)).not.toThrow();
  });
  it.each([
    () => verifyPosSignature(path, { ...body, account: "victim" }, headers(), secret, origin, now),
    () => verifyPosSignature("/api/poster-pos/ack", body, headers(), secret, origin, now),
    () => verifyPosSignature(path, body, headers(body, path, String(now / 1000 - 61)), secret, origin, now),
    () => verifyPosSignature(path, body, { "x-poster-time": String(now / 1000), "x-poster-signature": "forged" }, secret, origin, now),
    () => verifyPosSignature(path, body, headers(), secret, "https://attacker.example", now),
  ])("rejects forged identity, URL, stale timestamp and signature", check => expect(check).toThrow());
  it("fails closed without configured secret or canonical HTTPS origin", () => {
    expect(() => verifyPosSignature(path, body, headers(), "", origin, now)).toThrow();
    expect(() => verifyPosSignature(path, body, headers(), secret, "http://app.example", now)).toThrow();
  });
  it.each([
    [{}, "missing_headers"],
    [{ "x-poster-time": "not-a-time", "x-poster-signature": "a".repeat(32) }, "invalid_time"],
    [{ "x-poster-time": String(now / 1000), "x-poster-signature": "invalid" }, "invalid_signature"],
    [headers(body, path, String(now / 1000 - 61)), "expired_request"],
    [headers(body, path, String(now / 1000 + 61)), "expired_request"],
    [{ ...headers(), "x-poster-signature": "0".repeat(32) }, "signature_mismatch"],
  ])("classifies a rejected signature without exposing request or secret values: %j", (provided, reason) => {
    let rejected: unknown;
    try { verifyPosSignature(path, body, provided, secret, origin, now); } catch (error) { rejected = error; }
    expect(rejected).toMatchObject({ status: 403, signatureFailure: reason });
    const message = (rejected as Error).message;
    expect(message).not.toContain(secret);
    expect(message).not.toContain(body.token);
    expect(message).not.toContain(JSON.stringify(body));
    expect(message).not.toContain("x-poster-signature");
  });
  it("still accepts uppercase signatures and rejects a wrong application secret", () => {
    const signed = headers();
    expect(() => verifyPosSignature(path, body,
      { ...signed, "x-poster-signature": signed["x-poster-signature"].toUpperCase() }, secret, origin, now)).not.toThrow();
    expect(() => verifyPosSignature(path, body, signed, "different-application-secret", origin, now))
      .toThrow("Підпис Poster не збігається");
  });
  it("does not use account headers as tenant authorization", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(authenticatePos(body, body.token, false, database)).rejects.toMatchObject({ status: 403 });
  });
  function pairingDatabase(overrides: Record<string, unknown> = {}) {
    return { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ poster: {
        apiKey: "fixture-merchant-key", verified: true, accountId: "hotel",
        posNotifications: { enabled: true, account: "hotel", spotId: 1, tabletId: 2,
          pairingHash: digestPosToken(body.token), pairingExpiresAt: new Date(Date.now() + 60000).toISOString(),
          channelId: "fixture-channel", ...overrides },
      } }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) };
  }
  it.each([
    [{ account: "another-account" }, /акаунту Poster «hotel».*«another-account»/],
    [{ spotId: 9 }, /закладу Poster ID 1.*закладу ID 9/],
    [{ tabletId: 8 }, /каси Poster ID 2.*каса має ID 8/],
  ])("identifies a pairing context mismatch only after verifying the code: %j", async (context, message) => {
    const database = pairingDatabase();
    await expect(authenticatePos({ ...body, ...context }, body.token, true, database))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(message) });
    expect(database.query).toHaveBeenCalledTimes(1);
  });
  it("does not reveal the expected account or register to an invalid code", async () => {
    const database = pairingDatabase();
    await expect(authenticatePos({ ...body, account: "another-account" }, `1.${"b".repeat(64)}`, true, database))
      .rejects.toMatchObject({ status: 403, message: "Код підключення недійсний або відкликаний. Створіть новий код у кабінеті Maison HD." });
    expect(database.query).toHaveBeenCalledTimes(1);
  });
  it("does not reveal tenant configuration if the code belongs to a missing organization", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(authenticatePos(body, body.token, true, database))
      .rejects.toMatchObject({ status: 403, message: "Код підключення недійсний або відкликаний. Створіть новий код у кабінеті Maison HD." });
  });
  it("distinguishes an expired valid code without exchanging it", async () => {
    const database = pairingDatabase({ pairingExpiresAt: new Date(Date.now() - 1000).toISOString() });
    await expect(authenticatePos(body, body.token, true, database))
      .rejects.toMatchObject({ status: 403, message: expect.stringContaining("Термін дії коду минув") });
    expect(database.query).toHaveBeenCalledTimes(1);
  });
  it("still rejects a disabled pairing channel", async () => {
    const database = pairingDatabase({ enabled: false });
    await expect(authenticatePos(body, body.token, true, database)).rejects.toMatchObject({ status: 403 });
    expect(database.query).toHaveBeenCalledTimes(1);
  });
  it("does not expose context diagnostics for a paired credential", async () => {
    const database = pairingDatabase({ tokenHash: digestPosToken(body.token) });
    await expect(authenticatePos({ ...body, tabletId: 8 }, body.token, false, database))
      .rejects.toMatchObject({ status: 403, message: "Каса не підключена або доступ відкликано." });
    expect(database.query).toHaveBeenCalledTimes(1);
  });
  it("exchanges a valid code once only after all context checks pass", async () => {
    const database = pairingDatabase();
    const result = await authenticatePos(body, body.token, true, database);
    expect(result.orgId).toBe(1);
    expect(result.token).toMatch(/^1\.[a-f0-9]{64}$/);
    expect(database.query).toHaveBeenCalledTimes(2);
    expect(database.query.mock.calls[1][1][1]).toBe(digestPosToken(body.token));
  });
  it("still rejects a racing exchange when the atomic update loses", async () => {
    const database = pairingDatabase();
    database.query.mockReset()
      .mockResolvedValueOnce({ rows: [{ poster: {
        apiKey: "fixture-merchant-key", verified: true, accountId: "hotel",
        posNotifications: { enabled: true, account: "hotel", spotId: 1, tabletId: 2,
          pairingHash: digestPosToken(body.token), pairingExpiresAt: new Date(Date.now() + 60000).toISOString(),
          channelId: "fixture-channel" },
      } }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(authenticatePos(body, body.token, true, database))
      .rejects.toMatchObject({ status: 403, message: "Код уже використано або відкликано." });
  });
  it("requires an enabled, paired, recently seen terminal", () => {
    expect(posChannelOnline({ enabled: true, tokenHash: "x", lastSeenAt: new Date(now - 44000).toISOString() }, now)).toBe(true);
    expect(posChannelOnline({ enabled: true, tokenHash: "x", lastSeenAt: new Date(now - 46000).toISOString() }, now)).toBe(false);
    expect(posChannelOnline({ enabled: false, tokenHash: "x", lastSeenAt: new Date(now).toISOString() }, now)).toBe(false);
    expect(posChannelOnline({ enabled: true, lastSeenAt: new Date(now).toISOString() }, now)).toBe(false);
  });
});
