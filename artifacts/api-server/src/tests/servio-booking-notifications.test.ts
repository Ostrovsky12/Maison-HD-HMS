import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ query: vi.fn(), send: vi.fn(), config: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: f.query } }));
vi.mock("../lib/notify.js", () => ({ sendEmail: f.send, getEmailConfig: f.config }));
vi.mock("../lib/servio-sales.js", () => ({
  bookingMailbox: (slug: string, config: any) => config?.from === "welcome@dogoda.ua" ? config.from : null,
}));
vi.mock("../lib/logger.js", () => ({ logger: { warn: vi.fn() } }));
vi.mock("../lib/servio-reservations.js", () => ({
  attemptConnection: (row: any) => ({ notificationMailbox: "welcome@dogoda.ua", guestHotel: { hotelName: "DOGODA" } }),
}));
import { deliverServioBookingNotifications, servioBookingEmail } from "../lib/servio-booking-notifications.js";
let row: any, sent: Record<string, string>;
beforeEach(() => {
  vi.clearAllMocks(); sent = {};
  row = { id: "00000000-0000-4000-8000-000000000001", organization_id: 7, slug: "dogoda",
    state: "confirmed", account: "0000000007", payment: { status: "success", amountMinor: 20000, paymentId: "123" },
    payload: { input: { firstName: "<script>bad</script>", lastName: "Guest", email: "guest@example.invalid",
      phone: "+380000000000", checkIn: "2027-01-02", checkOut: "2027-01-04", adults: 2, childAges: [4, 9] },
      categoryName: "House", rateName: "NR", source: "public_booking" }, bill: { totalMinor: 20000 } };
  f.config.mockResolvedValue({ from: "welcome@dogoda.ua" });
  f.send.mockResolvedValue({ ok: true });
  f.query.mockImplementation(async (sql: string, values: any[]) => {
    if (sql.startsWith("SELECT")) return { rows: [row] };
    if (sql.includes("RETURNING id")) return { rowCount: sent[values[1]] === "sent" ? 0 : 1 };
    sent[values[1]] = values[2]; return { rowCount: 1 };
  });
});
describe("paid Servio booking email", () => {
  it("sends separate guest and hotel confirmations from the hotel's own mailbox", async () => {
    await deliverServioBookingNotifications();
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.send.mock.calls.map(([org, mail]) => [org, mail.to, mail.expectedFrom])).toEqual([
      [7, "welcome@dogoda.ua", "welcome@dogoda.ua"], [7, "guest@example.invalid", "welcome@dogoda.ua"],
    ]);
    expect(sent).toEqual({ admin: "sent", guest: "sent" });
    expect(f.send.mock.calls[0][1].subject).toContain("створене та сплачене");
  });
  it("does not resend an already delivered message on duplicate callbacks", async () => {
    await deliverServioBookingNotifications(); await deliverServioBookingNotifications();
    expect(f.send).toHaveBeenCalledTimes(2);
  });
  it("keeps the other recipient independent when one delivery fails", async () => {
    f.send.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    await deliverServioBookingNotifications();
    expect(sent).toEqual({ admin: "failed", guest: "sent" });
    await deliverServioBookingNotifications();
    expect(f.send).toHaveBeenCalledTimes(3); expect(sent.admin).toBe("sent");
  });
  it("warns administrators instead of claiming Servio confirmation after an ambiguous response", async () => {
    row.state = "review";
    await deliverServioBookingNotifications();
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.send.mock.calls[0][1].to).toBe("welcome@dogoda.ua");
    expect(f.send.mock.calls[0][1].subject).toContain("Потребує перевірки");
  });
  it("does not silently send from another sender", async () => {
    f.config.mockResolvedValue({ from: "other@example.invalid" });
    await deliverServioBookingNotifications();
    expect(f.send).not.toHaveBeenCalled(); expect(sent).toEqual({ admin: "failed", guest: "failed" });
  });
  it("escapes all guest content and includes amount, family, dates and non-fiscal wording", () => {
    const mail = servioBookingEmail(row, "DOGODA", "guest");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    for (const value of ["200.00", "2027-01-02", "2027-01-04", "4, 9", "не фіскальний чек"]) expect(mail.text).toContain(value);
    expect(mail.text).not.toContain("access=");
  });
});
