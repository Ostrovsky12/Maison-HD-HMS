---
name: Auto-seed guard
description: autoSeedIfEmpty() now checks usersTable (not organizationsTable) to avoid re-seeding after tenant deletion
---

# Auto-seed Guard Fix

File: `artifacts/api-server/src/lib/auto-seed.ts`

## The problem
Original guard: `const existing = await db.select().from(organizationsTable).limit(1)`
If all orgs are deleted (intentional tenant wipe), on next server restart it would re-create DOGODA + Demo orgs.

## The fix
Changed to: `const existingUsers = await db.select().from(usersTable).limit(1)`
Super admin user (organizationId=null) survives tenant deletion, so the guard correctly skips re-seeding.

**Why:** Tenant wipe is a deliberate operation. Super admin always exists. Checking users is a more reliable guard.
**How to apply:** Any change to seeding logic must preserve this guard pattern.
