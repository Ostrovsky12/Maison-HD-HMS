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

## Running the App

The API server and HMS frontend run automatically via Replit workflows.

- API: `pnpm --filter @workspace/api-server run dev`
- Frontend HMS: `pnpm --filter @workspace/hms run dev`
- Frontend Maison HD: `pnpm --filter @workspace/maison-hd run dev`
- Seed DB: `pnpm --filter @workspace/scripts run seed`
- Push schema: `pnpm --filter @workspace/db run push`
- Codegen: `pnpm --filter @workspace/api-spec run codegen`
