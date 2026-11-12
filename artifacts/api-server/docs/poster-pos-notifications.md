# Maison HD — cash requests on the Poster register

This module only displays cash-settlement requests. It does not create an incoming
order, modify a Poster bill, collect money, fiscalize, print, or move tips.

## Installation sequence

1. Register a Poster developer application, enable POS Platform, add the venue to
   Development, then install the application in that venue.
2. Rotate any Application Secret exposed in chat or screenshots. Store the new
   developer-application secret as `POSTER_POS_APPLICATION_SECRET`. This is the
   platform deployment/signature key, NOT a shared tenant merchant API key.
3. Publish the updated Maison HD API/frontend. `PUBLIC_APP_URL` must be the
   canonical public HTTPS origin. Do not point Poster at a private development
   preview or trust request Host/forwarded-host headers.
4. Build with `node scripts/src/poster-pos/build.mjs <verified-production-origin>`.
   Output is `generated-artifacts/poster-pos/bundle.js` (ignored by Git/deployment).
   No credentials are embedded in the bundle.
5. Only after explicit approval to update installed registers, upload:
   `node scripts/src/poster-pos/upload.mjs --application-id=<id> --confirm-live-upload`.
   The application ID is non-secret; obtain it from the developer settings.
   Upload updates the installed app for all its connected accounts on register
   restart. Do not run this as part of API startup, publishing, or a background job.
6. Restart the register to load the bundle.
7. In Maison HD → Integrations → Poster, choose the exact Poster spot/register
   IDs and create a pairing code. This revokes the old terminal credential and
   returns a new code once, valid for 15 minutes.
8. On the register, open Maison HD in the functions menu and enter that code.
   The cabinet reports online only after a successful authenticated contact.
9. Agree a specific live test before creating any test orders or cash requests.

## Security and delivery

- `Poster.makeRequest` signs canonical URL, JSON body, timestamp and the developer
  application secret. Requests more than 60 seconds old are rejected.
- Poster account/spot/tablet headers are not included in its documented signature.
  They are NOT sufficient tenant authorization. A one-time, atomic pairing code
  creates a separate credential bound to one organization/account/spot/register.
- Only credential hashes are stored server-side, under the organization's Poster
  configuration. The paired token reads and acknowledges cash notices. The updated
  bundle additionally supports opt-in kitchen command claims/results for the same
  account/location/register; see `poster-order-bridge.md`. It cannot collect money,
  close or fiscalize bills.
- Requests are queued durably in the existing table notifications table. They are
  not payments. A live terminal heartbeat (45 seconds) is required for new cash
  requests; failure never silently redirects delivery to Maison HD alone.
- Polling filters by organization, current service session, channel, pending
  status, unpaid open bill, unchanged amount and accepted guest items.
- SDK display success is acknowledged separately as `posterDelivery`; this means
  Poster accepted the notification display, NOT that a cashier read it, accepted
  cash, or closed a bill.
- Failed ACKs reuse the stored native notification ID rather than display again.
  A crash exactly between SDK display and local receipt persistence can still
  duplicate a visual notice; it cannot duplicate a bill or financial operation.
- Cashier actions and bill closure remain in Poster. This module does not yet
  synchronize independently created/edited/closed Poster bills into Maison HD.
  If a bill is closed only in Poster while the local bill stays open, local
  notifications require reconciliation; do not claim two-way settlement sync.
- No physical printer delivery or successful live terminal installation has been
  inferred from fixture tests.

## Official references

- https://dev.joinposter.com/en/docs/v3/start/account
- https://dev.joinposter.com/en/docs/v3/pos/requests/makeRequest
- https://dev.joinposter.com/en/docs/v3/pos/interfaces/interface-showNotification
- https://dev.joinposter.com/en/docs/v3/pos/settings
- https://dev.joinposter.com/en/docs/v3/pos/deploy
- https://github.com/joinposter/pos-platform-boilerplate/blob/master/upload.mjs
