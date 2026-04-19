import app from "./app";
import { logger } from "./lib/logger";
import { autoSeedIfEmpty, syncSuperAdmin } from "./lib/auto-seed";
import { seedGuideDataIfEmpty } from "./routes/guide.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { registerClient, unregisterClient, getOnlinePeers, sendToClient } from "./lib/ws-broadcaster.js";
import { scheduleBackups } from "./lib/backup.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureSchema() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      plan VARCHAR(50) NOT NULL DEFAULT 'basic',
      max_units INTEGER NOT NULL DEFAULT 50,
      max_users INTEGER NOT NULL DEFAULT 10,
      is_active BOOLEAN NOT NULL DEFAULT true,
      settings JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'reception',
      organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      property_id INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS properties (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'hotel',
      description TEXT,
      address TEXT,
      settings JSONB,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS units (
      id SERIAL PRIMARY KEY,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'room',
      capacity INTEGER NOT NULL DEFAULT 2,
      floor INTEGER,
      base_price NUMERIC(10, 2),
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      housekeeping_status VARCHAR(50) NOT NULL DEFAULT 'clean',
      amenities JSONB,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS guests (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      nationality VARCHAR(100),
      date_of_birth DATE,
      document_type VARCHAR(50),
      document_number VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER NOT NULL REFERENCES units(id),
      guest_id INTEGER NOT NULL REFERENCES guests(id),
      check_in DATE NOT NULL,
      check_out DATE NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      payment_status VARCHAR(50) NOT NULL DEFAULT 'unpaid',
      source VARCHAR(50) NOT NULL DEFAULT 'direct',
      guests_count INTEGER NOT NULL DEFAULT 1,
      total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
      paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS housekeeping_tasks (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER NOT NULL REFERENCES units(id),
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      priority VARCHAR(50) NOT NULL DEFAULT 'medium',
      assigned_to INTEGER REFERENCES users(id),
      checklist JSONB,
      due_date DATE,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rates (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      name VARCHAR(255) NOT NULL,
      property_id INTEGER,
      category VARCHAR(100),
      base_price NUMERIC(10, 2) NOT NULL,
      weekend_price NUMERIC(10, 2),
      seasonal_prices JSONB,
      min_stay INTEGER NOT NULL DEFAULT 1,
      promo_code VARCHAR(50),
      discount_percent NUMERIC(5, 2),
      valid_from DATE,
      valid_to DATE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS addons (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price NUMERIC(10, 2) NOT NULL,
      unit VARCHAR(50) NOT NULL DEFAULT 'per stay',
      max_quantity INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT true,
      category VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS booking_addons (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      addon_id INTEGER NOT NULL REFERENCES addons(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      price NUMERIC(10, 2) NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      amount NUMERIC(10, 2) NOT NULL,
      method VARCHAR(50) NOT NULL DEFAULT 'cash',
      status VARCHAR(50) NOT NULL DEFAULT 'completed',
      reference VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calendar_holidays (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      name VARCHAR(255) NOT NULL,
      color VARCHAR(20) NOT NULL DEFAULT '#ef4444',
      is_recurring BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calendar_restrictions (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'min_nights',
      min_nights INTEGER,
      max_nights INTEGER,
      days_of_week JSONB NOT NULL DEFAULT '[]',
      date_from DATE,
      date_to DATE,
      apply_to_holidays BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS guide_categories (
      id           SERIAL PRIMARY KEY,
      name_ua      TEXT NOT NULL,
      name_en      TEXT,
      icon         TEXT,
      color_token  TEXT,
      description_ua TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS guide_locations (
      id                    SERIAL PRIMARY KEY,
      slug                  TEXT UNIQUE NOT NULL,
      title_ua              TEXT NOT NULL,
      title_en              TEXT,
      category_id           INTEGER REFERENCES guide_categories(id) ON DELETE SET NULL,
      short_desc_ua         TEXT,
      short_desc_en         TEXT,
      full_desc_ua          TEXT,
      full_desc_en          TEXT,
      image_url             TEXT,
      gps_lat               DOUBLE PRECISION,
      gps_lng               DOUBLE PRECISION,
      season                TEXT,
      safety_note_ua        TEXT,
      sensory_note_ua       TEXT,
      fact_ua               TEXT,
      audio_transcript_ua   TEXT,
      is_internal           BOOLEAN NOT NULL DEFAULT true,
      verification_status   TEXT NOT NULL DEFAULT 'draft',
      is_active             BOOLEAN NOT NULL DEFAULT true,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS guide_routes (
      id                  SERIAL PRIMARY KEY,
      title_ua            TEXT NOT NULL,
      title_en            TEXT,
      duration_minutes    INTEGER NOT NULL DEFAULT 30,
      distance_meters     INTEGER NOT NULL DEFAULT 1000,
      difficulty          TEXT NOT NULL DEFAULT 'easy',
      mood_tag            TEXT,
      best_time_of_day    TEXT,
      seasonality         TEXT,
      description_ua      TEXT,
      description_en      TEXT,
      tips_ua             TEXT,
      image_url           TEXT,
      audio_intro_ua      TEXT,
      verification_status TEXT NOT NULL DEFAULT 'draft',
      is_featured         BOOLEAN NOT NULL DEFAULT false,
      is_active           BOOLEAN NOT NULL DEFAULT true,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS guide_route_points (
      id          SERIAL PRIMARY KEY,
      route_id    INTEGER NOT NULL REFERENCES guide_routes(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES guide_locations(id) ON DELETE CASCADE,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      note_ua     TEXT
    );
  `);

  // Migrate: add columns that may be missing from older schema versions
  await db.execute(sql`
    ALTER TABLE guide_categories ADD COLUMN IF NOT EXISTS description_ua TEXT;
    ALTER TABLE guide_routes     ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE guide_locations  ADD COLUMN IF NOT EXISTS fact_ua TEXT;
    ALTER TABLE guide_locations  ADD COLUMN IF NOT EXISTS image_url TEXT;
  `);

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id            BIGSERIAL PRIMARY KEY,
        org_id        INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
        user_id       INTEGER,
        user_email    TEXT,
        action        TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id   TEXT,
        meta          JSONB,
        ip_address    TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
        ON audit_logs (org_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
        ON audit_logs (resource_type, resource_id);
    `);
  } catch (auditErr: any) {
    logger.warn({ msg: auditErr?.message }, "audit_logs schema warning (non-fatal, continuing)");
  }
}

async function bootstrap() {
  try {
    logger.info("Ensuring database schema...");
    await ensureSchema();
    logger.info("Schema ready.");

    await autoSeedIfEmpty();
    await syncSuperAdmin();

    scheduleBackups();
    logger.info("Backup scheduler started (daily at 02:00 UTC)");
  } catch (err) {
    logger.error({ err }, "Bootstrap error");
  }

  // Guide seed runs after schema creation regardless of bootstrap errors above
  try {
    await seedGuideDataIfEmpty();
  } catch (guideErr) {
    logger.error({ err: guideErr }, "Guide seed error");
  }

  const server = createServer(app);

  // ── WebSocket signaling server for WebRTC internal calls ───────────────────
  const wss = new WebSocketServer({ server, path: "/ws/telephony" });

  wss.on("connection", (ws, req) => {
    let myId: string | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Register: { type: "register", userId: "user-123" }
        if (msg.type === "register" && msg.userId) {
          myId = String(msg.userId);
          registerClient(myId, ws);
          ws.send(JSON.stringify({ type: "registered", userId: myId, peers: getOnlinePeers(myId) }));
          // Notify others
          getOnlinePeers(myId).forEach(id => sendToClient(id, { type: "peer-online", userId: myId }));
          return;
        }
        // Relay signals: offer, answer, ice-candidate, call, hangup
        const { to, ...payload } = msg;
        if (to) {
          sendToClient(String(to), { ...payload, from: myId });
        }
      } catch { /* ignore malformed */ }
    });

    ws.on("close", () => {
      if (myId) {
        unregisterClient(myId);
        getOnlinePeers().forEach(id => sendToClient(id, { type: "peer-offline", userId: myId }));
      }
    });
  });

  // Keep-alive of 1 s so connections are released quickly on restart
  server.keepAliveTimeout = 1000;
  server.headersTimeout   = 2000;

  // Handle EADDRINUSE and other server-level errors without crashing uncaught
  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      logger.warn({ port }, "Port already in use — retrying in 1 s…");
      setTimeout(() => {
        server.close();
        server.listen(port);
      }, 1000);
    } else {
      logger.error({ err }, "HTTP server error");
      process.exit(1);
    }
  });

  server.listen(port, () => {
    logger.info({ port }, "Server listening");
  });

  // Graceful shutdown — closeAllConnections drops keep-alive connections instantly
  // so the port is freed before the new process tries to bind it.
  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutdown signal received — draining…");
    // Drop all idle keep-alive connections immediately (Node ≥ 18.2)
    if (typeof (server as any).closeAllConnections === "function") {
      (server as any).closeAllConnections();
    }
    server.close(() => {
      logger.info("Server closed cleanly.");
      process.exit(0);
    });
    // Hard-kill after 3 s in case something is still stuck
    setTimeout(() => {
      logger.warn("Forced exit after 3 s shutdown timeout");
      process.exit(0);
    }, 3000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

// ─── Global error safety net ──────────────────────────────────────────────────
// Prevents the process from crashing on unhandled promise rejections or
// unexpected thrown errors — logs them and keeps the server alive.
process.on("unhandledRejection", (reason: unknown) => {
  logger.error({ reason }, "⚠️  Unhandled promise rejection — server keeps running");
});

process.on("uncaughtException", (err: Error) => {
  logger.error({ err }, "⚠️  Uncaught exception — server keeps running");
});

bootstrap();
