import { describe, expect, it, vi } from "vitest";
import { SearchBookingServioAvailabilityBody } from "@workspace/api-zod";
import { searchServioAvailability, validServioSearch } from "../lib/servio-availability.js";
const input = {
  checkIn: "2026-12-01", checkOut: "2026-12-03", adults: 2, childAges: [6], useExtraBed: false,
  companyId: 0, companyCodeId: 0, conditionId: 0,
};
const connection = { base: "https://test.servio.support/ReservationService_1_10", token: "fixture-secret", hotelId: 7, checkInTime: "14:00", checkOutTime: "12:00" };
const category = [{ id: 11, name: "Будинок", hotelId: 7 }];
const available = () => ({ Result: 0, RoomTypes: [{ ID: 11, FreeRoom: 2, MainPlacesCount: 3, NearestDateToReservation: null }] });
const prices = () => ({
  Result: 0, ValuteShort: "грн", PriceLists: [{
    PriceListID: 90, PriceListName: "Неповоротний", ConditionID: 0, IsNonReturnRate: 1, IsSpecRate: 0,
    RoomTypes: [{ ID: 11, AgentCategories: [], SaleRestrictions: {
      ClosedToSale: { HasRestrictions: false }, ClosedToArrive: { HasRestrictions: false },
      EarlyReservation: { HasRestrictions: false }, MinStay: { HasRestrictions: false },
      MinPay: { Days: 1, Message: "Передоплата", MinPayPaymentRules: [{ TimeFromArriveDate: 86400, TimeForPayment: 600 }] },
    }, Services: [
      { ServiceID: 100, ServiceName: "Проживання", PriceDates: [{ Date: "2026-12-01 23:59:00", Price: 100.1, RackRatePrice: 9999 }, { Date: "2026-12-02 23:59:00", Price: 100.2 }] },
      { ServiceID: 101, ServiceName: "Збір", PriceDates: [{ Date: "2026-12-01 23:59:00", Price: 5.05 }] },
    ] }],
  }],
});
const search = (a: unknown, p: unknown, q = input) => {
  const send = vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(p);
  return { send, result: searchServioAvailability(connection, q, category, send) };
};
describe("Servio read-only availability and pricing", () => {
  it("uses tenant hotel/time settings and exact child ages; sums actual service charges in cents", async () => {
    const { send, result } = search(available(), prices());
    const response = await result;
    expect(send.mock.calls[0]).toEqual([connection.base, "fixture-secret", "GetRooms", expect.objectContaining({
      HotelID: 7, CompanyCodeID: 0, Adults: 2, Childs: 1, ChildAges: [6], DateArrival: input.checkIn, TimeArrival: "14:00",
    })]);
    expect(send.mock.calls[1]).toEqual([connection.base, "fixture-secret", "GetPrices", expect.objectContaining({
      RoomTypeIDs: [11], CompanyID: 0, ContractConditionID: 0, PaidType: 200, IsTouristTax: 1, AgentCategories: [], LoyaltyAuthCode: "",
    })]);
    expect(response).toMatchObject({ status: "complete", currency: "грн", hotelId: 7, query: input });
    expect(response.categories[0]).toMatchObject({ freeRooms: 2, mainPlaces: 3, rates: [{ total: 205.35, nonRefundable: true, saleAllowed: true }] });
    expect(response.categories[0].rates[0].charges).toHaveLength(3);
    expect(response.categories[0].rates[0].restrictions[0].message).toContain("600");
    expect(send.mock.calls.map(call => call[2])).toEqual(["GetRooms", "GetPrices"]);
    expect(JSON.stringify(response)).not.toContain("fixture-secret");
  });
  it("keeps CompanyID and CompanyCodeID distinct", async () => {
    const { send, result } = search(available(), prices(), { ...input, companyId: 9, companyCodeId: 22, conditionId: 4 });
    await result;
    expect(send.mock.calls[0][3].CompanyCodeID).toBe(22);
    expect(send.mock.calls[1][3]).toMatchObject({ CompanyID: 9, ContractConditionID: 4 });
  });
  it("does not ask prices or invent inventory when availability is empty", async () => {
    const { send, result } = search({ Result: 0, RoomTypes: [] }, prices());
    expect(await result).toMatchObject({ status: "complete", code: "no_categories", categories: [], currency: null });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([
    { Result: 1, Error: "fixture-secret" }, {},
    { Result: 0, RoomTypes: [{ ID: 999, FreeRoom: 2, MainPlacesCount: 2 }] },
    { Result: 0, RoomTypes: [{ ID: 11, FreeRoom: -1, MainPlacesCount: 2 }] },
    { Result: 0, RoomTypes: [{ ID: 11, FreeRoom: "2", MainPlacesCount: 2 }] },
  ])("reports availability errors without fabricating zero stock", async a => {
    const { send, result } = search(a, prices());
    const response = await result;
    expect(response).toMatchObject({ status: "failed", categories: [], currency: null });
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(response)).not.toContain("fixture-secret");
  });
  it.each([
    { Result: 1, Error: "fixture-secret" }, { ...prices(), ValuteShort: "" },
    { ...prices(), PriceLists: null },
  ])("preserves availability, but not fabricated prices, on a price error", async p => {
    const { result } = search(available(), p);
    const response = await result;
    expect(response).toMatchObject({ status: "partial", currency: null, categories: [{ id: 11, freeRooms: 2, rates: [] }] });
    expect(JSON.stringify(response)).not.toContain("fixture-secret");
  });
  it.each([NaN, -1, "100", 0.001, null])("rejects invalid actual prices %j instead of falling back to rack rate", async amount => {
    const p = prices(); p.PriceLists[0].RoomTypes[0].Services[0].PriceDates[0].Price = amount as any;
    expect(await search(available(), p).result).toMatchObject({ status: "partial", categories: [{ rates: [] }] });
  });
  it("does not publish a partial price list if another returned category is unknown", async () => {
    const p = prices();
    p.PriceLists[0].RoomTypes.push({ ...p.PriceLists[0].RoomTypes[0], ID: 999 });
    expect(await search(available(), p).result).toMatchObject({ status: "partial", currency: null, categories: [{ rates: [] }] });
  });
  it("preserves missing tariffs as unavailable, not zero cost", async () => {
    expect(await search(available(), { ...prices(), PriceLists: [] }).result).toMatchObject({
      status: "partial", code: "some_prices_missing", categories: [{ rates: [] }],
    });
  });
  it.each(["ClosedToSale", "ClosedToArrive", "EarlyReservation"])("shows %s and marks the tariff blocked", async key => {
    const p = prices();
    (p.PriceLists[0].RoomTypes[0].SaleRestrictions as any)[key] = { HasRestrictions: true, Message: "Заборона" };
    const response = await search(available(), p).result;
    expect(response.categories[0].rates[0]).toMatchObject({ saleAllowed: false, restrictions: expect.arrayContaining([expect.objectContaining({ code: key, blocksSale: true })]) });
  });
  it("compares minimum stay with the actual selected nights", async () => {
    const p = prices();
    (p.PriceLists[0].RoomTypes[0].SaleRestrictions as any).MinStay = { HasRestrictions: true, Days: 3, Message: "" };
    expect((await search(available(), p).result).categories[0].rates[0].saleAllowed).toBe(false);
  });
  it("missing restrictions mean unknown eligibility, not unrestricted sale", async () => {
    const p = prices();
    delete (p.PriceLists[0].RoomTypes[0] as any).SaleRestrictions;
    expect((await search(available(), p).result).categories[0].rates[0].saleAllowed).toBeNull();
  });
  it("unknown restrictions do not silently become saleable", async () => {
    const p = prices();
    (p.PriceLists[0].RoomTypes[0].SaleRestrictions as any).MaxStay = { Days: 1 };
    expect((await search(available(), p).result).categories[0].rates[0].saleAllowed).toBeNull();
  });
  it("zero inventory is blocked even if a tariff is returned", async () => {
    const a = available(); a.RoomTypes[0].FreeRoom = 0;
    expect((await search(a, prices()).result).categories[0].rates[0].saleAllowed).toBe(false);
  });
  it("distinguishes timeouts from empty availability", async () => {
    const send = vi.fn().mockRejectedValue(new Error("timeout"));
    expect(await searchServioAvailability(connection, input, category, send)).toMatchObject({ status: "failed", code: "availability_timeout" });
  });
});
describe("search boundary", () => {
  it("accepts a supported date/guest combination", () => expect(validServioSearch(input)).toBe(true));
  it.each([
    { ...input, checkOut: input.checkIn }, { ...input, checkIn: "2026-02-30" },
    { ...input, checkOut: "2027-02-01" }, { ...input, companyId: 1 }, { ...input, companyCodeId: 1 },
    { ...input, conditionId: 1 },
  ])("rejects invalid date and company combinations", q => expect(validServioSearch(q)).toBe(false));
  it.each([{ ...input, adults: 0 }, { ...input, childAges: [18] }, { ...input, childAges: [-1] }, { ...input, childAges: Array(11).fill(1) }])(
    "validates guest counts and each age before provider reads", q => expect(SearchBookingServioAvailabilityBody.safeParse(q).success).toBe(false));
});
