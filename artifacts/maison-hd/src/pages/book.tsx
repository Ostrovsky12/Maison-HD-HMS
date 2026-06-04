/**
 * BOOKING ENGINE — Public booking widget / hosted page
 * Routes: /maison-hd/book
 * Professional design inspired by Booking.com & Airbnb
 */
import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Search, CheckCircle2, ArrowLeft, Check, Loader2,
  Plus, Minus, X, ChevronDown, ChevronUp, ChevronRight,
  ExternalLink, Lock, AlertCircle, Users, Calendar,
  Shield, Zap, BadgeDollarSign, Globe,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_PUB = BASE.replace("/maison-hd", "") + "/api/public";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API_PUB + path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });

const fmtMoney = (n: number) => Math.round(n).toLocaleString("uk-UA");
const todayStr = () => new Date().toISOString().slice(0, 10);
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
const calcNights = (a: string, b: string) => Math.max(0, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
const fmtDate = (s: string) => new Date(s).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });

// ─── Packages ────────────────────────────────────────────────────────────────
const PACKAGES = [
  { id: "romance", name: "Романтичний", desc: "Шампанське, квіти, вечеря на двох, late checkout", pricePerStay: 2400, includes: ["Шампанське та полуниця", "Квіткові декорації", "Вечеря на двох", "Late checkout до 14:00"] },
  { id: "family",  name: "Сімейний",   desc: "Сніданок, дитяче ліжко, анімація для дітей",     pricePerNight: 400, includes: ["Сніданок для сім'ї", "Дитяче ліжечко безкоштовно", "Ігровий простір", "Анімація для дітей"] },
  { id: "wellness",name: "Wellness SPA",desc: "СПА-процедури, масаж, безлімітний spa-доступ",   pricePerNight: 800, includes: ["Доступ до SPA-зони", "Масаж 60 хв.", "Ароматерапія", "Фітнес-зал"] },
  { id: "business",name: "Бізнес",     desc: "Early check-in, late checkout, сніданок, трансфер",pricePerStay: 1200, includes: ["Early check-in з 10:00", "Late checkout до 15:00", "Сніданок включений", "Трансфер з/до аеропорту"] },
];

// ─── Add-ons ──────────────────────────────────────────────────────────────────
const ADDONS = [
  { id: "breakfast", label: "Сніданок",        desc: "Шведський стіл щодня",                    pricePerPerson: 320, pricingType: "per_person_per_night" as const },
  { id: "spa",       label: "SPA-доступ",      desc: "Безлімітний доступ до SPA-зони",           pricePerNight: 450,  pricingType: "per_night" as const },
  { id: "transfer",  label: "Трансфер",        desc: "Зустріч та проводи авто",                  pricePerStay: 900,   pricingType: "per_stay" as const },
  { id: "pet",       label: "З вихованцем",    desc: "Розміщення домашнього улюбленця",          pricePerNight: 200,  pricingType: "per_night" as const },
  { id: "parking",   label: "Паркінг",         desc: "Охоронний паркінг на territory",           pricePerNight: 150,  pricingType: "per_night" as const },
  { id: "early_ci",  label: "Ранній заїзд",    desc: "Заїзд з 10:00 (замість 14:00)",           pricePerStay: 350,   pricingType: "per_stay" as const },
  { id: "late_co",   label: "Пізній виїзд",    desc: "Виїзд о 15:00 (замість 12:00)",           pricePerStay: 350,   pricingType: "per_stay" as const },
  { id: "baby_bed",  label: "Дитяче ліжко",    desc: "Розкладне ліжко для дитини",              pricePerStay: 0,     pricingType: "per_stay" as const },
];

// ─── Promo codes ──────────────────────────────────────────────────────────────
const PROMO_CODES: Record<string, { type: "percent" | "fixed"; value: number; label: string }> = {
  "WELCOME10": { type: "percent", value: 10, label: "Знижка 10% для нових гостей" },
  "DOGODA20":  { type: "percent", value: 20, label: "Знижка 20% за промокодом" },
  "SUMMER500": { type: "fixed",   value: 500, label: "Знижка 500 ₴ — літній промо" },
};

