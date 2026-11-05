---
name: Poster order integration scope
description: User-defined relationship between QR menu, Mobile Waiter, and Poster POS.
---

The user wants QR menus at tables, houses, and hotel rooms to let guests order and pay independently. Mobile Waiter must show all orders, create orders, and add dishes to existing open orders. These orders and additions should reach Poster, which routes tickets to bar and kitchen printers. Guest QR payments should close the corresponding Poster bill with fiscalization.

**Why:** The user described this as the desired operating workflow, not merely an import of sales reports.

**How to apply:** Scope integration around shared order identity and two-way updates rather than separate orders for each channel. Treat automatic acceptance, printing, and fiscalization as capabilities to validate on the venue's actual Poster setup before promising unattended operation. This request defines desired behavior, not authorization to implement or alter production.

## Safe staging and live testing

QR orders require waiter confirmation before reaching the kitchen, including each later guest addition to an already open bill.

**Why:** The user explicitly chose «Після підтвердження офіціантом».

**How to apply:** Approval covers only the item IDs the waiter actually reviewed, never all rows present when the server processes the click. Apply the boundary to both public ordering entry points and every dispatch/accept path; do not treat an open parent bill as approval of future guest additions.

The user reports having only the live Poster account, with no separate test account.

**Why:** The user explicitly answered that only a production account is available.

**How to apply:** Do not assume a sandbox exists or use another Maison HD tenant as one. Read-only research and mocked tests do not authorize new live orders; obtain separate approval for a specific live scenario.

Refresh the menu and prices from the user's confirmed current source before configuring or testing QR/Waiter order transfer. Existing menu items are not proof that the menu is current.

For the DOGODA workflow, the user confirmed that the current menu and prices are in Poster; import from Poster into Maison HD, not the reverse. Resolve the selected organization separately rather than inferring it from the DOGODA brand name.

The user identified **«Котеджний комплекс ДОГОДА»** as the organization for this QR/Waiter integration workflow, not **«Заміський комплекс DOGODA Resort»**.

The user identified Poster hall **«Будинки»** for the intended №1 and №4 service points. Do not substitute same-numbered tables in «Кафе», «Басейн», or the local «Основний зал».

**Why:** The user corrected the assumption that the stored Maison HD menu was ready for testing: it contained old dishes/prices and needed the new menu first. They explicitly identified Poster as the current source. Similarly branded DOGODA organizations are distinct tenants; a successful import was observed in a different organization from the one previously assumed for testing.

**How to apply:** Confirm the authoritative source, import direction, and selected organization before updating dishes or quoting test totals. Resolve table identities within that organization; duplicate table numbers are not unique identities. Do not configure tests against the old prices or assume menu import also exports the catalogue to Poster.

**Poster hall lookup:** The official floor-section list method is `spots.getSpotTablesHalls`; `spots.getTableHallTables` supplies the tables and their hall IDs. Resolve names with the former and constrain mappings by venue and hall, not table number alone.

**Why:** The provider returns repeated №1/№4 across several halls, while guessing `spots.getTableHalls` did not return a supported catalogue.

**How to apply:** Use the official hall catalogue before proposing mappings; never turn a missing hall-name field on a table into an assumed «Основний зал».

Retain sanitized provider error codes and the operation name when a Poster write is rejected; do not reduce every rejection to an indistinguishable generic error.

**Why:** A real create-order test was rejected even though the catalogue reads succeeded and the documented endpoint and parameter names matched. Discarding the provider code prevented distinguishing permission, register, and request-validation failures without another write.

**How to apply:** Keep numeric provider codes, HTTP status, and a fixed operation identifier; never expose bearer URLs, tokens, raw bodies, or arbitrary provider messages. Preserve the distinction between explicit rejection and an uncertain outcome, and do not blindly replay writes to obtain diagnostics.

For menu-and-price refreshes, keep ingredients and stock import separate rather than requiring them for the menu.

**Why:** The user confirmed that the menu was available after disabling ingredient import following a pre-write import failure. This confirms the menu-only path, not the exact failing provider method or correctness of every imported price.

**How to apply:** Use menu-only refresh for QR/Waiter preparation; validate prices and mappings separately. Investigate stock import independently if it is requested.

Keep the open-order bridge opt-in, separate from printing and payment/fiscalization. Do not create production test orders without agreeing a specific test with the user.

**Why:** The user prioritized QR ordering and Mobile Waiter first, and did not authorize unrestricted live test sales. Poster Web API submission does not establish terminal printing. The live documentation marks `transactions.createTransaction` deprecated, whereas its GitHub Markdown omits that label and differs in documented parameters. For the newer `/orders`, English says the method closes the order, but Ukrainian says it creates an order and documents `autoAccept`; the documentation disagreement does not establish either automatic closure or compatibility with the existing shared-bill bridge.

**How to apply:** Publishing must not activate real order writes. Validate the venue's supported open-bill API and terminal module before enabling, checking the current documentation site, its language variants, and repository examples. Do not infer the cause of an ambiguous provider code solely from a deprecation label. Before substituting `/orders`, prove unpaid/open behavior and how its returned ID maps to the transaction ID used for subsequent additions; do not assume those IDs are interchangeable. POS-platform creation is another documented option, but it navigates the cashier to the new order and does not document explicit table arguments, so it is not proof of headless table-specific automation. Do not claim printing, bidirectional POS edits, or online-payment closure based solely on successful Web API submission.

Do not permit simultaneous editing of a managed bill in Maison HD and on the POS until a terminal-side synchronization mechanism provides stronger coordination.

**Why:** Poster Web transaction mutations use absolute quantities and expose no compare-and-swap; even a read immediately before writing cannot prevent an independent cashier edit from racing.

**How to apply:** Detect divergence and hold for review rather than overwrite. Preserve uncertain writes for reconciliation, never retry them as new bills, and do not independently fiscalize a linked local bill.

## Order creation and terminal printing contracts

Poster support recommends the documentation section `transactions/createOrder`, whose actual HTTP endpoint is `POST /api/orders` with JSON and camelCase fields. Its official response example contains `response.id`, while support described `transaction_id`; their equivalence for later transaction mutations is not established by that reply.

**Why:** A method-name substitution would retain the old form encoding and response parser. The Ukrainian creation description and English closing description also still disagree.

**How to apply:** Confirm unpaid/open behavior without payments, the ID mapping for subsequent additions, and how to obtain the terminal order ID before replacing the existing adapter. A correctly shaped old-method request does not prove permission to invoke it; the official general error table describes code 20 as insufficient method permissions, not missing fields.

`Poster.orders.sendToKitchen` takes a terminal order ID expressed as a millisecond timestamp, not an interchangeable server receipt number. Its documented success does not establish physical printer delivery; printer-command failures may appear only at the venue's POS.

**Why:** The official POS method documentation explicitly limits failure visibility, despite support's broader statement about errors in the method response.

**How to apply:** Keep command submission separate from confirmed printing in UI and retry logic. Do not report a printed ticket solely from `success: true`, and do not blindly replay after uncertain printer delivery.

## Financial data interpretation

Determine currency units and the meaning of counters separately for each Poster endpoint; do not apply a universal conversion or equate visitors with receipts.

**Why:** Poster documentation uses UAH for default daily analytics but minor currency units for other APIs. A blanket cents-to-UAH conversion silently misstates financial reports.

**How to apply:** Use documented response examples for the specific method and report type as test fixtures, retaining decimal precision and distinguishing receipt counts from guest counts. Failed requests must not be presented as successful financial reports.
