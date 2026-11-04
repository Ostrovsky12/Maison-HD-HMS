import type {
  BookingServioSearchInput, BookingServioSearchResult, BookingServioCategory,
  BookingServioRate, BookingServioRestriction,
} from "@workspace/api-zod";
import { validBookingDates } from "./booking-engine.js";
import { servioReadRequest, type ServioReadRequest } from "./servio-connection.js";

type Json = Record<string, any>;
// Only static parser paths and type names are reported. Never include a provider
// value, arbitrary object key, body, token, or upstream error message.
class ServioShapeError extends Error {
  path = "";
  constructor(readonly expected: string, raw: unknown) {
    super("unexpected_response");
    this.actual = raw === null ? "null" : Array.isArray(raw) ? "масив" : raw === undefined ? "відсутнє"
      : typeof raw === "string" ? "рядок" : typeof raw === "number" ? "число"
      : typeof raw === "boolean" ? "логічне значення" : "об’єкт";
  }
  readonly actual: string;
}
function at<T>(path: string, parse: () => T): T {
  try { return parse(); }
  catch (error) {
    if (error instanceof ServioShapeError) error.path = path + (error.path ? error.path.startsWith("[") ? "" : "." : "") + error.path;
    throw error;
  }
}
const shapeMessage = (error: ServioShapeError) =>
  `Поле ${error.path || "response"}: очікується ${error.expected}; отримано ${error.actual}.`;
const object = (raw: unknown): Json => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ServioShapeError("об’єкт", raw);
  return raw as Json;
};
const integer = (raw: unknown, min = 0) => {
  if (!Number.isSafeInteger(raw) || Number(raw) < min || Number(raw) > 2147483647) throw new ServioShapeError(`ціле число ${min}–2147483647`, raw);
  return Number(raw);
};
const text = (raw: unknown, max = 1000) => {
  if (typeof raw !== "string" || raw.length > max) throw new ServioShapeError(`рядок до ${max} символів`, raw);
  return raw;
};
const array = (raw: unknown, max = 5000): unknown[] => {
  if (!Array.isArray(raw) || raw.length > max) throw new ServioShapeError(`масив до ${max} елементів`, raw);
  return raw;
};
const success = (raw: unknown) => {
  const data = object(raw);
  at("Result", () => {
    if (!Number.isInteger(data.Result)) throw new ServioShapeError("ціле число", data.Result);
  });
  if (data.Result !== 0) throw new Error("provider_error");
  return data;
};
const bit = (raw: unknown) => {
  if (raw !== 0 && raw !== 1) throw new ServioShapeError("число 0 або 1", raw);
  return raw === 1;
};

export function validServioSearch(input: BookingServioSearchInput): boolean {
  const nights = (Date.parse(input.checkOut) - Date.parse(input.checkIn)) / 86400000;
  return validBookingDates(input.checkIn, input.checkOut) && nights <= 31
    && ((input.companyId === 0 && input.companyCodeId === 0 && input.conditionId === 0)
      || (input.companyId > 0 && input.companyCodeId > 0));
}

function restrictions(raw: unknown, nights: number): { items: BookingServioRestriction[]; known: boolean } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { items: [], known: false };
  const value = object(raw);
  const items: BookingServioRestriction[] = [];
  let known = true;
  for (const code of ["ClosedToSale", "ClosedToArrive", "EarlyReservation", "MinStay"]) {
    const restriction = value[code];
    if (!restriction || typeof restriction.HasRestrictions !== "boolean") { known = false; continue; }
    try { at(code, () => {
      if (!restriction.HasRestrictions) return;
      const message = typeof restriction.Message === "string" ? at("Message", () => text(restriction.Message)) : "";
      const days = code === "MinStay" ? at("Days", () => integer(restriction.Days)) : null;
      items.push({ code, message: code === "MinStay" ? `Мінімальне проживання: ${days} ночей. ${message}` : message || code,
        blocksSale: code === "MinStay" ? days === 0 || nights < days! : true });
    }); } catch (error) {
      if (!(error instanceof ServioShapeError)) throw error;
      known = false;
      items.push({ code, message: `Обмеження не перевірено. ${shapeMessage(error)}`, blocksSale: false });
    }
  }
  if (value.MinPay != null) {
    try { at("MinPay", () => {
    const minPay = object(value.MinPay);
    const days = at("Days", () => integer(minPay.Days));
    const rules = at("MinPayPaymentRules", () => array(minPay.MinPayPaymentRules ?? [], 100).map((rawRule, index) => at(`[${index}]`, () => {
      const rule = object(rawRule);
      // Seconds may exceed a 32-bit integer; retain the provider values without
      // interpreting them as confirmation of the platform's payment policy.
      for (const field of ["TimeFromArriveDate", "TimeForPayment"]) at(field, () => {
        if (!Number.isSafeInteger(rule[field]) || rule[field] < 0) throw new ServioShapeError("невід’ємне ціле число секунд", rule[field]);
      });
      return `До заїзду: ${rule.TimeFromArriveDate} с; строк оплати: ${rule.TimeForPayment} с`;
    })));
    if (days > 0 || rules.length || minPay.Message) {
      items.push({ code: "MinPay", message: `Передоплата Servio: ${days} дн. ${at("Message", () => text(minPay.Message ?? ""))} ${rules.join("; ")}`.trim(), blocksSale: false });
    }
    }); } catch (error) {
      if (!(error instanceof ServioShapeError)) throw error;
      known = false;
      items.push({ code: "MinPay", message: `Умови передоплати не перевірено. ${shapeMessage(error)}`, blocksSale: false });
    }
  } else known = false;
  // Never assume new provider restrictions are harmless.
  if (Object.keys(value).some(key => !["ClosedToSale", "ClosedToArrive", "EarlyReservation", "MinStay", "MinPay"].includes(key))) {
    known = false;
    items.push({ code: "UnknownRestriction", message: "Servio повернув додаткові обмеження, які ще не підтримуються.", blocksSale: false });
  }
  return { items, known };
}

