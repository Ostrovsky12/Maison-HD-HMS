import { Router } from "express";
import { db } from "@workspace/db";
import {
  organizationsTable, usersTable, propertiesTable, unitsTable,
  guestsTable, bookingsTable, addonsTable,
} from "@workspace/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole, signToken } from "../lib/auth.js";

// ── In-memory feature flags store (resets on server restart, editable via API) ─
const FEATURE_FLAGS: Record<string, { enabled: boolean; description: string; rollout: number }> = {
  aiHub:             { enabled: true,  description: "AI Hub module (GPT-5 copilot, sales, insights)",          rollout: 100 },
  hotelTv:           { enabled: true,  description: "Hotel TV kiosk display module",                           rollout: 100 },
  guestPortal:       { enabled: true,  description: "Public guest portal / booking page",                      rollout: 100 },
  advancedAnalytics: { enabled: true,  description: "KPI analytics, forecasts, revenue reports",               rollout: 80  },
  automation:        { enabled: true,  description: "Automation triggers & workflows",                         rollout: 60  },
  channelManager:    { enabled: false, description: "OTA channel manager (Booking.com, Airbnb)",               rollout: 0   },
  revenueManagement: { enabled: true,  description: "Dynamic pricing & revenue optimization",                  rollout: 50  },
  spaModule:         { enabled: true,  description: "SPA & Wellness management",                               rollout: 100 },
  eventsModule:      { enabled: true,  description: "Events & banquets management",                            rollout: 100 },
  mobileApp:         { enabled: false, description: "Native mobile app for staff",                             rollout: 0   },
  multiProperty:     { enabled: true,  description: "Multi-property management (HQ view)",                    rollout: 100 },
  apiAccess:         { enabled: false, description: "Developer API access with keys",                          rollout: 0   },
  whiteLabel:        { enabled: false, description: "White-label branding for enterprise",                     rollout: 0   },
};

const router = Router();

// All routes require super_admin
router.use(requireAuth, requireRole("super_admin"));

