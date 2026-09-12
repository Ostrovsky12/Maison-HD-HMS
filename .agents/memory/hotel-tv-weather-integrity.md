---
name: Hotel TV weather integrity
description: Reliability and tenant-isolation rules for external weather shown on room televisions.
---

Hotel TV weather may use a shared public provider, but cached and stale results must be keyed by organization as well as configured location. If neither live nor same-organization cached data is available, return an explicit unavailable state instead of estimating or simulating conditions.

**Why:** Weather is guest-facing operational information. Cross-tenant cache reuse can show the wrong hotel's location, while seasonal or inferred fallback values present fabricated conditions as current facts.

**How to apply:** Keep provider calls server-side, use bounded timeouts, normalize the response contract, retain the provider update time, and only serve stale data previously fetched for the same organization and weather configuration.