import type { Pool } from "pg";
import { pgEnum } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { subscriptionStatusEnum as organizationStatuses } from "./schema/organizations";
import { subscriptionStatusEnum as billingStatuses } from "./schema/subscriptions";

/**
 * Fresh development databases only. Never reconcile an existing schema and never
 * generate PRRO DDL: fiscal tables belong exclusively to the scoped journal.
 */
export async function provisionEmptyDevelopmentDatabase(pool: Pool) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Base provisioning is development-only; production schema is managed by Publish.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(734902, 45)");
    const { rows: [namespace] } = await client.query<{ name: string }>("SELECT current_schema() AS name");
    if (!namespace?.name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(namespace.name)) {
      throw new Error("A valid target schema is required for base provisioning");
    }
    const { rows: [state] } = await client.query<{ occupied: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind IN ('r','p','v','m','f','S')
      ) OR EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1 AND t.typtype IN ('e','d')
      ) AS occupied
    `, [namespace.name]);
    if (!state?.occupied) {
      // This is create-from-empty SQL generation, NOT an introspected schema
      // push/diff. No DROP/ALTER against existing tables can be generated.
      const { generateDrizzleJson, generateMigration } = await import("drizzle-kit/api");
      const fiscalExports = new Set([
        "prroRegistersTable", "prroShiftsTable", "fiscalDocumentsTable", "fiscalEventsTable",
      ]);
      const base: Record<string, unknown> = Object.fromEntries(
        Object.entries(schema).filter(([name]) => !fiscalExports.has(name)),
      );
      // Two legacy modules declare the same SQL enum with different values.
      // A fresh database must accept both contracts, never silently pick one
      // ambiguous barrel export or narrow another module's allowed values.
      const subscriptionValues = [...new Set([...organizationStatuses.enumValues, ...billingStatuses.enumValues])];
      base.subscriptionStatusEnum = pgEnum("subscription_status", subscriptionValues as [string, ...string[]]);
      const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(base));
      for (const statement of statements) {
        // Drizzle emits public-qualified references. Honor the explicit target
        // schema so tests and isolated development environments never escape it.
        await client.query(statement.replaceAll('"public".', `"${namespace.name}".`));
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error("Fresh database base provisioning failed", { cause: error });
  } finally {
    client.release();
  }
}
