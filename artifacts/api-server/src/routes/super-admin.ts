import { Router } from "express";
import { db } from "@workspace/db";
import { organizationsTable, usersTable, propertiesTable } from "@workspace/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";

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
      `SELECT id, name, slug, plan, subscription_status, is_active, email, phone, address, max_units, max_users, created_at, trial_ends_at, subscription_ends_at FROM organizations WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!orgRow.rows.length) return res.status(404).json({ error: "Not found" });

    const members = await db_.$client.query(
      `SELECT id, name, email, role, is_active, last_login, created_at FROM users WHERE organization_id = $1 ORDER BY created_at`,
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

    if (setClauses.length === 0) return res.json({ message: "No changes" });

    await db_.$client.query(
      `UPDATE organizations SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $1`,
      vals
    );

    const updated = await db_.$client.query(
      `SELECT id, name, slug, plan, subscription_status, is_active, email, max_units, max_users FROM organizations WHERE id = $1`, [id]
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
router.get("/feature-flags", async (_req, res) => {
  res.json({
    flags: {
      aiHub: { enabled: true, description: "AI Hub module (GPT-5 copilot, sales, insights)", rollout: 100 },
      hotelTv: { enabled: true, description: "Hotel TV kiosk display module", rollout: 100 },
      guestPortal: { enabled: true, description: "Public guest portal / booking page", rollout: 100 },
      advancedAnalytics: { enabled: true, description: "KPI analytics, forecasts, revenue reports", rollout: 80 },
      automation: { enabled: true, description: "Automation triggers & workflows", rollout: 60 },
      channelManager: { enabled: false, description: "OTA channel manager (Booking.com, Airbnb)", rollout: 0 },
      revenueManagement: { enabled: true, description: "Dynamic pricing & revenue optimization", rollout: 50 },
      spaModule: { enabled: true, description: "SPA & Wellness management", rollout: 100 },
      eventsModule: { enabled: true, description: "Events & banquets management", rollout: 100 },
      mobileApp: { enabled: false, description: "Native mobile app for staff", rollout: 0 },
      multiProperty: { enabled: true, description: "Multi-property management (HQ view)", rollout: 100 },
      apiAccess: { enabled: false, description: "Developer API access with keys", rollout: 0 },
      whiteLabel: { enabled: false, description: "White-label branding for enterprise", rollout: 0 },
    },
  });
});

// ── SUPPORT TICKETS PLACEHOLDER ───────────────────────────────────────────────
router.get("/support", async (_req, res) => {
  res.json({
    tickets: [
      { id: "T-001", orgName: "Dogoda Resort", subject: "Питання по інтеграції LiqPay", status: "open", priority: "high", createdAt: new Date(Date.now() - 2 * 3600000).toISOString(), assignedTo: "Support" },
      { id: "T-002", orgName: "Maison HD Demo", subject: "Не відображається аналітика за місяць", status: "in_progress", priority: "medium", createdAt: new Date(Date.now() - 24 * 3600000).toISOString(), assignedTo: "Tech Team" },
      { id: "T-003", orgName: "Panorama Hotel", subject: "Запит на Enterprise план", status: "open", priority: "low", createdAt: new Date(Date.now() - 48 * 3600000).toISOString(), assignedTo: "Sales" },
      { id: "T-004", orgName: "Bukovel Resort", subject: "Додати нового адміна", status: "resolved", priority: "low", createdAt: new Date(Date.now() - 72 * 3600000).toISOString(), assignedTo: "Support" },
    ],
    stats: { open: 2, inProgress: 1, resolved: 1, avgResponseHours: 4.2 },
  });
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

export default router;
