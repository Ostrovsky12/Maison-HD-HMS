import { pool } from "@workspace/db";
import { runMigrations } from "@workspace/db/migrate";
import { provisionEmptyDevelopmentDatabase } from "@workspace/db/provision";

try {
  await provisionEmptyDevelopmentDatabase(pool);
  await runMigrations(pool);
  process.stdout.write("PRRO migrations and schema verification succeeded.\n");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  if (error instanceof Error && error.cause) process.stderr.write(`${String(error.cause)}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
