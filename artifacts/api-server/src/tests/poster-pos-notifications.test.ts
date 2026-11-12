import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", () => ({ pool: {} }));
import { verifyPosSignature, posChannelOnline, authenticatePos } from "../lib/poster-pos-notifications.js";

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
  it("does not use account headers as tenant authorization", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(authenticatePos(body, body.token, false, database)).rejects.toMatchObject({ status: 403 });
  });
  it("requires an enabled, paired, recently seen terminal", () => {
    expect(posChannelOnline({ enabled: true, tokenHash: "x", lastSeenAt: new Date(now - 44000).toISOString() }, now)).toBe(true);
    expect(posChannelOnline({ enabled: true, tokenHash: "x", lastSeenAt: new Date(now - 46000).toISOString() }, now)).toBe(false);
    expect(posChannelOnline({ enabled: false, tokenHash: "x", lastSeenAt: new Date(now).toISOString() }, now)).toBe(false);
    expect(posChannelOnline({ enabled: true, lastSeenAt: new Date(now).toISOString() }, now)).toBe(false);
  });
});
