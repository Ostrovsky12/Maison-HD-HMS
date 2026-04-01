import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "@workspace/db";
import {
  externalConnectionsTable,
  importBatchesTable,
  importBatchItemsTable,
  syncConflictsTable,
  externalEntityMappingsTable,
  guestsTable,
  bookingsTable,
  unitsTable,
  propertiesTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { ServioAdapter, mapServioBookingToInternal } from "../lib/adapters/servio";

const router = Router();

// ── CONNECTIONS ──────────────────────────────────────────────────

/** GET /api/migration/connections — list all external connections for org */
router.get("/connections", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const connections = await db.select().from(externalConnectionsTable)
      .where(and(eq(externalConnectionsTable.organizationId, orgId), eq(externalConnectionsTable.isActive, true)))
      .orderBy(desc(externalConnectionsTable.createdAt));
    res.json(connections.map(c => ({ ...c, apiKey: c.apiKey ? "••••••••" : null, passwordHash: null })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** POST /api/migration/connections — create/save a new external connection */
router.post("/connections", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { systemSlug, systemName, displayName, baseUrl, apiKey, username, hotelCode, settings } = req.body;
    const [conn] = await db.insert(externalConnectionsTable).values({
      organizationId: orgId,
      systemSlug: systemSlug || "servio",
      systemName: systemName || "Servio HMS",
      displayName,
      baseUrl: baseUrl || "demo",
      apiKey,
      username,
      hotelCode,
      status: "pending",
      settings: settings || {},
      createdBy: req.user!.id,
    }).returning();
    res.json(conn);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** PATCH /api/migration/connections/:id — update connection */
router.patch("/connections/:id", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const id = parseInt(req.params.id);
    const { displayName, baseUrl, apiKey, username, hotelCode, settings, isCutoverMode } = req.body;
    const [updated] = await db.update(externalConnectionsTable)
      .set({ displayName, baseUrl, apiKey, username, hotelCode, settings, isCutoverMode, updatedAt: new Date() })
      .where(and(eq(externalConnectionsTable.id, id), eq(externalConnectionsTable.organizationId, orgId)))
      .returning();
    res.json({ ...updated, apiKey: updated.apiKey ? "••••••••" : null });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** POST /api/migration/connections/:id/test — test connection */
router.post("/connections/:id/test", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const id = parseInt(req.params.id);
    const [conn] = await db.select().from(externalConnectionsTable)
      .where(and(eq(externalConnectionsTable.id, id), eq(externalConnectionsTable.organizationId, orgId)));
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const adapter = new ServioAdapter({
      baseUrl: conn.baseUrl || "demo",
      apiKey: conn.apiKey || undefined,
      username: conn.username || undefined,
      hotelCode: conn.hotelCode || undefined,
    });

    const result = await adapter.testConnection();

    // Update connection status
    await db.update(externalConnectionsTable)
      .set({
        status: result.success ? "connected" : "error",
        lastTestAt: new Date(),
        lastTestError: result.error || null,
        metadata: result.success ? { hotelName: result.hotelName, totalGuests: result.totalGuests, totalBookings: result.totalBookings, totalRooms: result.totalRooms } : undefined,
        updatedAt: new Date(),
      })
      .where(eq(externalConnectionsTable.id, id));

    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** POST /api/migration/connections/:id/preview — get data preview */
router.post("/connections/:id/preview", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const id = parseInt(req.params.id);
    const [conn] = await db.select().from(externalConnectionsTable)
      .where(and(eq(externalConnectionsTable.id, id), eq(externalConnectionsTable.organizationId, orgId)));
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const adapter = new ServioAdapter({
      baseUrl: conn.baseUrl || "demo",
      apiKey: conn.apiKey || undefined,
      hotelCode: conn.hotelCode || undefined,
    });

    const preview = await adapter.previewData();
    res.json(preview);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── IMPORT BATCHES ───────────────────────────────────────────────

/** GET /api/migration/batches — list import batches */
router.get("/batches", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const batches = await db.select().from(importBatchesTable)
      .where(eq(importBatchesTable.organizationId, orgId))
      .orderBy(desc(importBatchesTable.createdAt))
      .limit(50);
    res.json(batches);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** POST /api/migration/batches — create import batch */
router.post("/batches", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { connectionId, batchType, entityTypes, dateRangeFrom, dateRangeTo, deduplicationMode, conflictMode, notes } = req.body;
    const [batch] = await db.insert(importBatchesTable).values({
      organizationId: orgId,
      connectionId: connectionId ? parseInt(connectionId) : null,
      batchType: batchType || "full",
      entityTypes: entityTypes || ["guests", "bookings", "rooms", "rates"],
      status: "pending",
      totalItems: 0,
      processedItems: 0,
      successItems: 0,
      failedItems: 0,
      conflictItems: 0,
      skippedItems: 0,
      dateRangeFrom,
      dateRangeTo,
      deduplicationMode: deduplicationMode || "phone_email",
      conflictMode: conflictMode || "flag",
      notes,
      createdBy: req.user!.id,
    }).returning();
    res.json(batch);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** GET /api/migration/batches/:id — get batch details */
router.get("/batches/:id", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const batchId = parseInt(req.params.id);
    const [batch] = await db.select().from(importBatchesTable)
      .where(and(eq(importBatchesTable.id, batchId), eq(importBatchesTable.organizationId, orgId)));
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    // Get item counts by status
    const itemStats = await db.select({
      status: importBatchItemsTable.status,
      count: sql<number>`count(*)::int`,
    }).from(importBatchItemsTable)
      .where(eq(importBatchItemsTable.batchId, batchId))
      .groupBy(importBatchItemsTable.status);

    res.json({ ...batch, itemStats });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** POST /api/migration/batches/:id/start — start the import job */
router.post("/batches/:id/start", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const batchId = parseInt(req.params.id);
    const [batch] = await db.select().from(importBatchesTable)
      .where(and(eq(importBatchesTable.id, batchId), eq(importBatchesTable.organizationId, orgId)));
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.status === "running") return res.status(409).json({ error: "Already running" });

    // Get connection
    const [conn] = batch.connectionId
      ? await db.select().from(externalConnectionsTable).where(eq(externalConnectionsTable.id, batch.connectionId))
      : [{ baseUrl: "demo", apiKey: null, hotelCode: null }] as any[];

    const adapter = new ServioAdapter({
      baseUrl: (conn as any)?.baseUrl || "demo",
      apiKey: (conn as any)?.apiKey || undefined,
      hotelCode: (conn as any)?.hotelCode || undefined,
    });

    // Mark batch as running
    await db.update(importBatchesTable)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(importBatchesTable.id, batchId));

    // Run import asynchronously
    runImportBatch(batchId, orgId, batch, adapter, conn).catch(err => {
      db.update(importBatchesTable)
        .set({ status: "failed", errorLog: err.message, completedAt: new Date() })
        .where(eq(importBatchesTable.id, batchId));
    });

    res.json({ message: "Import started", batchId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** POST /api/migration/batches/:id/cancel — cancel running batch */
router.post("/batches/:id/cancel", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const batchId = parseInt(req.params.id);
    await db.update(importBatchesTable)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(and(eq(importBatchesTable.id, batchId), eq(importBatchesTable.organizationId, orgId)));
    res.json({ message: "Cancelled" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** GET /api/migration/batches/:id/items — get batch items (paginated) */
router.get("/batches/:id/items", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const batchId = parseInt(req.params.id);
    const { status, entityType, page = "0", limit = "50" } = req.query as any;
    const offset = parseInt(page) * parseInt(limit);

    const whereConditions = [eq(importBatchItemsTable.batchId, batchId), eq(importBatchItemsTable.organizationId, orgId)];
    if (status) whereConditions.push(eq(importBatchItemsTable.status, status as any));
    if (entityType) whereConditions.push(eq(importBatchItemsTable.entityType, entityType as any));

    const items = await db.select().from(importBatchItemsTable)
      .where(and(...whereConditions))
      .orderBy(desc(importBatchItemsTable.createdAt))
      .limit(parseInt(limit))
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(importBatchItemsTable).where(and(...whereConditions));

    res.json({ items, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── CONFLICTS ────────────────────────────────────────────────────

/** GET /api/migration/conflicts — list unresolved conflicts */
router.get("/conflicts", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { batchId } = req.query as any;
    const conditions = [eq(syncConflictsTable.organizationId, orgId), sql`${syncConflictsTable.resolution} IS NULL`];
    if (batchId) conditions.push(eq(syncConflictsTable.batchId, parseInt(batchId)));

    const conflicts = await db.select().from(syncConflictsTable)
      .where(and(...conditions))
      .orderBy(desc(syncConflictsTable.createdAt))
      .limit(100);
    res.json(conflicts);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** PATCH /api/migration/conflicts/:id/resolve — resolve a conflict */
router.patch("/conflicts/:id/resolve", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const conflictId = parseInt(req.params.id);
    const { resolution, notes } = req.body;
    const [updated] = await db.update(syncConflictsTable)
      .set({ resolution, notes, resolvedBy: req.user!.id, resolvedAt: new Date() })
      .where(and(eq(syncConflictsTable.id, conflictId), eq(syncConflictsTable.organizationId, orgId)))
      .returning();
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** POST /api/migration/conflicts/bulk-resolve — bulk resolve conflicts */
router.post("/conflicts/bulk-resolve", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { conflictIds, resolution } = req.body;
    await db.update(syncConflictsTable)
      .set({ resolution, resolvedBy: req.user!.id, resolvedAt: new Date() })
      .where(and(eq(syncConflictsTable.organizationId, orgId), inArray(syncConflictsTable.id, conflictIds)));
    res.json({ message: `Resolved ${conflictIds.length} conflicts` });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── MAPPINGS ─────────────────────────────────────────────────────

/** GET /api/migration/mappings — get entity mappings */
router.get("/mappings", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { entityType } = req.query as any;
    const conditions = [eq(externalEntityMappingsTable.organizationId, orgId)];
    if (entityType) conditions.push(eq(externalEntityMappingsTable.entityType, entityType));

    const mappings = await db.select().from(externalEntityMappingsTable)
      .where(and(...conditions))
      .orderBy(desc(externalEntityMappingsTable.createdAt))
      .limit(200);
    res.json(mappings);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** GET /api/migration/stats — overall migration statistics */
router.get("/stats", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;

    const [batchStats] = await db.select({
      totalBatches: sql<number>`count(*)::int`,
      completedBatches: sql<number>`count(*) filter (where status = 'completed')::int`,
      totalImported: sql<number>`coalesce(sum(success_items), 0)::int`,
      totalConflicts: sql<number>`coalesce(sum(conflict_items), 0)::int`,
    }).from(importBatchesTable).where(eq(importBatchesTable.organizationId, orgId));

    const [mappingStats] = await db.select({
      totalMappings: sql<number>`count(*)::int`,
    }).from(externalEntityMappingsTable).where(eq(externalEntityMappingsTable.organizationId, orgId));

    const [unresolvedConflicts] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(syncConflictsTable).where(and(
      eq(syncConflictsTable.organizationId, orgId),
      sql`${syncConflictsTable.resolution} IS NULL`
    ));

    const connections = await db.select({
      id: externalConnectionsTable.id,
      systemName: externalConnectionsTable.systemName,
      displayName: externalConnectionsTable.displayName,
      status: externalConnectionsTable.status,
      isCutoverMode: externalConnectionsTable.isCutoverMode,
      lastTestAt: externalConnectionsTable.lastTestAt,
      lastSyncAt: externalConnectionsTable.lastSyncAt,
    }).from(externalConnectionsTable)
      .where(and(eq(externalConnectionsTable.organizationId, orgId), eq(externalConnectionsTable.isActive, true)));

    res.json({
      connections,
      ...batchStats,
      totalMappings: mappingStats.totalMappings,
      unresolvedConflicts: unresolvedConflicts.count,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── IMPORT JOB (async) ───────────────────────────────────────────

async function runImportBatch(
  batchId: number,
  orgId: number,
  batch: typeof importBatchesTable.$inferSelect,
  adapter: ServioAdapter,
  conn: any
) {
  const entityTypes: string[] = (batch.entityTypes as string[]) || ["guests", "bookings"];
  const conflictMode = batch.conflictMode || "flag";
  const dedupMode = batch.deduplicationMode || "phone_email";

  let totalItems = 0;
  let successItems = 0;
  let failedItems = 0;
  let conflictItems = 0;
  let skippedItems = 0;

  const updateProgress = async () => {
    await db.update(importBatchesTable).set({
      totalItems, processedItems: successItems + failedItems + conflictItems + skippedItems,
      successItems, failedItems, conflictItems, skippedItems,
    }).where(eq(importBatchesTable.id, batchId));
  };

  // ── Import ROOMS/UNITS first (needed for booking references) ──
  const unitExternalIdMap: Record<string, number> = {};
  if (entityTypes.includes("rooms")) {
    const rooms = await adapter.fetchRooms();
    totalItems += rooms.length;
    for (const room of rooms) {
      try {
        // Check if already mapped
        const [existing] = await db.select().from(externalEntityMappingsTable)
          .where(and(
            eq(externalEntityMappingsTable.organizationId, orgId),
            eq(externalEntityMappingsTable.externalSystem, "servio"),
            eq(externalEntityMappingsTable.entityType, "unit"),
            eq(externalEntityMappingsTable.externalId, room.id)
          )).limit(1);

        if (existing) {
          unitExternalIdMap[room.number] = existing.internalId;
          skippedItems++;
          await insertBatchItem(batchId, orgId, "unit", room.id, room, existing.internalId, "skipped", "skip", "Already mapped");
          continue;
        }

        // Create unit - find the first property for this org
        const [firstProp] = await db.select({ id: propertiesTable.id }).from(propertiesTable)
          .where(eq(propertiesTable.organizationId, orgId)).limit(1);
        const propertyId = firstProp?.id;
        if (!propertyId) { skippedItems++; continue; }

        const [unit] = await db.insert(unitsTable).values({
          propertyId,
          name: `${room.type} ${room.number}`,
          description: `Імпортовано з Servio. Тип: ${room.type}`,
          category: room.type,
          capacity: room.capacity,
          maxCapacity: room.capacity,
          status: room.status === "Maintenance" ? "maintenance" : "active",
        }).returning();

        unitExternalIdMap[room.number] = unit.id;

        await db.insert(externalEntityMappingsTable).values({
          organizationId: orgId, connectionId: conn?.id || null,
          externalSystem: "servio", entityType: "unit",
          internalId: unit.id, externalId: room.id,
          syncStatus: "synced", lastSyncedAt: new Date(), batchId,
        });

        await insertBatchItem(batchId, orgId, "unit", room.id, room, unit.id, "success", "create");
        successItems++;
      } catch (e: any) {
        await insertBatchItem(batchId, orgId, "unit", room.id, room, null, "failed", "create", e.message);
        failedItems++;
      }
    }
    await updateProgress();
  }

  // ── Import GUESTS ─────────────────────────────────────────────
  const guestExternalIdMap: Record<string, number> = {};
  if (entityTypes.includes("guests")) {
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const { items: guests, total } = await adapter.fetchGuests(page, 50);
      totalItems = Math.max(totalItems, total);
      hasMore = (page + 1) * 50 < total && guests.length === 50;
      page++;

      for (const guest of guests) {
        try {
          // Check if already mapped
          const [mapped] = await db.select().from(externalEntityMappingsTable)
            .where(and(
              eq(externalEntityMappingsTable.organizationId, orgId),
              eq(externalEntityMappingsTable.externalSystem, "servio"),
              eq(externalEntityMappingsTable.entityType, "guest"),
              eq(externalEntityMappingsTable.externalId, guest.id)
            )).limit(1);

          if (mapped) {
            guestExternalIdMap[guest.id] = mapped.internalId;
            skippedItems++;
            await insertBatchItem(batchId, orgId, "guest", guest.id, guest, mapped.internalId, "skipped", "skip", "Already mapped");
            continue;
          }

          // Deduplication: check by phone or email
          const dupeConditions: any[] = [eq(guestsTable.organizationId, orgId)];
          if (dedupMode !== "none") {
            if (guest.phone) dupeConditions.push(eq(guestsTable.phone, guest.phone));
          }
          const [existingGuest] = guest.phone
            ? await db.select().from(guestsTable).where(and(eq(guestsTable.organizationId, orgId), eq(guestsTable.phone, guest.phone))).limit(1)
            : [];

          let guestId: number;
          let action: string;

          if (existingGuest) {
            guestId = existingGuest.id;
            action = "merge";

            if (conflictMode === "flag") {
              conflictItems++;
              await db.insert(syncConflictsTable).values({
                organizationId: orgId, batchId, entityType: "guest",
                externalId: guest.id, internalId: existingGuest.id,
                conflictType: "duplicate",
                externalData: guest as any,
                internalData: existingGuest as any,
              });
              guestExternalIdMap[guest.id] = existingGuest.id;
              await insertBatchItem(batchId, orgId, "guest", guest.id, guest, existingGuest.id, "conflict", "merge", "Duplicate phone");
              continue;
            } else if (conflictMode === "prefer_external") {
              await db.update(guestsTable)
                .set({ firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone, email: guest.email })
                .where(eq(guestsTable.id, existingGuest.id));
              action = "update";
            }
          } else {
            const [newGuest] = await db.insert(guestsTable).values({
              organizationId: orgId,
              firstName: guest.firstName,
              lastName: guest.lastName,
              phone: guest.phone,
              email: guest.email,
              notes: guest.notes,
            }).returning();
            guestId = newGuest.id;
            action = "create";
          }

          guestExternalIdMap[guest.id] = guestId;

          await db.insert(externalEntityMappingsTable).values({
            organizationId: orgId, connectionId: conn?.id || null,
            externalSystem: "servio", entityType: "guest",
            internalId: guestId, externalId: guest.id,
            syncStatus: "synced", lastSyncedAt: new Date(),
            mappingConfidence: existingGuest ? "0.90" : "1.00", batchId,
          });

          await insertBatchItem(batchId, orgId, "guest", guest.id, guest, guestId, "success", action as any);
          successItems++;
        } catch (e: any) {
          await insertBatchItem(batchId, orgId, "guest", guest.id, guest, null, "failed", "create", e.message);
          failedItems++;
        }
      }

      await updateProgress();
      if (!hasMore) break;
    }
  }

  // ── Import BOOKINGS ───────────────────────────────────────────
  if (entityTypes.includes("bookings")) {
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const { items: bookings, total } = await adapter.fetchBookings(page, 50, batch.dateRangeFrom || undefined, batch.dateRangeTo || undefined);
      totalItems = Math.max(totalItems, total);
      hasMore = (page + 1) * 50 < total && bookings.length === 50;
      page++;

      for (const booking of bookings) {
        try {
          const [mapped] = await db.select().from(externalEntityMappingsTable)
            .where(and(
              eq(externalEntityMappingsTable.organizationId, orgId),
              eq(externalEntityMappingsTable.externalSystem, "servio"),
              eq(externalEntityMappingsTable.entityType, "booking"),
              eq(externalEntityMappingsTable.externalId, booking.id)
            )).limit(1);

          if (mapped) {
            skippedItems++;
            await insertBatchItem(batchId, orgId, "booking", booking.id, booking, mapped.internalId, "skipped", "skip", "Already imported");
            continue;
          }

          const mapped_booking = mapServioBookingToInternal(booking, unitExternalIdMap, guestExternalIdMap);

          if (!mapped_booking.unitId) {
            await insertBatchItem(batchId, orgId, "booking", booking.id, booking, null, "conflict", "skip", `Room ${booking.roomNumber} not found`);
            conflictItems++;
            continue;
          }

          const statusMap: Record<string, any> = {
            "confirmed": "confirmed", "pending": "pending", "checked_in": "checked_in",
            "checked_out": "checked_out", "cancelled": "cancelled",
          };

          const [newBooking] = await db.insert(bookingsTable).values({
            unitId: mapped_booking.unitId,
            guestId: mapped_booking.guestId,
            checkIn: mapped_booking.checkIn,
            checkOut: mapped_booking.checkOut,
            status: statusMap[mapped_booking.status] || "confirmed",
            adults: mapped_booking.adults,
            totalAmount: String(mapped_booking.totalAmount),
            source: (mapped_booking.source as any) || "direct",
            notes: mapped_booking.notes,
            lastName: booking.guestName?.split(" ")[0] || null,
            firstName: booking.guestName?.split(" ").slice(1).join(" ") || null,
          }).returning();

          await db.insert(externalEntityMappingsTable).values({
            organizationId: orgId, connectionId: conn?.id || null,
            externalSystem: "servio", entityType: "booking",
            internalId: newBooking.id, externalId: booking.id,
            syncStatus: "synced", lastSyncedAt: new Date(), batchId,
          });

          await insertBatchItem(batchId, orgId, "booking", booking.id, booking, newBooking.id, "success", "create");
          successItems++;
        } catch (e: any) {
          await insertBatchItem(batchId, orgId, "booking", booking.id, booking, null, "failed", "create", e.message);
          failedItems++;
        }
      }

      await updateProgress();
      if (!hasMore) break;
    }
  }

  // Mark batch complete
  await db.update(importBatchesTable).set({
    status: "completed",
    completedAt: new Date(),
    totalItems,
    processedItems: successItems + failedItems + conflictItems + skippedItems,
    successItems, failedItems, conflictItems, skippedItems,
  }).where(eq(importBatchesTable.id, batchId));
}

async function insertBatchItem(
  batchId: number,
  orgId: number,
  entityType: string,
  externalId: string,
  externalData: any,
  internalId: number | null,
  status: string,
  action: string,
  message?: string
) {
  await db.insert(importBatchItemsTable).values({
    batchId,
    organizationId: orgId,
    entityType: entityType as any,
    externalId,
    externalData,
    internalId: internalId || undefined,
    status: status as any,
    action: action as any,
    errorMessage: message && status === "failed" ? message : undefined,
    conflictReason: message && status === "conflict" ? message : undefined,
    processedAt: new Date(),
  });
}

export default router;
