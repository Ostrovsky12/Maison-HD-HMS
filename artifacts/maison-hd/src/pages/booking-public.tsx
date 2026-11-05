import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useGetPublicBookingEngine } from "@workspace/api-client-react";
import { UnitCard, type PublicUnit } from "@/components/booking/unit-card";
import { ServioCategoryCard, type ServioCharge } from "@/components/booking/servio-category-card";
import { CategoryCarousel } from "@/components/booking/dogoda/category-carousel";
import { guestRateName } from "@/lib/guest-rate-name";
import { servioRateViewOnlyReason } from "@/lib/servio-rate-view";
import { CANONICAL_PAYMENT_NOTICE, PAYMENT_WINDOW_LABEL, supplementaryText } from "@/lib/payment-window";
import type { BookingRoomDetails } from "@workspace/api-client-react";
import { SearchBar, MAX_PARTY } from "@/components/booking/search-bar";
import { MAX_NIGHTS } from "@/components/booking/date-range-field";
import { NonRefundableConsent } from "@/components/booking/nonrefundable-consent";
import { PaymentStatusView } from "@/components/booking/payment-status-view";
import { photoList } from "@/lib/booking-media";
import { normalizeAppearance, type BookingAppearanceValue } from "@/lib/booking-appearance";
import { DogodaTheme } from "@/components/booking/dogoda/dogoda-theme";
import { DogodaSteps, type DogodaStep } from "@/components/booking/dogoda/dogoda-steps";
import { DogodaLogo } from "@/components/booking/dogoda/dogoda-logo";
import { useBookingDraft, BOOKING_DRAFT_NOTICE } from "@/lib/booking-draft";
import { AdditionalServicesPicker } from "@/components/booking/additional-services";
import { normalizeAdditionalServices, serviceRequestText } from "@/lib/booking-additional-services";
import {
  captureReturnFromUrl, clearPending, clearReturn, loadPending, loadReturn, parseTariffPolicy, redirectToLiqPay, savePending,
  type PendingCheckout, type ReturnRef,
} from "@/lib/booking-payment";
import {
  AlertTriangle, ArrowLeft, BedDouble, ChevronRight, Pencil, CalendarDays, Clock, CreditCard, Home, Loader2, Lock, Mail, MapPin, Phone, RefreshCw, Users,
} from "lucide-react";

