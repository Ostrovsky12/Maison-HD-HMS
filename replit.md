# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

HMS (Hotel Management System) — повноцінна SaaS PMS платформа для управління готельно-ресторанним комплексом "Dogoda Resort".

## MVP Foundation Status ✅

All 12 foundation components are LIVE:

| Component | Status | Notes |
|---|---|---|
| Multi-tenant core | ✅ Live | DB schema with org_id isolation |
| Auth + roles | ✅ Live | JWT, 5 roles, role-based routes |
| Properties + units | ✅ Live | 64 units across 6 properties in demo |
| Chessboard / reservation grid | ✅ Live | `chess.tsx` (970 lines, real API) |
| Reservation creation | ✅ Live | `/bookings` + `/book` pages |
| Quote / invoice generation | ✅ Live | invoices API + quotes seeded |
| LiqPay payment layer | ✅ Live | `payment-layer.ts` route + webhooks |
| Owner dashboard | ✅ Live | Real analytics: 277K UAH, 31 bookings |
| Unified inbox skeleton | ✅ Live | `inbox.tsx` (1,140 lines) |
| Guest cabinet skeleton | ✅ Live | `guest-portal.tsx` (1,281 lines) |
| Accounting export abstraction | ✅ Live | `accounting.tsx` (2,117 lines) |
| Integration layer foundation | ✅ Live | `integrations` page + 5 integration accounts seeded |

## DOGODA DEMO GROUP — Demo Tenant

**Seed command**: `pnpm --filter @workspace/api-server run seed:demo`

**Tenant ID**: 37 | **Slug**: dogoda-demo | **Plan**: enterprise

**Login credentials** (password: `demo123`):
- `owner@dogoda-demo.ua` — role: owner
- `manager@dogoda-demo.ua` — role: manager
- `reception@dogoda-demo.ua` — role: reception
- `hk@dogoda-demo.ua` — role: housekeeping

**Demo data created (as of 2026-04-02)**:
- **6 properties**: DOGODA COTTAGES, DOGODA HOTEL, DOGODA SPA, DOGODA RESTAURANT, DOGODA POOL, DOGODA EVENTS
- **64 units**: 6×1-bed cottages, 6×2-bed cottages, 3×3-bed cottages, 8×std hotel rooms, 8×DBL hotel rooms, 2×suites, 9 spa cabins, 20 pool loungers, 3 event spaces
- **20 guests**: platinum/gold/silver/bronze loyalty tiers, real Ukrainian names
- **31 reservations**: 5 check-in today, 7 currently checked-in, 3 checkout today, 7 upcoming, 2 pending, 5 historical, 2 cancelled
- **8 invoices** + **15 payments** (cash/card/liqpay)
- **8 spa bookings**: 4 today, 4 future
- **5 rental bookings**: bike, kayak, SUP, BBQ, fishing rod
- **5 event leads** + **1 event booking** (Nova Poshta)
- **5 maintenance tickets**, **5 HK tasks**, **5 tasks**
- **3 quotes**, **5 integrations**, **4 payment providers**, **4 comm. channels**

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

**Migration**: `artifacts/api-server/migrations/001_proper_schema.sql` — applied. 172 total tables.
**Drizzle schema**: `artifacts/api-server/src/db/schema/` — organized by domain.
**DB connection**: `artifacts/api-server/src/db/index.ts`

### Domain Architecture (11 modules)

#### PLATFORM
- **organizations** (`tenants`) — Multi-tenant SaaS organizations
- **tenant_settings** — Per-tenant key-value module settings
- **subscriptions** — One active subscription per tenant (tier, period, modules[])
- **feature_flags** — Per-tenant feature toggle overrides with rollout %

#### IAM — Identity & Access Management
- **roles** — System roles (NULL tenant) + custom roles per tenant
- **permissions** — Granular resource×action×scope permission catalog (31 seeded)
- **role_permissions** — M:M roles↔permissions
- **user_roles** — M:M users↔roles, scoped to tenant+optionally property
- **user_permissions** — Direct permission overrides per user
- **users** — Staff accounts with tenant membership

#### PROPERTY
- **legal_entities** — LLC/FOP per tenant for invoice issuance
- **properties** — Physical locations (hotel, resort, villa)
- **unit_types** — Room category templates (Standard, Suite, Glamping)
- **units** (`property_units`) — Physical rooms, now has `unit_type_id`
- **amenities** — Amenity catalog, 17 global entries seeded
- **unit_type_amenities** — M:M unit_types↔amenities
- **business_units** — Revenue centers (Accommodation, F&B, Spa, Events)

#### GUESTS
- **guests** — Core PII identity (passport, contacts, LTV)
- **guest_profiles** — Behavioral profile (preferences, loyalty, AI segments)

#### RESERVATIONS
- **reservation_sources** — OTA/channel config per tenant
- **bookings** (`reservations`) — Extended: organization_id backfilled, 18 new columns added
- **reservation_items** — Line items per reservation (room nights, addons, taxes)
- **reservation_guests** — M:M reservations↔guests (multi-person)
- **reservation_status_history** — Immutable audit trail of status changes

#### RATES
- **rates** — Base rate plans (BAR, NR, BB, HB, FB)
- **rate_rules** — Restrictions + adjustments (min_stay, early_bird, day_multiplier, los_discount)
- **addons** — À la carte services
- **packages** — Bundled room + services
- **offers** — Promotions + promo codes
- **quotes** — Pre-booking proposals → convertible to reservations
- **quote_items** — Quote line items
- **availability_blocks** — Manual stop-sell / allotment overrides
- **maintenance_blocks** — Operational unit blocks linked to tickets

#### FINANCIALS
- **payment_providers** — Per-tenant payment gateway configs (LiqPay, Wayforpay, Stripe)
- **folios** — Guest bill header (line items in folio_entries)
- **invoices** — Formal tax documents (invoice, credit_note, act, receipt)
- **payments** — Money movement records
- **payment_attempts** — Individual gateway API call log with request/response

#### HOSPITALITY
- **spa_services** — Spa treatment catalog
- **spa_resources** — Bookable resources (rooms, therapists, equipment)
- **spa_bookings** — Spa appointment reservations
- **rental_items** — Rental equipment catalog (bikes, kayaks)
- **rental_bookings** — Equipment rental reservations
- **event_leads** — Event sales pipeline (wedding, conference, corporate)
- **event_bookings** — Confirmed event reservations
- **restaurant_charges** — F&B charges posted to room folios
- **pos_sync_logs** — POS↔PMS synchronization history

#### COMMUNICATIONS
- **communication_channels** — Per-tenant channel configs (WhatsApp, Email, SMS, Viber)
- **conversations** — Guest↔property conversation threads
- **messages** — Individual messages with direction, delivery status, AI flag
- **ai_summaries** — AI-generated entity summaries (guest, reservation, conversation)

