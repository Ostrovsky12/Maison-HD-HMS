import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Maximize2, Minimize2, Download, ChevronLeft, ChevronRight,
  Hotel, BedDouble, BarChart3, MessageSquare, Sparkles, Users, CreditCard,
  Settings, Globe, Zap, Shield, Clock, TrendingUp, Check, Star,
  Smartphone, FileText, CalendarDays, Wrench, Utensils, Activity,
  X, ExternalLink,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Slide data ────────────────────────────────────────────────────────────────
const MODULES = [
  { icon: CalendarDays, title: "Шахматка", desc: "Drag & drop бронювання. Вся зайнятість на одному екрані.", color: "bg-indigo-500/20 text-indigo-300", border: "border-indigo-500/30" },
  { icon: BarChart3,    title: "Аналітика", desc: "RevPAR, ADR, Occupancy — в реальному часі. Дашборд власника.", color: "bg-violet-500/20 text-violet-300", border: "border-violet-500/30" },
  { icon: MessageSquare,title: "AI Inbox", desc: "Telegram + WhatsApp + Email в одному вікні. GPT-чернетки відповідей.", color: "bg-blue-500/20 text-blue-300", border: "border-blue-500/30" },
  { icon: Users,        title: "Housekeeping", desc: "Автозадачі після виїзду. Статуси прибирання в реальному часі.", color: "bg-cyan-500/20 text-cyan-300", border: "border-cyan-500/30" },
  { icon: CreditCard,   title: "Фінанси", desc: "Рахунки, акти, платіжний баланс. Інтеграція LiqPay / WayForPay.", color: "bg-emerald-500/20 text-emerald-300", border: "border-emerald-500/30" },
  { icon: Globe,        title: "Гостьовий портал", desc: "Самообслуговування 24/7. QR-код у номері → вся інформація.", color: "bg-teal-500/20 text-teal-300", border: "border-teal-500/30" },
  { icon: Sparkles,     title: "AI Hub", desc: "Розумні підказки, прогнози завантаженості, автоматизація.", color: "bg-pink-500/20 text-pink-300", border: "border-pink-500/30" },
  { icon: Smartphone,   title: "PWA Mobile", desc: "Повноцінна мобільна версія. Покоївка, ресепшеніст, менеджер — з телефону.", color: "bg-orange-500/20 text-orange-300", border: "border-orange-500/30" },
  { icon: FileText,     title: "Документи", desc: "Авторахунки, договори, акти звірки. PDF за 1 клік.", color: "bg-amber-500/20 text-amber-300", border: "border-amber-500/30" },
  { icon: Globe,        title: "Channel Manager", desc: "Синхронізація з Booking.com, Airbnb, OTA в режимі реального часу.", color: "bg-red-500/20 text-red-300", border: "border-red-500/30" },
  { icon: Activity,     title: "Revenue Manager", desc: "Динамічні тарифи, сезонна аналітика, yield-стратегії.", color: "bg-rose-500/20 text-rose-300", border: "border-rose-500/30" },
  { icon: Utensils,     title: "F&B / Spa / Події", desc: "Ресторан, спа, заходи — в єдиній системі з готелем.", color: "bg-fuchsia-500/20 text-fuchsia-300", border: "border-fuchsia-500/30" },
];

const ADVANTAGES = [
  { icon: Zap,       title: "Швидкий старт", desc: "Готель повністю налаштований за 30 хвилин. Onboarding wizard проведе крок за кроком.", stat: "30 хв", statLabel: "до першого бронювання" },
  { icon: Shield,    title: "Безпека",       desc: "HTTPS, JWT-авторизація, рольовий доступ, шифрування даних. Сервери в Україні та ЄС.", stat: "99.9%", statLabel: "Uptime SLA" },
  { icon: TrendingUp,title: "ROI за місяць", desc: "Скорочення ручної роботи ресепшені на 60%. Нуль Excel-таблиць. Нуль WhatsApp-хаосу.", stat: "60%", statLabel: "менше ручної роботи" },
  { icon: Clock,     title: "Підтримка 24/7", desc: "Telegram-чат з командою, база знань, відеоінструкції. Відповідь до 15 хвилин.", stat: "< 15 хв", statLabel: "час відповіді" },
];

