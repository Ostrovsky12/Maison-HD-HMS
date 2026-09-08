---
name: Canonical F&B table QR
description: Canonical destination and tenant-resolution rule for F&B table QR codes.
---

F&B table QR codes must open the Maison HD public QR menu and must use the organization record’s real slug. Never substitute a demo or default tenant slug when organization loading fails.

**Why:** Two guest-menu implementations previously coexisted, and the authenticated user profile endpoint did not provide the organization slug. A default tenant silently produced valid-looking QR codes that opened another organization’s seeded menu.

**How to apply:** Generate table QR values only after the authenticated organization endpoint returns a slug. Keep QR rendering local so availability of a third-party image service cannot prevent scanning. Outlet-wide QR behavior may remain separate until outlet filtering is supported by the canonical menu.