---
name: Servio booking module goal
description: User wants to reuse Maison HD online booking as a module integrated with Servio rather than purchase Servio's booking module.
---

The user wants the existing Maison HD online-booking functionality to become a module that integrates with Servio, because Servio charges a lot for its own booking module.

The intended audience is both the user's own complex and other hotels; the user explicitly selected «Для обох варіантів».

Продовжувати реалізацію між проміжними кроками, а не пропонувати користувачу Republish після кожного кроку.

**Why:** Користувач прямо заперечив: «Давай далі, чого ж я буду репабліш після кожного кроку робити».

**How to apply:** Перевіряти проміжні зміни в робочому середовищі та продовжувати узгоджений ланцюжок; не вимагати публікації як передумови наступного кроку.

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

For this booking module, the user wants the same payment sequence as their Spa app: redirect to LiqPay, then notify Servio after verified payment. Send the guest payment/booking confirmation from the hotel's mailbox, and send a separate new-paid-booking notification to that same mailbox for administrators. Do not add fiscalization or further fiscal processing to this flow.

**Why:** The user explicitly defined this scope and said administrators need the notification to verify the reservation and continue communicating with guests.

**How to apply:** Use tenant-owned outgoing mail, not the platform Gmail connector. A browser return alone is not payment confirmation. Keep paid-but-unconfirmed Servio outcomes visible rather than issuing a false confirmed reservation.

The user will add accommodation photos, descriptions and rules through the cabinet.

**Why:** The user explicitly took responsibility for this content and said the texts are already prepared.

**How to apply:** Keep these fields editable in the cabinet; do not make up replacement content or treat content writing as remaining implementation work.

Treat Servio's supplied request examples as protocol evidence, not production data to replay.

**Why:** The user explicitly called the vendor's request example critically important. The supplied HAR demonstrates a POST Ping with scalar JSON `123` and an HTTP 200 scalar `123` response; a GET of the service root is not an equivalent connectivity test. The payment screenshot contains illustrative identifiers, not authorization to submit a payment.

**How to apply:** Follow the documented operation-specific payloads. Verify the tenant's HTTPS endpoint independently of the example's HTTP/IP endpoint. Separate Ping success from category access, availability, rates, reservation confirmation and payment reconciliation. Never copy sample reservation, bill or transaction identifiers into live writes, and never assume a separately supplied password is the API AccessToken.

AccessToken має містити саме наданий Servio токен, а не пароль.

**Why:** Користувач передав уточнення від Servio: «Стосовно AccessToken надав його, там не треба пароль як значення. Приклади є в інструкції».

**How to apply:** Не підставляти пароль замість AccessToken. Використовувати наданий токен відповідно до прикладів інструкції; не вважати раніше збережене значення перевіреним і не виводити його під час діагностики.

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

Servio checkout needs an explicit tenant-owned seller assignment independent of local accommodation inventory.

**Why:** Servio categories are not Maison HD unit IDs. A locally configured property can be used to inspect its merchant settings, but that alone does not establish which legal entity sells a Servio hotel/category.

**How to apply:** Treat cabinet preflight seller selection as a candidate, not a permanent assignment. Before issuing a checkout, persist an explicit owner-confirmed assignment to the Servio identity and retain the seller/credential snapshot through payment reconciliation. Never infer it from matching IDs or the first local property.

Для оплат цього бронювання користувач обрав іншого продавця — ТОВ «ДОГОДА ЮЕЙ», а не запропоноване ТОВ «Догода Резортс».

**Why:** Користувач відповів: «Додам іншого продавця ТОВ “ДОГОДА ЮЕЙ”».

**How to apply:** Не прив’язувати наявні ключі іншого продавця лише тому, що вони вже збережені. Вибір користувача не означає, що юридична особа, її ключі чи прив’язка вже налаштовані.

Do not assume Servio's reservation-guarantee amount field means the entire prepaid stay.

**Why:** The vendor describes `SetReservationType.Amount` and `SetReservationBill.Amount` as the first day's amount while the module requires 100% payment. Bill formation also returns adjusted service charges after tax calculation.

**How to apply:** Confirm the operation-specific reconciliation semantics before enabling real payment confirmation. Preserve authoritative service/date charges and never wire the full LiqPay total into a first-day field merely because both are named amount.

Нове публічне бронювання має 10 хвилин на оплату; неоплачене бронювання потрібно скасувати. Описи категорій, характеристик, тарифів і повідомлення про оплату користувач хоче додавати й редагувати в кабінеті.

**Why:** Користувач надав зразки: «Якщо гість не оплачує, то бронювання злітає» і попросив можливість редагування всіх цих текстів.

**How to apply:** Відлік має бути незмінним на сервері й не починатися заново після відкриття посилання. Перед звільненням бронювання перевіряти банк; невизначений або ще оброблюваний платіж не дорівнює відсутності оплати. Редагування презентаційних текстів не змінює фактичної ціни, номерного фонду чи фінансових правил.

Для автоскасування незалежно від відвідувачів користувач обрав «Постійний сервер» після попередження про зміну оплати хостингу.

**Why:** Autoscale може зупинитися без трафіку й не виконати фоновий таймер вчасно; користувач явно обрав запропонований варіант.

**How to apply:** Зберігати постійно активне розміщення для сервісу бронювання. Підготовлене налаштування не означає, що воно вже працює на опублікованому сайті; не оголошувати перехід активним без перевірки публікації.

Додаткові опції бронювання («З твариною», «Дитяче ліжко» тощо) — редаговані в кабінеті побажання, які передаються в Servio як примітка, без онлайн-доплат.

**Why:** Користувач попросив керований перелік додаткових послуг і явно обрав «Лише побажання, без онлайн-доплат».

**How to apply:** Не змінювати ціну, нарахування чи фактичну наявність додаткових місць через вибір побажань. Показувати, що наявність і можливу доплату підтверджує адміністратор; зберігати вибір разом із довільним коментарем гостя.

Публікацію сторінки бронювання вмикає користувач незалежно від готовності LiqPay, SMTP та текстів правил; незавершені налаштування мають бути попередженнями, а не забороною публікації.

**Why:** Користувач заперечив проти блокування: «Я знаю що лікпей я ще не додав. Але це моє рішення вмикати чи ні».

**How to apply:** Відділяти видимість сторінки від готовності приймати реальні бронювання та платежі. Зберігати перевірки фінансових операцій і чесне повідомлення гостю про недоступність онлайн-бронювання; не вимикати сторінку через незавершене налаштування продажів.

Пошук вільних дат і цін Servio не повинен залежати від готовності LiqPay, SMTP, продавця чи текстів правил.

**Why:** Після дозволу публікації користувач повідомив, що «Знайти» не реагує: загальна перевірка готовності продажів продовжувала блокувати читання наявності. Самої доступності сторінки недостатньо.

**How to apply:** Перевіряти видимість сторінки, доступність пошуку та готовність оформлення окремо. Для пошуку достатньо поточного перевіреного підключення Servio; перевірки платежів та оформлення залишати на операціях створення бронювання й оплати.

Користувач обрав «Показувати ціни для перегляду», навіть коли Servio не підтвердив неповоротність тарифу.

**Why:** Користувач явно погодив показ цін, окремий від дозволу оформлення, після пояснення причини приховування тарифів.

**How to apply:** Показувати підтверджені ціни Servio з позначкою «Лише перегляд» для непідтверджених умов продажу. Не називати такі тарифи неповоротними та не дозволяти їх вибір для бронювання чи оплати; правила оформлення не послаблювати.
