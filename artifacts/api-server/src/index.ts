import app from "./app";
import { logger } from "./lib/logger";
import { startPosterOrderBridge } from "./lib/poster-order-bridge.js";
import { setupVoiceWebsocket } from "./routes/voice-agent.js";
import { autoSeedIfEmpty, syncSuperAdmin, seedOrg39LegalEntities } from "./lib/auto-seed";
import { seedGuideDataIfEmpty } from "./routes/guide.js";
import { db, pool } from "@workspace/db";
import { verifyPrroSchema } from "@workspace/db/migrate";
import { sql } from "drizzle-orm";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { registerClient, unregisterClient, getOnlinePeers, sendToClient } from "./lib/ws-broadcaster.js";
import { verifyToken } from "./lib/auth.js";
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
  // Apply independently: an unrelated failure in the legacy multi-statement
  // bootstrap must not roll back this additive change for existing properties.
  await db.execute(sql`ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS tv_weather JSONB NOT NULL DEFAULT '{}'::jsonb`);
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
      tv_weather JSONB NOT NULL DEFAULT '{}'::jsonb,
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
    -- Ensure bookings.organization_id exists (added in hardening sprint)
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id);

    -- Performance + availability indexes for bookings
    CREATE INDEX IF NOT EXISTS idx_bookings_org_unit   ON bookings (organization_id, unit_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_org_status ON bookings (organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_bookings_unit_dates ON bookings (unit_id, check_in, check_out);

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
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id INTEGER;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_session_id INTEGER;
    ALTER TABLE payments ALTER COLUMN booking_id DROP NOT NULL;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS legal_entity_id INTEGER;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS net_amount NUMERIC(10, 2);
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(10, 2) DEFAULT 0;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'UAH';
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50) DEFAULT 'payment';
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_of_id INTEGER;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS external_id TEXT;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS liqpay_order_id TEXT;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS liqpay_status TEXT;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number TEXT;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS staff_id INTEGER;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    CREATE TABLE IF NOT EXISTS payment_events (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      event_key TEXT NOT NULL,
      previous_amount NUMERIC(12, 2) NOT NULL,
      target_amount NUMERIC(12, 2) NOT NULL,
      delta_amount NUMERIC(12, 2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UAH',
      status TEXT NOT NULL DEFAULT 'pending',
      payload JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS payment_events_org_event_key_uq
      ON payment_events (organization_id, event_key);
    CREATE UNIQUE INDEX IF NOT EXISTS payments_payment_session_uq
      ON payments (payment_session_id) WHERE payment_session_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS payments_org_liqpay_order_uq
      ON payments (organization_id, liqpay_order_id) WHERE liqpay_order_id IS NOT NULL;
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

  // Migrate: expand name columns from VARCHAR(100) to TEXT to support long company names
  await db.execute(sql`
    ALTER TABLE bookings  ALTER COLUMN last_name   TYPE TEXT;
    ALTER TABLE bookings  ALTER COLUMN first_name  TYPE TEXT;
    ALTER TABLE bookings  ALTER COLUMN middle_name TYPE TEXT;
    ALTER TABLE guests    ALTER COLUMN first_name  TYPE TEXT;
    ALTER TABLE guests    ALTER COLUMN last_name   TYPE TEXT;
  `);

  // Migrate: public token for shareable invoice links
  await db.execute(sql`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_token TEXT UNIQUE;
  `);

  // Migrate: direct tenant isolation column on invoices
  // Step 1: add column as nullable (idempotent — IF NOT EXISTS)
  await db.execute(sql`
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
  `);

  // Step 2: backfill + enforce NOT NULL inside a single transaction with a
  // table lock so no concurrent writer can sneak in a null between the DELETE
  // and the ALTER.
  await db.execute(sql`
    BEGIN;

    -- Lock the table exclusively for the duration of this migration so no
    -- concurrent insert can introduce a null organization_id before the
    -- NOT NULL constraint is applied.
    LOCK TABLE invoices IN SHARE ROW EXCLUSIVE MODE;

    -- Backfill 1: from legal_entities
    UPDATE invoices i
    SET organization_id = le.organization_id
    FROM legal_entities le
    WHERE i.legal_entity_id = le.id
      AND i.organization_id IS NULL;

    -- Backfill 2: from booking → unit → property chain
    UPDATE invoices i
    SET organization_id = p.organization_id
    FROM bookings b
    JOIN units u ON u.id = b.unit_id
    JOIN properties p ON p.id = u.property_id
    WHERE i.booking_id = b.id
      AND i.organization_id IS NULL
      AND p.organization_id IS NOT NULL;

    -- Backfill 3: from creator's org (users table) as last resort
    UPDATE invoices i
    SET organization_id = u.organization_id
    FROM users u
    WHERE i.created_by_id = u.id
      AND i.organization_id IS NULL
      AND u.organization_id IS NOT NULL;

    -- Remove unresolvable orphans (no org traceable from any source)
    DELETE FROM invoices WHERE organization_id IS NULL;

    -- Enforce NOT NULL — PostgreSQL accepts this even if the column is
    -- already NOT NULL, so no exception handling is needed.
    ALTER TABLE invoices ALTER COLUMN organization_id SET NOT NULL;

    COMMIT;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON invoices(organization_id);
  `);

  // Migrate: add SPA/Pool booking settings to properties
  await db.execute(sql`
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS spa_booking_mode  VARCHAR(20)     DEFAULT 'allday';
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS spa_slot_duration INTEGER         DEFAULT 180;
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS spa_slot_start    VARCHAR(5)      DEFAULT '10:00';
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS spa_slot_end      VARCHAR(5)      DEFAULT '19:00';
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS spa_child_price   NUMERIC(10, 2);
  `);

  // Unit groups (folders/папки for units — номерний фонд grouping)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS unit_groups (
      id           SERIAL PRIMARY KEY,
      property_id  INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name         VARCHAR(255) NOT NULL,
      sort_order   INTEGER DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_group_id  INTEGER REFERENCES unit_groups(id) ON DELETE SET NULL;
    ALTER TABLE units ADD COLUMN IF NOT EXISTS sort_order      INTEGER DEFAULT 0;
    ALTER TABLE units ADD COLUMN IF NOT EXISTS is_hidden       BOOLEAN DEFAULT false;
    ALTER TABLE units ADD COLUMN IF NOT EXISTS description     TEXT;
    ALTER TABLE units ADD COLUMN IF NOT EXISTS has_balcony     BOOLEAN DEFAULT false;
    ALTER TABLE units ADD COLUMN IF NOT EXISTS has_view        VARCHAR(50);
    ALTER TABLE units ADD COLUMN IF NOT EXISTS square_meters   NUMERIC(8,2);
    ALTER TABLE units ADD COLUMN IF NOT EXISTS max_capacity    INTEGER;
    ALTER TABLE units ADD COLUMN IF NOT EXISTS base_guests     INTEGER DEFAULT 2;
    ALTER TABLE units ADD COLUMN IF NOT EXISTS extra_guest_price NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE units ADD COLUMN IF NOT EXISTS bedrooms        INTEGER DEFAULT 0;
  `);
  await db.execute(sql`
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS with_pets BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS group_booking_id VARCHAR(36);
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS group_name TEXT;
    CREATE INDEX IF NOT EXISTS idx_bookings_org_group_booking
      ON bookings (organization_id, group_booking_id)
      WHERE group_booking_id IS NOT NULL;
  `);
  await db.execute(sql`
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS guest_guide_url TEXT;
  `);

  // Pricing calendar rules (rate calendar)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pricing_calendar_rules (
      id                  SERIAL PRIMARY KEY,
      org_id              INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      name                VARCHAR(100) NOT NULL,
      color               VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
      price_per_night     NUMERIC(10, 2) NOT NULL,
      weekend_price       NUMERIC(10, 2),
      min_nights          INTEGER NOT NULL DEFAULT 1,
      min_nights_weekend  INTEGER NOT NULL DEFAULT 1,
      apply_days          INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
      date_from           DATE,
      date_to             DATE,
      unit_ids            INTEGER[] NOT NULL DEFAULT '{}',
      is_active           BOOLEAN NOT NULL DEFAULT TRUE,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_pricing_cal_rules_org ON pricing_calendar_rules (org_id)
  `);

  // Guest Journey steps (editable per org)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS journey_steps (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      stage           VARCHAR(120) NOT NULL,
      time            VARCHAR(50)  NOT NULL DEFAULT '',
      icon            VARCHAR(10)  NOT NULL DEFAULT '📋',
      description     TEXT         NOT NULL DEFAULT '',
      color           VARCHAR(40)  NOT NULL DEFAULT 'bg-blue-500',
      is_enabled      BOOLEAN      NOT NULL DEFAULT true,
      sort_order      INTEGER      NOT NULL DEFAULT 0,
      email_subject   TEXT         NOT NULL DEFAULT '',
      email_template  VARCHAR(50)  NOT NULL DEFAULT 'default',
      message_text    TEXT         NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_journey_steps_org ON journey_steps (organization_id, sort_order)
  `);

  // Room Concierge tables
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS concierge_knowledge (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      category        VARCHAR(100) NOT NULL DEFAULT 'general',
      title           VARCHAR(255) NOT NULL,
      content         TEXT NOT NULL,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS concierge_requests (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      unit_id         INTEGER REFERENCES units(id) ON DELETE SET NULL,
      booking_id      INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      guest_name      TEXT,
      request_type    VARCHAR(50) NOT NULL DEFAULT 'general',
      request_text    TEXT NOT NULL,
      ai_response     TEXT,
      status          VARCHAR(50) NOT NULL DEFAULT 'pending',
      admin_reply     TEXT,
      session_id      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS concierge_sessions (
      id              SERIAL PRIMARY KEY,
      session_id      TEXT UNIQUE NOT NULL,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      unit_id         INTEGER REFERENCES units(id) ON DELETE SET NULL,
      unit_name       TEXT,
      booking_id      INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      guest_name      TEXT,
      guest_id        INTEGER REFERENCES guests(id) ON DELETE SET NULL,
      preferences     JSONB DEFAULT '{}',
      last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_concierge_requests_org ON concierge_requests (organization_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_concierge_sessions_unit ON concierge_sessions (unit_id, organization_id);
    CREATE INDEX IF NOT EXISTS idx_concierge_knowledge_org ON concierge_knowledge (organization_id, category);
  `);

  // ── Accounting / Maison Finance ────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS acc_accounts (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code            VARCHAR(10) NOT NULL,
      name            TEXT NOT NULL,
      type            VARCHAR(20) NOT NULL CHECK (type IN ('asset','liability','equity','income','expense','tax','off-balance')),
      class           INTEGER,
      parent_id       INTEGER REFERENCES acc_accounts(id),
      is_active       BOOLEAN NOT NULL DEFAULT true,
      is_system       BOOLEAN NOT NULL DEFAULT false,
      description     TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_acc_accounts_org ON acc_accounts (organization_id, code);

    CREATE TABLE IF NOT EXISTS acc_periods (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      year            INTEGER NOT NULL,
      month           INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      status          VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
      closed_at       TIMESTAMPTZ,
      closed_by       INTEGER REFERENCES users(id),
      UNIQUE (organization_id, year, month)
    );

    CREATE TABLE IF NOT EXISTS acc_contractors (
      id               SERIAL PRIMARY KEY,
      organization_id  INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name             TEXT NOT NULL,
      edrpou           VARCHAR(20),
      ipn              VARCHAR(20),
      vat_number       VARCHAR(20),
      contractor_type  VARCHAR(20) NOT NULL DEFAULT 'both' CHECK (contractor_type IN ('customer','supplier','both')),
      address          TEXT,
      bank_name        TEXT,
      bank_account     VARCHAR(50),
      mfo              VARCHAR(10),
      notes            TEXT,
      is_active        BOOLEAN NOT NULL DEFAULT true,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_acc_contractors_org ON acc_contractors (organization_id);

    CREATE TABLE IF NOT EXISTS acc_documents (
      id               SERIAL PRIMARY KEY,
      organization_id  INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      doc_type         VARCHAR(50) NOT NULL,
      doc_number       TEXT NOT NULL,
      doc_date         DATE NOT NULL,
      contractor_id    INTEGER REFERENCES acc_contractors(id),
      period_id        INTEGER REFERENCES acc_periods(id),
      status           VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
      description      TEXT,
      currency         VARCHAR(3) NOT NULL DEFAULT 'UAH',
      subtotal         NUMERIC(15,2) NOT NULL DEFAULT 0,
      tax_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
      total            NUMERIC(15,2) NOT NULL DEFAULT 0,
      vat_rate         NUMERIC(5,2) NOT NULL DEFAULT 20,
      linked_doc_id    INTEGER REFERENCES acc_documents(id),
      created_by       INTEGER REFERENCES users(id),
      posted_by        INTEGER REFERENCES users(id),
      posted_at        TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_acc_documents_org ON acc_documents (organization_id, doc_date DESC);
    CREATE INDEX IF NOT EXISTS idx_acc_documents_type ON acc_documents (organization_id, doc_type, status);

    CREATE TABLE IF NOT EXISTS acc_document_items (
      id                 SERIAL PRIMARY KEY,
      document_id        INTEGER NOT NULL REFERENCES acc_documents(id) ON DELETE CASCADE,
      sort_order         INTEGER NOT NULL DEFAULT 0,
      description        TEXT NOT NULL,
      unit               VARCHAR(20) NOT NULL DEFAULT 'шт',
      quantity           NUMERIC(15,4) NOT NULL DEFAULT 1,
      unit_price         NUMERIC(15,4) NOT NULL,
      amount             NUMERIC(15,2) NOT NULL,
      tax_rate           NUMERIC(5,2) NOT NULL DEFAULT 20,
      tax_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
      account_id         INTEGER REFERENCES acc_accounts(id)
    );

    CREATE TABLE IF NOT EXISTS acc_entries (
      id                 SERIAL PRIMARY KEY,
      organization_id    INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      document_id        INTEGER REFERENCES acc_documents(id) ON DELETE SET NULL,
      entry_date         DATE NOT NULL,
      period_id          INTEGER REFERENCES acc_periods(id),
      debit_account_id   INTEGER NOT NULL REFERENCES acc_accounts(id),
      credit_account_id  INTEGER NOT NULL REFERENCES acc_accounts(id),
      amount             NUMERIC(15,2) NOT NULL,
      currency           VARCHAR(3) NOT NULL DEFAULT 'UAH',
      description        TEXT,
      is_manual          BOOLEAN NOT NULL DEFAULT false,
      created_by         INTEGER REFERENCES users(id),
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_acc_entries_org_date ON acc_entries (organization_id, entry_date DESC);
    CREATE INDEX IF NOT EXISTS idx_acc_entries_doc ON acc_entries (document_id);
    CREATE INDEX IF NOT EXISTS idx_acc_entries_debit ON acc_entries (debit_account_id);
    CREATE INDEX IF NOT EXISTS idx_acc_entries_credit ON acc_entries (credit_account_id);

    CREATE TABLE IF NOT EXISTS acc_vat_records (
      id                  SERIAL PRIMARY KEY,
      organization_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      document_id         INTEGER REFERENCES acc_documents(id) ON DELETE CASCADE,
      record_type         VARCHAR(10) NOT NULL CHECK (record_type IN ('issued','received')),
      record_date         DATE NOT NULL,
      contractor_id       INTEGER REFERENCES acc_contractors(id),
      tax_invoice_number  TEXT,
      tax_invoice_date    DATE,
      amount_excl_vat     NUMERIC(15,2) NOT NULL,
      vat_amount          NUMERIC(15,2) NOT NULL,
      vat_rate            NUMERIC(5,2) NOT NULL DEFAULT 20,
      period_id           INTEGER REFERENCES acc_periods(id),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_acc_vat_org ON acc_vat_records (organization_id, record_date DESC);

    CREATE TABLE IF NOT EXISTS acc_bank_statements (
      id               SERIAL PRIMARY KEY,
      organization_id  INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      bank_account     VARCHAR(50),
      statement_date   DATE NOT NULL,
      description      TEXT,
      amount           NUMERIC(15,2) NOT NULL,
      contractor_id    INTEGER REFERENCES acc_contractors(id),
      document_id      INTEGER REFERENCES acc_documents(id),
      entry_id         INTEGER REFERENCES acc_entries(id),
      is_reconciled    BOOLEAN NOT NULL DEFAULT false,
      external_id      TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_acc_bank_org ON acc_bank_statements (organization_id, statement_date DESC);
  `);

  // ── F&B / POS tables ────────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cashbox_sessions (
      id               SERIAL PRIMARY KEY,
      organization_id  INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      property_id      INTEGER,
      business_unit_id INTEGER,
      cashbox_name     VARCHAR(100) NOT NULL DEFAULT 'Каса 1',
      cashier_id       INTEGER REFERENCES users(id),
      opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at        TIMESTAMPTZ,
      opening_balance  NUMERIC(10,2) NOT NULL DEFAULT 0,
      closing_balance  NUMERIC(10,2),
      cash_in          NUMERIC(10,2) NOT NULL DEFAULT 0,
      cash_out         NUMERIC(10,2) NOT NULL DEFAULT 0,
      expected_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
      discrepancy      NUMERIC(10,2),
      status           VARCHAR(20) NOT NULL DEFAULT 'open',
      notes            TEXT,
      legal_entity_id  INTEGER,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cashbox_sessions_org_status ON cashbox_sessions (organization_id, status);
  `);

  // Migrate: add missing columns to fb_items
  await db.execute(sql`
    ALTER TABLE fb_items ADD COLUMN IF NOT EXISTS tech_card       JSONB;
    ALTER TABLE fb_items ADD COLUMN IF NOT EXISTS tax_group_id    INTEGER;
    ALTER TABLE fb_items ADD COLUMN IF NOT EXISTS price_happy     NUMERIC(10,2);
    ALTER TABLE fb_items ADD COLUMN IF NOT EXISTS is_stop_list    BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE fb_items ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE fb_categories ADD COLUMN IF NOT EXISTS image_url  TEXT;
    ALTER TABLE fb_categories ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE fb_categories ADD COLUMN IF NOT EXISTS color       VARCHAR(20);
  `);

  // Migrate: hierarchical category tree + modifier system
  await db.execute(sql`
    ALTER TABLE fb_categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES fb_categories(id) ON DELETE SET NULL;
    ALTER TABLE fb_categories ADD COLUMN IF NOT EXISTS station VARCHAR(50);
    CREATE TABLE IF NOT EXISTS fb_modifier_groups (
      id              SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      item_id         INT NOT NULL REFERENCES fb_items(id) ON DELETE CASCADE,
      name            VARCHAR(100) NOT NULL,
      is_required     BOOLEAN NOT NULL DEFAULT false,
      min_select      INT NOT NULL DEFAULT 0,
      max_select      INT NOT NULL DEFAULT 1,
      sort_order      INT NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_fb_modifier_groups_item ON fb_modifier_groups(item_id);
    CREATE TABLE IF NOT EXISTS fb_modifier_options (
      id              SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      group_id        INT NOT NULL REFERENCES fb_modifier_groups(id) ON DELETE CASCADE,
      name            VARCHAR(100) NOT NULL,
      price_delta     NUMERIC(10,2) NOT NULL DEFAULT 0,
      sort_order      INT NOT NULL DEFAULT 0,
      is_available    BOOLEAN NOT NULL DEFAULT true
    );
    ALTER TABLE fb_order_items ADD COLUMN IF NOT EXISTS modifiers JSONB;
  `);

  // Migrate: add missing columns to cashbox_sessions (production catch-up)
  await db.execute(sql`
    ALTER TABLE cashbox_sessions ADD COLUMN IF NOT EXISTS legal_entity_id  INTEGER;
    ALTER TABLE cashbox_sessions ADD COLUMN IF NOT EXISTS expected_balance  NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE cashbox_sessions ADD COLUMN IF NOT EXISTS opened_at         TIMESTAMPTZ   DEFAULT NOW();
    ALTER TABLE cashbox_sessions ADD COLUMN IF NOT EXISTS cash_in           NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE cashbox_sessions ADD COLUMN IF NOT EXISTS cash_out          NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE cashbox_sessions ADD COLUMN IF NOT EXISTS discrepancy       NUMERIC(10,2);
    ALTER TABLE cashbox_sessions ADD COLUMN IF NOT EXISTS closing_balance   NUMERIC(10,2);
  `);

  // Migrate: normalise null expected_balance to 0 so arithmetic never returns null
  await db.execute(sql`
    UPDATE cashbox_sessions SET expected_balance = opening_balance
    WHERE expected_balance IS NULL AND opening_balance IS NOT NULL;
    UPDATE cashbox_sessions SET cash_in  = 0 WHERE cash_in  IS NULL;
    UPDATE cashbox_sessions SET cash_out = 0 WHERE cash_out IS NULL;
  `);

  // QR Table Groups — grouping of tables with working hours & minibar flag
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fb_table_groups (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name            VARCHAR(100) NOT NULL,
      description     TEXT,
      icon            VARCHAR(10)  NOT NULL DEFAULT '🍽',
      color           VARCHAR(20)  NOT NULL DEFAULT '#6b7280',
      is_24h          BOOLEAN      NOT NULL DEFAULT false,
      open_time       VARCHAR(5)   NOT NULL DEFAULT '08:00',
      close_time      VARCHAR(5)   NOT NULL DEFAULT '22:00',
      is_minibar      BOOLEAN      NOT NULL DEFAULT false,
      sort_order      INTEGER      NOT NULL DEFAULT 0,
      is_active       BOOLEAN      NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_fb_table_groups_org ON fb_table_groups (organization_id, sort_order);
    ALTER TABLE fb_tables ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES fb_table_groups(id) ON DELETE SET NULL;
  `);

  // Table notifications (waiter calls, payment requests from QR menu)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fb_table_notifications (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      table_id        INTEGER REFERENCES fb_tables(id) ON DELETE SET NULL,
      table_number    VARCHAR(50),
      table_location  VARCHAR(255),
      type            VARCHAR(50) NOT NULL,
      payload         JSONB,
      status          VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dismissed_at    TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_fb_table_notif_org_status
      ON fb_table_notifications (organization_id, status, created_at DESC);
  `);

  // Legacy F&B tables — must exist in dev DB so Replit deploy diff doesn't drop them from prod
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fb_config_settings (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      section         VARCHAR(100) NOT NULL,
      data            JSONB NOT NULL DEFAULT '{}',
      updated_at      TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS fb_order_sources (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      name            VARCHAR(100) NOT NULL,
      show_on_pos     BOOLEAN NOT NULL DEFAULT true,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS fb_payment_methods (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      name            VARCHAR(100) NOT NULL,
      type            VARCHAR(30) NOT NULL DEFAULT 'cash',
      commission_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
      show_on_pos     BOOLEAN NOT NULL DEFAULT true,
      color           VARCHAR(20),
      icon_code       VARCHAR(50),
      sort_order      INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS fb_hall_tables (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      hall_id         INTEGER,
      hall_name       VARCHAR(100),
      table_number    INTEGER NOT NULL,
      pos_x           INTEGER NOT NULL DEFAULT 0,
      pos_y           INTEGER NOT NULL DEFAULT 0,
      width           INTEGER NOT NULL DEFAULT 80,
      height          INTEGER NOT NULL DEFAULT 80,
      seats           INTEGER NOT NULL DEFAULT 4,
      created_at      TIMESTAMP NOT NULL DEFAULT now()
    );
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

  // Add booking_id, task_type, notes to housekeeping_tasks for booking-scoped staff tasks
  // Each statement is idempotent (IF NOT EXISTS) — safe to run on every startup.
  await db.execute(sql`ALTER TABLE housekeeping_tasks ADD COLUMN IF NOT EXISTS booking_id  INTEGER REFERENCES bookings(id) ON DELETE SET NULL`);
  await db.execute(sql`ALTER TABLE housekeeping_tasks ADD COLUMN IF NOT EXISTS task_type   VARCHAR(50) DEFAULT 'other'`);
  await db.execute(sql`ALTER TABLE housekeeping_tasks ADD COLUMN IF NOT EXISTS notes       TEXT`);

}

async function bootstrap() {
  // Fail before seeders, schedulers, WebSockets, or the health endpoint start.
  logger.info("Ensuring database schema...");
  let legacySchemaReady = false;
  try {
    await ensureSchema();
    legacySchemaReady = true;
  } catch (err) {
    // Preserve the pre-existing non-PRRO bootstrap behavior. Its separate
    // migration cleanup is outside the fiscal schema boundary.
    logger.error({ err }, "Legacy non-PRRO bootstrap error");
  }
  // Deliberately outside the legacy catch: fiscal failures must stop startup.
  await verifyPrroSchema(pool);
  logger.info("PRRO schema contract verified.");
  try {
    if (legacySchemaReady) {
      await autoSeedIfEmpty();
      await syncSuperAdmin();
      await seedOrg39LegalEntities();

      scheduleBackups();
      logger.info("Backup scheduler started (daily at 02:00 UTC)");
    }
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

  // ── Twilio Media Stream WebSocket (voice-agent) ────────────────────────────
  setupVoiceWebsocket(server);

  // ── WebSocket signaling server for WebRTC internal calls ───────────────────
  const wss = new WebSocketServer({ server, path: "/ws/telephony" });

  wss.on("connection", (ws, req) => {
    let myId: string | null = null;
    let myOrganizationId: number | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Register with a signed access token so tenant-scoped events cannot leak.
        if (msg.type === "register" && msg.token) {
          const identity = verifyToken(String(msg.token));
          myId = String(identity.userId);
          myOrganizationId = identity.organizationId;
          registerClient(myId, myOrganizationId, ws);
          ws.send(JSON.stringify({ type: "registered", userId: myId, peers: getOnlinePeers(myId, myOrganizationId) }));
          // Notify others
          getOnlinePeers(myId, myOrganizationId).forEach(id => sendToClient(id, { type: "peer-online", userId: myId }, myOrganizationId));
          return;
        }
        // Relay signals: offer, answer, ice-candidate, call, hangup
        const { to, ...payload } = msg;
        if (to) {
          sendToClient(String(to), { ...payload, from: myId }, myOrganizationId);
        }
      } catch { /* ignore malformed */ }
    });

    ws.on("close", () => {
      if (myId) {
        unregisterClient(myId);
        getOnlinePeers(undefined, myOrganizationId).forEach(id => sendToClient(id, { type: "peer-offline", userId: myId }, myOrganizationId));
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
    startPosterOrderBridge();
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

bootstrap().catch((err) => {
  logger.fatal({ err }, "Database startup failed; refusing to serve an incompatible schema");
  process.exit(1);
});
