/**
 * Tenant isolation tests — verifies that bookings and invoices are correctly
 * scoped per organization and that impersonation tokens cannot leak data.
 *
 * Covers:
 *  • Happy-path: org-scoped users see only their own data
 *  • Adversarial: org A token requesting org B's propertyId / unitId → empty
 *  • Null-org non-admin user → empty, no DB query fired
 *  • Calendar endpoint: foreign propertyId injection + zero-properties edge case
 *  • POST /api/bookings: foreign unitId / guestId injection → 403
 *  • POST /api/bookings/group: foreign unit/guest injection → 403
 *  • GET /api/bookings/pricing-preview: foreign unitId → 403
 *  • GET /api/bookings/check-draft: foreign unitId → hasDraft:false
 *  • Per-booking-ID routes: null-org non-super-admin → 403
 *  • Invoice org isolation
 *
 * @workspace/db, @workspace/db/schema, and drizzle-orm are replaced by shared
 * mock files via vitest.config.ts resolve.alias so all route files and this
 * test file share the same vi.fn() instances.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// Mock local libs with heavy transitive deps (schema builders, nodemailer, etc.)
vi.mock("../lib/notify.js", () => ({
  notifyBookingCreated: vi.fn().mockResolvedValue(undefined),
  notifyCheckIn: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// These imports resolve to the alias mocks defined in vitest.config.ts
import { db, pool } from "@workspace/db";
import bookingsRouter from "../routes/bookings.js";
import invoicesRouter from "../routes/invoices.js";
import { signToken } from "../lib/auth.js";

// ── Minimal test app ──────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/bookings", bookingsRouter);
app.use("/api/invoices", invoicesRouter);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a promise-like chainable ORM builder that resolves to `rows`.
 * Supports all chain methods the routes use (.from, .where, .leftJoin,
 * .innerJoin, .orderBy, .limit).
 */
function makeChain(rows: any[] = []) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then(resolve: (v: any) => any, reject: (e: any) => any) {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return chain;
}

function tokenFor(organizationId: number | null, role = "owner") {
  return signToken({
    userId: 99,
    email: "test@test.com",
    role,
    organizationId,
    propertyId: null,
  });
}

// ── Sample fixtures ───────────────────────────────────────────────────────────

const BOOKING_A = {
  id: 100, unitId: 10, guestId: null,
  checkIn: "2026-01-01", checkOut: "2026-01-05",
  checkinTime: null, checkoutTime: null,
  status: "confirmed", paymentStatus: "paid", source: "direct",
  guestsCount: 2, totalAmount: "500.00", paidAmount: "500.00",
  notes: null, createdAt: new Date().toISOString(), paymentLink: null,
  legalEntityId: null, guestAccessCode: null, checkinFormSubmitted: false,
  firstName: "Anna", lastName: "TenantA", middleName: null,
  phone: null, email: null, bookingRef: "A001",
  selectedAddons: [], adults: 2, childrenUnder6: 0, childrenOver6: 0,
  guestName: "Anna TenantA", guestPhone: null, guestEmail: null,
  unitName: "Room 101",
};

const BOOKING_B = {
  ...BOOKING_A, id: 200, unitId: 20,
  bookingRef: "B001", lastName: "TenantB", guestName: "Boris TenantB",
  unitName: "Room 201",
};

const INVOICE_A = {
  id: 1, invoiceNumber: "INV-001", bookingId: 100, guestId: null,
  invoiceType: "standard", status: "paid", amount: "500.00", currency: "UAH",
  description: "Room stay", dueDate: null, createdAt: new Date().toISOString(),
  legalEntityId: 1, counterpartyName: "Tenant A Corp",
  counterpartyEdrpou: null, buyerAddress: null, buyerVatNumber: null,
  invoiceItems: [], sellerSnapshot: null, notes: null,
  guestFirstName: null, guestLastName: null,
};

const INVOICE_B = {
  ...INVOICE_A, id: 2, invoiceNumber: "INV-002",
  legalEntityId: 2, counterpartyName: "Tenant B Corp",
};

// ── Test lifecycle ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(db.select).mockReset();
  vi.mocked(db.execute).mockReset();
  vi.mocked(pool.query).mockReset();
});

