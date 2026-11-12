---
name: Poster order integration scope
description: User-defined relationship between QR menu, Mobile Waiter, and Poster POS.
---

The user wants QR menus at tables, houses, and hotel rooms to let guests order and pay independently. Mobile Waiter must show all orders, create orders, and add dishes to existing open orders. These orders and additions should reach Poster, which routes tickets to bar and kitchen printers. Guest QR payments should close the corresponding Poster bill with fiscalization.

**Why:** The user described this as the desired operating workflow, not merely an import of sales reports.

**How to apply:** Scope integration around shared order identity and two-way updates rather than separate orders for each channel. Treat automatic acceptance, printing, and fiscalization as capabilities to validate on the venue's actual Poster setup before promising unattended operation. This request defines desired behavior, not authorization to implement or alter production.

## Safe staging and live testing

QR orders arrive as new-order notifications on the **cashier station**: the bar tablet running Poster. Staff accept QR orders on that tablet; acceptance then automatically sends kitchen/bar tickets. This is not a requirement to approve QR orders in Maison HD Mobile Waiter first.

Mobile Waiter is a separate staff ordering interface. Staff can create orders there or on the cashier station, see existing accepted QR orders and Mobile Waiter orders, and work with the shared orders. In Mobile Waiter, adding dishes and pressing «Відправити встречку» is the direct dispatch action: no second approval on the cashier station is required.

The cashier station handles opening and closing the cash shift, X reports, and closing receipts.

**Why:** The user explicitly corrected the earlier interpretation and described these two distinct workflows, then confirmed the restated model with «Так, тепер правильно». The earlier «Після підтвердження офіціантом» must not be interpreted as an extra Mobile Waiter approval step for QR or an extra cashier approval for staff dispatch.

**How to apply:** Keep guest QR acceptance on the Poster cashier station and staff dispatch in Mobile Waiter. Neither receipt creation alone nor an open parent bill authorizes dispatch of unreviewed guest additions. Staff dispatch covers only the item IDs actually reviewed. Shared visibility is a product requirement; verify synchronization and physical printing without inventing additional approval steps.

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

**Why:** The user prioritized QR ordering and Mobile Waiter first, and did not authorize unrestricted live test sales. Poster Web API submission does not establish terminal printing. The live documentation marks `transactions.createTransaction` deprecated, whereas its GitHub Markdown omits that label and differs in documented parameters. The live English and Ukrainian `/orders` pages now both describe creation (an earlier English closing claim is no longer present); this does not prove compatibility with the existing shared-bill bridge.

**How to apply:** Publishing must not activate real order writes. Validate the venue's supported open-bill API and terminal module before enabling, checking the current documentation site, its language variants, and repository examples. Do not infer the cause of an ambiguous provider code solely from a deprecation label. Before substituting `/orders`, prove unpaid/open behavior and how its returned ID maps to the transaction ID used for subsequent additions; do not assume those IDs are interchangeable. POS-platform creation is another documented option, but it navigates the cashier to the new order and does not document explicit table arguments, so it is not proof of headless table-specific automation. Do not claim printing, bidirectional POS edits, or online-payment closure based solely on successful Web API submission.

Provide the requested shared-bill workflow between Mobile Waiter and the cashier station, but do not enable uncoordinated concurrent writes before synchronization is safe.

**Why:** Poster Web transaction mutations use absolute quantities and expose no compare-and-swap; even a read immediately before writing cannot prevent an independent cashier edit from racing.

**How to apply:** Detect divergence and hold for review rather than overwrite. Preserve uncertain writes for reconciliation, never retry them as new bills, and do not independently fiscalize a linked local bill. This safety constraint is not a product rule that orders belong exclusively to one interface.

## Order creation and terminal printing contracts

Poster support recommends the documentation section `transactions/createOrder`, whose actual HTTP endpoint is `POST /api/orders` with JSON and camelCase fields. Its official response example contains `response.id`, while support described `transaction_id`; their equivalence for later transaction mutations is not established by that reply.

**Why:** A method-name substitution would retain the old form encoding and response parser. The Ukrainian creation description and English closing description also still disagree.

**How to apply:** Confirm unpaid/open behavior without payments, the ID mapping for subsequent additions, and how to obtain the terminal order ID before replacing the existing adapter. A correctly shaped old-method request does not prove permission to invoke it; the official general error table describes code 20 as insufficient method permissions, not missing fields.

`Poster.orders.sendToKitchen` takes a terminal order ID expressed as a millisecond timestamp, not an interchangeable server receipt number. Its documented success does not establish physical printer delivery; printer-command failures may appear only at the venue's POS.

**Why:** The official POS method documentation explicitly limits failure visibility, despite support's broader statement about errors in the method response.

**How to apply:** Keep command submission separate from confirmed printing in UI and retry logic. Do not report a printed ticket solely from `success: true`, and do not blindly replay after uncertain printer delivery.

## Support clarification on creation and acceptance

