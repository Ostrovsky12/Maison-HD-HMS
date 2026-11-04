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