#### OPERATIONS
- **tasks** — Generic staff task management
- **housekeeping_tasks** — Unit cleaning/inspection workflow with checklist + photos
- **maintenance_tickets** — Issue tracking with SLA, cost, work log

#### INTEGRATIONS
- **integration_accounts** — Per-tenant external system credentials (OTA, POS, Accounting, CRM)
- **integration_logs** — Per-call sync log with request/response payloads
- **audit_logs** — Immutable entity mutation audit trail

#### CONTENT & GUEST JOURNEY
- **tv_content** — In-room entertainment content library
- **tv_devices** — One per physical room TV/tablet
- **checkin_forms** — Pre-arrival form templates + submissions
- **checkout_requests** — Express/late/early checkout requests
- **documents** — Internal document storage (contracts, scans)
- **exported_documents** — Export/send registry
- **accounting_exports** — Accounting system export jobs (BAS, Checkbox, 1C)

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

## Stage 50 — Guest App (Гостьовий портал / PWA)

### UI (`/maison-hd/guest-app`) — Standalone mobile-first app (no auth needed)
**Lookup screen**: Enter booking ref (DOG-NNNNNN) → calls `/api/public/bookings/:ref`

**Home screen** (after lookup):
- Welcome card: guest name, room name, checkIn/checkOut dates, nights remaining progress bar
- Quick info grid: WiFi SSID/password, checkout time
- Services menu: SPA & Wellness / Ресторан Рум-сервіс / Зв'язок з ресепшн / Заходи

**Screens accessible from home**:
- **Food/Room-service**: categorized menu (Сніданок/Обід/Піца/Напої), add/remove to cart, "Замовити" confirms with toast (25 min delivery)
- **Chat**: real-time chat UI with hotel reception (auto-response bot simulation)
- **Services**: SPA treatments + active recreation + today's events list

**Features**: Dark/Light mode toggle · Sticky cart button when items added · Responds to real bookings from DB

### Navigation
- "Guest App" (Smartphone icon) in sidebar — roles: all (public page, no auth guard)
- Direct URL: `/maison-hd/guest-app`

---

## Stage 49 — Revenue Management

### New DB Tables
- `rate_plans` — rate plan configs: name, description, baseModifier (multiplier), status, isDefault, cancellationPolicy, minStay, maxStay, includesBreakfast
- `pricing_rules` — dynamic pricing rules: ruleType enum (occupancy/season/day_of_week/event/last_minute/early_bird), conditions JSONB, modifierType, modifierValue (%), priority, isActive, validFrom/validTo
- `pricing_overrides` — date-level price overrides per unit: overrideDate, customPrice, minStay, isClosed (stop-sell), reason

### API Routes (`/api/revenue/*`) — requireAuth
- `GET /stats` — totalPlans, activePlans, totalRules, activeRules, totalOverrides, closedDates
- `GET /plans` — all rate plans ordered (default first)
- `POST /plans` — create rate plan
- `PATCH /plans/:id` — toggle status / update fields
- `GET /rules` — all pricing rules with rate plan JOIN, ordered by priority desc
- `PATCH /rules/:id` — toggle isActive / update
- `GET /overrides` — all overrides with unit JOIN, ordered by date
- `POST /overrides` — create (upserts on conflict by date)
- `DELETE /overrides/:id` — remove override

### UI (`/maison-hd/revenue`) — 3-tab layout
- **Тарифні плани**: plan cards with baseModifier, cancellation policy, min stay, breakfast badge; activate/deactivate toggle
- **Правила цін**: rule cards with emoji icon (📊🌿📅🎉⚡🐦), modifier %, priority badge; toggle active/inactive
- **Перевизначення**: date overrides list with closed/price indicators; delete button; "Нове виключення" dialog
- **Navigation**: "Revenue Management" (TrendingUp icon), roles: super_admin/owner/manager

### Demo Data
- 4 rate plans (Стандартний/Тариф з сніданком/Невідмовний/Довгостроковий 7+)
- 8 pricing rules (висока/низька завантаженість, літній сезон, вихідні, last minute, early bird, День незалежності, Новий рік)
- Price overrides: +₴2800 for 2 event dates, stop-sell for 1 maintenance date

---

## Stage 48 — OTA Channel Manager

### New DB Tables
- `ota_channel_configs` — channel connections: organizationId FK, channel enum (booking_com/airbnb/expedia/agoda/ostrovok/direct), status enum (active/inactive/error/pending), displayName, apiKey, propertyIdExt, webhookSecret, lastSyncAt, lastError, settings JSONB
- `ota_unit_mappings` — unit↔channel room mapping: channelId FK, unitId FK, extRoomId, extRoomName, markupPercent
- `ota_webhook_logs` — all incoming webhook events: channelId FK, eventType enum, payload JSONB, status, bookingRef, errorMessage

**Note**: Legacy `ota_channels` table exists from integrations module (different schema). New OTA manager uses `ota_channel_configs`.

### API Routes (`/api/ota/*`) — requireAuth (except webhook receiver)
- `GET /stats` — totalChannels, activeChannels, errorChannels, totalEvents, newReservations, cancelledReservations, errors
- `GET /channels` — all channel configs with channelMeta
- `POST /channels` — create channel config (status=pending)
- `PATCH /channels/:id` — update status/fields (activating clears lastError + sets lastSyncAt)
- `POST /channels/:id/sync` — manual sync (only active channels; logs event)
- `GET /logs?channelId=` — webhook event history with channel JOIN
- `GET /mappings` — unit↔room mappings with unit+channel JOIN
- `POST /webhook/:channelSecret` — PUBLIC receiver (no auth); logs event to ota_webhook_logs

### UI (`/maison-hd/ota`) — 3-tab layout
- **Канали tab**: channel cards with logo emoji, status badge (active/error/inactive/pending), last sync time, error message; "Синхр." / "Вимкнути"/"Увімкнути" buttons; "Додати канал" dialog
- **Журнал подій tab**: event log with event type emoji label, booking ref badge, guest/amount details, timestamp
- **Маппінг номерів tab**: unit-to-room mapping table showing internal unit → external room ID/name + markup %
- **Navigation**: "OTA Channels" (Globe icon), roles: super_admin/owner/manager

### Demo Data
- 4 channels: Booking.com (active, 15min ago), Airbnb (active, 45min ago), Expedia (error), Ostrovok (inactive)
- 5 unit mappings (3 for Booking.com, 2 for Airbnb)
- 7 webhook log events (3 created, 1 cancelled, 1 modified, 1 availability, 1 error ping)

---

## Stage 47 — Rentals (Оренда)

