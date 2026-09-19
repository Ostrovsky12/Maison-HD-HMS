import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw && /^[0-9a-fA-F]{64,}$/.test(raw)) {
    return Buffer.from(raw.slice(0, 64), "hex");
  }
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || Buffer.byteLength(sessionSecret, "utf8") < 32) {
    throw new Error("ENCRYPTION_KEY or SESSION_SECRET must be configured with at least 32 bytes");
  }
  return crypto.createHash("sha256")
    .update("maison-hd:field-encryption:v1:")
    .update(sessionSecret)
    .digest();
}

export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === "") return plaintext ?? null;
  if (plaintext.startsWith(PREFIX)) return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, encrypted].map((b) => b.toString("base64")).join(".");
}

export function decrypt(ciphertext: string | null | undefined): string | null {
  if (ciphertext == null || ciphertext === "") return ciphertext ?? null;
  if (!ciphertext.startsWith(PREFIX)) return ciphertext;
  const key = getKey();
  const parts = ciphertext.slice(PREFIX.length).split(".");
  if (parts.length !== 3) return ciphertext;
  const [ivB64, tagB64, encB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encBuf = Buffer.from(encB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encBuf).toString("utf8") + decipher.final("utf8");
}

export function encryptFields<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
  const result = { ...obj };
  for (const f of fields) {
    if (result[f] != null) result[f] = encrypt(String(result[f])) as any;
  }
  return result;
}

export function decryptFields<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
  const result = { ...obj };
  for (const f of fields) {
    if (result[f] != null) result[f] = decrypt(String(result[f])) as any;
  }
  return result;
}
