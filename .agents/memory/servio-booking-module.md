---
name: Servio booking module goal
description: User wants to reuse Maison HD online booking as a module integrated with Servio rather than purchase Servio's booking module.
---

The user wants the existing Maison HD online-booking functionality to become a module that integrates with Servio, because Servio charges a lot for its own booking module.

The intended audience is both the user's own complex and other hotels; the user explicitly selected «Для обох варіантів».

**Why:** The user explicitly described this goal and cost concern, approved preparing the specification, and then asked to build the application. This does not authorize replacing the property's PMS or modifying live reservations for tests.

The user reports that Servio charges a percentage for each booking and that this becomes a significant expense. They have already asked Servio the integration/access question.

**Why:** The user explicitly supplied the charging model and said the question had already been sent.

**How to apply:** Do not repeat the request for the user to contact Servio. Treat booking commission as user-reported; do not infer that API access is free or covered, or invent a commission rate. Prepare the module specification while keeping vendor-dependent access and payment behavior explicit.

**How to apply:** Investigate a booking-only integration without requiring migration away from Servio. Distinguish the price of Servio's booking interface from any separate API access or connector license; do not promise free API access or guaranteed savings before those terms are known.

**How to apply to product scope:** Support independent hotel branding and tenant-owned Servio connections rather than a one-property integration. Do not treat the user's own complex as authorization to test writes against another hotel.

Keep booking-module configuration separate from module-entitlement data.

**Why:** Existing tenant entitlements may be an array whitelist. Converting that array to a configuration object can silently remove module restrictions. A new product must not broaden unrelated tenant access.

**How to apply:** Add product configuration independently, preserve existing entitlements and default to unpublished sales. Servio drafts must not silently use the local Maison HD calendar.

Preserve the booking module's modern visual presentation, with photo galleries, video and descriptions for houses and rooms.

**Why:** The user objected to the replacement with a simplified text-card booking page and explicitly said the module previously had a modern design with photo galleries, video and descriptions.

**How to apply:** Treat the existing visual experience and accommodation media as requirements when changing booking behavior. Locate the actual prior implementation and media sources rather than treating a simplified new page or an older placeholder card as the approved design.

Accommodation photos, video and descriptions are an independent presentation layer, not a replacement for Servio inventory.

**Why:** The user clarified that no screenshot of the earlier module exists; the priority is the ability to add this content without conflicting with Servio's room inventory during synchronization.

**How to apply:** Bind PMS presentation content through stable provider identifiers and explicit mappings, never guessed room-name matches. Synchronization must preserve hotel-authored media and must not let media editing change PMS categories, capacities, availability or rates. Until verified Servio inventory mapping exists, keep its media editing blocked rather than attaching content to unrelated local rooms.

Booking-module sales use 100% online prepayment and a non-refundable tariff with no date changes.

**Why:** The user explicitly requires 100% payment through the module and says guests often do not read the rules. They want the conditions prominent immediately before payment, in a modern experience between Booking.com and Airbnb rather than a plain form.

**How to apply:** Show the full amount and the no-refund/no-date-change conditions beside the payment action. Require a separate, unchecked acknowledgement, not merely generic terms acceptance; retain the accepted wording/version and time. Preserve legally required exceptions rather than implying statutory rights can be waived. Never substitute payment on arrival or a partial percentage, and never infer a successful payment merely from the provider's return URL.

Treat Servio's supplied request examples as protocol evidence, not production data to replay.

**Why:** The user explicitly called the vendor's request example critically important. The supplied HAR demonstrates a POST Ping with scalar JSON `123` and an HTTP 200 scalar `123` response; a GET of the service root is not an equivalent connectivity test. The payment screenshot contains illustrative identifiers, not authorization to submit a payment.

**How to apply:** Follow the documented operation-specific payloads. Verify the tenant's HTTPS endpoint independently of the example's HTTP/IP endpoint. Separate Ping success from category access, availability, rates, reservation confirmation and payment reconciliation. Never copy sample reservation, bill or transaction identifiers into live writes, and never assume a separately supplied password is the API AccessToken.

The password supplied by Servio is used for API requests, not merely cabinet login.

**Why:** The user explicitly clarified its purpose.

**How to apply:** Treat it as an integration credential. Confirm its exact header or request-field mapping before changing authentication; its purpose alone does not establish that it replaces AccessToken.

A Servio availability/price diagnostic is not a final payable quote or an inventory hold.

**Why:** The vendor describes separate availability, pricing and bill-formation operations; bill formation can recalculate taxes. Category access alone proves neither room availability nor sale eligibility.

**How to apply:** Preserve the returned currency and service/date charges rather than substituting local prices, rack rates or a nightly average. Preserve partial failures without inventing zero prices or zero inventory. Unknown or missing sale restrictions must remain unverified, not implicitly cleared. Before any future checkout, revalidate availability and obtain authoritative final charges. Keep CompanyID and CompanyCodeID distinct; never infer one from the other.

Provider protocol errors need privacy-safe field-level diagnostics, not only a generic unexpected-response label.

**Why:** A real Servio availability response succeeded while pricing was rejected; a screenshot of the generic error could not establish which field or type differed. Synthetic success fixtures cannot establish compatibility with a particular hotel’s service.

**How to apply:** Report static parser paths and expected/actual type names without raw provider values, payloads, arbitrary keys or credentials. Do not claim live pricing compatibility until a real response has validated. Keep monetary validation independent from optional restriction metadata: unverified conditions must block eligibility, not erase otherwise validated charges.

Servio's published field types can differ from a deployed hotel's serialization.

**Why:** Its documentation describes tariff flags as integer 0/1 and prices as doubles, but the user's production diagnostics showed `IsNonReturnRate` arriving as a JSON boolean and service `Price` as a string. This is direct compatibility evidence, not a reason to weaken all validation.

**How to apply:** Accept documented numeric flags and the observed boolean representation explicitly, preserving false. Do not coerce strings, null or missing flags; validate other fields independently rather than assuming the whole response matches the documentation.

For monetary fields, accept validated decimal-dot numeric strings as well as numbers. Preserve cent precision and reject blank, localized, currency-suffixed or otherwise ambiguous strings; do not use permissive parseFloat or invent a zero amount.