### New DB Tables (lib/db/src/schema/rentals.ts)
- `rental_contracts` — tenant info, unit FK, start/end date, monthly_rate, deposit, status enum (active/ended/upcoming/terminated), contract_number UNIQUE
- `rental_payments` — period_year, period_month, amount, status (pending/paid/overdue/cancelled), due_date, paid_date, payment_method
- `rental_requests` — maintenance/service requests from tenants: title, description, priority (high/medium/low), status (open/in_progress/resolved)

### API Routes (`/api/rentals/*`) — requireAuth
- `GET /stats` — totalContracts, activeContracts, upcomingContracts, monthlyRevenue, overduePayments, pendingPayments, openRequests, urgentRequests
- `GET /contracts` — all contracts with unit JOIN (unitName, unitCategory)
- `POST /contracts` — create contract (auto-assigns contract_number like РЕН-YYYY-NNN)
- `PATCH /contracts/:id` — update (status, fields, etc.)
- `GET /payments` — all payments with tenant JOIN; ?contractId= filter
- `PATCH /payments/:id` — mark paid (sets paidDate=today, paymentMethod)
- `GET /requests` — all maintenance requests with tenant+unit JOIN
- `PATCH /requests/:id` — status update (open→in_progress→resolved sets resolvedAt)

### UI (`/maison-hd/rentals`) — 3-tab layout
- **Договори tab**: list all contracts with status badge + tenant info + unit + dates + monthly rate + deposit status; "Розірвати" button for active contracts
- **Платежі tab**: payment list with status filter (all/overdue/pending/paid); colored rows (red=overdue, green=paid); "Позначити сплаченим" button
- **Заявки tab**: maintenance requests with priority + status badges; "В роботу" / "✓ Вирішено" action buttons
- **New Contract Dialog**: unit ID, tenant details, dates, monthly rate, deposit, notes
- **Navigation**: "Оренда" (Building2 icon), roles: super_admin/owner/manager

### Demo Data
- 4 contracts (2 active: Петренко ₴8500/міс + Коваленко ₴6000/міс; 1 upcoming; 1 ended)
- 7 payments (6 paid, 1 pending)
- 4 maintenance requests (1 high/open + 1 low/resolved + 1 medium/in_progress + 1 low/open)

---

## Stage 46 — Online Booking Engine (Публічне бронювання)

### API Routes (`/api/public/*`) — NO AUTH REQUIRED
- `GET /properties` — list all properties with org name
- `GET /availability?checkIn=&checkOut=&guests=&propertyId=` — available units (non-maintenance, not booked in date range, capacity >= guests); returns nights + totalPrice per unit
- `POST /bookings` — create booking with conflict check; auto-generates bookingRef (DOG-NNNNNN); no auth needed
- `GET /bookings/:ref` — lookup booking by bookingRef

### Schema Changes
- `bookings` table: added `email VARCHAR(255)` + `booking_ref VARCHAR(20) UNIQUE` columns

