import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureGuestAccess, forgetGuestAccess, validRoute } from "../../../maison-hd/src/lib/servio-guest-payment";
const id = "00000000-0000-4000-8000-000000000001", token = "A".repeat(43);
let items, location, blocked;
beforeEach(() => {
  forgetGuestAccess("hotel", id);
  items = new Map(); blocked = false;
  location = { hash: "", pathname: `/booking/hotel/servio/${id}`, search: "?status=success" };
  vi.stubGlobal("window", { location, history: { state: null, replaceState: vi.fn(() => { location.hash = ""; }) } });
  vi.stubGlobal("sessionStorage", {
    setItem: (key, value) => { if (blocked) throw new Error("blocked"); items.set(key, value); },
    getItem: key => { if (blocked) throw new Error("blocked"); return items.get(key) ?? null; },
    removeItem: key => { items.delete(key); },
  });
});
describe("guest bearer capture and bank return", () => {
  it("strips the fragment before requests and restores only the same booking's token after a bank return", () => {
    location.hash = `#access=${token}`;
    expect(captureGuestAccess("hotel", id)).toEqual({ token, persisted: true });
    expect(location.hash).toBe("");
    expect(captureGuestAccess("hotel", id)).toEqual({ token, persisted: true });
    expect(captureGuestAccess("other", id).token).toBeNull();
    expect(captureGuestAccess("hotel", id.replace(/1$/, "2")).token).toBeNull();
  });
  it("does not fall back to old authorized data when a new fragment explicitly supplies an invalid token", () => {
    location.hash = `#access=${token}`; captureGuestAccess("hotel", id);
    location.hash = "#access=invalid";
    expect(captureGuestAccess("hotel", id).token).toBeNull();
    expect(captureGuestAccess("hotel", id).token).toBeNull();
  });
  it("rejects duplicate bearer parameters", () => {
    location.hash = `#access=${token}&access=${token}`;
    expect(captureGuestAccess("hotel", id).token).toBeNull();
    expect(location.hash).toBe("");
  });
  it("keeps access in memory under blocked storage and StrictMode double initialization", () => {
    blocked = true; location.hash = `#access=${token}`;
    expect(captureGuestAccess("hotel", id)).toEqual({ token, persisted: false });
    expect(captureGuestAccess("hotel", id)).toEqual({ token, persisted: false });
  });
  it("does not grant access from bank result query parameters and supports valid hotel slugs", () => {
    expect(captureGuestAccess("hotel", id).token).toBeNull();
    expect(validRoute("hotel_one", id)).toBe(true);
    expect(validRoute("готель", id)).toBe(true);
    expect(validRoute("..", id)).toBe(false);
    expect(validRoute("hotel/other", id)).toBe(false);
  });
});
