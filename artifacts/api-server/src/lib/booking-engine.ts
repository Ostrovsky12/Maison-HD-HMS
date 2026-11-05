import { pool } from "@workspace/db";
import type { BookingServioStatus, BookingAppearance, BookingRoomDetails } from "@workspace/api-zod";
import { servioFingerprint } from "./servio-connection.js";

export type BookingUnitMedia = { photos: string[]; videoUrl: string; description: string; details?: BookingRoomDetails };

export const DEFAULT_PAYMENT_WINDOW_TEXT = "Для гарантування бронювання оплату потрібно здійснити протягом 10 хвилин. Якщо оплату не підтверджено, бронювання буде скасовано після перевірки стану платежу.";

function roomDetails(value: unknown): BookingRoomDetails | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const limits: Record<string, number> = { displayName: 150, occupancyText: 200, bedsText: 300, sofaText: 200,
    areaText: 100, tariffTitle: 150, tariffDescription: 5000 };
  return { ...Object.fromEntries(Object.entries(limits).map(([key, max]) =>
    [key, typeof raw[key] === "string" ? (raw[key] as string).slice(0, max) : ""])),
    amenities: Array.isArray(raw.amenities) ? raw.amenities.filter((v): v is string => typeof v === "string").slice(0, 30).map(v => v.slice(0, 150)) : [] };
}

/** Brand entitlement is the tenant's stable slug, never its editable display name. */
export function dogodaBrandAvailable(org: { slug?: string }): boolean {
  return org.slug === "dogoda";
}

export function bookingAppearance(value: unknown, dogoda: boolean): BookingAppearance {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const color = (key: string, fallback: string) =>
    typeof raw[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(raw[key]) ? raw[key] as string : fallback;
  return {
    preset: dogoda && raw.preset !== "standard" ? "dogoda" : "standard",
    backgroundColor: color("backgroundColor", "#FFDDB2"),
    surfaceColor: color("surfaceColor", "#FFF4E5"),
    textColor: color("textColor", "#292D05"),
    mutedColor: color("mutedColor", "#A19958"),
    buttonColor: color("buttonColor", "#DF7D3C"),
    font: raw.font === "system" ? "system" : "brand",
    heroPhotoUrl: typeof raw.heroPhotoUrl === "string" && raw.heroPhotoUrl.length <= 1000
      && validBookingMediaUrl(raw.heroPhotoUrl) ? raw.heroPhotoUrl : "",
    showGallery: raw.showGallery !== false,
  };
}

export function validBookingMediaUrl(value: string): boolean {
  if (value.startsWith("/")) {
    if (!/^\/(?:objects|api\/storage\/(?:objects|public-objects))\//.test(value)) return false;
    try {
      const decoded = decodeURIComponent(value);
      return !/[\s\\?#]/.test(decoded) && decoded.split("/").every(part => part !== "." && part !== "..");
    } catch { return false; }
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

export function bookingUnitMedia(raw: unknown): Record<string, BookingUnitMedia> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).slice(0, 500).flatMap(([id, value]) => {
    if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647 || !value || typeof value !== "object") return [];
    const media = value as Record<string, unknown>;
    return [[id, {
      photos: [...new Set((Array.isArray(media.photos) ? media.photos : [])
        .filter((u): u is string => typeof u === "string" && u.length <= 1000 && validBookingMediaUrl(u)).slice(0, 30))],
      videoUrl: typeof media.videoUrl === "string" && media.videoUrl.length <= 1000 && validBookingMediaUrl(media.videoUrl) ? media.videoUrl : "",
      description: typeof media.description === "string" ? media.description.slice(0, 10000) : "",
      ...(media.details ? { details: roomDetails(media.details) } : {}),
    }]];
  }));
}

export type BookingEngineConfig = {
  provider: "maison" | "servio"; published: boolean; displayName: string;
  description: string; accentColor: string; logoUrl: string; phone: string; email: string;
  checkInTime: string; checkOutTime: string; terms: string; privacy: string;
  servioBaseUrl: string; servioHotelId: string; servioToken?: string; updatedAt?: string;
  servioSellerPropertyId?: number | null;
  servioSellerFingerprint?: string;
  paymentWindowText?: string;
  unitMedia?: Record<string, BookingUnitMedia>;
  appearance?: BookingAppearance;
  servioCategoryMedia?: Record<string, Record<string, { media: BookingUnitMedia; revision: number }>>;
  servioVerification?: { fingerprint: string; result: BookingServioStatus };
  liqpayVerification?: Record<string, { fingerprint: string; status: string; checkedAt: string; mode: string; code: string }>;
};

export function engineConfig(org: any): BookingEngineConfig {
  const raw = org.booking_engine_config;
  return {
    provider: "maison", published: false, displayName: org.name || "",
    description: "", accentColor: "#1f5648", logoUrl: "", phone: org.phone || "",
    email: org.email || "", checkInTime: "14:00", checkOutTime: "12:00",
    terms: "", privacy: "", servioBaseUrl: "", servioHotelId: "",
    ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}),
    unitMedia: bookingUnitMedia(raw?.unitMedia),
    paymentWindowText: typeof raw?.paymentWindowText === "string" ? raw.paymentWindowText.slice(0, 2000) : "",
    // Some internal callers intentionally select no slug: preserve their stored
    // appearance without injecting a default that could overwrite DOGODA later.
    ...(typeof org.slug === "string"
      ? { appearance: bookingAppearance(raw?.appearance, dogodaBrandAvailable(org)) } : {}),
  };
}

