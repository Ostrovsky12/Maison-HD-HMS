import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Pool } from "pg";
import { assertPrroSchema } from "./prro-schema-check";

// Only the development CLI reads SQL files. Bundled startup is read-only.
const defaultFolder = fileURLToPath(new URL("../migrations/", import.meta.url));

/**
 * PRRO uses the canonical Drizzle journal, with explicit scope markers.
 * Do not baseline the unrelated legacy migrations: existing installations were
 * created by push/bootstrap and cannot truthfully claim to have applied them.
 */
export async function runMigrations(pool: Pool, migrationsFolder = defaultFolder) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("PRRO migrations are development-only. Production schema changes must be applied by Publish.");
  }
  const journal = JSON.parse(readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8")) as {
    entries: { tag: string; scope?: string; when: number }[];
  };
  const files = readMigrationFiles({ migrationsFolder });
  const migrations = journal.entries.flatMap((entry, i) =>
    entry.scope === "prro" ? [{ ...entry, ...files[i]! }] : [],
  );
  if (!migrations.length) throw new Error("PRRO migration journal is empty");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '30s'");
    // Serialize all replicas and CLI invocations on the same database.
    await client.query("SELECT pg_advisory_xact_lock(734902, 45)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "__prro_migrations" (
        tag text PRIMARY KEY, hash text NOT NULL, created_at bigint NOT NULL
      )
    `);
    const { rows: applied } = await client.query<{ tag: string; hash: string }>(
      'SELECT tag, hash FROM "__prro_migrations" ORDER BY created_at',
    );
    for (const [index, row] of applied.entries()) {
      const migration = migrations[index];
      if (!migration || migration.tag !== row.tag || migration.hash !== row.hash) {
        throw new Error(`PRRO migration history mismatch: ${row.tag}. Restore the matching migration files; do not reset the journal.`);
      }
    }
    for (const migration of migrations) {
      if (applied.some(row => row.tag === migration.tag)) continue;
      for (const statement of migration.sql) await client.query(statement);
      await client.query(
        'INSERT INTO "__prro_migrations" (tag, hash, created_at) VALUES ($1, $2, $3)',
        [migration.tag, migration.hash, migration.when],
      );
    }
    // IF NOT EXISTS is only for adoption, never proof of compatibility.
    await assertPrroSchema(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error("PRRO schema migration/verification failed; API startup aborted", { cause: error });
  } finally {
    client.release();
  }
}

/** Production is read-only: Publish owns schema changes, not application startup. */
export async function verifyPrroSchema(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await assertPrroSchema(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error("Incompatible PRRO schema; API startup aborted. Apply the journaled schema in development and publish its schema diff.", { cause: error });
  } finally {
    client.release();
  }
}
