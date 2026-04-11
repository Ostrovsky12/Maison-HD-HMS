# Maison HD — Hospitality OS

## Overview

**Maison HD** is a premium global Hospitality Operating System (Hospitality OS) — multi-tenant SaaS PMS platform for hotels, resorts, and property complexes. Built as a pnpm monorepo in TypeScript with React+Vite frontend and Express 5 backend.

**Primary test tenant:** ДОГОДА Резорт (`org_id=41` dev / `org_id=1` prod, `property_id=55` dev, `slug=dogoda`)

---

## Feature Registry

### Core Platform
- **Multi-tenancy** — `org_id` isolation at DB level, role-based routing (super_admin / owner / manager / reception / staff)
- **Reservation Grid (Chessboard)** — visual calendar with collapsible groups, drag-to-select, quick check-in/out
- **Booking Invoice (Рахунок-фактура)** — full lifecycle: buyer details (ЄДРПОУ, ПДВ), line items, seller snapshot from legal entity. Endpoints: `POST /api/bookings/:id/invoice` (upsert), `GET/PUT/DELETE /api/invoices/:id`, `POST /api/invoices/:id/send`. Accounting tab with date/entity filters, print, delete. `buildPrintHtml` exported for re-use.
- **LiqPay Payments** — `generateLiqPayForm/verifyLiqPayCallback/parseLiqPayData` in `lib/liqpay.ts`. Public `POST /api/public/liqpay/:bookingId` generates form; `POST /api/public/liqpay/callback` handles callbacks. Requires `LIQPAY_PUBLIC_KEY` + `LIQPAY_PRIVATE_KEY`.
- **CSV Booking Import** (`/migration`) — drag-and-drop CSV upload, fuzzy unit name matching, preview with matched/unmatched, skips duplicates by `confirmation_no`. Endpoints: `GET /api/migration/csv/template`, `POST /api/migration/csv/preview`, `POST /api/migration/csv/import`.
- **Night Audit** (`/night-audit`) — pre-audit checklist, KPI snapshot, audit history. API: `GET/POST /api/audit/night`.
- **Package Builder** (`/packages`) — hotel packages (romantic, family, wellness) CRUD. API: `GET/POST/PATCH/DELETE /api/packages`.
- **QR Ordering** (`/qr-ordering` + `/qr-menu/:orgSlug/:tableId`) — QR codes per table, live order tracking. Public API: `GET /api/public/menu/:orgSlug`, `POST /api/public/menu-order`.
- **Digital Key & Mobile Check-in** (`/digital-keys`) — 4-digit PIN + QR key, revoke, pre-check-in approval with ID doc. DB: `digital_keys`, `mobile_checkins`.
- **Sustainability & ESG** (`/sustainability`) — KPI cards (energy/water/waste/CO2), goals, initiatives, monthly metrics journal.
- **Rate Intelligence** (`/rate-intelligence`) — 7-day competitor rate grid, market position, pricing recommendations. **Fixed**: AI suggest-competitors endpoint rewrote prompt + robust JSON parser (multi-step extraction), starRating normalization (0→3 default). AI now returns 6 Carpathian-region competitors for ДОГОДА correctly.
- **Upsell Engine** (`/upsell`) — template-based offers with type/trigger/price, one-click send to guest portal, accept/decline workflow, conversion analytics.
- **Staff Scheduling** (`/staff-schedule`) — weekly calendar grid, per-staff cards, department filter, shift CRUD.
- **Loyalty Program** (`/loyalty`) — Bronze/Silver/Gold/Platinum tiers, points earn/redeem, manual adjustment, transaction history.
- **Unified F&B** (`/fb`) — kitchen display with auto-refresh, order types: dine_in/room_service/takeaway/bar/breakfast/banquet/corporate. Menu item form includes VAT rate selector (0%/7%/20%), alcohol toggle with ABV%/УКТЗЕД/excise fields + AI classification button. "Склад" button in header links to warehouse.
- **F&B Warehouse/Склад** (`/fb-warehouse`) — 7-tab inventory module: Залишки (stock levels), Інгредієнти (CRUD with unit/cost), Постачальники (suppliers CRUD), Накладні (stock receipts with AI scanner: photo/text → auto-parse → confirm → stock update), Тех.Карти (recipe cards with auto cost_per_portion), Списання (write-offs with confirm → stock deduction), **Аналітика** (F&B Analytics). AI invoice scanner: `POST /api/fb/warehouse/receipts/ai-scan` (GPT-5.2 vision). AI alcohol classifier: `POST /api/fb/warehouse/ai/classify-alcohol` → uktzed_code, excise_rate_uah. DB tables: fb_suppliers, fb_ingredients, fb_recipe_cards, fb_recipe_card_items, fb_stock_receipts, fb_stock_receipt_items, fb_stock_writeoffs, fb_stock_writeoff_items. fb_items extended: vat_rate, is_alcohol, alcohol_volume_pct, excise_code, uktzed_code, cost_price.
- **F&B Analytics** (`/fb-warehouse` → "Аналітика" tab) — endpoint `GET /api/fb/warehouse/analytics?days=N`. 6 data sources: food cost by dish (cost_per_portion vs selling_price from fb_items), stock movement timeline (receipts+writeoffs per day built in JS), waste by reason, top-10 stock by value, top-10 purchased ingredients, KPI summary. Frontend: recharts LineChart (movement), PieChart (waste), BarChart (top stock), food cost table with progress bars (green/yellow/orange/red by %), 4 KPI cards, period selector (7д/30д/3міс/Рік). **SQL note**: use `::date` cast for date comparisons; avoid `generate_series` with parameterized inputs (Drizzle ORM limitation) — build day series in JS instead. `fb_stock_writeoffs` uses `total_amount` (not `total_cost`). `fb_stock_receipt_items` uses `price_per_unit`/`total_price` (not `unit_price`).
- **Staff Console** (`/console`) — mobile-optimized operational dashboard with arrivals/departures/in-house, quick check-in/out, payment collection, alerts.
- **Automation Engine** (`/automation`) — real execution in `automation-runner.ts`. Actions: `create_hk_task`, `create_notification`, `send_inbox_message`, `upsell_*`, `send_email`, `webhook_call`. Time triggers: `checkin_today`, `checkout_today`, `checkout_tomorrow`, `payment_overdue`. Event triggers: `booking_created`, `booking_confirmed` (via `fireBookingEvent()`).
- **Owner/HQ Command Center** — aggregated KPIs, operational oversight, financial summaries, forecasts across properties.

