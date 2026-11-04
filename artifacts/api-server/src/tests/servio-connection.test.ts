import { describe, expect, it, vi } from "vitest";
import { checkServioConnection, servioBaseUrl, servioFingerprint, servioHotelId } from "../lib/servio-connection.js";

const base = "https://example.servio.support/ReservationService_1_10";
const categories = { Result: 0, Error: "", Count: 2, IDs: [11, 12], ClassNames: ["Будинок", "Номер"], HotelIDs: [7, 8] };

describe("Servio read-only protocol", () => {
  it("sends the vendor Ping scalar then reads only the selected hotel's categories", async () => {
    const send = vi.fn().mockResolvedValueOnce(123).mockResolvedValueOnce(categories);
    const result = await checkServioConnection(base, 7, "fixture-token", send);
    expect(send.mock.calls).toEqual([
      [base, "fixture-token", "Ping", 123],
      [base, "fixture-token", "GetRoomTypesList", { HotelID: 7 }],
    ]);
    expect(result).toMatchObject({ status: "connected", pingOk: true, categories: [{ id: 11, name: "Будинок", hotelId: 7 }] });
  });
  it.each(["123", { Result: 0 }, null, true])("does not accept a different Ping response: %j", async ping => {
    const send = vi.fn().mockResolvedValue(ping);
    expect(await checkServioConnection(base, 7, "fixture-token", send)).toMatchObject({ status: "failed", pingOk: false });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([
    null, {}, { ...categories, Result: 1, Error: "fixture-secret-must-not-leak" },
    { ...categories, Count: 3 }, { ...categories, IDs: [11, 11] },
    { ...categories, ClassNames: ["", "Номер"] }, { ...categories, HotelIDs: ["7", 8] },
  ])("reports partial access for an invalid category response", async raw => {
    const send = vi.fn().mockResolvedValueOnce(123).mockResolvedValueOnce(raw);
    const result = await checkServioConnection(base, 7, "fixture-token", send);
    expect(result).toMatchObject({ status: "partial", pingOk: true, categories: [] });
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
  });
  it("does not treat categories from another hotel as verified access", async () => {
    const send = vi.fn().mockResolvedValueOnce(123).mockResolvedValueOnce(categories);
    expect(await checkServioConnection(base, 99, "fixture-token", send)).toMatchObject({ status: "partial", code: "hotel_not_found" });
  });
  it("does not expose transport messages or credentials", async () => {
    const result = await checkServioConnection(base, 7, "fixture-token", vi.fn().mockRejectedValue(new Error("fixture-token")));
    expect(result).toMatchObject({ status: "failed", code: "connection_failed" });
    expect(JSON.stringify(result)).not.toContain("fixture-token");
  });
});

describe("Servio endpoint and saved-result boundary", () => {
  it("accepts only the supported vendor HTTPS endpoint", () => {
    expect(servioBaseUrl(base + "/")).toBe(base);
    expect(servioHotelId("7")).toBe(7);
  });
  it("ignores surrounding whitespace copied with the URL or HotelID", () => {
    expect(servioBaseUrl(` \n${base}\t `)).toBe(base);
    expect(servioHotelId(" 7 \n")).toBe(7);
    expect(servioHotelId("7\u00a0")).toBe(7);
    expect(() => servioHotelId("1 2")).toThrow();
  });
  it.each([
    "http://example.servio.support/ReservationService_1_10",
    "https://127.0.0.1/ReservationService_1_10",
    "https://example.servio.support.attacker.invalid/ReservationService_1_10",
    "https://evilservio.support/ReservationService_1_10",
    "https://user:password@example.servio.support/ReservationService_1_10",
    base + "?token=secret", base + "#fragment", base + "/Ping",
    "https://example.servio.support:8443/ReservationService_1_10",
  ])("rejects untrusted URLs before sending the token: %s", url => expect(() => servioBaseUrl(url)).toThrow());
  it.each(["", "0", "-1", "1.5", "abc", "2147483648"])("rejects invalid HotelID %s", id => expect(() => servioHotelId(id)).toThrow());
  it("invalidates verification for every upstream identity change", () => {
    const config = { provider: "servio", servioBaseUrl: base, servioHotelId: "7", servioToken: "encrypted-test-token" };
    for (const key of Object.keys(config) as (keyof typeof config)[]) {
      expect(servioFingerprint({ ...config, [key]: "different" })).not.toBe(servioFingerprint(config));
    }
  });
});
