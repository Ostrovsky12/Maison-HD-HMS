---
name: Poster order integration scope
description: User-defined relationship between QR menu, Mobile Waiter, and Poster POS.
---

The user wants QR menus at tables, houses, and hotel rooms to let guests order and pay independently. Mobile Waiter must show all orders, create orders, and add dishes to existing open orders. These orders and additions should reach Poster, which routes tickets to bar and kitchen printers. Guest QR payments should close the corresponding Poster bill with fiscalization.

**Why:** The user described this as the desired operating workflow, not merely an import of sales reports.

**How to apply:** Scope integration around shared order identity and two-way updates rather than separate orders for each channel. Treat automatic acceptance, printing, and fiscalization as capabilities to validate on the venue's actual Poster setup before promising unattended operation. This request defines desired behavior, not authorization to implement or alter production.

## Financial data interpretation

Determine currency units and the meaning of counters separately for each Poster endpoint; do not apply a universal conversion or equate visitors with receipts.

**Why:** Poster documentation uses UAH for default daily analytics but minor currency units for other APIs. A blanket cents-to-UAH conversion silently misstates financial reports.

**How to apply:** Use documented response examples for the specific method and report type as test fixtures, retaining decimal precision and distinguishing receipt counts from guest counts. Failed requests must not be presented as successful financial reports.
