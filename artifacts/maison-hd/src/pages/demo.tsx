import { useState, useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import {
  ChevronRight, ArrowRight, Check, BedDouble, BarChart3,
  MessageSquare, Users, Zap, Globe2, Shield, TrendingUp,
  Calendar, Hotel, Clock, Sparkles, X,
  Wand2, Tv, LayoutDashboard, QrCode, BrainCircuit,
  UtensilsCrossed, Receipt, Printer, Split, Wifi,
  Package, ChefHat, Coins, Building2, AlertCircle,
  Star, ChevronDown, Lock, Database, RefreshCw, ClipboardList,
  Phone, Mail, MapPin, CreditCard, Smartphone, Activity,
  Layers, KeyRound, Bath, Dumbbell, Coffee, Car,
} from "lucide-react";
import { MaisonLogo } from "@/components/MaisonLogo";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_URL = BASE.replace("/maison-hd", "") + "/api";

// ─── Translations ──────────────────────────────────────────────────────────────

const T = {
  en: {
    nav: {
      product: "Product",
      solutions: "Solutions",
      pricing: "Pricing",
      security: "Security",
      faq: "FAQ",
      login: "Sign in",
      demo: "Book a Demo",
    },
    hero: {
      badge: "Hotel · Restaurant · One Platform",
      title: "Maison HD",
      sub: "AI Hospitality Operating System",
      headline: "Beyond just booking.\nBeyond just billing.",
      body: "Maison HD unifies your entire property — PMS, POS, SPA, Housekeeping, Analytics, and AI — into a single intelligent system. One guest. One tab. One platform.",
      cta1: "Book a Demo",
      cta2: "Explore Product",
      tags: ["Hotels & Glamping", "Hotel Restaurants", "SPA Complexes", "Boutique Resorts"],
    },
    stats: [
      { value: "12+", label: "Modules integrated" },
      { value: "48h", label: "Onboarding time" },
      { value: "0", label: "Extra subscriptions needed" },
      { value: "100%", label: "Ukrainian fiscal law" },
    ],
    problems: {
      title: "The old way doesn't work anymore.",
      sub: "Running a hotel with spreadsheets, separate POS systems, and WhatsApp is costing you money and guests.",
      items: [
        { icon: AlertCircle, title: "Reception overload", desc: "Manual check-in, handwritten logs, phone bookings. Every mistake costs a guest." },
        { icon: Layers, title: "Fragmented systems", desc: "PMS here, POS there, SPA somewhere else. No single source of truth." },
        { icon: TrendingUp, title: "No financial visibility", desc: "You don't know your RevPAR, ADR, or food cost until end of month — too late." },
        { icon: MessageSquare, title: "Lost guest communication", desc: "Inquiries spread across email, Viber, Telegram, Booking.com. Someone always misses something." },
        { icon: Clock, title: "Manual housekeeping", desc: "Paper checklists, phone calls to staff. No real-time status on room readiness." },
        { icon: Receipt, title: "Fiscal compliance risk", desc: "Checkbox ПРРО setup is complex. Multiple legal entities make it even harder." },
      ],
    },
    modules: {
      title: "Every tool you need. In one system.",
      sub: "Maison HD covers every aspect of running a modern hospitality business — from the moment a guest books to the final invoice.",
      items: [
        {
          key: "pms",
          icon: BedDouble,
          tag: "Front Desk",
          color: "indigo",
          title: "Reservations & Front Desk",
          desc: "A complete PMS with drag-and-drop chess grid, OTA sync, channel manager, check-in/out automation, and multi-unit management.",
          bullets: ["Drag-and-drop chess board (60-day view)", "OTA sync: Booking.com, Airbnb, Expedia", "Mobile check-in with QR code", "Auto-invoicing at checkout"],
        },
        {
          key: "pos",
          icon: UtensilsCrossed,
          tag: "F&B",
          color: "amber",
          title: "Restaurant POS",
          desc: "Full-featured POS for hotel restaurants and standalone F&B. Tables, orders, kitchen display, and fiscal receipts — all built-in.",
          bullets: ["Table management with visual floor plan", "Kitchen display system (KDS)", "Multi-station printing by zone", "Waiter station app for staff"],
        },
        {
          key: "qr",
          icon: QrCode,
          tag: "Guest Tech",
          color: "emerald",
          title: "QR Ordering & AI Waiter",
          desc: "Guests scan a QR code at the table or in their room. AI-powered waiter recommends dishes, takes orders, processes payment.",
          bullets: ["QR menu with photos and descriptions", "AI-waiter chat recommendations", "Room service via QR in room", "Direct kitchen order routing"],
          hot: true,
        },
        {
          key: "prro",
          icon: Receipt,
          tag: "Fiscal",
          color: "rose",
          title: "Checkbox ПРРО",
          desc: "Built-in fiscal receipts for every payment. Multiple legal entities (ФОП/ТОВ) on one property — each gets the right fiscal receipt automatically.",
          bullets: ["Automatic ПРРО on every payment", "Multiple ФОП/ТОВ per property", "Supports cash, card, LiqPay", "Split payment with correct fiscal routing"],
        },
        {
          key: "spa",
          icon: Bath,
          tag: "SPA",
          color: "violet",
          title: "SPA Management",
          desc: "SPA booking calendar, specialist schedules, service catalog with photos, and online booking directly from the guest portal.",
          bullets: ["Visual appointment calendar", "Specialist availability & slots", "Service catalog with pricing", "Booking charged to room folio"],
          hot: true,
        },
        {
          key: "crm",
          icon: Users,
          tag: "CRM",
          color: "sky",
          title: "Guest CRM",
          desc: "Every guest has a full profile: stay history, preferences, spending, communication log. Build loyalty before and after the visit.",
          bullets: ["Guest profiles with stay history", "Loyalty tracking & repeat visits", "Automated pre-arrival emails", "Upsell offers by guest segment"],
        },
        {
          key: "ai",
          icon: BrainCircuit,
          tag: "AI",
          color: "fuchsia",
          title: "AI Hub",
          desc: "AI assistant for your entire operation. Answers guest questions, generates reports, suggests pricing, and automates communication.",
          bullets: ["AI guest communication", "Revenue & pricing suggestions", "Auto-generated daily reports", "Upsell scenario automation"],
          hot: true,
        },
        {
          key: "hk",
          icon: ClipboardList,
          tag: "Operations",
          color: "teal",
          title: "Housekeeping",
          desc: "Real-time room status, automated task assignment, mobile app for staff, and supervisor overview — end to end.",
          bullets: ["Auto-assign tasks on checkout", "Mobile app for housekeepers", "Real-time room status board", "Supervisor control panel"],
        },
        {
          key: "analytics",
          icon: BarChart3,
          tag: "Analytics",
          color: "orange",
          title: "Revenue Analytics",
          desc: "Owner-level dashboard with RevPAR, ADR, occupancy, F&B revenue, SPA revenue, and forecasting — real time.",
          bullets: ["RevPAR, ADR, Occupancy live", "F&B revenue & food cost", "Staff productivity metrics", "Revenue forecasting"],
        },
        {
          key: "tv",
          icon: Tv,
          tag: "Guest Tech",
          color: "indigo",
          title: "Hotel TV",
          desc: "Digital channel on every TV: personal guest welcome, QR menu, promotions, room services, and hotel info.",
          bullets: ["Personalized guest welcome screen", "QR codes for services", "Promotional content management", "Emergency notifications"],
        },
        {
          key: "inbox",
          icon: MessageSquare,
          tag: "Communication",
          color: "cyan",
          title: "Unified Inbox",
          desc: "All guest messages in one place: SMS, Email, Telegram, Viber, Booking.com — single thread per guest, AI-assisted replies.",
          bullets: ["Omni-channel in one view", "AI-suggested responses", "Auto-replies for common questions", "Guest portal chat"],
        },
        {
          key: "auto",
          icon: Zap,
          tag: "Automation",
          color: "yellow",
          title: "Automation Engine",
          desc: "Build workflows without code: pre-arrival reminders, post-checkout reviews, housekeeping triggers, upsell sequences.",
          bullets: ["Visual workflow builder", "Trigger-based automation", "Pre-arrival & post-checkout flows", "Revenue upsell sequences"],
        },
        {
          key: "wb",
          icon: Globe2,
          tag: "OTA",
          color: "green",
          title: "OTA & Channel Manager",
          desc: "Keep availability and pricing in sync across all channels. One inventory — no overbooking, no manual updates.",
          bullets: ["Booking.com, Airbnb, Expedia", "Real-time inventory sync", "Dynamic pricing by channel", "Revenue management tools"],
        },
        {
          key: "fiscal",
          icon: CreditCard,
          tag: "Finance",
          color: "slate",
          title: "Finance & Invoicing",
          desc: "Full accounting trail: guest folios, group invoices, advance payments, payment links, and reconciliation reports.",
          bullets: ["Guest folio management", "PDF invoices with legal entity", "LiqPay payment links", "Financial reconciliation"],
        },
      ],
    },
    compare: {
      title: "Why teams switch to Maison HD",
      sub: "Other tools do one thing. Maison HD does everything — with no compromises.",
      them: "Other tools",
      us: "Maison HD",
      rows: [
        { label: "PMS + POS unified", them: false, us: true },
        { label: "Built-in Checkbox ПРРО", them: false, us: true },
        { label: "Multiple ФОП/ТОВ on one property", them: false, us: true },
        { label: "SPA booking integrated", them: false, us: true },
        { label: "QR ordering with AI waiter", them: false, us: true },
        { label: "Hotel TV digital channel", them: false, us: true },
        { label: "No per-device pricing", them: false, us: true },
        { label: "48h onboarding", them: false, us: true },
      ],
    },
    pricing: {
      title: "Simple, transparent pricing.",
      sub: "One subscription. All modules. No hidden fees.",
      monthly: "/ month",
      popular: "Most popular",
      cta: "Get started",
      contactCta: "Contact sales",
      plans: [
        {
          name: "START",
          price: "$99",
          desc: "For small properties or getting started",
          limit: "Up to 15 units",
          color: "emerald",
          features: [
            "Core PMS (bookings, check-in/out)",
            "Chess grid calendar",
            "Guest profiles & CRM",
            "Basic analytics dashboard",
            "Email & Telegram notifications",
            "Guest portal (web check-in)",
            "Up to 3 staff accounts",
          ],
        },
        {
          name: "GROWTH",
          price: "$199",
          desc: "Full system for growing properties",
          limit: "Up to 50 units",
          color: "indigo",
          hot: true,
          features: [
            "Everything in START",
            "F&B POS with kitchen display",
            "QR ordering & AI waiter",
            "Checkbox ПРРО (multiple legal entities)",
            "SPA management module",
            "Housekeeping automation",
            "OTA sync & channel manager",
            "Unified Inbox (omni-channel)",
            "AI Hub (basic)",
            "Up to 15 staff accounts",
          ],
        },
        {
          name: "SCALE",
          price: "$399",
          desc: "Maximum automation for large properties",
          limit: "Unlimited units",
          color: "violet",
          features: [
            "Everything in GROWTH",
            "Advanced AI (pricing + upsell)",
            "Hotel TV digital channel",
            "Multi-property / HQ dashboard",
            "Revenue forecasting",
            "Custom automation workflows",
            "Priority support (24/7)",
            "Dedicated onboarding manager",
            "Unlimited staff accounts",
            "API access",
          ],
        },
      ],
    },
    faq: {
      title: "Common questions",
      items: [
        { q: "How long does onboarding take?", a: "Most properties are fully operational within 48 hours. Our onboarding wizard guides you step by step — no IT team needed." },
        { q: "Can I use multiple legal entities (ФОП/ТОВ) on one property?", a: "Yes. Maison HD supports multiple legal entities per property. Each entity gets its own ПРРО key, and fiscal receipts are automatically routed to the correct entity based on the payment type." },
        { q: "Does it work with Booking.com and Airbnb?", a: "Yes. The OTA sync module connects with major channels. Availability and pricing stay in sync in real time — no overbooking risk." },
        { q: "Is Checkbox ПРРО included?", a: "Yes, built-in. No separate contract, no extra fee. You add your Checkbox API key in the legal entity settings, and the system handles the rest." },
        { q: "Can staff use it on mobile?", a: "Absolutely. Housekeeping, waiter station, and reception all have mobile-optimized interfaces. No app download needed — it's a PWA." },
        { q: "What if I only need PMS, not the restaurant?", a: "Modules are independent. You activate what you need. The START plan covers full PMS functionality without any F&B modules." },
      ],
    },
    form: {
      title: "See it in action.",
      sub: "Book a personalized demo. We'll show you your property running on Maison HD.",
      name: "Your name",
      email: "Work email",
      phone: "Phone",
      company: "Property / Company name",
      count: "Number of units",
      message: "Anything you'd like us to know?",
      submit: "Request Demo",
      submitting: "Sending...",
      successTitle: "Request received!",
      successBody: "We'll reach out within 24 hours to schedule your personalized demo.",
    },
    footer: {
      desc: "AI-powered hospitality operating system for hotels, resorts, and F&B businesses.",
      product: "Product",
      links: ["Features", "Pricing", "Security", "Changelog"],
      company: ["About", "Contact", "Privacy Policy", "Terms of Use"],
      copy: "© 2026 Maison HD. All rights reserved.",
    },
  },

  ua: {
    nav: {
      product: "Продукт",
      solutions: "Рішення",
      pricing: "Ціни",
      security: "Безпека",
      faq: "FAQ",
      login: "Увійти",
      demo: "Записатися на демо",
    },
    hero: {
      badge: "Готель · Ресторан · Єдина платформа",
      title: "Maison HD",
      sub: "AI-система управління готельним бізнесом",
      headline: "Більше, ніж PMS.\nБільше, ніж POS.",
      body: "Maison HD об'єднує весь ваш об'єкт — PMS, POS, SPA, Прибирання, Аналітику та AI — в єдину розумну систему. Один гість. Один рахунок. Одна платформа.",
      cta1: "Записатися на демо",
      cta2: "Переглянути продукт",
      tags: ["Готелі та глемпінги", "Ресторани при готелі", "SPA-комплекси", "Бутик-курорти"],
    },
    stats: [
      { value: "12+", label: "Інтегрованих модулів" },
      { value: "48г", label: "Час підключення" },
      { value: "0", label: "Зайвих підписок" },
      { value: "100%", label: "Українська фіскалізація" },
    ],
    problems: {
      title: "Старий підхід більше не працює.",
      sub: "Вести готель на Excel, окремому POS-і та WhatsApp-групах — це коштує грошей і гостей.",
      items: [
        { icon: AlertCircle, title: "Перевантажена рецепція", desc: "Ручний заїзд, паперові журнали, бронювання по телефону. Кожна помилка — це втрачений гість." },
        { icon: Layers, title: "Розрізнені системи", desc: "PMS тут, POS там, SPA десь окремо. Жодного єдиного джерела правди." },
        { icon: TrendingUp, title: "Відсутність фінансового контролю", desc: "RevPAR, ADR, фудкост — ви дізнаєтесь наприкінці місяця, коли вже запізно." },
        { icon: MessageSquare, title: "Втрачений контакт з гостем", desc: "Запити розкидані по Email, Viber, Telegram, Booking.com. Хтось завжди щось пропускає." },
        { icon: Clock, title: "Ручне прибирання", desc: "Паперові чек-листи, дзвінки персоналу. Немає реального статусу готовності кімнат." },
        { icon: Receipt, title: "Ризики з фіскалізацією", desc: "Checkbox ПРРО — окремий договір. Кілька юр. осіб — окремі ключі. Все вручну." },
      ],
    },
    modules: {
      title: "Всі інструменти. В одній системі.",
      sub: "Maison HD охоплює кожен аспект сучасного готельного бізнесу — від першого бронювання до фінального рахунку.",
      items: [
        {
          key: "pms",
          icon: BedDouble,
          tag: "Рецепція",
          color: "indigo",
          title: "Бронювання та рецепція",
          desc: "Повноцінна PMS з drag-and-drop шахматкою, OTA-синхронізацією, управлінням номерами та автоматизацією заїзду/виїзду.",
          bullets: ["Шахматка бронювань (60-денний вид)", "OTA-синк: Booking.com, Airbnb, Expedia", "Мобільний заїзд за QR-кодом", "Автоматичний рахунок при виїзді"],
        },
        {
          key: "pos",
          icon: UtensilsCrossed,
          tag: "F&B",
          color: "amber",
          title: "POS-каса ресторану",
          desc: "Повноцінна каса для ресторанів при готелі та окремих закладів. Столи, замовлення, кухонний дисплей, фіскальні чеки — все вбудовано.",
          bullets: ["Управління столами з планом залу", "Кухонний дисплей (KDS)", "Мультистанційний друк по зонах", "Станція офіціанта на планшеті"],
        },
        {
          key: "qr",
          icon: QrCode,
          tag: "Технології",
          color: "emerald",
          title: "QR-замовлення та AI-офіціант",
          desc: "Гість сканує QR-код зі столу або номера. AI-офіціант рекомендує страви, приймає замовлення і проводить оплату.",
          bullets: ["QR-меню з фото та описами", "AI-чат з рекомендаціями", "Room service через QR в номері", "Замовлення одразу на кухню"],
          hot: true,
        },
        {
          key: "prro",
          icon: Receipt,
          tag: "Фіскалізація",
          color: "rose",
          title: "Checkbox ПРРО",
          desc: "Вбудовані фіскальні чеки при кожній оплаті. Кілька юридичних осіб (ФОП/ТОВ) на одному об'єкті — кожна отримує правильний чек автоматично.",
          bullets: ["Автоматичний ПРРО при кожній оплаті", "Кілька ФОП/ТОВ на одному об'єкті", "Готівка, картка, LiqPay", "Роздільна фіскалізація за юр. особою"],
        },
        {
          key: "spa",
          icon: Bath,
          tag: "SPA",
          color: "violet",
          title: "Управління SPA",
          desc: "Календар SPA-записів, розклади спеціалістів, каталог послуг з фото, та онлайн-бронювання прямо з гостьового порталу.",
          bullets: ["Візуальний календар записів", "Доступність спеціалістів та слоти", "Каталог послуг з цінами", "Нарахування на рахунок номера"],
          hot: true,
        },
        {
          key: "crm",
          icon: Users,
          tag: "CRM",
          color: "sky",
          title: "CRM гостей",
          desc: "Повний профіль кожного гостя: історія проживань, вподобання, витрати, журнал комунікацій. Будуйте лояльність до і після візиту.",
          bullets: ["Профілі гостей з історією", "Відстеження лояльності та повторних візитів", "Автоматичні листи до заїзду", "Upsell-пропозиції по сегментах"],
        },
        {
          key: "ai",
          icon: BrainCircuit,
          tag: "AI",
          color: "fuchsia",
          title: "AI Hub",
          desc: "AI-асистент для всієї операції. Відповідає гостям, генерує звіти, пропонує ціни та автоматизує комунікації.",
          bullets: ["AI-комунікація з гостями", "Рекомендації щодо доходу та ціноутворення", "Автоматично згенеровані щоденні звіти", "Автоматизація upsell-сценаріїв"],
          hot: true,
        },
        {
          key: "hk",
          icon: ClipboardList,
          tag: "Операції",
          color: "teal",
          title: "Housekeeping",
          desc: "Статус номерів в реальному часі, автоматичне призначення задач, мобільний застосунок для персоналу, контроль супервайзера.",
          bullets: ["Автопризначення задач при виїзді", "Мобільний застосунок для покоївок", "Статусна дошка в реальному часі", "Панель контролю супервайзера"],
        },
        {
          key: "analytics",
          icon: BarChart3,
          tag: "Аналітика",
          color: "orange",
          title: "Аналітика та дохід",
          desc: "Дашборд власника з RevPAR, ADR, завантаженістю, доходом F&B та SPA, та прогнозуванням — в реальному часі.",
          bullets: ["RevPAR, ADR, Occupancy онлайн", "Дохід F&B та фудкост", "Метрики продуктивності персоналу", "Прогнозування доходу"],
        },
        {
          key: "tv",
          icon: Tv,
          tag: "Технології",
          color: "indigo",
          title: "Hotel TV",
          desc: "Цифровий канал на кожному телевізорі: персональне вітання, QR-меню, акції, сервіси та інформація про готель.",
          bullets: ["Персональний екран вітання", "QR-коди для сервісів", "Керування промо-контентом", "Термінові сповіщення"],
        },
        {
          key: "inbox",
          icon: MessageSquare,
          tag: "Комунікація",
          color: "cyan",
          title: "Unified Inbox",
          desc: "Всі повідомлення гостей в одному місці: SMS, Email, Telegram, Viber, Booking.com — один потік на гостя, AI-підказки для відповідей.",
          bullets: ["Омніканальність в одному вікні", "AI-пропозиції відповідей", "Автовідповіді на часті питання", "Чат гостьового порталу"],
        },
        {
          key: "auto",
          icon: Zap,
          tag: "Автоматизація",
          color: "yellow",
          title: "Автоматизація",
          desc: "Будуйте сценарії без коду: нагадування до заїзду, відгуки після виїзду, тригери прибирання, upsell-послідовності.",
          bullets: ["Візуальний конструктор сценаріїв", "Тригерна автоматизація", "До/після заїзду потоки", "Upsell-послідовності доходу"],
        },
        {
          key: "wb",
          icon: Globe2,
          tag: "OTA",
          color: "green",
          title: "OTA та Channel Manager",
          desc: "Доступність і ціни синхронізовані на всіх майданчиках. Один інвентар — жодного овербукінгу, жодних ручних оновлень.",
          bullets: ["Booking.com, Airbnb, Expedia", "Синхронізація інвентарю в реальному часі", "Динамічне ціноутворення по каналах", "Інструменти revenue management"],
        },
        {
          key: "fiscal",
          icon: CreditCard,
          tag: "Фінанси",
          color: "slate",
          title: "Фінанси та рахунки",
          desc: "Повний облік: рахунок гостя, групові рахунки, аванси, платіжні лінки та звіти звірки.",
          bullets: ["Управління рахунком гостя", "PDF-рахунки з юр. особою", "Платіжні лінки LiqPay", "Фінансова звірка"],
        },
      ],
    },
    compare: {
      title: "Чому обирають Maison HD",
      sub: "Інші інструменти роблять одне. Maison HD робить все — без компромісів.",
      them: "Інші рішення",
      us: "Maison HD",
      rows: [
        { label: "PMS + POS в одній системі", them: false, us: true },
        { label: "Вбудований Checkbox ПРРО", them: false, us: true },
        { label: "Кілька ФОП/ТОВ на одному об'єкті", them: false, us: true },
        { label: "SPA-бронювання інтегровано", them: false, us: true },
        { label: "QR-замовлення з AI-офіціантом", them: false, us: true },
        { label: "Hotel TV цифровий канал", them: false, us: true },
        { label: "Без оплати за кожен пристрій", them: false, us: true },
        { label: "Підключення за 48 годин", them: false, us: true },
      ],
    },
    pricing: {
      title: "Прозора ціна. Без сюрпризів.",
      sub: "Одна підписка. Всі модулі. Без прихованих платежів.",
      monthly: "/ місяць",
      popular: "Найпопулярніший",
      cta: "Розпочати",
      contactCta: "Зв'язатися",
      plans: [
        {
          name: "START",
          price: "$99",
          desc: "Для невеликих об'єктів або старту",
          limit: "До 15 юнітів",
          color: "emerald",
          features: [
            "Базова PMS (бронювання, заїзд/виїзд)",
            "Шахматка бронювань",
            "Профілі та CRM гостей",
            "Базовий дашборд аналітики",
            "Email та Telegram сповіщення",
            "Гостьовий портал (онлайн заїзд)",
            "До 3 облікових записів персоналу",
          ],
        },
        {
          name: "GROWTH",
          price: "$199",
          desc: "Повна система для зростаючих об'єктів",
          limit: "До 50 юнітів",
          color: "indigo",
          hot: true,
          features: [
            "Все з START",
            "POS-каса ресторану з кухонним дисплеєм",
            "QR-замовлення та AI-офіціант",
            "Checkbox ПРРО (кілька юр. осіб)",
            "Модуль управління SPA",
            "Автоматизація housekeeping",
            "OTA-синк та channel manager",
            "Unified Inbox (омніканальність)",
            "AI Hub (базовий)",
            "До 15 облікових записів персоналу",
          ],
        },
        {
          name: "SCALE",
          price: "$399",
          desc: "Максимальна автоматизація для великих об'єктів",
          limit: "Необмежена кількість юнітів",
          color: "violet",
          features: [
            "Все з GROWTH",
            "Розширений AI (ціноутворення + upsell)",
            "Hotel TV цифровий канал",
            "Мультиоб'єктний / HQ дашборд",
            "Прогнозування доходу",
            "Кастомні сценарії автоматизації",
            "Пріоритетна підтримка (24/7)",
            "Персональний менеджер онбордингу",
            "Необмежена кількість акаунтів персоналу",
            "API-доступ",
          ],
        },
      ],
    },
    faq: {
      title: "Часті запитання",
      items: [
        { q: "Скільки часу займає підключення?", a: "Більшість об'єктів повністю запускаються протягом 48 годин. Майстер налаштування веде вас крок за кроком — без ІТ-команди." },
        { q: "Чи можна мати кілька юр. осіб (ФОП/ТОВ) на одному об'єкті?", a: "Так. Maison HD підтримує кілька юридичних осіб на одному об'єкті. Кожна отримує власний ключ ПРРО, і фіскальні чеки автоматично маршрутизуються на правильну юр. особу залежно від типу оплати." },
        { q: "Чи працює з Booking.com та Airbnb?", a: "Так. Модуль OTA-синхронізації підключається до основних каналів. Доступність і ціни синхронізуються в реальному часі — без ризику овербукінгу." },
        { q: "Чи включено Checkbox ПРРО?", a: "Так, вбудовано. Жодного окремого договору, жодних додаткових платежів. Ви додаєте API-ключ Checkbox у налаштуваннях юр. особи, і система робить все інше." },
        { q: "Чи може персонал використовувати на мобільному?", a: "Так. Housekeeping, станція офіціанта та рецепція мають мобільно-оптимізовані інтерфейси. Без завантаження застосунку — це PWA." },
        { q: "А якщо мені потрібна тільки PMS без ресторану?", a: "Модулі незалежні. Ви активуєте те, що потрібно. Тариф START покриває повну функціональність PMS без F&B модулів." },
      ],
    },
    form: {
      title: "Подивіться в дії.",
      sub: "Запишіться на персональне демо. Ми покажемо ваш об'єкт на Maison HD.",
      name: "Ваше ім'я",
      email: "Робочий email",
      phone: "Телефон",
      company: "Назва об'єкту / компанії",
      count: "Кількість юнітів (номерів)",
      message: "Розкажіть про ваш об'єкт",
      submit: "Записатися на демо",
      submitting: "Відправляємо...",
      successTitle: "Заявку отримано!",
      successBody: "Ми зв'яжемося з вами протягом 24 годин для погодження часу персонального демо.",
    },
    footer: {
      desc: "AI-система управління готельним бізнесом для готелів, курортів та ресторанів.",
      product: "Продукт",
      links: ["Функції", "Ціни", "Безпека", "Оновлення"],
      company: ["Про нас", "Контакти", "Політика конфіденційності", "Умови використання"],
      copy: "© 2026 Maison HD. Всі права захищені.",
    },
  },
};

// ─── Color maps ──────────────────────────────────────────────────────────────

const COLOR: Record<string, { bg: string; border: string; text: string; tag: string; check: string }> = {
  indigo:  { bg: "bg-indigo-500/10",  border: "border-indigo-500/20",  text: "text-indigo-400",  tag: "bg-indigo-500/15 text-indigo-300",  check: "text-indigo-400" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/20",   text: "text-amber-400",   tag: "bg-amber-500/15 text-amber-300",    check: "text-amber-400" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", tag: "bg-emerald-500/15 text-emerald-300", check: "text-emerald-400" },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/20",    text: "text-rose-400",    tag: "bg-rose-500/15 text-rose-300",      check: "text-rose-400" },
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-500/20",  text: "text-violet-400",  tag: "bg-violet-500/15 text-violet-300",  check: "text-violet-400" },
  sky:     { bg: "bg-sky-500/10",     border: "border-sky-500/20",     text: "text-sky-400",     tag: "bg-sky-500/15 text-sky-300",        check: "text-sky-400" },
  fuchsia: { bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/20", text: "text-fuchsia-400", tag: "bg-fuchsia-500/15 text-fuchsia-300", check: "text-fuchsia-400" },
  teal:    { bg: "bg-teal-500/10",    border: "border-teal-500/20",    text: "text-teal-400",    tag: "bg-teal-500/15 text-teal-300",      check: "text-teal-400" },
  orange:  { bg: "bg-orange-500/10",  border: "border-orange-500/20",  text: "text-orange-400",  tag: "bg-orange-500/15 text-orange-300",  check: "text-orange-400" },
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/20",    text: "text-cyan-400",    tag: "bg-cyan-500/15 text-cyan-300",      check: "text-cyan-400" },
  yellow:  { bg: "bg-yellow-500/10",  border: "border-yellow-500/20",  text: "text-yellow-400",  tag: "bg-yellow-500/15 text-yellow-300",  check: "text-yellow-400" },
  green:   { bg: "bg-green-500/10",   border: "border-green-500/20",   text: "text-green-400",   tag: "bg-green-500/15 text-green-300",    check: "text-green-400" },
  slate:   { bg: "bg-slate-500/10",   border: "border-slate-500/20",   text: "text-slate-400",   tag: "bg-slate-500/15 text-slate-300",    check: "text-slate-400" },
};

const PLAN_COLOR: Record<string, { accent: string; border: string; badge: string; check: string; btn: string }> = {
  emerald: { accent: "text-emerald-400", border: "border-emerald-500/30", badge: "bg-emerald-500/10 text-emerald-400", check: "text-emerald-400", btn: "bg-emerald-600 hover:bg-emerald-500" },
  indigo:  { accent: "text-indigo-300",  border: "border-indigo-500/40",  badge: "bg-indigo-500/20 text-indigo-300",  check: "text-indigo-400",  btn: "bg-indigo-600 hover:bg-indigo-500" },
  violet:  { accent: "text-violet-400",  border: "border-violet-500/30",  badge: "bg-violet-500/10 text-violet-400",  check: "text-violet-400",  btn: "bg-violet-600 hover:bg-violet-500" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useVisible(ref: React.RefObject<HTMLElement | null>) {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.1 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return vis;
}

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const vis = useVisible(ref as any);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: vis ? 1 : 0,
        transform: vis ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

const KPI = [
  { label: "Дохід", value: "₴277 200", delta: "+18%" },
  { label: "Завантаженість", value: "87%", delta: "+4%" },
  { label: "ADR", value: "₴2 850", delta: "+11%" },
  { label: "RevPAR", value: "₴2 480", delta: "+9%" },
];

const CHESS_CELLS = [
  ["ci","oc","oc","av","av","ci","oc","oc","av","av","ci","oc"],
  ["oc","oc","av","av","ci","oc","oc","oc","ci","ci","oc","av"],
  ["av","ci","ci","oc","oc","av","ci","ci","oc","av","av","ci"],
  ["ci","oc","oc","av","ci","ci","oc","av","av","ci","oc","oc"],
  ["oc","av","ci","ci","oc","oc","av","ci","oc","oc","av","ci"],
];
const CELL_CLR: Record<string, string> = {
  ci: "bg-emerald-500/75", oc: "bg-indigo-500/65", av: "bg-white/6",
};

// ─── Dashboard Mockup ────────────────────────────────────────────────────────

function DashboardMockup() {
  return (
    <div className="relative w-full">
      <div className="absolute -inset-6 bg-indigo-600/15 blur-3xl rounded-3xl pointer-events-none" />
      <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60 bg-[#1a1d2e]">
        <div className="flex items-center gap-2 px-4 py-3 bg-[#12141f] border-b border-white/5">
          <span className="w-3 h-3 rounded-full bg-red-400/70" />
          <span className="w-3 h-3 rounded-full bg-amber-400/70" />
          <span className="w-3 h-3 rounded-full bg-emerald-400/70" />
          <div className="flex-1 mx-3 h-5 bg-white/5 rounded-full flex items-center px-3">
            <span className="text-[10px] text-white/30">maisonhd.app/dashboard</span>
          </div>
        </div>
        <div className="flex h-[400px]">
          <div className="w-12 bg-[#12141f] border-r border-white/5 flex flex-col items-center py-4 gap-3">
            <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center">
              <BedDouble className="w-3.5 h-3.5 text-white" />
            </div>
            {[BarChart3, Calendar, Users, MessageSquare, UtensilsCrossed, Bath].map((Icon, i) => (
              <div key={i} className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
                <Icon className="w-3 h-3 text-white/35" />
              </div>
            ))}
          </div>
          <div className="flex-1 overflow-hidden p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">Owner Dashboard</div>
                <div className="text-[10px] text-white/30">DOGODA RESORT · April 2026</div>
              </div>
              <div className="flex gap-1.5">
                <div className="h-6 px-2.5 bg-indigo-600 rounded-lg flex items-center text-[10px] text-white font-semibold">Today</div>
                <div className="h-6 px-2.5 bg-white/5 rounded-lg flex items-center text-[10px] text-white/40">Week</div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {KPI.map((k, i) => (
                <div key={i} className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                  <div className="text-[9px] text-white/40 mb-1">{k.label}</div>
                  <div className="text-xs font-black text-white leading-tight">{k.value}</div>
                  <div className="text-[9px] font-bold mt-1 text-emerald-400">{k.delta}</div>
                </div>
              ))}
            </div>
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-semibold text-white/60">Revenue trend</span>
                <span className="text-[10px] text-emerald-400 font-bold">+18% YoY</span>
              </div>
              <div className="flex items-end gap-1 h-12">
                {[40, 55, 45, 70, 62, 80, 75, 90, 85, 100, 88, 95].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end">
                    <div style={{ height: `${h}%` }} className={`rounded-sm ${i === 11 ? "bg-indigo-500" : i > 8 ? "bg-indigo-500/55" : "bg-white/12"}`} />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-semibold text-white/60">Booking grid</span>
                <div className="flex gap-1.5">
                  <span className="flex items-center gap-1 text-[8px] text-white/30"><span className="w-2 h-2 rounded-sm bg-emerald-500/75 inline-block"/>Check-in</span>
                  <span className="flex items-center gap-1 text-[8px] text-white/30"><span className="w-2 h-2 rounded-sm bg-indigo-500/65 inline-block"/>Occupied</span>
                </div>
              </div>
              <div className="space-y-0.5">
                {CHESS_CELLS.slice(0, 4).map((row, ri) => (
                  <div key={ri} className="flex gap-0.5">
                    <div className="w-8 shrink-0 text-[7px] text-white/20 flex items-center">#{ri + 101}</div>
                    {row.map((c, ci) => (
                      <div key={ci} className={`flex-1 h-3.5 rounded-[2px] ${CELL_CLR[c]}`} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/8">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-5 text-left gap-4"
      >
        <span className="text-base font-semibold text-white/90">{q}</span>
        <ChevronDown className={`w-5 h-5 text-white/40 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p className="pb-5 text-sm text-white/50 leading-relaxed">{a}</p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DemoPage() {
  const [lang, setLang] = useState<"en" | "ua">("ua");
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", propertiesCount: "1", message: "" });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const t = T[lang];

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const FOOTER_LINKS: Record<string, string> = {
    "Features": "features", "Функції": "features",
    "Pricing": "pricing",   "Ціни": "pricing",
    "Security": "security", "Безпека": "security",
    "Changelog": "modules", "Оновлення": "modules",
    "About": "modules",     "Про нас": "modules",
    "Contact": "contact",   "Контакти": "contact",
    "Privacy Policy": "faq","Політика конфіденційності": "faq",
    "Terms of Use": "faq",  "Умови використання": "faq",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.company.trim()) {
      toast({ title: lang === "ua" ? "Заповніть обов'язкові поля" : "Fill required fields", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/demo-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, propertiesCount: parseInt(form.propertiesCount) || 1, source: "landing_page" }),
      });
      if (!res.ok) throw new Error("error");
      setSubmitted(true);
    } catch {
      toast({ title: lang === "ua" ? "Помилка відправки" : "Submission error", description: "info@maisonhd.com", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060a14] text-white antialiased overflow-x-hidden">

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 h-16 bg-[#060a14]/85 backdrop-blur-xl border-b border-white/[0.06]">
        <MaisonLogo size={32} textVariant="dark" />
        <div className="hidden lg:flex items-center gap-7 text-sm text-white/45">
          {[
            [t.nav.product, "#modules"],
            [t.nav.pricing, "#pricing"],
            [t.nav.security, "#security"],
            ["FAQ", "#faq"],
          ].map(([l, h]) => (
            <a key={l} href={h} className="hover:text-white transition-colors">{l}</a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {/* Language switcher */}
          <div className="flex items-center rounded-lg border border-white/10 overflow-hidden text-xs font-semibold">
            <button
              onClick={() => setLang("ua")}
              className={`px-3 py-1.5 transition-colors ${lang === "ua" ? "bg-white/10 text-white" : "text-white/35 hover:text-white/60"}`}
            >
              UA
            </button>
            <button
              onClick={() => setLang("en")}
              className={`px-3 py-1.5 transition-colors ${lang === "en" ? "bg-white/10 text-white" : "text-white/35 hover:text-white/60"}`}
            >
              EN
            </button>
          </div>
          <a href={`${BASE}/login`} className="text-sm text-white/40 hover:text-white transition-colors hidden md:block px-3 py-1.5">
            {t.nav.login}
          </a>
          <a
            href="#contact"
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/25"
          >
            {t.nav.demo} <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[700px] bg-indigo-600/8 blur-[140px] rounded-full" />
          <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-violet-600/6 blur-[120px] rounded-full" />
          <div className="absolute inset-0 opacity-[0.025]"
            style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.6) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 py-20 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-white/55 font-medium mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              {t.hero.badge}
            </div>
            <h1 className="text-6xl md:text-7xl font-black leading-[1.0] tracking-tight mb-3">
              <span className="bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-white/60">{t.hero.title}</span>
            </h1>
            <p className="text-xl md:text-2xl font-light text-indigo-300/70 mb-6">{t.hero.sub}</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-5 leading-tight whitespace-pre-line">{t.hero.headline}</h2>
            <p className="text-base text-white/45 leading-relaxed mb-8 max-w-lg">{t.hero.body}</p>
            <div className="flex flex-wrap gap-2 mb-10">
              {t.hero.tags.map(tag => (
                <span key={tag} className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/8 text-xs text-white/45">{tag}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <a href="#contact" className="flex items-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-2xl transition-all shadow-xl shadow-indigo-600/30 hover:-translate-y-0.5">
                {t.hero.cta1} <ArrowRight className="w-4 h-4" />
              </a>
              <a href="#modules" className="flex items-center gap-2 px-6 py-3.5 bg-white/6 hover:bg-white/10 text-white/70 hover:text-white text-sm font-semibold rounded-2xl border border-white/10 transition-all hover:-translate-y-0.5">
                {t.hero.cta2}
              </a>
            </div>
          </div>
          <FadeIn delay={200}>
            <DashboardMockup />
          </FadeIn>
        </div>

        {/* Stats bar */}
        <div className="relative z-10 border-t border-white/6 bg-white/[0.02] backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 md:px-12 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
            {t.stats.map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl font-black text-white mb-1">{s.value}</div>
                <div className="text-xs text-white/40">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROBLEMS ────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6 md:px-12 max-w-7xl mx-auto">
        <FadeIn>
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">{t.problems.title}</h2>
            <p className="text-lg text-white/40 max-w-2xl mx-auto">{t.problems.sub}</p>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {t.problems.items.map((item, i) => (
            <FadeIn key={i} delay={i * 80}>
              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/8 hover:border-white/15 transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                  <item.icon className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="font-bold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{item.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
        {/* Solution bridge */}
        <FadeIn delay={200}>
          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-indigo-600/15 border border-indigo-500/25">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <span className="text-indigo-200 font-semibold">
                {lang === "ua" ? "Maison HD вирішує всі ці проблеми в одній системі." : "Maison HD solves all of this in one system."}
              </span>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── MODULES ─────────────────────────────────────────────────────── */}
      <section id="modules" className="py-24 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-white/55 font-medium mb-5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                {lang === "ua" ? "14 інтегрованих модулів" : "14 integrated modules"}
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4">{t.modules.title}</h2>
              <p className="text-lg text-white/40 max-w-2xl mx-auto">{t.modules.sub}</p>
            </div>
          </FadeIn>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {t.modules.items.map((mod, i) => {
              const c = COLOR[mod.color] || COLOR.indigo;
              return (
                <FadeIn key={mod.key} delay={i * 50}>
                  <div className={`relative p-5 rounded-2xl bg-white/[0.03] border ${c.border} hover:bg-white/[0.05] transition-all group h-full flex flex-col`}>
                    {mod.hot && (
                      <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-[10px] font-bold text-indigo-300">
                        {lang === "ua" ? "Нове" : "New"}
                      </div>
                    )}
                    <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center mb-4 shrink-0`}>
                      <mod.icon className={`w-5 h-5 ${c.text}`} />
                    </div>
                    <div className={`inline-flex w-fit px-2 py-0.5 rounded-md text-[10px] font-semibold ${c.tag} mb-2`}>
                      {mod.tag}
                    </div>
                    <h3 className="font-bold text-white mb-2 text-sm leading-snug">{mod.title}</h3>
                    <p className="text-xs text-white/40 leading-relaxed mb-4 flex-1">{mod.desc}</p>
                    <ul className="space-y-1.5">
                      {mod.bullets.map((b, j) => (
                        <li key={j} className="flex items-start gap-2 text-xs text-white/50">
                          <Check className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${c.check}`} />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── COMPARE ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 md:px-12 bg-white/[0.015]">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4">{t.compare.title}</h2>
              <p className="text-lg text-white/40">{t.compare.sub}</p>
            </div>
          </FadeIn>
          <FadeIn delay={100}>
            <div className="rounded-2xl overflow-hidden border border-white/10">
              <div className="grid grid-cols-3 bg-white/5 px-6 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">
                <div className="col-span-1">{lang === "ua" ? "Функція" : "Feature"}</div>
                <div className="text-center">{t.compare.them}</div>
                <div className="text-center text-indigo-300">{t.compare.us}</div>
              </div>
              {t.compare.rows.map((row, i) => (
                <div key={i} className={`grid grid-cols-3 px-6 py-4 items-center border-t border-white/6 ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
                  <div className="text-sm text-white/70 font-medium">{row.label}</div>
                  <div className="text-center">
                    <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
                      <X className="w-3 h-3 text-red-400" />
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── SECURITY ────────────────────────────────────────────────────── */}
      <section id="security" className="py-24 px-6 md:px-12 max-w-7xl mx-auto">
        <FadeIn>
          <div className="text-center mb-14">
            <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-5">
              <Shield className="w-7 h-7 text-indigo-400" />
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
              {lang === "ua" ? "Безпека і надійність" : "Security & Reliability"}
            </h2>
            <p className="text-lg text-white/40 max-w-xl mx-auto">
              {lang === "ua"
                ? "Maison HD розроблений з урахуванням захисту даних ваших гостей і безперебійної роботи вашого бізнесу."
                : "Maison HD is built with your guest data protection and business continuity in mind."}
            </p>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: KeyRound, color: "indigo", title: lang === "ua" ? "Рольовий доступ" : "Role-based access", desc: lang === "ua" ? "Власник, менеджер, ресепшн, покоївка, офіціант — кожна роль бачить лише своє." : "Owner, manager, reception, housekeeping, waiter — each role sees only what they need." },
            { icon: Database, color: "teal", title: lang === "ua" ? "Розподіл даних" : "Data isolation", desc: lang === "ua" ? "Кожен орендар працює у власному ізольованому просторі. Дані ніколи не змішуються між об'єктами." : "Each tenant operates in its own isolated space. Data is never mixed between properties." },
            { icon: RefreshCw, color: "emerald", title: lang === "ua" ? "Резервні копії" : "Automated backups", desc: lang === "ua" ? "Автоматичне резервне копіювання даних. Відновлення в кілька кліків." : "Automatic data backups at regular intervals. Restore in a few clicks." },
            { icon: ClipboardList, color: "amber", title: lang === "ua" ? "Журнал аудиту" : "Audit logs", desc: lang === "ua" ? "Кожна дія в системі записується — хто, коли, що змінив. Прозорість на кожному рівні." : "Every action in the system is logged — who, when, what changed. Full transparency at every level." },
            { icon: Lock, color: "rose", title: lang === "ua" ? "Шифрування даних" : "Data encryption", desc: lang === "ua" ? "Дані гостей зберігаються в зашифрованому вигляді. HTTPS на всіх з'єднаннях." : "Guest data is stored encrypted. HTTPS on all connections." },
            { icon: Wifi, color: "sky", title: lang === "ua" ? "PWA — без залежності від сервера" : "PWA — offline capable", desc: lang === "ua" ? "Система доступна як прогресивний веб-застосунок. Основні функції доступні навіть при нестабільному з'єднанні." : "Works as a progressive web app. Core features remain available even on unstable connections." },
          ].map((item, i) => {
            const c = COLOR[item.color] || COLOR.indigo;
            return (
              <FadeIn key={i} delay={i * 70}>
                <div className={`p-6 rounded-2xl bg-white/[0.03] border ${c.border} h-full`}>
                  <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center mb-4`}>
                    <item.icon className={`w-5 h-5 ${c.text}`} />
                  </div>
                  <h3 className="font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">{item.desc}</p>
                </div>
              </FadeIn>
            );
          })}
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 md:px-12 bg-white/[0.015]">
        <div className="max-w-7xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4">{t.pricing.title}</h2>
              <p className="text-lg text-white/40">{t.pricing.sub}</p>
            </div>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {t.pricing.plans.map((plan, i) => {
              const c = PLAN_COLOR[plan.color] || PLAN_COLOR.indigo;
              const isHot = (plan as any).hot;
              return (
                <FadeIn key={plan.name} delay={i * 100}>
                  <div className={`relative flex flex-col rounded-2xl border ${isHot ? "border-indigo-500/50 bg-indigo-600/5" : "border-white/10 bg-white/[0.03]"} p-7 h-full`}>
                    {isHot && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-600/40">
                        {t.pricing.popular}
                      </div>
                    )}
                    <div className="mb-6">
                      <div className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${c.badge} mb-3`}>{plan.name}</div>
                      <div className="flex items-end gap-1 mb-1">
                        <span className={`text-5xl font-black ${c.accent}`}>{plan.price}</span>
                        <span className="text-white/30 text-sm mb-2">{t.pricing.monthly}</span>
                      </div>
                      <p className="text-sm text-white/50 mb-1">{plan.desc}</p>
                      <p className={`text-xs font-semibold ${c.accent}`}>{plan.limit}</p>
                    </div>
                    <ul className="space-y-3 flex-1 mb-8">
                      {plan.features.map((feat, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-sm text-white/65">
                          <Check className={`w-4 h-4 shrink-0 mt-0.5 ${c.check}`} />
                          {feat}
                        </li>
                      ))}
                    </ul>
                    <a
                      href="#contact"
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all ${c.btn} shadow-lg`}
                    >
                      {t.pricing.cta} <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </FadeIn>
              );
            })}
          </div>
          <FadeIn delay={300}>
            <div className="mt-8 text-center">
              <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/[0.03] border border-white/10 text-sm text-white/50">
                <Building2 className="w-4 h-4 text-white/30" />
                {lang === "ua"
                  ? "Потрібен індивідуальний пакет для мережі або великого об'єкту? "
                  : "Need a custom package for a chain or large property? "}
                <a href="#contact" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
                  {lang === "ua" ? "Зв'яжіться з нами →" : "Contact us →"}
                </a>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-24 px-6 md:px-12 max-w-3xl mx-auto">
        <FadeIn>
          <div className="text-center mb-14">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">{t.faq.title}</h2>
          </div>
        </FadeIn>
        <div>
          {t.faq.items.map((item, i) => (
            <FadeIn key={i} delay={i * 60}>
              <FaqItem q={item.q} a={item.a} />
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── DEMO FORM ───────────────────────────────────────────────────── */}
      <section id="contact" className="py-24 px-6 md:px-12 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-16 items-start">
          <FadeIn>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-300 font-medium mb-6">
                <Sparkles className="w-3.5 h-3.5" />
                {lang === "ua" ? "Персональна демонстрація" : "Personalized demo"}
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4">{t.form.title}</h2>
              <p className="text-lg text-white/40 leading-relaxed mb-8">{t.form.sub}</p>
              <div className="space-y-4 text-sm text-white/40">
                {[
                  lang === "ua" ? "Показуємо систему на прикладі вашого типу об'єкту" : "Demo tailored to your property type",
                  lang === "ua" ? "Відповідаємо на всі технічні питання" : "Answer all technical questions live",
                  lang === "ua" ? "Обговорюємо план підключення за 48 годин" : "Discuss 48-hour onboarding plan",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={150}>
            {submitted ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-5">
                  <Check className="w-7 h-7 text-emerald-400" />
                </div>
                <h3 className="text-2xl font-black text-white mb-3">{t.form.successTitle}</h3>
                <p className="text-white/50">{t.form.successBody}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 space-y-4">
                {[
                  { key: "name", label: t.form.name, type: "text" },
                  { key: "email", label: t.form.email, type: "email" },
                  { key: "phone", label: t.form.phone, type: "tel" },
                  { key: "company", label: t.form.company, type: "text" },
                ].map(({ key, label, type }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-white/40 mb-1.5">{label}</label>
                    <input
                      type={type}
                      value={(form as any)[key]}
                      onChange={e => f(key, e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-white/40 mb-1.5">{t.form.count}</label>
                  <select
                    value={form.propertiesCount}
                    onChange={e => f("propertiesCount", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                  >
                    {["1–5", "6–15", "16–50", "51–100", "100+"].map(v => (
                      <option key={v} value={v} className="bg-[#1a1d2e]">{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/40 mb-1.5">{t.form.message}</label>
                  <textarea
                    rows={3}
                    value={form.message}
                    onChange={e => f("message", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30 hover:-translate-y-0.5"
                >
                  {loading ? t.form.submitting : t.form.submit}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            )}
          </FadeIn>
        </div>
      </section>

      {/* ── CTA FINAL ───────────────────────────────────────────────────── */}
      <section className="py-24 px-6 md:px-12">
        <div className="max-w-4xl mx-auto text-center">
          <FadeIn>
            <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-600/10 via-violet-600/5 to-transparent p-12 md:p-16">
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-600/15 blur-3xl rounded-full pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-violet-600/10 blur-3xl rounded-full pointer-events-none" />
              <div className="relative z-10">
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
                  {lang === "ua" ? "Готові запустити систему?" : "Ready to launch?"}
                </h2>
                <p className="text-lg text-white/40 mb-10 max-w-xl mx-auto">
                  {lang === "ua"
                    ? "Підключення займає 48 годин. Перші результати — вже в перший тиждень."
                    : "Onboarding takes 48 hours. First results visible in the first week."}
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <a href="#contact" className="flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base rounded-2xl transition-all shadow-xl shadow-indigo-600/30 hover:-translate-y-0.5">
                    {t.hero.cta1} <ArrowRight className="w-5 h-5" />
                  </a>
                  <a href={`${BASE}/login`} className="flex items-center gap-2 px-8 py-4 bg-white/6 hover:bg-white/10 text-white/70 hover:text-white font-semibold text-base rounded-2xl border border-white/10 transition-all hover:-translate-y-0.5">
                    {t.nav.login}
                  </a>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/6 py-16 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-10 mb-12">
            <div className="md:col-span-2">
              <MaisonLogo size={30} textVariant="dark" />
              <p className="mt-4 text-sm text-white/35 leading-relaxed max-w-xs">{t.footer.desc}</p>
              <div className="mt-5 flex items-center gap-2 text-sm text-white/30">
                <Mail className="w-4 h-4" />
                info@maisonhd.com
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-4">{t.footer.product}</div>
              <ul className="space-y-2.5">
                {t.footer.links.map(l => (
                  <li key={l}><button onClick={() => scrollTo(FOOTER_LINKS[l] ?? "features")} className="text-sm text-white/40 hover:text-white transition-colors text-left">{l}</button></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-4">{lang === "ua" ? "Компанія" : "Company"}</div>
              <ul className="space-y-2.5">
                {t.footer.company.map(l => (
                  <li key={l}><button onClick={() => scrollTo(FOOTER_LINKS[l] ?? "contact")} className="text-sm text-white/40 hover:text-white transition-colors text-left">{l}</button></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-white/6 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/25">{t.footer.copy}</p>
            <div className="flex items-center gap-2 text-xs text-white/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {lang === "ua" ? "Всі системи працюють" : "All systems operational"}
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
