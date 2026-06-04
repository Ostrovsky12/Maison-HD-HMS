---
name: Maison HD consolidation
description: Architecture decision - ONE Maison HD app, no separate HMS, module-based access per tenant
---

# ONE App Architecture

Maison HD (`/`) is the ONLY tenant-facing app. HMS (`/hms/`) is legacy and should be deprecated.

## Module system (already implemented)
- `enabled_modules` column in `organizations` table (jsonb type)
- Sidebar filters by `moduleKey` via `isModuleEnabled()` in `app-layout.tsx`
- `null` = all modules visible (no restrictions)
- Object `{module: true}` format is stored in DB for org 1 (legacy), but `isModuleEnabled` treats non-array as no restrictions
- Super admin sees everything regardless

## Key paths
- Maison HD sidebar: `artifacts/maison-hd/src/components/layout/app-layout.tsx`
- Routes: `artifacts/maison-hd/src/App.tsx`
- Super admin API: `/api/super-admin/*` (requires super_admin role)

**Why:** User's explicit vision from the start — SaaS with module access per tenant, not multiple separate apps.