export function engineIssues(config: BookingEngineConfig, properties: number, activeUnits: number): string[] {
  const issues: string[] = [];
  if (config.provider === "servio") {
    const fingerprint = servioFingerprint(config);
    if (!config.servioToken || config.servioVerification?.fingerprint !== fingerprint
      || config.servioVerification.result.status !== "connected" || !config.servioVerification.result.categories.length)
      issues.push("Перевірте підключення й категорії Servio перед відкриттям продажів.");
    if (!config.servioSellerPropertyId || config.servioSellerFingerprint !== fingerprint)
      issues.push("Збережіть прив’язку продавця до поточного готелю Servio.");
  }
  if (!config.displayName.trim()) issues.push("Додайте назву готелю.");
  if (!config.phone.trim() && !config.email.trim()) issues.push("Додайте телефон або email для зв’язку.");
  if (!config.terms.trim()) issues.push("Додайте умови бронювання та скасування.");
  if (!config.privacy.trim()) issues.push("Додайте політику обробки персональних даних.");
  if (config.provider === "maison" && !properties) issues.push("Створіть об’єкт розміщення.");
  if (config.provider === "maison" && !activeUnits) issues.push("Додайте активні видимі номери з коректною ціною.");
  return issues;
}

export function publicEngineConfig(config: BookingEngineConfig, visibleUnitIds: number[] = []) {
  const { provider, published, displayName, description, accentColor, logoUrl, phone, email,
    checkInTime, checkOutTime, terms, privacy } = config;
  const visible = new Set(visibleUnitIds.map(String));
  const unitMedia = Object.fromEntries(Object.entries(bookingUnitMedia(config.unitMedia)).filter(([id]) => visible.has(id)));
  return { provider, published, displayName, description, accentColor, logoUrl, phone, email,
    checkInTime, checkOutTime, terms, privacy, unitMedia,
    appearance: config.appearance ?? bookingAppearance(undefined, false),
    paymentWindowText: config.paymentWindowText?.trim() || DEFAULT_PAYMENT_WINDOW_TEXT };
}

/** Existing legacy /book remains available until a tenant explicitly configures this product.
 * Once configured, draft/Servio guards also protect legacy search/create routes.
 */
export async function engineSalesGuard(slug: string, requireConfigured = false, client: any = pool, lock = false) {
  const { rows } = await client.query(
    "SELECT id, name, is_active, booking_engine_config FROM organizations WHERE slug=$1" + (lock ? " FOR SHARE" : ""), [slug]);
  const org = rows[0];
  if (!org || !org.is_active) return { status: 404, error: "Готель не знайдено." };
  if (!org.booking_engine_config && !requireConfigured) return null;
  const config = engineConfig(org);
  if (config.provider !== "maison") return { status: 503, error: "Онлайн-бронювання Servio ще не підключено. Зверніться до готелю." };
  if (!config.published) return { status: 403, error: "Онлайн-бронювання тимчасово не опубліковане." };
  return null;
}

export function validBookingDates(checkIn: string, checkOut: string) {
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
    && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
  return valid(checkIn) && valid(checkOut) && checkOut > checkIn
    && (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000 <= 365;
}

/** Shared quote path for the new module. Explicit online rates never silently fall back. */
export async function engineQuote(unitId: number, checkIn: string, checkOut: string, guests: number, client: any = pool) {
  const { rows } = await client.query(`
    SELECT u.id, u.base_price, u.capacity, u.status, u.is_hidden,
      cs.rate_id, r.id AS actual_rate_id, r.price_per_night, r.unit_prices,
      r.is_stop_sale, r.date_from::text, r.date_to::text, r.min_nights
    FROM units u
    LEFT JOIN LATERAL (
      SELECT rate_id FROM channel_rate_settings
      WHERE property_id=u.property_id AND channel='online' AND is_active=true ORDER BY id LIMIT 1
    ) cs ON true
    LEFT JOIN rates r ON r.id=cs.rate_id AND r.property_id=u.property_id
    WHERE u.id=$1`, [unitId]);
  const unit = rows[0];
  const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
  if (!unit || unit.status !== "active" || unit.is_hidden || guests > Number(unit.capacity)) return null;
  if (unit.rate_id && (!unit.actual_rate_id || unit.is_stop_sale
    || (unit.date_from && checkIn < unit.date_from)
    || (unit.date_to && checkOut > unit.date_to)
    || nights < Number(unit.min_nights || 1))) return null;
  const rawPrice = unit.rate_id ? (unit.unit_prices?.[String(unitId)] ?? unit.price_per_night) : unit.base_price;
  if (rawPrice === null || rawPrice === undefined || rawPrice === "") return null;
  const nightly = Number(rawPrice);
  if (!Number.isFinite(nightly) || nightly < 0 || !Number.isInteger(nights) || nights < 1) return null;
  return { nightlyRate: nightly, totalPrice: Math.round(nightly * nights * 100) / 100, nights };
}
