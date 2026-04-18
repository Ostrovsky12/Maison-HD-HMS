# Maison HD — Hospitality OS

## Overview
Maison HD is a premium global Hospitality Operating System (Hospitality OS), designed as a multi-tenant SaaS PMS platform for hotels, resorts, and property complexes. It provides a comprehensive solution for managing hospitality operations, including reservations, guest management, F&B, staff scheduling, and AI-powered analytics. The project aims to streamline hotel operations, enhance guest experience through a dedicated PWA guest portal, and offer powerful tools for property owners and staff. Key capabilities include a reservation grid, integrated payment solutions, AI-driven rate intelligence, a unified inbox for multi-channel communication, and a robust F&B management system with inventory and analytics. The system also supports sustainability and ESG tracking, digital keys, mobile check-in, and an upsell engine.

## User Preferences
I prefer iterative development, with a focus on delivering functional, tested components. I appreciate clear, concise explanations and prefer that major changes are discussed before implementation. Please ensure all database changes use `ALTER TABLE ADD COLUMN IF NOT EXISTS` raw SQL statements instead of `db:push`. For OpenAI integrations, use `import { openai } from "@workspace/integrations-openai-ai-server"`, specify `gpt-5.2` as the model, and avoid `response_format` or `temperature`, utilizing `max_completion_tokens` instead. Always read the file before writing to prevent data loss or conflicts.

## System Architecture
The system is built as a pnpm monorepo using TypeScript, with a React and Vite frontend and an Express 5 API backend. PostgreSQL with Drizzle ORM is used for database management, and authentication relies on JWT. UI components are styled with Tailwind CSS and Shadcn, and routing is handled by wouter. The build process uses esbuild for the API server and Vite for frontends. AI functionalities are powered by OpenAI's gpt-5.2 model.

**Core Architectural Decisions & Features:**
- **Multi-tenancy:** `org_id` isolation at the database level with role-based access control.
- **Reservation Management:** Visual reservation grid, booking invoice management, and CSV booking import.
- **Financial Operations:** Night Audit process, integrated LiqPay payments, and subscription management.
- **F&B Management:**
    - Comprehensive system including inventory, recipe cards (Тех. Карти), POS (Каса) with mixed payments, split bills, and tips.
    - AI-powered features like invoice scanning, voice input for receipts and write-offs, and an AI Waiter (QR menu) with guest memory and image support for menu items.
    - Advanced F&B analytics, costing reports, and auto stock deduction based on sales.
    - Support for multiple legal entities, excise tax calculation for alcohol, and enhanced write-off reasons.
    - Unit conversion for inventory receipts.
- **Guest Experience:** Dedicated PWA Guest Portal for online check-in, service ordering, messaging, loyalty, and digital key.
- **Communication:** Unified Inbox integrating various channels (Telegram, Instagram, website chat, email, phone, WhatsApp) with lead management and AI draft suggestions.
- **Legal & Compliance:** Public legal pages (offer, privacy, DPA, terms, data policy) in Ukrainian.
- **Admin & Staff Tools:** Super Admin panel for system oversight, tenant management, billing, and feature flags. Staff Console for mobile-optimized operational dashboards.
- **Automation:** Event and time-triggered actions for tasks and communications.
- **POS Settings:** Management of printers, discounts, AI Waiter configuration, and excise rates.
- **CRM:** F&B CRM for customer management and lookup within POS.
- **Technical Implementations:**
    - `NUMERIC(8,2)` for F&B item quantities to support half portions.
    - `JSONB` fields for `payment_details` in orders and `order_history` in customers.
    - `TEXT` field for `invoice_image` in stock receipts (base64 storage).
    - `VARCHAR` for `payment_type` in `fb_stock_receipts` with `unpaid`/`cash`/`bank` values.
    - `TEXT` for `notes_detail` in `fb_stock_writeoffs` for detailed comments.
    - `NUMERIC` for `conversion_factor` in `fb_stock_receipt_items` for unit conversions.
    - `station` and `legal_entity_id` columns for `fb_items`.
    - Role-based access control for features like Super Admin panel and POS cashier functions.

## Security & Compliance
- **AES-256-GCM encryption at rest** (`artifacts/api-server/src/lib/encrypt.ts`): Sensitive fields auto-encrypt on write with `enc:<iv>.<tag>.<data>` prefix. Covers: `liqpay_private_key`, `fondy_secret_key`, `checkbox_password` (legal_entities); `botToken`, email `pass`, SMS `apiKey` (tenant_settings via notify.ts); `passport_number` (guests).
- **GDPR anonymize** (`POST /api/guests/:guestId/anonymize`): Wipes PII (name → "Видалений Гість", clears email/phone/passport/birthDate/address) with audit log.
- **Audit logs table** (`audit_logs`): Indexed on (org_id, created_at) and (resource_type, resource_id). Actions: view_sensitive, update_sensitive, delete, anonymize, export, login, login_failed, view_keys, backup_created, backup_failed.
- **Security API** (`GET /api/security/audit-logs`, `POST /api/security/backup`, `GET /api/security/backup/list`): Admin-only audit log viewer; super_admin manual backup trigger.
- **Daily pg_dump backups**: Runs at 02:00 UTC, gzips dump, uploads to object storage at `backups/backup-{date}.sql.gz`, keeps last 30.
- **ENCRYPTION_KEY**: 64-char hex env secret. `encrypt(null)` returns null; `decrypt` handles both `enc:` format and legacy plaintext (backwards-compatible).

## External Dependencies
- **LiqPay:** Payment gateway for direct transactions.
- **OpenAI gpt-5.2:** AI models for various intelligent features.
- **Telegram Bot API:** Messaging integration for Unified Inbox.
- **Instagram Graph API:** Messaging integration for Unified Inbox.
- **Servio:** Data migration and import.
- **OTAs (Booking.com, Airbnb, Expedia, Agoda, Ostrovok):** Channel manager integrations.
- **Fondy:** Subscription webhook processing.
- **BAS/1C/Checkbox:** Accounting data export and PRRO fiscalization.