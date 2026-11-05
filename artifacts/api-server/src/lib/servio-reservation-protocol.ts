import type { BookingServioReservationInput, BookingServioRate } from "@workspace/api-zod";
import { servioMoney } from "./servio-availability.js";

export class ServioRejected extends Error {}
type Obj = Record<string, any>;
function object(raw: unknown): Obj {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_provider_shape");
  return raw as Obj;
}
export function providerSuccess(raw: unknown): Obj {
  const result = object(raw);
  if (!Number.isInteger(result.Result)) throw new Error("invalid_provider_shape");
  if (result.Result !== 0) throw new ServioRejected("provider_rejected");
  return result;
}
export function servioAccount(raw: unknown): string {
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 && raw <= 2147483647) return String(raw).padStart(10, "0");
  if (typeof raw === "string" && /^\d{10}$/.test(raw) && Number(raw) > 0 && Number(raw) <= 2147483647) return raw;
  throw new Error("invalid_account");
}
export function reservationPayload(input: BookingServioReservationInput, hotelId: number, checkInTime: string, checkOutTime: string, id: string) {
  return {
    HotelID: hotelId, DateArrival: input.checkIn, DateDeparture: input.checkOut,
    TimeArrival: checkInTime, TimeDeparture: checkOutTime, Adults: input.adults,
    Childs: input.childAges.length, ChildAges: input.childAges, IsExtraBedUsed: input.useExtraBed,
    GuestFirstName: input.firstName.trim(), GuestLastName: input.lastName.trim(), RoomTypeID: input.categoryId,
    CompanyID: input.companyId, Company: "", ContractConditionID: input.rateConditionId, PaidType: 200,
    Iso3Country: "", Country: "", Address: "", Phone: input.phone.trim(), Fax: "", eMail: input.email.trim(),
    NeedTransport: 0, Comment: `Maison HD ${id}${input.specialRequests?.trim() ? ` · ${input.specialRequests.trim()}` : ""}`, ClientInfo: "Maison HD Booking",
    IsTouristTax: 1, AgentCategory: 0, PriceListID: input.priceListId, LoyaltyCardTypeID: 0,
    LoyaltyCardNumber: "", ContactName: `${input.firstName.trim()} ${input.lastName.trim()}`.slice(0, 50),
    UTM_SOURCE: "maison_hd_booking", UTM_MEDIUM: "direct", UTM_CAMPAIGN: "", UTM_CONTENT: "", UTM_TERM: "",
  };
}
export function billPayload(account: string, rate: BookingServioRate, checkIn: string) {
  const grouped = new Map<number, Obj>();
  for (const charge of rate.charges) {
    const service = grouped.get(charge.serviceId) ?? {
      ServiceID: charge.serviceId, ServiceName: charge.serviceName, ServiceCode: "",
      ServiceSystemCode: "", ServiceTypeName: "", PriceDates: [],
    };
    service.PriceDates.push({ Date: charge.date, Price: charge.amount, CustomerAccount: account });
    grouped.set(charge.serviceId, service);
  }
  if (!grouped.size) throw new Error("missing_charges");
  return { Account: account,
    Amount: rate.charges.filter(row => row.date.slice(0, 10) === checkIn).reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100,
    Services: [...grouped.values()] };
}
export type ServioBill = { account: string; firstDayAmount: number; totalMinor: number; services: Obj[] };
export function parseServioBill(raw: unknown, account: string, checkIn: string, checkOut: string): ServioBill {
  const bill = providerSuccess(raw);
  if (servioAccount(bill.Account) !== account || !Array.isArray(bill.Services) || !bill.Services.length || bill.Services.length > 100)
    throw new Error("invalid_bill");
  let totalMinor = 0, count = 0;
  const services = bill.Services.map((rawService: unknown) => {
    const service = object(rawService);
    if (!Number.isSafeInteger(service.ServiceID) || service.ServiceID <= 0
      || !Array.isArray(service.PriceDates) || !service.PriceDates.length || service.PriceDates.length > 100)
      throw new Error("invalid_bill_service");
    const bounded = (key: string) => {
      const value = service[key];
      if (value == null) return "";
      if (typeof value !== "string" || value.length > 1000) throw new Error("invalid_bill_metadata");
      return value;
    };
    const serviceCode = service.ServiceCode ?? "";
    if (!(typeof serviceCode === "string" && serviceCode.length < 100) && !Number.isSafeInteger(serviceCode))
      throw new Error("invalid_service_code");
    return {
      ServiceID: service.ServiceID, ServiceName: bounded("ServiceName"), ServiceCode: serviceCode,
      ServiceSystemCode: bounded("ServiceSystemCode"), ServiceTypeName: bounded("ServiceTypeName"),
      PriceDates: service.PriceDates.map((rawDay: unknown) => {
        const day = object(rawDay), date = day.Date;
        if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(date)
          || date.slice(0, 10) < checkIn || date.slice(0, 10) > checkOut
          || !Number.isFinite(Date.parse(date.slice(0, 10))) || new Date(date.slice(0, 10)).toISOString().slice(0, 10) !== date.slice(0, 10)
          || servioAccount(day.CustomerAccount) !== account) throw new Error("invalid_bill_day");
        const price = servioMoney(day.Price);
        totalMinor += Math.round(price * 100); count++;
        return { Date: date, Price: price, CustomerAccount: account };
      }),
    };
  });
  if (count > 5000 || totalMinor <= 0 || totalMinor > 1_000_000_000 || !Number.isSafeInteger(totalMinor)) throw new Error("invalid_bill_total");
  return { account, firstDayAmount: servioMoney(bill.Amount), totalMinor, services };
}