const STEPS = [
  { key: "search",  label: "Пошук" },
  { key: "unit",    label: "Варіанти" },
  { key: "extras",  label: "Послуги" },
  { key: "form",    label: "Гість" },
  { key: "payment", label: "Оплата" },
] as const;
type Step = typeof STEPS[number]["key"];

export default function BookPage() {
  const { toast } = useToast();
  const slug = useMemo(() => new URLSearchParams(window.location.search).get("slug") || "", []);
  const [step, setStep] = useState<Step>("search");
  const [organization, setOrganization] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [search, setSearch] = useState({ propertyId: "", checkIn: todayStr(), checkOut: tomorrowStr(), adults: 2, children: 0, childAge1: 0, childAge2: 0 });
  const [results, setResults] = useState<any[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [channelRate, setChannelRate] = useState<any>(null);
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
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | null>(null);

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

  useEffect(() => {
    if (!selectedUnit) { setChannelRate(null); return; }
    const propertyId = selectedUnit.propertyId || selectedUnit.property_id;
    if (!propertyId) return;
    apiFetch(`/rates?propertyId=${propertyId}&unitId=${selectedUnit.id}&checkIn=${search.checkIn}&checkOut=${search.checkOut}&channel=online`)
      .then(r => r.json())
      .then((data: any) => setChannelRate(data || null))
      .catch(() => setChannelRate(null));
  }, [selectedUnit]);

  const nightsCount = calcNights(search.checkIn, search.checkOut);
  const pkg = PACKAGES.find(p => p.id === selectedPackage);

  const basePrice = useMemo(() => {
    if (!selectedUnit) return 0;
    if (channelRate) return Number(channelRate.unitPrice || channelRate.pricePerNight || 0) * nightsCount;
    return parseFloat(selectedUnit.basePrice || selectedUnit.base_price || "0") * nightsCount;
  }, [selectedUnit, nightsCount, channelRate]);

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
    toast({ title: `Промокод активовано: ${found.label}` });
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
      selectedAddons.size ? `Послуги: ${Array.from(selectedAddons).join(", ")}` : "",
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

    if (payMethod === "online" && bookingId) {
      const lqr = await apiFetch(`/liqpay/${bookingId}`, { method: "POST" });
      const lqd = await lqr.json();
      if (lqr.ok && lqd.data && lqd.signature) {
        const form_ = document.createElement("form");
        form_.method = "POST";
        form_.action = "https://www.liqpay.ua/api/3/checkout";
        form_.target = "_blank";
        ["data", "signature"].forEach(k => {
          const inp = document.createElement("input");
          inp.type = "hidden"; inp.name = k; inp.value = lqd[k];
          form_.appendChild(inp);
        });
        document.body.appendChild(form_); form_.submit(); document.body.removeChild(form_);
        toast({ title: "Перенаправляємо на оплату LiqPay…" });
      } else {
        toast({ title: lqd.message || "Онлайн-оплата недоступна. Оплата при заїзді.", variant: "destructive" });
      }
    }

    setLoading(false);
    setConfirmed({ bookingRef, guestAccessCode, ...form, ...search, nights: nightsCount, total, unitName: selectedUnit.name, propertyName: selectedUnit.propertyName || organization?.name, payMethod });
    setStep("confirm" as any);
  };

  const goBack = () => {
    if (step === "unit") setStep("search");
    else if (step === "extras") setStep("unit");
    else if (step === "form") setStep("extras");
    else if (step === "payment") setStep("form");
  };

  // ─── CONFIRM PAGE ────────────────────────────────────────────────────────────
  if ((step as any) === "confirm" && confirmed) return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow max-w-md w-full overflow-hidden border border-gray-200">
        <div className="bg-[#003580] p-8 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-xl font-bold mb-1">Бронювання підтверджено</h1>
          <p className="text-blue-200 text-sm">Дякуємо, {confirmed.firstName}!</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Деталі бронювання</span>
            </div>
            <div className="divide-y divide-gray-100">
              <SRow label="Номер бронювання" value={confirmed.bookingRef} bold />
              <SRow label="Розміщення" value={confirmed.unitName} />
              <SRow label="Заїзд" value={confirmed.checkIn} />
              <SRow label="Виїзд" value={confirmed.checkOut} />
              <SRow label="Ночей" value={String(confirmed.nights)} />
              <SRow label="Загальна сума" value={`${fmtMoney(confirmed.total)} ₴`} bold />
            </div>
          </div>
          <div className="border border-blue-200 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <p className="font-semibold">Підтвердження надіслано на {confirmed.email}</p>
            <p className="text-blue-600 text-xs mt-0.5">Посилання для онлайн-чекіну надійде за 24 год до заїзду.</p>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 border border-gray-300 rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5"
              onClick={() => window.open(`${BASE}/guest/${confirmed.guestAccessCode || confirmed.bookingRef}`, "_blank")}>
              <ExternalLink className="h-4 w-4" /> Кабінет гостя
            </button>
            <button className="flex-1 bg-[#0071c2] text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-[#005fa3]"
              onClick={() => { setStep("search"); setConfirmed(null); setSelectedUnit(null); setSelectedAddons(new Set()); setSelectedPackage(null); setAppliedPromo(null); }}>
              Нове бронювання
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const stepIdx = STEPS.findIndex(s => s.key === step);

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* ─── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="bg-[#003580] text-white sticky top-0 z-20 shadow-md">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step !== "search" && (
              <button onClick={goBack} className="text-blue-200 hover:text-white p-1 rounded transition">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <span className="font-bold text-white text-base tracking-tight">
              {organization?.name || "Бронювання"}
            </span>
          </div>

          {/* Progress bar */}
          <div className="hidden sm:flex items-center gap-0">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition ${
                  s.key === step
                    ? "text-white"
                    : i < stepIdx
                    ? "text-blue-200"
                    : "text-blue-400"
                }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                    s.key === step ? "bg-white text-[#003580] border-white" :
                    i < stepIdx ? "bg-blue-400 border-blue-400 text-white" :
                    "border-blue-500 text-blue-400"
                  }`}>
                    {i < stepIdx ? <Check className="h-2.5 w-2.5" /> : i + 1}
                  </span>
                  {s.label}
                </div>
                {i < STEPS.length - 1 && <span className="text-blue-600 text-xs">›</span>}
              </div>
            ))}
          </div>

          <a href={`${BASE}/`} className="text-blue-200 hover:text-white text-xs flex items-center gap-1 hidden sm:flex">
            <Globe className="h-3.5 w-3.5" /> На сайт
          </a>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 pb-16">

        {/* ─── STEP 1: SEARCH ──────────────────────────────────────────────── */}
        {step === "search" && (
          <div>
            {/* Hero */}
            <div className="text-center py-8 mb-2">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                {organization?.name ? `Бронювання — ${organization.name}` : "Онлайн-бронювання"}
              </h1>
              <p className="text-gray-500 text-sm">Перевірте наявність та забронюйте безпосередньо</p>
            </div>

            {/* Search card */}
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden mb-4">
              <div className="p-5 space-y-4">
                {/* Property filter */}
                {properties.length > 1 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Об'єкт</label>
                    <div className="flex flex-wrap gap-2">
                      {[{ id: "", name: "Будь-який" }, ...properties].map(p => (
                        <button key={p.id} onClick={() => setSearch(s => ({ ...s, propertyId: String(p.id) }))}
                          className={`px-3 py-1.5 rounded border text-sm font-medium transition ${
                            search.propertyId === String(p.id)
                              ? "border-[#0071c2] bg-[#ebf3ff] text-[#0071c2]"
                              : "border-gray-300 text-gray-600 hover:border-gray-400"
                          }`}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Date + guests row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      <Calendar className="h-3 w-3 inline mr-1 mb-0.5" />Заїзд
                    </label>
                    <input type="date" value={search.checkIn} min={todayStr()}
                      onChange={e => setSearch(s => ({ ...s, checkIn: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071c2] focus:border-[#0071c2]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      <Calendar className="h-3 w-3 inline mr-1 mb-0.5" />Виїзд
                    </label>
                    <input type="date" value={search.checkOut} min={search.checkIn}
                      onChange={e => setSearch(s => ({ ...s, checkOut: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071c2] focus:border-[#0071c2]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      <Users className="h-3 w-3 inline mr-1 mb-0.5" />Гості
                    </label>
                    <div className="flex items-center gap-2">
                      <GuestCounter label="Дорослі" value={search.adults} min={1} max={10} onChange={v => setSearch(s => ({ ...s, adults: v }))} />
                      <button onClick={() => setShowChildren(v => !v)} className="flex items-center gap-1 text-xs text-[#0071c2] hover:underline whitespace-nowrap">
                        + Діти ({search.children})
                        {showChildren ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    </div>
                    {showChildren && (
                      <div className="mt-2 p-3 border border-gray-200 rounded bg-gray-50 space-y-2">
                        <GuestCounter label="Діти" value={search.children} min={0} max={4} onChange={v => setSearch(s => ({ ...s, children: v }))} />
                        {search.children >= 1 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-14">Вік дит.1</span>
                            <select value={search.childAge1} onChange={e => setSearch(s => ({ ...s, childAge1: +e.target.value }))} className="border rounded px-2 py-1 text-xs flex-1">
                              {Array.from({ length: 18 }, (_, i) => <option key={i} value={i}>{i === 0 ? "до 1 р." : i + " р."}</option>)}
                            </select>
                          </div>
                        )}
                        {search.children >= 2 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-14">Вік дит.2</span>
                            <select value={search.childAge2} onChange={e => setSearch(s => ({ ...s, childAge2: +e.target.value }))} className="border rounded px-2 py-1 text-xs flex-1">
                              {Array.from({ length: 18 }, (_, i) => <option key={i} value={i}>{i === 0 ? "до 1 р." : i + " р."}</option>)}
                            </select>
                          </div>
                        )}
                        {search.children > 0 && search.childAge1 < 6 && <p className="text-[10px] text-green-600">Дитяче ліжко безкоштовно до 6 р.</p>}
                      </div>
                    )}
                  </div>
                </div>

                {nightsCount > 0 && (
                  <div className="text-xs text-gray-500 text-center">
                    {fmtDate(search.checkIn)} — {fmtDate(search.checkOut)} · <strong>{nightsCount} {nightsCount === 1 ? "ніч" : nightsCount < 5 ? "ночі" : "ночей"}</strong>
                  </div>
                )}

                <button onClick={handleSearch} disabled={loading || nightsCount < 1}
                  className="w-full bg-[#0071c2] hover:bg-[#005fa3] disabled:opacity-50 text-white font-semibold text-sm py-3 px-4 rounded flex items-center justify-center gap-2 transition">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Перевірити наявність
                </button>
              </div>

              {/* Trust bar */}
              <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 flex items-center justify-center gap-6 flex-wrap">
                {[
                  { icon: Shield, text: "Безпечна оплата" },
                  { icon: Zap, text: "Миттєве підтвердження" },
                  { icon: BadgeDollarSign, text: "Найкраща ціна" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Icon className="h-3.5 w-3.5 text-[#0071c2]" />
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 2: UNIT SELECTION ────────────────────────────────────────── */}
        {step === "unit" && (
          <div>
            {/* Search summary bar */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-4 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4 text-sm text-gray-700">
                <span className="font-semibold">{organization?.name || "Всі об'єкти"}</span>
                <span className="text-gray-300">|</span>
                <span>{fmtDate(search.checkIn)} — {fmtDate(search.checkOut)}</span>
                <span className="text-gray-300">|</span>
                <span>{nightsCount} {nightsCount < 5 ? "ночі" : "ночей"}</span>
                <span className="text-gray-300">|</span>
                <span>{search.adults} дорослих{search.children ? `, ${search.children} дітей` : ""}</span>
              </div>
              <button onClick={() => setStep("search")}
                className="text-sm text-[#0071c2] hover:underline font-medium flex items-center gap-1">
                <Search className="h-3.5 w-3.5" /> Змінити пошук
              </button>
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-3">
              {results.length > 0 ? `${results.length} варіант${results.length === 1 ? "" : results.length < 5 ? "и" : "ів"} доступні` : "Немає доступних варіантів"}
            </h2>

            {results.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
                <AlertCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-700 mb-1">На ці дати немає вільних варіантів</h3>
                <p className="text-gray-400 text-sm mb-4">Спробуйте інші дати або менше гостей</p>
                <button onClick={() => setStep("search")} className="bg-[#0071c2] text-white text-sm px-5 py-2 rounded font-medium hover:bg-[#005fa3]">
                  Змінити пошук
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map(u => <UnitCard key={u.id} unit={u} nights={nightsCount} onSelect={() => { setSelectedUnit(u); setStep("extras"); }} />)}
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 3: EXTRAS ──────────────────────────────────────────────── */}
        {step === "extras" && selectedUnit && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              {/* Selected unit mini-card */}
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-gray-900">{selectedUnit.name}</p>
                  <p className="text-xs text-gray-500">{selectedUnit.propertyName} · {fmtDate(search.checkIn)} – {fmtDate(search.checkOut)} · {nightsCount} ночей</p>
                </div>
                <button onClick={() => setStep("unit")} className="text-xs text-[#0071c2] hover:underline">Змінити</button>
              </div>

              {/* Channel rate tag */}
              {channelRate && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-[#ebf3ff] border border-[#b3d4f5] rounded-lg text-sm text-[#0071c2]">
                  <BadgeDollarSign className="h-4 w-4 flex-shrink-0" />
                  <span>Застосовано тариф: <strong>{channelRate.name}</strong></span>
                  {channelRate.discountPercent && <span className="ml-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">-{channelRate.discountPercent}%</span>}
                </div>
              )}

              {/* Packages */}
              <Section title="Пакети та спецпропозиції">
                <div className="divide-y divide-gray-100">
                  {PACKAGES.map(p => {
                    const pp = "pricePerStay" in p ? p.pricePerStay : (p as any).pricePerNight * nightsCount;
                    const sel = selectedPackage === p.id;
                    return (
                      <label key={p.id} className={`flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 transition ${sel ? "bg-blue-50" : ""}`}>
                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${sel ? "border-[#0071c2] bg-[#0071c2]" : "border-gray-300"}`}>
                          {sel && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <div className="flex-1 min-w-0" onClick={() => setSelectedPackage(sel ? null : p.id)}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-semibold text-sm text-gray-900">{p.name}</span>
                            <span className="text-sm font-bold text-[#0071c2]">+{fmtMoney(pp)} ₴</span>
                          </div>
                          <p className="text-xs text-gray-500">{p.desc}</p>
                          {sel && (
                            <ul className="mt-2 space-y-1">
                              {p.includes.map(i => <li key={i} className="text-xs text-gray-600 flex items-center gap-1.5"><Check className="h-3 w-3 text-green-500 flex-shrink-0" />{i}</li>)}
                            </ul>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </Section>

              {/* Add-ons */}
              <Section title="Додаткові послуги">
                <div className="divide-y divide-gray-100">
                  {ADDONS.map(a => {
                    const guests = search.adults + search.children;
                    const price = a.pricingType === "per_night" ? (a.pricePerNight || 0) * nightsCount
                      : a.pricingType === "per_person_per_night" ? (a.pricePerPerson || 0) * nightsCount * guests
                      : (a.pricePerStay || 0);
                    const sel = selectedAddons.has(a.id);
                    return (
                      <label key={a.id} className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition ${sel ? "bg-blue-50" : ""}`}
                        onClick={() => toggleAddon(a.id)}>
                        <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${sel ? "border-[#0071c2] bg-[#0071c2]" : "border-gray-300"}`}>
                          {sel && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm text-gray-900">{a.label}</span>
                          <p className="text-xs text-gray-500">{a.desc}</p>
                        </div>
                        <span className={`text-sm font-semibold flex-shrink-0 ${price === 0 ? "text-green-600" : "text-gray-900"}`}>
                          {price === 0 ? "Безкоштовно" : `+${fmtMoney(price)} ₴`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </Section>

              {/* Promo code */}
              <Section title="Промокод">
                <div className="p-4">
                  {appliedPromo ? (
                    <div className="flex items-center justify-between border border-green-200 bg-green-50 rounded px-3 py-2">
                      <div>
                        <span className="font-bold text-sm text-green-800">{appliedPromo.code}</span>
                        <p className="text-xs text-green-600">{appliedPromo.label}</p>
                      </div>
                      <button onClick={() => setAppliedPromo(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex gap-2">
                        <input placeholder="Введіть промокод" value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())}
                          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm uppercase font-mono focus:outline-none focus:ring-2 focus:ring-[#0071c2]" />
                        <button onClick={applyPromo} className="border border-[#0071c2] text-[#0071c2] text-sm px-3 rounded font-medium hover:bg-[#ebf3ff] transition">
                          Застосувати
                        </button>
                      </div>
                      {promoError && <p className="text-xs text-red-500">{promoError}</p>}
                    </div>
                  )}
                </div>
              </Section>
            </div>

            <div className="md:col-span-1">
              <PriceSummary unit={selectedUnit} nights={nightsCount} basePrice={basePrice} addons={addonsTotal} pkg={packagePrice} pkgName={pkg?.name} discount={discount} total={total} promoCode={appliedPromo?.code} />
              <button onClick={() => setStep("form")} className="w-full mt-3 bg-[#0071c2] hover:bg-[#005fa3] text-white font-semibold text-sm py-3 px-4 rounded flex items-center justify-center gap-2 transition">
                Далі — дані гостя <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 4: GUEST FORM ────────────────────────────────────────────── */}
        {step === "form" && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <Section title="Ваші дані">
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Ім'я *</label>
                      <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                        placeholder="Олена" className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071c2]" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Прізвище</label>
                      <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                        placeholder="Коваль" className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071c2]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Email *</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="email@example.com" className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071c2]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Телефон</label>
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="+380…" className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071c2]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Країна</label>
                    <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071c2]">
                      {[["UA", "Україна"], ["PL", "Польща"], ["DE", "Германія"], ["GB", "Великобританія"], ["US", "США"], ["CZ", "Чехія"], ["other", "Інша"]].map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Особливі побажання</label>
                    <textarea rows={3} value={form.specialRequests} onChange={e => setForm(f => ({ ...f, specialRequests: e.target.value }))}
                      placeholder="Поверх, тип ліжка, час прибуття, алергії…"
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0071c2]" />
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.agreeTerms} onChange={e => setForm(f => ({ ...f, agreeTerms: e.target.checked }))}
                      className="mt-0.5 accent-[#0071c2]" />
                    <span className="text-xs text-gray-600">Я погоджуюсь з <button type="button" onClick={() => setLegalModal("terms")} className="text-[#0071c2] underline hover:text-[#005fa3]">умовами бронювання</button> та <button type="button" onClick={() => setLegalModal("privacy")} className="text-[#0071c2] underline hover:text-[#005fa3]">політикою конфіденційності</button> *</span>
                  </label>
                </div>
              </Section>
            </div>
            <div className="md:col-span-1">
              <PriceSummary unit={selectedUnit} nights={nightsCount} basePrice={basePrice} addons={addonsTotal} pkg={packagePrice} pkgName={pkg?.name} discount={discount} total={total} promoCode={appliedPromo?.code} />
              <button onClick={() => setStep("payment")} disabled={!form.firstName || !form.email || !form.agreeTerms}
                className="w-full mt-3 bg-[#0071c2] hover:bg-[#005fa3] disabled:opacity-50 text-white font-semibold text-sm py-3 px-4 rounded flex items-center justify-center gap-2 transition">
                Далі — оплата <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 5: PAYMENT ─────────────────────────────────────────────── */}
        {step === "payment" && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <Section title="Спосіб оплати">
                <div className="divide-y divide-gray-100">
                  {[
                    { id: "arrival", label: "При заїзді", desc: "Оплата готівкою або карткою при заїзді" },
                    { id: "online",  label: `Онлайн-оплата — 30% (${fmtMoney(prepayment)} ₴)`, desc: "Передоплата карткою через захищену систему LiqPay" },
                    { id: "invoice", label: "Банківський переказ", desc: "Рахунок-фактура для компанії (обробка 1–2 дні)" },
                  ].map(m => (
                    <label key={m.id} className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition ${payMethod === m.id ? "bg-blue-50" : ""}`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${payMethod === m.id ? "border-[#0071c2] bg-[#0071c2]" : "border-gray-300"}`}>
                        {payMethod === m.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <input type="radio" name="pay" value={m.id} checked={payMethod === m.id} onChange={() => setPayMethod(m.id)} className="sr-only" />
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{m.label}</p>
                        <p className="text-xs text-gray-500">{m.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {payMethod === "online" && (
                  <div className="mx-4 mb-4 border border-[#b3d4f5] bg-[#ebf3ff] rounded p-3 space-y-2">
                    <p className="text-sm font-semibold text-[#003580] flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5" /> Безпечна оплата через LiqPay
                    </p>
                    <div className="flex items-center gap-2">
                      {["VISA", "MC", "LiqPay"].map(b => (
                        <span key={b} className="bg-white border border-gray-200 rounded px-2 py-0.5 text-xs font-bold text-gray-600">{b}</span>
                      ))}
                    </div>
                    <p className="text-xs text-[#0071c2]">3D Secure · SSL · PCI DSS</p>
                  </div>
                )}
              </Section>

              <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 text-sm">
                <p className="font-semibold text-amber-900 mb-1">Умови скасування</p>
                <p className="text-amber-700 text-xs">Умови скасування уточнюйте у закладі розміщення.</p>
              </div>
            </div>

            <div className="md:col-span-1">
              <PriceSummary unit={selectedUnit} nights={nightsCount} basePrice={basePrice} addons={addonsTotal} pkg={packagePrice} pkgName={pkg?.name} discount={discount} total={total} promoCode={appliedPromo?.code} prepayment={payMethod === "online" ? prepayment : undefined} />
              <button onClick={handleConfirm} disabled={loading}
                className="w-full mt-3 bg-[#e7711b] hover:bg-[#c96015] disabled:opacity-50 text-white font-bold text-sm py-3 px-4 rounded flex items-center justify-center gap-2 transition">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {payMethod === "online" ? `Оплатити ${fmtMoney(prepayment)} ₴` : "Підтвердити бронювання"}
              </button>
              <p className="text-[10px] text-center text-gray-400 mt-2">Підтверджуючи, ви приймаєте умови бронювання</p>
            </div>
          </div>
        )}
      </div>

      {/* Legal modal */}
      {legalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setLegalModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">
                {legalModal === "terms" ? "Умови бронювання" : "Політика конфіденційності"}
              </h2>
              <button onClick={() => setLegalModal(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-sm text-gray-700 space-y-3 leading-relaxed">
              {legalModal === "terms" ? (
                <>
                  <p><strong>1. Загальні положення.</strong> Ці умови регулюють відносини між гостем та готелем при здійсненні онлайн-бронювання.</p>
                  <p><strong>2. Підтвердження бронювання.</strong> Бронювання вважається підтвердженим після отримання письмового підтвердження на вказану електронну адресу.</p>
                  <p><strong>3. Оплата.</strong> При виборі онлайн-оплати стягується передоплата у розмірі 30% від вартості проживання. Решта суми оплачується при заїзді.</p>
                  <p><strong>4. Скасування та зміна бронювання.</strong> Безкоштовне скасування можливе за 48 годин до дати заїзду. При скасуванні пізніше — передоплата не повертається.</p>
                  <p><strong>5. Заїзд та виїзд.</strong> Стандартний час заїзду — 14:00, виїзду — 12:00. Ранній заїзд або пізній виїзд можливі за доступністю та додаткову плату.</p>
                  <p><strong>6. Правила проживання.</strong> Гості зобов'язані дотримуватись внутрішніх правил закладу, не турбувати інших гостей та нести відповідальність за збереження майна.</p>
                  <p><strong>7. Відповідальність.</strong> Готель не несе відповідальності за особисті речі гостей. Рекомендується користуватись сейфом у номері.</p>
                </>
              ) : (
                <>
                  <p><strong>1. Збір даних.</strong> При бронюванні ми збираємо ім'я, прізвище, електронну адресу, номер телефону та країну проживання.</p>
                  <p><strong>2. Мета обробки.</strong> Дані використовуються виключно для обробки бронювання, підтвердження заїзду та забезпечення безпеки проживання.</p>
                  <p><strong>3. Зберігання даних.</strong> Персональні дані зберігаються протягом терміну, необхідного для виконання договору та відповідно до вимог законодавства України.</p>
                  <p><strong>4. Передача третім особам.</strong> Дані не передаються третім особам, крім випадків, передбачених законодавством (органи державної влади, фіскальні органи).</p>
                  <p><strong>5. Права суб'єкта даних.</strong> Ви маєте право на доступ, виправлення або видалення своїх персональних даних, звернувшись до адміністрації закладу.</p>
                  <p><strong>6. Cookies.</strong> Сайт використовує технічні cookies для забезпечення функціональності форми бронювання. Маркетингові cookies не використовуються.</p>
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <button onClick={() => setLegalModal(null)} className="w-full bg-[#0071c2] hover:bg-[#005fa3] text-white font-semibold text-sm py-2.5 rounded-lg transition">
                Зрозуміло
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function GuestCounter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">{label}</span>
      <button onClick={() => onChange(Math.max(min, value - 1))} className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:border-[#0071c2] hover:text-[#0071c2] transition">
        <Minus className="h-3 w-3" />
      </button>
      <span className="w-5 text-center text-sm font-semibold">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:border-[#0071c2] hover:text-[#0071c2] transition">
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

function UnitCard({ unit: u, nights, onSelect }: any) {
  const base = parseFloat(u.basePrice || u.base_price || "0");
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md hover:border-gray-300 transition-all flex flex-col sm:flex-row">
      {/* Image placeholder */}
      <div className="sm:w-52 h-36 sm:h-auto bg-gradient-to-br from-gray-200 to-gray-300 flex-shrink-0 relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-gray-400 text-center">
            <svg className="h-8 w-8 mx-auto mb-1 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
          </div>
        </div>
        {u.category && (
          <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded font-medium">{u.category}</span>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between mb-1">
            <div>
              <h3 className="font-bold text-gray-900 text-base">{u.name}</h3>
              <p className="text-xs text-gray-500">{u.propertyName}{u.floor ? ` · ${u.floor} пов.` : ""}</p>
            </div>
          </div>

          {/* Amenities */}
          <div className="flex flex-wrap gap-2 mt-2">
            {u.maxCapacity && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                <Users className="h-3 w-3" /> до {u.maxCapacity} ос.
              </span>
            )}
            {u.squareMeters && (
              <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{u.squareMeters} м²</span>
            )}
            {u.hasView && <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">Вид</span>}
            {u.hasBalcony && <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">Балкон</span>}
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded font-medium">Вільно</span>
          </div>

          {u.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{u.description}</p>}
        </div>

        {/* Price + CTA */}
        <div className="flex items-end justify-between mt-3 pt-3 border-t border-gray-100">
          <div>
            <p className="text-xl font-bold text-gray-900">{fmtMoney(base)} <span className="text-sm font-normal text-gray-400">₴/ніч</span></p>
            <p className="text-xs text-gray-500">{fmtMoney(base * nights)} ₴ за {nights} {nights < 5 ? "ночі" : "ночей"}</p>
          </div>
          <button onClick={onSelect} className="bg-[#0071c2] hover:bg-[#005fa3] text-white text-sm font-semibold px-5 py-2 rounded flex items-center gap-1.5 transition">
            Обрати <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceSummary({ unit, nights, basePrice, addons, pkg, pkgName, discount, total, promoCode, prepayment }: any) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm sticky top-[72px]">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ваш вибір</h3>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <p className="font-bold text-sm text-gray-900">{unit.name}</p>
          <p className="text-xs text-gray-500">{unit.propertyName} · {nights} {nights < 5 ? "ночі" : "ночей"}</p>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Проживання</span>
            <span className="font-medium text-gray-900">{fmtMoney(basePrice)} ₴</span>
          </div>
          {addons > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Додаткові послуги</span>
              <span className="font-medium text-gray-900">+{fmtMoney(addons)} ₴</span>
            </div>
          )}
          {pkg > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>{pkgName}</span>
              <span className="font-medium text-gray-900">+{fmtMoney(pkg)} ₴</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Знижка ({promoCode})</span>
              <span className="font-medium">−{fmtMoney(discount)} ₴</span>
            </div>
          )}
        </div>
        <div className="border-t border-gray-100 pt-2">
          <div className="flex justify-between items-center">
            <span className="font-bold text-sm text-gray-900">Разом</span>
            <span className="font-bold text-lg text-gray-900">{fmtMoney(total)} ₴</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Включає всі збори та податки</p>
        </div>
        {prepayment !== undefined && (
          <div className="bg-[#ebf3ff] border border-[#b3d4f5] rounded p-2.5 flex justify-between items-center">
            <span className="text-xs text-[#0071c2] font-medium">До оплати зараз (30%)</span>
            <span className="font-bold text-sm text-[#003580]">{fmtMoney(prepayment)} ₴</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between px-4 py-2.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={bold ? "font-bold text-gray-900" : "text-gray-700"}>{value}</span>
    </div>
  );
}
