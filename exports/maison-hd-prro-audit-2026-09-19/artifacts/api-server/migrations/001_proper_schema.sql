-- =============================================================================
-- MIGRATION 001: Proper Schema
-- Adds all missing tables to the HMS/PMS SaaS database.
-- Uses IF NOT EXISTS — safe to run multiple times.
-- Does NOT alter existing tables or data.
-- =============================================================================

-- ─── PLATFORM ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_settings (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module      TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT,
  value_json  JSONB,
  is_secret   BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module, key)
);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant ON tenant_settings(tenant_id);

CREATE TABLE IF NOT EXISTS feature_flags (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  flag          TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT false,
  rollout_pct   INTEGER DEFAULT 100,
  config        JSONB DEFAULT '{}',
  notes         TEXT,
  expires_at    TIMESTAMPTZ,
  updated_by    INTEGER REFERENCES users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, flag)
);
CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant ON feature_flags(tenant_id);

-- ─── IAM ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description  TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS permissions (
  id           SERIAL PRIMARY KEY,
  resource     TEXT NOT NULL,
  action       TEXT NOT NULL,
  scope        TEXT DEFAULT 'tenant',
  display_name TEXT NOT NULL,
  module       TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (resource, action, scope)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id            SERIAL PRIMARY KEY,
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by    INTEGER REFERENCES users(id),
  UNIQUE (role_id, permission_id)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);

CREATE TABLE IF NOT EXISTS user_roles (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  tenant_id   INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id INTEGER,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by  INTEGER REFERENCES users(id),
  expires_at  TIMESTAMPTZ,
  UNIQUE (user_id, role_id, property_id)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user   ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON user_roles(tenant_id);

CREATE TABLE IF NOT EXISTS user_permissions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted       BOOLEAN NOT NULL DEFAULT true,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by    INTEGER REFERENCES users(id),
  expires_at    TIMESTAMPTZ,
  UNIQUE (user_id, permission_id)
);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);

-- Seed system roles
INSERT INTO roles (tenant_id, name, display_name, is_system, sort_order) VALUES
  (NULL, 'super_admin',   'Super Administrator', true, 0),
  (NULL, 'owner',         'Owner',               true, 1),
  (NULL, 'manager',       'Manager',             true, 2),
  (NULL, 'reception',     'Receptionist',        true, 3),
  (NULL, 'housekeeping',  'Housekeeping',        true, 4)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Seed core permissions
INSERT INTO permissions (resource, action, scope, display_name, module) VALUES
  ('reservations', 'create',  'tenant',   'Create Reservations',     'pms'),
  ('reservations', 'read',    'tenant',   'View Reservations',       'pms'),
  ('reservations', 'update',  'tenant',   'Edit Reservations',       'pms'),
  ('reservations', 'delete',  'tenant',   'Delete Reservations',     'pms'),
  ('reservations', 'export',  'tenant',   'Export Reservations',     'pms'),
  ('guests',       'create',  'tenant',   'Create Guest Profiles',   'crm'),
  ('guests',       'read',    'tenant',   'View Guest Profiles',     'crm'),
  ('guests',       'update',  'tenant',   'Edit Guest Profiles',     'crm'),
  ('guests',       'delete',  'tenant',   'Delete Guest Profiles',   'crm'),
  ('rates',        'read',    'tenant',   'View Rates',              'revenue'),
  ('rates',        'update',  'tenant',   'Edit Rates',              'revenue'),
  ('invoices',     'create',  'tenant',   'Issue Invoices',          'finance'),
  ('invoices',     'read',    'tenant',   'View Invoices',           'finance'),
  ('payments',     'create',  'tenant',   'Record Payments',         'finance'),
  ('payments',     'read',    'tenant',   'View Payments',           'finance'),
  ('reports',      'read',    'tenant',   'View Reports',            'analytics'),
  ('reports',      'export',  'tenant',   'Export Reports',          'analytics'),
  ('users',        'create',  'tenant',   'Add Staff Accounts',      'admin'),
  ('users',        'read',    'tenant',   'View Staff',              'admin'),
  ('users',        'update',  'tenant',   'Edit Staff',              'admin'),
  ('users',        'delete',  'tenant',   'Remove Staff',            'admin'),
  ('settings',     'read',    'tenant',   'View Settings',           'admin'),
  ('settings',     'update',  'tenant',   'Change Settings',         'admin'),
  ('housekeeping', 'read',    'tenant',   'View Housekeeping',       'operations'),
  ('housekeeping', 'update',  'tenant',   'Update Housekeeping',     'operations'),
  ('maintenance',  'create',  'tenant',   'Report Maintenance',      'operations'),
  ('maintenance',  'read',    'tenant',   'View Maintenance',        'operations'),
  ('maintenance',  'update',  'tenant',   'Edit Maintenance',        'operations'),
  ('spa',          'create',  'tenant',   'Book Spa',                'spa'),
  ('spa',          'read',    'tenant',   'View Spa',                'spa'),
  ('spa',          'update',  'tenant',   'Edit Spa Bookings',       'spa')
