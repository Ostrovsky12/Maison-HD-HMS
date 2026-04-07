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

// ── CSV IMPORT ────────────────────────────────────────────────────

/** GET /api/migration/csv/template — download CSV template with examples */
router.get("/csv/template", requireAuth, (_req, res) => {
  const BOM = "\uFEFF";
  const lines = [
    "Підтвердження,Прізвище,Ім'я,По батькові,Телефон,Email,Кімната,Заїзд,Виїзд,Статус,Дорослих,Дітей до 6,Дітей 6+,Сума,Оплачено,Джерело,Примітки",
    "CONF-001,Петренко,Олексій,Іванович,+380501234567,petro@gmail.com,Будинок 1,2025-07-01,2025-07-05,CheckedOut,2,0,0,8000,8000,Телефон,",
    "CONF-002,Іванченко,Марія,,+380671234567,,Бунгало 3,2025-08-10,2025-08-15,Confirmed,3,1,0,12000,6000,Сайт,",
    "CONF-003,Шевченко,Андрій,Петрович,+380931234567,andrii@gmail.com,Стандарт 101,2025-09-01,2025-09-03,CheckedIn,2,0,0,4800,4800,Booking.com,VIP-гість",
  ];
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="servio_bookings_template.csv"',
  });
  res.send(BOM + lines.join("\r\n"));
});

