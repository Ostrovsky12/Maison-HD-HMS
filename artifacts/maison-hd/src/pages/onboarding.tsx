import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Hotel, BedDouble, Tag, CreditCard, CheckCircle2,
  ChevronRight, ChevronLeft, Info, Plus, Loader2, Check,
  X, Building2, Phone, Mail, AlertCircle, Sparkles, Lock,
  Users, Globe,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = BASE.replace("/maison-hd", "") + "/api";
const tok  = () => localStorage.getItem("hms_token");
const apiFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

// ── Steps ────────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Заклад",        icon: Hotel,        desc: "Основна інформація",           required: true  },
  { id: 2, label: "Номерний фонд", icon: BedDouble,    desc: "Будинки, номери, юніти",        required: true  },
  { id: 3, label: "Тариф",         icon: Tag,          desc: "Ціни та умови",                required: true  },
  { id: 4, label: "Юр. особа",     icon: Building2,    desc: "Для рахунків та документів",   required: false },
  { id: 5, label: "Підключення",   icon: CreditCard,   desc: "LiqPay та контакти",           required: false },
  { id: 6, label: "Готово!",       icon: CheckCircle2, desc: "Система готова до роботи",     required: true  },
];

// ── Tips ─────────────────────────────────────────────────────────────────────
const TIPS = [
  {
    step: 1, color: "from-indigo-600 to-violet-700", title: "Ваш заклад у системі",
    points: [
      "Назва відображається на рахунках, гостьовому порталі та у всіх звітах",
      "Тип закладу впливає на категорії номерів та шаблони завдань для персоналу",
      "Адреса використовується в документах та при інтеграції з Google Maps",
    ],
    hint: "Всі дані можна змінити пізніше в Налаштуваннях → Заклад.",
  },
  {
    step: 2, color: "from-blue-600 to-cyan-700", title: "Номерний фонд (слоти)",
    points: [
      "Юніт — будь-яка «одиниця» що здається: номер, котедж, шале, місце в кемпінгу",
      "Базові гості — скільки гостей включено в базову ціну (решта — за доп. тарифом)",
      "Максимальна місткість — граничне число гостей, що може прийняти юніт",
      "Ціна за додаткового гостя нараховується за кожного гостя понад базу × ночей",
    ],
    hint: "Для старту достатньо 1–3 юніти. Всі інші можна додати після запуску.",
  },
  {
    step: 3, color: "from-emerald-600 to-teal-700", title: "Як працюють тарифи?",
    points: [
      "BAR (Best Available Rate) — базова ціна за ніч для базової кількості гостей",
      "Тариф застосовується автоматично при створенні нового бронювання",
      "Один тариф може застосовуватись до певної категорії юнітів або до всіх",
      "Пізніше можна додати сезонні тарифи, промокоди та пакети",
    ],
    hint: "Встановіть реальну ціну — вона підставляється у рахунки та формує ADR.",
  },
  {
    step: 4, color: "from-violet-600 to-purple-700", title: "Навіщо юридична особа?",
    points: [
      "Необхідна для виставляння офіційних рахунків та актів надання послуг",
      "IBAN + банк — для автоматичного формування платіжних реквізитів",
      "Можна додати декілька юр. осіб (ФОП + ТОВ) та обирати при бронюванні",
      "Без юр. особи неможливо виставити рахунок — тільки готівка/термінал",
    ],
    hint: "Цей крок можна пропустити і заповнити пізніше в Налаштування → Юр. особи.",
  },
  {
    step: 5, color: "from-amber-600 to-orange-700", title: "Підключення платежів",
    points: [
      "LiqPay — надсилаєте гостю посилання для миттєвої онлайн-оплати",
      "Без LiqPay можна приймати оплату готівкою або через термінал вручну",
      "Контактний телефон та email відображаються у гостьовому порталі",
      "Пізніше можна підключити WayForPay, Stripe та OTA-канали",
    ],
    hint: "Онлайн-оплату можна підключити пізніше в Налаштування → Інтеграції.",
  },
  {
    step: 6, color: "from-green-600 to-emerald-700", title: "Що далі?",
    points: [
      "Натисніть «Зробити перше бронювання» і система проведе вас через процес",
      "Налаштуйте OTA-канали (Booking.com, Airbnb) у розділі Інтеграції",
      "Запросіть команду в Налаштування → Користувачі",
      "Додайте сезонні тарифи для збільшення завантаженості",
    ],
    hint: "Вітаємо! Підтримка доступна 24/7 через Inbox.",
  },
];

