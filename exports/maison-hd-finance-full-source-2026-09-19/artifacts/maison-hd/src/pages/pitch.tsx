import { useState, useEffect } from "react";
import {
  ArrowLeft, Maximize2, Minimize2, ChevronLeft, ChevronRight, Download,
  CalendarDays, BarChart3, MessageSquare, Sparkles, Users, CreditCard,
  Globe, Zap, Shield, Clock, TrendingUp, Check, Star,
  Smartphone, FileText, Wrench, Utensils, Activity,
  Phone, Key, Leaf, Heart, UserCheck, ShoppingBag, Package,
  Moon, Coffee, Brain, Building2, Target, Layers,
  MapPin, Compass, Wifi, QrCode, ChefHat, Receipt, Warehouse,
  LayoutDashboard, Banknote, Truck, Printer, BarChart2,
  Mic, Bot, Cpu, Zap as ZapIcon, Award, Repeat,
  CheckCircle, ArrowRight, BedDouble, ClipboardList,
  PieChart, Timer, RefreshCw, Lock, Bell, User,
} from "lucide-react";

// ── Slide list ─────────────────────────────────────────────────────────────────
const SLIDES = [
  "hero", "overview", "hotel", "guest-portal", "guest-guide",
  "fb", "waiter", "boss", "ai",
] as const;
type Slide = typeof SLIDES[number];

const SLIDE_LABELS: Record<Slide, string> = {
  "hero": "Maison HD",
  "overview": "Огляд",
  "hotel": "🏨 Готель PMS",
  "guest-portal": "🏡 Guest Portal",
  "guest-guide": "🗺 Гостьовий Гід",
  "fb": "🍽 F&B Система",
  "waiter": "📱 Офіціант",
  "boss": "👑 Boss",
  "ai": "🤖 AI",
};

// ── Reusable components ────────────────────────────────────────────────────────

