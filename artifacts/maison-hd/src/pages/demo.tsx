import { useState, useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import DemoVideoPlayer from "@/components/DemoVideoPlayer";
import {
  ChevronRight, ArrowRight, Check, BedDouble, BarChart3,
  MessageSquare, Users, Zap, Globe2, Shield, TrendingUp,
  Calendar, Star, Hotel, Clock, Play, X,
  Wand2, Tv, LayoutDashboard, QrCode, BrainCircuit,
} from "lucide-react";
import { MaisonLogo } from "@/components/MaisonLogo";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_URL = BASE.replace("/maison-hd", "") + "/api";

// ── Dashboard mockup data ─────────────────────────────────────────
const KPI = [
  { label: "Дохід (місяць)",   value: "₴ 277 200", delta: "+18%", up: true },
  { label: "Завантаженість",   value: "87%",        delta: "+4%",  up: true },
  { label: "ADR",              value: "₴ 2 850",    delta: "+11%", up: true },
  { label: "RevPAR",           value: "₴ 2 480",    delta: "+9%",  up: true },
];

const CHESS_CELLS = [
  ["ci","oc","oc","av","av","ci","oc","oc","av","av","ci","oc"],
  ["oc","oc","av","av","ci","oc","oc","oc","ci","ci","oc","av"],
  ["av","ci","ci","oc","oc","av","ci","ci","oc","av","av","ci"],
  ["ci","oc","oc","av","ci","ci","oc","av","av","ci","oc","oc"],
  ["oc","av","ci","ci","oc","oc","av","ci","oc","oc","av","ci"],
  ["av","oc","oc","av","ci","oc","oc","oc","ci","av","ci","oc"],
];
const CELL_CLR: Record<string, string> = {
  ci: "bg-emerald-500/80", oc: "bg-indigo-500/70", av: "bg-white/8",
};

const FEATURES = [
  { icon: Calendar,       title: "Шахматка бронювань",      desc: "Drag-and-drop grid. Всі юніти. 60-денний вид. Без плутанини." },
  { icon: BarChart3,      title: "Аналітика власника",       desc: "ADR, RevPAR, Occupancy, Revenue — в реальному часі." },
  { icon: Globe2,         title: "OTA-синхронізація",        desc: "Booking.com, Airbnb, Expedia. Один інвентар, жодного овербукінгу." },
  { icon: MessageSquare,  title: "Unified Inbox",            desc: "SMS, Email, Telegram — один потік. Жодного пропущеного запиту." },
  { icon: Zap,            title: "Автоматизація",            desc: "Нічний аудит, HK-завдання, нагадування — без ручного втручання." },
  { icon: Users,          title: "Ролева система",           desc: "Власник → Менеджер → Ресепшн → Покоївка. Чіткі права доступу." },
  { icon: Shield,         title: "Фіскальний модуль",       desc: "Checkbox ПРРО, VCHASNO, ПДВ — вбудована комплаєнс-модель." },
  { icon: TrendingUp,     title: "Yield Management",         desc: "Динамічні ціни. Сезонні множники. Пакети. Знижки зі стратегією." },
  { icon: Wand2,          title: "Майстер налаштування",     desc: "Покроковий онбординг від першого входу до повноцінної роботи. Підключення за 48 годин — без участі ІТ-команди.", highlight: true },
  { icon: Tv,             title: "Hotel TV",                 desc: "Цифровий канал для кожного номера: вітання гостя, QR-меню, акції та сервісні оголошення — без додаткового обладнання.", highlight: true },
  { icon: LayoutDashboard, title: "Кабінет гостя",          desc: "Особистий портал: бронювання, сервісні запити, рахунки та документи — доступні гостю через одне посилання.", highlight: true },
  { icon: QrCode,         title: "Онлайн чекін / чекаут",   desc: "Гість прибуває і від'їжджає без черги та паперів. Верифікація, цифровий ключ і закриття рахунку — через смартфон.", highlight: true },
  { icon: BrainCircuit,   title: "AI Hub",                   desc: "Вбудований AI-асистент прискорює обробку запитів, генерує звіти, підказує цінові рішення та автоматизує щоденні комунікації.", highlight: true },
];

const TESTIMONIALS = [
  { name: "Олена Коваль",      role: "Директор, «Карпатський рай»",   text: "1 адмін замість 3. Система сама ставить задачі, розподіляє кімнати, формує звіти.", stars: 5 },
  { name: "Іван Мельник",      role: "Власник, Bukovel Resort",        text: "Шахматка бронювань — найкраще що ми бачили. Персонал освоїв за 2 дні.", stars: 5 },
  { name: "Марина Дорошенко",  role: "GM, готель «Панорама»",          text: "OTA-синк і аналітика — ось чому ми зросли на 23% за перший квартал.", stars: 5 },
];

const PLANS = [
  { name: "Starter",    uah: "2 900",  desc: "До 20 юнітів", features: ["Шахматка", "Бронювання", "Базова аналітика", "1 OTA-канал"] },
  { name: "Pro",        uah: "5 900",  desc: "До 80 юнітів", features: ["Все зі Starter", "SPA + Events", "Inbox", "3 OTA-канали", "Автоматизація"], hot: true },
  { name: "Enterprise", uah: "custom", desc: "Без обмежень",  features: ["Все з Pro", "White-label", "API доступ", "Yield Management", "Менеджер акаунту"] },
];

// ── Animation hook ────────────────────────────────────────────────
function useVisible(ref: React.RefObject<HTMLElement | null>) {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.15 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return vis;
}

// ── Dashboard mockup component ───────────────────────────────────
function DashboardMockup() {
  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Glow */}
      <div className="absolute -inset-4 bg-indigo-600/20 blur-3xl rounded-3xl pointer-events-none" />

      {/* Browser chrome */}
      <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60 bg-[#1a1d2e]">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-[#12141f] border-b border-white/5">
          <span className="w-3 h-3 rounded-full bg-red-400/70" />
          <span className="w-3 h-3 rounded-full bg-amber-400/70" />
          <span className="w-3 h-3 rounded-full bg-emerald-400/70" />
          <div className="flex-1 mx-3 h-5 bg-white/5 rounded-full flex items-center px-3">
            <span className="text-[10px] text-white/30">maisonhd.app/dashboard</span>
          </div>
        </div>

        {/* Sidebar + content */}
        <div className="flex h-[420px]">
          {/* Sidebar */}
          <div className="w-12 bg-[#12141f] border-r border-white/5 flex flex-col items-center py-4 gap-3">
            <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center">
              <BedDouble className="w-3.5 h-3.5 text-white" />
            </div>
            {[BarChart3, Calendar, Users, MessageSquare, Zap].map((Icon, i) => (
              <div key={i} className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
                <Icon className="w-3 h-3 text-white/40" />
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-hidden p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">Дашборд власника</div>
                <div className="text-[10px] text-white/30">DOGODA RESORT · Квітень 2026</div>
              </div>
              <div className="flex gap-1.5">
                <div className="h-6 px-2.5 bg-indigo-600 rounded-lg flex items-center text-[10px] text-white font-semibold">Сьогодні</div>
                <div className="h-6 px-2.5 bg-white/5 rounded-lg flex items-center text-[10px] text-white/40">Тиждень</div>
              </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-4 gap-2">
              {KPI.map((k, i) => (
                <div key={i} className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                  <div className="text-[9px] text-white/40 mb-1">{k.label}</div>
                  <div className="text-xs font-black text-white leading-tight">{k.value}</div>
                  <div className={`text-[9px] font-bold mt-1 ${k.up ? "text-emerald-400" : "text-red-400"}`}>{k.delta}</div>
                </div>
              ))}
            </div>

            {/* Revenue chart placeholder */}
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-semibold text-white/60">Дохід по місяцях</span>
                <span className="text-[10px] text-emerald-400 font-bold">+18% YoY</span>
              </div>
              <div className="flex items-end gap-1 h-16">
                {[40, 55, 45, 70, 62, 80, 75, 90, 85, 100, 88, 95].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end gap-0.5">
                    <div
                      style={{ height: `${h}%` }}
                      className={`rounded-sm ${i === 11 ? "bg-indigo-500" : i > 8 ? "bg-indigo-500/60" : "bg-white/15"}`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1">
                {["Кв", "Лю", "Бе", "Кв", "Тр", "Чр", "Лп", "Сп", "Вр", "Жо", "Лс", "Гр"].map((m, i) => (
                  <span key={i} className="text-[7px] text-white/20 flex-1 text-center">{m}</span>
                ))}
              </div>
            </div>

            {/* Chess mini */}
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-semibold text-white/60">Шахматка бронювань</span>
                <div className="flex gap-1.5">
                  <span className="flex items-center gap-1 text-[8px] text-white/30"><span className="w-2 h-2 rounded-sm bg-emerald-500/80 inline-block"/>Заїзд</span>
                  <span className="flex items-center gap-1 text-[8px] text-white/30"><span className="w-2 h-2 rounded-sm bg-indigo-500/70 inline-block"/>Проживає</span>
                </div>
              </div>
              <div className="space-y-0.5">
                {CHESS_CELLS.slice(0, 4).map((row, ri) => (
                  <div key={ri} className="flex gap-0.5">
                    <div className="w-8 shrink-0 text-[7px] text-white/20 flex items-center">А-{ri + 101}</div>
                    {row.map((c, ci) => (
                      <div key={ci} className={`flex-1 h-4 rounded-[2px] ${CELL_CLR[c]}`} />
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

// ── Animated counter ─────────────────────────────────────────────
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const vis = useVisible(ref as any);

  useEffect(() => {
    if (!vis) return;
    let start = 0;
    const step = target / 60;
    const t = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(t); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(t);
  }, [vis, target]);

  return <span ref={ref}>{count.toLocaleString("uk-UA")}{suffix}</span>;
}

// ── Main landing ──────────────────────────────────────────────────
export default function DemoPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", propertiesCount: "1", message: "" });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.company.trim()) {
      toast({ title: "Заповніть обов'язкові поля", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/demo-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, propertiesCount: parseInt(form.propertiesCount) || 1, source: "landing_page" }),
      });
      if (!res.ok) throw new Error("Помилка відправки");
      setSubmitted(true);
    } catch {
      toast({ title: "Помилка відправки", description: "Спробуйте ще раз або напишіть на info@maisonhd.com", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050914] text-white antialiased">

      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 bg-[#050914]/80 backdrop-blur-xl border-b border-white/5">
        <MaisonLogo size={34} textVariant="dark" />
        <div className="hidden md:flex items-center gap-8 text-sm text-white/50">
          {[["Продукт","#features"], ["Рішення","#solution"], ["Ціни","#pricing"], ["Відгуки","#testimonials"]].map(([l, h]) => (
            <a key={l} href={h} className="hover:text-white transition-colors">{l}</a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <a href={`${BASE}/login`} className="text-sm text-white/50 hover:text-white transition-colors hidden md:block">Увійти</a>
          <a href="#demo-form" className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/25">
            Запросити демо <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-20">
        {/* Background gradient */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-indigo-600/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-violet-600/8 blur-[100px] rounded-full" />
          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 py-16 md:py-24 grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: text */}
          <div>
            {/* Tag */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-white/60 font-medium mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Hospitality System Development
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight mb-4">
              <span className="block text-white">Maison HD</span>
            </h1>
            <p className="text-2xl md:text-3xl font-light text-white/40 mb-6 leading-tight">
              RevPAR — це лише поверхня
            </p>

            {/* Main copy */}
            <h2 className="text-xl md:text-2xl font-bold text-white mb-4 leading-tight">
              Керуйте готелем через<br className="hidden md:block" /> систему, а не через людей
            </h2>
            <p className="text-base text-white/50 leading-relaxed mb-10 max-w-md">
              Побудуйте операційну модель, де <strong className="text-white">1 адміністратор замість 3</strong>, а всі процеси — від бронювання до сервісу — працюють автоматично.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              <a href="#demo-form"
                className="flex items-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-2xl transition-all shadow-xl shadow-indigo-600/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
              >
                Запросити демо <ArrowRight className="w-4 h-4" />
              </a>
              <button
                onClick={() => setVideoOpen(true)}
                className="flex items-center gap-2 px-6 py-3.5 border border-white/10 hover:border-white/25 bg-white/5 hover:bg-white/10 text-white/80 font-semibold text-sm rounded-2xl transition-all"
              >
                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                  <Play className="w-2.5 h-2.5 text-white fill-white ml-0.5" />
                </div>
                Подивитись як це працює
              </button>
            </div>

            {/* Trust line */}
            <p className="text-xs text-white/25 mt-6">14 днів безкоштовно · Без кредитної картки · Міграція з будь-якої PMS</p>
          </div>

          {/* Right: Dashboard mockup */}
          <div className="hidden lg:block">
            <DashboardMockup />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
          <div className="w-px h-12 bg-gradient-to-b from-white/20 to-transparent" />
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: 500, suffix: "+", label: "Об'єктів довіряють" },
            { value: 50000, suffix: "+", label: "Бронювань / місяць" },
            { value: 98, suffix: "%", label: "Задоволеність" },
            { value: 24, suffix: "/7", label: "Підтримка" },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-4xl md:text-5xl font-black text-white mb-1">
                <Counter target={s.value} suffix={s.suffix} />
              </div>
              <div className="text-sm text-white/35 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SOLUTION ── */}
      <section id="solution" className="py-24 px-6 md:px-12 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Left: problem vs solution */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-xs text-red-400 font-semibold">
              ❌ Як зараз у більшості готелів
            </div>
            {["3+ адміністратори на зміну", "Excel-таблиці і WhatsApp-чати", "Ручний облік і помилки в рахунках", "OTA — вручну, кожен день", "Звіт готується 2 години"].map((t, i) => (
              <div key={i} className="flex items-center gap-3 text-white/40 text-sm line-through decoration-red-500/50">
                <X className="w-4 h-4 text-red-500/50 shrink-0" /> {t}
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 font-semibold">
              ✅ З Maison HD
            </div>
            {["1 адміністратор керує всім", "Єдина система — нічого поза нею", "Автоматичні рахунки і фіскальні чеки", "OTA синхронізується в реальному часі", "Дашборд власника — завжди актуальний"].map((t, i) => (
              <div key={i} className="flex items-center gap-3 text-white text-sm font-medium">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" /> {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-24 px-6 md:px-12 bg-white/[0.015] border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3">Платформа</p>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">Повний Hospitality OS</h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto">Не набір інструментів. Єдина операційна модель для готелю будь-якого масштабу.</p>
          </div>
          {/* Core platform features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {FEATURES.filter(f => !f.highlight).map((f, i) => (
              <div key={i} className="group p-6 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-indigo-500/30 hover:bg-white/[0.06] transition-all">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center mb-4 group-hover:bg-indigo-600/30 transition-colors">
                  <f.icon className="w-5 h-5 text-indigo-400" />
                </div>
                <h3 className="font-bold text-white text-sm mb-2">{f.title}</h3>
                <p className="text-white/40 text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Differentiating advantages */}
          <div className="relative">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-violet-500/30" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/10">
                Конкурентні переваги
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-violet-500/30" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {FEATURES.filter(f => f.highlight).map((f, i) => (
                <div key={i} className="group relative p-6 rounded-2xl bg-violet-950/30 border border-violet-500/15 hover:border-violet-400/35 hover:bg-violet-950/50 transition-all overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 to-indigo-600/5 pointer-events-none" />
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/25 flex items-center justify-center mb-4 group-hover:bg-violet-600/35 transition-colors">
                      <f.icon className="w-5 h-5 text-violet-400" />
                    </div>
                    <h3 className="font-bold text-white text-sm mb-2">{f.title}</h3>
                    <p className="text-white/40 text-xs leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── DASHBOARD BIG PREVIEW ── */}
      <section className="py-24 px-6 md:px-12 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3">Інтерфейс</p>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Живий продукт, не концепт</h2>
            <p className="text-white/40 text-lg">Понад 50 екранів. 34 000+ рядків коду. Реальні дані. Вже сьогодні.</p>
          </div>

          {/* Extended mockup with more detail */}
          <div className="relative">
            <div className="absolute -inset-8 bg-indigo-600/10 blur-[80px] rounded-full pointer-events-none" />
            <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl shadow-black/80 bg-[#0d0f1c]">
              {/* Chrome bar */}
              <div className="flex items-center gap-2 px-5 py-3.5 bg-[#080a14] border-b border-white/5">
                <span className="w-3 h-3 rounded-full bg-red-400/60" />
                <span className="w-3 h-3 rounded-full bg-amber-400/60" />
                <span className="w-3 h-3 rounded-full bg-emerald-400/60" />
                <div className="flex-1 mx-4 h-6 bg-white/5 rounded-full flex items-center px-4 gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs text-white/30 font-mono">maisonhd.app · DOGODA RESORT</span>
                </div>
                <div className="w-4 h-4 rounded bg-white/5" />
              </div>

              {/* Full app layout */}
              <div className="flex h-[560px]">
                {/* Sidebar */}
                <div className="w-16 md:w-52 bg-[#080a14] border-r border-white/5 flex flex-col py-4">
                  <div className="px-4 mb-4 hidden md:block">
                    <div className="text-[10px] text-white/20 uppercase tracking-widest">DOGODA RESORT</div>
                    <div className="text-xs font-bold text-white/80 mt-0.5">Власник</div>
                  </div>
                  {[
                    { icon: BarChart3,   label: "Дашборд", active: true },
                    { icon: Calendar,    label: "Шахматка", active: false },
                    { icon: BedDouble,   label: "Бронювання", active: false },
                    { icon: Users,       label: "Гості", active: false },
                    { icon: MessageSquare, label: "Inbox", active: false },
                    { icon: TrendingUp,  label: "Фінанси", active: false },
                    { icon: Zap,         label: "Автоматизація", active: false },
                    { icon: Globe2,      label: "Інтеграції", active: false },
                  ].map((item, i) => (
                    <div key={i} className={`flex items-center gap-3 px-3 md:px-4 py-2 mx-2 rounded-xl mb-0.5 ${item.active ? "bg-indigo-600 text-white" : "text-white/30 hover:bg-white/5"}`}>
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-semibold hidden md:block">{item.label}</span>
                    </div>
                  ))}
                </div>

                {/* Dashboard content */}
                <div className="flex-1 overflow-hidden p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-black text-white">Дашборд власника</h2>
                      <p className="text-xs text-white/30">Квітень 2026 · 64 юніти · 6 об'єктів</p>
                    </div>
                    <div className="flex gap-2">
                      <div className="h-7 px-3 bg-emerald-500/15 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> 5 заїздів сьогодні
                      </div>
                      <div className="h-7 px-3 bg-white/5 rounded-lg flex items-center text-[10px] text-white/40">Квітень 2026</div>
                    </div>
                  </div>

                  {/* KPIs */}
                  <div className="grid grid-cols-4 gap-3">
                    {KPI.map((k, i) => (
                      <div key={i} className="bg-white/[0.04] rounded-2xl p-3.5 border border-white/5">
                        <div className="text-[10px] text-white/35 mb-2">{k.label}</div>
                        <div className="text-lg font-black text-white">{k.value}</div>
                        <div className={`text-[10px] font-bold mt-1 ${k.up ? "text-emerald-400" : "text-red-400"}`}>{k.delta} vs минулий міс.</div>
                      </div>
                    ))}
                  </div>

                  {/* Chart + mini chess grid */}
                  <div className="grid grid-cols-5 gap-3">
                    {/* Chart */}
                    <div className="col-span-3 bg-white/[0.04] rounded-2xl p-4 border border-white/5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-white/60">Дохід по місяцях, UAH</span>
                        <span className="text-xs text-indigo-400 font-bold">+18% YoY</span>
                      </div>
                      <div className="flex items-end gap-1 h-24">
                        {[35, 48, 42, 65, 58, 75, 70, 88, 82, 95, 85, 100].map((h, i) => (
                          <div key={i} className="flex-1 flex flex-col justify-end">
                            <div style={{ height: `${h}%` }} className={`rounded-t-sm transition-all ${i === 11 ? "bg-indigo-500" : i >= 9 ? "bg-indigo-500/50" : "bg-white/12"}`} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Occupancy + arrivals */}
                    <div className="col-span-2 space-y-3">
                      <div className="bg-gradient-to-br from-indigo-600/20 to-violet-600/10 rounded-2xl p-4 border border-indigo-500/20 flex flex-col justify-between h-[calc(50%-6px)]">
                        <span className="text-[10px] text-indigo-300/60 font-semibold">Завантаженість</span>
                        <div className="text-3xl font-black text-white">87%</div>
                        <div className="w-full bg-white/10 rounded-full h-1.5">
                          <div className="bg-indigo-400 h-1.5 rounded-full w-[87%]" />
                        </div>
                      </div>
                      <div className="bg-white/[0.04] rounded-2xl p-4 border border-white/5 flex flex-col justify-between h-[calc(50%-6px)]">
                        <span className="text-[10px] text-white/35 font-semibold">Сьогодні</span>
                        <div className="flex justify-between">
                          <div><div className="text-lg font-black text-emerald-400">5</div><div className="text-[9px] text-white/30">Заїздів</div></div>
                          <div><div className="text-lg font-black text-amber-400">3</div><div className="text-[9px] text-white/30">Виїздів</div></div>
                          <div><div className="text-lg font-black text-blue-400">7</div><div className="text-[9px] text-white/30">In-house</div></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bookings mini list */}
                  <div className="bg-white/[0.04] rounded-2xl border border-white/5 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                      <span className="text-xs font-bold text-white/60">Останні бронювання</span>
                      <span className="text-[10px] text-indigo-400 cursor-pointer">Всі 31 →</span>
                    </div>
                    {[
                      { guest: "Коваленко О.", unit: "Котедж A1", dates: "2 квіт → 5 квіт", amt: "8 550", status: "ci" },
                      { guest: "Мельник І.", unit: "Номер 201", dates: "2 квіт → 4 квіт", amt: "5 700", status: "ci" },
                      { guest: "Дорошенко М.", unit: "Котедж B2", dates: "5 квіт → 10 квіт", amt: "14 250", status: "oc" },
                    ].map((b, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.03] last:border-0">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-[9px] font-black shrink-0">
                          {b.guest[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold text-white truncate">{b.guest}</div>
                          <div className="text-[9px] text-white/30">{b.unit} · {b.dates}</div>
                        </div>
                        <div className="text-[10px] font-black text-white">₴ {b.amt}</div>
                        <div className={`w-2 h-2 rounded-full ${b.status === "ci" ? "bg-emerald-400" : "bg-indigo-400"}`} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="testimonials" className="py-24 px-6 md:px-12 bg-white/[0.015] border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3">Клієнти</p>
            <h2 className="text-4xl md:text-5xl font-black text-white">Вони вже перебудували операції</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white/[0.04] border border-white/5 hover:border-white/10 transition-all">
                <div className="flex gap-0.5 mb-4">
                  {Array(t.stars).fill(0).map((_, j) => <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />)}
                </div>
                <p className="text-white/70 text-sm leading-relaxed mb-5">"{t.text}"</p>
                <div>
                  <div className="font-bold text-white text-sm">{t.name}</div>
                  <div className="text-xs text-white/35 mt-0.5">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-24 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3">Ціни</p>
            <h2 className="text-4xl md:text-5xl font-black text-white">Прозорі тарифи</h2>
            <p className="text-white/40 mt-3">14 днів безкоштовно для будь-якого плану</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map((p, i) => (
              <div key={i} className={`relative p-7 rounded-2xl border transition-all ${p.hot ? "bg-indigo-600/15 border-indigo-500/40 shadow-xl shadow-indigo-600/10" : "bg-white/[0.03] border-white/5"}`}>
                {p.hot && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 rounded-full text-[10px] font-black text-white uppercase tracking-wider">Найпопулярніший</div>}
                <div className="text-sm font-bold text-white/60 mb-1">{p.name}</div>
                <div className="flex items-baseline gap-1 mb-1">
                  {p.uah === "custom" ? (
                    <span className="text-3xl font-black text-white">Індивідуально</span>
                  ) : (
                    <><span className="text-4xl font-black text-white">₴ {p.uah}</span><span className="text-white/30 text-sm">/міс</span></>
                  )}
                </div>
                <div className="text-xs text-white/30 mb-6">{p.desc}</div>
                <div className="space-y-2.5 mb-8">
                  {p.features.map((f, j) => (
                    <div key={j} className="flex items-center gap-2 text-sm text-white/70">
                      <Check className="w-4 h-4 text-indigo-400 shrink-0" /> {f}
                    </div>
                  ))}
                </div>
                <a href="#demo-form" className={`block w-full py-3 rounded-xl text-sm font-bold text-center transition-all ${p.hot ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25" : "border border-white/10 text-white/70 hover:border-white/25 hover:bg-white/5"}`}>
                  {p.uah === "custom" ? "Зв'язатись" : "Спробувати безкоштовно"}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DEMO FORM ── */}
      <section id="demo-form" className="py-24 px-6 md:px-12 bg-white/[0.015] border-t border-white/5">
        <div className="max-w-xl mx-auto">
          {submitted ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-3xl font-black text-white mb-3">Запит отримано!</h2>
              <p className="text-white/50">Наш менеджер зв'яжеться з вами протягом 24 годин для налаштування персонального демо.</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-10">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3">Демо</p>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-3">Запросити демо</h2>
                <p className="text-white/40">30-хвилинний персональний показ під ваш тип об'єкту</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {[
                  { label: "Ім'я та прізвище *", key: "name", placeholder: "Іван Коваленко", type: "text" },
                  { label: "Email *", key: "email", placeholder: "ivan@hotel.ua", type: "email" },
                  { label: "Телефон", key: "phone", placeholder: "+380 XX XXX XX XX", type: "tel" },
                  { label: "Назва об'єкту *", key: "company", placeholder: "Готель «Панорама»", type: "text" },
                ].map((fi) => (
                  <div key={fi.key}>
                    <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide mb-1.5">{fi.label}</label>
                    <input
                      type={fi.type}
                      value={form[fi.key as keyof typeof form]}
                      onChange={e => f(fi.key, e.target.value)}
                      placeholder={fi.placeholder}
                      className="w-full h-12 px-4 bg-white/[0.05] border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
                    />
                  </div>
                ))}

                <div>
                  <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide mb-1.5">Кількість юнітів / номерів</label>
                  <select
                    value={form.propertiesCount}
                    onChange={e => f("propertiesCount", e.target.value)}
                    className="w-full h-12 px-4 bg-white/[0.05] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 appearance-none transition-all"
                  >
                    {["1–10", "11–30", "31–80", "81–200", "200+"].map(o => <option key={o} value={o} className="bg-[#0d0f1c]">{o} юнітів</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide mb-1.5">Коментар</label>
                  <textarea
                    value={form.message}
                    onChange={e => f("message", e.target.value)}
                    rows={3}
                    placeholder="Які задачі хочете вирішити? Яка система зараз?"
                    className="w-full px-4 py-3 bg-white/[0.05] border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 resize-none transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm rounded-2xl transition-all shadow-xl shadow-indigo-600/30"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><ArrowRight className="w-4 h-4" /> Запросити персональне демо</>
                  )}
                </button>
                <p className="text-center text-xs text-white/20">Без спаму. Без автопролонгацій. Ми зв'яжемось протягом 24 годин.</p>
              </form>
            </>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 py-12 px-6 md:px-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <MaisonLogo size={28} textVariant="dark" />
          <div className="flex items-center gap-8 text-xs text-white/25">
            {[["Продукт","#features"], ["Ціни","#pricing"], ["Демо","#demo-form"]].map(([l, h]) => (
              <a key={l} href={h} className="hover:text-white/60 transition-colors">{l}</a>
            ))}
          </div>
          <p className="text-xs text-white/15">© 2026 Maison HD. Ukrainian-born Global Hospitality OS.</p>
        </div>
      </footer>

      {/* ── Video modal ── */}
      {videoOpen && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="relative w-full max-w-5xl aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
            <DemoVideoPlayer />
            <button onClick={() => setVideoOpen(false)} className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-50">
              <X className="w-4 h-4" />
            </button>
            <a href="#demo-form" onClick={() => setVideoOpen(false)}
              className="absolute bottom-5 right-5 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-colors z-50">
              Запросити демо <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
