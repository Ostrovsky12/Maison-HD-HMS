import { useState } from "react";
import {
  ArrowLeft, Maximize2, Minimize2, Download, ChevronLeft, ChevronRight,
  Hotel, BedDouble, BarChart3, MessageSquare, Sparkles, Users, CreditCard,
  Settings, Globe, Zap, Shield, Clock, TrendingUp, Check, Star,
  Smartphone, FileText, CalendarDays, Wrench, Utensils, Activity,
  X, Phone, Key, Leaf, Heart, UserCheck, ShoppingBag, Package,
  Moon, Coffee, PhoneCall, Brain, Wifi, Radio, Building2,
  DollarSign, Target, Award, Layers, ChevronRight as Arrow,
} from "lucide-react";

// ── All 16 live modules ────────────────────────────────────────────────────────
const MODULES = [
  {
    icon: CalendarDays, title: "Шахматка", tag: "Core",
    desc: "Drag & drop бронювання. Вся зайнятість на одному екрані, без конфліктів.",
    color: "bg-indigo-500/20 text-indigo-300", border: "border-indigo-500/30",
  },
  {
    icon: BarChart3, title: "Аналітика", tag: "Core",
    desc: "RevPAR, ADR, Occupancy у реальному часі. Дашборд власника з трендами.",
    color: "bg-violet-500/20 text-violet-300", border: "border-violet-500/30",
  },
  {
    icon: MessageSquare, title: "AI Inbox", tag: "AI",
    desc: "Telegram + WhatsApp + Email в одному вікні. GPT-5 пише чернетки відповідей.",
    color: "bg-blue-500/20 text-blue-300", border: "border-blue-500/30",
  },
  {
    icon: Users, title: "Housekeeping", tag: "Core",
    desc: "Автозадачі після виїзду. Статуси прибирання в реальному часі на телефоні.",
    color: "bg-cyan-500/20 text-cyan-300", border: "border-cyan-500/30",
  },
  {
    icon: CreditCard, title: "Фінанси", tag: "Core",
    desc: "Рахунки, акти, баланс. Інтеграція LiqPay / WayForPay. Авторахунки PDF.",
    color: "bg-emerald-500/20 text-emerald-300", border: "border-emerald-500/30",
  },
  {
    icon: Globe, title: "Гостьовий портал", tag: "Core",
    desc: "QR у номері → самообслуговування 24/7. Замовлення, прохання, рейтинг.",
    color: "bg-teal-500/20 text-teal-300", border: "border-teal-500/30",
  },
  {
    icon: Phone, title: "Telephony AI", tag: "NEW ✦",
    desc: "AI Call-центр. Binotel інтеграція. WebRTC внутрішній зв'язок. IVR меню.",
    color: "bg-orange-500/20 text-orange-300", border: "border-orange-500/30",
  },
  {
    icon: TrendingUp, title: "Rate Intelligence", tag: "NEW ✦",
    desc: "Динамічні ціни на основі AI. Прогноз попиту, сезонність, yield-стратегії.",
    color: "bg-rose-500/20 text-rose-300", border: "border-rose-500/30",
  },
  {
    icon: Key, title: "Digital Key", tag: "NEW ✦",
    desc: "Цифровий ключ у телефоні. Мобільний check-in/check-out. QR доступ.",
    color: "bg-yellow-500/20 text-yellow-300", border: "border-yellow-500/30",
  },
  {
    icon: Leaf, title: "Sustainability / ESG", tag: "NEW ✦",
    desc: "ESG звітність. Вуглецевий слід, споживання ресурсів. Сертифікати.",
    color: "bg-green-500/20 text-green-300", border: "border-green-500/30",
  },
  {
    icon: Heart, title: "Loyalty Program", tag: "NEW ✦",
    desc: "Програма лояльності з балами та рівнями. Персональні пропозиції.",
    color: "bg-pink-500/20 text-pink-300", border: "border-pink-500/30",
  },
  {
    icon: UserCheck, title: "Staff Scheduling", tag: "NEW ✦",
    desc: "Розклад персоналу з drag & drop. Зміни, відпустки, навантаження.",
    color: "bg-sky-500/20 text-sky-300", border: "border-sky-500/30",
  },
  {
    icon: ShoppingBag, title: "Upsell Engine", tag: "NEW ✦",
    desc: "AI-апселл при бронюванні та заселенні. Пізній виїзд, ранній заїзд, апгрейди.",
    color: "bg-amber-500/20 text-amber-300", border: "border-amber-500/30",
  },
  {
    icon: Coffee, title: "QR Ordering", tag: "NEW ✦",
    desc: "QR-меню в номері та ресторані. Замовлення їжі та послуг без персоналу.",
    color: "bg-lime-500/20 text-lime-300", border: "border-lime-500/30",
  },
  {
    icon: Package, title: "Package Builder", tag: "NEW ✦",
    desc: "Конструктор пакетів: ромтик, SPA, бізнес. Бандлінг для зростання ADR.",
    color: "bg-fuchsia-500/20 text-fuchsia-300", border: "border-fuchsia-500/30",
  },
  {
    icon: Moon, title: "Night Audit", tag: "NEW ✦",
    desc: "Автоматичний нічний аудит. Закриття доби, звіти, баланс без людини.",
    color: "bg-slate-500/20 text-slate-300", border: "border-slate-500/30",
  },
];

