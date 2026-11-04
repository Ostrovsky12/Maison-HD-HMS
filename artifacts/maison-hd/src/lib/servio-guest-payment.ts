// Private guest access for a controlled Servio reservation.
// The bearer token lives only in the URL fragment (never sent to servers by the browser),
// is captured once into sessionStorage scoped to slug/id, and is then stripped from the address bar.
// It is never put in query keys, request bodies, return URLs or logs.

export const GUEST_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,199}$/u;

const key = (slug: string, id: string) => `mhd_servio_guest:${slug}:${id.toLowerCase()}`;
// In-memory fallback (also covers StrictMode double-init after the hash has been stripped).
const memory = new Map<string, string>();

export type GuestAccess = { token: string | null; persisted: boolean };

export function validRoute(slug: string, id: string) {
  return SLUG_RE.test(slug) && UUID_RE.test(id);
}

export function captureGuestAccess(slug: string, id: string): GuestAccess {
  if (!validRoute(slug, id)) { stripHash(); return { token: null, persisted: false }; }
  const k = key(slug, id);
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const fragment = new URLSearchParams(hash);
  const fromHash = fragment.get("access");
  if (hash) stripHash();
  if (fragment.has("access") && (fragment.getAll("access").length !== 1 || !fromHash || !GUEST_TOKEN_RE.test(fromHash))) {
    forgetGuestAccess(slug, id);
    return { token: null, persisted: false };
  }
  if (fromHash && GUEST_TOKEN_RE.test(fromHash)) {
    memory.set(k, fromHash);
    try { sessionStorage.setItem(k, fromHash); return { token: fromHash, persisted: sessionStorage.getItem(k) === fromHash }; }
    catch { return { token: fromHash, persisted: false }; }
  }
  try {
    const stored = sessionStorage.getItem(k);
    if (stored && GUEST_TOKEN_RE.test(stored)) return { token: stored, persisted: true };
    if (stored) sessionStorage.removeItem(k);
  } catch { /* storage disabled */ }
  const mem = memory.get(k);
  return mem ? { token: mem, persisted: false } : { token: null, persisted: false };
}

export function forgetGuestAccess(slug: string, id: string) {
  const k = key(slug, id);
  memory.delete(k);
  try { sessionStorage.removeItem(k); } catch { /* ignore */ }
}

function stripHash() {
  const u = window.location;
  window.history.replaceState(window.history.state, "", u.pathname + u.search);
}

export function newCacheId() {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
}

/** Absolute display URL for the admin copy field; keeps the fragment intact. */
export function absoluteGuestUrl(url: string) {
  try { return new URL(url, window.location.origin).toString(); } catch { return url; }
}
