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

Stage 5 DB tables: `ota_channels`, `webhook_endpoints`, `kpi_history`, `forecasts`

Stage 5 API routes:
- `GET/POST /api/integrations/ota` — OTA channel CRUD + sync
- `GET/POST /api/integrations/webhooks` — Webhook endpoint CRUD
- `GET/POST /api/analytics/kpi` + `/kpi/generate` — KPI history
- `GET/POST /api/analytics/forecast` + `/forecast/generate` — Forecasting
- `GET /api/analytics/summary` — Analytics summary

## Running the App

The API server and HMS frontend run automatically via Replit workflows.

- API: `pnpm --filter @workspace/api-server run dev`
- Frontend HMS: `pnpm --filter @workspace/hms run dev`
- Frontend Maison HD: `pnpm --filter @workspace/maison-hd run dev`
- Seed DB: `pnpm --filter @workspace/scripts run seed`
- Push schema: `pnpm --filter @workspace/db run push`
- Codegen: `pnpm --filter @workspace/api-spec run codegen`