const ADVANTAGES = [
  {
    icon: Zap, title: "Старт за 30 хвилин",
    desc: "Onboarding wizard веде крок за кроком. Перше бронювання — в той самий день.",
    stat: "30 хв", statLabel: "до першого бронювання",
  },
  {
    icon: Brain, title: "AI скрізь",
    desc: "GPT-5 відповідає гостям, аналізує дзвінки, генерує скрипти, будує прогнози.",
    stat: "GPT-5", statLabel: "вбудований без доплат",
  },
  {
    icon: TrendingUp, title: "RevPAR зростає",
    desc: "Rate Intelligence + Upsell Engine + Loyalty = середній чек вище на 23% вже за 3 місяці.",
    stat: "+23%", statLabel: "до RevPAR за 3 міс.",
  },
  {
    icon: Clock, title: "Підтримка 24/7",
    desc: "Telegram-чат з командою, база знань, відеоінструкції. Відповідь до 15 хвилин.",
    stat: "< 15 хв", statLabel: "час відповіді",
  },
  {
    icon: Shield, title: "Безпека та надійність",
    desc: "HTTPS, JWT-авторизація, рольовий доступ, шифрування. SLA 99.9% Uptime.",
    stat: "99.9%", statLabel: "Uptime SLA",
  },
  {
    icon: DollarSign, title: "ROI з першого місяця",
    desc: "60% менше ручної роботи. Нуль Excel. Нуль WhatsApp-хаосу. Окупається одразу.",
    stat: "60%", statLabel: "менше ручної роботи",
  },
];

const COMPETITORS = [
  { name: "Maison HD", price: "від 990₴", ai: true, mobile: true, ukr: true, telephony: true, loyalty: true, setup: "30 хв", highlight: true },
  { name: "Bnovo",     price: "від 5 000₴", ai: false, mobile: true, ukr: false, telephony: false, loyalty: false, setup: "1–2 тижні", highlight: false },
  { name: "HBook",     price: "від 3 500₴", ai: false, mobile: false, ukr: false, telephony: false, loyalty: false, setup: "3–5 днів", highlight: false },
  { name: "Mews",      price: "від 8 000₴", ai: false, mobile: true, ukr: false, telephony: false, loyalty: true, setup: "2–4 тижні", highlight: false },
  { name: "Excel/Таблиці", price: "безкоштовно", ai: false, mobile: false, ukr: true, telephony: false, loyalty: false, setup: "∞", highlight: false },
];

