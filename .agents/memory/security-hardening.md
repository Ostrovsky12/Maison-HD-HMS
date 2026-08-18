---
name: Security hardening session
description: What was fixed across API and frontend during the security audit implementation pass
---

# Security Hardening — Completed Fixes

**Why:** Audit document identified multiple critical vulnerabilities. All items below were resolved.

## Backend — API Server

### Auth
- `auth.ts`: Rate limiter on `POST /login` (10 req / 15 min / IP via express-rate-limit)
- `app.ts`: `helmet()` added as global middleware with `frameguard: sameorigin`, CSP disabled for now

### Public booking
- `public-booking.ts`: slug required on `GET /properties` (no more full-tenant enumeration)
- `public-booking.ts`: `bookingCreateLimiter` on `POST /bookings` (10/15min/IP)
- `public-booking.ts`: `aiChatLimiter` on `POST /ai-waiter/chat` (20/min/IP)
- `public-booking.ts`: `guestAccessCode` validation on `POST /liqpay/:bookingId` (403 without valid code)

### Booking state machine
- `lib/bookingStateMachine.ts`: BOOKING_TRANSITIONS map, `validateTransition`, `canCancel`, `isTerminalStatus`
- `routes/bookings.ts`: all status changes, checkin, checkout, cancel, delete go through state machine
- `POST /bookings`: atomic availability check (BEGIN/COMMIT + SELECT FOR UPDATE on unit)
- `POST /group`: full transaction with per-unit lock, org-ownership check, conflict detection

### Tenant isolation
- `payments.ts`: fully rewritten — org scope via bookings→units→properties join
- `housekeeping.ts`: fully rewritten — all endpoints org-scoped
- `finance.ts`: org scope added to POST /payments, refund, invoice generation
- `accounting.ts` PATCH /documents: status enum check, paidAmount ≥ 0, paid/signed revert guard
- `accounting.ts` PATCH /legal-entities: replaced SQL injection (arbitrary body keys + sql.raw) with explicit allowlist + parameterized query
- `accounting.ts` PATCH /tax-invoices: status enum validation
- `accounting.ts` PATCH /signing-requests: side-effect UPDATE org-scoped
- `rentals.ts`: all PATCH endpoints use explicit field allowlists + status enum validation

### F&B
- `fb.ts`: `UPDATE fb_tables` org-scoped (was id-only)
- `fb.ts`: `UPDATE fb_orders` total recalc org-scoped (was id-only)
- `fb.ts`: cashbox_sessions cash movement org-scoped (was id-only)
- `fb.ts`: return flow `UPDATE fb_orders` org-scoped
- `fb.ts`: merge flow cancel + total recalc org-scoped
- `fb.ts`: fiscal error `UPDATE fb_orders` org-scoped
- `fb-guest.ts`: `paymentLimiter` on `POST /public/liqpay-checkout` and `POST /public/request-payment`
- `fb-guest.ts`: `orderLimiter` defined (apply to order submission endpoints)

### Users
- `users.ts` POST: super_admin creation blocked for non-super_admins; orgId required; password required

## Frontend — Maison HD

- `booking-panel.tsx`: `apiFetch` now throws on `!r.ok` with server error message
- `guest-portal.tsx`: all 3 mutation functions (submitCheckin, orderService, requestCheckout) check `r.ok` before showing success; network errors caught
- `qr-menu.tsx`: `placeOrder` checks `r.ok` before treating response as success
- `accounting.tsx`: DELETE invoice blocks if `status === "paid" || "signed"`
- `accounting.tsx`: DELETE archive blocks if `is_signed || has_kep`
- `finance.tsx`: `apiFetch` throws on `!r.ok`

## Documentation
- `artifacts/api-server/.env.example`: 35 env vars documented with descriptions

