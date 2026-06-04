---
name: F&B module migration
description: All 52 HMS F&B pages copied into Maison HD with routes and sidebar navigation
---

# F&B Migration from HMS to Maison HD

## What was done
- Copied 52 F&B pages from `artifacts/hms/src/pages/fb-*.tsx` → `artifacts/maison-hd/src/pages/`
- Added all routes to `artifacts/maison-hd/src/App.tsx`
- Added F&B sidebar sections to `artifacts/maison-hd/src/components/layout/app-layout.tsx`
- Added `qrcode.react` dependency to Maison HD `package.json`
- Fixed `fb-import.tsx`: replaced `useAuth` (HMS-specific) with `useGetMe` from `@workspace/api-client-react`

## Sidebar F&B sections added
- F&B — Операції (cashier, waiter, POS, delivery, QR, minibar)
- F&B — Управління (menu, outlets, warehouse, staff, shifts, registers, packaging, stop-list)
- F&B — Аналітика (reports, sales/orders/products/abc/AI reports, costing)
- F&B — Маркетинг (clients, groups, loyalty, promotions, exceptions)
- F&B — Налаштування (config sections, ПРРО, QR codes, legal entities, apps, integrations)

## Route pattern
HMS used `/fb/menu`, `/fb/config/general` etc. — SAME paths in Maison HD.

## Dependency notes
HMS pages use `@/components/layout/app-layout` (resolves to Maison HD layout ✓), `hms_token` localStorage (same ✓), `/api/fb` (same API server ✓).
