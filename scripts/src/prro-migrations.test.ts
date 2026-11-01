import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { runMigrations, verifyPrroSchema } from "@workspace/db/migrate";
import { provisionEmptyDevelopmentDatabase } from "@workspace/db/provision";

// All fixtures live in disposable schemas. Never modify application tables.
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const folder = fileURLToPath(new URL("../../lib/db/migrations/", import.meta.url));
const original = readFileSync(`${folder}/0002_prro_dps.sql`, "utf8");
after(() => admin.end());

async function fixture(run: (pool: pg.Pool) => Promise<void>, prerequisites = true) {
  const schema = `prro_test_${process.pid}_${Math.random().toString(36).slice(2)}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},pg_catalog`,
  });
  try {
    if (prerequisites) await pool.query(`
      CREATE TABLE organizations (id serial PRIMARY KEY);
      CREATE TABLE legal_entities (id serial PRIMARY KEY);
      CREATE TABLE users (id serial PRIMARY KEY);
      INSERT INTO organizations DEFAULT VALUES;
      INSERT INTO legal_entities DEFAULT VALUES;
      INSERT INTO users DEFAULT VALUES;
    `);
    await run(pool);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
}

test("fresh schema, parallel startups, and repeated runs share one journal", () => fixture(async pool => {
  await Promise.all([runMigrations(pool, folder), runMigrations(pool, folder)]);
  await runMigrations(pool, folder);
  assert.equal((await pool.query('SELECT count(*) FROM "__prro_migrations"')).rows[0].count, "1");
}));

test("legacy bootstrap adoption preserves documents, signed payloads, and audit events", () => fixture(async pool => {
  await pool.query(original);
  // Model the old unnamed UNIQUE constraints as well.
  await pool.query(`
    ALTER TABLE prro_registers ADD UNIQUE (organization_id, device_id);
    ALTER TABLE fiscal_documents ADD UNIQUE (organization_id, idempotency_key);
    INSERT INTO fiscal_documents (
      organization_id, legal_entity_id, source_type, source_id, payment_channel,
      policy_decision, policy_code, policy_reason, policy_version, total_amount,
      idempotency_key, content_hash, payload_snapshot, signed_payload, dps_signed_data
    ) VALUES (1,1,'test','1','card','fiscalize','test','test','1',12.34,
      'preserve-me','hash','{"audit":true}','signed-original','dps-original');
    INSERT INTO fiscal_events (organization_id, fiscal_document_id, event_type, event_status, payload)
      VALUES (1,1,'submitted','ok','{"original":true}');
    ALTER TABLE fiscal_documents DROP COLUMN local_number;
    ALTER TABLE fiscal_documents DROP COLUMN dps_signed_id;
    ALTER TABLE fiscal_documents DROP COLUMN next_retry_at;
  `);
  const before = (await pool.query("SELECT signed_payload,dps_signed_data,payload_snapshot,content_hash,total_amount FROM fiscal_documents")).rows;
  const events = (await pool.query("SELECT * FROM fiscal_events")).rows;
  await runMigrations(pool, folder);
  assert.deepEqual((await pool.query("SELECT signed_payload,dps_signed_data,payload_snapshot,content_hash,total_amount FROM fiscal_documents")).rows, before);
  assert.deepEqual((await pool.query("SELECT * FROM fiscal_events")).rows, events);
}));

test("wrong type fails atomically without recording migration success", () => fixture(async pool => {
  await pool.query(original);
  await pool.query("ALTER TABLE fiscal_documents ALTER COLUMN total_amount TYPE numeric(10,2)");
  await assert.rejects(runMigrations(pool, folder), /startup aborted/);
  assert.equal((await pool.query(`SELECT to_regclass('"__prro_migrations"') AS journal`)).rows[0].journal, null);
}));

test("drift in a journaled database is rejected instead of silently repaired", () => fixture(async pool => {
  await runMigrations(pool, folder);
  await pool.query("DROP INDEX prro_shifts_one_active_per_register_uq");
  await assert.rejects(runMigrations(pool, folder), /startup aborted/);
}));

test("foreign keys and defaults must remain compatible", () => fixture(async pool => {
  await runMigrations(pool, folder);
  await pool.query("ALTER TABLE fiscal_events ALTER COLUMN payload DROP DEFAULT");
  await assert.rejects(runMigrations(pool, folder), /startup aborted/);
}));

test("changed or unknown migration history is rejected", () => fixture(async pool => {
  await runMigrations(pool, folder);
  await pool.query(`UPDATE "__prro_migrations" SET hash = 'tampered'`);
  await assert.rejects(runMigrations(pool, folder), /startup aborted/);
}));

test("production gate is read-only and never repairs or journals the schema", () => fixture(async pool => {
  await pool.query(original);
  await verifyPrroSchema(pool);
  assert.equal((await pool.query(`SELECT to_regclass('"__prro_migrations"') AS journal`)).rows[0].journal, null);
  await pool.query("DROP INDEX fiscal_documents_idempotency_uq");
  await assert.rejects(verifyPrroSchema(pool), /startup aborted/);
  assert.equal((await pool.query(`SELECT to_regclass('fiscal_documents_idempotency_uq') AS idx`)).rows[0].idx, null);
}));

test("migration command refuses production even for a compatible database", () => fixture(async pool => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(runMigrations(pool, folder), /development-only/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}));

test("actual setup order provisions an empty database, then migrates and passes the startup gate", () => fixture(async pool => {
  // Execute the real post-merge CLI, not a test-only prerequisite fixture.
  const namespace = (await pool.query("SELECT current_schema() AS name")).rows[0].name;
  const connection = new URL(process.env.DATABASE_URL!);
  connection.searchParams.set("options", `-c search_path=${namespace},pg_catalog`);
  const { stdout } = await promisify(execFile)(process.execPath, [
    fileURLToPath(import.meta.resolve("tsx/cli")),
    fileURLToPath(new URL("./migrate-prro.ts", import.meta.url)),
  ], { env: { ...process.env, DATABASE_URL: connection.toString(), NODE_ENV: "development" } });
  assert.match(stdout, /PRRO migrations and schema verification succeeded/);
  await verifyPrroSchema(pool);
  for (const name of ["organizations", "legal_entities", "users", "bookings", "properties", "payments"]) {
    assert.ok((await pool.query("SELECT to_regclass($1) AS name", [name])).rows[0].name);
  }
  await provisionEmptyDevelopmentDatabase(pool);
  await runMigrations(pool, folder);
  await verifyPrroSchema(pool);
}, false));

test("base provisioning never reconciles or changes an existing installation", () => fixture(async pool => {
  const before = (await pool.query("SELECT id FROM organizations")).rows;
  await provisionEmptyDevelopmentDatabase(pool);
  assert.deepEqual((await pool.query("SELECT id FROM organizations")).rows, before);
  assert.equal((await pool.query("SELECT to_regclass('bookings') AS name")).rows[0].name, null);
}));
