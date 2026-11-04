import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useGetPublicBookingEngine } from "@workspace/api-client-react";
import { UnitCard, type PublicUnit } from "@/components/booking/unit-card";
import { SearchBar } from "@/components/booking/search-bar";
import { NonRefundableConsent } from "@/components/booking/nonrefundable-consent";
import { PaymentStatusView } from "@/components/booking/payment-status-view";
import { photoList } from "@/lib/booking-media";
import {
  captureReturnFromUrl, clearPending, clearReturn, loadPending, loadReturn, parseTariffPolicy, redirectToLiqPay, savePending,
  type PendingCheckout, type ReturnRef,
} from "@/lib/booking-payment";
import {
  AlertTriangle, BedDouble, CalendarDays, Clock, CreditCard, Home, Loader2, Lock, Mail, MapPin, Phone, RefreshCw, Users,
} from "lucide-react";

type Unit = PublicUnit;

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/public";
const s = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, k: number) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
const money = (v: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(v) + " грн";
const fmtDate = (v: string) => { const d = new Date(v + "T00:00:00"); return isNaN(d.getTime()) ? v : d.toLocaleDateString("uk-UA", { weekday: "short", day: "numeric", month: "short" }); };

async function readError(r: Response): Promise<{ msg: string; code: string }> {
  try { const j = await r.json(); return { msg: s(j?.error) || s(j?.message) || `Помилка ${r.status}`, code: s(j?.code) }; }
  catch { return { msg: `Помилка ${r.status}`, code: "" }; }
}

// Idempotency: one UUID per normalized submission payload, persisted across retries and reloads.
const RID_PREFIX = "mhd_be_rid:";
function payloadKey(p: Record<string, unknown>) {
  const keys = Object.keys(p).sort();
  return RID_PREFIX + JSON.stringify(keys.map((k) => [k, p[k]]));
}
function getRequestId(key: string) {
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch { return crypto.randomUUID(); }
}
function dropRequestId(key: string) { try { sessionStorage.removeItem(key); } catch { /* ignore */ } }

function setMeta(title: string, desc: string) {
  document.title = title;
  let m = document.querySelector('meta[name="description"]');
  if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
  m.setAttribute("content", desc);
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-[#f6f4f0] text-stone-900 antialiased">{children}</div>;
}

const inputCls = "w-full h-12 rounded-xl border border-stone-300 bg-white px-3.5 text-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 transition";

export default function BookingPublicPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const q = useGetPublicBookingEngine(slug);
  const data = q.data as unknown as Record<string, any> | undefined;
  const cfg = (data?.config ?? {}) as Record<string, unknown>;
  const orgName = s(data?.organization?.name);
  const name = s(cfg.displayName) || orgName || "Бронювання";
  const accent = /^#[0-9a-fA-F]{6}$/.test(s(cfg.accentColor)) ? s(cfg.accentColor) : "#1f4e5f";
  const properties: { id: number; name: string }[] = Array.isArray(data?.properties) ? data!.properties : [];
  const policy = useMemo(() => parseTariffPolicy(data?.tariffPolicy), [data]);

  const today = useMemo(() => new Date(), []);
  const [propertyId, setPropertyId] = useState<string>("");
  const [checkIn, setCheckIn] = useState(ymd(addDays(today, 1)));
  const [checkOut, setCheckOut] = useState(ymd(addDays(today, 2)));
  const [guests, setGuests] = useState(2);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [results, setResults] = useState<{ units: Unit[]; nights: number; key: string; checkIn: string; checkOut: string } | null>(null);
  const [chosen, setChosen] = useState<Unit | null>(null);
  const [stale, setStale] = useState<string | null>(null);

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", specialRequests: "" });
  const [agree, setAgree] = useState(false);
  const [nrAgreedKey, setNrAgreedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inflight = useRef(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [showLegal, setShowLegal] = useState<"terms" | "privacy" | null>(null);

  // Payment state
  const [pending, setPending] = useState<PendingCheckout | null>(null);
  const [checkoutErr, setCheckoutErr] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [returnRef, setReturnRef] = useState<ReturnRef | null>(null);

  useEffect(() => {
    if (!slug) return;
    const r = captureReturnFromUrl(slug) ?? loadReturn(slug);
    if (r) setReturnRef(r);
    setPending(loadPending(slug));
  }, [slug]);

  useEffect(() => {
    if (data) setMeta(`${name} — пряме бронювання`, s(cfg.description).slice(0, 160) || `Забронюйте номер у ${name} напряму.`);
    else setMeta("Онлайн-бронювання", "Пряме бронювання номера в готелі");
  }, [data, name]);

  useEffect(() => { if (properties.length && !propertyId) setPropertyId(String(properties[0].id)); }, [properties, propertyId]);

  const searchKey = `${propertyId}|${checkIn}|${checkOut}|${guests}`;
  const resultsOutdated = !!results && results.key !== searchKey;
  const consentKey = chosen && policy ? `${chosen.id}|${checkIn}|${checkOut}|${chosen.totalPrice}|${policy.version}` : "";
  const nrAgree = !!consentKey && nrAgreedKey === consentKey;

  const search = async () => {
    setSearchErr(null); setStale(null); setChosen(null); setSubmitErr(null); setNrAgreedKey(null);
    if (!(checkOut > checkIn)) { setSearchErr("Дата виїзду має бути пізніше дати заїзду"); return; }
    if (checkIn < ymd(today)) { setSearchErr("Дата заїзду не може бути в минулому"); return; }
    setSearching(true);
    try {
      const p = new URLSearchParams({ slug, engine: "1", checkIn, checkOut, guests: String(guests) });
      if (propertyId) p.set("propertyId", propertyId);
      const r = await fetch(`${API}/availability?${p}`);
      if (!r.ok) throw new Error((await readError(r)).msg);
      const j = await r.json();
      const units: Unit[] = (Array.isArray(j?.units) ? j.units : []).map((u: any) => ({
        id: n(u.id), name: s(u.name), category: s(u.category), capacity: n(u.capacity), description: s(u.description),
        basePrice: n(u.basePrice), totalPrice: n(u.totalPrice), propertyName: s(u.propertyName),
        photos: photoList(u.photos), videoUrl: s(u.videoUrl),
        squareMeters: n(u.squareMeters) > 0 ? n(u.squareMeters) : null,
        hasBalcony: u.hasBalcony === true ? true : null,
        hasView: typeof u.hasView === "string" && u.hasView ? u.hasView : null,
        maxCapacity: n(u.maxCapacity) > 0 ? n(u.maxCapacity) : null,
      }));
      setResults({ units, nights: n(j?.nights), key: searchKey, checkIn, checkOut });
      setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (e) { setResults(null); setSearchErr((e as Error).message || "Не вдалося перевірити наявність"); }
    finally { setSearching(false); }
  };

  /** Starts (or retries) LiqPay checkout for an already created booking. Never creates a new reservation. */
  const startCheckout = async (pc: PendingCheckout) => {
    if (redirecting) return;
    setRedirecting(true); setCheckoutErr(null);
    try {
      let r: Response;
      try {
        r = await fetch(`${API}/booking-engine/${encodeURIComponent(slug)}/checkout`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId: pc.bookingId, guestAccessCode: pc.guestAccessCode, agreeNonRefundable: true, tariffPolicyVersion: pc.tariffPolicyVersion }),
        });
      } catch { setCheckoutErr("Немає з'єднання з сервером оплати. Бронювання збережено, повторіть оплату."); setRedirecting(false); return; }
      if (!r.ok) {
        const er = await readError(r);
        setCheckoutErr(r.status === 503
          ? "Онлайн-оплата тимчасово недоступна. Бронювання створено, але не оплачено і не гарантоване. Спробуйте пізніше або зв'яжіться з готелем."
          : er.msg);
        setRedirecting(false); return;
      }
      const j = await r.json();
      const ok = redirectToLiqPay(s(j?.checkoutUrl), s(j?.data), s(j?.signature));
      if (!ok) { setCheckoutErr("Сервер повернув некоректні дані для оплати. Оплату не розпочато."); setRedirecting(false); }
      // On success the browser navigates away; keep redirecting=true to block double clicks.
    } catch { setCheckoutErr("Не вдалося розпочати оплату. Бронювання збережено, повторіть оплату."); setRedirecting(false); }
  };

  const contactOk = form.email.trim() !== "" || form.phone.trim() !== "";
  const canSubmit = !!chosen && !!policy && !pending && !resultsOutdated && !stale && !!form.firstName.trim() && !!form.lastName.trim() && contactOk && agree && nrAgree && !submitting && !redirecting;
  const missing: string[] = [];
  if (chosen) {
    if (!form.firstName.trim() || !form.lastName.trim()) missing.push("ім'я та прізвище");
    if (!contactOk) missing.push("email або телефон");
    if (!agree) missing.push("згода з умовами та політикою конфіденційності");
    if (!nrAgree) missing.push("підтвердження неповоротного тарифу");
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen || !policy || !canSubmit || inflight.current) return;
    inflight.current = true; setSubmitting(true); setSubmitErr(null);
    const payload = {
      slug, bookingEngine: true, unitId: chosen.id, checkIn, checkOut,
      firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), phone: form.phone.trim(),
      adults: guests, children: 0, guestsCount: guests, specialRequests: form.specialRequests.trim(),
      expectedTotal: chosen.totalPrice, agreeTerms: true, agreeNonRefundable: true, tariffPolicyVersion: policy.version,
    };
    const key = payloadKey(payload);
    const bookingRequestId = getRequestId(key);
    let created: PendingCheckout | null = null;
    try {
      let r: Response;
      try {
        r = await fetch(`${API}/bookings`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, bookingRequestId }),
        });
      } catch {
        setSubmitErr("Немає відповіді від сервера. Результат невідомий. Натисніть кнопку оплати ще раз з тими самими даними: повторне бронювання не буде створено.");
        return;
      }
      if (r.status === 409) {
        const er = await readError(r);
        if (er.code === "PRICE_CHANGED") { dropRequestId(key); setChosen(null); setNrAgreedKey(null); setStale(er.msg || "Ціна змінилася"); setResults((x) => x ? { ...x, key: "" } : x); return; }
        dropRequestId(key); setStale(er.msg); return;
      }
      if (!r.ok) {
        const er = await readError(r);
        if (r.status >= 400 && r.status < 500) dropRequestId(key);
        setSubmitErr(er.msg); return;
      }
      const j = await r.json();
      const b = j?.booking ?? {};
      if (!(n(b.id) > 0) || !s(b.guestAccessCode)) { setSubmitErr("Сервер не повернув дані бронювання. Зверніться до готелю перед повторною спробою."); return; }
      dropRequestId(key);
      created = {
        bookingId: n(b.id), guestAccessCode: s(b.guestAccessCode), bookingRef: s(b.bookingRef) || `#${b.id}`,
        totalAmount: n(b.totalAmount), tariffPolicyVersion: policy.version,
        unitName: s(b.unitName) || chosen.name, propertyName: s(b.propertyName) || chosen.propertyName,
        checkIn: s(b.checkIn) || checkIn, checkOut: s(b.checkOut) || checkOut, nights: n(b.nights) || results?.nights || 0, createdAt: Date.now(),
      };
      savePending(slug, created);
      setPending(created);
    }
    catch {
      setSubmitErr("Не вдалося прочитати відповідь сервера. Результат невідомий. Повторіть запит із тими самими даними або зв'яжіться з готелем.");
    }
    finally { inflight.current = false; setSubmitting(false); }
    if (created) { window.scrollTo({ top: 0, behavior: "smooth" }); void startCheckout(created); }
  };

  const abandonPending = () => {
    clearPending(slug); setPending(null); setCheckoutErr(null); setNrAgreedKey(null);
  };

  if (q.isLoading) {
    return <Shell><div className="max-w-6xl mx-auto p-6 space-y-5 animate-pulse"><div className="h-14 w-72 bg-stone-200 rounded-xl" /><div className="h-16 bg-stone-200 rounded-full" /><div className="grid lg:grid-cols-[1fr_360px] gap-6"><div className="h-80 bg-stone-200 rounded-3xl" /><div className="h-64 bg-stone-200 rounded-3xl" /></div></div></Shell>;
  }
  if (q.error || !data) {
    const status = (q.error as { status?: number } | null)?.status;
    const msg = status === 404 ? "Сторінку бронювання не знайдено або її ще не опубліковано."
      : status === 503 ? "Онлайн-бронювання тимчасово недоступне. Зв'яжіться з готелем напряму."
      : "Не вдалося завантажити сторінку бронювання.";
    return (
      <Shell><div className="min-h-[100dvh] flex items-center justify-center p-6"><div className="max-w-md text-center space-y-3">
        <AlertTriangle className="w-8 h-8 mx-auto text-stone-500" />
        <h1 className="text-xl font-semibold" data-testid="text-public-error">{msg}</h1>
        {status !== 404 && status !== 503 && <button data-testid="button-retry" onClick={() => q.refetch()} className="inline-flex items-center gap-2 text-sm underline"><RefreshCw className="w-4 h-4" />Спробувати ще</button>}
      </div></div></Shell>
    );
  }

  const phone = s(cfg.phone), email = s(cfg.email), logo = s(cfg.logoUrl);
  const desc = s(cfg.description);
  const nights = results?.nights ?? 0;
  const ctaBusy = submitting || redirecting;

  const header = (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {logo ? <img src={logo} alt="" className="h-9 w-9 rounded-xl object-cover" /> :
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-semibold" style={{ background: accent }}>{name.slice(0, 1)}</div>}
          <p className="font-semibold truncate" data-testid="text-hotel-name">{name}</p>
        </div>
        <div className="flex items-center gap-1 text-sm text-stone-700">
          {phone && <a href={`tel:${phone}`} className="flex items-center gap-1.5 rounded-full px-3 py-2 hover:bg-stone-100"><Phone className="w-4 h-4" /><span className="hidden md:inline">{phone}</span></a>}
          {email && <a href={`mailto:${email}`} className="flex items-center gap-1.5 rounded-full px-3 py-2 hover:bg-stone-100"><Mail className="w-4 h-4" /><span className="hidden lg:inline">{email}</span></a>}
        </div>
      </div>
    </header>
  );

  if (returnRef) {
    return (
      <Shell>{header}
        <main className="max-w-6xl mx-auto px-5 py-10 md:py-16">
          <PaymentStatusView api={API} slug={slug} ref_={returnRef} accent={accent} base={BASE}
            onDismiss={() => { clearReturn(slug); setReturnRef(null); if (pending && pending.bookingId === returnRef.bookingId) abandonPending(); }} />
        </main>
      </Shell>
    );
  }

  return (
    <Shell>
      {header}

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}e6 55%, #1c1917 140%)` }}>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <div className="relative max-w-6xl mx-auto px-5 pt-10 pb-24 md:pt-14 md:pb-28 text-white">
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/70">Офіційний сайт бронювання</p>
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight mt-2 max-w-3xl">{name}</h1>
          {desc && <p className="text-white/85 mt-3 max-w-2xl whitespace-pre-line line-clamp-4">{desc}</p>}
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5"><Clock className="w-3.5 h-3.5" />Заїзд з {s(cfg.checkInTime, "14:00")}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5"><Clock className="w-3.5 h-3.5" />Виїзд до {s(cfg.checkOutTime, "12:00")}</span>
            {properties.length > 1 && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5"><MapPin className="w-3.5 h-3.5" />{properties.length} об'єкти</span>}
            {policy && <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-red-800 font-semibold"><CreditCard className="w-3.5 h-3.5" />Неповоротний тариф, 100% онлайн-оплата</span>}
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 md:px-5 -mt-12 md:-mt-14 relative z-10">
        <SearchBar properties={properties} propertyId={propertyId} setPropertyId={setPropertyId} checkIn={checkIn} setCheckIn={setCheckIn}
          checkOut={checkOut} setCheckOut={setCheckOut} guests={guests} setGuests={setGuests} minDate={ymd(today)} searching={searching} onSearch={search} accent={accent} />
      </div>

      <main className="max-w-6xl mx-auto px-5 py-8 md:py-10">
        {!policy && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 flex gap-2" data-testid="text-policy-unavailable">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />Онлайн-оплата для цього готелю зараз недоступна, тому бронювання тимчасово неможливе. Зв'яжіться з готелем напряму.
          </div>
        )}

        {pending && (
          <section className="mb-8 rounded-3xl bg-white border-2 border-amber-300 p-5 md:p-6 shadow-sm" data-testid="panel-pending-payment">
            <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-amber-700 font-semibold">Бронювання створено, оплату не завершено</p>
                <p className="text-lg font-semibold mt-1">{pending.unitName}{pending.propertyName ? `, ${pending.propertyName}` : ""}</p>
                <p className="text-sm text-stone-600">{fmtDate(pending.checkIn)} – {fmtDate(pending.checkOut)} · <span className="font-mono" data-testid="text-booking-ref">{pending.bookingRef}</span></p>
                <p className="text-sm text-stone-700 mt-2">Номер не гарантовано, доки платіжна система не підтвердить оплату 100% вартості.</p>
              </div>
              <div className="flex flex-col items-stretch md:items-end gap-2 shrink-0">
                <p className="text-2xl font-semibold font-mono">{money(pending.totalAmount)}</p>
                <button type="button" data-testid="button-retry-checkout" disabled={redirecting} onClick={() => void startCheckout(pending)}
                  className="rounded-xl px-6 py-3 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: accent }}>
                  {redirecting ? <><Loader2 className="w-4 h-4 animate-spin" />Перехід до оплати...</> : <><Lock className="w-4 h-4" />Оплатити {money(pending.totalAmount)}</>}
                </button>
                <button type="button" onClick={() => setReturnRef({ bookingId: pending.bookingId, code: pending.guestAccessCode })} className="text-xs underline text-stone-600" data-testid="button-check-status">Перевірити статус оплати</button>
              </div>
            </div>
            {checkoutErr && <p className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-900" data-testid="text-checkout-error">{checkoutErr}</p>}
            <button type="button" onClick={abandonPending} className="mt-4 text-xs text-stone-500 underline" data-testid="button-abandon-pending">
              Почати нове бронювання (це неоплачене бронювання не буде продовжено)
            </button>
          </section>
        )}

        {stale && !chosen && (
          <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="text-price-changed">
            <p className="font-medium">{stale}</p>
            <p className="mt-1">Ваші контактні дані збережено. Виконайте пошук ще раз, перевірте нову ціну та оберіть номер.</p>
            <button type="button" onClick={search} className="mt-2 underline">Оновити пошук</button>
          </div>
        )}
        {searchErr && <p className="mb-6 text-sm text-red-700" data-testid="text-search-error">{searchErr}</p>}
        {resultsOutdated && !stale && <p className="mb-6 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">Параметри змінено. Натисніть «Знайти», щоб оновити ціни.</p>}

        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-8 items-start">
          <div className="min-w-0">
            {!results && !searching && (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-white/60 p-10 text-center">
                <BedDouble className="w-8 h-8 mx-auto text-stone-400" />
                <p className="mt-3 font-medium">Оберіть дати та кількість гостей</p>
                <p className="text-sm text-stone-500 mt-1">Покажемо лише вільні варіанти з актуальною ціною за весь період.</p>
              </div>
            )}

            {searching && <div className="space-y-6 animate-pulse">{[0, 1].map((i) => <div key={i} className="h-80 bg-stone-200 rounded-3xl" />)}</div>}

            {!searching && results && (
              <section id="results" className="space-y-6 scroll-mt-24">
                {results.units.length > 0 && (
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-xl font-semibold">{results.units.length} {results.units.length === 1 ? "варіант" : results.units.length < 5 ? "варіанти" : "варіантів"} на ваші дати</h2>
                    <p className="text-sm text-stone-500">{fmtDate(results.checkIn)} – {fmtDate(results.checkOut)}</p>
                  </div>
                )}
                {results.units.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-600" data-testid="text-no-units">
                    На ці дати немає вільних номерів для {guests} дорослих. Спробуйте інші дати{phone || email ? " або зв'яжіться з готелем" : ""}.
                  </div>
                ) : results.units.map((u) => (
                  <UnitCard key={u.id} unit={u} nights={results.nights} accent={accent} active={chosen?.id === u.id} disabled={!!resultsOutdated || !!pending}
                    policyBadge={policy ? "Неповоротний · 100% передоплата" : undefined}
                    onSelect={() => { setChosen(u); setStale(null); setSubmitErr(null); setTimeout(() => document.querySelector('[data-testid="form-booking"]')?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />
                ))}
              </section>
            )}

            {chosen && results && policy && !pending && (
              <form onSubmit={submit} className="mt-10 rounded-3xl bg-white border border-stone-200 shadow-sm p-5 md:p-8 space-y-7 scroll-mt-24" data-testid="form-booking">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Оформлення</p>
                  <h2 className="text-2xl font-semibold mt-1">Підтвердіть і оплатіть</h2>
                </div>

                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold mb-2">1. Дані гостя</legend>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {([["firstName", "Ім'я *", "text", "given-name"], ["lastName", "Прізвище *", "text", "family-name"], ["email", "Email", "email", "email"], ["phone", "Телефон", "tel", "tel"]] as const).map(([k, l, t, ac]) => (
                      <label key={k} className="text-xs text-stone-600 space-y-1"><span>{l}</span>
                        <input data-testid={`input-${k}`} type={t} autoComplete={ac} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} className={inputCls} /></label>
                    ))}
                  </div>
                  {!contactOk && <p className="text-xs text-stone-500">Вкажіть email або телефон для зв'язку.</p>}
                  <label className="text-xs text-stone-600 space-y-1 block"><span>Побажання</span>
                    <textarea data-testid="input-requests" rows={3} maxLength={1000} value={form.specialRequests} onChange={(e) => setForm((f) => ({ ...f, specialRequests: e.target.value }))}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-stone-900" /></label>
                  <p className="text-xs text-stone-500">Ціна розрахована на {guests} дорослих. Діти, додаткове ліжко чи інші потреби опишіть у полі «Побажання»: готель уточнить умови окремо.</p>
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold mb-2">2. Умови та конфіденційність</legend>
                  <label className="flex items-start gap-3 text-sm">
                    <input data-testid="checkbox-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0" />
                    <span>Погоджуюсь з <button type="button" className="underline font-medium" onClick={() => setShowLegal("terms")}>умовами бронювання</button> та <button type="button" className="underline font-medium" onClick={() => setShowLegal("privacy")}>політикою конфіденційності</button></span>
                  </label>
                  {showLegal && (
                    <div className="rounded-xl bg-stone-50 border border-stone-200 p-4 text-sm text-stone-700 whitespace-pre-line max-h-64 overflow-y-auto">
                      <div className="flex justify-between mb-2"><b>{showLegal === "terms" ? "Умови бронювання" : "Політика конфіденційності"}</b><button type="button" className="text-xs underline" onClick={() => setShowLegal(null)}>Закрити</button></div>
                      {s(showLegal === "terms" ? cfg.terms : cfg.privacy) || "Текст не надано."}
                    </div>
                  )}
                </fieldset>

                <fieldset>
                  <legend className="text-sm font-semibold mb-2">3. Неповоротний тариф</legend>
                  <NonRefundableConsent policy={policy} total={chosen.totalPrice} checked={nrAgree} onChange={(v) => setNrAgreedKey(v ? consentKey : null)} />
                </fieldset>

                {stale && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="text-stale">
                    <p className="font-medium">Ціна або наявність змінилися: {stale}</p>
                    <p className="mt-1">Ваші дані збережено. Виконайте пошук ще раз і оберіть номер.</p>
                    <button type="button" onClick={search} className="mt-2 underline">Оновити пошук</button>
                  </div>
                )}
                {submitErr && <p className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-900" data-testid="text-submit-error">{submitErr}</p>}

                <div className="rounded-2xl bg-stone-900 text-white p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-white/60">До сплати зараз, 100%</p>
                    <p className="text-2xl font-semibold font-mono" data-testid="text-pay-now">{money(chosen.totalPrice)}</p>
                    <p className="text-xs text-red-200 font-medium mt-0.5">Без повернення коштів і зміни дат</p>
                  </div>
                  <button data-testid="button-submit" type="submit" disabled={!canSubmit}
                    className="rounded-xl px-6 py-3.5 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-40 shrink-0" style={{ background: accent }}>
                    {ctaBusy ? <><Loader2 className="w-4 h-4 animate-spin" />{submitting ? "Створюємо бронювання..." : "Перехід до оплати..."}</> : <><Lock className="w-4 h-4" />Оплатити {money(chosen.totalPrice)}</>}
                  </button>
                </div>
                {!canSubmit && !ctaBusy && missing.length > 0 && <p className="text-xs text-stone-500 -mt-4">Щоб продовжити, потрібно: {missing.join(", ")}.</p>}
                <p className="text-xs text-stone-500 -mt-4">Оплата на захищеній сторінці LiqPay. Бронювання гарантоване лише після підтвердження оплати.</p>
              </form>
            )}
          </div>

          {/* Reservation summary */}
          <aside className="lg:sticky lg:top-24 order-first lg:order-none" data-testid="panel-summary">
            <div className="rounded-3xl bg-white border border-stone-200 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.25)] overflow-hidden">
              {chosen ? (
                <>
                  {chosen.photos[0] ? <img src={chosen.photos[0]} alt="" className="w-full h-36 object-cover" /> :
                    <div className="h-24 flex items-center justify-center text-white/90" style={{ background: accent }}><Home className="w-7 h-7" /></div>}
                  <div className="p-5 space-y-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-stone-500">{chosen.category}{chosen.propertyName ? ` · ${chosen.propertyName}` : ""}</p>
                      <p className="font-semibold text-lg leading-tight">{chosen.name}</p>
                    </div>
                    <div className="grid grid-cols-2 rounded-xl border border-stone-200 text-sm divide-x divide-stone-200">
                      <div className="p-3"><p className="text-[10px] uppercase font-semibold tracking-wider text-stone-500">Заїзд</p><p>{fmtDate(checkIn)}</p></div>
                      <div className="p-3"><p className="text-[10px] uppercase font-semibold tracking-wider text-stone-500">Виїзд</p><p>{fmtDate(checkOut)}</p></div>
                      <div className="p-3 col-span-2 border-t border-stone-200 !border-l-0 flex items-center gap-2"><Users className="w-4 h-4 text-stone-500" />{guests} дорослих · {nights} ноч.</div>
                    </div>
                    <div className="flex justify-between items-baseline border-t border-stone-200 pt-4">
                      <span className="font-semibold">Разом</span>
                      <span className="text-xl font-semibold font-mono">{money(chosen.totalPrice)}</span>
                    </div>
                    {policy && (
                      <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-900 space-y-0.5">
                        <p className="font-bold uppercase tracking-wide">Неповоротний тариф</p>
                        <p>100% оплата онлайн. Без повернення коштів і зміни дат.</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <p className="font-semibold">Ваше бронювання</p>
                  <div className="mt-3 flex items-center gap-2 text-sm text-stone-600"><CalendarDays className="w-4 h-4" />{fmtDate(checkIn)} – {fmtDate(checkOut)}</div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-stone-600"><Users className="w-4 h-4" />{guests} дорослих</div>
                  <p className="text-sm text-stone-500 mt-4">Оберіть номер, щоб побачити підсумок і перейти до оплати.</p>
                  {policy && <p className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-900"><b>Неповоротний тариф:</b> 100% оплата онлайн при бронюванні, без повернення коштів і зміни дат.</p>}
                </div>
              )}
            </div>
            {(phone || email) && (
              <div className="mt-4 rounded-2xl bg-white/70 border border-stone-200 p-4 text-sm text-stone-600 space-y-1.5">
                <p className="font-medium text-stone-800">Питання до готелю</p>
                {phone && <a href={`tel:${phone}`} className="flex items-center gap-2"><Phone className="w-4 h-4" />{phone}</a>}
                {email && <a href={`mailto:${email}`} className="flex items-center gap-2"><Mail className="w-4 h-4" />{email}</a>}
              </div>
            )}
          </aside>
        </div>
      </main>
      <footer className="border-t border-stone-200 mt-6">
        <div className="max-w-6xl mx-auto px-5 py-6 text-xs text-stone-500 flex flex-wrap gap-x-4 gap-y-1 justify-between">
          <span>{name}</span>
          <span>Ціни в гривнях. Онлайн-оплата через LiqPay.</span>
        </div>
      </footer>
    </Shell>
  );
}
