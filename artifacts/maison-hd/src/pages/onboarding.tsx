import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Hotel, BedDouble, Tag, Users, CreditCard, CheckCircle2,
  ChevronRight, ChevronLeft, Lightbulb, Info, Plus,
  Loader2, Check, Sparkles, Lock, AlertCircle, X,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = BASE.replace("/maison-hd", "") + "/api";
const tok  = () => localStorage.getItem("hms_token");
const apiFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

// ── Step config ──────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Заклад",  icon: Hotel,       desc: "Базова інформація про об'єкт" },
  { id: 2, label: "Номери",  icon: BedDouble,   desc: "Ваш номерний фонд" },
  { id: 3, label: "Тарифи",  icon: Tag,         desc: "Ціни та умови бронювання" },
  { id: 4, label: "Команда", icon: Users,       desc: "Запрошення персоналу" },
  { id: 5, label: "Оплата",  icon: CreditCard,  desc: "Спосіб прийому платежів" },
  { id: 6, label: "Готово!", icon: CheckCircle2, desc: "Система готова до роботи" },
];

// ── Tips (right panel per step) ───────────────────────────────────────────────
const TIPS = [
  {
    step: 1, title: "Чому це важливо?", color: "from-indigo-600 to-violet-700",
    points: [
      "Назва закладу відображається у рахунках, гостьовому порталі та всіх звітах",
      "Тип закладу впливає на категорії номерів і шаблони завдань для покоївок",
      "Часовий пояс критично важливий: нічний аудит запускається о 00:00 за вашим часом",
      "Валюта встановлюється один раз і використовується у всіх фінансових звітах",
    ],
    hint: "Всі ці дані можна змінити пізніше в Налаштуваннях → Заклад.",
  },
  {
    step: 2, title: "Що таке юніт?", color: "from-blue-600 to-cyan-700",
    points: [
      "Юніт — будь-яка «одиниця» що здається: номер, котедж, шале, місце в кемпінгу",
      "Категорія юніту впливає на тариф — «Стандарт» і «Люкс» мають різну ціну",
      "Поверх допомагає ресепшеністу при виборі номеру",
      "Юніти можна додавати та архівувати будь-коли — не потрібно додавати всі зараз",
    ],
    hint: "Для старту достатньо 2–5 юнітів. Решту додасте після запуску.",
  },
  {
    step: 3, title: "Як працюють тарифи?", color: "from-emerald-600 to-teal-700",
    points: [
      "BAR (Best Available Rate) — базова ціна за ніч, від якої рахуються знижки",
      "Тариф застосовується автоматично при створенні нового бронювання",
      "Ціна може різнитись по категоріях юнітів (Стандарт, Делюкс, Люкс)",
      "Пізніше можна додати сезонні тарифи, ранні бронювання і пакети",
    ],
    hint: "Встановіть реальну ціну — вона підставляється у рахунки і формує ADR.",
  },
  {
    step: 4, title: "Рольова система", color: "from-violet-600 to-purple-700",
    points: [
      "Власник — повний доступ: аналітика, фінанси, звіти, налаштування",
      "Менеджер — бронювання, команда, аналітика (без критичних налаштувань)",
      "Ресепшеніст — бронювання, чек-ін/аут, Inbox (без фінансових звітів)",
      "Покоївка — лише власні завдання з прибирання",
    ],
    hint: "Цей крок можна пропустити і додати співробітників пізніше в Налаштування → Користувачі.",
  },
  {
    step: 5, title: "Способи оплати", color: "from-amber-600 to-orange-700",
    points: [
      "Готівка/Картка — фіксуєте оплату вручну у вкладці «Оплата» бронювання",
      "LiqPay — надсилаєте гостю посилання для онлайн-оплати автоматично",
      "WayForPay — аналог LiqPay, популярний в Україні",
      "Можна комбінувати кілька способів оплати одночасно",
    ],
    hint: "Онлайн-оплату через LiqPay можна підключити пізніше в Налаштування → Оплата.",
  },
  {
    step: 6, title: "Що далі?", color: "from-green-600 to-emerald-700",
    points: [
      "Перейдіть в Шахматку і зробіть перше тестове бронювання",
      "Налаштуйте OTA-канали (Booking.com, Airbnb) у розділі Інтеграції",
      "Запросіть решту команди в Налаштування → Користувачі",
      "Додайте сезонні тарифи та промо-акції для збільшення завантаженості",
    ],
    hint: "Вітаємо! Якщо виникнуть питання — підтримка доступна 24/7 через Inbox.",
  },
];