function SlideHeader({ tag, title, sub, tagColor = "text-indigo-400" }: {
  tag: string; title: React.ReactNode; sub?: string; tagColor?: string;
}) {
  return (
    <div className="text-center mb-10">
      <div className={`text-xs font-bold ${tagColor} uppercase tracking-widest mb-3`}>{tag}</div>
      <h2 className="text-4xl md:text-5xl font-black text-white mb-3 leading-tight">{title}</h2>
      {sub && <p className="text-gray-400 text-base md:text-lg max-w-2xl mx-auto">{sub}</p>}
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc, accent = "border-white/10", iconColor = "bg-indigo-500/20 text-indigo-300" }: {
  icon: any; title: string; desc: string; accent?: string; iconColor?: string;
}) {
  return (
    <div className={`p-4 rounded-2xl bg-white/5 border ${accent} hover:bg-white/8 transition-colors`}>
      <div className={`w-9 h-9 rounded-xl ${iconColor} flex items-center justify-center mb-3`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="font-bold text-white text-sm mb-1">{title}</div>
      <div className="text-xs text-gray-400 leading-relaxed">{desc}</div>
    </div>
  );
}

function Tag({ children, color = "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" }: {
  children: React.ReactNode; color?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${color}`}>
      {children}
    </span>
  );
}

function BulletList({ items, color = "text-indigo-400" }: { items: string[]; color?: string }) {
  return (
    <ul className="space-y-2">
      {items.map(item => (
        <li key={item} className="flex items-start gap-2 text-sm text-gray-300">
          <CheckCircle className={`w-4 h-4 ${color} shrink-0 mt-0.5`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PitchPage() {
  const [slide, setSlide] = useState<Slide>("hero");
  const [fullscreen, setFullscreen] = useState(false);
  const [printAll, setPrintAll] = useState(false);
  const idx = SLIDES.indexOf(slide);

  const prev = () => idx > 0 && setSlide(SLIDES[idx - 1]);
  const next = () => idx < SLIDES.length - 1 && setSlide(SLIDES[idx + 1]);
  const toggleFs = () => {
    if (!fullscreen) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
    setFullscreen(f => !f);
  };
  const handlePrint = () => {
    setPrintAll(true);
    setTimeout(() => {
      window.print();
      setPrintAll(false);
    }, 300);
  };

  return (
    <div className="min-h-screen bg-[#07091a] text-white font-sans flex flex-col select-none">

      {/* ── Control bar ─────────────────────────────────────────────────────── */}
      <div className="no-print flex items-center justify-between px-6 py-3 bg-black/60 border-b border-white/10 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-sm text-white font-medium transition-all">
            <ArrowLeft className="w-4 h-4" /> Назад
          </button>
          <span className="text-xs text-white/40 hidden sm:block">
            {SLIDE_LABELS[slide]} · {idx + 1}/{SLIDES.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {SLIDES.map((s) => (
            <button key={s} onClick={() => setSlide(s)} title={SLIDE_LABELS[s]}
              className={`h-1.5 rounded-full transition-all ${s === slide ? "bg-indigo-400 w-5" : "bg-white/20 hover:bg-white/40 w-1.5"}`} />
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={prev} disabled={idx === 0}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={next} disabled={idx === SLIDES.length - 1}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={handlePrint} title="Завантажити PDF" className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={toggleFs} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body { background: #07091a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-slide { display: block !important; page-break-after: always; break-after: page; min-height: 100vh; overflow: hidden; }
        }
        @media screen { .print-slide { display: contents; } }
      `}</style>

      {/* ── Slides ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ━━━ SLIDE 1: HERO ━━━ */}
        {(slide === "hero" || printAll) && (<div className="print-slide">
          <div className="min-h-[90vh] flex flex-col items-center justify-center text-center px-8 relative overflow-hidden py-16">
            <div className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full bg-blue-600/4 blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-5xl w-full">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-8">
                <Sparkles className="w-3.5 h-3.5" />
                Hospitality Operating System · Ukraine · 2026
              </div>

              {/* Logo */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30">
                  <Building2 className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-7xl md:text-9xl font-black leading-none tracking-tight">
                  <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Maison</span>
                  <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent ml-3">HD</span>
                </h1>
              </div>

              {/* Slogan */}
              <p className="text-2xl md:text-3xl font-bold text-white/90 max-w-3xl mx-auto leading-relaxed mb-4">
                Ваш готель нарешті<br />
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                  працює на вас.
                </span>
              </p>
              <p className="text-base text-gray-500 mb-14">
                Не просто PMS — повноцінна операційна система для готелів і ресторанів
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-12">
                {[
                  { val: "20+", label: "Модулів у системі" },
                  { val: "AI", label: "Вбудований GPT-5" },
                  { val: "360°", label: "Охоплення готелю" },
                  { val: "30 хв", label: "Старт з нуля" },
                ].map(s => (
                  <div key={s.val} className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/40 transition-colors">
                    <div className="text-3xl font-black text-indigo-400 mb-1">{s.val}</div>
                    <div className="text-xs text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Product tags */}
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "🏨 Готель PMS", "🍽 F&B Система", "📱 Офіціант App",
                  "🏡 Guest Portal", "🗺 Гостьовий Гід", "👑 Boss Dashboard",
                  "🤖 AI Inbox", "📞 Telephony AI", "📊 Rate Intelligence",
                  "🔑 Digital Key", "🧹 Housekeeping", "🌙 Night Audit",
                ].map(tag => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>)}

        {/* ━━━ SLIDE 2: OVERVIEW ━━━ */}
        {(slide === "overview" || printAll) && (<div className="print-slide">
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-5xl w-full">
              <SlideHeader
                tag="Що таке Maison HD"
                tagColor="text-violet-400"
                title={<>Одна система для <span className="text-indigo-400">готелю</span> і <span className="text-emerald-400">ресторану</span></>}
                sub="Maison HD об'єднує управління номерами, F&B, гостьовий сервіс та аналітику в єдину платформу з вбудованим AI"
              />

              <div className="grid md:grid-cols-2 gap-6 mb-8">
                {/* Hotel block */}
                <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-900/40 to-violet-900/30 border border-indigo-500/30">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                      <BedDouble className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <div className="font-bold text-white">Готельний блок</div>
                      <div className="text-xs text-indigo-300">PMS · Booking · Analytics</div>
                    </div>
                  </div>
                  <BulletList color="text-indigo-400" items={[
                    "Шахматка з drag & drop бронюванням",
                    "Housekeeping в реальному часі",
                    "Фінанси, рахунки, акти автоматично",
                    "Гостьовий портал (QR у номері)",
                    "Night Audit без людини",
                    "Loyalty Program + Upsell Engine",
                  ]} />
                </div>

                {/* F&B block */}
                <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-900/40 to-teal-900/30 border border-emerald-500/30">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                      <Utensils className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="font-bold text-white">F&B Блок</div>
                      <div className="text-xs text-emerald-300">Restaurant · Bar · Delivery</div>
                    </div>
                  </div>
                  <BulletList color="text-emerald-400" items={[
                    "Мобільний офіціант з QR-замовленням",
                    "Касовий термінал (Каса / ПРРО)",
                    "Складський облік і накладні",
                    "QR-меню для гостей без додатку",
                    "Аналітика по стравах і офіціантах",
                    "Boss Dashboard для власника",
                  ]} />
                </div>
              </div>

              {/* AI strip */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-violet-900/40 via-blue-900/30 to-indigo-900/40 border border-violet-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                    <Brain className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <div className="font-bold text-white">AI по всій системі</div>
                    <div className="text-xs text-violet-300">GPT-5 вбудований без доплат</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { icon: MessageSquare, label: "AI Inbox", desc: "Відповідає гостям в Telegram/Email/WhatsApp" },
                    { icon: Phone, label: "Telephony AI", desc: "Аналізує дзвінки, веде розмови, звітує" },
                    { icon: TrendingUp, label: "Rate Intelligence", desc: "Динамічні ціни на основі попиту та сезону" },
                    { icon: Mic, label: "Голосовий ввід", desc: "Диктуйте накладні — AI розпізнає і заповнює" },
                  ].map(f => (
                    <div key={f.label} className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <f.icon className="w-4 h-4 text-violet-400 mb-2" />
                      <div className="text-xs font-bold text-white mb-0.5">{f.label}</div>
                      <div className="text-[10px] text-gray-400 leading-snug">{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>)}

        {/* ━━━ SLIDE 3: HOTEL PMS ━━━ */}
        {(slide === "hotel" || printAll) && (<div className="print-slide">
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-6xl w-full">
              <SlideHeader
                tag="🏨 Готельний PMS"
                tagColor="text-indigo-400"
                title="Управління готелем без хаосу"
                sub="Повний операційний центр: від бронювання до нічного аудиту"
              />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  {
                    icon: CalendarDays, title: "Шахматка", color: "bg-indigo-500/20 text-indigo-300", border: "border-indigo-500/30",
                    items: ["Drag & drop бронювання", "Конфлікти виключені", "Фільтри по статусах", "Мультиоб'єкт"],
                  },
                  {
                    icon: Users, title: "Housekeeping", color: "bg-cyan-500/20 text-cyan-300", border: "border-cyan-500/30",
                    items: ["Авто-задачі після виїзду", "Статус прибирання live", "Фото-звіт покоївки", "Пріоритети по типах"],
                  },
                  {
                    icon: BarChart3, title: "Аналітика", color: "bg-violet-500/20 text-violet-300", border: "border-violet-500/30",
                    items: ["RevPAR, ADR, Occupancy", "Прогноз на 30 днів", "Аналіз по каналах", "Порівняння з минулим"],
                  },
                  {
                    icon: CreditCard, title: "Фінанси", color: "bg-emerald-500/20 text-emerald-300", border: "border-emerald-500/30",
                    items: ["Рахунки та акти PDF", "LiqPay / WayForPay", "Авторахунок при заїзді", "Мультивалютність"],
                  },
                  {
                    icon: Moon, title: "Night Audit", color: "bg-slate-500/20 text-slate-300", border: "border-slate-500/30",
                    items: ["Автозакриття доби", "Перенесення незакритих", "Звіти одразу вранці", "Без людини"],
                  },
                  {
                    icon: Heart, title: "Loyalty", color: "bg-pink-500/20 text-pink-300", border: "border-pink-500/30",
                    items: ["Бали за кожен ночleg", "Рівні Silver / Gold / VIP", "Персональні знижки", "Авто-нарахування"],
                  },
                  {
                    icon: Key, title: "Digital Key", color: "bg-yellow-500/20 text-yellow-300", border: "border-yellow-500/30",
                    items: ["Ключ у смартфоні", "Mobile check-in", "QR або NFC доступ", "Без черг на ресепшн"],
                  },
                  {
                    icon: ShoppingBag, title: "Upsell Engine", color: "bg-amber-500/20 text-amber-300", border: "border-amber-500/30",
                    items: ["Апселл при бронюванні", "Пізній виїзд / ранній заїзд", "Апгрейд номеру", "AI персоналізація"],
                  },
                ].map(m => (
                  <div key={m.title} className={`p-4 rounded-2xl bg-white/5 border ${m.border} hover:bg-white/8 transition-colors`}>
                    <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center mb-3`}>
                      <m.icon className="w-4 h-4" />
                    </div>
                    <div className="font-bold text-white text-sm mb-2">{m.title}</div>
                    <ul className="space-y-1">
                      {m.items.map(i => (
                        <li key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                          <span className="text-indigo-500 mt-0.5">·</span>{i}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-indigo-900/30 border border-indigo-500/30 text-center">
                  <div className="text-2xl font-black text-indigo-400 mb-1">+23%</div>
                  <div className="text-xs text-gray-400">RevPAR за 3 місяці з Rate Intelligence</div>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-900/30 border border-emerald-500/30 text-center">
                  <div className="text-2xl font-black text-emerald-400 mb-1">60%</div>
                  <div className="text-xs text-gray-400">Менше ручної роботи ресепшніста</div>
                </div>
                <div className="p-4 rounded-2xl bg-violet-900/30 border border-violet-500/30 text-center">
                  <div className="text-2xl font-black text-violet-400 mb-1">0</div>
                  <div className="text-xs text-gray-400">Жодного Excel у роботі готелю</div>
                </div>
              </div>
            </div>
          </div>
        </div>)}

        {/* ━━━ SLIDE 4: GUEST PORTAL ━━━ */}
        {(slide === "guest-portal" || printAll) && (<div className="print-slide">
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-5xl w-full">
              <SlideHeader
                tag="🏡 Guest Portal — Room Concierge"
                tagColor="text-teal-400"
                title="Самообслуговування 24/7 прямо з номера"
                sub="Гість сканує QR у номері і отримує повний доступ до сервісів готелю без дзвінків на ресепшн"
              />

              <div className="grid md:grid-cols-2 gap-8 mb-8">
                {/* Left: features */}
                <div className="space-y-3">
                  {[
                    {
                      icon: QrCode, title: "QR у кожному номері",
                      desc: "Унікальний QR прив'язаний до номера. Жодного завантаження додатку — відкривається у браузері.",
                      color: "bg-teal-500/20 text-teal-300",
                    },
                    {
                      icon: Utensils, title: "Замовлення їжі та напоїв",
                      desc: "Повне QR-меню з фото, алергенами, цінами. Замовлення потрапляє прямо на кухню.",
                      color: "bg-emerald-500/20 text-emerald-300",
                    },
                    {
                      icon: Bell, title: "Сервісні запити",
                      desc: "Прибирання, додаткові рушники, будильник, трансфер — все без дзвінків.",
                      color: "bg-blue-500/20 text-blue-300",
                    },
                    {
                      icon: Star, title: "Рейтинг та відгуки",
                      desc: "Гість ставить оцінку під час перебування. Проблема вирішується ще до виїзду.",
                      color: "bg-amber-500/20 text-amber-300",
                    },
                    {
                      icon: Globe, title: "Гостьовий гід онлайн",
                      desc: "Правила готелю, Wi-Fi, карта, ресторан, SPA — вся інформація в одному місці.",
                      color: "bg-violet-500/20 text-violet-300",
                    },
                    {
                      icon: Key, title: "Мобільний check-out",
                      desc: "Гість перевіряє рахунок і виїжджає без черги на ресепшн.",
                      color: "bg-rose-500/20 text-rose-300",
                    },
                  ].map(f => (
                    <div key={f.title} className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-teal-500/30 transition-colors">
                      <div className={`w-9 h-9 rounded-xl ${f.color} flex items-center justify-center shrink-0 mt-0.5`}>
                        <f.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm mb-0.5">{f.title}</div>
                        <div className="text-xs text-gray-400 leading-relaxed">{f.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: phone mockup */}
                <div className="flex flex-col justify-center">
                  <div className="relative mx-auto w-56">
                    {/* Phone frame */}
                    <div className="rounded-[2.5rem] border-4 border-white/20 bg-[#0f1020] overflow-hidden shadow-2xl shadow-indigo-500/20">
                      <div className="bg-[#0f1020] px-4 pt-6 pb-4">
                        {/* Status bar */}
                        <div className="flex justify-between items-center mb-4 px-1">
                          <span className="text-[9px] text-white/50">9:41</span>
                          <div className="w-16 h-4 bg-black rounded-full" />
                          <div className="flex gap-1 items-center">
                            <Wifi className="w-2.5 h-2.5 text-white/50" />
                            <span className="text-[9px] text-white/50">●●●</span>
                          </div>
                        </div>
                        {/* Header */}
                        <div className="text-center mb-4">
                          <div className="text-xs font-bold text-white">🏡 Кімната 204</div>
                          <div className="text-[10px] text-teal-400">Ласкаво просимо, Олексію!</div>
                        </div>
                        {/* Grid */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {[
                            { icon: "🍽", label: "Замовити їжу" },
                            { icon: "🧹", label: "Прибирання" },
                            { icon: "🛁", label: "Рушники" },
                            { icon: "⭐", label: "Відгук" },
                          ].map(t => (
                            <div key={t.label} className="bg-white/8 rounded-xl p-2.5 text-center border border-white/10">
                              <div className="text-lg mb-1">{t.icon}</div>
                              <div className="text-[9px] text-gray-300">{t.label}</div>
                            </div>
                          ))}
                        </div>
                        {/* Order */}
                        <div className="bg-emerald-900/40 rounded-xl p-2 border border-emerald-500/30">
                          <div className="text-[9px] text-emerald-400 font-bold mb-1">✓ Замовлення прийнято</div>
                          <div className="text-[9px] text-gray-400">Кава + круасан · 15 хв</div>
                        </div>
                      </div>
                    </div>
                    {/* Glow */}
                    <div className="absolute -inset-4 rounded-[3rem] bg-teal-500/10 blur-2xl -z-10" />
                  </div>

                  <div className="mt-8 space-y-3">
                    <div className="p-4 rounded-2xl bg-teal-900/30 border border-teal-500/30 text-center">
                      <div className="text-2xl font-black text-teal-400 mb-0.5">Без додатку</div>
                      <div className="text-xs text-gray-400">Відкривається у будь-якому браузері за QR</div>
                    </div>
                    <div className="p-4 rounded-2xl bg-indigo-900/30 border border-indigo-500/30 text-center">
                      <div className="text-2xl font-black text-indigo-400 mb-0.5">Мультимовність</div>
                      <div className="text-xs text-gray-400">Автоматичне визначення мови гостя</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>)}

        {/* ━━━ SLIDE 5: GUEST GUIDE ━━━ */}
        {(slide === "guest-guide" || printAll) && (<div className="print-slide">
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-5xl w-full">
              <SlideHeader
                tag="🗺 Гостьовий Гід — DOGODA"
                tagColor="text-emerald-400"
                title="Інтерактивна карта території"
                sub="Мобільний гід для гостей: пішохідні маршрути, точки інтересу, природа і локальні пам'ятки — без інтернету"
              />

              <div className="grid md:grid-cols-3 gap-4 mb-6">
                {[
                  {
                    icon: MapPin, title: "Інтерактивна карта", color: "bg-emerald-500/20 text-emerald-300", border: "border-emerald-500/30",
                    items: [
                      "Кастомна карта об'єкту",
                      "Точки інтересу з фото",
                      "Пішохідні маршрути",
                      "Відстані та час ходьби",
                    ],
                  },
                  {
                    icon: Compass, title: "Навігація по маршрутам", color: "bg-blue-500/20 text-blue-300", border: "border-blue-500/30",
                    items: [
                      "Кілька тематичних маршрутів",
                      "Перемикання між активними",
                      "Позначки з описами",
                      "Фото кожної зупинки",
                    ],
                  },
                  {
                    icon: Leaf, title: "POI — Точки інтересу", color: "bg-teal-500/20 text-teal-300", border: "border-teal-500/30",
                    items: [
                      "Дерева, рослини, пам'ятки",
                      "Повчальні картки з текстом",
                      "Категорії: природа / архітектура",
                      "Медіа прикріплення до точок",
                    ],
                  },
                  {
                    icon: Smartphone, title: "Офлайн доступ", color: "bg-violet-500/20 text-violet-300", border: "border-violet-500/30",
                    items: [
                      "PWA — без App Store",
                      "Кешується для роботи без мережі",
                      "Гість додає на екран",
                      "Push-нотифікації",
                    ],
                  },
                  {
                    icon: Globe, title: "Мультимовність", color: "bg-amber-500/20 text-amber-300", border: "border-amber-500/30",
                    items: [
                      "🇺🇦 Українська",
                      "🇬🇧 Англійська",
                      "🇩🇪 Інші мови за запитом",
                      "Авто-визначення мови браузера",
                    ],
                  },
                  {
                    icon: Building2, title: "Управління контентом", color: "bg-rose-500/20 text-rose-300", border: "border-rose-500/30",
                    items: [
                      "Адмін-панель для редагування",
                      "Додавання нових маршрутів",
                      "Завантаження фото",
                      "Публікація без розробника",
                    ],
                  },
                ].map(m => (
                  <div key={m.title} className={`p-4 rounded-2xl bg-white/5 border ${m.border} hover:bg-white/8 transition-colors`}>
                    <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center mb-3`}>
                      <m.icon className="w-4 h-4" />
                    </div>
                    <div className="font-bold text-white text-sm mb-2">{m.title}</div>
                    <ul className="space-y-1">
                      {m.items.map(i => (
                        <li key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                          <span className="text-emerald-500 mt-0.5">·</span>{i}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-900/30 to-teal-900/30 border border-emerald-500/30">
                <div className="text-sm font-bold text-white mb-3">Ідеально підходить для:</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Глемпінги та еко-садиби",
                    "Заміські готелі та SPA-комплекси",
                    "Туристичні об'єкти",
                    "Ресторани з територією",
                    "Агротуризм",
                    "Будь-який об'єкт з екскурсійною зоною",
                  ].map(t => (
                    <span key={t} className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>)}

        {/* ━━━ SLIDE 6: F&B ━━━ */}
        {(slide === "fb" || printAll) && (<div className="print-slide">
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-6xl w-full">
              <SlideHeader
                tag="🍽 F&B Система"
                tagColor="text-orange-400"
                title="Ресторан і бар під повним контролем"
                sub="Від прийняття замовлення до складського обліку — єдина система без паперів і Excel"
              />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  {
                    icon: ClipboardList, title: "Меню", color: "bg-orange-500/20 text-orange-300", border: "border-orange-500/30",
                    items: ["Ієрархічне дерево категорій", "Drag & drop між станціями", "Фото, алергени, теги", "Техкарти та собівартість"],
                  },
                  {
                    icon: QrCode, title: "QR-меню", color: "bg-amber-500/20 text-amber-300", border: "border-amber-500/30",
                    items: ["Гість сканує зі столика", "Замовляє без офіціанта", "Оплата онлайн (LiqPay)", "Авто-чайові p2p"],
                  },
                  {
                    icon: Receipt, title: "Каса / ПРРО", color: "bg-yellow-500/20 text-yellow-300", border: "border-yellow-500/30",
                    items: ["Відкриття/закриття зміни", "X-звіт та Y-звіт", "Готівка / картка / LiqPay", "ПРРО інтеграція"],
                  },
                  {
                    icon: Warehouse, title: "Склад", color: "bg-lime-500/20 text-lime-300", border: "border-lime-500/30",
                    items: ["Накладні з AI-скануванням", "Голосовий ввід позицій", "Списання по техкартах", "Залишки в реальному часі"],
                  },
                  {
                    icon: BarChart2, title: "Аналітика", color: "bg-emerald-500/20 text-emerald-300", border: "border-emerald-500/30",
                    items: ["ABC-аналіз страв", "Аналіз по офіціантах", "Динаміка виручки", "AI-звіт природною мовою"],
                  },
                  {
                    icon: Users, title: "Персонал", color: "bg-teal-500/20 text-teal-300", border: "border-teal-500/30",
                    items: ["Ролі: касир, офіціант", "PIN-авторизація", "Ліміт знижок по ролях", "Журнал дій"],
                  },
                  {
                    icon: Heart, title: "Маркетинг", color: "bg-pink-500/20 text-pink-300", border: "border-pink-500/30",
                    items: ["Програма лояльності", "Клієнтська база CRM", "Групові знижки", "Промоакції та виключення"],
                  },
                  {
                    icon: Truck, title: "Delivery", color: "bg-blue-500/20 text-blue-300", border: "border-blue-500/30",
                    items: ["Замовлення на доставку", "Відстеження статусу", "Інтеграція з ботами", "Telegram-замовлення"],
                  },
                ].map(m => (
                  <div key={m.title} className={`p-4 rounded-2xl bg-white/5 border ${m.border} hover:bg-white/8 transition-colors`}>
                    <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center mb-3`}>
                      <m.icon className="w-4 h-4" />
                    </div>
                    <div className="font-bold text-white text-sm mb-2">{m.title}</div>
                    <ul className="space-y-1">
                      {m.items.map(i => (
                        <li key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                          <span className="text-orange-500 mt-0.5">·</span>{i}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-orange-900/20 border border-orange-500/30">
                  <div className="text-sm font-bold text-white mb-2">🏗 Мульти-точкова архітектура</div>
                  <div className="text-xs text-gray-400">Кухня · Бар · Тераса · Доставка — єдиний склад, окремі меню та каси. Категорії перетягуються між станціями drag & drop.</div>
                </div>
                <div className="p-4 rounded-2xl bg-amber-900/20 border border-amber-500/30">
                  <div className="text-sm font-bold text-white mb-2">💸 Авто-чайові на карту</div>
                  <div className="text-xs text-gray-400">Гість платить через QR → чайові автоматично перераховуються на картку офіціанта через LiqPay P2P без участі касира.</div>
                </div>
              </div>
            </div>
          </div>
        </div>)}

        {/* ━━━ SLIDE 7: WAITER ━━━ */}
        {(slide === "waiter" || printAll) && (<div className="print-slide">
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-5xl w-full">
              <SlideHeader
                tag="📱 Мобільний Офіціант"
                tagColor="text-blue-400"
                title="Весь ресторан у руках офіціанта"
                sub="PWA-додаток для Android та iOS. Встановлюється з QR за 10 секунд. Без App Store."
              />

              <div className="grid md:grid-cols-2 gap-8">
                {/* Features */}
                <div className="space-y-3">
                  {[
                    {
                      icon: LayoutDashboard, title: "Карта залу",
                      desc: "Схема столиків з кольоровими статусами: вільний / зайнятий / потребує прибирання / рахунок запитано.",
                      color: "bg-blue-500/20 text-blue-300",
                    },
                    {
                      icon: ClipboardList, title: "Прийняття замовлень",
                      desc: "Пошук по назві страви. Модифікатори і примітки. Розбивка по стравах для різних гостей.",
                      color: "bg-indigo-500/20 text-indigo-300",
                    },
                    {
                      icon: ChefHat, title: "KDS — Кухонний дисплей",
                      desc: "Замовлення миттєво з'являються на кухонному екрані. Статуси: нове / готується / готово.",
                      color: "bg-orange-500/20 text-orange-300",
                    },
                    {
                      icon: Receipt, title: "Розрахунок і оплата",
                      desc: "Розбивка рахунку між гостями. Частковий розрахунок. LiqPay QR прямо з телефону.",
                      color: "bg-emerald-500/20 text-emerald-300",
                    },
                    {
                      icon: Timer, title: "Таймер приготування",
                      desc: "Офіціант бачить скільки ще чекати кожну страву. Гість завжди поінформований.",
                      color: "bg-yellow-500/20 text-yellow-300",
                    },
                    {
                      icon: Bell, title: "Push-нотифікації",
                      desc: "«Замовлення 12 готове» · «Стіл 5 просить рахунок» — повідомлення в реальному часі.",
                      color: "bg-violet-500/20 text-violet-300",
                    },
                  ].map(f => (
                    <div key={f.title} className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/30 transition-colors">
                      <div className={`w-9 h-9 rounded-xl ${f.color} flex items-center justify-center shrink-0`}>
                        <f.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm mb-0.5">{f.title}</div>
                        <div className="text-xs text-gray-400 leading-relaxed">{f.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Phone mockup */}
                <div className="flex flex-col items-center justify-center gap-6">
                  <div className="relative mx-auto w-52">
                    <div className="rounded-[2.5rem] border-4 border-white/20 bg-[#0f1020] overflow-hidden shadow-2xl shadow-blue-500/20">
                      <div className="p-4 pt-8">
                        <div className="text-center mb-4">
                          <div className="text-xs font-bold text-blue-400">Офіціант · Іван</div>
                          <div className="text-[9px] text-gray-500">Зміна відкрита · 4 столи</div>
                        </div>
                        {/* Table grid */}
                        <div className="grid grid-cols-3 gap-1.5 mb-3">
                          {[
                            { n: "01", s: "free" },
                            { n: "02", s: "busy" },
                            { n: "03", s: "busy" },
                            { n: "04", s: "bill" },
                            { n: "05", s: "free" },
                            { n: "06", s: "clean" },
                          ].map(t => (
                            <div key={t.n} className={`rounded-xl p-2 text-center border ${
                              t.s === "free" ? "bg-emerald-900/40 border-emerald-500/30 text-emerald-400" :
                              t.s === "busy" ? "bg-blue-900/40 border-blue-500/30 text-blue-400" :
                              t.s === "bill" ? "bg-amber-900/40 border-amber-500/30 text-amber-400" :
                              "bg-gray-800/40 border-gray-600/30 text-gray-400"
                            }`}>
                              <div className="text-[10px] font-bold">#{t.n}</div>
                              <div className="text-[8px] opacity-70">
                                {t.s === "free" ? "Вільний" : t.s === "busy" ? "Замовл." : t.s === "bill" ? "Рахунок" : "Прибрати"}
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Notification */}
                        <div className="bg-violet-900/50 rounded-xl p-2 border border-violet-500/30">
                          <div className="text-[9px] font-bold text-violet-300">🔔 Стіл 04</div>
                          <div className="text-[9px] text-gray-400">Паста карбонара — готово!</div>
                        </div>
                      </div>
                    </div>
                    <div className="absolute -inset-4 rounded-[3rem] bg-blue-500/10 blur-2xl -z-10" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 w-full">
                    <div className="p-3 rounded-2xl bg-blue-900/30 border border-blue-500/30 text-center">
                      <div className="text-lg font-black text-blue-400">PWA</div>
                      <div className="text-[10px] text-gray-400">Без App Store, без iOS/Android обмежень</div>
                    </div>
                    <div className="p-3 rounded-2xl bg-indigo-900/30 border border-indigo-500/30 text-center">
                      <div className="text-lg font-black text-indigo-400">Offline</div>
                      <div className="text-[10px] text-gray-400">Меню кешується, замовлення зберігаються</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>)}

        {/* ━━━ SLIDE 8: BOSS ━━━ */}
        {(slide === "boss" || printAll) && (<div className="print-slide">
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-5xl w-full">
              <SlideHeader
                tag="👑 Boss Dashboard — Owner Access"
                tagColor="text-amber-400"
                title="Ключові метрики бізнесу в одному екрані"
                sub="Мобільний дашборд для власника. Вся картина по готелю і ресторану — за 5 секунд, з телефону, без VPN"
              />

              <div className="grid md:grid-cols-2 gap-8 mb-6">
                {/* Metrics */}
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-gray-900 border border-white/10">
                    <div className="text-xs text-gray-400 mb-3 font-semibold uppercase tracking-wider">Що бачить власник</div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { icon: Banknote, label: "Виручка F&B", val: "₴ сьогодні/тиждень/місяць", color: "text-emerald-400" },
                        { icon: Receipt, label: "Чеки", val: "Кількість і середній чек", color: "text-blue-400" },
                        { icon: CreditCard, label: "Каса", val: "Готівка / картка / LiqPay", color: "text-violet-400" },
                        { icon: BarChart3, label: "Тренд", val: "Bar chart останніх 7 днів", color: "text-amber-400" },
                        { icon: ShoppingBag, label: "Топ страви", val: "5 лідерів за виручкою", color: "text-orange-400" },
                        { icon: BedDouble, label: "Номери", val: "Occupancy%, заїзди/виїзди", color: "text-teal-400" },
                      ].map(m => (
                        <div key={m.label} className="flex items-start gap-2 p-2.5 rounded-xl bg-white/5">
                          <m.icon className={`w-4 h-4 ${m.color} shrink-0 mt-0.5`} />
                          <div>
                            <div className="text-[10px] font-bold text-white">{m.label}</div>
                            <div className="text-[9px] text-gray-500">{m.val}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon: RefreshCw, label: "Авто-оновлення", sub: "Кожні 2 хвилини" },
                      { icon: Smartphone, label: "Mobile-first", sub: "Оптимізовано для телефону" },
                      { icon: Lock, label: "Захищено", sub: "JWT авторизація" },
                    ].map(f => (
                      <div key={f.label} className="p-3 rounded-2xl bg-amber-900/20 border border-amber-500/30 text-center">
                        <f.icon className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                        <div className="text-[10px] font-bold text-white">{f.label}</div>
                        <div className="text-[9px] text-gray-400">{f.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Phone mockup */}
                <div className="flex items-center justify-center">
                  <div className="relative w-52">
                    <div className="rounded-[2.5rem] border-4 border-white/20 bg-[#f9fafb] overflow-hidden shadow-2xl shadow-amber-500/20">
                      <div className="bg-white px-4 py-3">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <div className="text-xs font-bold text-gray-900">Maison HD</div>
                            <div className="text-[8px] text-gray-400">вівторок, 20 травня</div>
                          </div>
                          <div className="bg-amber-100 text-amber-700 text-[8px] font-bold px-1.5 py-0.5 rounded-full">Boss</div>
                        </div>
                        {/* Revenue card */}
                        <div className="bg-gray-900 rounded-xl p-3 mb-2">
                          <div className="text-[8px] text-gray-400 mb-0.5">Виручка сьогодні</div>
                          <div className="text-lg font-black text-white">₴ 18 450</div>
                          <div className="text-[8px] text-gray-400">47 чеків · середній ₴ 393</div>
                        </div>
                        {/* Stats row */}
                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                          <div className="bg-green-50 rounded-xl p-2 border border-green-100">
                            <div className="text-[8px] text-green-600">Готівка</div>
                            <div className="text-[11px] font-bold text-gray-900">₴ 7 200</div>
                          </div>
                          <div className="bg-blue-50 rounded-xl p-2 border border-blue-100">
                            <div className="text-[8px] text-blue-600">Картка</div>
                            <div className="text-[11px] font-bold text-gray-900">₴ 11 250</div>
                          </div>
                        </div>
                        {/* Mini chart */}
                        <div className="bg-gray-50 rounded-xl p-2 border border-gray-100">
                          <div className="text-[8px] text-gray-400 mb-1">7 днів</div>
                          <div className="flex items-end gap-0.5 h-8">
                            {[40, 65, 45, 80, 60, 90, 100].map((h, i) => (
                              <div key={i} className={`flex-1 rounded-sm ${i === 6 ? "bg-gray-900" : "bg-gray-200"}`}
                                style={{ height: `${h}%` }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="absolute -inset-4 rounded-[3rem] bg-amber-500/10 blur-2xl -z-10" />
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-900/30 to-orange-900/30 border border-amber-500/30 text-center">
                <p className="text-sm text-white font-medium">
                  "Ваш готель нарешті працює на вас — відкрийте дашборд і знайте все за 5 секунд"
                </p>
                <p className="text-xs text-gray-400 mt-1">Доступ за URL + логін. Без VPN. Будь-де у світі.</p>
              </div>
            </div>
          </div>
        </div>)}

        {/* ━━━ SLIDE 9: AI ━━━ */}
        {(slide === "ai" || printAll) && (<div className="print-slide">
          <div className="min-h-[90vh] flex flex-col items-center justify-center px-8 py-16">
            <div className="max-w-5xl w-full">
              <SlideHeader
                tag="🤖 AI по всій системі"
                tagColor="text-violet-400"
                title={<>Штучний інтелект вбудований, <span className="text-violet-400">не прикрутлений</span></>}
                sub="GPT-5 працює скрізь — від відповіді гостю до аналізу виручки. Без доплат, без налаштувань."
              />

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                {[
                  {
                    icon: MessageSquare, title: "AI Inbox — Єдина поштова скринька",
                    color: "bg-blue-500/20 text-blue-300", border: "border-blue-500/30",
                    tag: "GPT-5",
                    features: [
                      "Telegram + WhatsApp + Email в одному вікні",
                      "GPT-5 пише чернетки відповідей за 1 секунду",
                      "Відповідає голосом гостя (тон, мова)",
                      "Авто-тегування: бронювання / скарга / питання",
                    ],
                  },
                  {
                    icon: Phone, title: "Telephony AI — Розумний дзвінок",
                    color: "bg-orange-500/20 text-orange-300", border: "border-orange-500/30",
                    tag: "Binotel",
                    features: [
                      "Транскрипція дзвінка в текст після розмови",
                      "AI-summary: що запитав гість, що пообіцяв персонал",
                      "IVR-меню без програміста",
                      "WebRTC внутрішній зв'язок (ресепшн ↔ покоївки)",
                    ],
                  },
                  {
                    icon: TrendingUp, title: "Rate Intelligence — Динамічні ціни",
                    color: "bg-emerald-500/20 text-emerald-300", border: "border-emerald-500/30",
                    tag: "Прогноз",
                    features: [
                      "AI аналізує завантаженість на 30 днів вперед",
                      "Автоматично підвищує ціни в пік попиту",
                      "Сезонні стратегії та yield-менеджмент",
                      "Порівняння з конкурентами в реальному часі",
                    ],
                  },
                  {
                    icon: Mic, title: "Голосовий ввід — Склад без рук",
                    color: "bg-rose-500/20 text-rose-300", border: "border-rose-500/30",
                    tag: "Speech AI",
                    features: [
                      "Диктуйте накладну голосом на телефоні",
                      "AI розпізнає позиції, кількість і одиниці",
                      "Заповнює форму автоматично",
                      "Підтримка «200 грамів масла» і «3 кг цукру»",
                    ],
                  },
                  {
                    icon: Bot, title: "AI Scan — Фото накладної",
                    color: "bg-teal-500/20 text-teal-300", border: "border-teal-500/30",
                    tag: "OCR + AI",
                    features: [
                      "Сфотографуйте паперову накладну",
                      "AI розпізнає текст і розбирає позиції",
                      "Авто-матчинг з товарами на складі",
                      "Економить 15 хвилин на кожній накладній",
                    ],
                  },
                  {
                    icon: BarChart3, title: "AI-звіт природною мовою",
                    color: "bg-violet-500/20 text-violet-300", border: "border-violet-500/30",
                    tag: "Analytics AI",
                    features: [
                      "«Що продавалось найкраще цього тижня?»",
                      "«Порівняй виторг вівторка і п'ятниці»",
                      "Текстова відповідь з числами та графіком",
                      "Без SQL, без Excel — просто питання",
                    ],
                  },
                ].map(m => (
                  <div key={m.title} className={`p-5 rounded-2xl bg-white/5 border ${m.border} hover:bg-white/8 transition-colors`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center`}>
                        <m.icon className="w-4 h-4" />
                      </div>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${m.border} ${m.color}`}>{m.tag}</span>
                    </div>
                    <div className="font-bold text-white text-sm mb-2">{m.title}</div>
                    <ul className="space-y-1">
                      {m.features.map(f => (
                        <li key={f} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                          <Sparkles className="w-2.5 h-2.5 text-violet-400 shrink-0 mt-0.5" />{f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="p-5 rounded-3xl bg-gradient-to-r from-violet-900/30 via-indigo-900/30 to-blue-900/30 border border-violet-500/30 text-center">
                <Sparkles className="w-6 h-6 text-violet-400 mx-auto mb-2" />
                <p className="text-base font-bold text-white mb-1">
                  Maison HD — Hospitality OS. Де система контролює процеси, а не навпаки.
                </p>
                <p className="text-sm text-gray-400">
                  Готель і ресторан, які працюють на вас — навіть коли вас немає поруч.
                </p>
              </div>
            </div>
          </div>
        </div>)}

      </div>

      {/* ── Bottom nav hint ─────────────────────────────────────────────────────── */}
      <div className="no-print flex items-center justify-between px-6 py-3 bg-black/40 border-t border-white/10 text-xs text-white/30">
        <span>{SLIDE_LABELS[slide]}</span>
        <div className="flex items-center gap-4">
          {idx > 0 && (
            <button onClick={prev} className="flex items-center gap-1 hover:text-white/60 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> {SLIDE_LABELS[SLIDES[idx - 1]]}
            </button>
          )}
          {idx < SLIDES.length - 1 && (
            <button onClick={next} className="flex items-center gap-1 hover:text-white/60 transition-colors">
              {SLIDE_LABELS[SLIDES[idx + 1]]} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <span>{idx + 1} / {SLIDES.length}</span>
      </div>
    </div>
  );
}
