import { describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", () => ({ pool: {} }));
import { bookingAdditionalServices } from "../lib/booking-additional-services.js";
import { engineConfig, publicEngineConfig } from "../lib/booking-engine.js";
import { reservationPayload } from "../lib/servio-reservation-protocol.js";
import { SaveBookingEngineSettingsBody } from "@workspace/api-zod";

describe("additional wishes configuration and Servio note", () => {
  it("preserves tenant edits, disablement and deletion across config reads", () => {
    const services = [{ id: "transfer", name: "Трансфер", description: "Уточніть час", enabled: false }];
    const config = engineConfig({ name: "Fixture", booking_engine_config: { additionalServices: services } });
    expect(config.additionalServices).toEqual(services);
    expect(publicEngineConfig(config).additionalServices).toEqual([]);
    expect(engineConfig({ booking_engine_config: { additionalServices: [] } }).additionalServices).toEqual([]);
    expect(engineConfig({ booking_engine_config: {} }).additionalServices).toHaveLength(2);
  });
  it("sanitizes lists and never shares one tenant's options with another", () => {
    expect(bookingAdditionalServices([
      { id: "a", name: "  Ліжко  ", enabled: true },
      { id: "a", name: "Duplicate", enabled: true },
      { id: "bad id", name: "Bad", enabled: true },
      { id: "empty", name: " ", enabled: true },
    ])).toEqual([{ id: "a", name: "Ліжко", description: "", enabled: true }]);
    const custom = engineConfig({ booking_engine_config: {
      additionalServices: [{ id: "custom", name: "Custom", description: "", enabled: true }],
    } });
    expect(publicEngineConfig(custom).additionalServices.map(item => item.id)).toEqual(["custom"]);
    expect(publicEngineConfig(engineConfig({})).additionalServices.map(item => item.id)).toEqual(["pet", "baby-cot"]);
  });
  it("settings schema rejects overlong, invalid or excessive options", () => {
    const base = engineConfig({});
    const item = { id: "pet", name: "З твариною", description: "", enabled: true };
    expect(SaveBookingEngineSettingsBody.safeParse({ ...base, displayName: "Hotel", additionalServices: [item] }).success).toBe(true);
    for (const additionalServices of [
      [{ ...item, name: "x".repeat(61) }], [{ ...item, id: "../bad" }], Array(11).fill(item),
    ]) expect(SaveBookingEngineSettingsBody.safeParse({ ...base, additionalServices }).success).toBe(false);
  });
  it("passes wishes and free text only as Comment without paid services or extra-bed changes", () => {
    const input = {
      checkIn: "2026-12-01", checkOut: "2026-12-02", adults: 2, childAges: [], useExtraBed: false,
      firstName: "Fixture", lastName: "Guest", categoryId: 1, companyId: 0, rateConditionId: 0,
      phone: "+380000000000", email: "fixture@example.invalid", priceListId: 1,
      specialRequests: "Додаткові побажання: З твариною; Дитяче ліжко.\nПізній заїзд",
    } as Parameters<typeof reservationPayload>[0];
    const payload = reservationPayload(input, 1, "14:00", "12:00", "fixture-id");
    expect(payload.Comment).toBe(`Maison HD fixture-id · ${input.specialRequests}`);
    expect(payload.IsExtraBedUsed).toBe(false);
    expect(payload).not.toHaveProperty("Services");
    expect(payload).not.toHaveProperty("Amount");
  });
});