// ── Small helpers ─────────────────────────────────────────────────────────────
function FieldHint({ text }: { text: string }) {
  return (
    <p className="text-xs text-gray-400 mt-1 flex items-start gap-1.5">
      <Info className="w-3 h-3 mt-0.5 shrink-0 text-indigo-400" />{text}
    </p>
  );
}
function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <FieldHint text={hint} />}
    </div>
  );
}
function Inp(props: React.InputHTMLAttributes<HTMLInputElement> & { cls?: string }) {
  const { cls, ...rest } = props;
  return <input {...rest} className={`w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all bg-white ${cls || ""}`} />;
}
function Sel({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 bg-white transition-all">
      {children}
    </select>
  );
}

// ── Row types ─────────────────────────────────────────────────────────────────
interface UnitRow  { name: string; category: string; capacity: string; floor: string; }
interface StaffRow { email: string; name: string; role: string; password: string; }
const emptyUnit  = (): UnitRow  => ({ name: "", category: "standard", capacity: "2", floor: "1" });
const emptyStaff = (): StaffRow => ({ email: "", name: "", role: "reception", password: "" });

// ── Main ──────────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [checking, setChecking] = useState(true);

  // If properties already exist, skip wizard (returning user / existing account)
  useEffect(() => {
    apiFetch(`${API}/properties`)
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        const props = Array.isArray(data) ? data : (data?.properties || data?.data || []);
        if (props.length > 0) {
          localStorage.setItem("mhd_onboarding_done", "1");
          navigate("/dashboard");
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  // Saved IDs / counts
  const [done, setDone] = useState<{ propId?: number; units?: number; rate?: boolean; staff?: number }>({});

  // Step 1
  const [prop, setProp] = useState({ name: "", type: "hotel", address: "", description: "" });
  // Step 2
  const [units, setUnits] = useState<UnitRow[]>([emptyUnit()]);
  // Step 3
  const [rate, setRate] = useState({ name: "BAR — Базовий тариф", price: "", category: "standard" });
  // Step 4
  const [staff, setStaff] = useState<StaffRow[]>([emptyStaff()]);
  // Step 5
  const [pay, setPay] = useState({ method: "cash", pub: "", priv: "" });

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const tip = TIPS.find(t => t.step === step)!;

  // ── Savers ────────────────────────────────────────────────────────────────
  async function save1() {
    if (!prop.name.trim()) { setError("Вкажіть назву закладу"); return false; }
    if (!prop.address.trim()) { setError("Вкажіть адресу"); return false; }
    const r = await apiFetch(`${API}/properties`, { method: "POST", body: JSON.stringify({ name: prop.name, type: prop.type, address: prop.address, description: prop.description || null }) });
    if (!r.ok) { const d = await r.json(); setError(d.error || "Помилка збереження"); return false; }
    const d = await r.json();
    setDone(x => ({ ...x, propId: d.id || d.property?.id }));
    return true;
  }

  async function save2() {
    const valid = units.filter(u => u.name.trim());
    if (!valid.length) { setError("Додайте хоча б один юніт з назвою"); return false; }
    if (!done.propId) { setError("Спочатку збережіть заклад (крок 1)"); return false; }
    let created = 0;
    for (const u of valid) {
      const r = await apiFetch(`${API}/units`, { method: "POST", body: JSON.stringify({ propertyId: done.propId, name: u.name, category: u.category, capacity: parseInt(u.capacity) || 2, floor: parseInt(u.floor) || 1 }) });
      if (r.ok) created++;
    }
    setDone(x => ({ ...x, units: created }));
    return true;
  }

  async function save3() {
    if (!rate.price || isNaN(Number(rate.price))) { setError("Вкажіть ціну за ніч"); return false; }
    const r = await apiFetch(`${API}/rates`, { method: "POST", body: JSON.stringify({ propertyId: done.propId, name: rate.name, pricePerNight: Number(rate.price), unitCategory: rate.category }) });
    if (r.ok) setDone(x => ({ ...x, rate: true }));
    return true;
  }

  async function save4() {
    const valid = staff.filter(s => s.email.trim() && s.name.trim());
    let invited = 0;
    for (const s of valid) {
      const pass = s.password.trim() || ("Maison" + Math.random().toString(36).slice(2, 8));
      const r = await apiFetch(`${API}/users`, { method: "POST", body: JSON.stringify({ email: s.email, name: s.name, role: s.role, password: pass }) });
      if (r.ok) invited++;
    }
    setDone(x => ({ ...x, staff: invited }));
    return true;
  }

  async function save5() { return true; }

  const handleNext = async () => {
    setError("");
    setSaving(true);
    try {
      const ok = await [save1, save2, save3, save4, save5][step - 1]();
      if (ok) setStep(s => Math.min(s + 1, 6));
    } finally { setSaving(false); }
  };
  const handleSkip = () => { setError(""); setStep(s => s + 1); };
  const handleFinish = () => { localStorage.setItem("mhd_onboarding_done", "1"); navigate("/dashboard"); };

  // ── Step forms ────────────────────────────────────────────────────────────
  function Content() {
    const p = (k: keyof typeof prop, v: string) => setProp(x => ({ ...x, [k]: v }));
    const r = (k: keyof typeof rate, v: string) => setRate(x => ({ ...x, [k]: v }));

    if (step === 1) return (
      <div className="space-y-4">
        <Field label="Назва закладу" required hint="Відображається у рахунках, гостьовому порталі та всіх звітах">
          <Inp placeholder='Наприклад: Готель «Вершина», Бутік-курорт «Карпати»' value={prop.name} onChange={e => p("name", e.target.value)} />
        </Field>
        <Field label="Тип закладу" hint="Впливає на категорії номерів та шаблони завдань покоївок">
          <Sel value={prop.type} onChange={v => p("type", v)}>
            <option value="hotel">🏨 Готель</option>
            <option value="hostel">🛏️ Хостел</option>
            <option value="resort">🌿 Курорт / комплекс</option>
            <option value="apartments">🏢 Апартаменти</option>
            <option value="villa">🏡 Вілла / котедж</option>
            <option value="camping">⛺ Кемпінг / глемпінг</option>
            <option value="sanatorium">💊 Санаторій</option>
          </Sel>
        </Field>
        <Field label="Адреса" required hint="Використовується в документах та на карті гостьового порталу">
          <Inp placeholder="Вул. Лісова, 14, с. Верховина, Івано-Франківська обл." value={prop.address} onChange={e => p("address", e.target.value)} />
        </Field>
        <Field label="Опис" hint="Необов'язково — короткий опис вашого закладу">
          <textarea
            placeholder="Затишний бутік-готель у центрі міста..."
            value={prop.description || ""}
            onChange={e => setProp(x => ({ ...x, description: e.target.value }))}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all bg-white resize-none"
          />
        </Field>
      </div>
    );

    if (step === 2) return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 flex gap-2">
          <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
          <span>Юніт — будь-який об'єкт що здається: номер, котедж, шале, місце. Для старту достатньо 2–5 юнітів.</span>
        </div>
        {units.map((u, i) => (
          <div key={i} className="relative p-4 border border-gray-100 rounded-2xl bg-gray-50/60 space-y-3">
            {units.length > 1 && (
              <button onClick={() => setUnits(a => a.filter((_, j) => j !== i))} className="absolute top-3 right-3 text-gray-300 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
            )}
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Юніт #{i + 1}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Назва" required hint="Номер 101, Котедж А1, Шале «Сосна»">
                <Inp placeholder="Номер 101" value={u.name} onChange={e => setUnits(a => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              </Field>
              <Field label="Категорія" hint="Впливає на тариф та фільтри">
                <Sel value={u.category} onChange={v => setUnits(a => a.map((x, j) => j === i ? { ...x, category: v } : x))}>
                  <option value="standard">Стандарт</option>
                  <option value="deluxe">Делюкс</option>
                  <option value="suite">Люкс / Suite</option>
                  <option value="studio">Студія</option>
                  <option value="cottage">Котедж</option>
                  <option value="villa">Вілла</option>
                  <option value="economy">Економ</option>
                </Sel>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Місткість (осіб)" hint="Максимальна кількість гостей у юніті">
                <Inp type="number" min={1} max={20} value={u.capacity} onChange={e => setUnits(a => a.map((x, j) => j === i ? { ...x, capacity: e.target.value } : x))} />
              </Field>
              <Field label="Поверх" hint="Для навігації ресепшеніста при заселенні">
                <Inp type="number" min={0} max={50} value={u.floor} onChange={e => setUnits(a => a.map((x, j) => j === i ? { ...x, floor: e.target.value } : x))} />
              </Field>
            </div>
          </div>
        ))}
        <button onClick={() => setUnits(a => [...a, emptyUnit()])}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-blue-200 text-blue-600 text-sm font-semibold hover:bg-blue-50 transition-colors">
          <Plus className="w-4 h-4" /> Додати ще юніт
        </button>
      </div>
    );

    if (step === 3) return (
      <div className="space-y-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-700 flex gap-2">
          <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
          <span>Почніть з одного базового тарифу (BAR). Сезонні тарифи, знижки та пакети — після запуску в розділі «Тарифи».</span>
        </div>
        <Field label="Назва тарифу" hint="Наприклад: BAR, Базовий, Стандарт 2026">
          <Inp value={rate.name} onChange={e => r("name", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Категорія юніту" hint="До яких номерів застосовується цей тариф">
            <Sel value={rate.category} onChange={v => r("category", v)}>
              <option value="standard">Стандарт</option>
              <option value="deluxe">Делюкс</option>
              <option value="suite">Люкс / Suite</option>
              <option value="studio">Студія</option>
              <option value="cottage">Котедж</option>
              <option value="villa">Вілла</option>
              <option value="economy">Економ</option>
            </Sel>
          </Field>
          <Field label="Ціна за ніч" required hint="Базова ціна для розрахунку вартості бронювань">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">₴</span>
              <Inp cls="pl-7" type="number" min={0} placeholder="2 500" value={rate.price} onChange={e => r("price", e.target.value)} />
            </div>
          </Field>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
          <div className="font-bold mb-1">💡 ADR та RevPAR</div>
          <p>ADR (Average Daily Rate) — середня ціна проданого номеру. Дашборд власника розраховує ADR автоматично на основі ваших тарифів та бронювань.</p>
        </div>
      </div>
    );

    if (step === 4) return (
      <div className="space-y-4">
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-xs text-violet-700 flex gap-2">
          <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-violet-500" />
          <span>Акаунти для персоналу можна додати тут або пізніше в Налаштування → Користувачі. Пароль задається вручну при створенні.</span>
        </div>
        {staff.map((s, i) => (
          <div key={i} className="relative p-4 border border-gray-100 rounded-2xl bg-gray-50/60 space-y-3">
            {staff.length > 1 && (
              <button onClick={() => setStaff(a => a.filter((_, j) => j !== i))} className="absolute top-3 right-3 text-gray-300 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
            )}
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Співробітник #{i + 1}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ім'я та прізвище" hint="Відображається у системі та звітах">
                <Inp placeholder="Олена Коваль" value={s.name} onChange={e => setStaff(a => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              </Field>
              <Field label="Email (логін)" hint="Буде використовуватись для входу в систему">
                <Inp type="email" placeholder="olena@hotel.ua" value={s.email} onChange={e => setStaff(a => a.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
              </Field>
            </div>
            <Field label="Пароль" hint="Передайте пароль співробітнику особисто. Пізніше він зможе змінити у Налаштуваннях">
              <Inp type="password" placeholder="Мін. 6 символів" value={s.password} onChange={e => setStaff(a => a.map((x, j) => j === i ? { ...x, password: e.target.value } : x))} />
            </Field>
            <Field label="Роль у системі" hint="Визначає доступ до розділів та можливостей">
              <Sel value={s.role} onChange={v => setStaff(a => a.map((x, j) => j === i ? { ...x, role: v } : x))}>
                <option value="manager">👔 Менеджер — бронювання, команда, аналітика</option>
                <option value="reception">🛎️ Ресепшеніст — бронювання, чек-ін/аут, Inbox</option>
                <option value="housekeeping">🧹 Покоївка — тільки свої завдання з прибирання</option>
              </Sel>
            </Field>
          </div>
        ))}
        <button onClick={() => setStaff(a => [...a, emptyStaff()])}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-violet-200 text-violet-600 text-sm font-semibold hover:bg-violet-50 transition-colors">
          <Plus className="w-4 h-4" /> Додати ще співробітника
        </button>
      </div>
    );

    if (step === 5) return (
      <div className="space-y-4">
        <Field label="Основний спосіб прийому оплати" hint="Можна налаштувати кілька способів після запуску в Налаштування → Оплата">
          <Sel value={pay.method} onChange={v => setPay(x => ({ ...x, method: v }))}>
            <option value="cash">💵 Готівка — фіксуєте вручну після отримання</option>
            <option value="card">💳 Термінал / картка — фіксуєте вручну</option>
            <option value="liqpay">📱 LiqPay — онлайн-оплата за посиланням</option>
            <option value="wayforpay">📱 WayForPay — онлайн-оплата за посиланням</option>
            <option value="bank">🏦 Безготівковий — банківський переказ</option>
          </Sel>
        </Field>

        {(pay.method === "liqpay" || pay.method === "wayforpay") && (
          <div className="space-y-3 p-4 border border-amber-100 bg-amber-50 rounded-2xl">
            <div className="text-xs font-bold text-amber-800">
              {pay.method === "liqpay" ? "LiqPay" : "WayForPay"} API ключі
            </div>
            <p className="text-xs text-amber-700">
              Отримайте ключі в особистому кабінеті&nbsp;
              <a href={pay.method === "liqpay" ? "https://www.liqpay.ua" : "https://secure.wayforpay.com"} target="_blank" rel="noopener noreferrer" className="underline">
                {pay.method === "liqpay" ? "liqpay.ua" : "wayforpay.com"}
              </a>
              &nbsp;→ {pay.method === "liqpay" ? "Бізнес → API" : "Налаштування → API"}
            </p>
            <Field label={pay.method === "liqpay" ? "Public key" : "Merchant Account"} hint="Публічний ідентифікатор вашого магазину">
              <Inp placeholder={pay.method === "liqpay" ? "sandbox_i12345678..." : "test_merchant"} value={pay.pub} onChange={e => setPay(x => ({ ...x, pub: e.target.value }))} />
            </Field>
            <Field label={pay.method === "liqpay" ? "Private key" : "Merchant Secret Key"} hint="Секретний ключ — нікому не передавайте">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Inp cls="pl-8" type="password" placeholder="••••••••••••••••" value={pay.priv} onChange={e => setPay(x => ({ ...x, priv: e.target.value }))} />
              </div>
            </Field>
          </div>
        )}

        {["cash", "card", "bank"].includes(pay.method) && (
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs text-gray-500 space-y-2">
            <div className="font-semibold text-gray-700">✅ Відмінний вибір для старту</div>
            <p>Ви будете фіксувати оплату вручну у вкладці «Оплата» кожного бронювання після отримання коштів.</p>
            <p>Онлайн-оплату через LiqPay або WayForPay можна підключити пізніше.</p>
          </div>
        )}
      </div>
    );

    if (step === 6) return (
      <div className="text-center py-2 space-y-6">
        <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Вітаємо! 🎉</h2>
          <p className="text-gray-500 text-sm">Ваш заклад налаштований і готовий до роботи</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-left">
          {[
            { label: "Заклад",   value: prop.name || "—",                icon: Hotel,       ok: !!done.propId },
            { label: "Юніти",    value: `${done.units || 0} створено`,   icon: BedDouble,   ok: (done.units || 0) > 0 },
            { label: "Тариф",    value: done.rate ? rate.name : "—",     icon: Tag,         ok: !!done.rate },
            { label: "Персонал", value: `${done.staff || 0} запрошено`,  icon: Users,       ok: true },
          ].map(({ label, value, icon: Icon, ok }) => (
            <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ok ? "bg-emerald-100" : "bg-gray-100"}`}>
                <Icon className={`w-4 h-4 ${ok ? "text-emerald-600" : "text-gray-400"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-gray-400">{label}</div>
                <div className="text-xs font-semibold text-gray-800 truncate">{value}</div>
              </div>
              {ok && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
            </div>
          ))}
        </div>
        <div className="space-y-2.5 pt-2">
          <button onClick={handleFinish}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-indigo-600/20">
            Перейти до системи <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => { localStorage.setItem("mhd_onboarding_done", "1"); navigate("/chess"); }}
            className="w-full flex items-center justify-center gap-2 py-3 border border-indigo-100 text-indigo-600 text-sm font-semibold rounded-2xl hover:bg-indigo-50 transition-colors">
            <Sparkles className="w-4 h-4" /> Зробити перше бронювання в шахматці
          </button>
        </div>
      </div>
    );

    return null;
  }

  const optional = step === 4 || step === 5;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <BedDouble className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-black text-gray-900 text-sm">Maison HD</span>
          <span className="text-gray-300 mx-1">·</span>
          <span className="text-xs text-gray-400">Початкове налаштування закладу</span>
        </div>
        {step < 6 && (
          <button
            onClick={() => { localStorage.setItem("mhd_onboarding_done", "1"); navigate("/dashboard"); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all shadow-sm"
          >
            <X className="w-4 h-4" />
            Пропустити та увійти в систему
          </button>
        )}
      </div>

      {/* Step progress */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-1 mb-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1 flex-1 last:flex-none">
                <button
                  onClick={() => step > s.id && setStep(s.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-xs font-semibold whitespace-nowrap cursor-default
                    ${step === s.id ? "bg-indigo-600 text-white shadow-sm" : step > s.id ? "bg-emerald-100 text-emerald-700 cursor-pointer hover:bg-emerald-200" : "bg-gray-100 text-gray-400"}`}>
                  {step > s.id ? <Check className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
                  <span className="hidden sm:block">{s.label}</span>
                  <span className="sm:hidden">{s.id}</span>
                </button>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 rounded mx-0.5 ${step > s.id ? "bg-emerald-300" : "bg-gray-100"}`} />}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Крок <span className="font-bold text-gray-600">{step}</span> з {STEPS.length} — {STEPS[step - 1]?.desc}
            {optional && <span className="ml-2 text-indigo-400">(можна пропустити)</span>}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 py-8 px-4 overflow-y-auto">
        <div className="max-w-4xl mx-auto grid lg:grid-cols-5 gap-6 items-start">

          {/* Left: form card */}
          <div className="lg:col-span-3 bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-8">
            {/* Step header */}
            <div className="flex items-center gap-3 mb-6">
              {(() => {
                const s = STEPS[step - 1];
                return (
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                    <s.icon className="w-5 h-5 text-indigo-600" />
                  </div>
                );
              })()}
              <div>
                <h1 className="text-lg font-black text-gray-900">{STEPS[step - 1]?.label}</h1>
                <p className="text-xs text-gray-400">{STEPS[step - 1]?.desc}</p>
              </div>
            </div>

            <Content />

            {/* Error */}
            {error && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            {/* Navigation */}
            {step < 6 && (
              <div className="flex items-center gap-3 mt-7 pt-5 border-t border-gray-100">
                {step > 1 && (
                  <button onClick={() => { setError(""); setStep(s => s - 1); }}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                    <ChevronLeft className="w-4 h-4" /> Назад
                  </button>
                )}
                <div className="flex-1" />
                {optional && (
                  <button onClick={handleSkip} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-2.5 transition-colors">
                    Пропустити
                  </button>
                )}
                <button onClick={handleNext} disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors shadow-md shadow-indigo-600/15">
                  {saving
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Збереження...</>
                    : <>{step === 5 ? "Завершити налаштування" : "Далі"} <ChevronRight className="w-4 h-4" /></>}
                </button>
              </div>
            )}
          </div>

          {/* Right: tips panel */}
          <div className="lg:col-span-2 sticky top-28">
            <div className={`rounded-3xl bg-gradient-to-br ${tip.color} p-6 text-white`}>
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-4 h-4 text-white/80" />
                <span className="font-bold text-sm">{tip.title}</span>
              </div>
              <ul className="space-y-3 mb-5">
                {tip.points.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-white/90 leading-relaxed">
                    <div className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">{i + 1}</div>
                    {pt}
                  </li>
                ))}
              </ul>
              <div className="bg-white/10 rounded-2xl p-3 text-xs text-white/80 leading-relaxed">
                💡 {tip.hint}
              </div>
              {/* Mini step map */}
              <div className="mt-5 pt-5 border-t border-white/15 space-y-1.5">
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Всі кроки</div>
                {STEPS.map(s => (
                  <div key={s.id} className={`flex items-center gap-2 text-xs ${step === s.id ? "text-white font-semibold" : step > s.id ? "text-white/45 line-through" : "text-white/25"}`}>
                    {step > s.id ? <Check className="w-3 h-3 text-emerald-300 shrink-0" /> : <s.icon className="w-3 h-3 shrink-0" />}
                    {s.label}
                    {(s.id === 4 || s.id === 5) && step <= s.id && <span className="text-white/30 text-[9px] ml-auto">необов'язково</span>}
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