### Guest Portal (PWA) — `/:code`
Public mobile-first guest-facing portal accessible via booking QR code / link.

- **Онлайн чекін** — 4-step wizard (personal info → document → co-guests/car/pets → confirmation), fills staff registration card, awards 50 loyalty points, notifies staff via push.
- **Сервіси** — browse and order addons (SPA, transfer, breakfast, etc.) with time slot picker.
- **Повідомлення** — bidirectional messaging with hotel staff (guest portal messages).
- **Лояльність** — points balance, tier, transaction history, special offers.
- **Відгук** — star ratings (overall/cleanliness/service/location/value), NPS score.
- **Документи** — downloadable HTML→PDF documents (print dialog):
  - `GET /api/guest/:code/documents/:type/download` (type: `confirmation` / `invoice` / `registration` / `receipt`)
  - Button opens in new tab, styled A4 layout with hotel branding, print-to-PDF.
- **Оплата** — shows total debt = booking balance + unpaid service orders. Red banner with total + itemized breakdown. "Сплатити онлайн" button links to `booking.paymentLink` OR `booking.orgPaymentUrl` (org-level fallback). Green "✓ Повністю сплачено" when clear. **"Я сплатив!" flow**: After paying online, guest clicks "✓ Я вже сплатив — повідомити рецепцію" → `POST /api/guest/:code/payment-notify` sends push/Telegram notification to staff + creates amber PAYMENT_CLAIM message in portal thread. Staff sees amber bubble in Inbox → Портал → clicks "✅ Підтвердити оплату X ₴" → `POST /api/guest/payment-confirm/:bookingId` (auth) sets `paidAmount=totalAmount, paymentStatus=paid`, records payment, sends confirmation message to guest. Button state persisted in localStorage. **Fixed**: payment button uses org-level `paymentUrl` fallback; configurable in Settings → Hotel.
- **Адреса** — uses **property physical address** directly (NOT legal entity address). Legal entity address is for B2B invoices only. **Fixed**: removed override that was incorrectly substituting legal entity address for property address.
- **Сповіщення гостя** — background polling every 20s checks for new hotel messages (`hotel_to_guest`). Plays Web Audio chime + toast on new message regardless of active tab. **NEW**: guest-side AudioContext with `resume()` fix.

### Unified Inbox (`/inbox`)
- **Conversations** — Telegram, Instagram, Website chat, Email, Phone, WhatsApp.
- **Leads** — CRM pipeline with stages, estimated value, source tracking.
- **Портал tab** — centralized view of all guest portal message threads:
  - `GET /api/guest/portal-threads` — all bookings with messages: guest name, unit, dates, last msg, unread count.
  - `PATCH /api/guest/portal-threads/:bookingId/read-all` — mark all as read.
  - Thread list with unread badge (emerald). Chat view with send reply via `POST /api/guest/message/:bookingId`.
- **Звукові сповіщення** — Web Audio API chime (no audio files): 2 notes for message, 3 notes for check-in. Bell/BellOff toggle in header, persisted to `localStorage`. **Fixed**: persistent `AudioContext` ref with `ctx.resume()` before playing — resolves browser autoplay policy blocking.
- **Polling 30s** — auto-checks: inbox unread count, portal unread, new check-in submissions. Fires sound + browser Notification API + toast on new events.
- **Browser Notifications** — requests `Notification.permission` on mount; shows popup when tab is in background.
- **Telegram bidirectional** — `POST /api/inbox/webhooks/telegram/:orgId` public webhook. Reply dispatches to Telegram Bot API. Setup: token → `getMe` verify → `setWebhook` auto-register.
- **Instagram bidirectional** — `POST /api/inbox/webhooks/instagram` public webhook, org identified by `page_id`. Reply dispatches to Instagram Graph API.
- **Channel settings** — gear icon modal: step-by-step connect/disconnect UI, webhook URL displayed, tokens masked in GET response.
- **Canned Replies** — quick insert from library.
- **AI Draft** — GPT-powered reply suggestions.
- **Lead management** — create/update leads, stage pipeline, assign staff.