type Unit = PublicUnit & {
  viewOnlyReason?: string;
  servio?: { categoryId: number; priceListId: number; rateConditionId: number };
  servioGroup?: { key: string; categoryName: string; rateName: string; charges: ServioCharge[]; details?: BookingRoomDetails };
};

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/public";
const s = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, k: number) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
const money = (v: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(v) + " грн";
const fmtDate = (v: string) => { const d = new Date(v + "T00:00:00"); return isNaN(d.getTime()) ? v : d.toLocaleDateString("uk-UA", { weekday: "short", day: "numeric", month: "short" }); };

async function readError(r: Response): Promise<{ msg: string; code: string }> {
  try { const j = await r.json(); return { msg: guestRateName(s(j?.error) || s(j?.message) || `Помилка ${r.status}`), code: s(j?.code) }; }
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

function Shell({ children, ap }: { children: React.ReactNode; ap?: BookingAppearanceValue | null }) {
  if (ap) return <DogodaTheme appearance={ap}>{children}</DogodaTheme>;
  return <div className="min-h-[100dvh] bg-[#f6f4f0] text-stone-900 antialiased">{children}</div>;
}

const inputCls = "w-full h-12 rounded-xl border border-stone-300 bg-white px-3.5 text-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 transition";

export default function BookingPublicPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const isPreviewUrl = useMemo(() => { try { return new URLSearchParams(window.location.search).get("preview") === "1"; } catch { return false; } }, []);
  const q = useGetPublicBookingEngine(slug, isPreviewUrl ? { preview: true } : undefined);
  const data = q.data as unknown as Record<string, any> | undefined;
  const cfg = (data?.config ?? {}) as Record<string, unknown>;
  const orgName = s(data?.organization?.name);
  const name = s(cfg.displayName) || orgName || "Бронювання";
  const ap: BookingAppearanceValue | null = cfg.appearance && typeof cfg.appearance === "object" && (cfg.appearance as Record<string, unknown>).preset === "dogoda" ? normalizeAppearance(cfg.appearance) : null;
  const previewLocked = data?.preview === true && data?.salesEnabled === false;
  const isServio = cfg.provider === "servio";
  const accent = ap ? ap.buttonColor : /^#[0-9a-fA-F]{6}$/.test(s(cfg.accentColor)) ? s(cfg.accentColor) : "#1f4e5f";
  const properties: { id: number; name: string }[] = !isServio && Array.isArray(data?.properties) ? data!.properties : [];
  const policy = useMemo(() => parseTariffPolicy(data?.tariffPolicy), [data]);

  const today = useMemo(() => new Date(), []);
  const [propertyId, setPropertyId] = useState<string>("");
  const [checkIn, setCheckIn] = useState(ymd(addDays(today, 1)));
  const [checkOut, setCheckOut] = useState(ymd(addDays(today, 2)));
  const [guests, setGuests] = useState(2); // adults
  const [childAges, setChildAges] = useState<(number | null)[]>([]); // DOGODA only; null = age not chosen yet
  const [step, setStep] = useState<DogodaStep>(1);
  const [contactErr, setContactErr] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [results, setResults] = useState<{ units: Unit[]; nights: number; key: string; checkIn: string; checkOut: string } | null>(null);
  const [chosen, setChosen] = useState<Unit | null>(null);
  const [stale, setStale] = useState<string | null>(null);

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", specialRequests: "" });
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const services = normalizeAdditionalServices(cfg.additionalServices);
  const requestsText = serviceRequestText(services, selectedServices, form.specialRequests);
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
  // Wait until React has replaced the step. Smooth scrolling before the render
  // can be interrupted by layout shifts and leave the next page halfway down.
  useEffect(() => {
    if (!ap) return;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    return () => cancelAnimationFrame(frame);
  }, [step, slug, !!pending, !!returnRef, !!data, !!ap]);
  const draft = useBookingDraft(slug, API, !!data && !isPreviewUrl && !previewLocked && !!chosen && !pending && !returnRef, {
    guestName: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(), phone: form.phone.trim(), email: form.email.trim(),
    checkIn, checkOut, adults: guests, children: childAges.length,
    categoryName: chosen?.servioGroup?.categoryName || chosen?.name || "", rateName: chosen?.servioGroup?.rateName || "",
    totalAmount: chosen?.totalPrice || 0, currency: "UAH", stage: step >= 4 ? "review" : "contacts",
  });
  const draftNotice = <p data-testid="notice-booking-draft" className="text-xs leading-relaxed text-stone-500">
    {BOOKING_DRAFT_NOTICE}
    {draft.saveState === "error" && <span role="status" className="block text-amber-800">Чернетку поки не вдалося зберегти. Це не перешкоджає бронюванню.</span>}
  </p>;

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

  const kids = ap ? childAges : [];
  const childrenCount = kids.length;
  const totalGuests = guests + childrenCount;
  const searchKey = `${propertyId}|${checkIn}|${checkOut}|${guests}|${childrenCount}|${kids.map((a) => (a === null ? "?" : a)).join(",")}`;
  const resultsOutdated = !!results && results.key !== searchKey;
  const consentKey = chosen && policy ? `${chosen.id}|${checkIn}|${checkOut}|${guests}|${childrenCount}|${kids.join(",")}|${chosen.totalPrice}|${policy.version}` : "";
  const nrAgree = !!consentKey && nrAgreedKey === consentKey;

  // DOGODA: any change of dates/party/property invalidates the chosen quote and all consents; payment needs a fresh search.
  useEffect(() => {
    if (!ap) return;
    setChosen(null); setNrAgreedKey(null); setAgree(false);
    setStep((x) => (x > 1 ? 1 : x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  const search = async () => {
    if (previewLocked) { setSearchErr("Приватний перегляд: пошук і бронювання вимкнені, поки продажі закриті."); return; }
    setSearchErr(null); setStale(null); setChosen(null); setSubmitErr(null); setNrAgreedKey(null);
    if (ap) setAgree(false);
    if (!(checkOut > checkIn)) { setSearchErr("Дата виїзду має бути пізніше дати заїзду"); return; }
    if (ap && Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000) > MAX_NIGHTS) {
      setSearchErr(`Оберіть період до ${MAX_NIGHTS} ночі.`); return;
    }
    if (checkIn < ymd(today)) { setSearchErr("Дата заїзду не може бути в минулому"); return; }
    if (kids.some((a) => a === null || !Number.isInteger(a) || a < 0 || a > 17)) { setSearchErr("Вкажіть вік кожної дитини (від 0 до 17 років)."); return; }
    if (totalGuests > MAX_PARTY) { setSearchErr(`Не більше ${MAX_PARTY} гостей в одному бронюванні.`); return; }
    const seq = ++searchSeq.current;
    const key = searchKey, ci = checkIn, co = checkOut;
    setSearching(true);
    try {
      const p = new URLSearchParams({ slug, engine: "1", checkIn: ci, checkOut: co, guests: String(totalGuests) });
      if (propertyId) p.set("propertyId", propertyId);
      const r = isServio
        ? await fetch(`${API}/booking-engine/${encodeURIComponent(slug)}/servio/search`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkIn: ci, checkOut: co, adults: guests, childAges: kids }),
        })
        : await fetch(`${API}/availability?${p}`);
      if (seq !== searchSeq.current) return;
      if (!r.ok) throw new Error((await readError(r)).msg);
      const j = await r.json();
      if (isServio) {
        if (j.status === "failed") throw new Error(guestRateName(s(j.message)) || "Servio тимчасово недоступний");
        if (j.code === "no_eligible_rates") throw new Error(guestRateName(s(j.message)) || "Вільні місця є, але онлайн-тариф недоступний. Зверніться до готелю.");
        if (j.status === "partial" && !j.currency) throw new Error(guestRateName(s(j.message)) || "Servio не повернув підтверджених цін");
        const nights = (Date.parse(co) - Date.parse(ci)) / 86400000;
        const catalog = Array.isArray(data?.accommodationCatalog) ? data.accommodationCatalog : [];
        let id = 0;
        const units: Unit[] = (Array.isArray(j.categories) ? j.categories : []).flatMap((c: any) => {
          const media = catalog.find((item: any) => item.id === `servio:${j.hotelId}:${c.id}`);
          return (Array.isArray(c.rates) ? c.rates : []).map((rate: any) => ({
            id: ++id, name: s(c.name), category: guestRateName(s(rate.name)), capacity: n(c.mainPlaces), maxCapacity: null,
            viewOnlyReason: servioRateViewOnlyReason(rate),
            description: s(media?.description), photos: photoList(media?.photos), videoUrl: s(media?.videoUrl),
            basePrice: 0, totalPrice: n(rate.total), propertyName: name,
            squareMeters: null, hasBalcony: null, hasView: null,
            servio: { categoryId: n(c.id), priceListId: n(rate.priceListId), rateConditionId: n(rate.conditionId) },
            servioGroup: {
              key: `servio:${j.hotelId}:${c.id}`, categoryName: s(c.name), rateName: s(rate.name),
              charges: (Array.isArray(rate.charges) ? rate.charges : []).map((x: any) => ({ serviceName: s(x.serviceName), date: s(x.date), amount: n(x.amount) })),
              details: media?.details && typeof media.details === "object" ? media.details as BookingRoomDetails : undefined,
            },
          }));
        });
        if (seq !== searchSeq.current) return;
        setResults({ units, nights, key, checkIn: ci, checkOut: co });
        if (ap) setStep(2);
        return;
      }
      const units: Unit[] = (Array.isArray(j?.units) ? j.units : []).map((u: any) => ({
        id: n(u.id), name: s(u.name), category: s(u.category), capacity: n(u.capacity), description: s(u.description),
        basePrice: n(u.basePrice), totalPrice: n(u.totalPrice), propertyName: s(u.propertyName),
        photos: photoList(u.photos), videoUrl: s(u.videoUrl),
        squareMeters: n(u.squareMeters) > 0 ? n(u.squareMeters) : null,
        hasBalcony: u.hasBalcony === true ? true : null,
        hasView: typeof u.hasView === "string" && u.hasView ? u.hasView : null,
        maxCapacity: n(u.maxCapacity) > 0 ? n(u.maxCapacity) : null,
      }));
      if (seq !== searchSeq.current) return;
      setResults({ units, nights: n(j?.nights), key, checkIn: ci, checkOut: co });
      if (ap) setStep(2);
      else setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (e) { if (seq !== searchSeq.current) return; setResults(null); setSearchErr((e as Error).message || "Не вдалося перевірити наявність"); }
    finally { if (seq === searchSeq.current) setSearching(false); }
  };

  /** Starts (or retries) LiqPay checkout for an already created booking. Never creates a new reservation. */
  const startCheckout = async (pc: PendingCheckout) => {
    if (redirecting || previewLocked) return;
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

  const contactOk = isServio
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && /^[+0-9 ()-]{7,30}$/.test(form.phone.trim())
    : form.email.trim() !== "" || form.phone.trim() !== "";
  const canSubmit = data?.salesEnabled !== false && !!chosen && !chosen.viewOnlyReason && !!policy && !pending && !resultsOutdated && !stale && !!form.firstName.trim() && !!form.lastName.trim() && contactOk && agree && nrAgree && !submitting && !redirecting;
  const missing: string[] = [];
  if (chosen) {
    if (!form.firstName.trim() || !form.lastName.trim()) missing.push("ім'я та прізвище");
    if (!contactOk) missing.push(isServio ? "коректні email і телефон" : "email або телефон");
    if (!agree) missing.push("згода з умовами та політикою конфіденційності");
    if (!nrAgree) missing.push("підтвердження неповоротного тарифу");
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (previewLocked || !chosen || !policy || !canSubmit || inflight.current) return;
    if (requestsText.length > 1000) { setSubmitErr("Скоротіть побажання: разом із вибраними опціями дозволено до 1000 символів."); return; }
    if (ap && kids.some((a) => a === null)) return;
    inflight.current = true; setSubmitting(true); setSubmitErr(null);
    const payload = {
      slug, bookingEngine: true, unitId: chosen.id, checkIn, checkOut,
      firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), phone: form.phone.trim(),
      adults: guests, children: childrenCount, guestsCount: totalGuests, ...(childrenCount > 0 ? { childrenAges: kids as number[] } : {}), specialRequests: requestsText,
      expectedTotal: chosen.totalPrice, agreeTerms: true, agreeNonRefundable: true, tariffPolicyVersion: policy.version,
    };
    const key = payloadKey(payload);
    const bookingRequestId = getRequestId(key);
    let created: PendingCheckout | null = null;
    try {
      if (isServio) {
        if (!chosen.servio) throw new Error("Оновіть пошук Servio перед бронюванням.");
        await draft.flush();
        const r = await fetch(`${API}/booking-engine/${encodeURIComponent(slug)}/servio/reservations`, {
          method: "POST", headers: { "Content-Type": "application/json", "X-Booking-Draft": draft.token },
          body: JSON.stringify({
            ...chosen.servio, checkIn, checkOut, adults: guests, childAges: kids,
            firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim(), email: form.email.trim(),
            specialRequests: requestsText,
            expectedTotal: chosen.totalPrice, agreeTerms: true, agreeNonRefundable: true,
            tariffPolicyVersion: policy.version, requestId: bookingRequestId,
          }),
        });
        if (!r.ok) {
          const err = await readError(r);
          if (err.code === "PRICE_CHANGED" || err.code === "SOLD_OUT") {
            dropRequestId(key); setChosen(null); setNrAgreedKey(null); setStep(2); setStale(err.msg);
            setResults(x => x ? { ...x, key: "" } : x);
          } else setSubmitErr(err.msg);
          return;
        }
        const result = await r.json();
        // Only the final authoritative bill can be paid. Keep the same request
        // identity on reload or a lost response; never automatically create again.
        const url = s(result.url);
        const expected = `/booking/${encodeURIComponent(slug)}/servio/`;
        if (!url.startsWith(expected) || !/^#[a-z]/.test(url.slice(url.indexOf("#")))) {
          setSubmitErr("Бронювання обробляється. Не створюйте іншу спробу й не платіть повторно; зверніться до готелю."); return;
        }
        draft.markSubmitted();
        window.location.assign(`${BASE}${url}`);
        return;
      }
      let r: Response;
      try {
        await draft.flush();
        r = await fetch(`${API}/bookings`, {
          method: "POST", headers: { "Content-Type": "application/json", "X-Booking-Draft": draft.token },
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
      draft.markSubmitted();
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

  const emailOk = form.email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const toReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (requestsText.length > 1000) { setContactErr("Скоротіть побажання: разом із вибраними опціями дозволено до 1000 символів."); return; }
    if (!policy) { setContactErr("Онлайн-оплата зараз недоступна. Зв'яжіться з готелем напряму."); return; }
    if (!form.firstName.trim() || !form.lastName.trim()) { setContactErr("Вкажіть ім'я та прізвище."); return; }
    if (!contactOk) { setContactErr(isServio ? "Вкажіть коректні email та телефон: на email надійде підтвердження." : "Вкажіть email або телефон для зв'язку."); return; }
    if (!emailOk) { setContactErr("Перевірте формат email."); return; }
    setContactErr(null); setStep(4);
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
      <div className={`max-w-6xl mx-auto px-5 ${ap ? "h-24" : "h-16"} flex items-center justify-between gap-4`}>
        <div className="dg-public-brand flex items-center gap-3 min-w-0">
          {ap ? <DogodaLogo background={ap.surfaceColor} customSrc={logo} className="h-16 w-auto max-w-[160px] shrink-0" /> : logo ? <img src={logo} alt="" className="h-9 w-9 rounded-xl object-cover" /> :
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-semibold" style={{ background: accent }}>{name.slice(0, 1)}</div>}
          <p className={ap ? "sr-only" : "font-semibold truncate"} data-testid="text-hotel-name">{name}</p>
        </div>
        <div className="dg-public-contacts flex items-center gap-1 text-sm text-stone-700">
          {phone && <a href={`tel:${phone}`} className="flex items-center gap-1.5 rounded-full px-3 py-2 hover:bg-stone-100"><Phone className="w-4 h-4" /><span className="hidden md:inline">{phone}</span></a>}
          {email && <a href={`mailto:${email}`} className="flex items-center gap-1.5 rounded-full px-3 py-2 hover:bg-stone-100"><Mail className="w-4 h-4" /><span className="hidden lg:inline">{email}</span></a>}
        </div>
      </div>
    </header>
  );

  if (returnRef) {
    return (
      <Shell ap={ap}>{header}
        <main className="max-w-6xl mx-auto px-5 py-10 md:py-16">
          <PaymentStatusView api={API} slug={slug} ref_={returnRef} accent={accent} base={BASE}
            onDismiss={() => { clearReturn(slug); setReturnRef(null); if (pending && pending.bookingId === returnRef.bookingId) abandonPending(); }} />
        </main>
      </Shell>
    );
  }

  const banner = data?.salesEnabled === false && (
    <div role="status" className="sticky top-0 z-40 px-5 py-2.5 text-center text-sm" style={{ background: "#292D05", color: "#FFF4E5" }} data-testid="banner-private-preview">
      {previewLocked ? "Приватний перегляд для команди. Продажі закриті: пошук, бронювання й оплата вимкнені."
        : "Пошук вільних дат і цін доступний. Онлайн-оплата ще не підключена — для бронювання зверніться до готелю."}
    </div>
  );
  const pendingPanel = pending && (
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
  );

  if (ap) {
    const ageWord = (a: number) => (a === 0 ? "до 1 р." : `${a} р.`);
    const party = `${guests} ${guests === 1 ? "дорослий" : "дорослих"}${childrenCount ? ` · ${childrenCount} ${childrenCount === 1 ? "дитина" : childrenCount < 5 ? "дитини" : "дітей"} (${kids.map((a) => (a === null ? "?" : ageWord(a))).join(", ")})` : ""}`;
    const hasResults = !!results && !resultsOutdated;
    const eff: DogodaStep = chosen && step >= 3 && hasResults ? (step === 4 ? 4 : 3) : hasResults && step >= 2 ? 2 : (stale && chosen && step === 4 ? 4 : 1);
    const go = (x: DogodaStep) => { setStep(x); };
    const back = (to: DogodaStep, label: string) => (
      <button type="button" onClick={() => go(to)} className="inline-flex items-center gap-1.5 text-sm underline" data-testid={`button-back-${to}`}><ArrowLeft className="w-4 h-4" />{label}</button>
    );
    const summary = (
      <aside className="lg:sticky lg:top-28" data-testid="panel-summary">
        <div className="rounded-3xl bg-white border border-stone-200 overflow-hidden">
          {chosen && (chosen.photos[0] ? <img src={chosen.photos[0]} alt="" className="w-full h-36 object-cover" /> :
            <div className="h-20 flex items-center justify-center" style={{ background: accent }}><Home className="w-7 h-7" /></div>)}
          <div className="p-5 space-y-3 text-sm">
            <p className="font-semibold">{chosen ? chosen.name : "Ваше бронювання"}</p>
            {chosen && <p className="text-[11px] uppercase tracking-wider text-stone-500 -mt-2">{chosen.category}{chosen.propertyName ? ` · ${chosen.propertyName}` : ""}</p>}
            <p className="flex items-center gap-2 text-stone-600"><CalendarDays className="w-4 h-4 shrink-0" />{fmtDate(checkIn)} – {fmtDate(checkOut)}{hasResults ? ` · ${nights} ноч.` : ""}</p>
            <p className="flex items-start gap-2 text-stone-600" data-testid="text-summary-party"><Users className="w-4 h-4 shrink-0 mt-0.5" />{party}</p>
            {chosen && <div className="flex justify-between items-baseline border-t border-stone-200 pt-3"><span className="font-semibold">Разом</span><span className="text-xl font-semibold font-mono" data-testid="text-summary-total">{money(chosen.totalPrice)}</span></div>}
            {policy && (!isServio || chosen) && <p className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-900"><b>Неповоротний тариф:</b> 100% оплата онлайн, без повернення коштів і зміни дат.</p>}
            {eff > 1 && <button type="button" onClick={() => go(1)} className="inline-flex items-center gap-1.5 text-xs underline" data-testid="button-edit-search"><Pencil className="w-3.5 h-3.5" />Змінити дати або гостей</button>}
          </div>
        </div>
        {(phone || email) && (
          <div className="mt-4 rounded-2xl bg-white/70 border border-stone-200 p-4 text-sm text-stone-600 space-y-1.5">
            <p className="font-medium text-stone-800">Питання до нас</p>
            {phone && <a href={`tel:${phone}`} className="flex items-center gap-2"><Phone className="w-4 h-4" />{phone}</a>}
            {email && <a href={`mailto:${email}`} className="flex items-center gap-2"><Mail className="w-4 h-4" />{email}</a>}
          </div>
        )}
      </aside>
    );

    return (
      <Shell ap={ap}>
        {header}
        <main className="max-w-6xl mx-auto px-4 md:px-5 py-6 md:py-10">
          <h1 className="sr-only" data-testid="text-dogoda-title">{name}: бронювання</h1>
          <div className="mb-6 overflow-x-auto flex justify-center"><DogodaSteps step={eff} onGo={go} /></div>
          {!policy && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 flex gap-2" data-testid="text-policy-unavailable">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />Онлайн-оплата зараз недоступна, тому бронювання тимчасово неможливе. Зв'яжіться з нами напряму.
            </div>
          )}
          {pendingPanel}

          {eff === 1 && (
            <section className="dg-rise" aria-labelledby="dg-step1">
              <p className="dg-hand hidden md:block text-2xl" style={{ color: "var(--dg-button)" }}>pick your dates</p>
              <h2 id="dg-step1" className="text-3xl md:text-4xl tracking-tight mb-6">Коли приїдете і скільки вас?</h2>
              <SearchBar properties={properties} hotelName={isServio ? name : undefined} propertyId={propertyId} setPropertyId={setPropertyId} checkIn={checkIn} setCheckIn={setCheckIn}
                checkOut={checkOut} setCheckOut={setCheckOut} guests={guests} setGuests={setGuests} minDate={ymd(today)} searching={searching} onSearch={search} accent={accent}
                childAges={childAges} setChildAges={setChildAges} rangeCalendar locked={previewLocked} lockedNote="Приватний перегляд: продажі закриті, тому пошук вільних дат вимкнено." />
              {stale && !chosen && (
                <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="text-price-changed">
                  <p className="font-medium">{stale}</p>
                  <p className="mt-1">Ваші контактні дані збережено. Виконайте пошук ще раз, перевірте нову ціну та оберіть будиночок.</p>
                </div>
              )}
              {searchErr && <p className="mt-4 text-sm text-red-700" role="alert" data-testid="text-search-error">{searchErr}</p>}
              {searching && <div className="mt-8 space-y-6 animate-pulse">{[0, 1].map((i) => <div key={i} className="h-64 bg-stone-200 rounded-3xl" />)}</div>}
              {!searching && (
                <p className="mt-6 text-sm dg-muted text-center" data-testid="text-search-hint">Покажемо лише вільні варіанти з ціною за весь період.</p>
              )}
            </section>
          )}

          {eff === 2 && results && (
            <div className={isServio ? "min-w-0 space-y-5" : "grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start"}>
              <section id="results" className="space-y-6 min-w-0 dg-rise" aria-labelledby="dg-step2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="dg-step2" className="text-2xl md:text-3xl tracking-tight">
                    {results.units.length ? `${results.units.length} ${results.units.length === 1 ? "варіант" : results.units.length < 5 ? "варіанти" : "варіантів"} на ваші дати` : "Вільних варіантів немає"}
                  </h2>
                  {back(1, "Змінити дати")}
                </div>
                {isServio && <p className="text-sm dg-muted">{fmtDate(checkIn)} – {fmtDate(checkOut)} · {party}</p>}
                {results.units.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-600" data-testid="text-no-units">
                    На ці дати немає вільних будиночків для {party}. Спробуйте інші дати{phone || email ? " або зв'яжіться з нами" : ""}.
                  </div>
                ) : isServio ? (() => {
                  const groups: { key: string; units: Unit[] }[] = [];
                  for (const u of results.units) {
                    const k = u.servioGroup?.key ?? `rate:${u.id}`;
                    const g = groups.find((x) => x.key === k);
                    if (g) g.units.push(u); else groups.push({ key: k, units: [u] });
                  }
                  return <CategoryCarousel initialIndex={Math.max(0, groups.findIndex((g) => g.units.some((u) => u.id === chosen?.id)))}>{groups.map((g) => {
                    const f = g.units[0];
                    return (
                      <ServioCategoryCard compact key={g.key} categoryKey={g.key} name={f.name} photos={f.photos} description={f.description} details={f.servioGroup?.details}
                        capacity={f.capacity} accent={accent} supplementary={supplementaryText(cfg.paymentWindowText)} disabled={!!pending || previewLocked}
                        selectedId={chosen && g.units.some((u) => u.id === chosen.id) ? chosen.id : null}
                        rates={g.units.map((u) => ({ id: u.id, rateName: u.servioGroup?.rateName ?? u.category, total: u.totalPrice, charges: u.servioGroup?.charges ?? [], viewOnlyReason: u.viewOnlyReason }))}
                        onSelect={(id) => {
                          const u = g.units.find((x) => x.id === id); if (!u || u.viewOnlyReason) return;
                          if (chosen?.id !== u.id) { setNrAgreedKey(null); setAgree(false); }
                          setChosen(u); setStale(null); setSubmitErr(null); go(3);
                        }} />
                    );
                  })}</CategoryCarousel>;
                })() : results.units.map((u) => (
                  <UnitCard key={u.id} unit={u} nights={results.nights} accent={accent} active={chosen?.id === u.id} disabled={!!pending || previewLocked}
                    policyBadge={policy ? "Неповоротний · 100% передоплата" : undefined}
                    onSelect={() => {
                      if (chosen?.id !== u.id) { setNrAgreedKey(null); setAgree(false); }
                      setChosen(u); setStale(null); setSubmitErr(null); go(3);
                    }} />
                ))}
              </section>
              {!isServio && summary}
            </div>
          )}

          {eff === 3 && chosen && (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
              <form onSubmit={toReview} noValidate className="rounded-3xl bg-white border border-stone-200 p-5 md:p-8 space-y-5 dg-rise" data-testid="form-contact" aria-labelledby="dg-step3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="dg-step3" className="text-2xl md:text-3xl tracking-tight">Хто приїде?</h2>
                  {back(2, "До будиночків")}
                </div>
                {draftNotice}
                <div className="grid sm:grid-cols-2 gap-3">
                  {([["firstName", "Ім'я *", "text", "given-name"], ["lastName", "Прізвище *", "text", "family-name"], ["email", "Email", "email", "email"], ["phone", "Телефон", "tel", "tel"]] as const).map(([k, l, t, ac]) => (
                    <label key={k} className="text-xs text-stone-600 space-y-1"><span>{l}</span>
                      <input data-testid={`input-${k}`} type={t} autoComplete={ac} value={form[k]} onChange={(e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setContactErr(null); }} className={inputCls} /></label>
                  ))}
                </div>
                <p className="text-xs text-stone-500">{isServio ? "Потрібні email і телефон. Підтвердження бронювання та оплати надійде на email." : "Потрібен email або телефон, щоб ми могли з вами зв'язатися."}</p>
                <AdditionalServicesPicker services={services} selected={selectedServices} onChange={setSelectedServices} showNotice={false} />
                <label className="text-xs text-stone-600 space-y-1 block"><span>Побажання</span>
                  <textarea data-testid="input-requests" rows={3} maxLength={1000} value={form.specialRequests} onChange={(e) => setForm((f) => ({ ...f, specialRequests: e.target.value }))}
                    aria-describedby="dogoda-wishes-note" className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-stone-900" /></label>
                <p id="dogoda-wishes-note" className="text-xs leading-relaxed text-stone-500">Подбаємо про ваш ідеальний відпочинок. Окремі побажання узгодимо додатково, зокрема їхню вартість.</p>
                {contactErr && <p className="text-sm text-red-700" role="alert" data-testid="text-contact-error">{contactErr}</p>}
                <button type="submit" data-testid="button-to-review" className="rounded-xl px-6 py-3.5 text-sm font-semibold text-white inline-flex items-center gap-2" style={{ background: accent }}>
                  Перевірити бронювання<ChevronRight className="w-4 h-4" />
                </button>
              </form>
              {summary}
            </div>
          )}

          {eff === 4 && chosen && policy && (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
              <form onSubmit={submit} className="rounded-3xl bg-white border border-stone-200 p-5 md:p-8 space-y-7 dg-rise" data-testid="form-booking" aria-labelledby="dg-step4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="dg-step4" className="text-2xl md:text-3xl tracking-tight">Перевірте й оплатіть</h2>
                  {back(3, "Змінити контакти")}
                </div>
                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm rounded-2xl border border-stone-200 p-4" data-testid="panel-review">
                  <div><dt className="text-xs text-stone-500">Будиночок</dt><dd>{chosen.name}</dd></div>
                  <div><dt className="text-xs text-stone-500">Дати</dt><dd>{fmtDate(checkIn)} – {fmtDate(checkOut)} · {nights} ноч.</dd></div>
                  <div><dt className="text-xs text-stone-500">Гості</dt><dd>{party}</dd></div>
                  <div><dt className="text-xs text-stone-500">Гість</dt><dd>{form.firstName.trim()} {form.lastName.trim()}</dd></div>
                  <div><dt className="text-xs text-stone-500">Контакти</dt><dd className="break-all">{[form.email.trim(), form.phone.trim()].filter(Boolean).join(" · ")}</dd></div>
                  {isServio && chosen.servioGroup && (
                    <div className="sm:col-span-2 border-t border-stone-200 pt-3 space-y-1.5" data-testid="panel-review-charges">
                      <dt className="text-xs text-stone-500">Тариф: {guestRateName(chosen.servioGroup.rateName)}</dt>
                      {chosen.servioGroup.charges.map((c, i) => <dd key={i} className="grid grid-cols-[1fr_auto_auto] gap-3"><span>{c.serviceName}</span><span>{fmtDate(c.date.slice(0, 10))}</span><span className="font-mono">{money(c.amount)}</span></dd>)}
                      <dd className="flex justify-between font-semibold pt-1"><span>Всього</span><span className="font-mono" data-testid="text-review-total">{money(chosen.totalPrice)}</span></dd>
                      {cfg.provider === "servio" && <>
                        <dd className="text-xs text-red-700 whitespace-pre-line" data-testid="text-payment-window">{supplementaryText(cfg.paymentWindowText) || CANONICAL_PAYMENT_NOTICE}</dd>
                        <dd className="text-xs text-stone-600">{PAYMENT_WINDOW_LABEL}</dd>
                      </>}
                    </div>
                  )}
                  {requestsText && <div className="sm:col-span-2"><dt className="text-xs text-stone-500">Побажання</dt><dd className="whitespace-pre-line">{requestsText}</dd></div>}
                </dl>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold mb-2">Умови та конфіденційність</legend>
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
                  <legend className="text-sm font-semibold mb-2">Неповоротний тариф</legend>
                  <NonRefundableConsent policy={policy} total={chosen.totalPrice} checked={nrAgree} onChange={(v) => setNrAgreedKey(v ? consentKey : null)} />
                </fieldset>
                {stale && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="text-stale">
                    <p className="font-medium">Ціна або наявність змінилися: {stale}</p>
                    <p className="mt-1">Ваші дані збережено. Виконайте пошук ще раз і оберіть будиночок.</p>
                    <button type="button" onClick={() => { go(1); void search(); }} className="mt-2 underline">Оновити пошук</button>
                  </div>
                )}
                {data?.salesEnabled === false && (
                  <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="text-checkout-unavailable">
                    {previewLocked ? "Приватний перегляд: продажі закриті, бронювання й оплата вимкнені." : "Онлайн-оплата ще не підключена. Щоб забронювати, зв'яжіться з нами напряму."}
                  </p>
                )}
                {submitErr && <p className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-900" data-testid="text-submit-error">{submitErr}</p>}
                <div className="rounded-2xl bg-stone-900 text-white p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between" style={{ color: "var(--dg-surface)" }}>
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-70">До сплати зараз, 100%</p>
                    <p className="text-2xl font-semibold font-mono" data-testid="text-pay-now">{money(chosen.totalPrice)}</p>
                    <p className="text-xs font-medium mt-0.5 opacity-80">Без повернення коштів і зміни дат</p>
                  </div>
                  <button data-testid="button-submit" type="submit" disabled={!canSubmit || previewLocked}
                    className="rounded-xl px-6 py-3.5 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-40 shrink-0" style={{ background: accent }}>
                    {ctaBusy ? <><Loader2 className="w-4 h-4 animate-spin" />{submitting ? "Створюємо бронювання..." : "Перехід до оплати..."}</> : <><Lock className="w-4 h-4" />Підтвердити й оплатити {money(chosen.totalPrice)}</>}
                  </button>
                </div>
                {!canSubmit && !ctaBusy && missing.length > 0 && <p className="text-xs text-stone-500 -mt-4">Щоб продовжити, потрібно: {missing.join(", ")}.</p>}
                <p className="text-xs text-stone-500 -mt-4">Оплата на захищеній сторінці LiqPay. Бронювання гарантоване лише після підтвердження оплати.</p>
              </form>
              {summary}
            </div>
          )}
        </main>
        <footer className="border-t border-stone-200 mt-6">
          <div className="max-w-6xl mx-auto px-5 py-6 text-xs text-stone-500 flex flex-wrap gap-x-4 gap-y-1 justify-between">
            <span>Maison HD - студія бронювань</span>
            <span>Ціни в гривнях. Онлайн-оплата через LiqPay.</span>
          </div>
        </footer>
      </Shell>
    );
  }

  return (
    <Shell ap={ap}>
      {banner}
      {header}

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
            {policy && (!isServio || chosen) && <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-red-800 font-semibold"><CreditCard className="w-3.5 h-3.5" />Неповоротний тариф, 100% онлайн-оплата</span>}
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 md:px-5 -mt-12 md:-mt-14 relative z-10">
        <SearchBar properties={properties} hotelName={isServio ? name : undefined} propertyId={propertyId} setPropertyId={setPropertyId} checkIn={checkIn} setCheckIn={setCheckIn}
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
                  <UnitCard key={u.id} unit={u} nights={results.nights} accent={accent} active={chosen?.id === u.id} disabled={!!resultsOutdated || !!pending || !!u.viewOnlyReason}
                    viewOnlyReason={u.viewOnlyReason} policyBadge={u.viewOnlyReason ? undefined : policy ? "Неповоротний · 100% передоплата" : undefined}
                    onSelect={() => { if (u.viewOnlyReason) return; setChosen(u); setStale(null); setSubmitErr(null); setTimeout(() => document.querySelector('[data-testid="form-booking"]')?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />
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
                  {draftNotice}
                  <div className="grid sm:grid-cols-2 gap-3">
                    {([["firstName", "Ім'я *", "text", "given-name"], ["lastName", "Прізвище *", "text", "family-name"], ["email", "Email", "email", "email"], ["phone", "Телефон", "tel", "tel"]] as const).map(([k, l, t, ac]) => (
                      <label key={k} className="text-xs text-stone-600 space-y-1"><span>{l}</span>
                        <input data-testid={`input-${k}`} type={t} autoComplete={ac} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} className={inputCls} /></label>
                    ))}
                  </div>
                  {!contactOk && <p className="text-xs text-stone-500">Вкажіть email або телефон для зв'язку.</p>}
                  <AdditionalServicesPicker services={services} selected={selectedServices} onChange={setSelectedServices} disabled={submitting} />
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
                  {policy && <p className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-900"><b>Умови онлайн-бронювання:</b> 100% оплата онлайн при бронюванні, без повернення коштів і зміни дат.</p>}
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