## Additional fixes (third pass — SQL injection elimination)
- `calendar-settings.ts`: complete rewrite, all 6 routes use parameterized pool.query
- `events.ts` PATCH /timings, /group-checkins, /allocations: sql.raw → pool.query
- `sales.ts` PATCH /leads: sql.raw → pool.query + enum allowlist (status, priority)
- `finance.ts` PATCH /revenue-categories: sql.raw → pool.query
- `accounting.ts` GET /documents: sql.raw(whereClause) → pool.query with allowlisted enums; search uses multi-param binding
- `activities.ts` equipment/activity update side-effects: org-scoped via category/type join
- `guest-portal.ts` POST /:code/service-order: price now server-loaded from unit_addons when addonId present; negative prices/qty clamped
- `guest-portal.ts` GET/:code, POST/:code/checkin, /service-order, /checkout-request: accessCodeLimiter (20/10min/IP)
- `guest-portal.ts` loyalty points: guarded by checkinFormSubmitted to prevent double-award
- `fb-warehouse.ts` PUT /receipts/:id/items: org pre-check added before DELETE+INSERT
- `fb-warehouse.ts` receipts/writeoffs/inventory/transfers final writes: org scope added to UPDATE/DELETE
- `fb-warehouse.ts` POST /writeoffs ingredient lookup: org-scoped to prevent cross-tenant cost reads
- `public-booking.ts` POST /bookings: date order + past-date validation; unit status check (active/available only)
- `public-booking.ts` GET /menu/:orgSlug: menuScrapeLimiter (60/min/IP)
- `public-booking.ts` POST /ai-waiter/chat: 20-message max + 2000-char per-message limit
- `bookings.ts` POST + PUT: checkIn < checkOut validation
- `users.ts` POST: email format regex + 8-char min password
- `payment-layer.ts` POST /webhook/liqpay: timingSafeEqual for HMAC comparison
- `notify.ts` buildGuestConfirmationEmail/notifyBookingCreated/notifyCheckIn: all user-controlled fields escaped with esc() helper
- `auth.ts` JWT_SECRET: startup warning if missing or < 32 chars
- `app.ts` body limit: 50mb → 2mb
- `acc-migration.ts` POST /projects/:id/files: file type allowlist + 10MB max
- `guide.ts` DELETE /locations, /routes: requireAuth import added (was crashing server)

## Additional fixes (second pass)
- `guests.ts`: non-super-admin without org now returns 403/empty on all CRUD ops
- `invoices.ts`: GET/:id, PUT/:id, DELETE/:id, POST/:id/pay now use `assertInvoiceAccess` helper (org via legalEntity join)
- `bookings.ts` GET /: propertyId/unitId query params validated against caller's org
- `bookings.ts` POST /: org-ownership check on unitId before transaction
- `bookings.ts` POST /group: full atomic transaction with pool.connect() + per-unit lock + org check
- `finance.ts` updateBookingPayment: accepts optional orgId for scoped WHERE
- `finance.ts` PATCH /revenue-categories/:id: replaced sql.raw with parameterized pool.query
- `accounting.ts` GET /documents: replaced sql.raw(whereClause) with parameterized pool.query + allowlisted enums
- `sales.ts` PATCH /leads/:id: replaced sql.raw with parameterized pool.query + enum validation
- `events.ts` PATCH /timings/:tid, /group-checkins/:gid, /allocations/:aid: replaced sql.raw with parameterized pool.query
- `calendar-settings.ts`: complete rewrite from sql.raw to parameterized pool.query (all 6 routes)
- `units.ts` PATCH /bulk-sort, /bulk-visibility: org-scoped via property join
- `unit-groups.ts` PUT/:id, DELETE/:id: org-scoped with pre-check
- `guest-portal.ts` PATCH /messages/:id/read: org-scoped via booking→unit→property chain
- `guest-portal.ts` PATCH /reviews/:id: validates org before update
- `guest-portal.ts` DELETE /offers/:id: org-scoped
- `minibar.ts` DELETE /charges/:id: org-scoped via booking→unit→property
- `events.ts` DELETE /timings/:tid: org-scoped via events table
- `guide.ts` DELETE /locations/:id, /routes/:id: added requireAuth import + org scope
- `fb.ts` cashbox_sessions cash_in/cash_out updates: org-scoped
- `fb.ts` order return/merge/fiscal updates: org-scoped
- `fb-guest.ts` POST /public/guest-orders: orderLimiter applied
- `auth.ts` SUPER_ADMIN_PASSWORD: constant-time comparison via timingSafeEqual

## How to apply
This is all deployed and running. Future routes must:
1. Use parameterized queries (never `sql.raw()` with user input)
2. Scope all reads and writes to `organization_id` from JWT
3. Apply rate limiters to public mutation endpoints
4. Check `r.ok` in all frontend fetch calls before showing success toast