---

## Critical Developer Notes

| Rule | Detail |
|------|--------|
| **DB changes** | ALWAYS `ALTER TABLE ADD COLUMN IF NOT EXISTS` raw SQL — never `db:push` |
| **Auth token** | `localStorage.getItem("hms_token")` |
| **OpenAI import** | `import { openai } from "@workspace/integrations-openai-ai-server"` (NOT `/client`); model `gpt-5.2`; NO `response_format` or `temperature`; use `max_completion_tokens` |
| **API client regen** | After `lib/api-client-react/src/generated/api.ts` changes: `cd lib/api-client-react && npx tsc --build` |
| **SelectItem** | Radix `<Select.Item>` must NEVER have `value=""` |
| **AppLayout** | NAMED export (not default) |
| **Write rule** | ALWAYS read file before writing |
| **Webhook URLs** | Telegram: `/api/inbox/webhooks/telegram/{orgId}`, Instagram: `/api/inbox/webhooks/instagram` |
| **ДОГОДА org_id** | `41` in dev, `1` in production |
| **ДОГОДА property_id** | `55` in dev |

---

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | owner@maisonhd.com | Dimaz12Holovko! |
| ДОГОДА Owner | admin@dogoda.com.ua | Dogoda2026! |
| ДОГОДА Reception | reception@dogoda.com.ua | reception123 |

**Real test booking:** code `32C94BEF72` (Олена Промова, ДОГОДА, Котедж 2 STD, booking #88)

---

## Test Tenants

### ДОГОДА Резорт (dev: org_id=41, slug=dogoda)
- Properties: id 55, 57, 58 — Котеджний комплекс ДОГОДА, с. Шешори, Косівський р-н
- Units: 27+ юнітів, unit IDs від 279
- Unit types: STD (2800₴), DLX (4200₴), EUR (7200₴)
- Addons: id 43–53 (11 послуг: SPA, трансфер, сніданок, etc.)
- Tourist tax: 43.37 UAH
- Public booking widget: `/book?slug=dogoda`
- Legal entity: ТОВ Догода Резортс, address: Україна, 08620, Київська обл., Фастівський р-н, село Дзвінкове, вул.Березова, будинок 4

### Maison HD Demo (org_id=35, slug=maisonhd)
- Owner: owner@maisonhd.com / Owner2026!
- Property: Готель "Карпати" (id=53), 6 будиночків (id 273-278)

---

## System Architecture

- **Monorepo:** pnpm workspaces
- **Node.js:** v24 · **TypeScript:** v5.9
- **Frontend:** React + Vite (`artifacts/maison-hd`, `artifacts/hms`)
- **API:** Express 5 (`artifacts/api-server`) — port from `PORT` env var
- **Database:** PostgreSQL + Drizzle ORM (`lib/db`)
- **Auth:** JWT (jsonwebtoken + bcryptjs)
- **UI:** Tailwind CSS + Shadcn components
- **Routing:** wouter
- **Build:** esbuild (api-server), Vite (frontends)
- **AI:** OpenAI gpt-5.2 via Replit AI Integrations proxy

### DB Schema Domains
PLATFORM · IAM · PROPERTY · GUESTS · RESERVATIONS · RATES · FINANCIALS · HOSPITALITY · COMMUNICATIONS · OPERATIONS · INTEGRATIONS · CONTENT & GUEST JOURNEY

---

## External Integrations

| Service | Purpose |
|---------|---------|
| LiqPay | Online payments |
| OpenAI gpt-5.2 | AI features (chat, analysis, suggestions) |
| Telegram Bot API | Bidirectional messaging |
| Instagram Graph API | Bidirectional messaging |
| Servio | Data migration/import |
| OTAs (Booking.com, Airbnb, Expedia, Agoda, Ostrovok) | Channel manager |
| Fondy | Subscription webhooks |
| BAS/1C/Checkbox | Accounting export |

---

## Roadmap Status

- ✅ Reservation grid + chessboard
- ✅ Guests CRUD + loyalty
- ✅ Service orders management
- ✅ Public booking widget
- ✅ LiqPay payments
- ✅ Automation engine (real execution)
- ✅ Telegram + Instagram bidirectional inbox
- ✅ Guest portal (full PWA): check-in, services, messages, loyalty, review, docs, payment
- ✅ Document download (HTML→PDF via browser print)
- ✅ Guest portal → Unified Inbox (Portal tab)
- ✅ Sound notifications + polling (Web Audio API + Browser Notification API)
- ✅ Service orders debt in guest portal payment tab
- ⏳ Binotel telephony integration
- ⏳ Stripe / additional payment gateway