function rate(room: Json, list: Json, nights: number, freeRooms: number, input: BookingServioSearchInput): BookingServioRate {
  at("AgentCategories", () => {
    if (room.AgentCategories != null && array(room.AgentCategories).length)
      throw new ServioShapeError("порожній масив для запиту без категорій контрагентів", room.AgentCategories);
  });
  const charges = at("Services", () => array(room.Services, 100).flatMap((raw, serviceIndex) => at(`[${serviceIndex}]`, () => {
    const service = object(raw);
    const serviceId = at("ServiceID", () => integer(service.ServiceID, 1)), serviceName = at("ServiceName", () => text(service.ServiceName));
    return at("PriceDates", () => array(service.PriceDates, 100).map((rawDate, dateIndex) => at(`[${dateIndex}]`, () => {
      const price = object(rawDate);
      const date = at("Date", () => text(price.Date, 40));
      // Preserve per-service dates. Never invent a nightly average or use rack
      // rate as a substitute for the actual Price.
      const day = date.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(date)
        || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day
         || day < input.checkIn || day > input.checkOut)
        at("Date", () => { throw new ServioShapeError("коректна дата YYYY-MM-DD або YYYY-MM-DD HH:mm:ss у межах обраного проживання", price.Date); });
      const amount = price.Price;
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 10_000_000
         || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001)
        at("Price", () => { throw new ServioShapeError("невід’ємна скінченна сума до 10000000, до двох десяткових знаків", amount); });
      return { serviceId, serviceName, date, amount };
    })));
  })));
  if (!charges.length || charges.length > 5000)
    at("Services", () => { throw new ServioShapeError("1–5000 нарахувань", charges); });
  const cents = charges.reduce((sum, charge) => sum + Math.round(charge.amount * 100), 0);
  if (!Number.isSafeInteger(cents)) throw new Error("unexpected_response");
  const limits = restrictions(room.SaleRestrictions, nights);
  const blocked = freeRooms === 0 || limits.items.some(item => item.blocksSale);
  return {
    priceListId: at("PriceListID", () => integer(list.PriceListID, 1)), name: at("PriceListName", () => text(list.PriceListName)),
    conditionId: at("ConditionID", () => integer(list.ConditionID)),
    nonRefundable: at("IsNonReturnRate", () => bit(list.IsNonReturnRate)), specialRate: at("IsSpecRate", () => bit(list.IsSpecRate)),
    total: cents / 100, charges, restrictions: limits.items, saleAllowed: blocked ? false : limits.known ? true : null,
  };
}