const PLANS = [
  {
    name: "Basic", price: 990, period: "міс",
    color: "from-gray-700 to-gray-800", border: "border-gray-600",
    units: "до 20 юнітів", badge: null,
    features: ["Шахматка та бронювання", "Housekeeping", "Гостьовий портал", "Фінанси та рахунки", "Night Audit", "Email-підтримка", "1 об'єкт"],
  },
  {
    name: "Pro", price: 2490, period: "міс",
    color: "from-indigo-700 to-violet-800", border: "border-indigo-500",
    units: "до 100 юнітів", badge: "Популярний",
    features: ["Все з Basic", "AI Inbox (GPT-5)", "Analytics дашборд", "Rate Intelligence", "Upsell Engine", "QR Ordering", "Package Builder", "Loyalty Program", "LiqPay / WayForPay", "До 5 об'єктів", "Пріоритетна підтримка"],
  },
  {
    name: "Enterprise", price: 4990, period: "міс",
    color: "from-amber-700 to-orange-800", border: "border-amber-500",
    units: "Необмежено", badge: "Best Value",
    features: ["Все з Pro", "Telephony AI + Binotel", "Digital Key", "Staff Scheduling", "Sustainability/ESG", "White-label", "API інтеграція", "Channel Manager", "Мультиоб'єкт (∞)", "Виділений менеджер", "SLA 99.9%"],
  },
];

const SLIDES = [
  "hero", "problem", "solution", "modules", "telephony", "advantages", "compare", "pricing", "cta",
] as const;
type Slide = typeof SLIDES[number];