// ── Booking isolation tests ───────────────────────────────────────────────────

describe("Tenant isolation — bookings (happy path)", () => {
  it("impersonating tenant A returns only tenant A bookings (not tenant B)", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 1 }]))    // org A's authorised properties
      .mockReturnValueOnce(makeChain([
{
 id: 10 
}
]))   // org A's authorised units
      .mockReturnValueOnce(makeChain([BOOKING_A]));   // bookings for those units only

    const res = await request(app)
      .get("/api/bookings")
      .set("Authorization", `Bearer ${tokenFor(1)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(BOOKING_A.id);
    expect(res.body.some((b: any) => b.id === BOOKING_B.id)).toBe(false);
  });

  it("tenant B token sees only tenant B bookings, not tenant A's", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 2 }]))
      .mockReturnValueOnce(makeChain([{ id: 20 }]))
      .mockReturnValueOnce(makeChain([BOOKING_B]));

    const res = await request(app)
      .get("/api/bookings")
      .set("Authorization", `Bearer ${tokenFor(2)}`);

    expect(res.status).toBe(200);
    expect(res.body.some((b: any) => b.id === BOOKING_A.id)).toBe(false);
    expect(res.body.some((b: any) => b.id === BOOKING_B.id)).toBe(true);
  });
});

describe("Tenant isolation — bookings (adversarial scope injection)", () => {
  it("tenant A token + org B propertyId → empty (cross-tenant property rejected)", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 1 }])); // org A's properties (only call made)

    const res = await request(app)
      .get("/api/bookings?propertyId=2")
      .set("Authorization", `Bearer ${tokenFor(1)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(vi.mocked(db.select).mock.calls).toHaveLength(1);
  });

  it("tenant A token + org B unitId → empty (cross-tenant unit rejected)", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 1 }]))  // org A's properties
      .mockReturnValueOnce(makeChain([]));            // unit 20 NOT in org A's properties

    const res = await request(app)
      .get("/api/bookings?unitId=20")
      .set("Authorization", `Bearer ${tokenFor(1)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(vi.mocked(db.select).mock.calls).toHaveLength(2);
  });

  it("null-org non-super-admin user gets empty array (no DB queries fired)", async () => {
    const token = tokenFor(null, "owner");

    const res = await request(app)
      .get("/api/bookings")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });

  it("null-org non-super-admin with explicit propertyId still gets empty (bypass attempt)", async () => {
    const token = tokenFor(null, "manager");

    const res = await request(app)
      .get("/api/bookings?propertyId=1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });
});

// ── Booking creation isolation tests ─────────────────────────────────────────

describe("Tenant isolation — POST /api/bookings (foreign unitId rejection)", () => {
  it("tenant A token + org B unitId → 403, no insert attempted", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 1 }]))  // org A's properties
      .mockReturnValueOnce(makeChain([]));            // unit 20 NOT in property 1

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send({ unitId: 20, checkIn: "2026-02-01", checkOut: "2026-02-03", totalAmount: 500 });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select).mock.calls).toHaveLength(2);
  });

  it("null-org non-super-admin POST → 403, no DB query at all", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${tokenFor(null, "owner")}`)
      .send({ unitId: 10, checkIn: "2026-02-01", checkOut: "2026-02-03" });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });
});

describe("Tenant isolation — POST /api/bookings/group (foreign unitId rejection)", () => {
  it("tenant A token + org B unit in group → 403, no insert attempted", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 1 }]))   // org A's properties
      .mockReturnValueOnce(makeChain([{ id: 10 }]));  // only unit 10 valid; 20 missing → length mismatch

    const res = await request(app)
      .post("/api/bookings/group")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send({
        units: [{ unitId: 10, adults: 1 }, { unitId: 20, adults: 2 }],
        checkIn: "2026-02-01", checkOut: "2026-02-03",
      });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select).mock.calls).toHaveLength(2);
  });

  it("null-org non-super-admin group POST → 403, no DB query", async () => {
    const res = await request(app)
      .post("/api/bookings/group")
      .set("Authorization", `Bearer ${tokenFor(null, "manager")}`)
      .send({ units: [{ unitId: 10, adults: 1 }], checkIn: "2026-02-01", checkOut: "2026-02-03" });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });
});

