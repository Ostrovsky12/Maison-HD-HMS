import type { BookingServioPreflight, BookingServioPreflightInput, BookingServioSearchResult } from "@workspace/api-zod";
import type { BookingEngineConfig } from "./booking-engine.js";
import { BOOKING_TARIFF_POLICY } from "./booking-tariff.js";

export type ServioPreflightMerchant = {
  mapped: boolean;
  hasKeys: boolean;
  authenticated: boolean;
  mode: "live" | "test" | null;
};

/** Input validation only. Neither a final bill nor authorization to sell. */
export function servioPreflight(
  input: BookingServioPreflightInput,
  snapshot: BookingServioSearchResult,
  config: BookingEngineConfig,
  merchant: ServioPreflightMerchant,
  callbackConfigured: boolean,
): BookingServioPreflight {
  const category = snapshot.categories.find(row => row.id === input.categoryId);
  const rate = category?.rates.find(row => row.priceListId === input.priceListId && row.conditionId === input.rateConditionId);
  const checks: BookingServioPreflight["checks"] = [];
  const add = (code: string, value: boolean | null, yes: string, no: string) =>
    checks.push({ code, status: value === null ? "unverified" : value ? "passed" : "blocked", message: value ? yes : no });
  add("availability", snapshot.status !== "failed" && !!category && category.freeRooms > 0,
    "Servio повторно підтвердив вільні місця для обраного складу гостей.",
    snapshot.status === "failed" ? snapshot.message : "Для обраної категорії немає підтверджених вільних місць.");
  add("selected_rate", !!rate, "Обраний прайс та умова договору знайдені в новій відповіді Servio.",
    "Обраний тариф більше не доступний або його відповідь не вдалося перевірити. Повторіть пошук.");
  add("nonrefundable", rate ? rate.nonRefundable === true : null,
    "Servio явно позначає тариф неповоротним.",
    rate ? "Servio не позначає цей тариф неповоротним. Назва тарифу не замінює ознаку IsNonReturnRate; він не відповідає правилам цього модуля."
      : "Неповоротність тарифу ще не перевірено.");
  add("sale_restrictions", rate?.saleAllowed ?? null,
    "Перевірені обмеження Servio не блокують обраний тариф.",
    rate?.saleAllowed === false ? "Servio блокує продаж цього тарифу." : "Не всі обмеження Servio перевірені; продаж не дозволено.");
  add("currency", snapshot.currency ? ["UAH", "ГРН", "ГРН.", "₴"].includes(snapshot.currency.trim().toUpperCase()) : null,
    "Servio повернув позначення гривні, яке підтримується поточним платіжним потоком.",
    "Валюта відсутня або не підтримується поточним потоком LiqPay. Конвертація не виконується.");
  add("amount", rate ? Number.isFinite(rate.total) && rate.total > 0 : null,
    "Сума нарахувань додатна. Для майбутньої оплати потрібні 100% остаточного рахунку Servio.",
    "Немає підтвердженої додатної суми для оплати.");
  add("seller_mapping", merchant.mapped, "Об’єкт прив’язаний до активної юрособи цього готелю.",
    "Оберіть об’єкт із прив’язаною активною юрособою вашого готелю в налаштуваннях LiqPay.");
  add("merchant_keys", merchant.hasKeys, "Для продавця збережено обидва платіжні ключі.",
    "У продавця немає повного комплекту ключів LiqPay.");
  add("merchant_authentication", merchant.authenticated, "Поточні ключі продавця раніше пройшли підписану перевірку LiqPay.",
    "Перевірте з’єднання LiqPay для поточних ключів продавця. Стара перевірка інших ключів не підходить.");
  add("live_mode", merchant.mode === null ? null : merchant.mode === "live",
    "Збережено ключі live-режиму. Це ще не підтверджує активацію еквайрингу.",
    "Тестові або відсутні ключі не підтверджують готовність приймати реальні оплати.");
  add("callback_origin", callbackConfigured, "Налаштована HTTPS-адреса для повідомлень LiqPay.",
    "Немає коректної налаштованої HTTPS-адреси для повідомлень LiqPay.");
  add("hotel_rules", !!config.terms.trim() && !!config.privacy.trim(),
    "У кабінеті збережено умови готелю та політику обробки персональних даних.",
    "Заповніть умови бронювання й політику обробки персональних даних.");
  const inputChecksPassed = checks.every(check => check.status === "passed");
  add("servio_seller_assignment", null, "", "Вибраний об’єкт використано лише для перевірки реквізитів. Постійна прив’язка продавця до HotelID і категорій Servio ще не налаштована.");
  add("reservation_workflow", null, "", "Створення бронювання, остаточного рахунку та звірка невизначених відповідей Servio ще не підключені.");
  add("payment_confirmation", null, "", "Підтвердження оплати та передавання її в Servio для цього потоку ще не підключені.");
  add("controlled_test", null, "", "Потрібна окремо погоджена контрольна перевірка бронювання й оплати; ця перевірка її не виконує.");
  return {
    checkedAt: snapshot.checkedAt, input, hotelId: snapshot.hotelId,
    categoryName: category?.name ?? null, rateName: rate?.name ?? null,
    currency: snapshot.currency, total: rate?.total ?? null,
    inputChecksPassed, canCreateReservation: false, canAcceptPayment: false,
    policyVersion: BOOKING_TARIFF_POLICY.version, acknowledgementText: BOOKING_TARIFF_POLICY.acknowledgementText, checks,
  };
}
