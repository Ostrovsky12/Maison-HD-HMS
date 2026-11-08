import { describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", () => ({ pool: {} }));
import { parseServicePointQr, resolveServicePoint } from "../lib/fb-service-points.js";

describe("shared service point QR", () => {
  it.each([
    "https://example.test/maison-hd/qr-menu/dogoda/14",
    "/maison-hd/qr-menu/dogoda/14",
    "https://example.test/maison-hd/qr-menu/dogoda/14/?ref=print",
  ])("reads the stable point identity, not the display number: %s", qr => {
    expect(parseServicePointQr(qr)).toEqual({ slug: "dogoda", id: 14 });
  });
  it.each(["14", "javascript:alert(1)", "https://example.test/qr-menu/dogoda",
    "https://example.test/qr-menu/dogoda/0", "https://example.test/qr-menu/dogoda/1.2",
    "https://example.test/qr-menu/dogoda/2147483648", "/qr-menu/%E0%A4/1",
    "https://user:password@example.test/qr-menu/dogoda/1", "/waiter/order/14"])(
    "rejects invalid, executable or receipt-bound QR: %s", qr => {
      expect(() => parseServicePointQr(qr)).toThrow();
    });
  it("never fetches the scanned URL and never accepts a different org slug", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [
      { id: 14, number: "1", slug: "own-org", group_id: 2, group_name: "Будинки", location: null },
    ] }) };
    await expect(resolveServicePoint(1, "https://untrusted.test/qr-menu/other-org/14", database))
      .rejects.toMatchObject({ status: 404 });
    expect(database.query).toHaveBeenCalledTimes(1);
    expect(database.query.mock.calls[0][1]).toEqual([14, 1]);
  });
});