The user relayed Poster support's clarification: a receipt can be created with or without payment; the creation response includes its number and ID but not the register, since creation happens at venue level and any register may accept it. Support says the necessary receipt details can be obtained after acceptance via webhook or manual lookup, and recommends online orders for this scenario.

**Why:** This resolves the support-level uncertainty about unpaid creation, but does not establish automatic POS acceptance, terminal printing, the exact webhook payload, or ID compatibility for later additions.

**How to apply:** Treat this as a user-provided support statement, not a successful live test. Evaluate online orders as the recommended QR integration path; preserve acceptance on the cashier station and explicitly verify linkage to the resulting POS bill and additions before replacing the existing bridge or enabling live writes. QR automatic acceptance is not required by the user's clarified workflow.

## Online-order documentation boundaries

Distinguish `incomingOrders.createIncomingOrder` from `POST /api/orders`: the former documents optional prepayment, a separate incoming-order identity and subsequent `transaction_id`, but no table field or automatic-acceptance parameter. The latter documents `tableId` and `autoAccept`; do not transfer these capabilities between methods. The Ukrainian page identifies `tableId` as a table, whereas the English description incorrectly calls it a register.

**Why:** Treating the two APIs as interchangeable would silently lose house/table routing or promise unattended acceptance unsupported by the chosen API.

**How to apply:** Official sources: https://dev.joinposter.com/en/docs/v3/web/incomingOrders/createIncomingOrder and https://dev.joinposter.com/ua/docs/v3/web/transactions/createOrder . Check the guest-phone/client requirement before changing anonymous table ordering; do not supply fabricated customer data.

Treat an `incoming_order.changed` webhook as a notification to read authoritative status and linkage, not a complete receipt payload. The detailed webhook reference documents acceptance/rejection; the e-commerce guide additionally mentions closure, so verify closure through transaction state rather than relying on that broader guide alone. Webhooks require a developer application; a personal integration token alone does not enable them.

**Why:** The detailed reference only guarantees extra incoming-order `data.type`, and creation can return `transaction_id: null`. Acceptance, closure, and fiscalization are separate outcomes.

**How to apply:** Read the corresponding incoming order after notification; use authenticated bounded polling as a recovery option when appropriate. `dash.getTransaction` with history documents `spot_tablet_id` in history entries, which is a candidate source for the accepting register, not proof of terminal-local print ID mapping. Verify that mapping and runtime availability before additions or printing.

## POS notification authentication boundary

Use the developer application's secret only for platform bundle deployment and verification of `Poster.makeRequest` signatures. Keep tenant merchant API credentials separate. Pair each notification channel to its organization/account/spot/register with a short-lived, one-time code and a separate revocable terminal credential.

**Why:** Poster's documented signature covers the full URL, JSON body and timestamp, but does not bind the account/spot/tablet headers. Those headers alone must not authorize tenant data. Native display confirmation also does not prove that a cashier read a notice or collected payment.

**How to apply:** Reject stale or invalid signatures, use a configured canonical HTTPS origin rather than request Host, authenticate the paired terminal before loading notices, and record delivery only after the SDK confirms display. Uploading a bundle updates installed registers on restart, so obtain explicit approval before uploading; publishing the Maison HD server is a separate user action.

Adding a venue to the developer application's **Розробка** account list only makes the private application available to that venue. The venue must still connect it under **Застосунки → Усі застосунки**. This does not select the browser's active cashier account. The terminal's **Development** mode is different: it loads a local development bundle, not the uploaded one.

**Why:** Setup across the developer test account and the intended venue led to pairing the venue's code on the test account's register. Poster's official account/debug documentation distinguishes these separate installation and loading controls.

**How to apply:** Confirm the venue has connected the existing developer application and that the opened terminal actually belongs to it. Do not create another application, change the tenant's merchant connection, or enable terminal Development mode merely to install an already uploaded private module.

The browser admin account and the web cashier session can differ even when the cashier is opened from the intended venue's admin panel. Use a private browser window with explicit cashier credentials as a non-destructive isolation check before changing integration settings.

**Why:** The DOGODA admin opened a cashier reporting `maison-hd`; after the private-window login procedure, the user supplied a screenshot showing successful Maison HD polling. This establishes that pairing can work, not the precise browser-storage cause or cash-notice delivery.

**How to apply:** Avoid repeatedly asking the user to leave the admin account, clearing working cashier storage, or rotating application secrets for this symptom. Distinguish successful pairing/polling from an actual guest notice being displayed.

## Financial data interpretation

Determine currency units and the meaning of counters separately for each Poster endpoint; do not apply a universal conversion or equate visitors with receipts.

**Why:** Poster documentation uses UAH for default daily analytics but minor currency units for other APIs. A blanket cents-to-UAH conversion silently misstates financial reports.

**How to apply:** Use documented response examples for the specific method and report type as test fixtures, retaining decimal precision and distinguishing receipt counts from guest counts. Failed requests must not be presented as successful financial reports.
