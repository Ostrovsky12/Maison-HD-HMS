---
name: Legacy schema push guard
description: Safe handling of schema updates when the development database contains legacy relations absent from the current Drizzle model.
---

When a Drizzle `push` fails while reconciling unrelated legacy relations, do not retry with broad destructive options or manual SQL. First use read-only schema inspection to determine whether the intended additive tables/columns already applied, then preserve the source schema for the managed publish-time diff.

**Why:** The development database may contain relations that do not appear in the current Drizzle schema. Global reconciliation can fail on those unrelated objects even when the requested additive changes were applied before the failure.

**How to apply:** Treat any non-zero `push` result as incomplete until the exact intended tables and columns are verified. Never infer that a failure rolled all changes back, and do not use a broad force push as a repair strategy.