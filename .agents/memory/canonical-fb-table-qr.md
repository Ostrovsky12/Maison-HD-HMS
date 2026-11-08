---
name: Canonical F&B table QR
description: Canonical destination and tenant-resolution rule for F&B table QR codes.
---

F&B table QR codes must open the Maison HD public QR menu and must use the organization record’s real slug. Never substitute a demo or default tenant slug when organization loading fails.

**Why:** Two guest-menu implementations previously coexisted, and the authenticated user profile endpoint did not provide the organization slug. A default tenant silently produced valid-looking QR codes that opened another organization’s seeded menu.

**How to apply:** Generate table QR values only after the authenticated organization endpoint returns a slug. Keep QR rendering local so availability of a third-party image service cannot prevent scanning. Outlet-wide QR behavior may remain separate until outlet filtering is supported by the canonical menu.

## Grouped service points and shared QR use

The user will create QR codes by groups in this system: «Будинки» for 14 houses («Будинок 1», «Будинок 2», etc.), «Готель» for 18 rooms (examples «Готель 21», «22», «23»), a restaurant hall with 10 tables (example labels «Зал ресторану 5, 7, 9, 13»), and a restaurant terrace with its own numbering.

The user proposes that a waiter scan the same QR sticker from Mobile Waiter to open the service point and begin taking an order. A guest scanning it should be able to add to the corresponding order and later pay through that code.

**Why:** The user described this grouping and shared-QR workflow to clarify the intended product behavior, rather than authorizing a new implementation or a production test.

**How to apply:** Keep service-point identity scoped to the organization and group; repeated numbers in different groups must not collide. Treat the same sticker as a guest menu entry and an authenticated staff scanner target, never as staff authorization. Resolve the current service/order session rather than permanently embedding a receipt ID in a reusable sticker. This requirement does not remove cashier-station acceptance of guest QR submissions or add cashier acceptance to Mobile Waiter staff dispatch.