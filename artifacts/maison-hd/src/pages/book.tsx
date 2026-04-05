/**
 * BOOKING ENGINE — Public booking widget / hosted page
 * Routes: /maison-hd/book
 * Modes: widget embed, standalone hosted page, mobile-first flow, white-label
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Search, BedDouble, Users, Calendar, Car, CheckCircle2,
  ChevronRight, Star, MapPin, ArrowLeft, Sparkles, Clock, Shield,
  Plus, Minus, X, Tag, Package, Gift, ChevronDown, ChevronUp,
  Utensils, Scissors, Bus, PawPrint, Baby, Check, Loader2,
  ExternalLink, Download, Lock, CreditCard, AlertCircle, Globe,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_PUB = BASE.replace("/maison-hd", "") + "/api/public";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API_PUB + path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });

const fmtMoney = (n: number) => Math.round(n).toLocaleString("uk-UA");
const todayStr = () => new Date().toISOString().slice(0, 10);
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
const calcNights = (a: string, b: string) => Math.max(0, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000));

// ─── Packages ────────────────────────────────────────────────────────────────
const PACKAGES = [
  { id: "romance", name: "Романтичний", icon: "🌹", desc: "Шампанське, квіти, вечеря на двох, late checkout", pricePerStay: 2400, includes: ["Шампанське та полуниця", "Квіткові декорації", "Вечеря на двох", "Late checkout до 14:00"] },
  { id: "family", name: "Сімейний", icon: "👨‍👩‍👧", desc: "Сніданок, дитяча ліжко, анімація для дітей", pricePerNight: 400, includes: ["Сніданок для сім'ї", "Дитяче ліжечко безкоштовно", "Ігровий простір", "Анімація для дітей"] },
  { id: "wellness", name: "Wellness SPA", icon: "🧘", desc: "СПА-процедури, масаж, безлімітний spa-доступ", pricePerNight: 800, includes: ["Доступ до SPA-зони", "Масаж 60 хв.", "Ароматерапія", "Фітнес-зал"] },
  { id: "business", name: "Бізнес", icon: "💼", desc: "Early check-in, late checkout, сніданок, трансфер", pricePerStay: 1200, includes: ["Early check-in з 10:00", "Late checkout до 15:00", "Сніданок включений", "Трансфер з/до аеропорту"] },
];

// ─── Add-ons ──────────────────────────────────────────────────────────────────
const ADDONS = [
  { id: "breakfast", icon: "🍳", label: "Сніданок", desc: "Шведський стіл щодня", pricePerPerson: 320, pricingType: "per_person_per_night" as const },
  { id: "spa", icon: "💆", label: "SPA-доступ", desc: "Безлімітний доступ до SPA-зони", pricePerNight: 450, pricingType: "per_night" as const },
  { id: "transfer", icon: "🚌", label: "Трансфер", desc: "Зустріч та проводи авто", pricePerStay: 900, pricingType: "per_stay" as const },
  { id: "pet", icon: "🐾", label: "З вихованцем", desc: "Розміщення домашнього улюбленця", pricePerNight: 200, pricingType: "per_night" as const },
  { id: "parking", icon: "🚗", label: "Паркінг", desc: "Охоронний паркінг на territory", pricePerNight: 150, pricingType: "per_night" as const },
  { id: "early_ci", icon: "⏰", label: "Ранній заїзд", desc: "Заїзд з 10:00 (замість 14:00)", pricePerStay: 350, pricingType: "per_stay" as const },
  { id: "late_co", icon: "🌙", label: "Пізній виїзд", desc: "Виїзд о 15:00 (замість 12:00)", pricePerStay: 350, pricingType: "per_stay" as const },
  { id: "baby_bed", icon: "👶", label: "Дитяче ліжко", desc: "Розкладне ліжко для дитини", pricePerStay: 0, pricingType: "per_stay" as const },
];

// ─── Promo codes ──────────────────────────────────────────────────────────────
const PROMO_CODES: Record<string, { type: "percent" | "fixed"; value: number; label: string }> = {
  "WELCOME10": { type: "percent", value: 10, label: "Знижка 10% для нових гостей" },
  "DOGODA20":  { type: "percent", value: 20, label: "Знижка 20% за промокодом" },
  "SUMMER500": { type: "fixed",   value: 500, label: "Знижка 500 ₴ — літній промо" },
};

// ─── Rate plans ───────────────────────────────────────────────────────────────
const RATE_PLANS = [
  { id: "flexible",  label: "Гнучкий",         desc: "Безкоштовне скасування за 48 год", modifier: 1.15, tag: "Рекомендований", cancelPolicy: "Безкоштовне скасування за 48 годин до заїзду" },
  { id: "standard",  label: "Стандарт",         desc: "Скасування за 7 днів без штрафу", modifier: 1.0,  tag: "",              cancelPolicy: "Безкоштовне скасування за 7 днів. Пізніше — штраф 1 ніч." },
  { id: "nonrefund", label: "Без повернення",   desc: "Найнижча ціна. Без повернення.",  modifier: 0.85, tag: "Найдешевше",   cancelPolicy: "Без повернення коштів при скасуванні." },
];

type Step = "search" | "unit" | "extras" | "form" | "payment" | "confirm";

export default function BookPage() {
  const { toast } = useToast();
  const slug = useMemo(() => new URLSearchParams(window.location.search).get("slug") || "", []);
  const [step, setStep] = useState<Step>("search");
  const [organization, setOrganization] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [search, setSearch] = useState({ propertyId: "", checkIn: todayStr(), checkOut: tomorrowStr(), adults: 2, children: 0, childAge1: 0, childAge2: 0 });
  const [results, setResults] = useState<any[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [selectedRate, setSelectedRate] = useState("standard");
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; type: string; value: number; label: string } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [showChildren, setShowChildren] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState<any>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", country: "UA", specialRequests: "", agreeTerms: false });
  const [payMethod, setPayMethod] = useState("arrival");

  useEffect(() => {
    const params = slug ? `?slug=${slug}` : "";
    apiFetch(`/properties${params}`)
      .then(r => r.json())
      .then(d => {
        setProperties(Array.isArray(d) ? d : (Array.isArray(d?.properties) ? d.properties : []));
        if (d?.organization) setOrganization(d.organization);
      })
      .catch(() => {});
  }, [slug]);

  const nightsCount = calcNights(search.checkIn, search.checkOut);
  const rate = RATE_PLANS.find(r => r.id === selectedRate)!;
  const pkg = PACKAGES.find(p => p.id === selectedPackage);

  const basePrice = useMemo(() => {
    if (!selectedUnit) return 0;
    return parseFloat(selectedUnit.basePrice || selectedUnit.base_price || "0") * nightsCount * rate.modifier;
  }, [selectedUnit, nightsCount, rate]);

  const addonsTotal = useMemo(() => {
    let total = 0;
    const guests = search.adults + search.children;
    selectedAddons.forEach(id => {
      const a = ADDONS.find(x => x.id === id);
      if (!a) return;
      if (a.pricingType === "per_night") total += (a.pricePerNight || 0) * nightsCount;
      else if (a.pricingType === "per_person_per_night") total += (a.pricePerPerson || 0) * nightsCount * guests;
      else total += a.pricePerStay || 0;
    });
    return total;
  }, [selectedAddons, nightsCount, search.adults, search.children]);

  const packagePrice = useMemo(() => {
    if (!pkg) return 0;
    if ("pricePerStay" in pkg) return pkg.pricePerStay;
    return (pkg as any).pricePerNight * nightsCount;
  }, [pkg, nightsCount]);

  const subtotal = basePrice + addonsTotal + packagePrice;
  const discount = appliedPromo ? (appliedPromo.type === "percent" ? subtotal * appliedPromo.value / 100 : appliedPromo.value) : 0;
  const total = Math.max(0, subtotal - discount);
  const prepayment = Math.round(total * 0.3);

  const handleSearch = async () => {
    if (nightsCount < 1) { toast({ title: "Введіть коректні дати", variant: "destructive" }); return; }
    setLoading(true);
    const p = new URLSearchParams({ checkIn: search.checkIn, checkOut: search.checkOut, guests: String(search.adults) });
    if (search.propertyId) p.set("propertyId", search.propertyId);
    else if (slug) p.set("slug", slug);
    const r = await apiFetch(`/availability?${p}`);
    const d = await r.json();
    setResults(d.units || []);
    setLoading(false);
    setStep("unit");
  };

  const applyPromo = () => {
    const code = promoCode.trim().toUpperCase();
    const found = PROMO_CODES[code];
    if (!found) { setPromoError("Промокод не знайдено або застарів"); return; }
    setAppliedPromo({ code, ...found });
    setPromoError("");
    toast({ title: `Промокод активовано! ${found.label}` });
  };

  const toggleAddon = (id: string) => {
    setSelectedAddons(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleConfirm = async () => {
    if (!form.firstName || !form.email || !form.agreeTerms) { toast({ title: "Заповніть всі обов'язкові поля", variant: "destructive" }); return; }
    setLoading(true);
    const extras = [
      form.specialRequests,
      pkg ? `Пакет: ${pkg.name}` : "",
      selectedAddons.size ? `Додатки: ${Array.from(selectedAddons).join(", ")}` : "",
      appliedPromo ? `Промокод: ${appliedPromo.code}` : "",
    ].filter(Boolean).join("; ");
    const r = await apiFetch("/bookings", { method: "POST", body: JSON.stringify({
      unitId: selectedUnit.id, firstName: form.firstName, lastName: form.lastName,
      email: form.email, phone: form.phone, checkIn: search.checkIn, checkOut: search.checkOut,
      adults: search.adults, children: search.children, specialRequests: extras,
      totalAmount: total, paidAmount: 0,
    }) });
    const d = await r.json();
    if (!r.ok) { setLoading(false); toast({ title: d.error || "Помилка бронювання", variant: "destructive" }); return; }

    const bk = d.booking || d;
    const bookingId = bk.id;
    const bookingRef = bk.bookingRef || bk.booking_ref || "—";
    const guestAccessCode = bk.guestAccessCode || bk.guest_access_code || null;

    // Online payment — redirect to LiqPay
    if (payMethod === "online" && bookingId) {
      const lqr = await apiFetch(`/liqpay/${bookingId}`, { method: "POST" });
      const lqd = await lqr.json();
      if (lqr.ok && lqd.data && lqd.signature) {
        // Build and submit LiqPay form
        const form_ = document.createElement("form");
        form_.method = "POST";
        form_.action = "https://www.liqpay.ua/api/3/checkout";
        form_.target = "_blank";
        ["data", "signature"].forEach(k => {
          const inp = document.createElement("input");
          inp.type = "hidden"; inp.name = k; inp.value = lqd[k];
          form_.appendChild(inp);
        });
        document.body.appendChild(form_);
        form_.submit();
        document.body.removeChild(form_);
        toast({ title: "Перенаправляємо на оплату LiqPay…" });
      } else {
        // LiqPay not configured — still confirm but notify
        toast({ title: lqd.message || "Онлайн-оплата недоступна. Оплата при заїзді.", variant: "destructive" });
      }
    }

    setLoading(false);
    setConfirmed({ bookingRef, guestAccessCode, ...form, ...search, nights: nightsCount, total, unitName: selectedUnit.name, propertyName: selectedUnit.propertyName || organization?.name, payMethod });
    setStep("confirm");
  };

  // ─── CONFIRM PAGE ─────────────────────────────────────────────────────────
  if (step === "confirm" && confirmed) return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-md w-full overflow-hidden">
        <div className="bg-emerald-600 p-8 text-white text-center">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-1">Бронювання підтверджено!</h1>
          <p className="opacity-80 text-lg">Дякуємо, {confirmed.firstName}!</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
            <Row label="Номер бронювання" value={confirmed.bookingRef} bold />
            <Row label="Об'єкт" value={confirmed.propertyName} />
            <Row label="Розміщення" value={confirmed.unitName} />
            <Row label="Заїзд" value={confirmed.checkIn} />
            <Row label="Виїзд" value={confirmed.checkOut} />
            <Row label="Ночей" value={String(confirmed.nights)} />
            <div className="h-px bg-gray-200" />
            <Row label="Загальна сума" value={`${fmtMoney(confirmed.total)} ₴`} bold />
          </div>
          <div className="bg-blue-50 rounded-2xl p-4 text-sm text-blue-800">
            <p className="font-semibold mb-1">✉️ Підтвердження надіслано на email</p>
            <p className="opacity-80 text-xs">Посилання для онлайн-чекіну надійде за 24 год до заїзду.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => window.open(`${BASE}/guest/${confirmed.guestAccessCode || confirmed.bookingRef}`, "_blank")}>
              <ExternalLink className="h-4 w-4 mr-1" /> Кабінет гостя
            </Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setStep("search"); setConfirmed(null); setSelectedUnit(null); setSelectedAddons(new Set()); setSelectedPackage(null); setAppliedPromo(null); }}>
              Нове бронювання
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step !== "search" && (
              <button onClick={() => { if (step==="unit") setStep("search"); else if (step==="extras") setStep("unit"); else if (step==="form") setStep("extras"); else if (step==="payment") setStep("form"); }} className="p-2 rounded-xl hover:bg-gray-100">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <span className="font-bold text-gray-900 text-lg">🏡 {organization?.name || "Онлайн бронювання"}</span>
          </div>
          {/* Steps */}
          <div className="hidden sm:flex items-center gap-1">
            {(["search","unit","extras","form","payment"] as Step[]).map((s, i) => {
              const si = ["search","unit","extras","form","payment"].indexOf(step);
              const ci = ["search","unit","extras","form","payment"].indexOf(s);
              return (
                <div key={s} className="flex items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${step===s ? "bg-blue-600 text-white shadow-sm" : ci<si ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                    {ci < si ? <Check className="h-3.5 w-3.5" /> : i+1}
                  </div>
                  {i < 4 && <div className={`w-5 h-0.5 transition-all ${ci < si ? "bg-emerald-400" : "bg-gray-200"}`} />}
                </div>
              );
            })}
          </div>
          <a href={`${BASE}/`} className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 hidden sm:flex">
            <Globe className="h-3.5 w-3.5" /> На сайт
          </a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 pb-16">

        {/* ─── STEP 1: SEARCH ──────────────────────────────────────────── */}
        {step === "search" && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Знайдіть ідеальний відпочинок</h1>
              <p className="text-gray-500">Перевірте наявність та забронюйте онлайн</p>
            </div>
            <div className="bg-white rounded-3xl shadow-lg p-6 space-y-5">
              <div>
                <Label className="text-sm font-semibold text-gray-700 mb-2 block">Об'єкт <span className="text-gray-400 font-normal">(необов'язково)</span></Label>
                <div className="flex flex-wrap gap-2">
                  {[{ id: "", name: "Будь-який 🏡" }, ...properties].map(p => (
                    <button key={p.id} onClick={() => setSearch(s => ({ ...s, propertyId: String(p.id) }))}
                      className={`px-3 py-2 rounded-xl border-2 text-sm font-medium transition ${search.propertyId === String(p.id) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300 text-gray-600"}`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-sm font-semibold text-gray-700">Заїзд</Label><Input type="date" value={search.checkIn} min={todayStr()} onChange={e => setSearch(s => ({ ...s, checkIn: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-sm font-semibold text-gray-700">Виїзд</Label><Input type="date" value={search.checkOut} min={search.checkIn} onChange={e => setSearch(s => ({ ...s, checkOut: e.target.value }))} className="mt-1" /></div>
              </div>
              {nightsCount > 0 && <div className="text-center text-sm text-blue-600 font-medium bg-blue-50 py-1.5 rounded-xl">{nightsCount} {nightsCount===1?"ніч":nightsCount<5?"ночі":"ночей"}</div>}
              <div>
                <Label className="text-sm font-semibold text-gray-700 mb-2 block">Гості</Label>
                <div className="flex flex-wrap items-center gap-4">
                  <Counter label="Дорослі" value={search.adults} min={1} max={10} onChange={v => setSearch(s => ({ ...s, adults: v }))} />
                  <div>
                    <button onClick={() => setShowChildren(v => !v)} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                      Діти ({search.children}) {showChildren ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {showChildren && (
                      <div className="mt-2 space-y-2">
                        <Counter label="Кількість дітей" value={search.children} min={0} max={4} onChange={v => setSearch(s => ({ ...s, children: v }))} />
                        {search.children >= 1 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-14">Вік дит.1</span>
                            <select value={search.childAge1} onChange={e => setSearch(s => ({ ...s, childAge1: +e.target.value }))} className="border rounded px-2 py-1 text-xs">
                              {Array.from({length:18},(_,i)=><option key={i} value={i}>{i===0?"до 1 р.":i+" р."}</option>)}
                            </select>
                          </div>
                        )}
                        {search.children >= 2 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-14">Вік дит.2</span>
                            <select value={search.childAge2} onChange={e => setSearch(s => ({ ...s, childAge2: +e.target.value }))} className="border rounded px-2 py-1 text-xs">
                              {Array.from({length:18},(_,i)=><option key={i} value={i}>{i===0?"до 1 р.":i+" р."}</option>)}
                            </select>
                          </div>
                        )}
                        {search.children > 0 && search.childAge1 < 6 && <p className="text-[10px] text-emerald-600">✓ Дитяче ліжко безкоштовно до 6 р.</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <Button onClick={handleSearch} disabled={loading||nightsCount<1} className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700 rounded-2xl">
                {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Search className="h-5 w-5 mr-2" />}
                Перевірити доступність
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-5">
              {[{icon:"🔒",label:"Безпечний платіж",desc:"SSL шифрування"},{icon:"⚡",label:"Миттєве підтвердження",desc:"Без очікування"},{icon:"💰",label:"Найкраща ціна",desc:"Гарантована"}].map(t=>(
                <div key={t.label} className="bg-white rounded-2xl p-3 text-center shadow-sm">
                  <p className="text-2xl mb-1">{t.icon}</p>
                  <p className="text-xs font-semibold text-gray-700">{t.label}</p>
                  <p className="text-[10px] text-gray-400">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── STEP 2: UNIT SELECTION ──────────────────────────────────── */}
        {step === "unit" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Оберіть розміщення</h2>
                <p className="text-sm text-gray-500">{results.length} варіантів · {search.checkIn} – {search.checkOut} · {nightsCount} {nightsCount<5?"ночі":"ночей"}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setStep("search")}><Search className="h-4 w-4 mr-1" />Змінити</Button>
            </div>
            {results.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
                <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-700 mb-1">Немає вільних варіантів</h3>
                <p className="text-gray-400 text-sm mb-4">Спробуйте інші дати або зменшіть кількість гостей</p>
                <Button onClick={()=>setStep("search")}>Змінити пошук</Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {results.map(u => <UnitCard key={u.id} unit={u} nights={nightsCount} onSelect={()=>{ setSelectedUnit(u); setStep("extras"); }} />)}
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 3: EXTRAS ─────────────────────────────────────────── */}
        {step === "extras" && selectedUnit && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-5">
              {/* Rate plans */}
              <SCard title="Тариф" emoji="🏷️">
                <div className="space-y-2">
                  {RATE_PLANS.map(r => {
                    const p = parseFloat(selectedUnit.basePrice || selectedUnit.base_price || "0") * nightsCount * r.modifier;
                    return (
                      <label key={r.id} className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${selectedRate===r.id?"border-blue-500 bg-blue-50":"border-gray-200 hover:border-gray-300"}`}>
                        <input type="radio" name="rate" value={r.id} checked={selectedRate===r.id} onChange={()=>setSelectedRate(r.id)} className="accent-blue-600" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{r.label}</span>
                            {r.tag && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{r.tag}</span>}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{r.desc}</p>
                        </div>
                        <span className="font-bold text-sm">{fmtMoney(p)} ₴</span>
                      </label>
                    );
                  })}
                </div>
              </SCard>

              {/* Packages */}
              <SCard title="Пакети" emoji="📦">
                <div className="grid sm:grid-cols-2 gap-2">
                  {PACKAGES.map(p => {
                    const pp = "pricePerStay" in p ? p.pricePerStay : (p as any).pricePerNight * nightsCount;
                    const sel = selectedPackage === p.id;
                    return (
                      <div key={p.id} onClick={()=>setSelectedPackage(sel?null:p.id)}
                        className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${sel?"border-purple-500 bg-purple-50":"border-gray-200 hover:border-gray-300"}`}>
                        <div className="flex justify-between items-start mb-1">
                          <div><span className="text-lg mr-1">{p.icon}</span><span className="font-semibold text-sm">{p.name}</span></div>
                          {sel && <Check className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />}
                        </div>
                        <p className="text-xs text-gray-500">{p.desc}</p>
                        <p className="text-sm font-bold text-purple-700 mt-1.5">+{fmtMoney(pp)} ₴</p>
                        {sel && (
                          <ul className="mt-1.5 space-y-0.5">
                            {p.includes.map(i=><li key={i} className="text-[10px] text-purple-700 flex items-center gap-1"><Check className="h-2.5 w-2.5" />{i}</li>)}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </SCard>

              {/* Add-ons */}
              <SCard title="Додаткові послуги" emoji="✨">
                <div className="grid sm:grid-cols-2 gap-2">
                  {ADDONS.map(a => {
                    const guests = search.adults + search.children;
                    const price = a.pricingType==="per_night"?(a.pricePerNight||0)*nightsCount:a.pricingType==="per_person_per_night"?(a.pricePerPerson||0)*nightsCount*guests:(a.pricePerStay||0);
                    const sel = selectedAddons.has(a.id);
                    return (
                      <div key={a.id} onClick={()=>toggleAddon(a.id)}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all ${sel?"border-emerald-500 bg-emerald-50":"border-gray-200 hover:border-gray-300"}`}>
                        <span className="text-xl flex-shrink-0">{a.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{a.label}</p>
                          <p className="text-[10px] text-gray-400">{a.desc}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {price===0?<span className="text-xs text-emerald-600 font-bold">Безкоштовно</span>:<span className="text-xs font-bold">+{fmtMoney(price)} ₴</span>}
                          {sel && <Check className="h-3.5 w-3.5 text-emerald-600 block ml-auto mt-0.5" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SCard>

              {/* Promo code */}
              <SCard title="Промокод" emoji="🎫">
                {appliedPromo ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <div><p className="text-sm font-bold text-emerald-700">{appliedPromo.code}</p><p className="text-xs text-emerald-600">{appliedPromo.label}</p></div>
                    <button onClick={()=>setAppliedPromo(null)} className="text-gray-400 hover:text-gray-600 p-1"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <Input placeholder="WELCOME10" value={promoCode} onChange={e=>setPromoCode(e.target.value.toUpperCase())} className="uppercase font-mono tracking-wider" />
                      <Button variant="outline" onClick={applyPromo}>Застосувати</Button>
                    </div>
                    {promoError && <p className="text-xs text-red-500">{promoError}</p>}
                    <p className="text-[10px] text-gray-400">Спробуйте: WELCOME10 · DOGODA20 · SUMMER500</p>
                  </div>
                )}
              </SCard>
            </div>
            <div className="md:col-span-1">
              <PriceSummary unit={selectedUnit} nights={nightsCount} basePrice={basePrice} addons={addonsTotal} pkg={packagePrice} pkgName={pkg?.name} discount={discount} total={total} promoCode={appliedPromo?.code} />
              <Button onClick={()=>setStep("form")} className="w-full mt-4 h-12 bg-blue-600 hover:bg-blue-700 rounded-2xl text-base font-semibold">
                Далі — дані гостя <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── STEP 4: GUEST FORM ──────────────────────────────────────── */}
        {step === "form" && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-5">
              <SCard title="Контактні дані" emoji="👤">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-semibold">Ім'я *</Label><Input value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))} placeholder="Олена" className="mt-1" /></div>
                    <div><Label className="text-xs font-semibold">Прізвище</Label><Input value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))} placeholder="Коваль" className="mt-1" /></div>
                  </div>
                  <div><Label className="text-xs font-semibold">Email *</Label><Input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="email@example.com" className="mt-1" /></div>
                  <div><Label className="text-xs font-semibold">Телефон</Label><Input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="+380…" className="mt-1" /></div>
                  <div><Label className="text-xs font-semibold">Країна</Label>
                    <select value={form.country} onChange={e=>setForm(f=>({...f,country:e.target.value}))} className="mt-1 w-full border rounded-md px-3 py-2 text-sm">
                      {[["UA","🇺🇦 Україна"],["PL","🇵🇱 Польща"],["DE","🇩🇪 Германія"],["GB","🇬🇧 Великобританія"],["US","🇺🇸 США"],["CZ","🇨🇿 Чехія"],["other","Інша"]].map(([v,l])=>(
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div><Label className="text-xs font-semibold">Особливі побажання</Label>
                    <Textarea rows={3} value={form.specialRequests} onChange={e=>setForm(f=>({...f,specialRequests:e.target.value}))} placeholder="Поверх, тип ліжка, алергії, час прибуття, car number…" className="mt-1 resize-none" />
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.agreeTerms} onChange={e=>setForm(f=>({...f,agreeTerms:e.target.checked}))} className="mt-1 accent-blue-600" />
                    <span className="text-xs text-gray-600">Я погоджуюсь з <a href="#" className="text-blue-600 underline">умовами бронювання</a> та <a href="#" className="text-blue-600 underline">політикою конфіденційності</a> *</span>
                  </label>
                </div>
              </SCard>
            </div>
            <div className="md:col-span-1">
              <PriceSummary unit={selectedUnit} nights={nightsCount} basePrice={basePrice} addons={addonsTotal} pkg={packagePrice} pkgName={pkg?.name} discount={discount} total={total} promoCode={appliedPromo?.code} />
              <Button onClick={()=>setStep("payment")} disabled={!form.firstName||!form.email||!form.agreeTerms} className="w-full mt-4 h-12 bg-blue-600 hover:bg-blue-700 rounded-2xl text-base font-semibold disabled:opacity-50">
                Далі — оплата <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── STEP 5: PAYMENT ─────────────────────────────────────────── */}
        {step === "payment" && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-5">
              <SCard title="Спосіб оплати" emoji="💳">
                <div className="space-y-2">
                  {[
                    { id:"arrival", label:"При заїзді", desc:"Оплата готівкою або карткою при заїзді", icon:"🏠" },
                    { id:"online",  label:`Онлайн — 30% (${fmtMoney(prepayment)} ₴)`, desc:"Онлайн оплата передоплати карткою зараз", icon:"💳" },
                    { id:"invoice", label:"Банківський переказ", desc:"Рахунок-фактура на компанію (1–2 дні)", icon:"🏦" },
                  ].map(m=>(
                    <label key={m.id} className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${payMethod===m.id?"border-blue-500 bg-blue-50":"border-gray-200 hover:border-gray-300"}`}>
                      <input type="radio" name="pay" value={m.id} checked={payMethod===m.id} onChange={()=>setPayMethod(m.id)} className="accent-blue-600" />
                      <span className="text-xl">{m.icon}</span>
                      <div><p className="font-semibold text-sm">{m.label}</p><p className="text-xs text-gray-400">{m.desc}</p></div>
                    </label>
                  ))}
                </div>
                {payMethod === "online" && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-2xl space-y-3 border border-blue-200">
                    <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                      <Lock className="h-4 w-4" />Безпечна оплата через LiqPay
                    </p>
                    <div className="flex items-center gap-3 text-xs text-blue-700">
                      <span className="bg-white border border-blue-200 rounded px-2 py-1 font-bold text-blue-600">VISA</span>
                      <span className="bg-white border border-blue-200 rounded px-2 py-1 font-bold text-red-500">MC</span>
                      <span className="bg-white border border-blue-200 rounded px-2 py-1 font-bold text-orange-500">LiqPay</span>
                    </div>
                    <p className="text-xs text-blue-600">Після натискання «Оплатити» ви будете перенаправлені на захищену сторінку LiqPay для введення даних картки.</p>
                    <p className="text-[10px] text-blue-500">3D Secure · SSL шифрування · PCI DSS</p>
                  </div>
                )}
              </SCard>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-sm font-semibold text-amber-800 mb-1">📋 Умови скасування</p>
                <p className="text-sm text-amber-700">{RATE_PLANS.find(r=>r.id===selectedRate)?.cancelPolicy}</p>
              </div>
            </div>
            <div className="md:col-span-1">
              <PriceSummary unit={selectedUnit} nights={nightsCount} basePrice={basePrice} addons={addonsTotal} pkg={packagePrice} pkgName={pkg?.name} discount={discount} total={total} promoCode={appliedPromo?.code} prepayment={payMethod==="online"?prepayment:undefined} />
              <Button onClick={handleConfirm} disabled={loading} className="w-full mt-4 h-12 rounded-2xl text-base font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                {loading?<Loader2 className="h-5 w-5 animate-spin mr-2" />:<Check className="h-5 w-5 mr-2" />}
                {payMethod==="online"?`Оплатити ${fmtMoney(prepayment)} ₴`:"Підтвердити бронювання"}
              </Button>
              <p className="text-[10px] text-center text-gray-400 mt-2">Натискаючи кнопку, ви приймаєте умови бронювання</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function Counter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 w-24">{label}</span>
      <button onClick={()=>onChange(Math.max(min,value-1))} className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-blue-400 transition"><Minus className="h-3 w-3" /></button>
      <span className="w-6 text-center font-bold">{value}</span>
      <button onClick={()=>onChange(Math.min(max,value+1))} className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-blue-400 transition"><Plus className="h-3 w-3" /></button>
    </div>
  );
}

function SCard({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><span>{emoji}</span>{title}</h3>
      {children}
    </div>
  );
}

function UnitCard({ unit: u, nights, onSelect }: any) {
  const [expanded, setExpanded] = useState(false);
  const base = parseFloat(u.basePrice || u.base_price || "0");
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-transparent hover:border-blue-200 transition-all overflow-hidden">
      <div className="bg-gradient-to-br from-blue-400 to-indigo-600 h-32 flex items-end p-3">
        <Badge className="bg-white/20 text-white border-white/30 text-[10px]">{u.category || u.propertyName}</Badge>
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div><h3 className="font-bold text-gray-900">{u.name}</h3><p className="text-xs text-gray-400">{u.propertyName}{u.floor?` · ${u.floor} пов.`:""}</p></div>
          <div className="text-right">
            <p className="text-lg font-bold text-blue-700">{fmtMoney(base)} ₴<span className="text-xs font-normal text-gray-400">/н</span></p>
            <p className="text-sm text-gray-600 font-medium">{fmtMoney(base*nights)} ₴ всього</p>
          </div>
        </div>
        <div className="flex gap-1 flex-wrap">
          {u.maxCapacity && <Badge variant="secondary" className="text-[10px]">👥 до {u.maxCapacity} ос.</Badge>}
          {u.squareMeters && <Badge variant="secondary" className="text-[10px]">📐 {u.squareMeters} м²</Badge>}
          {u.hasView && <Badge variant="secondary" className="text-[10px]">🌄 Вид</Badge>}
          {u.hasBalcony && <Badge variant="secondary" className="text-[10px]">🏡 Балкон</Badge>}
          <Badge className="text-[10px] bg-emerald-100 text-emerald-700">✓ Вільно</Badge>
        </div>
        {u.description && (
          <div className="mt-2">
            <p className={`text-xs text-gray-500 ${expanded?"":"line-clamp-2"}`}>{u.description}</p>
            {u.description.length>80&&<button onClick={()=>setExpanded(v=>!v)} className="text-xs text-blue-600 hover:underline">{expanded?"Згорнути":"Детальніше"}</button>}
          </div>
        )}
        <Button onClick={onSelect} className="w-full mt-3 bg-blue-600 hover:bg-blue-700 rounded-xl">Обрати <ChevronRight className="h-4 w-4 ml-1" /></Button>
      </div>
    </div>
  );
}

function PriceSummary({ unit, nights, basePrice, addons, pkg, pkgName, discount, total, promoCode, prepayment }: any) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sticky top-20 space-y-3">
      <div><p className="font-bold text-sm">{unit.name}</p><p className="text-xs text-gray-400">{unit.propertyName} · {nights} {nights<5?"ночі":"ночей"}</p></div>
      <div className="h-px bg-gray-100" />
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">Проживання</span><span>{fmtMoney(basePrice)} ₴</span></div>
        {addons>0&&<div className="flex justify-between"><span className="text-gray-500">Послуги</span><span>+{fmtMoney(addons)} ₴</span></div>}
        {pkg>0&&<div className="flex justify-between"><span className="text-gray-500">{pkgName}</span><span>+{fmtMoney(pkg)} ₴</span></div>}
        {discount>0&&<div className="flex justify-between text-emerald-600"><span>Промокод {promoCode}</span><span>−{fmtMoney(discount)} ₴</span></div>}
      </div>
      <div className="h-px bg-gray-100" />
      <div className="flex justify-between font-bold"><span>Разом</span><span className="text-blue-700 text-lg">{fmtMoney(total)} ₴</span></div>
      {prepayment!==undefined&&(
        <div className="bg-blue-50 rounded-xl p-2 flex justify-between text-sm">
          <span className="text-blue-700">Зараз (30%)</span>
          <span className="font-bold text-blue-800">{fmtMoney(prepayment)} ₴</span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className={bold?"font-bold text-gray-900":""}>{value}</span></div>;
}