### UI (`/maison-hd/book`) — 4-step public flow (no auth needed)
- **Step 1 (Search)**: property select + checkIn/checkOut dates + guest count → "Знайти"; feature strip (instant confirm / best price / free cancellation); property preview cards
- **Step 2 (Select)**: room grid with category, floor, capacity, m², view/balcony badges, price/ніч + total; "Обрати номер" button
- **Step 3 (Form)**: guest details (ім'я/прізвище/email/телефон/special requests) + sticky booking summary card; payment note (оплата при заїзді)
- **Step 4 (Confirm)**: success screen with bookingRef (DOG-NNNNNN), dates, amount; print button
- **Navigation**: "Онлайн-бронювання" (Sparkles icon), roles: super_admin/owner/manager/reception

---

## Stage 45 — AI Automation

### New DB Tables (lib/db/src/schema/automation.ts)
- `automation_rules` — name, description, trigger enum, conditions JSONB, actions JSONB[], isActive, runCount, lastRunAt
- `automation_logs` — ruleId FK, ruleName, trigger, status (success/failed/skipped), entityType, entityId, resultMessage, triggeredAt
- `upsell_offers` — bookingId FK, offerType (spa/upgrade/fb/late_checkout), title, description, price, status (pending/accepted/declined)

### Trigger Enums
booking_created | booking_confirmed | checkin_today | checkout_today | checkout_tomorrow | guest_birthday | payment_overdue | low_occupancy | hk_task_pending | fb_order_ready | spa_appointment_today | manual

### Action Enums
send_inbox_message | create_hk_task | create_notification | upsell_spa | upsell_fb | upsell_upgrade | send_email | webhook_call

### API Routes (`/api/automation/*`) — requireAuth
- `GET /rules` — list rules with triggerLabels + actionLabels maps
- `POST /rules` — create rule
- `PATCH /rules/:id` — toggle isActive, update fields
- `DELETE /rules/:id` — delete rule
- `POST /rules/:id/run` — manual trigger (logs execution, increments runCount)
- `GET /logs?status=&limit=` — execution history with status filter
- `GET /stats` — totalRules, activeRules, totalRuns, logsSuccess/Failed/Skipped, upsellPending/Accepted
- `GET /upsells` — active upsell offers
- `PATCH /upsells/:id` — respond to offer (accepted/declined)

### UI (`/maison-hd/automation`) — 3-tab layout
- **Правила tab**: rule cards with trigger badge + action chips + run count + last run; toggle switch (active/paused); ▶ run manually button; delete button
- **Журнал tab**: execution log with status filter + status icon (✓/✗/⏭); status color coding; timestamp
- **Апсели tab**: upsell offer cards grouped by type (spa/upgrade/fb); price + description; "Прийняти" / "Відхилити" buttons
- **New Rule Dialog**: name, description, trigger select, multi-action list (add/remove), save
- **Navigation**: "AI Automation" (Bot icon), roles: super_admin/owner/manager

### Demo Data (8 rules, 8 logs, 5 upsell offers)
- Привітання при заїзді (47 runs) · Нагадування при виїзді (31) · SPA апсел (23) · Сніданок рум-сервіс (8, inactive)
- Сповіщення при бронюванні (89) · Прибирання після виїзду (56) · Апгрейд при низькій завантаженості (3, inactive) · F&B готово (114)

---

## Stage 52 — AI Hub (8 AI модулів)

### OpenAI Integration
- Uses Replit AI Integrations proxy (`AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY`)
- Model: `gpt-5.2` for all modules (switched from gpt-5-mini for better JSON instruction following)
- Packages: `@workspace/integrations-openai-ai-server`, `@workspace/integrations-openai-ai-react`

### New DB Tables (lib/db/src/schema/ai-knowledge.ts)
- `ai_knowledge_articles` — organizationId, category (general/procedures/faq/policies/services/emergencies/local-info), title, content, tags
- `ai_insights_cache` — organizationId, insightType, content, generatedAt
- 7 seed articles: check-in/check-out procedures, Wi-Fi info, hotel policies, SPA services, fire emergency, local attractions

### API Routes (`/api/ai/*`) — requireAuth
- `POST /chat-reply` — AI generates reply for inbox conversation (uses messagesTable for history)
- `POST /sales-suggest` — AI upsell recommendations based on guest+booking context
- `POST /guest-summary/:guestId` — AI guest profile analysis (summary, preferences, risks, recommendations)
- `GET /admin-tips` — AI admin tips for today (uses live hotel stats: check-ins, check-outs, HK, inbox)
- `GET /owner-insights` — AI strategic insights with KPI analysis, opportunities, strategic recommendations
- `GET /knowledge` — list knowledge base articles
- `POST /knowledge` — create article
- `PUT /knowledge/:id` — update article
- `DELETE /knowledge/:id` — delete article
- `POST /knowledge/search` — AI-powered semantic search over knowledge base
- `POST /route-task` — AI task routing with department, priority, assignTo, deadline, reasoning
- `POST /copilot` — streaming SSE chat for staff internal AI assistant

### JSON Parsing (extractJSON helper)
CRITICAL: GPT models often return markdown code fences or wrapped objects. `extractJSON(raw, arrayMode)` handles:
1. Strip ```json fences
2. Try direct JSON.parse
3. If arrayMode + object returned → extract first array value
4. Fallback regex for embedded arrays/objects

### UI (`/maison-hd/ai-hub`) — 8 tabs
- **Copilot tab**: streaming chat UI with quick question buttons, clear chat
- **AI Чат tab**: select inbox conversation → generate AI reply → copy to clipboard
- **Sales AI tab**: select guest → AI generates 3-5 upsell suggestions with priority and revenue estimate
- **Гість AI tab**: select guest → AI profile (summary, preferences, risks, recommendations, VIP notes)
- **Поради tab**: auto-loaded admin tips on open, refresh button, live stats cards + tip cards by priority
- **Insights tab**: auto-loaded owner insights, executive summary, KPI analysis, opportunities, strategic recommendations
- **База знань tab**: CRUD articles, AI semantic search bar, category filter, tag display
- **Routing tab**: describe task → AI routes to department with priority/deadline/steps, history sidebar
- **Navigation**: "AI Hub" (Brain icon), roles: super_admin/owner/manager

### CRITICAL: gpt-5.2 vs gpt-5-mini for JSON output
When using gpt-5-mini, models tend to return `[]` or `{}` for JSON-format prompts.
Use `gpt-5.2` for any endpoint that requires structured JSON output.
Always use `extractJSON(raw, arrayMode)` instead of manual regex matching.

---

## Stage 53 — Guest Experience (Повний Life Cycle гостя)

### Нові DB таблиці (`lib/db/src/schema/guest-experience.ts`)
- `guest_loyalty` — loyalty програма: email, organizationId, tier (bronze/silver/gold/platinum), points, totalPoints, totalSpend, visitsCount, lastVisitDate
- `loyalty_transactions` — log нарахувань: loyaltyId, bookingId, type (earn/redeem/bonus/expiry), points, description
- `guest_reviews` — відгуки: overallRating, cleanlinessRating, serviceRating, locationRating, valueRating, reviewText, npsScore, wouldReturn, recommendToFriend, isPublished, staffResponse
- `guest_portal_messages` — двосторонній чат: bookingId, direction (guest_to_hotel/hotel_to_guest), senderName, message, isRead
- `guest_special_offers` — промо акції: title, promoCode, discountPct, validFrom/Until, targetAudience (all/returning/vip/new), minNights
- `guest_communication_log` — лог всіх комунікацій: type, channel, sentAt, openedAt, clickedAt

### API Routes (розширено `/api/guest/*`)

**Staff (requireAuth):**
- `GET /summary` — KPI summary (loyaltyAccounts, reviewsCount, avgRating, activeOffers, unreadMessages)
- `GET /loyalty-overview` — всі loyalty accounts організації
- `GET /reviews` + `PATCH /reviews/:id` — управління відгуками (isPublished, staffResponse)
- `GET /offers` + `POST /offers` + `PATCH /offers/:id` + `DELETE /offers/:id` — CRUD спецпропозицій
- `POST /communicate/:bookingId` — log комунікації
- `POST /message/:bookingId` — повідомлення гостю від персоналу
- `POST /review-request/:bookingId` — надсилання запиту на відгук
- `GET /communications/:bookingId` — history повідомлень

**Public (guest portal, no auth):**
- `GET /:code` — тепер також повертає loyalty, messages, review, offers
- `POST /:code/message` — гість надсилає повідомлення готелю
- `POST /:code/review` — гість залишає відгук (+100 loyalty pts)
- `GET /:code/documents` — список цифрових документів
- `POST /:code/checkin` — тепер також auto-creates loyalty account (+50 pts)

### Guest Portal UI (`/maison-hd/guest/:code`) — 8 вкладок
1. **Резервація** — деталі бронювання + Room amenities + Спецпропозиції
2. **Чекін** — онлайн форма заїзду (+50 loyalty pts), pre-populated fields
3. **Послуги** — каталог з category filter, service ordering modal + Мої замовлення + Запит виїзду
4. **Чат** — real-time двосторонній чат з готелем, quick reply buttons, badge з кількістю непрочитаних
5. **Бонуси** — loyalty картка (visual card з градієнтом за рівнем), progress bar до next tier, stats, привілеї
6. **Відгук** — star picker (global + 4 categories), NPS (0-10), wouldReturn/recommendToFriend, +100 pts
7. **Документи** — підтвердження/рахунок/реєстраційна картка/квитанція
8. **Оплата** — balance + payment link + service orders breakdown

### Admin Page (`/maison-hd/guest-experience`) — 4 вкладки
1. **Лояльність** — tier summary (Bronze/Silver/Gold/Platinum), accounts table, правила нарахування
2. **Відгуки** — review cards з rating/NPS, publish/unpublish, staff response modal
3. **Пропозиції** — CRUD спецпропозицій з audience targeting, promo codes, validity dates
4. **Workflow** — Guest Journey timeline (8 etapів від бронювання до +30 днів), metrics, tier ladder

### Loyalty Tier System
- **Bronze**: 0+ pts — базові нарахування
- **Silver**: 500+ pts — 5% знижка, late checkout 13:00
- **Gold**: 2000+ pts — 10% SPA, free parking, breakfast included
- **Platinum**: 5000+ pts — personal butler, VIP lounge, airport transfer

### Navigation
- "Гостьовий досвід" (Heart icon) — roles: super_admin/owner/manager/reception

---

## Stage 44 (Rev 2) — Owner/HQ Command Center Dashboard — EXPANDED

### New DB Table: `monthly_budgets`
- organizationId, year, month
- accommodationTarget, fbTarget, spaTarget, eventsTarget, totalTarget (NUMERIC)
- occupancyTarget, adrTarget
- notes TEXT
- Seeded: Jan-Apr 2026 budgets for Dogoda Resort

### Extended API `/hq/overview` — new fields:
- `byProperty[]` — per property: name, totalUnits, inHouse, occupancy%, revenueMonth, ADR, arrivalsToday, departuresToday, bookingsMonth
- `byDepartment` — {accommodation, fb, spa, events}: revenue, share%, label, color
- `financials` — ADR, RevPAR, totalDebt, paidThisMonth, unpaidCount, partialCount, paidCount, revenueYTD, totalMonthRevenue
- `debtors[]` — bookings with outstanding balance: name, bookingRef, checkIn/Out, totalAmount, paidAmount, debt, paymentStatus
- `forecast[]` — 30-day array: date, label, weekday, arrivals, inHouse, occupancy%, isToday, isWeekend
- `budget` — plan vs actual: targets + actuals + pct for all departments, occupancy, ADR
- `kpi` extended: adr, totalDebt, paidThisMonth, revenueYTD, totalMonthRevenue

### Budget API Routes (`/api/hq/budget`)
- `GET /budget` — list last 12 months budgets
- `POST /budget` — create budget for a month
- `PUT /budget/:id` — update budget

### HQ Frontend — 5 tabs:
1. **Зараз** — Operational: arrivals, departures, HK, F&B orders, SPA, Events, Inbox, 7-day revenue bar chart (Recharts)
2. **По об'єктах** — Property cards: occupancy bar, revenue, ADR, today movements + comparison table
3. **Підрозділи** — Accommodation/F&B/SPA/Events revenue breakdown: cards, Recharts bar chart, structure bars, occupancy per property
4. **Фінанси** — Payments breakdown (paid/partial/unpaid counts), Key metrics (ADR, RevPAR, YTD, collection rate), Plan/Actual progress bars, Debtors table with debt amounts
5. **Прогноз** — 30-day forecast: summary cards, AreaChart (Recharts), color-coded calendar grid (green=80%+, blue=60-79%, yellow=40-59%, orange=20-39%)

## Stage 44 — Owner/HQ Command Center Dashboard

### API Route (`/api/hq/overview`) — requireAuth
Single aggregated endpoint pulling from ALL modules in parallel (Promise.all):
- **Bookings**: arrivals today, departures today, in-house count, occupancy %, revenue today (checkOut=today), 7-day revenue trend array
- **Revenue**: revenueThisMonth + revenueLastMonth (for MoM trend %)
- **Housekeeping**: hkPending + hkInProgress + hkHigh counts (non-done/non-cancelled tasks)
- **SPA**: spaTodayCount + spaRevenueToday (completed appts); spaToday[] detail array (guestName, startTime, endTime, serviceName, totalPrice, status) — top 5
- **Events**: eventsUpcoming[] (next 14 days, non-cancelled, max 5) with spaceName JOIN
- **F&B**: fbOpenOrders[] (non-billed/non-cancelled) with tableNumber JOIN; fbTables {total/free/occupied}; fbRevenueToday (billed orders today)
- **Inbox**: inbox[] (conversations with unreadCount ≥ 1, top 5 by updatedAt); totalUnread

Returns: `{ kpi{…}, arrivals[], departures[], inHouse[], hk{…}, spaToday[], eventsUpcoming[], fbOpenOrders[], fbTables{…}, inbox[], sevenDayRevenue[] }`

### HQ Dashboard UI (`/maison-hd/hq`)
**Command Center** — full-width owner/manager dashboard with auto-refresh every 60 seconds:

**Primary KPI row (4 cards)**:
- Завантаженість: occupancy% + "X з Y номерів" → link to /bookings
- Виручка сьогодні: rooms + "SPA: X · F&B: Y" sub-line
- Виручка цього місяця: total + MoM trend arrow (+X% / -X%)
- Відкрито замовлень: F&B open count + "Столів: X/Y зайнято" → link to /fb

**Secondary KPI row (6 mini-cards)**:
- Заїздів сьогодні (green LogIn icon) → /bookings
- Виїздів сьогодні (red LogOut icon) → /bookings
- SPA сьогодні (teal Waves icon) → /spa
- Events тижня (pink PartyPopper icon) → /events
- HK завдань (yellow Sparkles, ring when > 0) → /housekeeping
- Непрочитаних (blue MessageSquare, ring when > 0) → /inbox

**3-column main grid**:
- Left: Arrivals card + Departures card + Housekeeping summary (3 colored boxes: Очікують/В роботі/Термінових)
- Center: F&B live orders (status badge, table/room, amount) + SPA today schedule (time range, status, guest, service, price)
- Right: 7-day revenue mini bar chart (blue bars, today highlighted) + Events this week (date/space/amount) + Inbox unread (clickable items with unread badge)

**Bottom row**: In-house guests grid (all current bookings as compact chips with guest name + checkout date)

**Navigation**: "Command Center" at TOP of sidebar with Zap icon, roles: super_admin/owner/manager

## Stage 43 — F&B / Restaurant Module

### New DB Tables (lib/db/src/schema/fb.ts)
- `fb_categories` — menu categories: name, emoji, sortOrder, isActive
- `fb_items` — menu items: name, description, price, priceHappy (happy hour), cookMinutes, categoryId FK, isAvailable, isPopular, isVegetarian, allergens[], tags[], sortOrder
- `fb_tables` — restaurant tables: number, capacity, location, status (4 values), currentOrderId, isActive
- `fb_orders` — orders: tableId FK, bookingId FK, orderType (4 values), guestName, roomNumber, guestCount, status (6 values), totalAmount, paidAmount, notes, staffNotes, openedAt, closedAt
- `fb_order_items` — order items (ON DELETE CASCADE): orderId FK, itemId FK, name, price, quantity, totalPrice, status (5 values), sentAt, readyAt, servedAt
- 4 Enums: fb_order_status, fb_order_type, fb_item_status, fb_table_status

### F&B API Routes (`/api/fb/*`) — requireAuth
- `GET /api/fb/stats` — today: orders/revenue/openOrders; tables: total/free/occupied/reserved; topItems (top 5 by order count)
- `GET /api/fb/categories` — list categories ordered by sortOrder
- `POST /api/fb/categories` — create category
- `GET /api/fb/items?categoryId=&available=true` — items with JOIN to categories (categoryName, categoryEmoji); ordered by category+sortOrder
- `POST /api/fb/items` — create menu item
- `PATCH /api/fb/items/:id` — update item (toggle isAvailable, price, etc.)
- `GET /api/fb/tables` — tables with LEFT JOIN to current order (orderGuestName, orderTotal, orderStatus)
- `POST /api/fb/tables` — create table
- `PATCH /api/fb/tables/:id` — update status; if "free" → clears currentOrderId
- `GET /api/fb/orders?status=&type=&open=true` — orders with JOIN to table (tableNumber, tableLocation); ordered by openedAt DESC
- `GET /api/fb/orders/:id` — order detail + items[]; LEFT JOIN to table
- `POST /api/fb/orders` — create order; auto-sets table status to "occupied" + currentOrderId
- `PATCH /api/fb/orders/:id` — update status/paidAmount/staffNotes; on billed/cancelled → table set to "free"
- `POST /api/fb/orders/:id/items` — add item (by itemId from menu OR custom name+price); auto-recalculates order totalAmount
- `PATCH /api/fb/order-items/:id` — update item status with timestamps (sentAt/readyAt/servedAt)
- Demo data: 7 categories, 19 menu items (breakfast/soups/mains/salads/desserts/drinks/bar), 12 tables (main hall/VIP/terrace/bar), 3 open orders with items

### F&B UI (`/maison-hd/fb`)
3-tab management page (Зал / Замовлення / Меню):
- **Stats row**: відкритих замовлень, столів зайнято (x/total), виручка сьогодні, топ страва
- **Зал** — visual table map grouped by location (Основний зал/VIP-зона/Тераса/Бар): colored tiles with table number, capacity, status dot, current order amount; click free → open new order dialog; click occupied → open order detail
- **Замовлення** — filterable list by status (відкриті/all/specific) + type (в залі/рум-сервіс/…); each card: type icon, table number or room/guest name, status badge, type badge, time opened, total amount
- **Меню** — searchable + category-filtered grid; each item: name, popular⭐/vegetarian🌿 icons, description, price, cook time; availability toggle (✓/○)
- **Order detail view** (full-screen):
  - Header: table/room number, status badge, type badge, guest name+count, total
  - Items list: name, quantity×price=total, item status badge; action buttons (🔥 → cooking, ✓ → ready, 🍽 → served)
  - Status workflow buttons: "Відправити на кухню" → "Готово до подачі" → "Подано гостям" → "Закрити рахунок (XXX ₴)"; Скасувати
  - "+ Додати позиції" → AddItemDialog
- **AddItemDialog**: search + category filter, quantity +/- per item, batch add multiple items + notes
- **NewOrderDialog**: type select, table select (free only) / room number (room service), guest name, guestCount, notes
- **NewMenuItemDialog**: name/description/category/price/cookMinutes/isVegetarian/isPopular
- Table status legend at bottom of hall view
- Sidebar nav: "F&B / Ресторан" (UtensilsCrossed icon), all roles

## Stage 42 — Events & Banquet Module

### New DB Tables (lib/db/src/schema/events.ts)
- `event_spaces` — halls/venues: name, description, capacityMin/Max, areaSqm, pricePerHour, pricePerDay, amenities[], isActive, color
- `events` — main event record: eventType, name, clientName/Phone/Email, eventDate (DATE), startTime/endTime, guestCount, status (6 values), venuePrice, servicesPrice, totalPrice, depositAmount, depositPaid, notes, staffNotes, tags
- `event_services` — ordered services per event (ON DELETE CASCADE): category, name, quantity, unitPrice, totalPrice, isConfirmed, vendorName, vendorPhone, notes
- `event_tasks` — checklist tasks per event (ON DELETE CASCADE): title, status (4 values), dueDate, assignedTo, sortOrder, completedAt
- 4 Enums: event_type (8 values), event_status (6 values), event_service_category (8 values), event_task_status (4 values)

### Events API Routes (`/api/events/*`) — requireAuth
- `GET /api/events/stats` — upcoming/thisWeek/thisMonth/confirmed/completed counts, totalRevenue (completed), upcomingRevenue
- `GET /api/events/spaces` — list all halls/venues
- `POST /api/events/spaces` — create space
- `PATCH /api/events/spaces/:id` — update space
- `GET /api/events/?status=&type=&from=&to=` — events list with JOIN to space (spaceName, spaceColor, spaceCapacityMax); ordered by eventDate+startTime
- `GET /api/events/:id` — single event + services[] + tasks[]; full detail
- `POST /api/events/` — create event; auto-generates 7 standard tasks (підтвердити договір → отримати депозит → план → підрядники → підготовка залу → проведення → прибирання)
- `PATCH /api/events/:id` — update status/staffNotes/depositPaid/depositAmount/prices/guestCount/startTime/endTime/tags
- `POST /api/events/:id/services` — add service; auto-recalculates servicesPrice + totalPrice on event
- `PATCH /api/events/services/:id` — toggle isConfirmed, update notes
- `POST /api/events/:id/tasks` — add custom task
- `PATCH /api/events/tasks/:id` — toggle task status (done ↔ pending); sets completedAt timestamp
- Demo data: 4 halls, 5 events (wedding×2, corporate, birthday, gala), 8 services, 9 tasks (auto-seed on first request)

### Events UI (`/maison-hd/events`)
3-tab management page (Майбутні / Всі заходи / Зали):
- **Stats row**: 4 cards — майбутніх, підтверджено, виручка (проведені), очікується виручка
- **Filters**: status dropdown + type dropdown (per events tabs)
- **Event list cards**: type icon, name, type badge (colored per type), status badge, date (with countdown "14 дн." in orange if <30 days), time range, guestCount, hall name, client name, total price, deposit badge
- **Spaces grid**: colored icon, name, description, capacity range, area sqm, price/hour+day, amenities badges
- **Event detail view** (full-screen replace):
  - Back button, name header with type+status badges, date/time subtitle
  - Left column: Client card (name/phone/email), Details card (guests/hall/area/notes), Financials card (venue/services/total with border separator, deposit paid toggle button)
  - Status change row: pill buttons for all 6 statuses
  - Right column: Tasks card with progress bar (doneTasks/total %) — click circle to toggle done/pending; Services card with category icon, name, quantity×price=total, vendor name, confirm toggle button; "+ Додати" button
- **3 Create Dialogs**: NewEvent (name/client/phone/email/type/hall/date/time/guests/venuePrice/notes), NewEventService (category/name/qty/unitPrice/vendor), NewSpace (name/description/capacityMin-Max/areaSqm/pricePerHour-Day/amenities/color)
- Sidebar nav: "Events & Banquet" (PartyPopper icon), all roles

## Stage 41 — SPA & Wellness Module

### New DB Tables (lib/db/src/schema/spa.ts)
- `spa_services` — catalog: name, category (8 types), duration, price, maxGuests, requiresSpecialist, tags, isActive, sortOrder
- `spa_resources` — cabinets/equipment: name, resourceType (room/jacuzzi/sauna), capacity, isActive
- `spa_specialists` — therapists: firstName, lastName, phone, bio, specializations[], workDays[] (0-6), workStart/workEnd, slotMinutes, color (for calendar)
- `spa_appointments` — bookings: serviceId FK, specialistId FK, resourceId FK, guestId FK, bookingId FK, guestName/phone, appointmentDate (DATE), startTime/endTime (HH:MM), durationMinutes, price, paidAmount, status (6 values), isHotelGuest, isDayPass, membershipId, notes, staffNotes
- `spa_memberships` — subscriptions: guestName/phone, membershipType (sessions/monthly/annual/day_pass_bundle), sessionsTotal/Used, pricePaid, startsAt, expiresAt, status (active/paused/expired/cancelled), services[]
- `spa_day_passes` — day access: guestName/phone, guestCount, passDate, price, includes[], bookingId, isActive
- 4 Enums: spa_appointment_status, spa_membership_status, spa_membership_type, spa_service_category

### SPA API Routes (`/api/spa/*`) — requireAuth
- `GET /api/spa/stats` — today's summary: total/confirmed/pending/completed appts, revenue, dayPasses; memberships: active/total
- `GET /api/spa/services` — services list ordered by sortOrder
- `POST /api/spa/services` — create service
- `PATCH /api/spa/services/:id` — update service
- `GET /api/spa/services/:id/slots?date=&specialistId=` — available time slots for service on date (checks existing appointments for conflicts)
- `GET /api/spa/specialists` — therapists list
- `POST /api/spa/specialists` — create therapist
- `PATCH /api/spa/specialists/:id` — update therapist
- `GET /api/spa/resources` — rooms/equipment list
- `GET /api/spa/appointments?date=&status=&from=&to=` — appointments list with JOINs (serviceName, specialistName, resourceName, specialistColor)
- `POST /api/spa/appointments` — book (auto-calculates endTime)
- `PATCH /api/spa/appointments/:id` — update status/staffNotes/paidAmount
- `GET /api/spa/memberships?status=` — memberships list
- `POST /api/spa/memberships` — create membership
- `POST /api/spa/memberships/:id/use` — use one session (auto-expires when sessionsTotal reached)
- `PATCH /api/spa/memberships/:id` — update membership
- `GET /api/spa/day-passes?date=` — day passes list for date
- `POST /api/spa/day-passes` — issue day pass
- Demo data: 8 services, 3 specialists, 6 resources, 6 appointments (today+tomorrow), 3 memberships, 2 day passes (auto-seed on first request)

### SPA UI (`/maison-hd/spa`)
6-tab management page (Розклад / Записи / Послуги / Спеціалісти / Абонементи / Day Pass):
- **Stats row**: 4 cards — сьогодні записів, завершено, виручка, активні абонементи
- **Розклад**: date navigation (← date →), list of appointments for selected day; each card: color stripe (specialist color), time, service, guest, phone, resource, price, status badge
- **Записи**: search + status filter; all appointments across all dates; detail dialog with status change actions
- **Послуги**: grid of service cards — icon (by category), name, category badge, duration, price, tags, maxGuests
- **Спеціалісти**: grid of specialist cards — colored avatar initials, name, phone, bio, specializations badges, working days row (Нд/Пн/Вт..), work hours
- **Абонементи**: list with progress bar (sessionsUsed/sessionsTotal), status badge, "Списати сеанс" button
- **Day Pass**: date-filtered list with Ticket icon, guestName, guestCount, includes badges, price
- **5 Create Dialogs**: NewAppointment (service→auto-fills price/duration, specialist, resource, guest, date/time, price, isHotelGuest), NewMembership, NewDayPass (includes as comma-separated), NewService, NewSpecialist (workDays toggles + color picker)
- Sidebar nav: "SPA & Wellness" (Waves icon), all roles

## Stage 40 — Unified Inbox

### New DB Tables (lib/db/src/schema/inbox.ts)
- `conversations` — one per guest dialogue: channel, guestName, phone, email, status, unreadCount, bookingId (FK), lastMessageAt, aiSummary, tags
- `messages` — all messages: direction (inbound/outbound), messageType, content, senderName, isAiGenerated, isRead
- `channel_configs` — per-org channel settings: isEnabled, webhookUrl, config jsonb
- Enums: `inbox_channel` (telegram/instagram/website/email/phone/whatsapp/viber), `conversation_status` (open/pending/resolved/spam), `message_direction`, `message_type`

### Inbox API Routes (`/api/inbox/*`) — requireAuth
- `GET /api/inbox/stats` — totals: open, pending, resolved, totalUnread, byChannel map
- `GET /api/inbox/conversations` — list with filters: status, channel, search; returns conversations[] + totalUnread
- `GET /api/inbox/conversations/:id` — conversation + messages + linked booking summary; marks inbound as read
- `POST /api/inbox/conversations` — create new conversation manually
- `PATCH /api/inbox/conversations/:id` — update status/bookingId/tags/assignedToId
- `POST /api/inbox/conversations/:id/reply` — send outbound message, updates lastMessagePreview
- `POST /api/inbox/conversations/:id/ai-suggest` — rule-based AI reply suggestion (contextual: SPA, rental, wedding, corporate, availability, pricing)
- `POST /api/inbox/conversations/:id/link-booking/:bookingId` — link booking + system message
- `GET /api/inbox/channels` — channel configs (enabled state, webhookUrl)
- Demo data: auto-seeds 6 realistic Ukrainian conversations on first load (Telegram, Instagram, Website, Viber, Email)

### Inbox UI (`/maison-hd/inbox`)
- **Two-panel layout**: conversation sidebar (left) + chat area (right)
- **Left sidebar**: stats cards (open/pending/resolved), search bar, status filter tabs (Всі/Відкриті/Очікують/Вирішені), channel pill filters with counts + icons
- **Conversation list**: avatar with channel icon, guest name, subject, last message preview, timestamp (relative), unread badge, status badge
- **Chat header**: channel avatar, guest name+phone, status badge, subject, "Вирішено" / "Відкрити" button, link-booking panel
- **Linked booking bar**: shows booking ID, unit name, dates, payment status when linked
- **Messages**: bubbles (inbound left / outbound right), system messages centered, AI-generated badge, timestamps, read indicators
- **AI suggestion panel** (indigo): shows suggestion above composer with "Використати" / dismiss buttons
- **Reply composer**: Textarea + AI button (indigo) + Send button (blue), Shift+Enter for newline, status change pills
- **Mobile**: single-column with back button, responsive hide/show panels
- Sidebar nav: "Inbox" (MessageSquare icon), all roles

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

## Stage 58 — Maintenance & Facilities Management

### DB Tables
- `maintenance_requests` — work orders (10+ requests seeded): title, description, category (15 enums), priority (4 levels), status (6 states), costs (estimated/actual/parts/labor), vendor, duration, guest rating, audit trail
- `maintenance_schedules` — preventive maintenance schedules (6 seeded): frequency (7 options), checklist JSONB, last/next performed dates, advance notice
- `maintenance_logs` — activity log per request (status changes, comments, creation)

### API Routes (`/api/maintenance/*`) — requireAuth
- `GET /stats` — total, open, in_progress, critical_open, escalated, overdue, upcomingScheduled, avg_resolution_min, byCategory
- `GET /` — list with filters: status, priority, category, propertyId, search; joined with property/unit/user names
- `GET /:id` — single request + full activity log
- `POST /` — create request → auto-creates activity log entry
- `PATCH /:id` — update request fields + auto-log status changes; auto-sets started_at / resolved_at
- `DELETE /:id` — soft or hard delete
- `POST /:id/logs` — add comment to activity log
- `GET /schedules/list` — all schedules with is_overdue / due_soon flags
- `POST /schedules` — create new preventive maintenance schedule
- `PATCH /schedules/:id` — update schedule (title, frequency, checklist, dates)
- `POST /schedules/:id/perform` — mark performed → auto-calculates next_due_at + creates resolved request
- `DELETE /schedules/:id` — delete schedule
- `GET /analytics/costs` — monthly cost chart, by-category breakdown, by-priority with avg resolution hours

### Frontend (`/maison-hd/maintenance`)
- 8-card KPI strip: total, open, in_progress, critical, escalated, overdue, upcoming scheduled, avg time
- **Tab 1 — Заявки**: filterable list (status tabs + priority/category dropdowns + search), color-coded left border by priority, click-to-detail; "Нова заявка" modal
- **Tab 2 — Профілактика**: card grid of schedules with due_soon / overdue badges; "Виконано" button → auto-advances next_due_at; "Новий розклад" modal
- **Tab 3 — Аналітика**: monthly cost bar chart, category breakdown bars, priority breakdown cards, financial summary
- **Tab 4 — Деталі заявки**: full detail with info grid, status change buttons, actual cost/time inputs, resolution notes, activity log with comment input, financial summary panel

## Stage 60 — Rentals & Activities Module (Equipment Rental + Activity Management)

### DB Tables
- `equipment_categories` — 12 categories (Велосипеди, SUP-борди, Катамарани, Самокати, Риболовля, Теніс, Пінг-понг, Бадмінтон, Настільні ігри, Художній, Спортивний, Дитячий); fields: rental_unit (hour/day/half_day), deposit_required, deposit_amount
- `equipment_items` — 39 items; condition ENUM (excellent/good/fair/poor/under_repair/retired); price_per_hour/half_day/day; is_available; serial_number
- `equipment_rentals` — uses existing rental_status ENUM (added returned/overdue/cancelled values); start_time, end_time, actual_return_time, duration_hours, deposit_taken, deposit_returned, damage_notes
- `activity_types` — 8 types; category (water/sport/creative/kids/wellness/tour); difficulty ENUM; instructor_required, equipment_included, location, tags JSONB
- `activity_sessions` — scheduled occurrences; session_date, start_time, end_time, instructor_name, current_participants, status (scheduled/in_progress/completed/cancelled)
- `activity_bookings` — uses booking_status ENUM; participant_count, price_charged, special_requirements

Seed: 12 eq. categories, 39 eq. items, 8 activity types, 12 sessions (today + upcoming), 8 rentals, 8 activity bookings

### API Routes (`/api/activities/*`) — requireAuth
- `GET /activities/stats` — KPI: total_items, available, active_rentals, today_sessions, today_participants, sessions_in_progress, today_total_revenue
- `GET /activities/equipment/categories` — with total_items/available_items counts via JOIN
- `POST /activities/equipment/categories`
- `GET /activities/equipment/items?category_id=&available=&condition=&search=` — with active_rental_id/rented_by/rented_until JOIN
- `POST /activities/equipment/items`
- `PATCH /activities/equipment/items/:id` — update condition/availability/pricing
- `GET /activities/equipment/rentals?active=true|status=|date=` — with is_overdue calculation
- `POST /activities/equipment/rentals` — validates availability, marks item unavailable
- `PATCH /activities/equipment/rentals/:id/return` — returns item, marks available, records damage
- `GET /activities/types?category=&search=`
- `POST /activities/types`
- `PATCH /activities/types/:id`
- `GET /activities/sessions?date_from=&date_to=&status=&activity_type_id=` — with spots_left, booking_count
- `GET /activities/sessions/:id` — with bookings[]
- `POST /activities/sessions` — auto-calculates end_time from duration_min
- `PATCH /activities/sessions/:id` — update status/instructor/participants
- `POST /activities/sessions/:id/book` — validates spots, updates current_participants
- `PATCH /activities/bookings/:id/cancel` — restores spots
- `GET /activities/analytics?period=7|14|30` — rentalByCategory, activityByType, dailyRevenue chart data, topItems

### Frontend (`/maison-hd/activities`)
- 8-KPI strip: items, available, active rentals, needs attention, today sessions, participants, in progress, today revenue
- **Tab 1 — Оренда інвентарю**: active rentals bar (time-left countdown, overdue in red); category tabs filter; availability filter (Весь/Вільний/В оренді); item cards with condition badge, pricing, availability dot; "Видати в оренду" → modal (guest name/phone, duration slider 1-8h, auto-price calc, deposit notice); "Повернути" → return modal (damage notes, damage charge, deposit confirmation)
- **Tab 2 — Активності**: category filter tabs (water/sport/creative/kids/wellness/tour); type cards with sessions timeline; "Записати" → booking modal (guest info, participant counter, price calculation); "+" → add session modal; Start/End session buttons
- **Tab 3 — Розклад**: date range picker; sessions grouped by day with expand-on-click to see bookings; color-coded session status; spots availability indicator
- **Tab 4 — Аналітика**: period selector (7/14/30 days); stacked bar chart (rental + activity revenue); horizontal progress bars by category; top rented items grid

Navigation: "Оренди та Активності" with Bike icon added to sidebar (all roles)

## Running the App

The API server and HMS frontend run automatically via Replit workflows.

- API: `pnpm --filter @workspace/api-server run dev`
- Frontend HMS: `pnpm --filter @workspace/hms run dev`
- Frontend Maison HD: `pnpm --filter @workspace/maison-hd run dev`
- Seed DB: `pnpm --filter @workspace/scripts run seed`
- Push schema: `pnpm --filter @workspace/db run push`
- Codegen: `pnpm --filter @workspace/api-spec run codegen`
