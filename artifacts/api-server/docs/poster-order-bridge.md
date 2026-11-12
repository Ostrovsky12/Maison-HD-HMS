# QR menu / Mobile Waiter → Poster: open bills

## Current supported stage

- Guests and staff at the same occupied local table add to one local open bill.
- The waiter list includes tableless and room-service orders, not just occupied tables.
- An organization owner/manager configures the existing Poster connection in
  **Інтеграції → Poster → Передача замовлень у Poster**. No second token is needed.
- Explicitly select the location, register, employee, local-table-to-Poster-table
  mappings and local-item-to-Poster-product mappings.
- Saving while disabled is read-only with respect to Poster. Publishing does not
  activate the bridge. Only explicit activation permits provider order writes.
- Automatically discover new open orders from activation onward. Previously
  opened orders require an explicit waiter Send action. Additions retain one
  remote transaction id.

## Important deployment / venue limits

The additive database field `fb_orders.poster_sync` is declared in the Drizzle
schema. Apply that addition through the normal database deployment flow. Do not
force-push an unrelated drifting schema to make this feature work.

The open-bill adapter uses Poster’s documented, **deprecated**
`transactions.createTransaction`, `transactions.addTransactionProduct`,
`transactions.changeTransactionProductCount`, and `transactions.changeComment`.
The newer `POST /api/orders` is a different JSON contract, with a response ID
whose linkage to the legacy transaction mutations must be proven, not assumed.
It is NOT a safe method-name substitution. Supported access must be verified on the venue’s actual account
before activating this adapter. No production test bill may be created without
agreeing a specific test with the owner.

**Not included:** physical print acknowledgement, online payments, fiscalization, or synchronizing
closure/payment and edits initiated in Poster back into Maison HD. A Web API
write is not a print acknowledgement.

## Opt-in terminal kitchen commands

The paired cash-notification module now also supports a separate opt-in kitchen
queue. Uploading the new bundle and publishing the server are separate actions;
neither enables kitchen commands automatically.

1. Update the existing developer application's bundle only after the owner agrees.
2. Use the **installed Poster cashier app** with configured kitchen/bar printers.
   The browser cashier supports pairing/cash notices but not kitchen ticket printing.
3. Pair the intended account/location/register, wait for its heartbeat, then refresh
   the order-bridge settings. The readiness indicator requires the new module
   reporting native SDK support, not just the older cash-notice heartbeat.
4. Configure and verify the order bridge and product/table mappings. Kitchen
   commands require the same register as the paired channel and a separate
   confirmed **Бігунки через касовий модуль Poster** switch.
5. Only bills opened after kitchen activation are eligible. Old bills are never
   printed retrospectively merely because the switch changed.
6. Staff release only their reviewed item IDs through **Відправити встречку**.
   The Web API adapter must actually synchronize the bill before it enters the queue.
7. Open the corresponding bill in Poster. The documented `orders.getActive()`
   supplies its terminal millisecond ID; `orderName` identifies the back-office
   receipt. The module requires both that identity and the mapped table, exact
   product quantities and prices, no modifiers/discounts/payments, and valid
   `printedNum` values. It then submits `orders.sendToKitchen(terminalOrderId)`
   without another approval step. It never guesses IDs from table numbers or
   sends a server receipt ID to the terminal method.

The current documented SDK does not provide an all-open-orders lookup. If the
bill is not active, a native notification asks the cashier to open it. **This
stage is not unattended, headless dispatch to every background bill.**

The shared order advisory lock serializes synchronization and kitchen claims.
Before claiming, the server re-reads the local released snapshot and remote
transaction; the configuration/token check and attempt journal are saved before
the terminal can execute a side effect. A claimed command is single-use and never
reissued after timeout/reload. Native local storage records uncertainty before
the SDK call; result delivery retries do not repeat the command.

`submitted` means only SDK command acceptance, `already_sent` means the terminal's
product counters were already sent (no new command), and `claimed`/`review` prevent
further bridge writes until checked. Physical printer failure can be displayed
only by Poster; never label a command as paper delivery. No automatic reset or
reprint control is provided for uncertain attempts.

This does not replace or prove the venue's deprecated Web API create-order
permission. A live, owner-approved new bill + addition + physical department
printing test is still required before operational launch.

Official references:
- https://dev.joinposter.com/en/docs/v3/pos/orders/orders-getActive
- https://dev.joinposter.com/en/docs/v3/pos/orders/orders-sendToKitchen
- https://dev.joinposter.com/en/docs/v3/pos/types/order
- https://dev.joinposter.com/en/docs/v3/pos/environment
- https://knowledge-base.joinposter.com/uk-ua/how-to-work-with-pos

Do not edit a managed bill simultaneously on the POS and in Maison HD. The Web
API has no compare-and-swap primitive; pre-command reads detect divergence but
cannot make independent cashier edits atomic. Local payment, split, merge and
closure are refused for managed bills so that this stage cannot independently
fiscalize an already exported bill. Complete payment on Poster; automatic
reflection of that closure locally is a separate stage.

## Fail closed

- Unknown products/tables, modifiers, discounts, fractional quantities and price
  differences stop submission before an incorrect bill is created.
- An operation journal is committed before each provider write. A timeout,
  malformed success or process crash leaves the order on manual review. No
  automatic replay of an uncertain write is permitted.
- Confirmed rejection/read failure can be retried deliberately after correcting
  configuration. Price/quantity/comment/register divergence pauses the bridge.
- Changing the provider credential pauses previously linked bills until their
  account binding is reviewed; remote numeric ids alone are not proof of identity.
- Internal command payloads and credential fingerprints are not returned to clients.

## Manual review procedure

Keep automatic dispatch paused for the affected bill. Inspect the recorded
command and actual bill in Poster. Do not delete the journal or create a fresh
bill to bypass uncertainty. An operator reconciliation screen is still needed
before unattended production use; it must prove the remote result before
clearing a hold. Successful transfer is reported only as an open bill, never
paid, fiscalized or printed.