const PLANS = [
  {
    name: "Basic", price: 990, period: "міс", color: "from-gray-700 to-gray-800", border: "border-gray-600",
    units: "до 20 юнітів", badge: null,
    features: ["Шахматка та бронювання", "Housekeeping", "Гостьовий портал", "Фінанси та рахунки", "Email-підтримка", "1 об'єкт"],
  },
  {
    name: "Pro", price: 2490, period: "міс", color: "from-indigo-700 to-violet-800", border: "border-indigo-500",
    units: "до 100 юнітів", badge: "Популярний",
    features: ["Все з Basic", "AI Inbox (GPT-5)", "Analytics дашборд", "Channel Manager", "LiqPay / WayForPay", "До 5 об'єктів", "Пріоритетна підтримка"],
  },
  {
    name: "Enterprise", price: 4990, period: "міс", color: "from-amber-700 to-orange-800", border: "border-amber-500",
    units: "Необмежено", badge: "Best Value",
    features: ["Все з Pro", "White-label", "API інтеграція", "Spa / F&B / Події", "Revenue Manager", "Мультиоб'єкт (∞)", "Виділений менеджер", "SLA 99.9%"],
  },
];

const COMPETITORS = [
  { name: "Maison HD",    price: "від 990₴", ai: true,  mobile: true,  ukr: true,  setup: "30 хв",   highlight: true },
  { name: "Bnovo",        price: "від 5 000₴", ai: false, mobile: true,  ukr: false, setup: "1–2 тижні", highlight: false },
  { name: "HBook",        price: "від 3 500₴", ai: false, mobile: false, ukr: false, setup: "3–5 днів", highlight: false },
  { name: "Excel / Таблиці", price: "безкоштовно", ai: false, mobile: false, ukr: true,  setup: "завжди", highlight: false },
];

const SLIDES = [
  "hero", "problem", "solution", "modules", "advantages", "compare", "pricing", "cta"
] as const;
type Slide = typeof SLIDES[number];

