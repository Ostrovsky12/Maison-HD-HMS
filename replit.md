# Maison HD — Hospitality OS

## Overview
Maison HD is a premium global Hospitality Operating System (Hospitality OS), designed as a multi-tenant SaaS PMS platform for hotels, resorts, and property complexes. It aims to provide a comprehensive solution for managing all aspects of hospitality operations, from reservations and guest management to F&B, staff scheduling, and advanced AI-powered analytics. The project's vision is to streamline hotel operations, enhance guest experience through a dedicated PWA guest portal, and provide powerful tools for property owners and staff. Key capabilities include a reservation grid, integrated payment solutions, AI-driven rate intelligence, a unified inbox for multi-channel communication, and a robust F&B management system with inventory and analytics.

## User Preferences
I prefer iterative development, with a focus on delivering functional, tested components. I appreciate clear, concise explanations and prefer that major changes are discussed before implementation. Please ensure all database changes use `ALTER TABLE ADD COLUMN IF NOT EXISTS` raw SQL statements instead of `db:push`. For OpenAI integrations, use `import { openai } from "@workspace/integrations-openai-ai-server"`, specify `gpt-5.2` as the model, and avoid `response_format` or `temperature`, utilizing `max_completion_tokens` instead. Always read the file before writing to prevent data loss or conflicts.

## System Architecture
The system is built as a pnpm monorepo using TypeScript. The frontend is developed with React and Vite, while the backend is an Express 5 API. PostgreSQL with Drizzle ORM is used for database management. Authentication relies on JWT (jsonwebtoken + bcryptjs). UI components are styled with Tailwind CSS and Shadcn. Routing is handled by wouter. The build process uses esbuild for the API server and Vite for frontends. AI functionalities are powered by OpenAI's gpt-5.2 model, accessed via Replit AI Integrations proxy.

**Key Features:**
- **Multi-tenancy:** `org_id` isolation at the database level with role-based access control.
- **Reservation Grid:** Visual calendar with advanced functionalities like drag-to-select and quick check-in/out.
- **Booking Invoice:** Full lifecycle management including buyer details, line items, and seller snapshot.
- **LiqPay Payments:** Integrated payment processing with form generation and callback handling.
- **CSV Booking Import:** Allows for bulk import of bookings with fuzzy matching and duplicate skipping.
- **Night Audit:** A structured process for daily reconciliation, including pre-audit checklists and KPI snapshots.
- **Package Builder:** CRUD operations for defining and managing hotel packages.
- **QR Ordering:** System for guests to order via QR codes with live tracking.
- **Digital Key & Mobile Check-in:** Features for digital room access and pre-arrival guest registration.
- **Sustainability & ESG:** Tracking and reporting of environmental and social metrics.
- **Rate Intelligence:** AI-powered competitor rate analysis and pricing recommendations.
- **Upsell Engine:** Template-based offers delivered to guests with analytics.
- **Staff Scheduling:** Calendar-based shift management for hotel staff.
- **Loyalty Program:** Tier-based system for points earning, redemption, and transaction history.
- **Unified F&B:** Comprehensive kitchen display, order management (dine-in, room service, etc.), and inventory (warehouse) with AI-powered invoice scanning and alcohol classification.
- **F&B Analytics:** Provides insights into food costs, stock movement, waste, and top-performing items. Endpoint: `GET /api/fb/warehouse/analytics?days=N`. Charts: LineChart (stock movement), PieChart (waste), BarChart (top stock). SQL note: use `::date` cast for date comparisons; build day series in JS (not generate_series). `fb_stock_writeoffs` uses `total_amount`. `fb_stock_receipt_items` uses `price_per_unit`/`total_price`.
- **F&B Costing Report** (`/fb-costing`) — cost analysis: per-item selling price vs cost_price, food cost %, gross margin %, ABC analysis (A=top 70% revenue, B=70-90%, C=bottom 10%), period selector (7/14/30/90d). Three tabs: items table (sortable, filter by high FC%/no cost, color-coded badges), categories table, charts (FC% bar by category + revenue pie + ABC legend). API: `GET /api/fb/warehouse/costing-report?days=N`.
- **F&B POS Каса** (`/fb-pos`) — full point-of-sale terminal: cashbox session management (open/close shift with opening balance, cash tracking, discrepancy report), color-coded tables grid (free/occupied/reserved), menu panel with categories + search, order panel (add items, qty controls, guest name/count, order type), payment dialog (cash with change calculation, card, LiqPay), receipt number generation. API: `GET/POST /api/fb/cashbox/session`, `PATCH /api/fb/cashbox/session/:id/close`, `POST /api/fb/orders/:id/pay`, `GET /api/fb/cashbox/report`. DB: `fb_orders` extended with `payment_method`, `discount_amount`, `receipt_number` columns. Module key: `fb_pos`.
- **Subscription Settings** (`/subscription`) — tenant-facing plan management: current plan display, plan comparison (Free/Starter/Pro/Enterprise), upgrade/downgrade, enabled modules list, billing invoices. API: `GET /api/subscriptions/`, `POST /api/subscriptions/create-invoice`, `GET /api/subscriptions/invoices`, `POST /api/subscriptions/cancel`. Sidebar role-restricted to owner/super_admin.
- **Super Admin панель** (`/admin`) — 7 tabs: Огляд (MRR, tenants, users, bookings), Тенанти (list/search, detail modal with module toggles + impersonation + plan edit + invoice creation), System Health, Billing (real `subscription_invoices` table), Feature Flags (in-memory), Support (real `support_tickets` table: GET/POST/PATCH), SaaS Config. Sidebar: dedicated amber "Адміністрація" section visible only to `super_admin`. Module gating: sidebar reads `enabled_modules` from org (jsonb), hides items where moduleKey not in allowed list; super_admin bypasses all gates. New modules in MODULE_LIST: `fb_warehouse`, `fb_analytics`, `fb_pos`.
- **Staff Console:** Mobile-optimized operational dashboard for front-line staff.
- **Automation Engine:** Event and time-triggered actions for tasks, notifications, and guest communications.
- **Owner/HQ Command Center:** Aggregated KPIs and financial oversight for property owners.
- **Guest Portal (PWA):** Mobile-first guest-facing portal for online check-in, service ordering, messaging, loyalty, feedback, document access, and payment. Features a "Я сплатив!" flow for guest payment notifications.
- **Unified Inbox:** Centralized communication hub integrating Telegram, Instagram, website chat, email, phone, and WhatsApp, with lead management, canned replies, and AI draft suggestions. Includes a dedicated "Портал" tab for guest portal message threads and sound/browser notifications for new events.

## External Dependencies
- **LiqPay:** Online payment gateway.
- **OpenAI gpt-5.2:** Provides AI capabilities for various features like rate intelligence, F&B classification, and AI draft for inbox.
- **Telegram Bot API:** Used for bidirectional messaging within the Unified Inbox.
- **Instagram Graph API:** Used for bidirectional messaging within the Unified Inbox.
- **Servio:** Utilized for data migration and import processes.
- **OTAs (Booking.com, Airbnb, Expedia, Agoda, Ostrovok):** Integrated as a channel manager for property listings and reservations.
- **Fondy:** Handles subscription webhooks.
- **BAS/1C/Checkbox:** Used for accounting data export.