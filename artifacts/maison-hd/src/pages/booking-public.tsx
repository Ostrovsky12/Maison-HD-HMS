import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useGetPublicBookingEngine } from "@workspace/api-client-react";
import { AlertTriangle, CalendarDays, CheckCircle2, Mail, Phone, RefreshCw, Users } from "lucide-react";

type Unit = { id: number; name: string; category: string; capacity: number; description: string; basePrice: number; totalPrice: number; propertyName: string };
type Done = { bookingRef: string; status: string; totalAmount: number; guestAccessCode: string; unitName: string; propertyName: string; checkIn: string; checkOut: string; nights: number };

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/public";
const s = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, k: number) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
const money = (v: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(v) + " грн";
const fmtDate = (v: string) => { const d = new Date(v + "T00:00:00"); return isNaN(d.getTime()) ? v : d.toLocaleDateString("uk-UA", { day: "numeric", month: "long" }); };

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

function Shell({ children, accent = "#1f4e5f" }: { children: React.ReactNode; accent?: string }) {
  return <div className="min-h-[100dvh] bg-[#f5f2ec] text-stone-900" style={{ ["--acc" as string]: accent }}>{children}</div>;
}

export default function BookingPublicPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const q = useGetPublicBookingEngine(slug);
  const data = q.data as unknown as Record<string, any> | undefined;
  const cfg = (data?.config ?? {}) as Record<string, unknown>;
  const orgName = s(data?.organization?.name);
  const name = s(cfg.displayName) || orgName || "Бронювання";
  const accent = /^#[0-9a-fA-F]{6}$/.test(s(cfg.accentColor)) ? s(cfg.accentColor) : "#1f4e5f";
  const properties: { id: number; name: string }[] = Array.isArray(data?.properties) ? data!.properties : [];

  const today = useMemo(() => new Date(), []);
  const [propertyId, setPropertyId] = useState<string>("");
  const [checkIn, setCheckIn] = useState(ymd(addDays(today, 1)));
  const [checkOut, setCheckOut] = useState(ymd(addDays(today, 2)));
  const [guests, setGuests] = useState(2);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [results, setResults] = useState<{ units: Unit[]; nights: number; key: string } | null>(null);
  const [chosen, setChosen] = useState<Unit | null>(null);
  const [stale, setStale] = useState<string | null>(null);

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", specialRequests: "" });
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inflight = useRef(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [showLegal, setShowLegal] = useState<"terms" | "privacy" | null>(null);

  useEffect(() => {
    if (data) setMeta(`${name} — пряме бронювання`, s(cfg.description).slice(0, 160) || `Забронюйте номер у ${name} напряму.`);
    else setMeta("Онлайн-бронювання", "Пряме бронювання номера в готелі");
  }, [data, name]);

  useEffect(() => { if (properties.length && !propertyId) setPropertyId(String(properties[0].id)); }, [properties, propertyId]);

  const searchKey = `${propertyId}|${checkIn}|${checkOut}|${guests}`;
  const resultsOutdated = !!results && results.key !== searchKey;

  const search = async () => {
    setSearchErr(null); setStale(null); setChosen(null); setSubmitErr(null);
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
      }));
      setResults({ units, nights: n(j?.nights), key: searchKey });
    } catch (e) { setResults(null); setSearchErr((e as Error).message || "Не вдалося перевірити наявність"); }
    finally { setSearching(false); }
  };

  const contactOk = form.email.trim() !== "" || form.phone.trim() !== "";
  const canSubmit = !!chosen && !resultsOutdated && !stale && form.firstName.trim() && form.lastName.trim() && contactOk && agree && !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen || !canSubmit || inflight.current) return;
    inflight.current = true; setSubmitting(true); setSubmitErr(null);
    const payload = {
      slug, bookingEngine: true, unitId: chosen.id, checkIn, checkOut,
      firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), phone: form.phone.trim(),
      adults: guests, children: 0, guestsCount: guests, specialRequests: form.specialRequests.trim(),
      expectedTotal: chosen.totalPrice, agreeTerms: true,
    };
    const key = payloadKey(payload);
    const bookingRequestId = getRequestId(key);
    try {
      let r: Response;
      try {
        r = await fetch(`${API}/bookings`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, bookingRequestId }),
        });
      } catch {
        // Outcome unknown: keep the same request id so a retry cannot create a second booking.
        setSubmitErr("Немає відповіді від сервера. Результат невідомий. Натисніть «Надіслати заявку» ще раз з тими самими даними: повторна заявка не буде створена.");
        return;
      }
      if (r.status === 409) {
        const er = await readError(r);
        if (er.code === "PRICE_CHANGED") { dropRequestId(key); setChosen(null); setStale(er.msg || "Ціна змінилася"); setResults((x) => x ? { ...x, key: "" } : x); return; }
        dropRequestId(key); setStale(er.msg); return;
      }
      if (!r.ok) {
        const er = await readError(r);
        if (r.status >= 400 && r.status < 500) dropRequestId(key);
        setSubmitErr(er.msg); return;
      }
      const j = await r.json();
      const b = j?.booking ?? {};
      dropRequestId(key);
      setDone({
        bookingRef: s(b.bookingRef) || `#${b.id}`, status: s(b.status, "pending"), totalAmount: n(b.totalAmount),
        guestAccessCode: s(b.guestAccessCode), unitName: s(b.unitName) || chosen.name,
        propertyName: s(b.propertyName) || chosen.propertyName,
        checkIn: s(b.checkIn) || checkIn, checkOut: s(b.checkOut) || checkOut, nights: n(b.nights) || results?.nights || 0,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    catch {
      setSubmitErr("Не вдалося прочитати відповідь сервера. Результат невідомий. Повторіть запит із тими самими даними або зв’яжіться з готелем.");
    }
    finally { inflight.current = false; setSubmitting(false); }
  };

  if (q.isLoading) {
    return <Shell><div className="max-w-3xl mx-auto p-6 space-y-4 animate-pulse"><div className="h-10 w-64 bg-stone-200 rounded" /><div className="h-24 bg-stone-200 rounded-2xl" /><div className="h-40 bg-stone-200 rounded-2xl" /></div></Shell>;
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
  const btn = "rounded-xl px-5 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40";

  return (
    <Shell accent={accent}>
      <header className="border-b border-stone-300/60">
        <div className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {logo ? <img src={logo} alt="" className="h-10 w-10 rounded-lg object-cover" /> :
              <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold" style={{ background: accent }}>{name.slice(0, 1)}</div>}
            <p className="font-semibold text-lg truncate" data-testid="text-hotel-name">{name}</p>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-sm text-stone-600">
            {phone && <a href={`tel:${phone}`} className="flex items-center gap-1.5"><Phone className="w-4 h-4" />{phone}</a>}
            {email && <a href={`mailto:${email}`} className="flex items-center gap-1.5"><Mail className="w-4 h-4" />{email}</a>}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8 md:py-12">
        {done ? (
          <div className="max-w-xl mx-auto rounded-3xl bg-[#fbfaf7] border border-stone-200 p-7 md:p-9" data-testid="panel-success">
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: accent }}><CheckCircle2 className="w-5 h-5" />Заявку створено</div>
            <h1 className="text-2xl md:text-3xl font-semibold mt-3">{done.status === "pending" ? "Заявка очікує підтвердження готелем" : "Заявку зареєстровано"}</h1>
            <p className="text-sm text-stone-600 mt-2">Це ще не гарантоване бронювання. Готель перевірить наявність і зв'яжеться з вами. Оплата при заїзді.</p>
            <dl className="mt-6 grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-stone-500">Номер заявки</dt><dd className="font-mono font-semibold" data-testid="text-booking-ref">{done.bookingRef}</dd>
              <dt className="text-stone-500">Розміщення</dt><dd>{done.unitName}{done.propertyName ? `, ${done.propertyName}` : ""}</dd>
              <dt className="text-stone-500">Дати</dt><dd>{fmtDate(done.checkIn)} – {fmtDate(done.checkOut)}{done.nights ? ` (${done.nights} ноч.)` : ""}</dd>
              <dt className="text-stone-500">Сума до сплати</dt><dd className="font-semibold">{money(done.totalAmount)}</dd>
              {done.guestAccessCode && <><dt className="text-stone-500">Код доступу гостя</dt><dd className="font-mono">{done.guestAccessCode}</dd></>}
            </dl>
            {done.guestAccessCode && <a href={`${BASE}/guest/${done.guestAccessCode}`} className={`${btn} inline-block mt-6`} style={{ background: accent }} data-testid="link-guest-portal">Відкрити кабінет гостя</a>}
          </div>
        ) : (
          <>
            <section className="mb-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-stone-500">Пряме бронювання</p>
              <h1 className="text-3xl md:text-5xl font-semibold tracking-tight mt-2 max-w-3xl">{name}</h1>
              {s(cfg.description) && <p className="text-stone-600 mt-3 max-w-2xl whitespace-pre-line">{s(cfg.description)}</p>}
              <p className="text-xs text-stone-500 mt-3">Заїзд з {s(cfg.checkInTime, "14:00")} · Виїзд до {s(cfg.checkOutTime, "12:00")} · Ціни в гривнях</p>
            </section>

            <section className="rounded-2xl bg-[#fbfaf7] border border-stone-200 p-4 md:p-5 grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_0.7fr_auto] items-end">
              {properties.length > 1 ? (
                <label className="text-xs text-stone-600 space-y-1"><span>Об'єкт</span>
                  <select data-testid="select-property" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-full h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm">
                    {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></label>
              ) : <div className="text-sm text-stone-600 h-11 flex items-center">{properties[0]?.name ?? "—"}</div>}
              <label className="text-xs text-stone-600 space-y-1"><span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />Заїзд</span>
                <input data-testid="input-checkin" type="date" min={ymd(today)} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm" /></label>
              <label className="text-xs text-stone-600 space-y-1"><span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />Виїзд</span>
                <input data-testid="input-checkout" type="date" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm" /></label>
              <label className="text-xs text-stone-600 space-y-1"><span className="flex items-center gap-1"><Users className="w-3 h-3" />Дорослих</span>
                <input data-testid="input-guests" type="number" min={1} max={20} value={guests} onChange={(e) => setGuests(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="w-full h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm" /></label>
              <button data-testid="button-search" onClick={search} disabled={searching} className={`${btn} h-11`} style={{ background: accent }}>{searching ? "Пошук..." : "Знайти"}</button>
            </section>

            {stale && !chosen && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="text-price-changed">
                <p className="font-medium">{stale}</p>
                <p className="mt-1">Ваші контактні дані збережено. Виконайте пошук ще раз, перевірте нову ціну та оберіть номер.</p>
                <button type="button" onClick={search} className="mt-2 underline">Оновити пошук</button>
              </div>
            )}
            {searchErr && <p className="mt-4 text-sm text-red-700" data-testid="text-search-error">{searchErr}</p>}
            {resultsOutdated && !stale && <p className="mt-4 text-sm text-amber-800">Параметри змінено. Натисніть «Знайти», щоб оновити ціни.</p>}

            {searching && <div className="mt-6 space-y-3 animate-pulse">{[0, 1].map((i) => <div key={i} className="h-28 bg-stone-200 rounded-2xl" />)}</div>}

            {!searching && results && (
              <section className="mt-6 space-y-3">
                {results.units.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-600" data-testid="text-no-units">
                    На ці дати немає вільних номерів для {guests} дорослих. Спробуйте інші дати{phone || email ? " або зв'яжіться з готелем" : ""}.
                  </div>
                ) : results.units.map((u) => {
                  const active = chosen?.id === u.id;
                  return (
                    <button key={u.id} type="button" data-testid={`card-unit-${u.id}`} disabled={!!resultsOutdated}
                      onClick={() => { setChosen(u); setStale(null); setSubmitErr(null); }}
                      className={`w-full text-left rounded-2xl border bg-[#fbfaf7] p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-colors ${active ? "border-2" : "border-stone-200 hover:border-stone-400"}`}
                      style={active ? { borderColor: accent } : undefined}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] uppercase tracking-wider text-stone-500">{u.category}{u.propertyName ? ` · ${u.propertyName}` : ""}</p>
                        <p className="text-lg font-semibold">{u.name}</p>
                        <p className="text-xs text-stone-500 mt-0.5">До {u.capacity} гостей</p>
                        {u.description && <p className="text-sm text-stone-600 mt-2 line-clamp-2">{u.description}</p>}
                      </div>
                      <div className="sm:text-right shrink-0">
                        <p className="text-xl font-semibold font-mono">{money(u.totalPrice)}</p>
                        <p className="text-xs text-stone-500">за {results.nights} ноч.</p>
                      </div>
                    </button>
                  );
                })}
              </section>
            )}

            {chosen && results && (
              <form onSubmit={submit} className="mt-8 rounded-2xl bg-[#fbfaf7] border border-stone-200 p-5 md:p-7 space-y-4" data-testid="form-booking">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-semibold">Дані гостя</h2>
                  <p className="text-sm text-stone-600">{chosen.name} · {fmtDate(checkIn)} – {fmtDate(checkOut)} · <span className="font-semibold font-mono">{money(chosen.totalPrice)}</span></p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {([["firstName", "Ім'я *", "text"], ["lastName", "Прізвище *", "text"], ["email", "Email", "email"], ["phone", "Телефон", "tel"]] as const).map(([k, l, t]) => (
                    <label key={k} className="text-xs text-stone-600 space-y-1"><span>{l}</span>
                      <input data-testid={`input-${k}`} type={t} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} className="w-full h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm" /></label>
                  ))}
                </div>
                {!contactOk && <p className="text-xs text-stone-500">Вкажіть email або телефон для зв'язку.</p>}
                <label className="text-xs text-stone-600 space-y-1 block"><span>Побажання</span>
                  <textarea data-testid="input-requests" rows={3} maxLength={1000} value={form.specialRequests} onChange={(e) => setForm((f) => ({ ...f, specialRequests: e.target.value }))} className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" /></label>
                <div className="rounded-xl bg-white border border-stone-200 p-3 text-sm text-stone-700 space-y-1"><p>Сума розрахована за онлайн-тарифом на {guests} дорослих. Оплата при заїзді.</p><p>Заявка набуває чинності лише після підтвердження готелем.</p><p className="text-stone-500">Діти, додаткове ліжко чи інші потреби: опишіть у полі «Побажання», готель уточнить умови.</p></div>
                <label className="flex items-start gap-2 text-sm">
                  <input data-testid="checkbox-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
                  <span>Погоджуюсь з <button type="button" className="underline" onClick={() => setShowLegal("terms")}>умовами бронювання</button> та <button type="button" className="underline" onClick={() => setShowLegal("privacy")}>політикою конфіденційності</button></span>
                </label>
                {showLegal && (
                  <div className="rounded-xl bg-white border border-stone-200 p-4 text-sm text-stone-700 whitespace-pre-line max-h-64 overflow-y-auto">
                    <div className="flex justify-between mb-2"><b>{showLegal === "terms" ? "Умови бронювання" : "Політика конфіденційності"}</b><button type="button" className="text-xs underline" onClick={() => setShowLegal(null)}>Закрити</button></div>
                    {s(showLegal === "terms" ? cfg.terms : cfg.privacy) || "Текст не надано."}
                  </div>
                )}
                {stale && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="text-stale">
                    <p className="font-medium">Ціна або наявність змінилися: {stale}</p>
                    <p className="mt-1">Ваші дані збережено. Виконайте пошук ще раз і оберіть номер.</p>
                    <button type="button" onClick={search} className="mt-2 underline">Оновити пошук</button>
                  </div>
                )}
                {submitErr && <p className="text-sm text-red-700" data-testid="text-submit-error">{submitErr}</p>}
                <button data-testid="button-submit" type="submit" disabled={!canSubmit} className={`${btn} w-full sm:w-auto`} style={{ background: accent }}>
                  {submitting ? "Надсилаємо..." : "Надіслати заявку"}
                </button>
              </form>
            )}
          </>
        )}
      </main>
      <footer className="max-w-5xl mx-auto px-5 py-8 text-xs text-stone-500 sm:hidden space-y-1">
        {phone && <a href={`tel:${phone}`} className="block">{phone}</a>}
        {email && <a href={`mailto:${email}`} className="block">{email}</a>}
      </footer>
    </Shell>
  );
}
