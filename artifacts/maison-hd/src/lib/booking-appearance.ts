import type { BookingAppearance } from "@workspace/api-client-react";

export type BookingAppearanceValue = BookingAppearance;

export const DOGODA_DEFAULTS: BookingAppearanceValue = {
  preset: "dogoda",
  backgroundColor: "#FFDDB2",
  surfaceColor: "#FFF4E5",
  textColor: "#292D05",
  mutedColor: "#A19958",
  buttonColor: "#DF7D3C",
  font: "brand",
  heroPhotoUrl: "",
  showGallery: true,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);

export function normalizeAppearance(v: unknown): BookingAppearanceValue {
  const r = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const d = DOGODA_DEFAULTS;
  return {
    preset: r.preset === "standard" ? "standard" : "dogoda",
    backgroundColor: hex(r.backgroundColor, d.backgroundColor),
    surfaceColor: hex(r.surfaceColor, d.surfaceColor),
    textColor: hex(r.textColor, d.textColor),
    mutedColor: hex(r.mutedColor, d.mutedColor),
    buttonColor: hex(r.buttonColor, d.buttonColor),
    font: r.font === "system" ? "system" : "brand",
    heroPhotoUrl: typeof r.heroPhotoUrl === "string" ? r.heroPhotoUrl : "",
    showGallery: r.showGallery !== false,
  };
}

export type CatalogItem = { id: string; name: string; category: string; description: string; photos: string[]; videoUrl: string };