// ── PLATFORM DASHBOARD ────────────────────────────────────────────────────────
router.get("/platform", async (_req, res) => {
  try {
    const db_ = db as any;

    const orgStats = await db_.$client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE subscription_status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE subscription_status = 'trial')::int AS trial,
        COUNT(*) FILTER (WHERE subscription_status = 'suspended')::int AS suspended,
        COUNT(*) FILTER (WHERE subscription_status = 'cancelled')::int AS cancelled,
        COUNT(*) FILTER (WHERE is_active = true)::int AS is_active,
        COUNT(*) FILTER (WHERE plan = 'basic')::int AS plan_basic,
        COUNT(*) FILTER (WHERE plan = 'pro')::int AS plan_pro,
        COUNT(*) FILTER (WHERE plan = 'enterprise')::int AS plan_enterprise,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS new_last_30d
      FROM organizations
    `);

    const userStats = await db_.$client.query(`
      SELECT COUNT(*)::int AS total_users, COUNT(DISTINCT organization_id)::int AS orgs_with_users
      FROM users WHERE organization_id IS NOT NULL AND is_active = true
    `);

    const propStats = await db_.$client.query(`
      SELECT COUNT(*)::int AS total_properties FROM properties WHERE is_active = true
    `);

    const bookingStats = await db_.$client.query(`
      SELECT
        COUNT(*)::int AS total_bookings,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS last_30d,
        COALESCE(SUM(total_amount) FILTER (WHERE created_at > NOW() - INTERVAL '30 days'), 0)::float AS revenue_30d
      FROM bookings
    `);

    const os = orgStats.rows[0];
    const us = userStats.rows[0];
    const ps = propStats.rows[0];
    const bs = bookingStats.rows[0];

    // Computed MRR based on plan distribution
    const MRR_BY_PLAN: Record<string, number> = { basic: 990, pro: 2490, enterprise: 4990 };
    const mrr = (os.plan_basic || 0) * MRR_BY_PLAN.basic
              + (os.plan_pro || 0) * MRR_BY_PLAN.pro
              + (os.plan_enterprise || 0) * MRR_BY_PLAN.enterprise;

    // Month-by-month tenant growth (last 6 months)
    const growthData = await db_.$client.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YY') AS month,
        DATE_TRUNC('month', created_at) AS month_date,
        COUNT(*)::int AS new_tenants
      FROM organizations
      WHERE created_at > NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at)
    `);

    res.json({
      orgs: os,
      users: us,
      properties: ps,
      bookings: bs,
      mrr,
      arr: mrr * 12,
      growth: growthData.rows,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── ALL TENANTS (with full detail) ───────────────────────────────────────────
router.get("/tenants", async (_req, res) => {
  try {
    const db_ = db as any;
    const rows = await db_.$client.query(`
      SELECT
        o.id, o.name, o.slug, o.plan, o.subscription_status, o.is_active,
        o.email, o.phone, o.address, o.max_units, o.max_users,
        o.created_at, o.trial_ends_at, o.subscription_ends_at,
        (SELECT COUNT(*)::int FROM users u WHERE u.organization_id = o.id AND u.is_active = true) AS user_count,
        (SELECT COUNT(*)::int FROM properties p WHERE p.organization_id = o.id AND p.is_active = true) AS property_count,
        (SELECT COUNT(*)::int FROM bookings b JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id WHERE p.organization_id = o.id AND b.created_at > NOW() - INTERVAL '30 days') AS bookings_30d,
        (SELECT COALESCE(SUM(b.total_amount), 0)::float FROM bookings b JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id WHERE p.organization_id = o.id AND b.created_at > NOW() - INTERVAL '30 days') AS revenue_30d,
        (SELECT name FROM users u WHERE u.organization_id = o.id AND u.role = 'owner' LIMIT 1) AS owner_name,
        (SELECT email FROM users u WHERE u.organization_id = o.id AND u.role = 'owner' LIMIT 1) AS owner_email
      FROM organizations o
      ORDER BY o.created_at DESC
    `);

    res.json({ tenants: rows.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── TENANT DETAIL ─────────────────────────────────────────────────────────────
router.get("/tenants/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db_ = db as any;

    const orgRow = await db_.$client.query(
      `SELECT id, name, slug, plan, subscription_status, is_active, email, phone, address, max_units, max_users, created_at, trial_ends_at, subscription_ends_at, enabled_modules FROM organizations WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!orgRow.rows.length) return res.status(404).json({ error: "Not found" });

    const members = await db_.$client.query(
      `SELECT id, name, email, role, is_active, created_at FROM users WHERE organization_id = $1 ORDER BY created_at`,
      [id]
    );

    const properties = await db_.$client.query(
      `SELECT id, name, type, address, is_active, created_at FROM properties WHERE organization_id = $1 ORDER BY created_at`,
      [id]
    );

    const invoices = await db_.$client.query(
      `SELECT * FROM subscription_invoices WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [id]
    );

    const usageStats = await db_.$client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM bookings b JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id WHERE p.organization_id = $1) AS total_bookings,
        (SELECT COUNT(*)::int FROM bookings b JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id WHERE p.organization_id = $1 AND b.created_at > NOW() - INTERVAL '30 days') AS bookings_30d,
        (SELECT COUNT(*)::int FROM guests WHERE organization_id = $1) AS total_guests,
        (SELECT COUNT(*)::int FROM units u JOIN properties p ON u.property_id = p.id WHERE p.organization_id = $1) AS unit_count
    `, [id]);

    res.json({
      org: orgRow.rows[0],
      members: members.rows,
      properties: properties.rows,
      invoices: invoices.rows,
      usage: usageStats.rows[0] || {},
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── UPDATE TENANT (plan, status, feature flags) ───────────────────────────────
router.patch("/tenants/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { plan, subscriptionStatus, isActive, featureFlags, enabledModules, note } = req.body;
    const db_ = db as any;

    const setClauses: string[] = [];
    const vals: any[] = [id];

    if (plan !== undefined) {
      const limits: Record<string, { max_units: number; max_users: number }> = {
        basic: { max_units: 30, max_users: 5 },
        pro: { max_units: 100, max_users: 20 },
        enterprise: { max_units: 9999, max_users: 9999 },
      };
      vals.push(plan);
      setClauses.push(`plan = $${vals.length}`);
      if (limits[plan]) {
        vals.push(limits[plan].max_units);
        setClauses.push(`max_units = $${vals.length}`);
        vals.push(limits[plan].max_users);
        setClauses.push(`max_users = $${vals.length}`);
      }
    }
    if (subscriptionStatus !== undefined) {
      vals.push(subscriptionStatus);
      setClauses.push(`subscription_status = $${vals.length}`);
    }
    if (isActive !== undefined) {
      vals.push(isActive);
      setClauses.push(`is_active = $${vals.length}`);
    }
    if (enabledModules !== undefined) {
      // Auto-include sub-modules: enabling "fb" also enables fb_pos and fb_warehouse
      let mods = enabledModules;
      if (Array.isArray(mods) && mods.includes("fb")) {
        if (!mods.includes("fb_pos")) mods = [...mods, "fb_pos"];
        if (!mods.includes("fb_warehouse")) mods = [...mods, "fb_warehouse"];
      }
      vals.push(JSON.stringify(mods));
      setClauses.push(`enabled_modules = $${vals.length}`);
    }

    if (setClauses.length === 0) return res.json({ message: "No changes" });

    await db_.$client.query(
      `UPDATE organizations SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $1`,
      vals
    );

    const updated = await db_.$client.query(
      `SELECT id, name, slug, plan, subscription_status, is_active, email, max_units, max_users, enabled_modules FROM organizations WHERE id = $1`, [id]
    );
    res.json(updated.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── SYSTEM HEALTH ─────────────────────────────────────────────────────────────
router.get("/health", async (_req, res) => {
  try {
    const db_ = db as any;
    const t0 = Date.now();
    await db_.$client.query("SELECT 1");
    const dbLatency = Date.now() - t0;

    const tableStats = await db_.$client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM organizations) AS orgs,
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM bookings) AS bookings,
        (SELECT COUNT(*)::int FROM guests) AS guests,
        (SELECT COUNT(*)::int FROM properties) AS properties
    `);

    const integrations = {
      openai: !!process.env.OPENAI_API_KEY,
      liqpay: !!(process.env.LIQPAY_PUBLIC_KEY && process.env.LIQPAY_PRIVATE_KEY),
      smtp: !!process.env.SMTP_HOST,
      telegram: !!process.env.TELEGRAM_BOT_TOKEN,
      stripe: !!process.env.STRIPE_SECRET_KEY,
    };

    const memUsage = process.memoryUsage();

    res.json({
      status: "healthy",
      uptime: Math.floor(process.uptime()),
      dbLatencyMs: dbLatency,
      dbStatus: dbLatency < 100 ? "healthy" : dbLatency < 500 ? "degraded" : "critical",
      nodeVersion: process.version,
      memoryUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      memoryTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      tableStats: tableStats.rows[0],
      integrations,
      checkedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ status: "error", error: e.message });
  }
});

// ── PLATFORM FEATURE FLAGS ────────────────────────────────────────────────────
router.get("/feature-flags", (_req, res) => {
  res.json({ flags: FEATURE_FLAGS });
});

router.patch("/feature-flags/:key", (req, res) => {
  const { key } = req.params;
  const { enabled, rollout } = req.body;
  if (!FEATURE_FLAGS[key]) {
    res.status(404).json({ error: "Flag not found" });
    return;
  }
  if (typeof enabled === "boolean") FEATURE_FLAGS[key].enabled = enabled;
  if (typeof rollout === "number") FEATURE_FLAGS[key].rollout = Math.min(100, Math.max(0, rollout));
  res.json({ key, flag: FEATURE_FLAGS[key] });
});

// ── SUPPORT TICKETS PLACEHOLDER ───────────────────────────────────────────────
router.get("/support", async (_req, res) => {
  try {
    const db_ = db as any;
    const rows = await db_.$client.query(`
      SELECT st.*, o.name AS org_name
      FROM support_tickets st
      LEFT JOIN organizations o ON o.id = st.organization_id
      ORDER BY st.created_at DESC
      LIMIT 50
    `);
    const tickets = rows.rows;
    const stats = {
      open:           tickets.filter((t: any) => t.status === "open").length,
      inProgress:     tickets.filter((t: any) => t.status === "in_progress").length,
      resolved:       tickets.filter((t: any) => t.status === "resolved").length,
      avgResponseHours: 4.2,
    };
    res.json({ tickets, stats });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/support", async (req, res) => {
  try {
    const db_ = db as any;
    const { organizationId, orgName, subject, description, priority, assignedTo } = req.body;
    if (!subject) { res.status(400).json({ error: "subject required" }); return; }
    const r = await db_.$client.query(`
      INSERT INTO support_tickets (organization_id, org_name, subject, description, priority, assigned_to, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'open') RETURNING *
    `, [organizationId || null, orgName || null, subject, description || null, priority || "medium", assignedTo || "Support"]);
    res.status(201).json({ ticket: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/support/:id", async (req, res) => {
  try {
    const db_ = db as any;
    const id = parseInt(req.params.id);
    const { status, assignedTo, priority } = req.body;
    const sets: string[] = ["updated_at = NOW()"];
    const vals: any[] = [id];
    if (status)     { vals.push(status);     sets.push(`status = $${vals.length}`); }
    if (assignedTo) { vals.push(assignedTo); sets.push(`assigned_to = $${vals.length}`); }
    if (priority)   { vals.push(priority);   sets.push(`priority = $${vals.length}`); }
    if (status === "resolved") sets.push("resolved_at = NOW()");
    const r = await db_.$client.query(
      `UPDATE support_tickets SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, vals
    );
    if (!r.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ticket: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── BILLING OVERVIEW ──────────────────────────────────────────────────────────
router.get("/billing", async (_req, res) => {
  try {
    const db_ = db as any;

    const invoices = await db_.$client.query(`
      SELECT si.*, o.name AS org_name, o.plan
      FROM subscription_invoices si
      JOIN organizations o ON o.id = si.organization_id
      ORDER BY si.created_at DESC
      LIMIT 20
    `);

    res.json({
      invoices: invoices.rows,
      summary: {
        totalInvoiced: invoices.rows.reduce((s: number, r: any) => s + parseFloat(r.total || 0), 0),
        pendingCount: invoices.rows.filter((r: any) => r.status === "pending").length,
        paidCount: invoices.rows.filter((r: any) => r.status === "paid").length,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── PROVISION DOGODA TENANT ───────────────────────────────────────────────────
// Idempotent: sets up or repairs the ДОГОДА tenant on any environment
router.post("/provision-dogoda", async (_req, res) => {
  try {
    const db_ = db as any;
    const q = (sql: string, params: any[] = []) => db_.$client.query(sql, params);
    const hp = (p: string) => bcrypt.hash(p, 10);
    const d = (offset: number) => {
      const dt = new Date(); dt.setHours(0,0,0,0); dt.setDate(dt.getDate() + offset);
      return dt.toISOString().split("T")[0];
    };

    // 1. Upsert org
    const orgRes = await q(
      `INSERT INTO organizations (name, slug, plan, max_units, max_users, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, plan=EXCLUDED.plan
       RETURNING id`,
      ["Котеджний комплекс ДОГОДА", "dogoda", "pro", 200, 20]
    );
    const orgId: number = orgRes.rows[0].id;

    // 2. Upsert admin user
    const adminHash = await hp("Dogoda2026!");
    await q(
      `INSERT INTO users (email, name, password_hash, role, organization_id, is_active)
       VALUES ($1, $2, $3, 'owner', $4, true)
       ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash,
         role='owner', organization_id=$4, is_active=true`,
      ["admin@dogoda.com.ua", "Дмитро Головко", adminHash, orgId]
    );

    // 3. Upsert reception user
    const recHash = await hp("reception123");
    await q(
      `INSERT INTO users (email, name, password_hash, role, organization_id, is_active)
       VALUES ($1, $2, $3, 'reception', $4, true)
       ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash,
         role='reception', organization_id=$4, is_active=true`,
      ["reception@dogoda.com.ua", "Рецепція ДОГОДА", recHash, orgId]
    );

    // 4. Find or create property
    const existProp = await q(
      `SELECT id FROM properties WHERE organization_id=$1 ORDER BY id LIMIT 1`, [orgId]
    );
    let propId: number;
    if (existProp.rows.length > 0) {
      propId = existProp.rows[0].id;
      // Update property details
      await q(`UPDATE properties SET name=$1, type='house', address=$2, is_active=true WHERE id=$3`,
        ["Котеджний комплекс ДОГОДА", "с. Дзвінкове, Київська обл., 08620", propId]);
    } else {
      const newProp = await q(
        `INSERT INTO properties (organization_id, name, type, description, address, is_active)
         VALUES ($1, $2, 'house', $3, $4, true) RETURNING id`,
        [orgId, "Котеджний комплекс ДОГОДА", "Котеджний комплекс у с. Дзвінкове, Київська обл., 08620", "с. Дзвінкове, Київська обл., 08620"]
      );
      propId = newProp.rows[0].id;
    }

    // Update users' property_id
    await q(`UPDATE users SET property_id=$1 WHERE email IN ($2, $3)`, [propId, "admin@dogoda.com.ua", "reception@dogoda.com.ua"]);

    // 5. Check units
    const unitCount = await q(`SELECT COUNT(*)::int AS cnt FROM units WHERE property_id=$1`, [propId]);
    let unitsStatus = "already existed";

    if (unitCount.rows[0].cnt < 12) {
      await q(`DELETE FROM bookings WHERE unit_id IN (SELECT id FROM units WHERE property_id=$1)`, [propId]);
      await q(`DELETE FROM units WHERE property_id=$1`, [propId]);

      const cottages = [
        ["Котедж 1 (STD)", "STD Стандарт", 4, "2800"],
        ["Котедж 2 (STD)", "STD Стандарт", 4, "2800"],
        ["Котедж 3 (STD)", "STD Стандарт", 4, "2800"],
        ["Котедж 4 (DLX)", "DLX Делюкс",  6, "3800"],
        ["Котедж 5 (DLX)", "DLX Делюкс",  6, "3800"],
        ["Котедж 6 (DLX)", "DLX Делюкс",  6, "3800"],
        ["Котедж 7 (VIP)", "VIP",          8, "5500"],
        ["Котедж 8 (VIP)", "VIP",          8, "5500"],
        ["Котедж 9 (VIP)", "VIP",          8, "5500"],
        ["Котедж 10 (EUR)", "EUR Євро",   10, "7200"],
        ["Котедж 11 (EUR)", "EUR Євро",   10, "7200"],
        ["Котедж 12 (EUR)", "EUR Євро",   10, "7200"],
      ];

      const unitIds: number[] = [];
      for (const [name, category, capacity, price] of cottages) {
        const r = await q(
          `INSERT INTO units (property_id, name, category, capacity, base_price)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [propId, name, category, capacity, price]
        );
        unitIds.push(r.rows[0].id);
      }
      unitsStatus = `created ${unitIds.length} cottages`;

      // Addons
      await q(`DELETE FROM addons WHERE organization_id=$1`, [orgId]);
      for (const [name, desc, price, unit] of [
        ["Баня/сауна", "Приватна баня на 2 год", "500", "per session"],
        ["Барбекю-набір", "Мангал + вугілля", "200", "per session"],
        ["Трансфер Коломия", "Трансфер від/до Коломиї", "600", "per trip"],
      ]) {
        await q(`INSERT INTO addons (organization_id, name, description, price, unit) VALUES ($1,$2,$3,$4,$5)`,
          [orgId, name, desc, price, unit]);
      }

      // Guests
      await q(`DELETE FROM guests WHERE organization_id=$1`, [orgId]);
      const guestData = [
        ["Андрій", "Кравченко", "+380501234501"],
        ["Олена",  "Бондаренко","+380671234502"],
        ["Василь", "Ткаченко",  "+380631234503"],
        ["Наталія","Мороз",     "+380991234504"],
        ["Ігор",   "Лисенко",   "+380661234505"],
        ["Тетяна", "Гончаренко","+380731234506"],
        ["Михайло","Савченко",  "+380971234507"],
        ["Людмила","Яременко",  "+380501234508"],
      ];
      const guestIds: number[] = [];
      for (const [fn, ln, ph] of guestData) {
        const r = await q(
          `INSERT INTO guests (organization_id, first_name, last_name, phone) VALUES ($1,$2,$3,$4) RETURNING id`,
          [orgId, fn, ln, ph]
        );
        guestIds.push(r.rows[0].id);
      }

      // Bookings
      const bk = [
        [unitIds[0], guestIds[0], d(-3), d(2),  "checked_in",  "partial",  "direct",  4, "14000","7000",  guestData[0][1], guestData[0][0]],
        [unitIds[3], guestIds[1], d(1),  d(5),  "confirmed",   "unpaid",   "booking", 5, "15200","0",     guestData[1][1], guestData[1][0]],
        [unitIds[6], guestIds[2], d(-1), d(3),  "checked_in",  "paid",     "direct",  6, "22000","22000", guestData[2][1], guestData[2][0]],
        [unitIds[9], guestIds[3], d(-7), d(-2), "checked_out", "paid",     "airbnb",  8, "36000","36000", guestData[3][1], guestData[3][0]],
        [unitIds[1], guestIds[4], d(5),  d(9),  "confirmed",   "partial",  "direct",  3, "11200","5600",  guestData[4][1], guestData[4][0]],
        [unitIds[4], guestIds[5], d(3),  d(7),  "confirmed",   "unpaid",   "booking", 4, "15200","0",     guestData[5][1], guestData[5][0]],
        [unitIds[7], guestIds[6], d(10), d(15), "pending",     "unpaid",   "direct",  7, "27500","0",     guestData[6][1], guestData[6][0]],
        [unitIds[10],guestIds[7], d(2),  d(6),  "confirmed",   "paid",     "direct",  9, "28800","28800", guestData[7][1], guestData[7][0]],
        [unitIds[2], guestIds[0], d(12), d(16), "pending",     "unpaid",   "direct",  4, "11200","0",     guestData[0][1], guestData[0][0]],
        [unitIds[5], guestIds[2], d(8),  d(13), "confirmed",   "partial",  "direct",  5, "19000","9500",  guestData[2][1], guestData[2][0]],
      ];
      for (const [uid, gid, ci, co, st, ps, src, gc, tot, paid, ln, fn] of bk) {
        await q(
          `INSERT INTO bookings (unit_id, guest_id, check_in, check_out, status, payment_status,
             source, guests_count, total_amount, paid_amount, last_name, first_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [uid, gid, ci, co, st, ps, src, gc, tot, paid, ln, fn]
        );
      }
    }

    res.json({
      ok: true,
      message: "ДОГОДА tenant provisioned ✓",
      orgId, propId, unitsStatus,
      logins: {
        owner: "admin@dogoda.com.ua / Dogoda2026!",
        reception: "reception@dogoda.com.ua / reception123",
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── IMPERSONATE TENANT ───────────────────────────────────────────────────────
// Returns a short-lived JWT token for the tenant's owner/admin so super admin
// can debug their account without needing the password.
router.post("/tenants/:id/impersonate", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db_ = db as any;

    // Find the owner (or first admin) of the org
    const userRow = await db_.$client.query(
      `SELECT id, email, name, role, organization_id, property_id FROM users
       WHERE organization_id = $1 AND is_active = true AND role IN ('owner', 'manager', 'reception')
       ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END
       LIMIT 1`,
      [id]
    );

    if (!userRow.rows.length) {
      res.status(404).json({ error: "No active users found for this tenant" });
      return;
    }

    const user = userRow.rows[0];
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id,
      propertyId: user.property_id,
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      note: "Impersonation token — valid 7 days. Store as hms_token.",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── CREATE SUBSCRIPTION INVOICE ──────────────────────────────────────────────
router.post("/tenants/:id/invoice", async (req, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const db_ = db as any;

    // Check org exists
    const orgRow = await db_.$client.query(
      `SELECT id, name, plan FROM organizations WHERE id = $1 LIMIT 1`, [orgId]
    );
    if (!orgRow.rows.length) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const { plan } = orgRow.rows[0];
    const { period = "monthly", status = "pending", notes } = req.body;

    const PRICES: Record<string, number> = { basic: 990, pro: 2490, enterprise: 4990 };
    const amount = PRICES[plan] || 990;
    const tax = Math.round(amount * 0.2);
    const total = amount + tax;

    // Generate invoice number
    const countRow = await db_.$client.query(
      `SELECT COUNT(*)::int AS cnt FROM subscription_invoices WHERE organization_id = $1`, [orgId]
    );
    const cnt = (countRow.rows[0]?.cnt || 0) + 1;
    const invoiceNumber = `INV-${orgId}-${String(cnt).padStart(4, "0")}`;

    const periodStart = new Date();
    const periodEnd = new Date();
    if (period === "monthly") periodEnd.setMonth(periodEnd.getMonth() + 1);
    else periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const inserted = await db_.$client.query(`
      INSERT INTO subscription_invoices
        (organization_id, invoice_number, tier, period, amount, tax, total, currency, status, period_start, period_end, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'UAH', $8, $9, $10, $11)
      RETURNING *
    `, [orgId, invoiceNumber, plan, period, amount, tax, total, status, periodStart, periodEnd, dueDate]);

    res.status(201).json({ invoice: inserted.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── MARK INVOICE PAID ─────────────────────────────────────────────────────────
router.patch("/invoices/:id/mark-paid", async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id);
    const db_ = db as any;

    const r = await db_.$client.query(
      `UPDATE subscription_invoices SET status = 'paid', paid_at = NOW() WHERE id = $1 RETURNING *`,
      [invoiceId]
    );
    if (!r.rows.length) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    res.json({ invoice: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE TENANT (cascade) ──────────────────────────────────────────────────
router.delete("/tenants/:id", async (req, res) => {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org id" }); return; }
    const db_ = db as any;
    const q = (sql: string, params: any[] = []) => db_.$client.query(sql, params);

    // Cascade delete in dependency order
    const tables = [
      "subscription_invoices", "notifications", "automation_logs", "automation_rules",
      "fb_order_items", "fb_orders", "fb_sessions", "fb_registers", "fb_shifts",
      "fb_menu_items", "fb_categories", "fb_outlets", "fb_settings",
      "fb_warehouses", "fb_staff", "fb_clients", "fb_loyalty_transactions",
      "maintenance_requests", "maintenance_schedules",
      "folio_entries", "act_documents", "act_document_items",
      "tax_invoices", "tax_invoice_items", "invoice_payments", "invoices",
      "booking_addons", "bookings",
      "guests", "units", "properties",
      "legal_entities", "addons",
      "spa_bookings", "event_bookings",
      "housekeeping_tasks", "staff_schedules",
      "night_audit_entries", "revenue_entries",
      "ai_conversations", "upsell_templates",
      "activities", "accommodation_entries",
      "sales_campaigns", "discount_types",
      "canned_replies", "inbox_threads", "inbox_messages",
      "green_initiatives",
      "users",
      "organizations",
    ];

    const deleted: Record<string, number> = {};
    for (const table of tables) {
      try {
        const col = table === "organizations" ? "id" : "organization_id";
        const r = await q(`DELETE FROM ${table} WHERE ${col} = $1`, [orgId]);
        if (r.rowCount > 0) deleted[table] = r.rowCount;
      } catch { /* table may not exist, skip */ }
    }

    res.json({ ok: true, orgId, deleted });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE ALL TENANTS (wipe slate) ──────────────────────────────────────────
router.delete("/tenants", async (_req, res) => {
  try {
    const db_ = db as any;
    const q = (sql: string, params: any[] = []) => db_.$client.query(sql, params);

    const orgsRes = await q(`SELECT id FROM organizations`);
    const orgIds: number[] = orgsRes.rows.map((r: any) => r.id);

    const tables = [
      "subscription_invoices", "notifications", "automation_logs", "automation_rules",
      "fb_order_items", "fb_orders", "fb_sessions", "fb_registers", "fb_shifts",
      "fb_menu_items", "fb_categories", "fb_outlets", "fb_settings",
      "fb_warehouses", "fb_staff", "fb_clients", "fb_loyalty_transactions",
      "maintenance_requests", "maintenance_schedules",
      "folio_entries", "act_documents", "act_document_items",
      "tax_invoices", "tax_invoice_items", "invoice_payments", "invoices",
      "booking_addons", "bookings",
      "guests", "units", "properties",
      "legal_entities", "addons",
      "spa_bookings", "event_bookings",
      "housekeeping_tasks", "staff_schedules",
      "night_audit_entries", "revenue_entries",
      "ai_conversations", "upsell_templates",
      "activities", "accommodation_entries",
      "sales_campaigns", "discount_types",
      "canned_replies", "inbox_threads", "inbox_messages",
      "green_initiatives",
      "users",
      "organizations",
    ];

    for (const table of tables) {
      try {
        const col = table === "organizations" ? "id" : "organization_id";
        await q(`DELETE FROM ${table} WHERE ${col} = ANY($1::int[])`, [orgIds]);
      } catch { /* skip */ }
    }

    res.json({ ok: true, deletedOrgs: orgIds });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