// ── guestId cross-tenant injection tests ─────────────────────────────────────

describe("Tenant isolation — foreign guestId injection (single booking)", () => {
  it("tenant A token + org B guestId → 403 after unit auth, no insert", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 1 }]))   // org A's properties (unit auth)
      .mockReturnValueOnce(makeChain([{ id: 10 }]))  // unit 10 in property 1 (valid unit)
      .mockReturnValueOnce(makeChain([]));             // guest 500 NOT in org A → 403

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send({ unitId: 10, guestId: 500, checkIn: "2026-02-01", checkOut: "2026-02-03", totalAmount: 500 });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select).mock.calls).toHaveLength(3);
  });
});

describe("Tenant isolation — foreign guestId injection (group booking)", () => {
  it("tenant A token + org B guestId → 403 after unit auth, no insert", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 1 }]))   // org A's properties (unit auth)
      .mockReturnValueOnce(makeChain([{ id: 10 }]))  // all units valid (length match)
      .mockReturnValueOnce(makeChain([]));             // guest 500 NOT in org A → 403

    const res = await request(app)
      .post("/api/bookings/group")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send({
        units: [{ unitId: 10, adults: 2 }],
        guestId: 500,
        checkIn: "2026-02-01", checkOut: "2026-02-03",
      });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select).mock.calls).toHaveLength(3);
  });
});


// ── pricing-preview and check-draft isolation tests ──────────────────────────

describe("Tenant isolation — GET /api/bookings/pricing-preview", () => {
  it("tenant A token + org B unitId → 403, no unit data returned", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 1 }]))  // org A's properties
      .mockReturnValueOnce(makeChain([]));            // unit 20 NOT in property 1

    const res = await request(app)
      .get("/api/bookings/pricing-preview?unitId=20&checkIn=2026-02-01&checkOut=2026-02-03")
      .set("Authorization", `Bearer ${tokenFor(1)}`);

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select).mock.calls).toHaveLength(2);
  });

  it("null-org non-super-admin → 403, no DB query", async () => {
    const res = await request(app)
      .get("/api/bookings/pricing-preview?unitId=10&checkIn=2026-02-01&checkOut=2026-02-03")
      .set("Authorization", `Bearer ${tokenFor(null, "owner")}`);

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });
});

describe("Tenant isolation — GET /api/bookings/check-draft", () => {
  it("tenant A token + org B unitId → hasDraft:false, no draft PII returned", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 1 }]))  // org A's properties
      .mockReturnValueOnce(makeChain([]));            // unit 20 NOT in property 1

    const res = await request(app)
      .get("/api/bookings/check-draft?unitId=20&checkIn=2026-02-01&checkOut=2026-02-03")
      .set("Authorization", `Bearer ${tokenFor(1)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasDraft: false });
    expect(vi.mocked(db.select).mock.calls).toHaveLength(2);
  });

  it("null-org non-super-admin → hasDraft:false, no DB query", async () => {
    const res = await request(app)
      .get("/api/bookings/check-draft?unitId=10&checkIn=2026-02-01&checkOut=2026-02-03")
      .set("Authorization", `Bearer ${tokenFor(null, "reception")}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasDraft: false });
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });
});


// ── Per-booking ID isolation tests ───────────────────────────────────────────

describe("Tenant isolation — /:bookingId routes (null-org non-admin)", () => {
  it("GET /:bookingId → 403 for null-org non-super-admin (no DB query)", async () => {
    const res = await request(app)
      .get("/api/bookings/100")
      .set("Authorization", `Bearer ${tokenFor(null, "owner")}`);

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });

  it("DELETE /:bookingId → 403 for null-org non-super-admin (no mutation)", async () => {
    const res = await request(app)
      .delete("/api/bookings/100")
      .set("Authorization", `Bearer ${tokenFor(null, "manager")}`);

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });

  it("PATCH /:bookingId/status → 403 for null-org non-super-admin", async () => {
    const res = await request(app)
      .patch("/api/bookings/100/status")
      .set("Authorization", `Bearer ${tokenFor(null, "reception")}`)
      .send({ status: "confirmed" });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });
});


// ── Calendar booking isolation tests ─────────────────────────────────────────