// ── UI helpers ────────────────────────────────────────────────────────────────
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
function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="text-indigo-500">{icon}</div>
        <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Row types ─────────────────────────────────────────────────────────────────
interface UnitRow {
  name: string;
  category: string;
  description: string;
  capacity: string;
  maxCapacity: string;
  extraGuestPrice: string;
}
interface LegalForm {
  name: string; type: string; edrpou: string;
  iban: string; bank: string; mfo: string; address: string;
}
const emptyUnit = (): UnitRow => ({
  name: "", category: "standard", description: "",
  capacity: "2", maxCapacity: "4", extraGuestPrice: "0",
});
const emptyLegal = (): LegalForm => ({
  name: "", type: "fop", edrpou: "", iban: "", bank: "", mfo: "", address: "",
});

// ── Main ──────────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  const [done, setDone] = useState<{ propId?: number; units?: number; rateId?: number; legalId?: number }>({});

  // Step 1
  const [prop, setProp] = useState({ name: "", type: "hotel", address: "", description: "" });
  const p = (k: keyof typeof prop, v: string) => setProp(x => ({ ...x, [k]: v }));

  // Step 2
  const [units, setUnits] = useState<UnitRow[]>([emptyUnit()]);

  // Step 3
  const [rate, setRate] = useState({ name: "BAR — Базовий тариф", price: "", category: "" });
  const r = (k: keyof typeof rate, v: string) => setRate(x => ({ ...x, [k]: v }));

  // Step 4
  const [legal, setLegal] = useState<LegalForm>(emptyLegal());
  const l = (k: keyof LegalForm, v: string) => setLegal(x => ({ ...x, [k]: v }));

  // Step 5
  const [conn, setConn] = useState({ liqpayPublic: "", liqpayPrivate: "", phone: "", email: "" });
  const c = (k: keyof typeof conn, v: string) => setConn(x => ({ ...x, [k]: v }));

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50/30">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
    </div>
  );

  const tip = TIPS.find(t => t.step === step)!;
  const currentStep = STEPS.find(s => s.id === step)!;

  // ── Savers ──────────────────────────────────────────────────────────────────
  async function save1() {
    if (!prop.name.trim()) { setError("Вкажіть назву закладу"); return false; }
    if (!prop.address.trim()) { setError("Вкажіть адресу"); return false; }
    const res = await apiFetch(`${API}/properties`, {
      method: "POST",
      body: JSON.stringify({ name: prop.name.trim(), type: prop.type, address: prop.address.trim(), description: prop.description || null }),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error || "Помилка збереження"); return false; }
    const d = await res.json();
    setDone(x => ({ ...x, propId: d.id || d.property?.id }));
    return true;
  }

  async function save2() {
    const valid = units.filter(u => u.name.trim());
    if (!valid.length) { setError("Додайте хоча б один юніт з назвою"); return false; }
    if (!done.propId) { setError("Спочатку збережіть заклад (крок 1)"); return false; }
    let created = 0;
    for (const u of valid) {
      const cap = parseInt(u.capacity) || 2;
      const maxCap = parseInt(u.maxCapacity) || cap;
      const res = await apiFetch(`${API}/units`, {
        method: "POST",
        body: JSON.stringify({
          propertyId: done.propId,
          name: u.name.trim(),
          category: u.category,
          description: u.description || null,
          capacity: cap,
          maxCapacity: Math.max(cap, maxCap),
          baseGuests: cap,
          extraGuestPrice: parseFloat(u.extraGuestPrice) || 0,
        }),
      });
      if (res.ok) created++;
    }
    if (!created) { setError("Не вдалось зберегти жоден юніт"); return false; }
    setDone(x => ({ ...x, units: created }));
    return true;
  }

  async function save3() {
    if (!rate.price || isNaN(Number(rate.price))) { setError("Вкажіть ціну за ніч"); return false; }
    if (!done.propId) { setError("Спочатку збережіть заклад"); return false; }
    const res = await apiFetch(`${API}/rates`, {
      method: "POST",
      body: JSON.stringify({
        propertyId: done.propId,
        name: rate.name.trim() || "BAR — Базовий тариф",
        pricePerNight: Number(rate.price),
        unitCategory: rate.category || null,
      }),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error || "Помилка збереження тарифу"); return false; }
    const d = await res.json();
    setDone(x => ({ ...x, rateId: d.id }));
    return true;
  }

  async function save4() {
    // Legal entity is optional — save if name is filled
    if (!legal.name.trim()) return true;
    const res = await apiFetch(`${API}/legal-entities`, {
      method: "POST",
      body: JSON.stringify({
        name: legal.name.trim(),
        type: legal.type,
        edrpou: legal.edrpou || null,
        iban: legal.iban || null,
        bank: legal.bank || null,
        mfo: legal.mfo || null,
        address: legal.address || null,
        isDefault: true,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setDone(x => ({ ...x, legalId: d.id }));
    }
    return true;
  }

  async function save5() {
    // Save LiqPay keys if provided, save contacts if provided
    if (conn.liqpayPublic.trim() && conn.liqpayPrivate.trim() && done.legalId) {
      await apiFetch(`${API}/legal-entities/${done.legalId}`, {
        method: "PATCH",
        body: JSON.stringify({
          liqpayPublicKey: conn.liqpayPublic.trim(),
          liqpayPrivateKey: conn.liqpayPrivate.trim(),
        }),
      });
    }
    return true;
  }

  const SAVERS = [save1, save2, save3, save4, save5];

  const handleNext = async () => {
    setError("");
    if (step === 6) { localStorage.setItem("mhd_onboarding_done", "1"); navigate("/bookings"); return; }
    setSaving(true);
    try {
      const ok = await SAVERS[step - 1]();
      if (ok) setStep(s => Math.min(s + 1, 6));
    } finally { setSaving(false); }
  };

  const handleSkip = () => {
    if (!currentStep.required) { setError(""); setStep(s => s + 1); }
  };

  // ── Step forms ────────────────────────────────────────────────────────────
  function Content() {
    // Step 1 — Property
    if (step === 1) return (
      <div className="space-y-4">
        <Field label="Назва закладу" required hint="Відображається в рахунках, гостьовому порталі та всіх звітах">
          <Inp placeholder='Наприклад: Готель «Вершина», Садиба «Карпати»' value={prop.name} onChange={e => p("name", e.target.value)} />
        </Field>
        <Field label="Тип закладу" hint="Впливає на шаблони завдань для персоналу">
          <Sel value={prop.type} onChange={v => p("type", v)}>
            <option value="hotel">🏨 Готель</option>
            <option value="apartment">🏢 Апартаменти</option>
            <option value="villa">🏡 Вілла / котедж</option>
            <option value="house">🏠 Будинок / садиба</option>
            <option value="bungalow">🌴 Бунгало</option>
            <option value="glamping">⭐ Глемпінг</option>
            <option value="camping">⛺ Кемпінг</option>
            <option value="spa">💆 СПА-курорт</option>
            <option value="pool">🏊 База відпочинку</option>
            <option value="other">🏗️ Інше</option>
          </Sel>
        </Field>
        <Field label="Адреса" required hint="Використовується в документах та на карті">
          <Inp placeholder="Вул. Лісова, 14, с. Верховина, Івано-Франківська обл." value={prop.address} onChange={e => p("address", e.target.value)} />
        </Field>
        <Field label="Опис" hint="Необов'язково — короткий опис закладу">
          <textarea
            value={prop.description}
            onChange={e => p("description", e.target.value)}
            rows={3}
            placeholder="Затишний бутік-готель в серці Карпат..."
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all bg-white resize-none"
          />
        </Field>
      </div>
    );

    // Step 2 — Units
    if (step === 2) return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex gap-2">
          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          Юніт — це будь-яка одиниця, що здається. Вкажіть для кожного: скільки гостей включено в базову ціну, максимальну місткість та ціну за кожного додаткового гостя.
        </p>
        {units.map((u, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 relative">
            {units.length > 1 && (
              <button
                type="button"
                onClick={() => setUnits(prev => prev.filter((_, j) => j !== i))}
                className="absolute top-3 right-3 w-7 h-7 rounded-xl bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <div className="flex gap-1 items-center mb-1">
              <BedDouble className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Юніт {i + 1}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Назва" required>
                  <Inp
                    placeholder="Будинок з 1 спальнею, Люкс 101, Шале «Ялина»"
                    value={u.name}
                    onChange={e => setUnits(prev => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                  />
                </Field>
              </div>
              <Field label="Категорія">
                <Sel value={u.category} onChange={v => setUnits(prev => prev.map((r, j) => j === i ? { ...r, category: v } : r))}>
                  <option value="standard">Стандарт</option>
                  <option value="superior">Супер'єр</option>
                  <option value="deluxe">Делюкс</option>
                  <option value="suite">Люкс / Сюїт</option>
                  <option value="family">Сімейний</option>
                  <option value="economy">Економ</option>
                </Sel>
              </Field>
              <Field label="Опис (необов'язково)">
                <Inp
                  placeholder="1 спальня, вітальня, балкон"
                  value={u.description}
                  onChange={e => setUnits(prev => prev.map((r, j) => j === i ? { ...r, description: e.target.value } : r))}
                />
              </Field>
            </div>

            <div className="bg-indigo-50/60 rounded-xl border border-indigo-100 p-3 space-y-3">
              <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Ціноутворення по гостях
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Базових гостей" hint="Включено в тариф">
                  <Inp
                    type="number" min="1" max="20"
                    placeholder="2"
                    value={u.capacity}
                    onChange={e => setUnits(prev => prev.map((r, j) => j === i ? { ...r, capacity: e.target.value } : r))}
                  />
                </Field>
                <Field label="Макс. місткість">
                  <Inp
                    type="number" min="1" max="30"
                    placeholder="4"
                    value={u.maxCapacity}
                    onChange={e => setUnits(prev => prev.map((r, j) => j === i ? { ...r, maxCapacity: e.target.value } : r))}
                  />
                </Field>
                <Field label="Доп. гість (₴/ніч)" hint="Понад базу">
                  <Inp
                    type="number" min="0"
                    placeholder="700"
                    value={u.extraGuestPrice}
                    onChange={e => setUnits(prev => prev.map((r, j) => j === i ? { ...r, extraGuestPrice: e.target.value } : r))}
                  />
                </Field>
              </div>
              {Number(u.extraGuestPrice) > 0 && (
                <p className="text-xs text-indigo-600 bg-white rounded-lg px-3 py-2 border border-indigo-100">
                  💡 Приклад: {u.capacity} гості = базова ціна. {parseInt(u.capacity)+1} гість = +{Number(u.extraGuestPrice).toLocaleString("uk-UA")} ₴/ніч. {u.maxCapacity} гостей = +{((parseInt(u.maxCapacity)-parseInt(u.capacity)) * Number(u.extraGuestPrice)).toLocaleString("uk-UA")} ₴/ніч
                </p>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setUnits(prev => [...prev, emptyUnit()])}
          className="w-full flex items-center justify-center gap-2 h-11 border-2 border-dashed border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-500 rounded-2xl text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> Додати ще юніт
        </button>
      </div>
    );

    // Step 3 — Rate/Tariff
    if (step === 3) return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex gap-2">
          <Info className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          Базова ціна — вартість за ніч для включених гостей. Кожен додатковий гість — за налаштуванням юніту.
        </p>
        <Field label="Назва тарифу" hint="Наприклад: BAR, Сезонний, Вікенд">
          <Inp
            placeholder="BAR — Базовий тариф"
            value={rate.name}
            onChange={e => r("name", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ціна за ніч (₴)" required hint="Для базової кількості гостей">
            <Inp
              type="number" min="0"
              placeholder="5400"
              value={rate.price}
              onChange={e => r("price", e.target.value)}
            />
          </Field>
          <Field label="Застосовується до" hint="Залиште порожнім = усі юніти">
            <Sel value={rate.category} onChange={v => r("category", v)}>
              <option value="">Усі категорії</option>
              <option value="standard">Стандарт</option>
              <option value="superior">Супер'єр</option>
              <option value="deluxe">Делюкс</option>
              <option value="suite">Люкс / Сюїт</option>
              <option value="family">Сімейний</option>
              <option value="economy">Економ</option>
            </Sel>
          </Field>
        </div>
        {done.units && done.units > 1 && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
            💡 У вас {done.units} юнітів. Якщо ціни різні — додайте ще тарифи в розділі <strong>Тарифи</strong> після завершення онбордингу.
          </div>
        )}
      </div>
    );

    // Step 4 — Legal entity
    if (step === 4) return (
      <div className="space-y-4">
        <SectionCard title="Реквізити юридичної особи" icon={<Building2 className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Тип" hint="ФОП, ТОВ, ПрАТ...">
              <Sel value={legal.type} onChange={v => l("type", v)}>
                <option value="fop">ФОП</option>
                <option value="tov">ТОВ</option>
                <option value="pp">ПП</option>
                <option value="prat">ПрАТ</option>
                <option value="pat">ПАТ</option>
                <option value="other">Інше</option>
              </Sel>
            </Field>
            <Field label="Код ЄДРПОУ / ІПН">
              <Inp
                placeholder="1234567890"
                value={legal.edrpou}
                onChange={e => l("edrpou", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Повна назва / ПІБ" hint="Як в свідоцтві реєстрації">
            <Inp
              placeholder="ФОП Коваленко Олег Миколайович"
              value={legal.name}
              onChange={e => l("name", e.target.value)}
            />
          </Field>
          <Field label="Юридична адреса">
            <Inp
              placeholder="вул. Садова, 15, м. Яремче, Івано-Франківська обл., 78500"
              value={legal.address}
              onChange={e => l("address", e.target.value)}
            />
          </Field>
        </SectionCard>

        <SectionCard title="Банківські реквізити" icon={<CreditCard className="w-4 h-4" />}>
          <Field label="IBAN" hint="UA + 27 цифр">
            <Inp
              placeholder="UA123456789012345678901234567"
              value={legal.iban}
              onChange={e => l("iban", e.target.value.toUpperCase())}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Назва банку">
              <Inp
                placeholder="АТ «ПриватБанк»"
                value={legal.bank}
                onChange={e => l("bank", e.target.value)}
              />
            </Field>
            <Field label="МФО">
              <Inp
                placeholder="305299"
                value={legal.mfo}
                onChange={e => l("mfo", e.target.value)}
              />
            </Field>
          </div>
        </SectionCard>
      </div>
    );

    // Step 5 — LiqPay + Contacts
    if (step === 5) return (
      <div className="space-y-4">
        <SectionCard title="LiqPay — онлайн-оплата" icon={<CreditCard className="w-4 h-4" />}>
          <p className="text-xs text-gray-500">Отримайте ключі в <a href="https://www.liqpay.ua/ua/authorization/signin" target="_blank" rel="noreferrer" className="text-indigo-500 underline">кабінеті LiqPay</a> → Бізнес → Магазин.</p>
          <Field label="Public Key" hint="Починається з «sandbox_» або «i»">
            <Inp
              placeholder="i0000000000000000"
              value={conn.liqpayPublic}
              onChange={e => c("liqpayPublic", e.target.value)}
            />
          </Field>
          <Field label="Private Key">
            <div className="relative">
              <Inp
                type="password"
                placeholder="••••••••••••••••••••••••"
                value={conn.liqpayPrivate}
                onChange={e => c("liqpayPrivate", e.target.value)}
              />
              <Lock className="absolute right-3 top-2.5 w-4 h-4 text-gray-300 pointer-events-none" />
            </div>
          </Field>
        </SectionCard>

        <SectionCard title="Контакти закладу" icon={<Phone className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Телефон">
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-300 pointer-events-none" />
                <Inp
                  cls="pl-9"
                  type="tel"
                  placeholder="+380 67 123 45 67"
                  value={conn.phone}
                  onChange={e => c("phone", e.target.value)}
                />
              </div>
            </Field>
            <Field label="Email">
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-300 pointer-events-none" />
                <Inp
                  cls="pl-9"
                  type="email"
                  placeholder="info@myhotel.ua"
                  value={conn.email}
                  onChange={e => c("email", e.target.value)}
                />
              </div>
            </Field>
          </div>
        </SectionCard>
      </div>
    );

    // Step 6 — Done
    if (step === 6) return (
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center py-4 space-y-3">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Check className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900">Система готова до роботи!</h3>
            <p className="text-gray-400 text-sm mt-1">Тепер можна зробити перше бронювання</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Заклад",     ok: !!done.propId,  icon: "🏨" },
            { label: "Юнітів",     ok: !!done.units,   icon: "🛏️", count: done.units },
            { label: "Тариф",      ok: !!done.rateId,  icon: "💰" },
            { label: "Юр. особа",  ok: !!done.legalId, icon: "📄", optional: true },
          ].map(({ label, ok, icon, count, optional }) => (
            <div key={label} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${ok ? "bg-emerald-50 border-emerald-200" : optional ? "bg-gray-50 border-gray-200" : "bg-amber-50 border-amber-200"}`}>
              <span className="text-2xl">{icon}</span>
              <div>
                <div className={`text-sm font-semibold ${ok ? "text-emerald-700" : optional ? "text-gray-400" : "text-amber-700"}`}>
                  {label}{count ? ` (${count})` : ""}
                </div>
                <div className={`text-xs ${ok ? "text-emerald-500" : optional ? "text-gray-400" : "text-amber-500"}`}>
                  {ok ? "✓ Налаштовано" : optional ? "Пропущено" : "⚠ Не заповнено"}
                </div>
              </div>
            </div>
          ))}
        </div>

        {!done.legalId && (
          <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">Без юридичної особи не вдасться виставити рахунок. Додайте її у Налаштування → Юридичні особи.</p>
          </div>
        )}
      </div>
    );

    return null;
  }

  const isLastStep = step === 6;
  const canSkip = !currentStep.required && step < 6;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/20 flex items-start justify-center py-10 px-4">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-white border border-indigo-100 rounded-2xl px-4 py-2 shadow-sm mb-4">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-semibold text-indigo-700">Налаштування системи</span>
          </div>
          <h1 className="text-3xl font-black text-gray-900">Запуск Maison HD</h1>
          <p className="text-gray-500 mt-1">Пройдіть {STEPS.filter(s => s.required).length} обов'язкові кроки для першого бронювання</p>
        </div>

        {/* Step progress bar */}
        <div className="flex items-center justify-center gap-1 mb-8 flex-wrap">
          {STEPS.map((s, i) => {
            const done_ = s.id < step;
            const current_ = s.id === step;
            const SIcon = s.icon;
            return (
              <div key={s.id} className="flex items-center gap-1">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  current_ ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/30"
                  : done_   ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                  : "bg-white text-gray-400 border border-gray-200"
                }`}>
                  {done_ ? <Check className="w-3 h-3" /> : <SIcon className="w-3 h-3" />}
                  <span className="hidden sm:inline">{s.label}</span>
                  {!s.required && !current_ && !done_ && <span className="text-[9px] opacity-60 ml-0.5">(optional)</span>}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-4 h-0.5 rounded-full transition-colors ${s.id < step ? "bg-emerald-300" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Main card grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Left: Form */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm">
            <div className="px-8 pt-8 pb-4 border-b border-gray-100">
              <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${tip.color} flex items-center justify-center shadow-lg shrink-0`}>
                  {(() => { const SI = currentStep.icon; return <SI className="w-5 h-5 text-white" />; })()}
                </div>
                <div>
                  <h2 className="text-xl font-black text-gray-900">
                    {step <= 5 ? `Крок ${step} з 5` : ""} — {currentStep.label}
                  </h2>
                  <p className="text-sm text-gray-400 mt-0.5">{currentStep.desc}</p>
                </div>
              </div>
            </div>

            <div className="px-8 py-6">
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              {Content()}
            </div>

            {/* Footer */}
            <div className="px-8 pb-8 flex items-center gap-3">
              {step > 1 && !isLastStep && (
                <button
                  type="button"
                  onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-1.5 px-5 py-3 rounded-2xl border border-gray-200 text-sm text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Назад
                </button>
              )}
              <div className="flex-1" />
              {canSkip && (
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-sm text-gray-400 hover:text-gray-600 font-semibold px-4 py-3 transition-colors"
                >
                  Пропустити
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                disabled={saving}
                className={`flex items-center gap-2 px-7 py-3 rounded-2xl text-sm font-bold transition-all disabled:opacity-40 shadow-sm ${
                  isLastStep
                    ? "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-emerald-500/25"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/25"
                }`}
              >
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : isLastStep
                    ? <><CheckCircle2 className="w-4 h-4" /> Зробити перше бронювання</>
                    : <>{step < 5 ? "Далі" : "Завершити налаштування"} <ChevronRight className="w-4 h-4" /></>
                }
              </button>
            </div>
          </div>

          {/* Right: Tips panel */}
          <div className={`rounded-3xl bg-gradient-to-br ${tip.color} p-6 text-white self-start sticky top-8`}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <Info className="w-4 h-4" />
              </div>
              <h3 className="font-black text-lg">{tip.title}</h3>
            </div>
            <ul className="space-y-3 mb-5">
              {tip.points.map((pt, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-white/90">
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3" />
                  </div>
                  {pt}
                </li>
              ))}
            </ul>
            {tip.hint && (
              <div className="bg-white/10 rounded-xl px-4 py-3 text-xs text-white/80 border border-white/20">
                💡 {tip.hint}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
