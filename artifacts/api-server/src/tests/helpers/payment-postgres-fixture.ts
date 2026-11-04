import { readFile } from "node:fs/promises";
import { provisionEmptyDevelopmentDatabase } from "@workspace/db/provision";
import { runMigrations } from "@workspace/db/migrate";
import type pg from "pg";

/**
 * Use the real model and fiscal migration history in a private search_path.
 * The legacy payment tables below are still startup-managed, not Drizzle
 * models. Keep their route-facing contract here until they join the journal.
 * No public tables, sequences, credentials, or tenant data are used.
 */
export async function provisionPaymentFixture(pool: pg.Pool) {
  await provisionEmptyDevelopmentDatabase(pool);
  const migrations = new URL("../../../../../lib/db/migrations/", import.meta.url);
  await runMigrations(pool, migrations.pathname);
  await pool.query(await readFile(new URL("0003_payment_events.sql", migrations), "utf8"));
  await pool.query(`
    ALTER TABLE payments ADD COLUMN organization_id integer NOT NULL REFERENCES organizations(id);
    CREATE TABLE payment_sessions (
      id serial PRIMARY KEY, organization_id integer NOT NULL REFERENCES organizations(id),
      session_ref text NOT NULL UNIQUE, provider text NOT NULL DEFAULT 'liqpay',
      type text NOT NULL DEFAULT 'booking', status text NOT NULL DEFAULT 'pending',
      booking_id integer REFERENCES bookings(id), legal_entity_id integer REFERENCES legal_entities(id),
      amount numeric(12,2) NOT NULL, paid_amount numeric(12,2) NOT NULL DEFAULT 0,
      currency text NOT NULL DEFAULT 'UAH', description text, provider_order_id text UNIQUE,
      provider_tx_id text, provider_fee numeric(12,2), callback_data jsonb, payment_id integer REFERENCES payments(id),
      paid_at timestamptz, failed_at timestamptz, last_error text, updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE payment_webhooks (
      id serial PRIMARY KEY, organization_id integer REFERENCES organizations(id),
      provider text, session_id integer REFERENCES payment_sessions(id), event_type text, status text,
      signature_valid boolean, raw_body jsonb, parsed_data jsonb, amount numeric(12,2),
      currency text, ip_address text, processed_at timestamptz
    );
    CREATE TABLE payment_diagnostics (
      id serial PRIMARY KEY, organization_id integer REFERENCES organizations(id),
      session_id integer REFERENCES payment_sessions(id), provider text,
      error_message text, category text, resolution text, error_detail jsonb
    );
    CREATE TABLE invoice_splits (
      id serial PRIMARY KEY, invoice_id integer NOT NULL REFERENCES invoices(id),
      legal_entity_id integer REFERENCES legal_entities(id), amount numeric(12,2) NOT NULL,
      currency text NOT NULL DEFAULT 'UAH', status text NOT NULL DEFAULT 'pending',
      paid_amount numeric(12,2), liqpay_tx_id text, items_snapshot jsonb NOT NULL,
      paid_at timestamp, updated_at timestamp DEFAULT now()
    );
  `);
  await pool.query(await readFile(new URL("0004_payment_session_payment_uniqueness.sql", migrations), "utf8"));
}
