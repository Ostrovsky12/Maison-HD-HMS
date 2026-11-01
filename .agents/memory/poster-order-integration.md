---
name: Poster order integration scope
description: User-defined relationship between QR menu, Mobile Waiter, and Poster POS.
---

The user wants QR menus at tables, houses, and hotel rooms to let guests order and pay independently. Mobile Waiter must show all orders, create orders, and add dishes to existing open orders. These orders and additions should reach Poster, which routes tickets to bar and kitchen printers. Guest QR payments should close the corresponding Poster bill with fiscalization.

**Why:** The user described this as the desired operating workflow, not merely an import of sales reports.

**How to apply:** Scope integration around shared order identity and two-way updates rather than separate orders for each channel. Treat automatic acceptance, printing, and fiscalization as capabilities to validate on the venue's actual Poster setup before promising unattended operation. This request defines desired behavior, not authorization to implement or alter production.
