import { createHash } from "node:crypto";

export class PrroSigningError extends Error {}

export interface PrroSigner {
  sign(keyId: string, content: Buffer, scope?: {
    organizationId: number;
    legalEntityId: number;
    registerId: number;
    userId?: number;
  }): Promise<Buffer>;
  authorize(keyId: string, scope: {
    organizationId: number;
    legalEntityId: number;
    registerId: number;
  }): Promise<{ publicKeyId: string }>;
  verify(signedContent: Buffer): Promise<Buffer>;
}

/**
 * Delegates CAdES signing to a separately operated signer/HSM agent. The API
 * server stores only key IDs and signed public documents, never private keys.
 */
export class RemotePrroSigner implements PrroSigner {
  constructor(
    private readonly endpoint = process.env.PRRO_SIGNER_URL,
    private readonly authToken = process.env.PRRO_SIGNER_AUTH_TOKEN,
  ) {}

  private configuration(): { endpoint: string; authToken: string } {
    if (!this.endpoint) throw new PrroSigningError("PRRO_SIGNER_URL is not configured");
    if (!this.authToken) throw new PrroSigningError("PRRO_SIGNER_AUTH_TOKEN is not configured");
    return { endpoint: this.endpoint, authToken: this.authToken };
  }

  async sign(keyId: string, content: Buffer, scope?: {
    organizationId: number;
    legalEntityId: number;
    registerId: number;
    userId?: number;
  }): Promise<Buffer> {
    const configuration = this.configuration();
    if (!keyId || keyId.length > 255) {
      throw new PrroSigningError("Invalid signer key ID");
    }
    const response = await fetch(new URL("/v1/sign/cades", configuration.endpoint), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${configuration.authToken}`,
      },
      body: JSON.stringify({
        keyId,
        contentBase64: content.toString("base64"),
        contentSha256: createHash("sha256").update(content).digest("hex"),
        detached: false,
        scope,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new PrroSigningError(`Signer returned HTTP ${response.status}`);
    }
    const result = await response.json() as { signatureBase64?: unknown };
    if (typeof result.signatureBase64 !== "string" || !result.signatureBase64) {
      throw new PrroSigningError("Signer returned an invalid response");
    }
    return Buffer.from(result.signatureBase64, "base64");
  }

  async authorize(keyId: string, scope: {
    organizationId: number;
    legalEntityId: number;
    registerId: number;
  }): Promise<{ publicKeyId: string }> {
    const configuration = this.configuration();
    const response = await fetch(new URL("/v1/keys/authorize", configuration.endpoint), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${configuration.authToken}`,
      },
      body: JSON.stringify({ keyId, scope }),
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json() as { authorized?: boolean; publicKeyId?: string };
    if (!response.ok || result.authorized !== true || !result.publicKeyId) {
      throw new PrroSigningError("Signer did not authorize this key for the fiscal scope");
    }
    return { publicKeyId: result.publicKeyId };
  }

  async verify(signedContent: Buffer): Promise<Buffer> {
    const configuration = this.configuration();
    const response = await fetch(new URL("/v1/verify/cades", configuration.endpoint), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${configuration.authToken}`,
      },
      body: JSON.stringify({ signatureBase64: signedContent.toString("base64") }),
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json() as { valid?: boolean; contentBase64?: string };
    if (!response.ok || result.valid !== true || !result.contentBase64) {
      throw new PrroSigningError("DPS signed response could not be verified");
    }
    return Buffer.from(result.contentBase64, "base64");
  }
}

export const prroSigner: PrroSigner = new RemotePrroSigner();