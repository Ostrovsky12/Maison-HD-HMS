import { describe, expect, it, vi } from "vitest";
vi.mock("../db/schema/platform.js", () => ({ tenantSettings: {} }));
import { buildGuestConfirmationEmail } from "../lib/notify.js";

const booking = {
  bookingRef: "QA-ONLY", guestName: "Test Guest", unitName: "QA Room", propertyName: "QA Hotel",
  checkIn: "2030-05-10", checkOut: "2030-05-12", nights: 2, totalAmount: 2400, guestsCount: 2,
};

describe("booking-module guest messages", () => {
  it("never claims a pending application is a guaranteed booking", () => {
    const { html, text } = buildGuestConfirmationEmail({ ...booking, pending: true });
    expect(html).toContain("Заявка очікує підтвердження готелем");
    expect(text).toContain("Це ще не гарантоване бронювання");
    expect(html).not.toContain("Бронювання підтверджено!");
    expect(text).not.toContain("ваше бронювання підтверджено!");
  });
  it("uses the saved hotel arrival and departure times", () => {
    const { html, text } = buildGuestConfirmationEmail({ ...booking, pending: true, checkInTime: "16:00", checkOutTime: "11:00" });
    expect(html).toContain("Заїзд з 16:00, виїзд до 11:00");
    expect(text).toContain("(з 16:00)");
    expect(text).toContain("(до 11:00)");
  });
  it("preserves the existing confirmed template for legacy callers", () => {
    const { html } = buildGuestConfirmationEmail(booking);
    expect(html).toContain("Бронювання підтверджено!");
  });
});
