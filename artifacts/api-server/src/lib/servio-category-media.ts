import { createHash } from "node:crypto";
import { GetBookingServioStatusResponse, type BookingServioCategoryMediaList } from "@workspace/api-zod";
import { bookingUnitMedia, type BookingEngineConfig, type BookingUnitMedia } from "./booking-engine.js";
import { servioBaseUrl, servioFingerprint, servioHotelId } from "./servio-connection.js";

export type CategoryMedia = { media: BookingUnitMedia; revision: number };
export function servioCategorySource(config: BookingEngineConfig): string | null {
  try {
    return createHash("sha256").update(JSON.stringify([servioBaseUrl(config.servioBaseUrl), servioHotelId(config.servioHotelId)])).digest("hex");
  } catch { return null; }
}
export function servioMediaEntry(config: BookingEngineConfig, source: string, hotelId: number, categoryId: number): CategoryMedia {
  const raw = config.servioCategoryMedia?.[source]?.[`${hotelId}:${categoryId}`];
  const revision = raw?.revision ?? 0;
  return {
    media: bookingUnitMedia({ "1": raw?.media })["1"] ?? { photos: [], videoUrl: "", description: "" },
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
  };
}
export function servioCategoryMediaList(config: BookingEngineConfig): BookingServioCategoryMediaList {
  const sourceId = servioCategorySource(config);
  const verification = config.servioVerification?.fingerprint === servioFingerprint(config)
    ? GetBookingServioStatusResponse.safeParse(config.servioVerification.result) : null;
  const ready = config.provider === "servio" && !!sourceId && verification?.success && verification.data.status === "connected";
  if (!ready || !verification?.success || !sourceId) {
    return { ready: false, message: "Збережіть підключення Servio та успішно перевірте його категорії. Локальні номери Maison HD не змінюються.",
      sourceId: null, categories: [] };
  }
  return { ready: true, message: verification.data.categories.length ? "Фото й описи зберігаються лише у Maison HD, окремо від Servio та локальних номерів."
    : "Servio не повернув категорій для цього підключення.", sourceId,
    categories: verification.data.categories.map(c => ({
      hotelId: c.hotelId, categoryId: c.id, name: c.name, ...servioMediaEntry(config, sourceId, c.hotelId, c.id),
    })),
  };
}
