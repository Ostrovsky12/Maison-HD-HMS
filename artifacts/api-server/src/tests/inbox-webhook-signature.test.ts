import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validInstagramSignature } from "../routes/inbox-webhooks.js";

describe("Instagram webhook authentication", () => {
  const appSecret = "meta-app-secret";
  const body = Buffer.from('{"object":"instagram","entry":[]}');
  const validSignature = `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;

  it("accepts only an HMAC made from the raw request body and configured app secret", () => {
    expect(validInstagramSignature(body, validSignature, appSecret)).toBe(true);
    expect(validInstagramSignature(body, "sha256=wrong", appSecret)).toBe(false);
    expect(validInstagramSignature(Buffer.from("{}"), validSignature, appSecret)).toBe(false);
    expect(validInstagramSignature(body, validSignature, undefined)).toBe(false);
    expect(validInstagramSignature(undefined, validSignature, appSecret)).toBe(false);
  });
});