export async function searchServioAvailability(
  connection: { base: string; token: string; hotelId: number; checkInTime: string; checkOutTime: string },
  input: BookingServioSearchInput, categoryList: BookingServioCategory[],
  send: ServioReadRequest = servioReadRequest,
): Promise<BookingServioSearchResult> {
  const result: BookingServioSearchResult = {
    status: "failed", code: "not_read", message: "", checkedAt: new Date().toISOString(),
    query: input, hotelId: connection.hotelId, currency: null, categories: [],
  };
  const { base, token, hotelId } = connection;
  const common = {
    HotelID: hotelId, DateArrival: input.checkIn, DateDeparture: input.checkOut,
    TimeArrival: /^\d{2}:\d{2}$/.test(connection.checkInTime) ? connection.checkInTime : "",
    TimeDeparture: /^\d{2}:\d{2}$/.test(connection.checkOutTime) ? connection.checkOutTime : "",
    Adults: input.adults, Childs: input.childAges.length, ChildAges: input.childAges,
    IsExtraBedUsed: input.useExtraBed, IsoLanguage: "uk",
  };
  let stage = "availability";
  try {
    const available = success(await send(base, token, "GetRooms", { ...common, CompanyCodeID: input.companyCodeId }));
    const known = new Map(categoryList.filter(category => category.hotelId === hotelId).map(category => [category.id, category]));
    const seen = new Set<number>();
    const categories = array(available.RoomTypes, 500).map(raw => {
      const room = object(raw), id = integer(room.ID, 1);
      const category = known.get(id);
      if (!category || seen.has(id)) throw new Error("unexpected_response");
      seen.add(id);
      return { id, name: category.name, freeRooms: integer(room.FreeRoom), mainPlaces: integer(room.MainPlacesCount, 1),
        nearestDate: room.NearestDateToReservation == null ? null : text(room.NearestDateToReservation, 40), rates: [] as BookingServioRate[] };
    });
    result.categories = categories;
    if (!categories.length) {
      return { ...result, status: "complete", code: "no_categories", message: "Servio не повернув категорій для цих дат і складу гостей. Ціни не запитувалися." };
    }
    stage = "prices";
    const prices = success(await send(base, token, "GetPrices", {
      ...common, CompanyID: input.companyId, RoomTypeIDs: categories.map(category => category.id),
      ContractConditionID: input.conditionId, ContractConditionAddIDs: [], PaidType: 200,
      NeedTransport: 0, IsTouristTax: 1, AgentCategory: 0, AgentCategories: [], LoyaltyAuthCode: "",
    }));
    const currency = at("ValuteShort", () => {
      const value = text(prices.ValuteShort, 20);
      if (!value.trim()) throw new ServioShapeError("непорожнє позначення валюти", prices.ValuteShort);
      return value;
    });
    const byId = new Map(categories.map(category => [category.id, category]));
    const parsedRates = new Map<number, BookingServioRate[]>();
    const duplicates = new Set<string>();
    at("PriceLists", () => array(prices.PriceLists, 100).forEach((raw, listIndex) => at(`[${listIndex}]`, () => {
      const list = object(raw);
      // Validate list metadata at its real path before entering category rows.
      at("PriceListID", () => integer(list.PriceListID, 1));
      at("PriceListName", () => text(list.PriceListName));
      at("ConditionID", () => integer(list.ConditionID));
      at("IsNonReturnRate", () => bit(list.IsNonReturnRate));
      at("IsSpecRate", () => bit(list.IsSpecRate));
      at("RoomTypes", () => array(list.RoomTypes, 500).forEach((rawRoom, roomIndex) => at(`[${roomIndex}]`, () => {
        const room = object(rawRoom), id = at("ID", () => integer(room.ID, 1));
        const category = byId.get(id);
        if (!category) at("ID", () => { throw new ServioShapeError("ID категорії з поточної відповіді GetRooms", room.ID); });
        if (!category) return;
        const parsed = rate(room, list, (Date.parse(input.checkOut) - Date.parse(input.checkIn)) / 86400000, category.freeRooms, input);
        const key = `${id}:${parsed.priceListId}:${parsed.conditionId}`;
        if (duplicates.has(key)) throw new ServioShapeError("унікальна комбінація категорії, прайса й умови", rawRoom);
        duplicates.add(key);
        parsedRates.set(id, [...(parsedRates.get(id) ?? []), parsed]);
      })));
    })));
    // Commit the entire parsed snapshot only after every price has validated.
    result.categories = categories.map(category => ({ ...category, rates: parsedRates.get(category.id) ?? [] }));
    result.currency = currency;
    const missing = result.categories.some(category => category.freeRooms > 0 && !category.rates.length);
    return { ...result, status: missing ? "partial" : "complete", code: missing ? "some_prices_missing" : "availability_prices_read",
      message: missing ? "Доступність отримано, але для частини вільних категорій Servio не повернув тарифів."
        : "Доступність і нарахування отримано із Servio. Це перевірка, а не бронювання; місця не утримуються." };
  } catch (error) {
    const allowed = ["unexpected_response", "provider_error", "access_denied", "provider_unavailable", "connection_failed", "timeout", "response_too_large"];
    const code = error instanceof Error && allowed.includes(error.message) ? error.message : "connection_failed";
    return { ...result, status: stage === "prices" ? "partial" : "failed", code: `${stage}_${code}`,
      message: `${stage === "prices" ? "Доступність отримано, але тарифи прочитати не вдалося." : "Не вдалося отримати доступність Servio."} ${
        code === "access_denied" ? "Перевірте права AccessToken." : code === "timeout" ? "Сервіс не відповів вчасно."
           : code === "unexpected_response" ? `Формат відповіді не відповідає підтримуваному протоколу.${error instanceof ServioShapeError ? ` ${shapeMessage(error)}` : ""}` : "Перевірте підключення та параметри запиту або зверніться до Servio."}` };
  }
}
