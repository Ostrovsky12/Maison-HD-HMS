/**
 * MAISON HD — MODULE CATALOG & SUBSCRIPTION ARCHITECTURE
 *
 * Product can be sold:
 *   1. As FULL PLATFORM — one plan (Starter / Professional / Enterprise)
 *   2. As INDIVIDUAL MODULES — à la carte on top of Core PMS
 *
 * Module keys are authoritative — used in feature flags, DB settings, API guards.
 */

export type ModuleCategory =
  | "core"
  | "revenue"
  | "operations"
  | "experience"
  | "hospitality"
  | "ai"
  | "finance"
  | "analytics"
  | "platform";

export interface HmsModule {
  key: string;
  name: string;
  nameUk: string;
  description: string;
  icon: string;
  category: ModuleCategory;
  /** Plans that include this module by default */
  includedIn: PlanKey[];
  /** Price/mo if purchased as standalone add-on (null = not available standalone) */
  standalonePrice: number | null;
  /** Feature is in active development / coming soon */
  comingSoon?: boolean;
}

export type PlanKey = "starter" | "professional" | "enterprise";

export interface HmsPlan {
  key: PlanKey;
  name: string;
  nameUk: string;
  description: string;
  price: number;      // UAH/month
  priceYear: number;  // UAH/year (usually ~20% discount)
  maxUnits: number;
  maxUsers: number;
  maxProperties: number;
  highlight?: boolean;
  badge?: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLANS
// ─────────────────────────────────────────────────────────────────────────────
export const PLANS: Record<PlanKey, HmsPlan> = {
  starter: {
    key: "starter",
    name: "Starter",
    nameUk: "Стартер",
    description: "Для невеликих готелів та апартаментів",
    price: 990,
    priceYear: 9_504,   // 990 * 12 * 0.8
    maxUnits: 30,
    maxUsers: 5,
    maxProperties: 1,
    color: "text-slate-700",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
  },
  professional: {
    key: "professional",
    name: "Professional",
    nameUk: "Професійний",
    description: "Повна платформа для готелів середнього розміру",
    price: 2_490,
    priceYear: 23_904,
    maxUnits: 100,
    maxUsers: 20,
    maxProperties: 3,
    highlight: true,
    badge: "Найпопулярніший",
    color: "text-indigo-700",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-300",
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    nameUk: "Корпоративний",
    description: "Для готельних мереж та великих комплексів",
    price: 4_990,
    priceYear: 47_904,
    maxUnits: 99_999,
    maxUsers: 99_999,
    maxProperties: 99_999,
    badge: "Повний доступ",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-300",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE CATALOG
// ─────────────────────────────────────────────────────────────────────────────
export const MODULES: HmsModule[] = [
  // ── CORE (always included in all plans) ─────────────────────────────────
  {
    key: "core_pms",
    name: "Core PMS",
    nameUk: "Базова PMS",
    description: "Бронювання, номери, гості, шахматка, housekeeping",
    icon: "🏨",
    category: "core",
    includedIn: ["starter", "professional", "enterprise"],
    standalonePrice: null,
  },
  {
    key: "invoices",
    name: "Invoices & Payments",
    nameUk: "Рахунки та оплати",
    description: "Рахунки для гостей, прийом оплат, касові операції",
    icon: "🧾",
    category: "core",
    includedIn: ["starter", "professional", "enterprise"],
    standalonePrice: null,
  },
  {
    key: "reports",
    name: "Basic Reports",
    nameUk: "Базова звітність",
    description: "Щоденні, місячні звіти, ніч-аудит",
    icon: "📋",
    category: "core",
    includedIn: ["starter", "professional", "enterprise"],
    standalonePrice: null,
  },

  // ── REVENUE ──────────────────────────────────────────────────────────────
  {
    key: "revenue_management",
    name: "Revenue Management",
    nameUk: "Управління доходами",
    description: "Динамічне ціноутворення, тарифи, прогнози завантаженості",
    icon: "💹",
    category: "revenue",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 490,
  },
  {
    key: "ota_channels",
    name: "OTA Channel Manager",
    nameUk: "Менеджер каналів",
    description: "Booking.com, Airbnb, Expedia — синхронізація в реальному часі",
    icon: "🌐",
    category: "revenue",
    includedIn: ["enterprise"],
    standalonePrice: 690,
    comingSoon: true,
  },
  {
    key: "online_booking",
    name: "Online Booking Engine",
    nameUk: "Онлайн-бронювання",
    description: "Власна сторінка бронювання з інтеграцією на сайт",
    icon: "🖥️",
    category: "revenue",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 290,
  },
  {
    key: "rentals",
    name: "Rentals & Long-stay",
    nameUk: "Оренда та довготривале проживання",
    description: "Договори оренди, щомісячні розрахунки, комунальні послуги",
    icon: "🏠",
    category: "revenue",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 390,
  },

  // ── OPERATIONS ────────────────────────────────────────────────────────────
  {
    key: "maintenance",
    name: "Maintenance",
    nameUk: "Технічна служба",
    description: "Задачі технічного обслуговування, заявки, контроль виконання",
    icon: "🔧",
    category: "operations",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 190,
  },
  {
    key: "operations",
    name: "Staff Operations",
    nameUk: "Операції персоналу",
    description: "Staff console, task management, internal communications",
    icon: "⚙️",
    category: "operations",
    includedIn: ["starter", "professional", "enterprise"],
    standalonePrice: null,
  },
  {
    key: "hq_multisite",
    name: "HQ Multi-property",
    nameUk: "HQ Мережевий вид",
    description: "Централізоване управління кількома об'єктами з єдиної панелі",
    icon: "🏢",
    category: "operations",
    includedIn: ["enterprise"],
    standalonePrice: 690,
  },

  // ── EXPERIENCE ────────────────────────────────────────────────────────────
  {
    key: "inbox",
    name: "Inbox & Communications",
    nameUk: "Комунікації та чат",
    description: "Єдина inbox для всіх каналів зв'язку з гостями",
    icon: "💬",
    category: "experience",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 290,
  },
  {
    key: "guest_portal",
    name: "Guest Portal",
    nameUk: "Гостьовий портал",
    description: "Особистий кабінет гостя, онлайн check-in/out, документи",
    icon: "🔑",
    category: "experience",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 290,
  },
  {
    key: "guest_experience",
    name: "Guest Experience",
    nameUk: "Гостьовий досвід",
    description: "Персоналізація, профілі гостей, програми лояльності",
    icon: "❤️",
    category: "experience",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 390,
  },
  {
    key: "hotel_tv",
    name: "Hotel TV Display",
    nameUk: "TV-інформер",
    description: "Кіоск-режим для TV: погода, послуги, анонси, late checkout",
    icon: "📺",
    category: "experience",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 190,
  },

  // ── HOSPITALITY ───────────────────────────────────────────────────────────
  {
    key: "spa",
    name: "SPA & Wellness",
    nameUk: "SPA та велнес",
    description: "Запис на процедури, розклад, аналітика SPA-послуг",
    icon: "🌿",
    category: "hospitality",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 390,
  },
  {
    key: "events",
    name: "Events & Banquets",
    nameUk: "Заходи та банкети",
    description: "Оренда залів, корпоративи, весілля, кейтеринг",
    icon: "🎭",
    category: "hospitality",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 290,
  },
  {
    key: "restaurant",
    name: "Restaurant & F&B",
    nameUk: "Ресторан та F&B",
    description: "Меню, бронювання столиків, замовлення в номер, POS",
    icon: "🍽️",
    category: "hospitality",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 490,
  },
  {
    key: "activities",
    name: "Activities & Rentals",
    nameUk: "Активності та прокат",
    description: "Екскурсії, оренда інвентарю, активний відпочинок",
    icon: "🏄",
    category: "hospitality",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 290,
  },

  // ── AI & AUTOMATION ───────────────────────────────────────────────────────
  {
    key: "ai_hub",
    name: "AI Hub",
    nameUk: "AI Hub (GPT-5)",
    description: "Staff Copilot, Sales AI, Owner Analyst, Knowledge Assistant",
    icon: "🤖",
    category: "ai",
    includedIn: ["enterprise"],
    standalonePrice: 890,
  },
  {
    key: "automation",
    name: "AI Automation",
    nameUk: "AI Автоматизація",
    description: "Тригери, воркфлоу, автоматичні відповіді та дії",
    icon: "⚡",
    category: "ai",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 390,
  },

  // ── FINANCE ───────────────────────────────────────────────────────────────
  {
    key: "accounting",
    name: "Accounting",
    nameUk: "Бухгалтерія",
    description: "Облік доходів/витрат, журнали, звіти для бухгалтера",
    icon: "📊",
    category: "finance",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 490,
  },
  {
    key: "finance",
    name: "Finance & Cash",
    nameUk: "Фінанси та каса",
    description: "Каса, залишки, розрахунки, P&L",
    icon: "💰",
    category: "finance",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 290,
  },
  {
    key: "sales_crm",
    name: "Sales & CRM",
    nameUk: "Продажі та CRM",
    description: "Воронка продажів, ліди, корпоративні контракти",
    icon: "🎯",
    category: "finance",
    includedIn: ["enterprise"],
    standalonePrice: 490,
  },

  // ── ANALYTICS ─────────────────────────────────────────────────────────────
  {
    key: "analytics",
    name: "Advanced Analytics",
    nameUk: "Розширена аналітика",
    description: "KPI дашборди, прогнози, порівняльний аналіз, RevPAR/ADR",
    icon: "📈",
    category: "analytics",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 490,
  },

  // ── PLATFORM ──────────────────────────────────────────────────────────────
  {
    key: "integrations",
    name: "Integrations",
    nameUk: "Інтеграції",
    description: "LiqPay, Stripe, Telegram, OpenAI, webhooks",
    icon: "🔌",
    category: "platform",
    includedIn: ["professional", "enterprise"],
    standalonePrice: 290,
  },
  {
    key: "white_label",
    name: "White Label",
    nameUk: "Біла мітка",
    description: "Власний домен, логотип, брендинг системи",
    icon: "🏷️",
    category: "platform",
    includedIn: ["enterprise"],
    standalonePrice: null,
    comingSoon: true,
  },
  {
    key: "api_access",
    name: "API Access",
    nameUk: "API доступ",
    description: "REST API з API-ключами для власних інтеграцій",
    icon: "🔐",
    category: "platform",
    includedIn: ["enterprise"],
    standalonePrice: null,
    comingSoon: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
export function getModulesByCategory(): Record<ModuleCategory, HmsModule[]> {
  const result = {} as Record<ModuleCategory, HmsModule[]>;
  for (const m of MODULES) {
    if (!result[m.category]) result[m.category] = [];
    result[m.category].push(m);
  }
  return result;
}

export function getPlanModules(plan: PlanKey): HmsModule[] {
  return MODULES.filter(m => m.includedIn.includes(plan));
}

export function isModuleInPlan(moduleKey: string, plan: PlanKey): boolean {
  const m = MODULES.find(m => m.key === moduleKey);
  return m ? m.includedIn.includes(plan) : false;
}

export const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  core:         "Основна PMS",
  revenue:      "Дохід та продажі",
  operations:   "Операції",
  experience:   "Гостьовий досвід",
  hospitality:  "Гостинність",
  ai:           "AI та автоматизація",
  finance:      "Фінанси",
  analytics:    "Аналітика",
  platform:     "Платформа",
};

export const CATEGORY_ICONS: Record<ModuleCategory, string> = {
  core:         "🏨",
  revenue:      "💹",
  operations:   "⚙️",
  experience:   "❤️",
  hospitality:  "🌿",
  ai:           "🤖",
  finance:      "💰",
  analytics:    "📈",
  platform:     "🔌",
};

/** Total MRR if all standalone modules purchased (theoretical max à la carte) */
export const TOTAL_STANDALONE_PRICE = MODULES
  .filter(m => m.standalonePrice !== null && !m.comingSoon)
  .reduce((s, m) => s + (m.standalonePrice || 0), 0);