/** POST /api/migration/csv/preview — parse CSV rows, match units, return preview */
router.post("/csv/preview", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { rows } = req.body as { rows: string[][] };

    if (!Array.isArray(rows) || rows.length < 2) {
      return res.status(400).json({ error: "CSV повинен містити заголовки та хоча б 1 рядок даних" });
    }

    // Load all units for the org (via property → organization)
    const orgUnits = await db.select({
      id: unitsTable.id,
      name: unitsTable.name,
      category: unitsTable.category,
      propertyId: unitsTable.propertyId,
    }).from(unitsTable)
      .innerJoin(propertiesTable, eq(propertiesTable.id, unitsTable.propertyId))
      .where(eq(propertiesTable.organizationId, orgId));

    // Flexible unit matcher: tries exact → substring → number-only
    function matchUnit(roomStr: string): { id: number; name: string } | null {
      if (!roomStr) return null;
      const normalized = roomStr.trim().toLowerCase();
      let found = orgUnits.find(u => u.name.toLowerCase() === normalized);
      if (found) return found;
      found = orgUnits.find(u => u.name.toLowerCase().includes(normalized));
      if (found) return found;
      found = orgUnits.find(u => normalized.includes(u.name.toLowerCase()));
      if (found) return found;
      const roomNum = normalized.replace(/\D+/g, "");
      if (roomNum) {
        found = orgUnits.find(u => u.name.replace(/\D+/g, "") === roomNum);
      }
      return found || null;
    }

    // Header detection helpers
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const colIdx = (...aliases: string[]): number => {
      for (const alias of aliases) {
        const i = headers.findIndex(h => h.includes(alias));
        if (i >= 0) return i;
      }
      return -1;
    };

    const cols = {
      confirmation: colIdx("підтвер", "confirm", "номер підтв"),
      lastName:     colIdx("прізвищ", "lastname", "фамілія"),
      firstName:    colIdx("ім'я", "ім`я", "firstname", "name"),
      middleName:   colIdx("по батьков", "patronymic", "middlename"),
      phone:        colIdx("телефон", "phone"),
      email:        colIdx("email", "пошта", "e-mail"),
      room:         colIdx("кімнат", "room", "юніт", "unit", "об'єкт"),
      checkIn:      colIdx("заїзд", "checkin", "прибуття", "дата заїзд"),
      checkOut:     colIdx("виїзд", "checkout", "відбуття", "дата виїзд"),
      status:       colIdx("статус", "status"),
      adults:       colIdx("дорослих", "adults"),
      childrenU6:   colIdx("до 6", "under6", "дітей до"),
      childrenO6:   colIdx("після 6", "6+", "over6", "дітей 6"),
      totalAmount:  colIdx("сума", "total", "amount", "вартість"),
      paidAmount:   colIdx("оплачено", "paid", "сплачено"),
      source:       colIdx("джерело", "source", "канал"),
      notes:        colIdx("примітк", "note", "comment"),
    };

    const get = (row: string[], col: number) => (col >= 0 && col < row.length ? (row[col] || "").trim() : "");

    const parseDate = (str: string): string | null => {
      if (!str) return null;
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
      const m = str.match(/^(\d{1,2})[.\\/](\d{1,2})[.\\/](\d{4})/);
      return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
    };

    const statusMap: Record<string, string> = {
      "checkedout": "checked_out", "виїхав": "checked_out", "виїхали": "checked_out", "виїзд": "checked_out",
      "checkedin": "checked_in", "заїхав": "checked_in", "заїхали": "checked_in", "заїзд": "checked_in",
      "confirmed": "confirmed", "підтверджено": "confirmed", "підтверджений": "confirmed", "confirm": "confirmed",
      "cancelled": "cancelled", "скасовано": "cancelled", "скасований": "cancelled", "cancel": "cancelled",
      "noshow": "cancelled", "no_show": "cancelled",
      "pending": "pending", "очікується": "pending",
    };

    const sourceMap: Record<string, string> = {
      "booking.com": "booking", "booking": "booking", "букінг": "booking",
      "airbnb": "airbnb", "ейрбнб": "airbnb",
      "телефон": "direct", "phone": "direct", "телефон/пошта": "direct",
      "direct": "direct", "прямий": "direct", "пряме": "direct",
      "сайт": "other", "website": "other", "instagram": "other",
      "telegram": "other", "viber": "other",
    };

    const dataRows = rows.slice(1).filter(r => r.some(c => c.trim()));
    const results = dataRows.map((row, i) => {
      const roomRaw = get(row, cols.room);
      const matchedUnit = matchUnit(roomRaw);
      const checkIn = parseDate(get(row, cols.checkIn));
      const checkOut = parseDate(get(row, cols.checkOut));
      const statusRaw = get(row, cols.status);
      const statusKey = statusRaw.toLowerCase().replace(/[^а-яіїєa-z_]/gi, "");
      const sourceRaw = get(row, cols.source).toLowerCase();
      const sourceKey = Object.keys(sourceMap).find(k => sourceRaw.includes(k));
      const totalAmt = parseFloat(get(row, cols.totalAmount).replace(/\s/g, "").replace(",", ".")) || 0;
      const paidAmt = parseFloat(get(row, cols.paidAmount).replace(/\s/g, "").replace(",", ".")) || 0;
      const adults = Math.max(1, parseInt(get(row, cols.adults)) || 1);
      const childrenU6 = parseInt(get(row, cols.childrenU6)) || 0;
      const childrenO6 = parseInt(get(row, cols.childrenO6)) || 0;

      return {
        rowIndex: i + 2,
        confirmationNo: get(row, cols.confirmation) || null,
        lastName:   get(row, cols.lastName) || null,
        firstName:  get(row, cols.firstName) || null,
        middleName: get(row, cols.middleName) || null,
        phone:      get(row, cols.phone) || null,
        email:      get(row, cols.email) || null,
        roomRaw,
        unitId:    matchedUnit?.id   || null,
        unitName:  matchedUnit?.name || null,
        unitMatched: !!matchedUnit,
        checkIn,
        checkOut,
        statusRaw,
        status: statusMap[statusKey] || "confirmed",
        adults,
        childrenUnder6: childrenU6,
        childrenOver6:  childrenO6,
        totalAmount: totalAmt,
        paidAmount:  paidAmt,
        paymentStatus: paidAmt >= totalAmt && totalAmt > 0 ? "paid" : paidAmt > 0 ? "partial" : "unpaid",
        source: (sourceKey ? sourceMap[sourceKey] : null) || "direct",
        notes: get(row, cols.notes) || null,
        isValid: !!matchedUnit && !!checkIn && !!checkOut,
      };
    });

    const matched  = results.filter(r => r.unitMatched).length;
    const valid    = results.filter(r => r.isValid).length;
    const unmatched = [...new Set(results.filter(r => !r.unitMatched && r.roomRaw).map(r => r.roomRaw))];

    res.json({
      totalRows: results.length,
      matched,
      valid,
      unmatchedRooms: unmatched,
      availableUnits: orgUnits.map(u => u.name).slice(0, 30),
      rows: results,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** POST /api/migration/csv/import — save valid parsed rows as bookings */
router.post("/csv/import", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { rows, skipExisting } = req.body as { rows: any[]; skipExisting?: boolean };

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Немає рядків для імпорту" });
    }

    let success = 0;
    let skipped = 0;
    let failed  = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (!row.isValid || !row.unitId || !row.checkIn || !row.checkOut) {
        failed++;
        const reason = !row.unitId ? `кімнату «${row.roomRaw}» не знайдено` : "невалідні дати";
        errors.push(`Рядок ${row.rowIndex}: ${reason}`);
        continue;
      }

      try {
        // Duplicate check by confirmation number (raw SQL — column exists in prod DB)
        if (row.confirmationNo && skipExisting !== false) {
          const dupResult = await db.execute<{ id: number }>(
            sql`SELECT id FROM bookings WHERE confirmation_no = ${row.confirmationNo} LIMIT 1`
          );
          const dupRows = Array.isArray(dupResult) ? dupResult : (dupResult as any)?.rows ?? [];
          if (dupRows.length > 0) { skipped++; continue; }
        }

        // Insert booking via raw SQL to use org-scoped + confirmation_no columns that exist in prod DB
        await db.execute(sql`
          INSERT INTO bookings (
            unit_id, check_in, check_out, status, payment_status, source,
            adults, children_under_6, children_over_6, guests_count,
            first_name, last_name, middle_name, phone, email,
            total_amount, paid_amount, notes,
            organization_id, confirmation_no,
            created_at, updated_at
          ) VALUES (
            ${row.unitId},
            ${row.checkIn}::date,
            ${row.checkOut}::date,
            ${row.status}::booking_status,
            ${row.paymentStatus}::payment_status,
            ${row.source}::booking_source,
            ${row.adults},
            ${row.childrenUnder6},
            ${row.childrenOver6},
            ${row.adults + row.childrenUnder6 + row.childrenOver6},
            ${row.firstName},
            ${row.lastName},
            ${row.middleName},
            ${row.phone},
            ${row.email},
            ${String(row.totalAmount)},
            ${String(row.paidAmount)},
            ${row.notes},
            ${orgId},
            ${row.confirmationNo},
            NOW(), NOW()
          )
        `);
        success++;
      } catch (e: any) {
        failed++;
        errors.push(`Рядок ${row.rowIndex}: ${e.message?.split("\n")[0] || e.message}`);
      }
    }

    res.json({ success, skipped, failed, errors: errors.slice(0, 30) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

