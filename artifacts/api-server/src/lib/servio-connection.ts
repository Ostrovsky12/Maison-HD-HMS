import { createHash } from "node:crypto";
import https from "node:https";
import type { BookingServioStatus } from "@workspace/api-zod";

// Only the vendor's HTTPS hosting is supported. Never send a tenant token to an
// arbitrary URL, IP, alternate port, redirect or endpoint supplied by a client.
export function servioBaseUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || (url.port && url.port !== "443")
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.servio\.support$/i.test(url.hostname)
    || !/^\/ReservationService_1_10\/?$/.test(url.pathname)) throw new Error("invalid_endpoint");
  return url.origin + "/ReservationService_1_10";
}

export function servioHotelId(raw: string): number {
  const value = raw.trim();
  if (!/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) throw new Error("invalid_hotel");
  return Number(value);
}

export function servioFingerprint(config: { provider: string; servioBaseUrl: string; servioHotelId: string; servioToken?: string }) {
  return createHash("sha256").update(JSON.stringify([
    config.provider, config.servioBaseUrl, config.servioHotelId, config.servioToken ?? "",
  ])).digest("hex");
}

export const uncheckedServio: BookingServioStatus = {
  status: "not_checked", code: "not_checked", message: "Збережене підключення ще не перевірено.",
  pingOk: false, checkedAt: null, categories: [],
};

type ReadMethod = "Ping" | "GetRoomTypesList" | "GetRooms" | "GetPrices";
export type ServioReadRequest = (base: string, token: string, method: ReadMethod, body: unknown) => Promise<unknown>;

// Use node:https, not fetch: this server also runs on a Node version without
// global AbortSignal. Bound response size and wall-clock time; never log bodies.
export const servioReadRequest: ServioReadRequest = (base, token, method, body) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const request = https.request(`${base}/${method}`, {
    method: "POST",
    headers: { AccessToken: token, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
  }, response => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) { request.destroy(new Error("response_too_large")); return; }
      chunks.push(chunk);
    });
    response.on("error", () => reject(new Error("connection_failed")));
    response.on("aborted", () => reject(new Error("connection_failed")));
    response.on("end", () => {
      clearTimeout(timer);
      if (response.statusCode === 401 || response.statusCode === 403) { reject(new Error("access_denied")); return; }
      if (response.statusCode !== 200) { reject(new Error("provider_unavailable")); return; }
      if (!/^application\/json\b/i.test(String(response.headers["content-type"] ?? ""))) {
        reject(new Error("unexpected_response")); return;
      }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new Error("unexpected_response")); }
    });
  });
  const timer = setTimeout(() => request.destroy(new Error("timeout")), 12_000);
  request.on("error", (error: Error) => {
    clearTimeout(timer);
    reject(new Error(["timeout", "response_too_large"].includes(error.message) ? error.message : "connection_failed"));
  });
  request.end(data);
});

const messages: Record<string, string> = {
  access_denied: "Servio відхилив доступ. Перевірте AccessToken і права цього підключення.",
  provider_unavailable: "Servio повернув помилку HTTP. Перевірте адресу сервісу або зверніться до Servio.",
  connection_failed: "Не вдалося встановити захищене з’єднання із Servio.",
  timeout: "Servio не відповів за відведений час. Спробуйте пізніше.",
  response_too_large: "Відповідь Servio перевищує допустимий розмір.",
  unexpected_response: "Servio повернув неочікуваний формат відповіді.",
  hotel_not_found: "У відповіді немає категорій для збереженого HotelID. Перевірте HotelID та права доступу.",
  provider_error: "Servio повідомив про помилку читання категорій. Перевірте HotelID і права AccessToken.",
};

export async function checkServioConnection(base: string, hotelId: number, token: string, send: ServioReadRequest = servioReadRequest): Promise<BookingServioStatus> {
  const checkedAt = new Date().toISOString();
  let pingOk = false;
  try {
    // The vendor's HAR shows a scalar JSON request and the exact scalar echo.
    if (await send(base, token, "Ping", 123) !== 123) throw new Error("unexpected_response");
    pingOk = true;
    const raw = await send(base, token, "GetRoomTypesList", { HotelID: hotelId }) as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || !Number.isInteger(raw.Result)) throw new Error("unexpected_response");
    if (raw.Result !== 0) throw new Error("provider_error");
    const { Count, IDs, ClassNames, HotelIDs } = raw;
    if (!Number.isInteger(Count) || Number(Count) < 0 || Number(Count) > 5000
      || !Array.isArray(IDs) || !Array.isArray(ClassNames) || !Array.isArray(HotelIDs)
      || IDs.length !== Count || ClassNames.length !== Count || HotelIDs.length !== Count) throw new Error("unexpected_response");
    const seen = new Set<number>();
    const categories = IDs.map((id, index) => {
      const name = ClassNames[index], hid = HotelIDs[index];
      if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(hid) || hid <= 0
        || typeof name !== "string" || !name.trim() || name.length > 500 || seen.has(id)) throw new Error("unexpected_response");
      seen.add(id);
      return { id, name, hotelId: hid };
    }).filter(category => category.hotelId === hotelId);
    if (!categories.length) throw new Error("hotel_not_found");
    return { status: "connected", code: "categories_read", message: "Ping успішний. Категорії готелю отримано. Доступність, тарифи, бронювання та оплати ще не перевірені.", pingOk, checkedAt, categories };
  } catch (error) {
    const code = error instanceof Error && messages[error.message] ? error.message : "connection_failed";
    return { status: pingOk ? "partial" : "failed", code, message: `${pingOk ? "Ping успішний, але " : ""}${messages[code]}`, pingOk, checkedAt, categories: [] };
  }
}