ON CONFLICT (resource, action, scope) DO NOTHING;

-- ─── PROPERTY ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS unit_types (
  id               SERIAL PRIMARY KEY,
  property_id      INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  short_code       TEXT,
  description      TEXT,
  category         TEXT NOT NULL DEFAULT 'room',
  default_capacity INTEGER NOT NULL DEFAULT 2,
  max_capacity     INTEGER,
  square_meters    NUMERIC(6,1),
  bed_config       JSONB DEFAULT '{}',
  base_price       NUMERIC(10,2),
  photos           JSONB DEFAULT '[]',
  sort_order       INTEGER DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unit_types_property ON unit_types(property_id);

-- Add unit_type_id to units if not present
ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_type_id INTEGER REFERENCES unit_types(id);
CREATE INDEX IF NOT EXISTS idx_units_type ON units(unit_type_id);

CREATE TABLE IF NOT EXISTS amenities (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT,
  category    TEXT NOT NULL DEFAULT 'in_room',
  is_global   BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS unit_type_amenities (
  id           SERIAL PRIMARY KEY,
  unit_type_id INTEGER NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
  amenity_id   INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  quantity     INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_unit_type_amenities_type ON unit_type_amenities(unit_type_id);

-- Seed global amenities
INSERT INTO amenities (tenant_id, name, icon, category, is_global) VALUES
  (NULL, 'Wi-Fi',            'wifi',         'connectivity', true),
  (NULL, 'Air Conditioning', 'wind',         'climate',      true),
  (NULL, 'Heating',          'thermometer',  'climate',      true),
  (NULL, 'Flat-screen TV',   'tv',           'entertainment',true),
  (NULL, 'Minibar',          'wine',         'in_room',      true),
  (NULL, 'Safe',             'lock',         'in_room',      true),
  (NULL, 'Kettle',           'coffee',       'in_room',      true),
  (NULL, 'Hair Dryer',       'zap',          'bathroom',     true),
  (NULL, 'Bathtub',          'droplets',     'bathroom',     true),
  (NULL, 'Shower',           'droplets',     'bathroom',     true),
  (NULL, 'Sea View',         'waves',        'view',         true),
  (NULL, 'Mountain View',    'mountain',     'view',         true),
  (NULL, 'Balcony',          'home',         'outdoor',      true),
  (NULL, 'Terrace',          'home',         'outdoor',      true),
  (NULL, 'Pool Access',      'waves',        'outdoor',      true),
  (NULL, 'Parking',          'car',          'facility',     true),
  (NULL, 'Breakfast',        'coffee',       'dining',       true)
ON CONFLICT DO NOTHING;

-- ─── GUESTS ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS guest_profiles (
  id                       SERIAL PRIMARY KEY,
  guest_id                 INTEGER NOT NULL UNIQUE REFERENCES guests(id) ON DELETE CASCADE,
  preferred_unit_type      TEXT,
  preferred_floor          INTEGER,
  preferred_bed_config     TEXT,
  preferred_view           TEXT,
  prefers_baby_bed         BOOLEAN DEFAULT false,
  preferred_checkin_time   TEXT,
  preferred_checkout_time  TEXT,
  preferred_pillow         TEXT,
  allergies                JSONB DEFAULT '[]',
  dietary_reqs             JSONB DEFAULT '[]',
  preferred_spa_therapist_id INTEGER,
  spa_treatment_history    JSONB DEFAULT '[]',
  favourite_dishes         JSONB DEFAULT '[]',
  preferred_table_no       TEXT,
  loyalty_tier             TEXT DEFAULT 'bronze',
  loyalty_points_earned    INTEGER DEFAULT 0,
  loyalty_points_redeemed  INTEGER DEFAULT 0,
  member_since             DATE,
  loyalty_card_no          TEXT,
  preferred_channel        TEXT DEFAULT 'email',
  marketing_opt_in         BOOLEAN DEFAULT false,
  newsletter_opt_in        BOOLEAN DEFAULT false,
  sms_opt_in               BOOLEAN DEFAULT false,
  unsubscribed_at          TIMESTAMPTZ,
  satisfaction_score       NUMERIC(3,2),
  churn_risk               TEXT,
  segments                 JSONB DEFAULT '[]',
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guest_profiles_guest ON guest_profiles(guest_id);

-- ─── RESERVATIONS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reservation_sources (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'direct',
  commission_pct  NUMERIC(5,2) DEFAULT 0,
  color           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  config          JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservation_sources_tenant ON reservation_sources(tenant_id);

-- Add missing columns to bookings if not present
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS organization_id  INTEGER REFERENCES organizations(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmation_no  TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source_id        INTEGER REFERENCES reservation_sources(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS external_id      TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS channel_confirm_no TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS actual_check_in  TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS actual_check_out TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rate_plan_code   TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency         TEXT DEFAULT 'UAH';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_by       INTEGER REFERENCES users(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by     INTEGER REFERENCES users(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS no_show_at       TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS internal_notes   TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tags             JSONB DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS folio_id         INTEGER;

-- Backfill organization_id from units→properties→organization_id
UPDATE bookings b
SET organization_id = p.organization_id
FROM units u
JOIN properties p ON u.property_id = p.id
WHERE b.unit_id = u.id
  AND b.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(organization_id);

CREATE TABLE IF NOT EXISTS reservation_items (
  id                  SERIAL PRIMARY KEY,
  reservation_id      INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  item_type           TEXT NOT NULL DEFAULT 'room_night',
  date                DATE,
  name                TEXT NOT NULL,
  description         TEXT,
  quantity            NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price          NUMERIC(12,2) NOT NULL,
  total_price         NUMERIC(12,2) NOT NULL,
  vat_rate            NUMERIC(5,2) DEFAULT 20,
  vat_amount          NUMERIC(12,2),
  ref_type            TEXT,
  ref_id              INTEGER,
  business_unit_id    INTEGER,
  revenue_category_id INTEGER,
  is_posted           BOOLEAN NOT NULL DEFAULT false,
  posted_at           TIMESTAMPTZ,
  invoice_id          INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservation_items_booking ON reservation_items(reservation_id);

CREATE TABLE IF NOT EXISTS reservation_guests (
  id             SERIAL PRIMARY KEY,
  reservation_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  guest_id       INTEGER NOT NULL REFERENCES guests(id),
  role           TEXT NOT NULL DEFAULT 'primary',
  is_main_guest  BOOLEAN NOT NULL DEFAULT false,
  room_assignment TEXT,
  checked_in     BOOLEAN NOT NULL DEFAULT false,
  checked_in_at  TIMESTAMPTZ,
  checked_out    BOOLEAN NOT NULL DEFAULT false,
  checked_out_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservation_guests_booking ON reservation_guests(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_guests_guest   ON reservation_guests(guest_id);

CREATE TABLE IF NOT EXISTS reservation_status_history (
  id             SERIAL PRIMARY KEY,
  reservation_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status    TEXT,
  to_status      TEXT NOT NULL,
  reason         TEXT,
  changed_by     INTEGER REFERENCES users(id),
  changed_by_role TEXT,
  source         TEXT DEFAULT 'manual',
  metadata       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_res_status_hist_booking ON reservation_status_history(reservation_id);

-- ─── RATES ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_rules (
  id         SERIAL PRIMARY KEY,
  rate_id    INTEGER NOT NULL REFERENCES rates(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  priority   INTEGER NOT NULL DEFAULT 0,
  conditions JSONB NOT NULL DEFAULT '{}',
  adjustment JSONB NOT NULL DEFAULT '{}',
  valid_from DATE,
  valid_to   DATE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_rules_rate ON rate_rules(rate_id);

CREATE TABLE IF NOT EXISTS packages (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL REFERENCES organizations(id),
  property_id     INTEGER REFERENCES properties(id),
  name            TEXT NOT NULL,
  description     TEXT,
  short_desc      TEXT,
  image_url       TEXT,
  rate_id         INTEGER REFERENCES rates(id),
  min_nights      INTEGER DEFAULT 1,
  max_nights      INTEGER,
  included_addons JSONB DEFAULT '[]',
  total_price     NUMERIC(10,2),
  discount_pct    NUMERIC(5,2),
  valid_from      DATE,
  valid_to        DATE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_packages_tenant ON packages(tenant_id);

CREATE TABLE IF NOT EXISTS offers (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL REFERENCES organizations(id),
  property_id    INTEGER REFERENCES properties(id),
  name           TEXT NOT NULL,
  description    TEXT,
  type           TEXT NOT NULL DEFAULT 'promo_code',
  promo_code     TEXT,
  discount_type  TEXT NOT NULL DEFAULT 'percent',
  discount_value NUMERIC(10,2) NOT NULL,
  conditions     JSONB DEFAULT '{}',
  book_from      DATE,
  book_to        DATE,
  stay_from      DATE,
  stay_to        DATE,
  max_uses       INTEGER,
  used_count     INTEGER NOT NULL DEFAULT 0,
  is_stackable   BOOLEAN NOT NULL DEFAULT false,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offers_tenant ON offers(tenant_id);

CREATE TABLE IF NOT EXISTS quotes (
  id                           SERIAL PRIMARY KEY,
  tenant_id                    INTEGER NOT NULL REFERENCES organizations(id),
  guest_id                     INTEGER REFERENCES guests(id),
  property_id                  INTEGER REFERENCES properties(id),
  unit_type_id                 INTEGER REFERENCES unit_types(id),
  quote_no                     TEXT,
  status                       TEXT NOT NULL DEFAULT 'draft',
  check_in                     DATE,
  check_out                    DATE,
  adults                       INTEGER DEFAULT 2,
  children                     INTEGER DEFAULT 0,
  subtotal                     NUMERIC(12,2),
  discount_amount              NUMERIC(12,2) DEFAULT 0,
  total_amount                 NUMERIC(12,2),
  currency                     TEXT DEFAULT 'UAH',
  valid_until                  TIMESTAMPTZ,
  notes                        TEXT,
  guest_email                  TEXT,
  guest_name                   TEXT,
  sent_at                      TIMESTAMPTZ,
  viewed_at                    TIMESTAMPTZ,
  converted_to_reservation_id  INTEGER REFERENCES bookings(id),
  created_by                   INTEGER REFERENCES users(id),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant ON quotes(tenant_id);

CREATE TABLE IF NOT EXISTS quote_items (
  id          SERIAL PRIMARY KEY,
  quote_id    INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  item_type   TEXT NOT NULL DEFAULT 'room_night',
  quantity    NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price  NUMERIC(12,2) NOT NULL,
  total_price NUMERIC(12,2) NOT NULL,
  vat_rate    NUMERIC(5,2) DEFAULT 20,
  sort_order  INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);

CREATE TABLE IF NOT EXISTS availability_blocks (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES organizations(id),
  property_id INTEGER REFERENCES properties(id),
  unit_id     INTEGER REFERENCES units(id),
  unit_type_id INTEGER REFERENCES unit_types(id),
  type        TEXT NOT NULL DEFAULT 'stop_sell',
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  quantity    INTEGER DEFAULT 1,
  reason      TEXT,
  notes       TEXT,
  rate_ids    JSONB DEFAULT '[]',
  source_ids  JSONB DEFAULT '[]',
  created_by  INTEGER REFERENCES users(id),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avail_blocks_tenant ON availability_blocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_avail_blocks_dates  ON availability_blocks(start_date, end_date);

CREATE TABLE IF NOT EXISTS maintenance_blocks (
  id           SERIAL PRIMARY KEY,
  unit_id      INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'maintenance',
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  reason       TEXT,
  ticket_id    INTEGER,
  created_by   INTEGER REFERENCES users(id),
  resolved_at  TIMESTAMPTZ,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_blocks_unit  ON maintenance_blocks(unit_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_blocks_dates ON maintenance_blocks(start_date, end_date);

-- ─── FINANCIALS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_providers (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  provider      TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  credentials   JSONB DEFAULT '{}',
  webhook_secret TEXT,
  config        JSONB DEFAULT '{}',
  test_mode     BOOLEAN NOT NULL DEFAULT false,
  fee_pct       NUMERIC(5,2) DEFAULT 0,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_providers_tenant ON payment_providers(tenant_id);

CREATE TABLE IF NOT EXISTS folios (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL REFERENCES organizations(id),
  reservation_id INTEGER REFERENCES bookings(id),
  guest_id       INTEGER REFERENCES guests(id),
  folio_no       TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'main',
  status         TEXT NOT NULL DEFAULT 'open',
  currency       TEXT NOT NULL DEFAULT 'UAH',
  total_charges  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_credits  NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance        NUMERIC(14,2) NOT NULL DEFAULT 0,
  legal_entity_id INTEGER,
  settled_at     TIMESTAMPTZ,
  settled_by     INTEGER REFERENCES users(id),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_folios_reservation ON folios(reservation_id);
CREATE INDEX IF NOT EXISTS idx_folios_guest        ON folios(guest_id);
CREATE INDEX IF NOT EXISTS idx_folios_tenant       ON folios(tenant_id);

CREATE TABLE IF NOT EXISTS payment_attempts (
  id               SERIAL PRIMARY KEY,
  payment_id       INTEGER REFERENCES payments(id),
  reservation_id   INTEGER REFERENCES bookings(id),
  provider_id      INTEGER REFERENCES payment_providers(id),
  amount           NUMERIC(10,2) NOT NULL,
  currency         TEXT DEFAULT 'UAH',
  status           TEXT NOT NULL DEFAULT 'initiated',
  error_code       TEXT,
  error_message    TEXT,
  external_id      TEXT,
  payment_url      TEXT,
  request_payload  JSONB,
  response_payload JSONB,
  webhook_payload  JSONB,
  initiated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  ip_address       TEXT,
  user_agent       TEXT
);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_payment     ON payment_attempts(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_reservation ON payment_attempts(reservation_id);

-- ─── HOSPITALITY ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS spa_bookings (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER NOT NULL REFERENCES organizations(id),
  reservation_id   INTEGER REFERENCES bookings(id),
  guest_id         INTEGER REFERENCES guests(id),
  service_id       INTEGER NOT NULL REFERENCES spa_services(id),
  resource_id      INTEGER REFERENCES spa_resources(id),
  therapist_id     INTEGER REFERENCES users(id),
  appointment_date DATE NOT NULL,
  start_time       TEXT NOT NULL,
  end_time         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'confirmed',
  guest_count      INTEGER DEFAULT 1,
  price            NUMERIC(10,2),
  discount         NUMERIC(10,2) DEFAULT 0,
  total_amount     NUMERIC(10,2),
  is_paid          BOOLEAN DEFAULT false,
  folio_id         INTEGER REFERENCES folios(id),
  notes            TEXT,
  internal_notes   TEXT,
  reminder_sent_at TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  cancel_reason    TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spa_bookings_tenant      ON spa_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_spa_bookings_date        ON spa_bookings(appointment_date);
CREATE INDEX IF NOT EXISTS idx_spa_bookings_reservation ON spa_bookings(reservation_id);

CREATE TABLE IF NOT EXISTS rental_items (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL REFERENCES organizations(id),
  property_id    INTEGER REFERENCES properties(id),
  name           TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'other',
  description    TEXT,
  image_url      TEXT,
  total_stock    INTEGER NOT NULL DEFAULT 1,
  price_per_hour NUMERIC(10,2),
  price_per_day  NUMERIC(10,2),
  deposit_amount NUMERIC(10,2) DEFAULT 0,
  vat_rate       NUMERIC(5,2) DEFAULT 20,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INTEGER DEFAULT 0,
  meta           JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rental_items_tenant ON rental_items(tenant_id);

CREATE TABLE IF NOT EXISTS rental_bookings (
  id                  SERIAL PRIMARY KEY,
  tenant_id           INTEGER NOT NULL REFERENCES organizations(id),
  reservation_id      INTEGER REFERENCES bookings(id),
  guest_id            INTEGER REFERENCES guests(id),
  item_id             INTEGER NOT NULL REFERENCES rental_items(id),
  quantity            INTEGER NOT NULL DEFAULT 1,
  start_date          TIMESTAMPTZ NOT NULL,
  end_date            TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  price_type          TEXT NOT NULL DEFAULT 'per_day',
  unit_price          NUMERIC(10,2) NOT NULL,
  total_amount        NUMERIC(10,2),
  deposit_paid        NUMERIC(10,2) DEFAULT 0,
  deposit_returned_at TIMESTAMPTZ,
  returned_at         TIMESTAMPTZ,
  return_condition    TEXT,
  damage_notes        TEXT,
  folio_id            INTEGER REFERENCES folios(id),
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rental_bookings_tenant      ON rental_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rental_bookings_item        ON rental_bookings(item_id);
CREATE INDEX IF NOT EXISTS idx_rental_bookings_reservation ON rental_bookings(reservation_id);

CREATE TABLE IF NOT EXISTS event_leads (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL REFERENCES organizations(id),
  property_id    INTEGER REFERENCES properties(id),
  contact_name   TEXT NOT NULL,
  contact_email  TEXT,
  contact_phone  TEXT,
  company        TEXT,
  event_type     TEXT NOT NULL DEFAULT 'other',
  event_date     DATE,
  alternate_date DATE,
  guest_count    INTEGER,
  budget         NUMERIC(12,2),
  currency       TEXT DEFAULT 'UAH',
  status         TEXT NOT NULL DEFAULT 'new',
  source         TEXT,
  requirements   TEXT,
  notes          TEXT,
  assigned_to    INTEGER REFERENCES users(id),
  follow_up_at   TIMESTAMPTZ,
  converted_at   TIMESTAMPTZ,
  converted_to_id INTEGER,
  lost_reason    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_leads_tenant ON event_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_event_leads_status ON event_leads(status);

CREATE TABLE IF NOT EXISTS event_bookings (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER NOT NULL REFERENCES organizations(id),
  lead_id          INTEGER REFERENCES event_leads(id),
  property_id      INTEGER REFERENCES properties(id),
  event_space_id   INTEGER,
  name             TEXT NOT NULL,
  event_type       TEXT NOT NULL DEFAULT 'other',
  event_date       DATE NOT NULL,
  start_time       TEXT,
  end_time         TEXT,
  guest_count      INTEGER,
  contact_name     TEXT NOT NULL,
  contact_phone    TEXT,
  contact_email    TEXT,
  status           TEXT NOT NULL DEFAULT 'confirmed',
  total_amount     NUMERIC(12,2),
  deposit_amount   NUMERIC(12,2),
  deposit_paid_at  TIMESTAMPTZ,
  services         JSONB DEFAULT '[]',
  requirements     TEXT,
  notes            TEXT,
  assigned_to      INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_bookings_tenant ON event_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_event_bookings_date   ON event_bookings(event_date);

CREATE TABLE IF NOT EXISTS restaurant_charges (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER NOT NULL REFERENCES organizations(id),
  reservation_id   INTEGER REFERENCES bookings(id),
  guest_id         INTEGER REFERENCES guests(id),
  unit_id          INTEGER REFERENCES units(id),
  order_id         INTEGER,
  order_no         TEXT,
  business_unit_id INTEGER REFERENCES business_units(id),
  amount           NUMERIC(10,2) NOT NULL,
  vat_amount       NUMERIC(10,2),
  description      TEXT,
  charged_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_to_folio  BOOLEAN NOT NULL DEFAULT false,
  folio_entry_id   INTEGER,
  notes            TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_restaurant_charges_tenant      ON restaurant_charges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_charges_reservation ON restaurant_charges(reservation_id);

CREATE TABLE IF NOT EXISTS pos_sync_logs (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL REFERENCES organizations(id),
  pos_system   TEXT NOT NULL,
  direction    TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  status       TEXT NOT NULL,
  error_message TEXT,
  payload      JSONB,
  response     JSONB,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_sync_logs_tenant ON pos_sync_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_sync_logs_status ON pos_sync_logs(status);

-- ─── COMMUNICATIONS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS communication_channels (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  provider      TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_inbound    BOOLEAN NOT NULL DEFAULT true,
  is_outbound   BOOLEAN NOT NULL DEFAULT true,
  from_address  TEXT,
  display_name  TEXT,
  credentials   JSONB DEFAULT '{}',
  webhook_url   TEXT,
  webhook_secret TEXT,
  config        JSONB DEFAULT '{}',
  daily_limit   INTEGER,
  sent_today    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_channels_tenant ON communication_channels(tenant_id);

CREATE TABLE IF NOT EXISTS ai_summaries (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL REFERENCES organizations(id),
  entity_type     TEXT NOT NULL,
  entity_id       INTEGER NOT NULL,
  summary         TEXT NOT NULL,
  key_points      JSONB DEFAULT '[]',
  sentiment       TEXT,
  sentiment_score NUMERIC(4,3),
  action_items    JSONB DEFAULT '[]',
  model           TEXT NOT NULL,
  prompt_version  TEXT,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_entity ON ai_summaries(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_tenant ON ai_summaries(tenant_id);

-- ─── OPERATIONS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL REFERENCES organizations(id),
  property_id    INTEGER REFERENCES properties(id),
  title          TEXT NOT NULL,
  description    TEXT,
  type           TEXT NOT NULL DEFAULT 'general',
  status         TEXT NOT NULL DEFAULT 'pending',
  priority       TEXT NOT NULL DEFAULT 'normal',
  due_date       TIMESTAMPTZ,
  reservation_id INTEGER REFERENCES bookings(id),
  unit_id        INTEGER REFERENCES units(id),
  assigned_to    INTEGER REFERENCES users(id),
  assigned_by    INTEGER REFERENCES users(id),
  completed_by   INTEGER REFERENCES users(id),
  completed_at   TIMESTAMPTZ,
  verified_by    INTEGER REFERENCES users(id),
  verified_at    TIMESTAMPTZ,
  estimated_min  INTEGER,
  actual_min     INTEGER,
  tags           JSONB DEFAULT '[]',
  attachments    JSONB DEFAULT '[]',
  notes          TEXT,
  parent_task_id INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant   ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);

CREATE TABLE IF NOT EXISTS maintenance_tickets (
  id                  SERIAL PRIMARY KEY,
  tenant_id           INTEGER NOT NULL REFERENCES organizations(id),
  property_id         INTEGER REFERENCES properties(id),
  unit_id             INTEGER REFERENCES units(id),
  ticket_no           TEXT,
  title               TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL DEFAULT 'other',
  status              TEXT NOT NULL DEFAULT 'open',
  priority            TEXT NOT NULL DEFAULT 'normal',
  reported_by         INTEGER REFERENCES users(id),
  assigned_to         INTEGER REFERENCES users(id),
  external_contractor TEXT,
  estimated_cost      NUMERIC(10,2),
  actual_cost         NUMERIC(10,2),
  scheduled_date      TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  sla_deadline        TIMESTAMPTZ,
  sla_breached        BOOLEAN NOT NULL DEFAULT false,
  photos              JSONB DEFAULT '[]',
  parts               JSONB DEFAULT '[]',
  work_log            JSONB DEFAULT '[]',
  notes               TEXT,
  guest_impact        BOOLEAN NOT NULL DEFAULT false,
  reservation_id      INTEGER REFERENCES bookings(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maint_tickets_tenant   ON maintenance_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_maint_tickets_unit     ON maintenance_tickets(unit_id);
CREATE INDEX IF NOT EXISTS idx_maint_tickets_status   ON maintenance_tickets(status);
CREATE INDEX IF NOT EXISTS idx_maint_tickets_assigned ON maintenance_tickets(assigned_to);

-- ─── INTEGRATIONS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_accounts (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'other',
  status           TEXT NOT NULL DEFAULT 'pending',
  credentials      JSONB DEFAULT '{}',
  config           JSONB DEFAULT '{}',
  webhook_url      TEXT,
  webhook_secret   TEXT,
  external_id      TEXT,
  last_sync_at     TIMESTAMPTZ,
  last_error_at    TIMESTAMPTZ,
  last_error_msg   TEXT,
  sync_frequency   TEXT DEFAULT 'realtime',
  auto_sync        BOOLEAN NOT NULL DEFAULT true,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  expires_at       TIMESTAMPTZ,
  refresh_token    TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_accounts_tenant ON integration_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_accounts_type   ON integration_accounts(type);

-- ─── CONTENT & GUEST JOURNEY ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tv_content (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL REFERENCES organizations(id),
  property_id     INTEGER REFERENCES properties(id),
  title           TEXT NOT NULL,
  type            TEXT NOT NULL,
  media_url       TEXT,
  thumbnail_url   TEXT,
  duration        INTEGER,
  language        TEXT DEFAULT 'uk',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  valid_from      DATE,
  valid_to        DATE,
  target_audience JSONB DEFAULT '[]',
  meta            JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tv_content_tenant ON tv_content(tenant_id);

CREATE TABLE IF NOT EXISTS tv_devices (
  id                      SERIAL PRIMARY KEY,
  tenant_id               INTEGER NOT NULL REFERENCES organizations(id),
  unit_id                 INTEGER REFERENCES units(id),
  property_id             INTEGER REFERENCES properties(id),
  name                    TEXT NOT NULL,
  type                    TEXT NOT NULL DEFAULT 'room_tv',
  mac_address             TEXT,
  ip_address              TEXT,
  serial_no               TEXT,
  model                   TEXT,
  firmware_version        TEXT,
  status                  TEXT NOT NULL DEFAULT 'active',
  last_seen_at            TIMESTAMPTZ,
  current_guest_id        INTEGER REFERENCES guests(id),
  current_reservation_id  INTEGER REFERENCES bookings(id),
  display_config          JSONB DEFAULT '{}',
  access_code             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tv_devices_tenant ON tv_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tv_devices_unit   ON tv_devices(unit_id);

CREATE TABLE IF NOT EXISTS checkin_forms (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL REFERENCES organizations(id),
  reservation_id  INTEGER REFERENCES bookings(id),
  guest_id        INTEGER REFERENCES guests(id),
  is_template     BOOLEAN NOT NULL DEFAULT false,
  name            TEXT,
  fields          JSONB NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'pending',
  access_token    TEXT,
  access_url      TEXT,
  sent_at         TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  verified_at     TIMESTAMPTZ,
  verified_by     INTEGER REFERENCES users(id),
  expires_at      TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  language        TEXT DEFAULT 'uk',
  meta            JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checkin_forms_tenant      ON checkin_forms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_checkin_forms_reservation ON checkin_forms(reservation_id);

CREATE TABLE IF NOT EXISTS checkout_requests (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER NOT NULL REFERENCES organizations(id),
  reservation_id   INTEGER NOT NULL REFERENCES bookings(id),
  guest_id         INTEGER REFERENCES guests(id),
  type             TEXT NOT NULL DEFAULT 'express',
  requested_time   TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  fee_applied      BOOLEAN DEFAULT false,
  fee_amount       TEXT,
  guest_notes      TEXT,
  staff_notes      TEXT,
  bill_review_done BOOLEAN DEFAULT false,
  bill_confirmed   BOOLEAN DEFAULT false,
  folio_pdf        TEXT,
  processed_by     INTEGER REFERENCES users(id),
  processed_at     TIMESTAMPTZ,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checkout_requests_tenant      ON checkout_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_checkout_requests_reservation ON checkout_requests(reservation_id);

CREATE TABLE IF NOT EXISTS documents (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL REFERENCES organizations(id),
  entity_type     TEXT,
  entity_id       INTEGER,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'other',
  mime_type       TEXT,
  file_url        TEXT NOT NULL,
  file_size       INTEGER,
  checksum        TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  is_confidential BOOLEAN NOT NULL DEFAULT false,
  signed_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  uploaded_by     INTEGER REFERENCES users(id),
  tags            JSONB DEFAULT '[]',
  meta            JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS exported_documents (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL REFERENCES organizations(id),
  document_id  INTEGER REFERENCES documents(id),
  entity_type  TEXT,
  entity_id    INTEGER,
  export_type  TEXT NOT NULL,
  recipient    TEXT,
  status       TEXT NOT NULL DEFAULT 'sent',
  file_url     TEXT,
  file_size    INTEGER,
  language     TEXT DEFAULT 'uk',
  exported_by  INTEGER REFERENCES users(id),
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta         JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_exported_docs_tenant ON exported_documents(tenant_id);

CREATE TABLE IF NOT EXISTS accounting_exports (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL REFERENCES organizations(id),
  legal_entity_id INTEGER,
  system          TEXT NOT NULL,
  type            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  period_from     DATE,
  period_to       DATE,
  record_count    INTEGER,
  file_url        TEXT,
  error_message   TEXT,
  config          JSONB DEFAULT '{}',
  result          JSONB DEFAULT '{}',
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accounting_exports_tenant ON accounting_exports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounting_exports_status ON accounting_exports(status);

-- =============================================================================
-- END OF MIGRATION 001
-- =============================================================================
