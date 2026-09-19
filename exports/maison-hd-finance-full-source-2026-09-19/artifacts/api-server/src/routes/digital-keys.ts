import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { eq, and, desc, asc } from "drizzle-orm";
import { pgTable, serial, integer, varchar, text, boolean, timestamp, date } from "drizzle-orm/pg-core";

const digitalKeysTable = pgTable("digital_keys", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  bookingId: integer("booking_id"),
  guestName: varchar("guest_name", { length: 255 }).notNull(),
  guestEmail: varchar("guest_email", { length: 255 }),
  guestPhone: varchar("guest_phone", { length: 50 }),
  unitName: varchar("unit_name", { length: 255 }),
  pinCode: varchar("pin_code", { length: 20 }).notNull(),
  qrPayload: text("qr_payload").notNull(),
  validFrom: timestamp("valid_from").notNull(),
  validUntil: timestamp("valid_until").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  checkinType: varchar("checkin_type", { length: 20 }).default("traditional"),
  isMobileCheckin: boolean("is_mobile_checkin").notNull().default(false),
  idVerified: boolean("id_verified").notNull().default(false),
  notes: text("notes"),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
  lastUsedAt: timestamp("last_used_at"),
});

const mobileCheckinsTable = pgTable("mobile_checkins", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  bookingId: integer("booking_id"),
  keyId: integer("key_id"),
  guestName: varchar("guest_name", { length: 255 }).notNull(),
  guestEmail: varchar("guest_email", { length: 255 }),
  guestPhone: varchar("guest_phone", { length: 50 }),
  idDocumentType: varchar("id_document_type", { length: 50 }),
  idDocumentNumber: varchar("id_document_number", { length: 100 }),
  specialRequests: text("special_requests"),
  eta: varchar("eta", { length: 50 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  approvedBy: integer("approved_by"),
});

const router = Router();
const getOrgId = (req: any) => req.user?.organizationId;

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ── Digital Keys ──────────────────────────────────────────────────────────────
router.get("/keys", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const rows = await db.select().from(digitalKeysTable)
      .where(eq(digitalKeysTable.organizationId, orgId))
      .orderBy(desc(digitalKeysTable.issuedAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/keys", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { guestName, guestEmail, guestPhone, unitName, validFrom, validUntil, checkinType, notes, bookingId } = req.body;
  if (!guestName || !validFrom || !validUntil) {
    return res.status(400).json({ error: "guestName, validFrom, validUntil required" });
  }
  const pin = generatePin();
  const slug = `${unitName || "ROOM"}`.replace(/\s+/g, "").toUpperCase();
  const qrPayload = `DOGODA-${slug}-${pin}-${new Date().getFullYear()}`;
  try {
    const [key] = await db.insert(digitalKeysTable).values({
      organizationId: orgId, bookingId, guestName, guestEmail, guestPhone,
      unitName, pinCode: pin, qrPayload, validFrom: new Date(validFrom), validUntil: new Date(validUntil),
      status: "active", checkinType: checkinType || "traditional", notes,
    }).returning();
    res.status(201).json(key);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/keys/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const upd: any = {};
  for (const f of ["guestName","guestEmail","guestPhone","unitName","validFrom","validUntil","status","idVerified","notes","checkinType"]) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  if (upd.status === "revoked" && !upd.revokedAt) upd.revokedAt = new Date();
  try {
    const [key] = await db.update(digitalKeysTable).set(upd)
      .where(and(eq(digitalKeysTable.id, id), eq(digitalKeysTable.organizationId, orgId))).returning();
    res.json(key);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Mobile Check-ins ──────────────────────────────────────────────────────────
router.get("/checkins", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const rows = await db.select().from(mobileCheckinsTable)
      .where(eq(mobileCheckinsTable.organizationId, orgId))
      .orderBy(desc(mobileCheckinsTable.submittedAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/checkins/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const { status } = req.body;
  const upd: any = { status };
  if (status === "approved") upd.approvedAt = new Date();
  try {
    const [ci] = await db.update(mobileCheckinsTable).set(upd)
      .where(and(eq(mobileCheckinsTable.id, id), eq(mobileCheckinsTable.organizationId, orgId))).returning();
    res.json(ci);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/stats", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const keys = await db.select().from(digitalKeysTable).where(eq(digitalKeysTable.organizationId, orgId));
    const checkins = await db.select().from(mobileCheckinsTable).where(eq(mobileCheckinsTable.organizationId, orgId));
    res.json({
      totalKeys: keys.length,
      activeKeys: keys.filter(k => k.status === "active").length,
      mobileCheckins: keys.filter(k => k.isMobileCheckin).length,
      pendingCheckins: checkins.filter(c => c.status === "pending").length,
      approvedCheckins: checkins.filter(c => c.status === "approved").length,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
