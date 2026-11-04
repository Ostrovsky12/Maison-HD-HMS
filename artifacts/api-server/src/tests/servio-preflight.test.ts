import { describe, expect, it } from "vitest";
import { CheckBookingServioPreflightBody, CheckBookingServioPreflightResponse } from "@workspace/api-zod";
import { engineConfig } from "../lib/booking-engine.js";
import { servioPreflight } from "../lib/servio-preflight.js";
import { BOOKING_TARIFF_POLICY } from "../lib/booking-tariff.js";

const input = {
  checkIn: "2026-12-01", checkOut: "2026-12-03", adults: 2, childAges: [6], useExtraBed: false,
  companyId: 0, companyCodeId: 0, conditionId: 0, categoryId: 11, priceListId: 90, rateConditionId: 1, propertyId: 4,
};
const config = engineConfig({ name: "Fixture", booking_engine_config: { provider: "servio", terms: "Hotel rules", privacy: "Privacy policy" } });
const merchant = { mapped: true, hasKeys: true, authenticated: true, mode: "live" as const };
function snapshot(): any {
  return { checkedAt: "2026-11-04T10:00:00Z", status: "complete", code: "availability_prices_read", message: "ok",
    query: input, hotelId: 7, currency: "грн", categories: [{
      id: 11, name: "House", freeRooms: 2, mainPlaces: 3, nearestDate: null,
      rates: [{ priceListId: 90, conditionId: 1, name: "NR Site", nonRefundable: true, specialRate: false, saleAllowed: true, total: 205.35, charges: [], restrictions: [] }],
    }] };
}
describe("Servio preflight never authorizes selling or accepts a tariff by its name", () => {
  it("checks current inputs, preserving the server tariff policy, while keeping reservation/payment disabled", () => {
    const response = servioPreflight(input, snapshot(), config, merchant, true);
    expect(response).toMatchObject({
      total: 205.35, currency: "грн", inputChecksPassed: true, canCreateReservation: false, canAcceptPayment: false,
      policyVersion: BOOKING_TARIFF_POLICY.version, acknowledgementText: BOOKING_TARIFF_POLICY.acknowledgementText,
    });
    expect(response.checks.filter(check => check.status === "unverified").map(check => check.code)).toEqual(["servio_seller_assignment", "reservation_workflow", "payment_confirmation", "controlled_test"]);
    expect(CheckBookingServioPreflightResponse.safeParse(response).success).toBe(true);
  });
  it("does not equate query condition 0 with selected tariff condition 1", () => {
    expect(servioPreflight(input, snapshot(), config, merchant, true).inputChecksPassed).toBe(true);
    const response = servioPreflight({ ...input, rateConditionId: 0 }, snapshot(), config, merchant, true);
    expect(response.total).toBeNull();
    expect(response.checks.find(check => check.code === "selected_rate")?.status).toBe("blocked");
  });
  it("blocks a refundable rate named NR Site", () => {
    const data = snapshot(); data.categories[0].rates[0].nonRefundable = false;
    const response = servioPreflight(input, data, config, merchant, true);
    expect(response.inputChecksPassed).toBe(false);
    expect(response.checks.find(check => check.code === "nonrefundable")?.status).toBe("blocked");
  });
  it.each([false, null])("does not allow blocked or unknown sale restrictions (%j)", allowed => {
    const data = snapshot(); data.categories[0].rates[0].saleAllowed = allowed;
    expect(servioPreflight(input, data, config, merchant, true).inputChecksPassed).toBe(false);
  });
  it("does not fabricate an amount or availability after provider failure", () => {
    const data = { ...snapshot(), status: "failed", message: "Servio failed", categories: [], currency: null };
    expect(servioPreflight(input, data, config, merchant, true)).toMatchObject({ total: null, currency: null, inputChecksPassed: false });
  });
  it("allows a valid selected tariff from a partially priced search without inventing other rates", () => {
    const data = snapshot(); data.status = "partial";
    data.categories.push({ id: 12, name: "Other", freeRooms: 2, mainPlaces: 2, rates: [] });
    expect(servioPreflight(input, data, config, merchant, true)).toMatchObject({ total: 205.35, inputChecksPassed: true });
  });
  it.each(["USD", "EUR", null, ""])("never assumes currency %j is UAH", currency => {
    const data = snapshot(); data.currency = currency;
    expect(servioPreflight(input, data, config, merchant, true).inputChecksPassed).toBe(false);
  });
  it.each([0, -1, NaN])("blocks amounts unsuitable for checkout (%j)", amount => {
    const data = snapshot(); data.categories[0].rates[0].total = amount;
    expect(servioPreflight(input, data, config, merchant, true).inputChecksPassed).toBe(false);
  });
  it.each([
    { ...merchant, mode: "test" as const }, { ...merchant, mode: null }, { ...merchant, authenticated: false },
    { ...merchant, hasKeys: false }, { ...merchant, mapped: false },
  ])("does not pass incomplete merchant readiness %j", seller => {
    expect(servioPreflight(input, snapshot(), config, seller, true).inputChecksPassed).toBe(false);
  });
  it("requires a configured HTTPS callback origin and both hotel policies", () => {
    expect(servioPreflight(input, snapshot(), config, merchant, false).inputChecksPassed).toBe(false);
    expect(servioPreflight(input, snapshot(), { ...config, terms: "" }, merchant, true).inputChecksPassed).toBe(false);
    expect(servioPreflight(input, snapshot(), { ...config, privacy: " " }, merchant, true).inputChecksPassed).toBe(false);
  });
  it("rejects invalid or missing selection IDs at the contract boundary", () => {
    expect(CheckBookingServioPreflightBody.safeParse(input).success).toBe(true);
    expect(CheckBookingServioPreflightBody.safeParse({ ...input, propertyId: 0 }).success).toBe(false);
    expect(CheckBookingServioPreflightBody.safeParse({ ...input, categoryId: undefined }).success).toBe(false);
  });
});
