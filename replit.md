# Workspace

## Overview

This project is a comprehensive Hotel Management System (HMS) designed as a multi-tenant SaaS PMS platform named "Dogoda Resort." It aims to provide an all-in-one solution for managing hotel and restaurant complexes. The platform is built as a pnpm workspace monorepo utilizing TypeScript.

Key capabilities include:
- Multi-tenant architecture with robust authentication and role-based access control.
- Management of properties, units, and reservations through an intuitive chessboard interface.
- Financial operations such as quote/invoice generation and integration with payment layers like LiqPay.
- **Booking Invoice (Рахунок-фактура)** — full invoice lifecycle from booking: generate invoice with buyer details (ЄДРПОУ, ПДВ номер, адреса), line items, seller snapshot from legal entity; save to DB via `POST /api/bookings/:id/invoice`; "Надіслати" modal for channel selection (Telegram/SMS/link); accounting "Сформовані рахунки" tab with date/entity filters, print (opens print window), and delete actions. `buildPrintHtml` exported for re-use. Endpoints: `POST /api/bookings/:id/invoice` (upsert), `GET/PUT/DELETE /api/invoices/:id`, `POST /api/invoices/:id/send`.
- Dedicated dashboards for owners, unified inbox for communications, and guest portals.
- Extensive integration and accounting export capabilities.
- Advanced modules for revenue management, OTA channel management, online booking, AI automation, guest experience management, maintenance, F&B/Restaurant operations (unified with Kitchen Display), events, SPA & wellness, and rentals & activities.
- **CSV Booking Import** (`/migration` → "Імпорт CSV") — drag-and-drop CSV upload for importing bookings from Servio or any source; fuzzy unit name matching (exact → substring → number-only); preview table showing matched/unmatched rooms with available unit names; skips duplicates by `confirmation_no`; endpoints: `GET /api/migration/csv/template`, `POST /api/migration/csv/preview`, `POST /api/migration/csv/import`. Root cause fix: old Servio Wizard was always in demo mode (fake data), new CSV import handles real data.
- **Night Audit** (`/night-audit`) — full night audit lifecycle: pre-audit checklist with live KPI snapshot, run audit button with date picker, last audit summary card, expandable audit history table. API: GET/POST `/api/audit/night`.
- **Package Builder** (`/packages`) — create/edit/delete hotel packages (romantic, family, wellness, etc.) with inclusions, pricing, validity dates, featured toggle. Full CRUD. API: GET/POST/PATCH/DELETE `/api/packages`.
- **QR Ordering** (`/qr-ordering` + `/qr-menu/:orgSlug/:tableId`) — staff QR management panel with printable QR codes per table, live order tracking with status flow. Public mobile-first guest menu page (no auth) for scanning and ordering. Public API: GET `/api/public/menu/:orgSlug`, GET `/api/public/table/:orgSlug/:tableId`, POST `/api/public/menu-order`.
- **Digital Key & Mobile Check-in** (`/digital-keys`) — digital room key management with auto-generated 4-digit PIN + QR payload, valid date range, revoke keys, mobile pre-check-in approval workflow with ID document tracking, special requests, ETA. DB: `digital_keys`, `mobile_checkins`. API: GET/POST `/api/digital-keys/keys`, PATCH `/api/digital-keys/keys/:id`, GET/PATCH `/api/digital-keys/checkins/:id`, GET `/api/digital-keys/stats`.
- **Sustainability & ESG** (`/sustainability`) — ESG score dashboard, per-category KPI cards (energy/water/waste/CO2) with month-over-month trends, goal progress bars with targets, green initiative management (add/edit/delete with impact score 1–5 and lifecycle status), monthly metrics journal with manual data entry. DB: `esg_metrics`, `esg_goals`, `green_initiatives`. API: GET/POST `/api/sustainability/metrics`, GET/PATCH `/api/sustainability/goals`, GET/POST/PATCH/DELETE `/api/sustainability/initiatives`, GET `/api/sustainability/dashboard`.
- **Rate Intelligence** (`/rate-intelligence`) — competitor rate monitoring with 7-day comparison grid (our rates vs competitors), market position indicator (above/below/parity), competitor management (add/edit/delete), manual rate entry log, pricing recommendations. DB: `rate_competitors`, `competitor_rates`, `rate_snapshots`. API: GET/POST/PATCH/DELETE `/api/rate-intel/competitors`, GET/POST `/api/rate-intel/competitor-rates`, GET/POST `/api/rate-intel/our-rates`, GET `/api/rate-intel/dashboard`.
- **Upsell Engine** (`/upsell`) — template-based upsell offer management with type/trigger/price config, one-click send to guest portal, accept/decline workflow for active offers, conversion analytics (total sent/accepted/declined/rate/revenue). DB: `upsell_templates`, `upsell_offers`. API: GET/POST/PATCH/DELETE `/api/upsell/templates`, GET `/api/upsell/offers`, POST `/api/upsell/offers/send`, POST `/api/upsell/offers/:id/respond`, GET `/api/upsell/stats`.
- **Staff Scheduling** (`/staff-schedule`) — weekly calendar grid of staff shifts, per-staff card view, department filter, create/edit/delete shifts (staff, date, time, department, break, status). DB: `staff_shifts`. API: GET `/api/schedule/staff`, GET/POST `/api/schedule/shifts`, PATCH/DELETE `/api/schedule/shifts/:id`, GET `/api/schedule/stats`.
- **Loyalty Program** (`/loyalty`) — member enrollment, tier system (Bronze/Silver/Gold/Platinum), points earn/redeem rules, manual point adjustment with transaction history, program settings (points per night/UAH, tier thresholds, perks). DB: `loyalty_settings`, `loyalty_members`, `loyalty_member_tx`. API: GET/PATCH `/api/loyalty/settings`, GET/POST `/api/loyalty/members`, GET `/api/loyalty/members/:id/transactions`, POST `/api/loyalty/members/:id/adjust`, GET `/api/loyalty/stats`.
- Unified F&B/Restaurant module (`/fb`) — merged from two parallel systems; kitchen display with auto-refresh, order types: dine_in/room_service/takeaway/bar/breakfast/banquet/corporate.
- Staff Console (`/console`) — mobile-optimized operational dashboard with arrivals/departures/in-house, quick check-in/out, payment collection, alerts, housekeeping summary, and live activity feed.
- The project's vision is to offer a premium, scalable, and intelligent PMS solution for the hospitality industry, supporting complex operational workflows and enhancing guest experiences.

