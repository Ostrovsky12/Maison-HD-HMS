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
import accommodationRouter from "../routes/accommodation.js";
import invoicesRouter from "../routes/invoices.js";
import financeRouter from "../routes/finance.js";
import { signToken } from "../lib/auth.js";

// ── Minimal test app ──────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/bookings", bookingsRouter);
app.use("/api/accommodation", accommodationRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/finance", financeRouter);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a promise-like chainable ORM builder that resolves to `rows`.
 * Supports all chain methods the routes use (.from, .where, .leftJoin,
 * .innerJoin, .orderBy, .limit).
 */
function makeChain(rows: any[] = [], onWhere?: (condition: any) => any[]) {
  let resultRows = rows;
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn((condition: any) => {
      if (onWhere) resultRows = onWhere(condition);
      return chain;
    }),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then(resolve: (v: any) => any, reject: (e: any) => any) {
      return Promise.resolve(resultRows).then(resolve, reject);
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

function tokenForUser(
  userId: number,
  organizationId: number,
  email: string,
) {
  return signToken({
    userId,
    email,
    role: "owner",
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

function makeBookingTransactionClient(
  committedBookings: any[],
  options: { failAccessCodeUpdate?: boolean; bookingId: number },
) {
  let pendingBooking: any = null;

  const client = {
    query: vi.fn(async (statement: string) => {
      const query = statement.replace(/\s+/g, " ").trim();
      if (query === "BEGIN") return { rows: [] };
      if (query.startsWith("SELECT u.id FROM units")) return { rows: [{ id: 10 }] };
      if (query.startsWith("SELECT id FROM units WHERE id")) return { rows: [{ id: 10 }] };
      if (query.startsWith("SELECT id FROM bookings")) return { rows: [] };
      if (query.startsWith("INSERT INTO bookings")) {
        pendingBooking = {
          id: options.bookingId,
          unit_id: 10,
          guest_id: null,
          organization_id: 1,
          check_in: "2026-05-01",
          check_out: "2026-05-03",
          checkin_time: "14:00",
          checkout_time: "12:00",
          status: "confirmed",
          source: "direct",
          total_amount: "1000.00",
          paid_amount: "0.00",
          payment_status: "unpaid",
          guests_count: 2,
          adults: 2,
          first_name: "Anna",
          last_name: "Test",
          phone: null,
          notes: null,
          guest_access_code: null,
          created_at: "2026-04-01T00:00:00.000Z",
        };
        return { rows: [pendingBooking] };
      }
      if (query.startsWith("SELECT name FROM units")) return { rows: [{ name: "Room 101" }] };
      if (query.startsWith("UPDATE bookings SET guest_access_code")) {
        if (options.failAccessCodeUpdate) throw new Error("guest access code update failed");
        return { rows: [] };
      }
      if (query === "COMMIT") {
        if (pendingBooking) committedBookings.push(pendingBooking);
        pendingBooking = null;
        return { rows: [] };
      }
      if (query === "ROLLBACK") {
        pendingBooking = null;
        return { rows: [] };
      }
      throw new Error(`Unexpected test query: ${query}`);
    }),
    release: vi.fn(),
  };

  return client;
}

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
  vi.mocked(db.insert).mockReset();
  vi.mocked(db.execute).mockReset();
  vi.mocked(pool.connect).mockReset();
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

describe("Booking creation — atomic response handling", () => {
  const payload = {
    unitId: 10,
    checkIn: "2026-05-01",
    checkOut: "2026-05-03",
    adults: 2,
    childrenUnder6: 1,
    childrenOver6: 1,
    totalAmount: 1000,
    lastName: "Test",
  };

  it("rolls back a post-insert failure so a retry commits only one booking", async () => {
    const committedBookings: any[] = [];
    const failedAttempt = makeBookingTransactionClient(committedBookings, {
      failAccessCodeUpdate: true,
      bookingId: 501,
    });
    const retry = makeBookingTransactionClient(committedBookings, { bookingId: 502 });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: 1 }]))
      .mockReturnValueOnce(makeChain([{ id: 10 }]))
      .mockReturnValueOnce(makeChain([{ id: 1 }]))
      .mockReturnValueOnce(makeChain([{ id: 10 }]));
    vi.mocked(pool.connect)
      .mockResolvedValueOnce(failedAttempt as any)
      .mockResolvedValueOnce(retry as any);

    const firstResponse = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send(payload);

    expect(firstResponse.status).toBe(500);
    expect(committedBookings).toEqual([]);
    expect(failedAttempt.query).toHaveBeenCalledWith("ROLLBACK");

    const retryResponse = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send(payload);

    expect(retryResponse.status).toBe(201);
    expect(committedBookings).toHaveLength(1);
    expect(committedBookings[0].id).toBe(502);
    expect(retry.query.mock.calls.find(([query]) => String(query).includes("INSERT INTO bookings"))?.[0])
      .toContain("children_under_6, children_over_6");
  });

  it("returns the persisted accommodation booking instead of reporting a server error", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [{ base_price: "500.00" }] } as any);

    const client = {
      query: vi.fn(async (statement: string) => {
        const query = statement.replace(/\s+/g, " ").trim();
        if (query === "BEGIN" || query === "COMMIT" || query === "ROLLBACK") return { rows: [] };
        if (query.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
        if (query.startsWith("SELECT 1 FROM bookings")) return { rows: [] };
        if (query.startsWith("SELECT 1 FROM accommodation_blocks")) return { rows: [] };
        if (query.startsWith("INSERT INTO bookings")) {
          return { rows: [{ id: 601, booking_ref: "BK-TEST" }] };
        }
        throw new Error(`Unexpected test query: ${query}`);
      }),
      release: vi.fn(),
    };
    vi.mocked(pool.connect).mockResolvedValueOnce(client as any);

    const response = await request(app)
      .post("/api/accommodation/bookings")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send({
        ...payload,
        guestsCount: 4,
        paidAmount: 0,
        paymentStatus: "unpaid",
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ booking: { id: 601, booking_ref: "BK-TEST" } });
    expect(vi.mocked(db.execute)).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(90421, $1)", [10]);
    expect(client.release).toHaveBeenCalledOnce();
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

// ── Cashbox isolation tests ───────────────────────────────────────────────────

describe("Tenant isolation — finance cashbox mutations", () => {
  it("rejects invalid cash movements before touching the database", async () => {
    const res = await request(app)
      .post("/api/finance/cashbox/99/cash-movement")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send({ type: "withdraw-all", amount: -500 });

    expect(res.status).toBe(400);
    expect(vi.mocked(pool.query)).not.toHaveBeenCalled();
  });

  it("cannot mutate another tenant's cashbox by guessing its ID", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    const res = await request(app)
      .post("/api/finance/cashbox/99/cash-movement")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send({ type: "in", amount: 250 });

    expect(res.status).toBe(404);
    expect(vi.mocked(pool.query)).toHaveBeenCalledWith(
      expect.stringContaining("organization_id = $3"),
      [250, 99, 1],
    );
  });

  it("cannot close another tenant's cashbox by guessing its ID", async () => {
    const client = {
      query: vi.fn(async (statement: string, params?: any[]) => {
        const query = statement.replace(/\s+/g, " ").trim();
        if (query === "BEGIN" || query === "ROLLBACK") return { rows: [] };
        if (query.startsWith("SELECT opening_balance")) {
          expect(params).toEqual([99, 1]);
          expect(query).toContain("organization_id = $2");
          return { rows: [] };
        }
        throw new Error(`Unexpected test query: ${query}`);
      }),
      release: vi.fn(),
    };
    vi.mocked(pool.connect).mockResolvedValueOnce(client as any);

    const res = await request(app)
      .post("/api/finance/cashbox/99/close")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send({ closingBalance: 100 });

    expect(res.status).toBe(404);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
    expect(client.query.mock.calls.some(([query]) => String(query).includes("UPDATE cashbox_sessions"))).toBe(false);
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

  it("creates invoices for two tenants, then blocks cross-tenant reads", async () => {
    const storedInvoices: any[] = [];
    let nextInvoiceId = 100;

    vi.mocked(db.insert).mockImplementation(() => ({
      values: vi.fn((values: any) => {
        const invoice = {
          ...values,
          id: nextInvoiceId++,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        storedInvoices.push(invoice);
        return {
          returning: vi.fn().mockResolvedValue([invoice]),
        };
      }),
    } as any));

    // Execute the route's organization filter against the in-memory records
    // instead of handing GET /api/invoices pre-filtered fixture rows.
    vi.mocked(db.select).mockImplementation(() =>
      makeChain(storedInvoices, (condition: any) => {
        if (condition?.op === "and") {
          const organizationCondition = condition.args.find(
            (arg: any) => arg?.op === "eq",
          );
          const organizationId = organizationCondition?.args?.[1];
          return storedInvoices.filter(
            (invoice) => invoice.organizationId === organizationId,
          );
        }

        const invoiceId = condition?.args?.[1];
        return storedInvoices.filter((invoice) => invoice.id === invoiceId);
      }),
    );

    const tenantAToken = tokenForUser(1001, 1, "tenant-a@example.test");
    const tenantBToken = tokenForUser(1002, 2, "tenant-b@example.test");

    const createA = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${tenantAToken}`)
      .send({
        invoiceNumber: "INV-TENANT-A",
        amount: 125,
        description: "Tenant A invoice",
      });
    const createB = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${tenantBToken}`)
      .send({
        invoiceNumber: "INV-TENANT-B",
        amount: 250,
        description: "Tenant B invoice",
      });

    expect(createA.status).toBe(201);
    expect(createB.status).toBe(201);
    expect(createA.body.organizationId).toBe(1);
    expect(createB.body.organizationId).toBe(2);

    const tenantAInvoices = await request(app)
      .get("/api/invoices")
      .set("Authorization", `Bearer ${tenantAToken}`);

    expect(tenantAInvoices.status).toBe(200);
    expect(tenantAInvoices.body).toHaveLength(1);
    expect(tenantAInvoices.body[0].invoiceNumber).toBe("INV-TENANT-A");
    expect(
      tenantAInvoices.body.some(
        (invoice: any) => invoice.id === createB.body.id,
      ),
    ).toBe(false);

    const crossTenantInvoice = await request(app)
      .get(`/api/invoices/${createB.body.id}`)
      .set("Authorization", `Bearer ${tenantAToken}`);

    expect(crossTenantInvoice.status).toBe(403);
    expect(crossTenantInvoice.body).toEqual({ error: "Forbidden" });
  });
});

// ── Auto-generation endpoint guard tests ─────────────────────────────────────

describe("Invoice auto-generation — tenant guard (organization_id required)", () => {
  it("POST /api/bookings/:id/invoice with super_admin null-org → 400, no DB insert", async () => {
    // super_admin bypasses requireBookingOwnership, so the org guard in the handler fires
    const token = tokenFor(null, "super_admin");

    const res = await request(app)
      .post("/api/bookings/100/invoice")
      .set("Authorization", `Bearer ${token}`)
      .send({ invoiceNumber: "INV-TEST", items: [], buyer: {}, seller: {} });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/organization_id/i);
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
  });

  it("POST /api/finance/invoices/generate with null-org → 400 before any DB call", async () => {
    const token = tokenFor(null, "owner");

    const res = await request(app)
      .post("/api/finance/invoices/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId: 100, type: "accommodation" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/organization_id/i);
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });
});

// ── Invoice creation tenant guard tests ──────────────────────────────────────

describe("Invoice creation — tenant guard (organization_id required)", () => {
  it("POST /api/invoices with null organizationId → 400, no insert attempted", async () => {
    // User has no org (super_admin acting without a tenant context)
    const token = tokenFor(null, "super_admin");

    const res = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 1000, currency: "UAH", invoiceType: "accommodation" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/organization_id/i);
    // No DB insert should have been attempted
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
  });

  it("POST /api/invoices with valid organizationId proceeds past the guard", async () => {
    // The insert mock — db.insert is a function that returns a chain
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{
        id: 99, invoiceNumber: "INV-TEST", status: "pending",
        amount: "1000.00", currency: "UAH",
      }]),
    };
    vi.mocked(db.insert).mockReturnValueOnce(insertChain as any);

    const token = tokenFor(1, "owner");

    const res = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 1000, currency: "UAH", invoiceType: "accommodation" });

    // Guard passed; response is 201 Created from the route
    expect(res.status).toBe(201);
    expect(vi.mocked(db.insert)).toHaveBeenCalledTimes(1);
  });
});
