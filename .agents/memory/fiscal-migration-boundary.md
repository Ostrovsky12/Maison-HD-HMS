---
name: Fiscal migration boundary
description: Why fiscal schema adoption must not replay the full legacy journal or run production startup migrations.
---

Do not pretend bootstrap-created installations have applied unrelated historical
Drizzle migrations. Fiscal adoption needs an explicit scoped, forward-only
baseline, while keeping old SQL immutable.

**Why:** Existing environments were maintained by bootstrap/schema push rather
than a trustworthy complete migration history. Replaying initial migrations or
inventing baseline records can destroy data or hide incompatibilities.

**How to apply:** Append journaled fiscal changes and verify the full fiscal
contract even after migration hashes match. Preserve documents, signed payloads,
and audit events; fail rather than repairing incompatible data automatically.

For Replit-managed production, apply schema changes through Publish's dev-to-prod
diff. Startup is a read-only compatibility gate, not a schema migration step.

**Why:** A single application-owned production migration path is incompatible
with the managed production deployment process; the approved implementation
separates dev migration from production verification.

**How to apply:** Keep deployment builds/startup free of new fiscal DDL and do not
require dev migration-ledger rows to exist in production.

Database-backed fiscal tests must use a disposable PostgreSQL schema with
`public` excluded from the search path, and verify that scope before fixture DDL.

**Why:** Legacy application tables may lag behind the expected payment contract.
Falling through to them can both conceal a missing fixture and modify actual
development data. Connection URL options can override the intended search path.

**How to apply:** Provision the isolated base and fiscal journal, keep legacy
route prerequisites explicit, fail on missing database access instead of skipping
the suite, and drop only the run-owned schema during cleanup.
