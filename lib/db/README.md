# PRRO schema changes

## One development migration path

Run `pnpm --filter @workspace/scripts run db:migrate-prro` from the repository
root. Post-merge setup runs this automatically and stops on failure. On a
completely empty target schema, it first provisions the non-fiscal base from the
existing Drizzle models using create-from-empty SQL generation. The guard and
creation run under a transaction/advisory lock. It never reconciles, pushes, or
alters an existing installation; partially provisioned databases fail explicitly
if fiscal prerequisites are missing. PRRO tables are excluded from base
generation and are created only by the scoped journal below.

The canonical SQL history lives in `migrations/` and `migrations/meta/_journal.json`.
The PRRO runner uses Drizzle's journal reader and selects entries explicitly
marked `"scope": "prro"`. It records their SHA-256 hashes in `__prro_migrations`,
under one transaction and a database advisory lock. Do not edit an applied SQL
file, reset its hash, or mark unrelated historical migrations as applied.

`0002_prro_dps` is retained unchanged as historical SQL. The forward-only
`0006_prro_legacy_adoption` baseline is the first scoped entry: it works for both
fresh PRRO installations and databases previously maintained by startup DDL.
It adds missing transport fields before creating indexes, preserves signed
payloads/documents/events, and never drops or recreates fiscal tables.
Future changes must append a new scoped journal entry and update the Drizzle
contract. Do not restore PRRO DDL in API startup or use `push-force`.

The transaction verifies columns, types, defaults, nullability, primary keys,
foreign keys, indexes, and the one-active-shift predicate before committing.
Incompatible pre-existing data/constraints abort the transaction; they are not
silently rewritten. A successful ledger entry alone never bypasses verification.

## Managed production database

Production schema changes are owned by Replit Publish's development-to-production
schema diff, **not by deploy build hooks or API startup**. There is deliberately
no production migration script. `db:migrate-prro` refuses `NODE_ENV=production`.
Never use Publish's overwrite-data option to apply a fiscal schema upgrade.

API startup performs the same read-only contract check in every environment,
before seeders, schedulers, WebSockets, or HTTP listen. It does not require
development ledger rows to be copied to production. Missing columns or unsafe
constraints result in a fatal startup error and nonzero exit; there is no
healthy endpoint on an incompatible PRRO schema.

Deployment procedure: apply the journal in development, run the checks below,
then review Publish's schema diff. The baseline is additive (tables, columns,
indexes); no fiscal documents or audit events are replaced. This task does not
publish or mutate the existing production database.

## Verification

`pnpm --filter @workspace/scripts run test:prro-migrations`

Tests use disposable PostgreSQL schemas without access to application tables.
The empty-database test executes the real post-merge CLI before the startup gate,
without manually creating any prerequisite tables.
They cover fresh creation, repeated/parallel runs, bootstrap adoption with
existing signed documents and audit events, incompatible types, index/default
drift, altered migration history, and read-only production gating.