// ── Component ──────────────────────────────────────────────────────────────────
export default function PitchPage() {
  const [slide, setSlide] = useState<Slide>("hero");
  const [fullscreen, setFullscreen] = useState(false);
  const idx = SLIDES.indexOf(slide);

  const prev = () => idx > 0 && setSlide(SLIDES[idx - 1]);
  const next = () => idx < SLIDES.length - 1 && setSlide(SLIDES[idx + 1]);
  const handlePrint = () => window.print();
  const toggleFs = () => {
    if (!fullscreen) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
    setFullscreen(f => !f);
  };

  return (
    <div className="min-h-screen bg-[#07091a] text-white font-sans flex flex-col select-none print:min-h-0">

      {/* ── Control bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/60 border-b border-white/10 print:hidden sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-sm text-white font-medium transition-all">
            <ArrowLeft className="w-4 h-4" /> Назад
          </button>
          <span className="text-white/20 hidden sm:block">|</span>
          <span className="text-xs text-white/40 hidden sm:block">Maison HD — Hospitality OS · {SLIDES.length} слайдів</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 mr-3">
            {SLIDES.map((s, i) => (
              <button key={s} onClick={() => setSlide(s)}
                className={`h-1.5 rounded-full transition-all ${s === slide ? "bg-indigo-400 w-5" : "bg-white/20 hover:bg-white/40 w-1.5"}`} />
            ))}
          </div>
          <button onClick={prev} disabled={idx === 0}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/40 w-14 text-center">{idx + 1} / {SLIDES.length}</span>
          <button onClick={next} disabled={idx === SLIDES.length - 1}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="w-px h-4 bg-white/10 mx-1" />
          <button onClick={handlePrint} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white" title="Друк / PDF">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={toggleFs} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Slide area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── SLIDE 1: HERO ── */}
        {slide === "hero" && (
          <div className="min-h-[90vh] flex flex-col items-center justify-center text-center px-8 relative overflow-hidden py-16">
            <div className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-blue-600/5 blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-5xl w-full">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-8">
                <Sparkles className="w-3.5 h-3.5" />
                Hospitality Operating System · 2026
              </div>

              <h1 className="text-6xl md:text-8xl font-black mb-6 leading-none tracking-tight">
                <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Maison</span>
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent ml-4">HD</span>
              </h1>

              <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed mb-3">
                Не просто PMS. Повноцінна операційна система для готельного бізнесу.
              </p>
              <p className="text-base text-gray-500 mb-12">
                16 інтегрованих модулів · AI ресепшеніст на GPT-5 · Telephony AI + Binotel · Старт за 30 хвилин
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-12">
                {[
                  { val: "16", label: "Живих модулів" },
                  { val: "30 хв", label: "Повне налаштування" },
                  { val: "GPT-5", label: "AI вбудований" },
                  { val: "5×", label: "Дешевше ніж Bnovo" },
                ].map(s => (
                  <div key={s.val} className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/40 transition-colors">
                    <div className="text-3xl font-black text-indigo-400 mb-1">{s.val}</div>
                    <div className="text-xs text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                {["Шахматка", "AI Inbox", "Telephony AI", "Rate Intelligence", "Loyalty", "Digital Key", "Night Audit", "Upsell Engine"].map(tag => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400">{tag}</span>
                ))}
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-500">+8 більше...</span>
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 2: PROBLEM ── */}
        {slide === "problem" && (
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-5xl w-full">
              <div className="text-center mb-12">
                <div className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3">Проблема</div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Чому готелі досі страждають?</h2>
                <p className="text-gray-400 text-lg">Типова реальність готельного бізнесу в Україні</p>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { emoji: "😩", title: "Excel як PMS", desc: "Бронювання в таблицях, пошук конфліктів вручну. Подвійні заселення — норма." },
                  { emoji: "📱", title: "WhatsApp замість системи", desc: "Запити від гостей у 5 різних чатах. Ресепшеніст не встигає, клієнт іде." },
                  { emoji: "📞", title: "Дзвінки — чорна діра", desc: "Пропущений дзвінок = втрачений гість. Хто дзвонив? Ніхто не знає." },
                  { emoji: "💸", title: "Дорогі закордонні PMS", desc: "Bnovo, Mews, Cloudbeds — від 5 000₴ до 30 000₴/міс. Без AI, без підтримки." },
                  { emoji: "📊", title: "Нуль аналітики", desc: "RevPAR, ADR, Occupancy рахуються вручну раз на місяць — якщо взагалі рахуються." },
                  { emoji: "🧹", title: "Housekeeping у WhatsApp", desc: "Покоївки отримують завдання в месенджерах, статус прибирання — загадка." },
                  { emoji: "📉", title: "Ціни стоять нерухомо", desc: "Одна ціна весь рік. Конкуренти підвищують під попит — ви ні." },
                  { emoji: "🤦", title: "Плинність = хаос", desc: "Один менеджер знав усі паролі й формули. Пішов — усе зламалось." },
                ].map(p => (
                  <div key={p.title} className="flex items-start gap-4 p-4 rounded-2xl bg-red-900/10 border border-red-500/20 hover:border-red-500/40 transition-colors">
                    <span className="text-2xl shrink-0">{p.emoji}</span>
                    <div>
                      <div className="font-bold text-white mb-1 text-sm">{p.title}</div>
                      <div className="text-xs text-gray-400 leading-relaxed">{p.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 p-5 rounded-2xl bg-red-900/20 border border-red-500/30 text-center">
                <p className="text-red-300 font-bold">Результат: готель працює на 70% своїх можливостей і не знає про це.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 3: SOLUTION ── */}
        {slide === "solution" && (
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-5xl w-full">
              <div className="text-center mb-12">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">Рішення</div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
                  Один інструмент для <span className="text-indigo-400">всього</span>
                </h2>
                <p className="text-gray-400 text-lg max-w-2xl mx-auto">Maison HD замінює 10+ окремих інструментів та зводить всі операції в єдину систему</p>
              </div>

              <div className="grid md:grid-cols-3 gap-4 mb-8">
                {[
                  { from: "Excel / Google Sheets", to: "Шахматка + Бронювання", icon: CalendarDays },
                  { from: "WhatsApp / Viber чати", to: "AI Inbox (GPT-5)", icon: MessageSquare },
                  { from: "Ручні звіти", to: "Analytics дашборд", icon: BarChart3 },
                  { from: "Телефонні журнали", to: "Telephony AI + Binotel", icon: Phone },
                  { from: "Фіксована ціна цілий рік", to: "Rate Intelligence AI", icon: TrendingUp },
                  { from: "Карта лояльності з паперу", to: "Loyalty Program", icon: Heart },
                  { from: "Зарплатний Excel", to: "Staff Scheduling", icon: UserCheck },
                  { from: "Word / PDF вручну", to: "Авторахунки + Акти", icon: FileText },
                  { from: "Нічний аудит вручну", to: "Night Audit автоматом", icon: Moon },
                ].map(r => (
                  <div key={r.to} className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-emerald-500/30 transition-colors">
                    <r.icon className="w-5 h-5 text-indigo-400 mb-3" />
                    <div className="text-xs text-red-400 line-through mb-1 leading-snug">{r.from}</div>
                    <div className="text-xs font-bold text-emerald-400 leading-snug">✓ {r.to}</div>
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-600/20 to-violet-600/20 border border-indigo-500/30">
                  <div className="text-white font-bold text-base mb-2">💼 Для власника</div>
                  <div className="text-gray-300 text-sm">Реальна аналітика без жодного Excel. RevPAR, ADR, завантаженість — завжди під рукою. Рішення на основі даних, а не відчуттів.</div>
                </div>
                <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-600/20 to-teal-600/20 border border-emerald-500/30">
                  <div className="text-white font-bold text-base mb-2">🎯 Для команди</div>
                  <div className="text-gray-300 text-sm">Ресепшеніст витрачає на <span className="text-emerald-400 font-bold">60% менше часу</span> на адміністрування. Більше уваги гостям — вищий рейтинг.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 4: MODULES ── */}
        {slide === "modules" && (
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-6xl w-full">
              <div className="text-center mb-10">
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3">Функціонал</div>
                <h2 className="text-4xl font-black text-white mb-2">16 модулів · Одна система</h2>
                <p className="text-gray-400">Кожен модуль повністю інтегрований з іншими. 10 нових модулів додано у 2026.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MODULES.map(m => (
                  <div key={m.title} className={`p-4 rounded-2xl bg-white/5 border ${m.border} hover:bg-white/8 transition-colors group`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center`}>
                        <m.icon className="w-4 h-4" />
                      </div>
                      {m.tag === "NEW ✦" && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">NEW</span>
                      )}
                    </div>
                    <div className="font-bold text-white text-sm mb-1">{m.title}</div>
                    <div className="text-xs text-gray-400 leading-relaxed">{m.desc}</div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-center">
                <div className="inline-flex items-center gap-4 px-6 py-3 rounded-2xl bg-white/5 border border-white/10">
                  <span className="flex items-center gap-1.5 text-sm text-gray-400">
                    <span className="w-2 h-2 rounded-full bg-indigo-400"></span> Core модулі: 6
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-gray-400">
                    <span className="w-2 h-2 rounded-full bg-orange-400"></span> Нових у 2026: 10
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-emerald-400 font-bold">
                    <Sparkles className="w-3.5 h-3.5" /> Всього: 16 живих модулів
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 5: TELEPHONY AI (нова) ── */}
        {slide === "telephony" && (
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-5xl w-full">
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 text-xs font-bold mb-4">
                  <Phone className="w-3.5 h-3.5" /> НОВИЙ МОДУЛЬ
                </div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
                  Telephony <span className="text-orange-400">AI</span>
                </h2>
                <p className="text-gray-400 text-lg max-w-2xl mx-auto">Повноцінний AI call-центр прямо в системі. Binotel + WebRTC + AI аналіз дзвінків.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div className="space-y-3">
                  {[
                    { icon: Building2, title: "Binotel інтеграція", desc: "Webhook-підключення до вашої АТС Binotel. Кожен дзвінок автоматично фіксується з ім'ям гостя.", color: "text-orange-400" },
                    { icon: Brain, title: "AI аналіз розмов", desc: "GPT-5 автоматично резюмує кожен дзвінок, визначає sentiment і виділяє ключові теми.", color: "text-violet-400" },
                    { icon: Wifi, title: "WebRTC внутрішній зв'язок", desc: "Пряме P2P аудіо між браузерами. Рецепшеніст ↔ покоївка — без додаткового обладнання.", color: "text-blue-400" },
                    { icon: Radio, title: "IVR конструктор", desc: "Візуальний drag & drop IVR. Налаштуйте голосове меню за хвилини без програмістів.", color: "text-cyan-400" },
                  ].map(f => (
                    <div key={f.title} className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-orange-500/30 transition-colors">
                      <f.icon className={`w-5 h-5 ${f.color} shrink-0 mt-0.5`} />
                      <div>
                        <div className="font-bold text-white text-sm mb-1">{f.title}</div>
                        <div className="text-xs text-gray-400 leading-relaxed">{f.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <div className="p-6 rounded-2xl bg-orange-900/20 border border-orange-500/30">
                    <div className="text-orange-300 font-bold mb-3 flex items-center gap-2"><PhoneCall className="w-4 h-4" /> Що бачить ресепшеніст під час дзвінка:</div>
                    <div className="space-y-2 text-sm">
                      {[
                        "📞 Ім'я гостя — одразу при дзвінку",
                        "🏨 Поточне бронювання гостя",
                        "⭐ Рівень лояльності та побажання",
                        "📝 AI-скрипт для типового запиту",
                        "📊 Автоматичне резюме після розмови",
                      ].map(item => (
                        <div key={item} className="text-gray-300">{item}</div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { val: "0 с", label: "Час визначення гостя" },
                      { val: "100%", label: "Дзвінків у журналі" },
                      { val: "GPT-5", label: "Аналізує кожен дзвінок" },
                      { val: "P2P", label: "WebRTC без сервера" },
                    ].map(s => (
                      <div key={s.val} className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                        <div className="text-xl font-black text-orange-400">{s.val}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-r from-orange-600/15 to-red-600/15 border border-orange-500/30 text-center">
                <p className="text-white font-bold">Конкуренти платять за Bitrix24 або окремий call-центр 3 000–15 000₴/міс.</p>
                <p className="text-gray-400 text-sm mt-1">У Maison HD це включено в Enterprise план — без доплат.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 6: ADVANTAGES ── */}
        {slide === "advantages" && (
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-5xl w-full">
              <div className="text-center mb-12">
                <div className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-3">Переваги</div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Чому обирають Maison HD?</h2>
                <p className="text-gray-400 text-lg">Конкретні цифри, а не маркетингові слогани</p>
              </div>
              <div className="grid md:grid-cols-2 gap-5 mb-8">
                {ADVANTAGES.map(a => (
                  <div key={a.title} className="flex gap-5 p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 transition-colors">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                      <a.icon className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-white mb-1">{a.title}</div>
                      <div className="text-sm text-gray-400 leading-relaxed mb-3">{a.desc}</div>
                      <div>
                        <span className="text-2xl font-black text-indigo-400">{a.stat}</span>
                        <span className="text-xs text-gray-500 ml-2">{a.statLabel}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { emoji: "🇺🇦", text: "Розроблено в Україні. Українська підтримка. Локальна команда." },
                  { emoji: "🤖", text: "AI ресепшеніст на GPT-5. Вбудований — не окрема підписка." },
                  { emoji: "📱", text: "PWA — без App Store. Встановлюється з браузера за 10 секунд." },
                ].map(p => (
                  <div key={p.emoji} className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <span className="text-2xl">{p.emoji}</span>
                    <span className="text-sm text-gray-300 leading-relaxed">{p.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 7: COMPARE ── */}
        {slide === "compare" && (
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-5xl w-full">
              <div className="text-center mb-10">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3">Порівняння</div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Maison HD vs Альтернативи</h2>
                <p className="text-gray-400">Об'єктивне порівняння за ключовими критеріями</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/10 mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5">
                      <th className="text-left px-4 py-4 text-gray-400 font-semibold">Система</th>
                      <th className="text-center px-3 py-4 text-gray-400 font-semibold">Ціна/міс</th>
                      <th className="text-center px-3 py-4 text-gray-400 font-semibold">AI</th>
                      <th className="text-center px-3 py-4 text-gray-400 font-semibold">Mobile</th>
                      <th className="text-center px-3 py-4 text-gray-400 font-semibold">Telephony</th>
                      <th className="text-center px-3 py-4 text-gray-400 font-semibold">Loyalty</th>
                      <th className="text-center px-3 py-4 text-gray-400 font-semibold">Укр. підтримка</th>
                      <th className="text-center px-3 py-4 text-gray-400 font-semibold">Старт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPETITORS.map((c, i) => (
                      <tr key={c.name} className={`border-t border-white/5 ${c.highlight ? "bg-indigo-600/15" : i % 2 === 0 ? "bg-white/2" : ""}`}>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${c.highlight ? "text-indigo-300" : "text-white"}`}>{c.name}</span>
                            {c.highlight && <span className="px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 text-[10px] font-bold">МИ</span>}
                          </div>
                        </td>
                        <td className="text-center px-3 py-4">
                          <span className={c.highlight ? "text-emerald-400 font-bold" : "text-gray-300"}>{c.price}</span>
                        </td>
                        {["ai", "mobile", "telephony", "loyalty", "ukr"].map(field => (
                          <td key={field} className="text-center px-3 py-4">
                            {(c as any)[field]
                              ? <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                              : <X className="w-3.5 h-3.5 text-gray-600 mx-auto" />}
                          </td>
                        ))}
                        <td className="text-center px-3 py-4">
                          <span className={`text-xs ${c.highlight ? "text-emerald-400 font-bold" : "text-gray-400"}`}>{c.setup}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { label: "Bnovo vs Maison HD", val: "5×", desc: "дорожче при схожому функціоналі" },
                  { label: "Унікальних модулів", val: "16", desc: "яких немає в жодного конкурента разом" },
                  { label: "Telephony AI", val: "0", desc: "конкурентів з вбудованим call-центром" },
                ].map(s => (
                  <div key={s.label} className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                    <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                    <div className="text-3xl font-black text-indigo-400 mb-1">{s.val}</div>
                    <div className="text-xs text-gray-400">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 8: PRICING ── */}
        {slide === "pricing" && (
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-5xl w-full">
              <div className="text-center mb-12">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">Тарифи</div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Прозора ціна. Ніяких сюрпризів.</h2>
                <p className="text-gray-400 text-lg">Всі плани включають підтримку та оновлення</p>
              </div>
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                {PLANS.map(p => (
                  <div key={p.name} className={`relative p-6 rounded-3xl bg-gradient-to-b ${p.color} border ${p.border}`}>
                    {p.badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-indigo-500 text-white text-xs font-bold shadow-lg whitespace-nowrap">
                        {p.badge}
                      </div>
                    )}
                    <div className="mb-4">
                      <div className="text-white font-black text-xl mb-1">{p.name}</div>
                      <div className="text-xs text-white/50 mb-3">{p.units}</div>
                      <div className="flex items-end gap-1">
                        <span className="text-4xl font-black text-white">{p.price.toLocaleString("uk-UA")}</span>
                        <span className="text-white/50 mb-1">₴/{p.period}</span>
                      </div>
                    </div>
                    <div className="space-y-2 mb-4">
                      {p.features.map(f => (
                        <div key={f} className="flex items-center gap-2 text-sm text-white/80">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { emoji: "🎯", title: "Безкоштовний старт", desc: "14 днів повного доступу без карти. Налаштуємо разом." },
                  { emoji: "📈", title: "Масштабується з вами", desc: "Починайте з Basic, переходьте на Pro коли потрібно." },
                  { emoji: "🤝", title: "Онбординг включено", desc: "Персональне налаштування для кожного нового клієнта." },
                ].map(b => (
                  <div key={b.title} className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                    <span className="text-2xl">{b.emoji}</span>
                    <div className="font-bold text-white text-sm mt-2 mb-1">{b.title}</div>
                    <div className="text-xs text-gray-400">{b.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 9: CTA ── */}
        {slide === "cta" && (
          <div className="min-h-[90vh] flex flex-col items-center justify-center text-center px-8 relative overflow-hidden py-16">
            <div className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-4xl w-full">
              <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-6">Наступний крок</div>
              <h2 className="text-5xl md:text-7xl font-black text-white mb-6 leading-tight">
                Готові вивести готель<br />
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">на новий рівень?</span>
              </h2>
              <p className="text-gray-300 text-xl mb-4 max-w-2xl mx-auto leading-relaxed">
                16 модулів. AI ресепшеніст. Telephony AI. Повний контроль над готелем — в одній системі.
              </p>
              <p className="text-gray-500 mb-12">Старт за 30 хвилин. Без прихованих платежів. Перший місяць — безкоштовно.</p>

              <div className="grid md:grid-cols-3 gap-4 mb-12">
                {[
                  { step: "01", title: "Демо-дзвінок", desc: "30 хвилин — показуємо всі 16 модулів. Відповідаємо на всі питання.", color: "border-indigo-500/40" },
                  { step: "02", title: "Налаштування", desc: "Наш менеджер допомагає підключити готель. Ви нічого не робите самостійно.", color: "border-violet-500/40" },
                  { step: "03", title: "Запуск", desc: "Перше бронювання в систему — в той самий день. Команда навчена, готель працює.", color: "border-emerald-500/40" },
                ].map(s => (
                  <div key={s.step} className={`p-6 rounded-2xl bg-white/5 border ${s.color} text-left`}>
                    <div className="text-4xl font-black text-white/10 mb-3">{s.step}</div>
                    <div className="font-bold text-white mb-2">{s.title}</div>
                    <div className="text-sm text-gray-400 leading-relaxed">{s.desc}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
                <a href="tel:+380" className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base transition-colors">
                  <Phone className="w-5 h-5" /> Зв'язатись зараз
                </a>
                <a href="https://t.me/maison_hd" className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-base transition-colors">
                  <MessageSquare className="w-5 h-5" /> Telegram
                </a>
              </div>

              <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
                {["✓ 14 днів безкоштовно", "✓ Без карти для старту", "✓ Персональний онбординг", "✓ Підтримка 24/7"].map(t => (
                  <span key={t} className="text-gray-400">{t}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom nav ─────────────────────────────────────────────────────────── */}
      <div className="border-t border-white/10 bg-black/40 px-6 py-3 flex items-center justify-between print:hidden">
        <button onClick={prev} disabled={idx === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-white/10 disabled:opacity-20 transition-colors text-sm text-gray-400 hover:text-white">
          <ChevronLeft className="w-4 h-4" /> Назад
        </button>
        <div className="text-xs text-white/20">
          {SLIDES[idx].charAt(0).toUpperCase() + SLIDES[idx].slice(1)} · {idx + 1}/{SLIDES.length}
        </div>
        <button onClick={next} disabled={idx === SLIDES.length - 1}
          className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-white/10 disabled:opacity-20 transition-colors text-sm text-gray-400 hover:text-white">
          Далі <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
