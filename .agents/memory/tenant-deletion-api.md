---
name: Tenant deletion API
description: Super admin endpoints for deleting one or all organizations (cascade delete)
---

# Tenant Deletion Endpoints

File: `artifacts/api-server/src/routes/super-admin.ts`
Mount path: `/api/super-admin` (requires super_admin JWT)

## Endpoints
- `DELETE /api/super-admin/tenants/:id` — delete single org + all its data
- `DELETE /api/super-admin/tenants` — wipe ALL orgs + all their data

## What gets deleted (cascade order)
subscription_invoices, notifications, automation, fb_* tables, maintenance, folio/accounting, bookings, guests, units, properties, legal_entities, addons, spa/events, housekeeping, staff, revenue, ai_conversations, upsell, activities, sales, inbox, green_initiatives, users, organizations.

## Important
- Super admin user (organization_id=null) is NOT deleted — it survives the wipe
- Dev DB and production DB are SEPARATE in Replit — must deploy then call production URL
- Production URL pattern: `https://<app>.replit.app/api/super-admin/tenants`

**Why:** Needed for clean-slate tenant management. Production orgs 1, 12, 39 need to be deleted for DOGODA onboarding.
