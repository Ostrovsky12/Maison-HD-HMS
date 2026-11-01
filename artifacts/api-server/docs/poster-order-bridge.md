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
The newer Orders API documents closing behavior and is NOT a safe drop-in
replacement. Supported access must be verified on the venue’s actual account
before activating this adapter. No production test bill may be created without
agreeing a specific test with the owner.

**Not included:** POS-terminal installation, kitchen/bar ticket printing,
physical print acknowledgement, online payments, fiscalization, or synchronizing
closure/payment and edits initiated in Poster back into Maison HD. A Web API
write is not a print acknowledgement.

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