// ── Component ─────────────────────────────────────────────────────────────────
export default function PitchPage() {
  const [, navigate] = useLocation();
  const [slide, setSlide] = useState<Slide>("hero");
  const [fullscreen, setFullscreen] = useState(false);
  const idx = SLIDES.indexOf(slide);

  const prev = () => idx > 0 && setSlide(SLIDES[idx - 1]);
  const next = () => idx < SLIDES.length - 1 && setSlide(SLIDES[idx + 1]);

  const handlePrint = () => window.print();

  const toggleFs = () => {
    if (!fullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    setFullscreen(f => !f);
  };

  return (
    <div className="min-h-screen bg-[#07091a] text-white font-sans flex flex-col select-none print:min-h-0">

      {/* ── Control bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/60 border-b border-white/10 print:hidden">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-sm text-white font-medium transition-all">
            <ArrowLeft className="w-4 h-4" /> Вийти з презентації
          </button>
          <span className="text-white/20 hidden sm:block">|</span>
          <span className="text-xs text-white/40 hidden sm:block">Maison HD — Презентація для клієнтів</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Slide dots */}
          <div className="flex items-center gap-1 mr-3">
            {SLIDES.map((s, i) => (
              <button key={s} onClick={() => setSlide(s)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${s === slide ? "bg-indigo-400 w-3" : "bg-white/20 hover:bg-white/40"}`} />
            ))}
          </div>
          <button onClick={prev} disabled={idx === 0}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/40 w-12 text-center">{idx + 1} / {SLIDES.length}</span>
          <button onClick={next} disabled={idx === SLIDES.length - 1}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="w-px h-4 bg-white/10 mx-1" />
          <button onClick={handlePrint} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={toggleFs} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Slide area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">

        {/* ── SLIDE 1: HERO ── */}
        {slide === "hero" && (
          <div className="h-full flex flex-col items-center justify-center text-center px-8 relative overflow-hidden min-h-[80vh]">
            {/* BG circles */}
            <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-4xl">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-8">
                <Sparkles className="w-3.5 h-3.5" />
                Hospitality Operating System · v2.0
              </div>
              <h1 className="text-6xl md:text-8xl font-black mb-6 leading-none tracking-tight">
                <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Maison</span>
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent ml-4">HD</span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed mb-4">
                Не просто PMS. Повноцінна операційна система для готельного бізнесу.
              </p>
              <p className="text-base text-gray-500 mb-12">
                12 інтегрованих модулів · AI ресепшеніст · Старт за 30 хвилин
              </p>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 max-w-2xl mx-auto">
                {[
                  { val: "12", label: "Модулів в одній системі" },
                  { val: "30 хв", label: "Повне налаштування" },
                  { val: "3×", label: "Дешевше ніж Bnovo" },
                ].map(s => (
                  <div key={s.val} className="p-5 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-3xl font-black text-indigo-400 mb-1">{s.val}</div>
                    <div className="text-xs text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 2: PROBLEM ── */}
        {slide === "problem" && (
          <div className="h-full flex flex-col items-center justify-center px-8 py-12 min-h-[80vh]">
            <div className="max-w-5xl w-full">
              <div className="text-center mb-12">
                <div className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3">Проблема</div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Чому готелі досі страждають?</h2>
                <p className="text-gray-400 text-lg">Типова реальність готельного бізнесу в Україні</p>
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                {[
                  { emoji: "😩", title: "Excel як PMS", desc: "Бронювання в таблицях, пошук конфліктів вручну, помилки та подвійні заселення" },
                  { emoji: "📱", title: "WhatsApp замість системи", desc: "Запити від гостей у 5 різних чатах, ресепшеніст не встигає відповідати" },
                  { emoji: "💸", title: "Дорогі закордонні PMS", desc: "Bnovo, Mews, Cloudbeds — від 5 000 до 30 000 UAH/місяць. Немає UX, немає AI" },
                  { emoji: "📊", title: "Нуль аналітики", desc: "RevPAR, ADR, Occupancy рахуються вручну раз на місяць, якщо взагалі рахуються" },
                  { emoji: "🧹", title: "Housekeeping у телефоні", desc: "Покоївки отримують завдання в WhatsApp, статус прибирання ніхто не знає" },
                  { emoji: "🤦", title: "Звільнення = хаос", desc: "Один менеджер знає всі паролі, правила, Excel-формули. Він звільнився — всі дані зникли" },
                ].map(p => (
                  <div key={p.title} className="flex items-start gap-4 p-5 rounded-2xl bg-red-900/10 border border-red-500/20">
                    <span className="text-3xl shrink-0">{p.emoji}</span>
                    <div>
                      <div className="font-bold text-white mb-1">{p.title}</div>
                      <div className="text-sm text-gray-400 leading-relaxed">{p.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 3: SOLUTION ── */}
        {slide === "solution" && (
          <div className="h-full flex flex-col items-center justify-center px-8 py-12 min-h-[80vh]">
            <div className="max-w-5xl w-full">
              <div className="text-center mb-12">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">Рішення</div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
                  Один інструмент для <span className="text-indigo-400">всього</span>
                </h2>
                <p className="text-gray-400 text-lg max-w-2xl mx-auto">Maison HD замінює 8+ окремих інструментів та зводить всі операції в одну систему</p>
              </div>

              <div className="grid md:grid-cols-3 gap-5 mb-8">
                {[
                  { from: "Excel / Google Sheets", to: "Шахматка + Бронювання", icon: CalendarDays },
                  { from: "WhatsApp / Viber чати", to: "AI Inbox (GPT-5)", icon: MessageSquare },
                  { from: "Ручні звіти", to: "Analytics дашборд", icon: BarChart3 },
                  { from: "SMS / Телефон / Viber", to: "Гостьовий портал 24/7", icon: Globe },
                  { from: "Word / PDF вручну", to: "Авторахунки + Акти", icon: FileText },
                  { from: "Bnovo / Excel-зарплатні", to: "Фінанси + Облік", icon: CreditCard },
                ].map(r => (
                  <div key={r.to} className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <r.icon className="w-5 h-5 text-indigo-400 mb-3" />
                    <div className="text-xs text-red-400 line-through mb-1">{r.from}</div>
                    <div className="text-sm font-bold text-emerald-400">✓ {r.to}</div>
                  </div>
                ))}
              </div>

              <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-600/20 to-violet-600/20 border border-indigo-500/30 text-center">
                <div className="text-white font-bold text-lg mb-2">Результат:</div>
                <div className="text-gray-300">Ресепшеніст витрачає на <span className="text-indigo-400 font-bold">60% менше часу</span> на адміністративну роботу. Власник отримує <span className="text-violet-400 font-bold">реальну аналітику</span> без жодного Excel.</div>
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 4: MODULES ── */}
        {slide === "modules" && (
          <div className="h-full flex flex-col items-center justify-center px-8 py-12 min-h-[80vh]">
            <div className="max-w-6xl w-full">
              <div className="text-center mb-10">
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3">Функціонал</div>
                <h2 className="text-4xl font-black text-white mb-2">12 модулів · Одна система</h2>
                <p className="text-gray-400">Кожен модуль повністю інтегрований з іншими</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {MODULES.map(m => (
                  <div key={m.title} className={`p-4 rounded-2xl bg-white/5 border ${m.border} hover:bg-white/8 transition-colors`}>
                    <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center mb-3`}>
                      <m.icon className="w-4.5 h-4.5" />
                    </div>
                    <div className="font-bold text-white text-sm mb-1">{m.title}</div>
                    <div className="text-xs text-gray-400 leading-relaxed">{m.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 5: ADVANTAGES ── */}
        {slide === "advantages" && (
          <div className="h-full flex flex-col items-center justify-center px-8 py-12 min-h-[80vh]">
            <div className="max-w-5xl w-full">
              <div className="text-center mb-12">
                <div className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-3">Переваги</div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Чому обирають Maison HD?</h2>
                <p className="text-gray-400 text-lg">Конкретні результати, а не маркетингові слогани</p>
              </div>
              <div className="grid md:grid-cols-2 gap-6 mb-10">
                {ADVANTAGES.map(a => (
                  <div key={a.title} className="flex gap-5 p-6 rounded-2xl bg-white/5 border border-white/10">
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
                  { emoji: "🇺🇦", text: "Розроблено в Україні. Локальна підтримка." },
                  { emoji: "🤖", text: "AI ресепшеніст на GPT-5. Вбудований, не окрема підписка." },
                  { emoji: "📱", text: "PWA — без App Store. Встановлюється з браузера." },
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

        {/* ── SLIDE 6: COMPARE ── */}
        {slide === "compare" && (
          <div className="h-full flex flex-col items-center justify-center px-8 py-12 min-h-[80vh]">
            <div className="max-w-4xl w-full">
              <div className="text-center mb-12">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3">Порівняння</div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Maison HD vs Альтернативи</h2>
                <p className="text-gray-400">Об'єктивне порівняння ключових критеріїв</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5">
                      <th className="text-left px-5 py-4 text-gray-400 font-semibold">Система</th>
                      <th className="text-center px-4 py-4 text-gray-400 font-semibold">Ціна</th>
                      <th className="text-center px-4 py-4 text-gray-400 font-semibold">AI</th>
                      <th className="text-center px-4 py-4 text-gray-400 font-semibold">Mobile</th>
                      <th className="text-center px-4 py-4 text-gray-400 font-semibold">Укр. підтримка</th>
                      <th className="text-center px-4 py-4 text-gray-400 font-semibold">Старт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPETITORS.map((c, i) => (
                      <tr key={c.name} className={`border-t border-white/5 ${c.highlight ? "bg-indigo-600/15" : ""} ${i % 2 === 0 && !c.highlight ? "bg-white/2" : ""}`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${c.highlight ? "text-indigo-300" : "text-white"}`}>{c.name}</span>
                            {c.highlight && <span className="px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 text-[10px] font-bold">МИ</span>}
                          </div>
                        </td>
                        <td className="text-center px-4 py-4">
                          <span className={c.highlight ? "text-emerald-400 font-bold" : "text-gray-300"}>{c.price}</span>
                        </td>
                        <td className="text-center px-4 py-4">{c.ai ? <Check className="w-5 h-5 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-gray-600 mx-auto" />}</td>
                        <td className="text-center px-4 py-4">{c.mobile ? <Check className="w-5 h-5 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-gray-600 mx-auto" />}</td>
                        <td className="text-center px-4 py-4">{c.ukr ? <Check className="w-5 h-5 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-gray-600 mx-auto" />}</td>
                        <td className="text-center px-4 py-4">
                          <span className={`text-xs ${c.highlight ? "text-emerald-400 font-bold" : "text-gray-400"}`}>{c.setup}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-4">
                {[
                  { icon: "💰", text: "У 3–5 разів дешевше ніж закордонні аналоги" },
                  { icon: "🤖", text: "Єдина система з вбудованим AI на GPT-5" },
                  { icon: "🇺🇦", text: "100% українська підтримка та локалізація" },
                ].map(p => (
                  <div key={p.text} className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-900/15 border border-emerald-500/20">
                    <span className="text-xl">{p.icon}</span>
                    <span className="text-sm text-emerald-300 leading-relaxed">{p.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 7: PRICING ── */}
        {slide === "pricing" && (
          <div className="h-full flex flex-col items-center justify-center px-8 py-12 min-h-[80vh]">
            <div className="max-w-5xl w-full">
              <div className="text-center mb-12">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">Тарифи</div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Прозора ціна. Без сюрпризів.</h2>
                <p className="text-gray-400 text-lg">Жодних прихованих платежів. Жодних "додаткових модулів за $$$".</p>
              </div>
              <div className="grid md:grid-cols-3 gap-5">
                {PLANS.map(p => (
                  <div key={p.name} className={`relative rounded-3xl bg-gradient-to-br ${p.color} border ${p.border} p-6`}>
                    {p.badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-indigo-500 text-white text-xs font-bold shadow-lg">
                        {p.badge}
                      </div>
                    )}
                    <div className="font-black text-xl text-white mb-1">{p.name}</div>
                    <div className="text-xs text-white/50 mb-5">{p.units}</div>
                    <div className="flex items-end gap-1 mb-6">
                      <span className="text-4xl font-black text-white">{p.price.toLocaleString()}</span>
                      <span className="text-white/50 mb-1.5">₴ / {p.period}</span>
                    </div>
                    <ul className="space-y-2.5 mb-6">
                      {p.features.map(f => (
                        <li key={f} className="flex items-center gap-2.5 text-sm text-white/80">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="text-xs text-white/30 text-center">14 днів безкоштовно · Без картки</div>
                  </div>
                ))}
              </div>
              <div className="mt-6 p-5 rounded-2xl bg-white/5 border border-white/10 text-center">
                <span className="text-gray-400 text-sm">
                  Також доступні <span className="text-white font-semibold">окремі модулі</span> à la carte — наприклад, лише AI Inbox або Channel Manager. Уточнюйте у менеджера.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── SLIDE 8: CTA ── */}
        {slide === "cta" && (
          <div className="h-full flex flex-col items-center justify-center text-center px-8 relative overflow-hidden min-h-[80vh]">
            <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-3xl">
              <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-6">Наступний крок</div>
              <h2 className="text-5xl md:text-6xl font-black text-white mb-6 leading-none">
                Готові спробувати?
              </h2>
              <p className="text-xl text-gray-400 mb-12 leading-relaxed">
                14 днів безкоштовно. Без картки. Повний функціонал вибраного тарифу. Допоможемо налаштувати вашу першу властивість.
              </p>

              <div className="grid md:grid-cols-3 gap-5 mb-12">
                {[
                  { step: "01", title: "Реєстрація", desc: "Заповніть форму. 2 хвилини." },
                  { step: "02", title: "Онбординг", desc: "Wizard налаштує все за 30 хвилин." },
                  { step: "03", title: "Перше бронювання", desc: "Шахматка готова до роботи." },
                ].map(s => (
                  <div key={s.step} className="p-5 rounded-2xl bg-white/5 border border-white/10 text-left">
                    <div className="text-3xl font-black text-indigo-500/50 mb-2">{s.step}</div>
                    <div className="font-bold text-white mb-1">{s.title}</div>
                    <div className="text-sm text-gray-400">{s.desc}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a href={`${BASE}/`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-colors shadow-2xl shadow-indigo-600/30 text-base">
                  Почати безкоштовно <ExternalLink className="w-4 h-4" />
                </a>
                <div className="flex flex-col items-center sm:items-start text-left">
                  <span className="text-xs text-gray-500 mb-0.5">Контакти</span>
                  <span className="text-sm text-white font-semibold">@maisonhd_support</span>
                  <span className="text-xs text-gray-400">Telegram · Email · Телефон</span>
                </div>
              </div>

              <div className="mt-10 flex items-center justify-center gap-6 text-xs text-gray-600">
                <span>✓ Без картки</span>
                <span>✓ 14 днів Trial</span>
                <span>✓ Скасування в 1 клік</span>
                <span>✓ Міграція даних безкоштовно</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Keyboard nav hint ── */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-3 print:hidden">
          <button onClick={prev} disabled={idx === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-all">
            <ChevronLeft className="w-3.5 h-3.5" /> Назад
          </button>
          <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-500">
            {idx + 1} / {SLIDES.length} · {["Вступ","Проблема","Рішення","Модулі","Переваги","Порівняння","Тарифи","Контакт"][idx]}
          </div>
          <button onClick={next} disabled={idx === SLIDES.length - 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-all">
            Далі <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
