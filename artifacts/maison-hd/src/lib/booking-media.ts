// Safe media helpers for Maison HD Booking. No raw HTML; only allowlisted embeds.

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
const API_ROOT = BASE.replace("/maison-hd", "");

export const MAX_PHOTOS = 30;

import type { BookingUnitMedia } from "@workspace/api-client-react";

export type UnitMedia = BookingUnitMedia;
export type UnitMediaMap = Record<string, UnitMedia>;

const STORAGE_PREFIX = `${API_ROOT}/api/storage/objects/`;
/** Same-origin App Storage reference produced by the upload flow. */
function isStoragePath(v: string) {
  const prefixes = [STORAGE_PREFIX, `${API_ROOT}/api/storage/public-objects/`, "/api/storage/objects/", "/api/storage/public-objects/"];
  if (!prefixes.some(prefix => v.startsWith(prefix))) return false;
  try {
    const decoded = decodeURIComponent(v);
    return !/[\s<>"'\\?#]/.test(decoded) && decoded.split("/").every(part => part !== "." && part !== "..");
  } catch { return false; }
}

export function storageReference(objectPath: string) {
  return `${API_ROOT}/api/storage${objectPath}`;
}

function isCleanHttps(u: URL) {
  return u.protocol === "https:" && !u.username && !u.password && !u.hash && !!u.hostname;
}

/** Validates a stored photo reference. Returns null when unsafe. */
export function isAllowedPhoto(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  if (v.startsWith("/objects/")) return isStoragePath(`${API_ROOT}/api/storage${v}`);
  if (isStoragePath(v)) return true;
  try { return isCleanHttps(new URL(v)); } catch { return false; }
}

/** Resolves a stored photo reference to a browser-loadable URL. */
export function resolvePhotoUrl(raw: string): string | null {
  const v = raw.trim();
  if (!isAllowedPhoto(v)) return null;
  if (v.startsWith("/objects/")) return `${API_ROOT}/api/storage${v}`;
  if (isStoragePath(v)) return v;
  return new URL(v).toString();
}

export type VideoSource =
  | { kind: "file"; src: string; mime: string }
  | { kind: "embed"; src: string; provider: "YouTube" | "Vimeo" };

const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

export function parseVideo(raw: string): VideoSource | null {
  const v = raw.trim();
  if (!v) return null;
  if (isStoragePath(v)) return { kind: "file", src: v, mime: "" };
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  if (!isCleanHttps(u)) return null;
  const host = u.hostname.toLowerCase();

  if (YT_HOSTS.has(host)) {
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
      id = m?.[1] ?? "";
    }
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
    return { kind: "embed", provider: "YouTube", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
  }
  if (VIMEO_HOSTS.has(host)) {
    const m = u.pathname.match(/(?:^|\/)(\d{4,12})(?:\/|$)/);
    if (!m) return null;
    return { kind: "embed", provider: "Vimeo", src: `https://player.vimeo.com/video/${m[1]}?dnt=1` };
  }
  const path = u.pathname.toLowerCase();
  if (path.endsWith(".mp4")) return { kind: "file", src: u.toString(), mime: "video/mp4" };
  if (path.endsWith(".webm")) return { kind: "file", src: u.toString(), mime: "video/webm" };
  return null;
}

/** Validates a video URL for the editor. Empty is valid. */
export function videoUrlError(raw: string): string | null {
  if (!raw.trim()) return null;
  return parseVideo(raw) ? null : "Підтримуються лише завантажені файли, HTTPS-посилання на .mp4/.webm, YouTube або Vimeo";
}

export function normalizeUnitMedia(v: unknown): UnitMediaMap {
  const out: UnitMediaMap = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!/^\d+$/.test(k) || !raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    out[k] = {
      photos: Array.isArray(r.photos) ? r.photos.filter((p): p is string => typeof p === "string").slice(0, MAX_PHOTOS) : [],
      videoUrl: typeof r.videoUrl === "string" ? r.videoUrl : "",
      description: typeof r.description === "string" ? r.description : "",
    };
  }
  return out;
}

export function photoList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((p): p is string => typeof p === "string").map(resolvePhotoUrl).filter((p): p is string => !!p).slice(0, MAX_PHOTOS);
}

export const VIEW_LABELS: Record<string, string> = {
  park: "Вид на парк", sea: "Вид на море", city: "Вид на місто", garden: "Вид на сад", mountain: "Вид на гори", pool: "Вид на басейн",
};

// ── Device upload (App Storage, same pattern as hotel-tv) ──────────────────
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const IMAGE_MAX = 15 * 1024 * 1024;
export const VIDEO_MAX = 250 * 1024 * 1024;

export function checkUploadFile(file: File, kind: "image" | "video"): string | null {
  const types = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  const max = kind === "image" ? IMAGE_MAX : VIDEO_MAX;
  if (!types.includes(file.type)) return kind === "image" ? `${file.name}: дозволено JPEG, PNG, WebP або GIF` : `${file.name}: дозволено MP4, WebM або MOV`;
  if (file.size <= 0) return `${file.name}: порожній файл`;
  if (file.size > max) return `${file.name}: більше ${kind === "image" ? 15 : 250} МБ`;
  return null;
}

/** Uploads one file and returns the persisted storage reference. Throws on any failure. */
export async function uploadBookingMedia(file: File): Promise<string> {
  const token = localStorage.getItem("hms_token") || "";
  const req = await fetch(`${API_ROOT}/api/booking-engine/media-upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!req.ok) {
    let msg = "Не вдалося підготувати завантаження";
    try { const j = await req.json(); if (typeof j?.error === "string") msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const j = await req.json();
  const uploadURL = typeof j?.uploadURL === "string" ? j.uploadURL : "";
  const objectPath = typeof j?.objectPath === "string" ? j.objectPath : "";
  if (!uploadURL || !objectPath.startsWith("/objects/")) throw new Error("Сервер повернув некоректну відповідь");
  const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) throw new Error(`Файл не завантажено (${put.status})`);
  return storageReference(objectPath);
}