## User Preferences

I prefer detailed explanations and iterative development. Ask before making major changes.

## System Architecture

The project is structured as a pnpm monorepo with distinct `artifacts` for the frontend and backend, and shared `lib` packages.

**Core Technologies:**
- **Monorepo Tool:** pnpm workspaces
- **Node.js:** v24
- **TypeScript:** v5.9
- **Frontend:** React + Vite (for `hms` and `maison-hd` dashboards)
- **API Framework:** Express 5
- **Database:** PostgreSQL with Drizzle ORM
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **Authentication:** JWT (jsonwebtoken + bcryptjs)
- **API Codegen:** Orval (from OpenAPI spec)
- **Build Tool:** esbuild (CJS bundle)
- **Routing:** wouter
- **UI/UX:** Tailwind CSS + Shadcn components, focusing on a clean, modern aesthetic with a warm amber/stone palette for the guest portal. The UI features responsive design, dark/light mode toggles, and intuitive layouts with various filtering and search capabilities.

**Architectural Patterns & Design Decisions:**
- **Multi-tenancy:** Implemented with `org_id` isolation at the database level and role-based routing.
- **Modularity:** Database schema is organized into 11 main domains (PLATFORM, IAM, PROPERTY, GUESTS, RESERVATIONS, RATES, FINANCIALS, HOSPITALITY, COMMUNICATIONS, OPERATIONS, INTEGRATIONS, CONTENT & GUEST JOURNEY), each with dedicated tables and clear responsibilities.
- **API Design:** RESTful API with extensive endpoints for managing all aspects of the HMS. OpenAPI specification is used for consistent API design and client code generation.
- **Asynchronous Processing:** Background jobs for tasks like import batches and AI automation.
- **Real-time Features:** Unified inbox with message handling, real-time F&B order updates, and live command center dashboards.
- **AI Integration:** Utilizes OpenAI (gpt-5.2) for various functionalities like chat replies, sales suggestions, guest profile analysis, admin tips, owner insights, knowledge base search, and task routing. Critical JSON parsing logic is handled robustly.
- **Guest Experience:** Dedicated guest portal (PWA) with a mobile-first design, supporting online check-in, service ordering, loyalty programs, and two-way communication.
- **Domain-Driven Design:** The project's structure and feature implementation are heavily influenced by specific hospitality domains (e.g., F&B, SPA, Events, Rentals).

