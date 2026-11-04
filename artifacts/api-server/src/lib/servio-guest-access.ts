import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { encrypt, decrypt } from "./encrypt.js";
import type { Attempt } from "./servio-reservations.js";

export type ServioGuestAccess = {
  token: string; expiresAt: string; returnPath: string;
  hotelName: string; sellerName: string; phone: string; email: string;
};
export const servioGuestPath = (slug: string, id: string) => {
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,199}$/u.test(slug)) throw new Error("invalid_slug");
  return `/booking/${encodeURIComponent(slug)}/servio/${id}`;
};
export function createServioGuestAccess(slug: string, id: string, hotel: Omit<ServioGuestAccess, "token" | "expiresAt" | "returnPath">): ServioGuestAccess {
  return { ...hotel, token: randomBytes(32).toString("base64url"),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), returnPath: servioGuestPath(slug, id) };
}
export function encodeServioGuestAccess(access: ServioGuestAccess): string {
  return encrypt(JSON.stringify(access))!;
}
export function decodeServioGuestAccess(row: Pick<Attempt, "guest_access">): ServioGuestAccess | null {
  if (!row.guest_access) return null;
  try {
    const access = JSON.parse(decrypt(row.guest_access) || "null");
    if (!access || typeof access.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(access.token)
      || typeof access.expiresAt !== "string" || !Number.isFinite(Date.parse(access.expiresAt))
      || typeof access.returnPath !== "string" || !/^\/booking\/[^/]+\/servio\/[a-f0-9-]{36}$/.test(access.returnPath)) return null;
    return access;
  } catch { return null; }
}
export function verifiesServioGuestAccess(row: Attempt, slug: string, token: unknown): boolean {
  const access = decodeServioGuestAccess(row);
  if (!access || typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)
    || Date.parse(access.expiresAt) <= Date.now() || access.returnPath !== servioGuestPath(slug, row.id)) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(access.token), digest(token));
}
