# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

HMS (Hotel Management System) — повноцінна SaaS PMS платформа для управління готельно-ресторанним комплексом "Dogoda Resort".

## Pages / Routes

- `/dashboard` — аналітика, KPI карти, Revenue, Occupancy
- `/chess` — шахматка (booking chessboard calendar), collapsible groups
- `/bookings` — всі бронювання, click-to-open detail modal з QR та LiqPay
- `/living` — **Мешкаючі гості** (LivingGuests), поточні заселені гості з балансом, ночами, виїздом
- `/guests` — CRM гостей
- `/housekeeping` — прибирання
- `/units` — юніти (номери, будинки, шезлонги і т.д.)
- `/rates` — тарифи
- `/import` — імпорт даних з dogoda.me або JSON файлу

## Features

- **LiqPay** — `POST /api/bookings/:id/liqpay` генерує URL оплати; `POST /api/bookings/liqpay/callback` вебхук
- **QR-коди** — `GET /api/bookings/:id/qr` повертає data:image/png QR з даними бронювання
- **Import** — `GET /api/import/fetch` намагається отримати дані з dogoda.me; `POST /api/import/data` — масовий імпорт
- **Living Guests** — розширений вигляд: nights left, balance, checkout warnings, quick checkout action

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/hms)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Auth**: JWT (jsonwebtoken + bcryptjs)
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Routing**: wouter
- **UI**: Tailwind CSS + Shadcn components

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (all backend routes)
│   └── hms/                # React + Vite frontend (HMS dashboard)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/
│   └── src/seed.ts         # Seed script for Dogoda Resort data
```

## Database Schema

- **organizations** — Multi-tenant organizations (SaaS model)
- **users** — Users with roles: super_admin, owner, manager, reception, housekeeping
- **properties** — Properties per org (hotel, house, spa, pool, bungalow, other)
- **units** — Rentable units: `hasView` (park/sea/city/garden/mountain/pool), `hasBalcony`, `squareMeters`, `maxCapacity`
- **guests** — Guest CRM: `middleName`, `passportNumber`, `nationality`, `birthDate`, `address`, `loyaltyLevel` (bronze/silver/gold/platinum), `loyaltyPoints`, `totalNights`, `totalSpent`, `preferences[]`, `tags[]`, `lastVisit`
- **bookings** — Bookings with status and payment tracking
- **housekeeping_tasks** — Task management for housekeeping staff
- **rates** — Rate plans with seasonality and promo codes
- **addons** — Additional services (bicycle, fishing rod, etc.)
- **booking_addons** — Add-ons attached to bookings
- **payments** — Payment records per booking

## API Routes

All routes at `/api/*`:
- `POST /api/auth/login` — Login with email/password
- `GET /api/auth/me` — Get current user (bearer token)
- `GET /api/properties` — List properties
- `GET /api/units` — List units (with filters: propertyId, category, status)
- `GET /api/units/availability?checkIn=&checkOut=` — Availability check per date range
- `GET /api/units/categories` — Category summary with counts
- `GET /api/bookings` — List bookings (with date/status filters)
- `POST /api/bookings` — Create booking
- `GET /api/guests` — Guest list with search/pagination
- `GET /api/housekeeping/tasks` — Housekeeping tasks
- `GET /api/housekeeping/unit-statuses` — Unit housekeeping statuses
- `GET /api/rates` — Rate plans
- `GET /api/addons` — Add-on services
- `GET /api/payments` — Payments
- `GET /api/analytics/dashboard` — Dashboard analytics
- `GET /api/analytics/occupancy` — Occupancy time series
- `GET /api/users` — User management

## Seed Data (Dogoda Resort)

Run: `pnpm --filter @workspace/scripts run seed`

Creates:
- Organization: Dogoda Resort (enterprise plan)
- Users: Super Admin, Owner, Reception, Housekeeping
- Properties: Будинки, Готель, SPA-центр, Басейн, Бунгало
- 9 houses with 1 bedroom + 5 houses with 2 bedrooms
- 18 standard hotel rooms + 1 luxury suite
- 16 SPA units + 2 outdoor jacuzzis
- 30 pool loungers
- 14 bungalows
- Add-ons: велосипед, вудочка, трансфер, барбекю

## Login Credentials

- Super Admin: admin@hms.app / admin123
- Owner: owner@dogoda.com / owner123
- Reception: reception@dogoda.com / reception123
- Housekeeping: hk@dogoda.com / hk123

## Key Pages

1. `/login` — Login page with hotel background
2. `/dashboard` — Analytics dashboard with KPIs and charts
3. `/chess` — Booking chessboard (unit × date calendar)
4. `/bookings` — Booking management list
5. `/guests` — Guest CRM
6. `/housekeeping` — Housekeeping task board
7. `/units` — Unit management

## Maison HD (Second Product)

Premium HMS SaaS at `/maison-hd/`. Shares the same API server. Key pages:
- `/maison-hd/dashboard` — KPI dashboard
- `/maison-hd/bookings` — Bookings management
- `/maison-hd/chess` — Chessboard calendar
- `/maison-hd/units` — Rooms management
- `/maison-hd/guests` — CRM
- `/maison-hd/housekeeping` — Housekeeping
- `/maison-hd/invoices` — Invoices
- `/maison-hd/reports` — Reports + Night audit
- `/maison-hd/analytics` — Advanced KPI, ADR/RevPAR charts, forecast (Stage 5)
- `/maison-hd/integrations` — OTA channels, Webhook management (Stage 5)
- `/maison-hd/subscription` — Subscription plan cards + comparison table (Stage 6)
- `/maison-hd/admin` — Super Admin panel: org list, 2-step create wizard (Stage 6)
- `/maison-hd/onboarding` — 4-step owner onboarding wizard (Stage 6)

Stage 5 DB tables: `ota_channels`, `webhook_endpoints`, `kpi_history`, `forecasts`

Stage 5 API routes:
- `GET/POST /api/integrations/ota` — OTA channel CRUD + sync
- `GET/POST /api/integrations/webhooks` — Webhook endpoint CRUD
- `GET/POST /api/analytics/kpi` + `/kpi/generate` — KPI history
- `GET/POST /api/analytics/forecast` + `/forecast/generate` — Forecasting
- `GET /api/analytics/summary` — Analytics summary

Stage 6 DB: `organizations` table extended (email, phone, subscriptionStatus, trialEndsAt, timezone, currency, primaryColor); added `organization_members` table

Stage 6 API routes:
- `GET /api/organizations/me` — current user's organization
- `PATCH /api/organizations/:id` — update org
- `GET /api/organizations/:id/members` — list members
- `POST /api/organizations/:id/invite` — invite member
- `DELETE /api/organizations/:id/members/:userId` — remove member

Stage 6 Sidebar role-based nav:
- `super_admin` → sees "Super Admin" (amber), "Підписка", "Demo Заявки", Analytics, Integrations + all core
- `owner/manager` → sees "Підписка", Analytics, Integrations + all core
- `reception/housekeeper` → core only

## Stage 8 (Current)

### BookingDialog (Comprehensive Booking Creation/Edit)
- `artifacts/maison-hd/src/components/booking/booking-dialog.tsx` — shared dialog used in both `/bookings` and `/chess`
- Sections: Unit selector, Dates+Time pickers, Rate/Channel, Guest count steppers (adults/children/extra beds), Standard addons with pricing, Guest ПІБ+phone, Collapsible discounts, Price summary
- Footer: Чернетка (Draft, 6h hold) | Посилання на оплату (LiqPay) | Рахунок (invoice+print) | Скасувати | Підтвердити
- Draft conflict detection via `GET /api/bookings/check-draft`
- Payment link sub-dialog with Copy+Telegram share buttons
- Invoice sub-dialog with print support

### Stage 8 DB Tables
- `legal_entities` — org's legal entities (name, type TOV/FOP, EDRPOU, IBAN, bank, MFO, address, liqpayPublicKey/PrivateKey, isDefault)
- `discount_types` — org's discount catalog (name, code, value, valueType percent/fixed)
- `bookings` extended: checkinTime, checkoutTime, rateId, adults, childrenUnder6, childrenOver6, extraBeds, firstName, lastName, middleName, phone, discountId, discountValue, discountType, selectedAddons (jsonb), draftExpiresAt, paymentLink, legalEntityId, plus 'draft' status

### Stage 8 API Routes
- `GET /api/bookings/check-draft?unitId=&checkIn=&checkOut=` — check for existing draft on dates (MUST be before /:bookingId in route order)
- `POST /api/bookings/:id/payment-link` — generate LiqPay payment link
- `GET /api/bookings/:id/invoice` — get invoice data for rendering/printing
- `GET/POST /api/legal-entities` — CRUD
- `PATCH/DELETE /api/legal-entities/:id` — update/delete
- `GET/POST /api/discount-types` — CRUD with auto-seed 3 defaults (День народження 10%, УБД 10%, Постійний гість 5%)
- `PATCH/DELETE /api/discount-types/:id` — update/delete

### Stage 8 Settings Tabs (New)
- `/maison-hd/settings` → "Юр. особи" tab — full CRUD for legal entities (set-as-default, LiqPay key status indicator)
- `/maison-hd/settings` → "Знижки" tab — full CRUD for discount types (percent/fixed, code)

## Stage 7

### New Pages
- `/maison-hd/demo` — Public marketing landing page with demo request form (no auth required)
- `/maison-hd/demo-requests` — Super Admin panel for managing demo requests (super_admin only)
- `/maison-hd/subscription` — Full payment flow: monthly/yearly toggle, LiqPay form, sandbox simulate, invoice history

### Stage 7 DB Tables
- `subscriptions` — active subscription per org (tier, period, status, currentPeriodEnd)
- `subscription_invoices` — payment invoices (invoiceNumber, amount, tax, total, status, paidAt)
- `subscription_payments` — payment records (liqpay/fondy, externalPaymentId, status)
- `demo_requests` — incoming demo request leads (name, email, company, status, notes)

### Stage 7 API Routes
- `GET /api/subscriptions` — current subscription + recent invoices (requireAuth)
- `POST /api/subscriptions/create-invoice` — create invoice + LiqPay form data (requireAuth)
- `GET /api/subscriptions/invoices` — full invoice history (requireAuth)
- `POST /api/subscriptions/cancel` — cancel subscription at period end (requireAuth)
- `POST /api/webhooks/liqpay` — LiqPay payment webhook (public)
- `POST /api/webhooks/fondy` — Fondy payment webhook (public)
- `POST /api/webhooks/simulate-payment` — sandbox simulate payment (requireAuth)
- `POST /api/demo-requests` — submit demo request (public, no auth)
- `GET /api/demo-requests` — list all demo requests (super_admin)
- `PATCH /api/demo-requests/:id` — update status/notes (super_admin)

### Chess Enhancements (Stage 7)
- Category badge-pill filters (Всі + dynamic categories with counts)
- Drag-to-select cells for new booking creation

## Stage 38 — Servio Migration & Integration Layer

### New DB Tables (lib/db/src/schema/migration.ts)
- `external_connections` — tenant connections to external HMS (Servio, etc.): baseUrl, apiKey, hotelCode, status, isCutoverMode
- `import_batches` — each import operation: entityTypes[], status, progress counters, deduplicationMode, conflictMode
- `import_batch_items` — individual items per batch: entityType, externalId, externalData (jsonb), internalId, status, action
- `sync_conflicts` — conflicts needing human review: conflictType, externalData, internalData, resolution, resolvedBy
- `external_entity_mappings` — permanent map: externalSystem+entityType+externalId ↔ internalId, syncStatus, mappingConfidence

### Servio Adapter (artifacts/api-server/src/lib/adapters/servio.ts)
- `ServioAdapter` class with `testConnection()`, `previewData()`, `fetchGuests()`, `fetchBookings()`, `fetchRooms()`, `fetchRatePlans()`, `fetchCompanies()`
- Demo mode: generates realistic Ukrainian hotel data (Ukrainian names, phones, booking history) for onboarding without real Servio access
- Live mode: ready for real Servio API connection via HTTP
- Mapping functions: `mapServioGuestToInternal()`, `mapServioBookingToInternal()`, `mapServioRoomToUnit()`

### Stage 38 API Routes (/api/migration/*)
- `GET /api/migration/connections` — list external connections
- `POST /api/migration/connections` — create connection (Servio credentials)
- `PATCH /api/migration/connections/:id` — update (including isCutoverMode switch)
- `POST /api/migration/connections/:id/test` — test connection, returns hotel info + data counts
- `POST /api/migration/connections/:id/preview` — preview data (samples of guests, bookings, rooms)
- `GET /api/migration/batches` — list import batches
- `POST /api/migration/batches` — create batch (entityTypes, date range, dedup/conflict mode)
- `GET /api/migration/batches/:id` — batch status + itemStats
- `POST /api/migration/batches/:id/start` — start async import job
- `POST /api/migration/batches/:id/cancel` — cancel
- `GET /api/migration/batches/:id/items` — paginated item list (filter by status/entityType)
- `GET /api/migration/conflicts` — list unresolved conflicts
- `PATCH /api/migration/conflicts/:id/resolve` — resolve single conflict
- `POST /api/migration/conflicts/bulk-resolve` — bulk resolve
- `GET /api/migration/mappings` — entity mappings (filter by entityType)
- `GET /api/migration/stats` — overall stats: connections, totals, unresolvedConflicts

### Import Job (runImportBatch)
- Async background job: imports rooms → guests → bookings in order
- Deduplication: checks by phone/email before creating guests
- Conflict handling: "flag" (human review) | "prefer_external" | "prefer_internal"
- Progress tracking: real-time updates to import_batches counters
- External entity mappings: created for every imported object

### Migration Dashboard UI (/maison-hd/migration)
- **Overview page**: stats cards, connections list, recent batches
- **Step 1 — Connect**: Servio credentials form (URL, API key, hotel code), test connection button
- **Step 2 — Preview**: data counts + expandable sample tables (guests, bookings, rooms)
- **Step 3 — Configure**: entity type checkboxes, date range, dedup mode, conflict mode
- **Step 4 — Import**: real-time progress bars, auto-poll for status
- **Step 5 — Conflicts**: conflict review table, bulk resolve (use_external/use_internal)
- **Step 6 — Summary**: final stats report
- **Step 7 — Cutover**: 8-item checklist, activates isCutoverMode on connection
- Sidebar nav: "Міграція" (ArrowRightLeft icon), roles: super_admin/owner/manager

## Stage 39 — Guest Cabinet & Online Check-in

### New DB Fields/Tables
- `bookings.guestAccessCode` varchar(20) UNIQUE — 10-char hex code for secure public access
- `bookings.checkinFormSubmitted` boolean — tracks whether guest submitted online check-in
- `bookings.checkinFormData` jsonb — stores check-in form data (name, passport, arrival time, requests)
- `guest_service_orders` table — all guest-ordered services per booking (type, qty, price, status, notes)
- Enums: `guest_order_status` (pending/confirmed/preparing/delivered/cancelled), `guest_order_type` (service/food/rental/spa/activity/other)

### Guest Portal API Routes (`/api/guest/*`) — all public except generate
- `POST /api/guest/generate/:bookingId` — (staff, auth) generate/get access code for booking
- `GET /api/guest/:code` — full booking info (unit, property, org, dates, payment, addons, orders)
- `POST /api/guest/:code/checkin` — submit online check-in form (name, passport, arrival time, requests)
- `GET /api/guest/:code/services` — service catalog (13 items: spa, rental, activity, food, service)
- `POST /api/guest/:code/service-order` — order a service
- `POST /api/guest/:code/checkout-request` — request checkout + feedback
- `GET /api/guest/:code/orders` — list guest's service orders

### Guest Portal UI (`/maison-hd/guest/:code`) — fully public, no auth required
- Beautiful mobile-first design (390px viewport), warm amber/stone palette
- **Tab 1 — Бронювання**: Hero with hotel name, dates, night count; booking details; addons; quick actions
- **Tab 2 — Заїзд**: Online check-in form (name, passport, nationality, arrival time, special requests); submitted state shows confirmation summary
- **Tab 3 — Послуги**: Service catalog by category; order modal (qty + time slot + notes); active orders list; checkout request form with rating + feedback
- **Tab 4 — Оплата**: Payment status, progress bar, pay online button, service orders total
- Sticky header with org/property name; bottom "Powered by Maison HD" bar

### Staff Integration (Booking Dialog)
- "Посилання гостя" button (amber styling) in booking dialog footer — appears for existing bookings
- Click 1: generates code via API, shows URL inline with copy/open/Telegram share buttons
- Click 2 (if already generated): copies to clipboard immediately with ✅ indicator
- Inline amber bar shows truncated URL + 3 action icons (copy, open, Telegram)
- Access code persists across sessions (stored in bookings.guestAccessCode)

## Running the App

The API server and HMS frontend run automatically via Replit workflows.

- API: `pnpm --filter @workspace/api-server run dev`
- Frontend HMS: `pnpm --filter @workspace/hms run dev`
- Frontend Maison HD: `pnpm --filter @workspace/maison-hd run dev`
- Seed DB: `pnpm --filter @workspace/scripts run seed`
- Push schema: `pnpm --filter @workspace/db run push`
- Codegen: `pnpm --filter @workspace/api-spec run codegen`