**Key Feature Specifications:**
- **Reservation Grid (Chessboard):** Visual calendar for booking management with collapsible groups and drag-to-select functionality.
- **Payment Layer:** LiqPay integration fully wired — `generateLiqPayForm/verifyLiqPayCallback/parseLiqPayData` in `lib/liqpay.ts`. Public endpoint `POST /api/public/liqpay/:bookingId` generates payment form; `POST /api/public/liqpay/callback` handles LiqPay server callbacks and updates booking payment status. Admin endpoint `POST /api/bookings/:bookingId/liqpay` also available. Requires `LIQPAY_PUBLIC_KEY` + `LIQPAY_PRIVATE_KEY` env vars — gracefully returns 503 without them.
- **Automation Engine (Real):** Full real execution in `artifacts/api-server/src/lib/automation-runner.ts`. Supports `create_hk_task`, `create_notification`, `send_inbox_message`, `upsell_spa/fb/upgrade`, `send_email`, `webhook_call`. Time-based triggers: `checkin_today`, `checkout_today`, `checkout_tomorrow`, `payment_overdue`. Event triggers: `booking_created`, `booking_confirmed` (fire via `fireBookingEvent()`). Endpoint `POST /api/automation/run-scheduled` runs all active time-based rules. Endpoint `POST /api/automation/rules/:id/run` runs a single rule (optionally against `{bookingId}`). UI has "Запустити розклад" button.
- **Data Import:** Comprehensive migration layer for importing data from external systems like Servio, including data preview, conflict resolution, and entity mapping.
- **Revenue Management:** Dynamic pricing rules, rate plans, and date-level overrides for optimizing revenue.
- **OTA Channel Manager:** Configuration and synchronization with major OTAs (Booking.com, Airbnb, Expedia) including webhook processing.
- **Online Booking Engine:** Public-facing booking flow with real-time availability checks and direct booking creation.
- **AI Automation:** Rule-based system for triggering actions based on events (e.g., sending messages, creating tasks, upsell offers).
- **Maintenance & Facilities:** Management of work orders, preventive maintenance schedules, and activity logging.
- **Rentals & Activities:** Inventory management for rental equipment and scheduling/booking of activities.
- **Owner/HQ Command Center:** Real-time dashboards providing aggregated KPIs, operational oversight, financial summaries, and forecasts across properties and departments.

## Development Stage Roadmap

- ✅ Stage 1 — Bookings filters + Today bar (arrivals/departures/staying quick stats)
- ✅ Stage 2 — Guests CRUD dialog (create/edit with all fields, loyalty filter)
- ✅ Stage 3 — Service orders management (admin confirm/complete/cancel)
- ✅ Stage 4 — Public booking widget (`/book?slug=dogoda`) — end-to-end working
- ✅ Auto-housekeeping task on checkout (7-item checklist, high priority)
- ⏳ Stage 5 — LiqPay online payments
- ⏳ Stage 6 — Automation rules engine

## Test Tenants

### Комплекс ДОГОДА (org_id=41, slug=dogoda)
- **Owner login:** admin@dogoda.com.ua / Dogoda2026!
- **Reception login:** reception@dogoda.com.ua / reception123
- **Properties:** id 55, 57, 58 — всі "Котеджний комплекс ДОГОДА", с. Шешори, Косівський р-н
- **Units:** 27+ юнітів (Котедж 1-11 в декількох корпусах), unit IDs від 279
- **Unit types:** STD (2800грн), DLX (4200грн), EUR (7200грн)
- **Addons:** id 43–53 (11 послуг, e.g. SPA, трансфер, сніданок)
- **Guest portal code:** 32C94BEF72 (тест, 11 сервісів)
- **Tourist tax rate:** 43.37 UAH
- **Public booking widget:** `/book?slug=dogoda`

### Maison HD demo org (org_id=35, slug=maisonhd)
- **Owner login:** owner@maisonhd.com / Owner2026!
- **Property:** Готель "Карпати" (id=53), 6 будиночків (id 273-278)

### Super Admin
- admin@hms.app / admin123 (role: super_admin)

## External Dependencies

The project integrates with several external services and APIs:

-   **LiqPay:** Payment gateway for processing online payments.
-   **OpenAI:** AI services (GPT-5.2) for various intelligent features like content generation, analysis, and task routing, accessed via Replit AI Integrations proxy.
-   **Servio:** External HMS for data migration and integration.
-   **OTAs (Booking.com, Airbnb, Expedia, Agoda, Ostrovok):** Channel managers for managing inventory and bookings across various online travel agencies.
-   **Fondy:** Another payment webhook for subscription processing.
-   **Communication Channels:** Support for integrations with platforms like WhatsApp, Email, SMS, Viber for guest communication.
-   **Accounting Systems:** Abstraction for exporting data to systems like BAS, Checkbox, 1C.
-   **POS Systems:** Synchronization logging with Point of Sale systems.