describe("Tenant isolation — bookings/calendar (adversarial scope injection)", () => {
  it("tenant A token + org B propertyId → empty calendar (no units/bookings returned)", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 1 }])); // org A's authorised properties

    const res = await request(app)
      .get("/api/bookings/calendar?startDate=2026-01-01&propertyId=2")
      .set("Authorization", `Bearer ${tokenFor(1)}`);

    expect(res.status).toBe(200);
    expect(res.body.units).toEqual([]);
    expect(res.body.bookings).toEqual([]);
    expect(vi.mocked(db.select).mock.calls).toHaveLength(1);
    expect(vi.mocked(pool.query)).not.toHaveBeenCalled();
  });

  it("null-org non-super-admin → empty calendar, no DB queries", async () => {
    const res = await request(app)
      .get("/api/bookings/calendar?startDate=2026-01-01")
      .set("Authorization", `Bearer ${tokenFor(null, "manager")}`);

    expect(res.status).toBe(200);
    expect(res.body.units).toEqual([]);
    expect(res.body.bookings).toEqual([]);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
    expect(vi.mocked(pool.query)).not.toHaveBeenCalled();
  });

  it("org with zero properties → empty calendar (no full unit table scan)", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([])); // org has no properties

    const res = await request(app)
      .get("/api/bookings/calendar?startDate=2026-01-01")
      .set("Authorization", `Bearer ${tokenFor(99)}`);

    expect(res.status).toBe(200);
    expect(res.body.units).toEqual([]);
    expect(res.body.bookings).toEqual([]);
    expect(vi.mocked(db.select).mock.calls).toHaveLength(1);
    expect(vi.mocked(pool.query)).not.toHaveBeenCalled();
  });

  it("org with zero properties → empty calendar (no full unit table scan)", async () => {
    // A freshly provisioned tenant or impersonated user with no properties must
    // get an empty calendar, not all units from the DB.
    // Route: fetches org props → [] → returns early; pool.query never called.
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([])); // org has no properties

    const res = await request(app)
      .get("/api/bookings/calendar?startDate=2026-01-01")
      .set("Authorization", `Bearer ${tokenFor(99)}`);

    expect(res.status).toBe(200);
    expect(res.body.units).toEqual([]);
    expect(res.body.bookings).toEqual([]);
    // Only 1 DB call (org property lookup) — route returned before unit/booking queries
    expect(vi.mocked(db.select).mock.calls).toHaveLength(1);
    expect(vi.mocked(pool.query)).not.toHaveBeenCalled();
  });
});

// ── Per-booking ID isolation tests ───────────────────────────────────────────

describe("Tenant isolation — /:bookingId routes (null-org non-admin)", () => {
  it("GET /:bookingId → 403 for null-org non-super-admin (no DB query)", async () => {
    const res = await request(app)
      .get("/api/bookings/100")
      .set("Authorization", `Bearer ${tokenFor(null, "owner")}`);

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });

  it("DELETE /:bookingId → 403 for null-org non-super-admin (no mutation)", async () => {
    const res = await request(app)
      .delete("/api/bookings/100")
      .set("Authorization", `Bearer ${tokenFor(null, "manager")}`);

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });

  it("PATCH /:bookingId/status → 403 for null-org non-super-admin", async () => {
    const res = await request(app)
      .patch("/api/bookings/100/status")
      .set("Authorization", `Bearer ${tokenFor(null, "reception")}`)
      .send({ status: "confirmed" });

    expect(res.status).toBe(403);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });
});


// ── Invoice isolation tests ───────────────────────────────────────────────────

describe("Tenant isolation — invoices", () => {
  it("impersonating tenant A returns only org A invoices", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([INVOICE_A]));

    const res = await request(app)
      .get("/api/invoices")
      .set("Authorization", `Bearer ${tokenFor(1)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(INVOICE_A.id);
    expect(res.body.some((inv: any) => inv.id === INVOICE_B.id)).toBe(false);
  });

  it("org B token returns only org B invoices (not org A)", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([INVOICE_B]));

    const res = await request(app)
      .get("/api/invoices")
      .set("Authorization", `Bearer ${tokenFor(2)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(INVOICE_B.id);
    expect(res.body.some((inv: any) => inv.id === INVOICE_A.id)).toBe(false);
  });
});
