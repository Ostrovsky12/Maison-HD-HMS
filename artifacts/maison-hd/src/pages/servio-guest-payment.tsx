import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import {
  useGetBookingServioGuestReservation, useCheckoutBookingServioGuestReservation,
} from "@workspace/api-client-react";
import type { BookingServioGuestView } from "@workspace/api-client-react";
import { redirectToLiqPay } from "@/lib/booking-payment";
import { captureGuestAccess, forgetGuestAccess, newCacheId, validRoute } from "@/lib/servio-guest-payment";
import {
  AlertTriangle, BedDouble, CalendarDays, CheckCircle2, Clock, CreditCard, Loader2, Lock, Mail, Phone, RefreshCw, ShieldAlert,
} from "lucide-react";

const ACCENT = "#1f4e5f";
const money = (v: number, cur: string) => new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + " " + cur;
const fmtDate = (v: string) => { const d = new Date(v + "T00:00:00"); return isNaN(d.getTime()) ? v : d.toLocaleDateString("uk-UA", { weekday: "short", day: "numeric", month: "long", year: "numeric" }); };
const fmtDateTime = (v: string) => { const d = new Date(v); return isNaN(d.getTime()) ? v : d.toLocaleString("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); };
const statusOf = (e: unknown) => { const s = (e as { status?: unknown } | null)?.status; return typeof s === "number" ? s : 0; };

const STATE_TEXT: Record<string, { title: string; body: string; tone: "ok" | "wait" | "warn" | "bad" }> = {
  creating: { title: "Бронювання оформлюється", body: "Готель ще формує рахунок. Сторінка оновиться автоматично.", tone: "wait" },
  billing: { title: "Рахунок формується", body: "Фінальна сума ще не готова. Сторінка оновиться автоматично.", tone: "wait" },
  bill_ready: { title: "Рахунок готовий до оплати", body: "Перевірте деталі, ознайомтеся з умовами та підтвердьте оплату.", tone: "wait" },
  awaiting_payment: { title: "Очікуємо підтвердження оплати", body: "Якщо ви ще не завершили оплату на сторінці LiqPay, можна продовжити. Якщо оплатили, дочекайтеся підтвердження нижче, повторно не платіть.", tone: "wait" },
  confirming: { title: "Оплата перевіряється", body: "Ми отримали сигнал від платіжної системи й звіряємо його з готелем. Не оплачуйте повторно.", tone: "wait" },
  confirmed: { title: "Бронювання підтверджено", body: "Оплату підтверджено підписаним повідомленням LiqPay.", tone: "ok" },
  review: { title: "Потрібна перевірка готелем", body: "Стан оплати потребує ручної звірки. Не оплачуйте повторно, готель зв'яжеться з вами.", tone: "warn" },
  failed: { title: "Бронювання не вдалося", body: "Оплата за цим посиланням недоступна. Зверніться до готелю.", tone: "bad" },
  cancelling: { title: "Бронювання скасовується", body: "Оплата недоступна. Зверніться до готелю за деталями.", tone: "bad" },
  cancelled: { title: "Бронювання скасовано", body: "Оплата за цим посиланням недоступна.", tone: "bad" },
};

function useNoIndexMeta(title: string | null) {
  useEffect(() => {
    const prevTitle = document.title;
    const touched: { el: HTMLMetaElement; prev: string | null; created: boolean }[] = [];
    for (const [name, content] of [["robots", "noindex,nofollow"], ["referrer", "no-referrer"]] as const) {
      let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      const created = !el;
      if (!el) { el = document.createElement("meta"); el.setAttribute("name", name); document.head.appendChild(el); }
      touched.push({ el, prev: el.getAttribute("content"), created });
      el.setAttribute("content", content);
    }
    return () => {
      document.title = prevTitle;
      for (const t of touched) { if (t.created) t.el.remove(); else if (t.prev !== null) t.el.setAttribute("content", t.prev); }
    };
  }, []);
  useEffect(() => { document.title = title ? `Оплата бронювання · ${title}` : "Оплата бронювання"; }, [title]);
}

function Shell({ children, hotel, phone, email }: { children: React.ReactNode; hotel?: string; phone?: string; email?: string }) {
  return (
    <div className="min-h-[100dvh] bg-[#f6f4f0] text-stone-900 antialiased" data-testid="guest-servio-page">
      <header className="bg-white/90 backdrop-blur border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white" style={{ background: ACCENT }}><Lock className="w-4 h-4" aria-hidden /></div>
            <div className="min-w-0">
              <p className="font-semibold truncate" data-testid="text-guest-servio-hotel">{hotel || "Приватна сторінка оплати"}</p>
              <p className="text-[11px] text-stone-500">Приватне посилання для гостя</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm text-stone-700">
            {phone && <a href={`tel:${phone}`} rel="noreferrer" className="flex items-center gap-1.5 rounded-full px-3 py-2 hover:bg-stone-100" aria-label={`Телефон готелю ${phone}`}><Phone className="w-4 h-4" /><span className="hidden md:inline">{phone}</span></a>}
            {email && <a href={`mailto:${email}`} rel="noreferrer" className="flex items-center gap-1.5 rounded-full px-3 py-2 hover:bg-stone-100" aria-label={`Пошта готелю ${email}`}><Mail className="w-4 h-4" /><span className="hidden md:inline">{email}</span></a>}
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-8 md:py-12">{children}</main>
    </div>
  );
}

function Unavailable({ title, body, retry }: { title: string; body: string; retry?: () => void }) {
  return (
    <section role="alert" data-testid="guest-servio-error" className="rounded-2xl border border-stone-200 bg-white p-6 md:p-8">
      <ShieldAlert className="w-8 h-8 text-stone-500" aria-hidden />
      <h1 className="text-xl font-semibold mt-3">{title}</h1>
      <p className="text-sm text-stone-600 mt-2 leading-relaxed">{body}</p>
      {retry && (
        <button type="button" onClick={retry} data-testid="button-guest-servio-retry"
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 h-11 text-sm font-medium hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-stone-900">
          <RefreshCw className="w-4 h-4" />Спробувати ще раз
        </button>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Завантаження бронювання</span>
      <div className="h-24 rounded-2xl bg-stone-200/70 animate-pulse" />
      <div className="h-48 rounded-2xl bg-stone-200/70 animate-pulse" />
      <div className="h-40 rounded-2xl bg-stone-200/70 animate-pulse" />
    </div>
  );
}

export default function ServioGuestPaymentPage() {
  const { slug = "", id = "" } = useParams<{ slug: string; id: string }>();
  const routeOk = validRoute(slug, id);
  // Capture synchronously, before any fetch is scheduled.
  const [access, setAccess] = useState(() => captureGuestAccess(slug, id));
  const prevRoute = useRef(`${slug}/${id}`);
  if (prevRoute.current !== `${slug}/${id}`) { prevRoute.current = `${slug}/${id}`; setAccess(captureGuestAccess(slug, id)); }
  const token = routeOk ? access.token : null;
  useEffect(() => {
    const capture = () => {
      if (new URLSearchParams(window.location.hash.slice(1)).has("access")) setAccess(captureGuestAccess(slug, id));
    };
    window.addEventListener("hashchange", capture);
    return () => window.removeEventListener("hashchange", capture);
  }, [slug, id]);
  // Isolated cache scope per access session; the token itself never enters the key.
  const cacheId = useMemo(() => newCacheId(), [token, slug, id]);

  const reqOpts = { headers: { "X-Booking-Access": token ?? "" }, credentials: "omit" as RequestCredentials };
  const q = useGetBookingServioGuestReservation(encodeURIComponent(slug), id, {
    query: {
      enabled: !!token,
      queryKey: ["servio-guest-view", cacheId, slug, id],
      refetchInterval: 10_000, staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: true,
    },
    request: reqOpts,
  });
  const checkout = useCheckoutBookingServioGuestReservation({ request: reqOpts });

  const view = q.data as BookingServioGuestView | undefined;
  useNoIndexMeta(view?.hotelName ?? null);

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeNr, setAgreeNr] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unknownAt, setUnknownAt] = useState<number | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const inFlight = useRef(false);
  const session = useRef(cacheId);
  session.current = cacheId;

  const r = view?.reservation;
  const consentKey = r ? `${r.total}:${r.currency}:${r.policyVersion}:${r.state}:${r.acknowledgementText.length}` : "";
  const prevConsent = useRef(consentKey);
  useEffect(() => {
    if (prevConsent.current !== consentKey) { prevConsent.current = consentKey; setAgreeNr(false); if (!r) setAgreeTerms(false); }
  }, [consentKey, r]);
  useEffect(() => { setAgreeTerms(false); setAgreeNr(false); setErr(null); setUnknownAt(null); setRedirecting(false); inFlight.current = false; }, [cacheId]);

  // Fatal access errors: drop the stored token so a stale/expired link isn't retried forever.
  const errStatus = q.isError ? statusOf(q.error) : 0;
  useEffect(() => { if (!view && (errStatus === 401 || errStatus === 403 || errStatus === 404 || errStatus === 410)) forgetGuestAccess(slug, id); }, [errStatus, view, slug, id]);

  if (!routeOk || !token) {
    return <Shell><Unavailable title="Посилання недоступне" body="Це приватне посилання неповне, недійсне або вже не відкривається в цьому вікні браузера. Щоб оплатити бронювання, відкрийте оригінальне посилання від готелю або зверніться до готелю за новим." /></Shell>;
  }
  if (q.isLoading && !view) return <Shell><Skeleton /></Shell>;
  if (!view) {
    if (errStatus === 401 || errStatus === 403 || errStatus === 404 || errStatus === 410) {
      return <Shell><Unavailable title="Посилання недійсне або прострочене" body="Доступ за цим посиланням завершився або бронювання не знайдено. Зверніться до готелю, щоб отримати нове приватне посилання." /></Shell>;
    }
    return <Shell><Unavailable title={errStatus === 503 ? "Сервіс тимчасово недоступний" : "Не вдалося завантажити бронювання"} body="Спробуйте ще раз за хвилину. Якщо ви вже перейшли до оплати, не платіть повторно, доки не побачите актуальний стан." retry={() => q.refetch()} /></Shell>;
  }

  const res = view.reservation;
  const stale = q.isError; // last poll failed; showing an older snapshot
  const fresh = !stale && (unknownAt === null || q.dataUpdatedAt > unknownAt);
  const payable = (res.state === "bill_ready" || res.state === "awaiting_payment") && res.total !== null && res.total > 0;
  const hasLegal = !!view.terms.trim() && !!view.privacy.trim() && !!res.acknowledgementText.trim() && !!res.policyVersion;
  const busy = checkout.isPending || redirecting;
  const canSubmit = payable && hasLegal && fresh && agreeTerms && agreeNr && !busy;
  const isTest = res.mode === "test";
  const st = STATE_TEXT[res.state] ?? { title: "Стан бронювання", body: res.message, tone: "warn" as const };
  const liveConfirmed = res.state === "confirmed" && !isTest;
  const tone = res.state === "confirmed" && isTest ? "warn" : st.tone;

  const pay = () => {
    if (!canSubmit || inFlight.current || res.total === null) return;
    inFlight.current = true; setErr(null);
    const mySession = session.current;
    checkout.mutate({ slug: encodeURIComponent(slug), id, data: { expectedTotal: res.total, agreeTerms: true, agreeNonRefundable: true, tariffPolicyVersion: res.policyVersion } }, {
      onSuccess: (out) => {
        if (session.current !== mySession) return;
        if (redirectToLiqPay(out.url, out.data, out.signature)) { setRedirecting(true); return; }
        inFlight.current = false; setAgreeNr(false);
        setErr("Сервер повернув неочікувану адресу оплати, перехід заблоковано. Зверніться до готелю.");
        q.refetch();
      },
      onError: (e) => {
        if (session.current !== mySession) return;
        inFlight.current = false; setAgreeNr(false);
        const s = statusOf(e);
        if (s === 409) { setAgreeTerms(false); setErr("Сума, умови або стан бронювання змінилися. Перевірте оновлені дані й підтвердьте ще раз."); q.refetch(); return; }
        if (s === 401 || s === 403 || s === 404 || s === 410) { setErr("Доступ за посиланням завершився. Зверніться до готелю."); q.refetch(); return; }
        if (s >= 400 && s < 500) { setErr("Запит на оплату відхилено. Оновіть сторінку або зверніться до готелю."); q.refetch(); return; }
        setUnknownAt(Date.now());
        setErr("Результат запиту невідомий. Не оплачуйте повторно навмання: дочекайтеся оновлення стану нижче. Кнопка стане доступною лише після свіжої перевірки.");
        q.refetch();
      },
    });
  };

  const toneCls = { ok: "border-emerald-300 bg-emerald-50 text-emerald-950", wait: "border-stone-300 bg-white text-stone-900", warn: "border-amber-300 bg-amber-50 text-amber-950", bad: "border-red-200 bg-red-50 text-red-950" }[tone];

  return (
    <Shell hotel={view.hotelName} phone={view.phone} email={view.email}>
      {!access.persisted && (
        <p role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />Браузер не дозволяє зберегти доступ у цій вкладці. Після повернення з LiqPay може знадобитися знову відкрити оригінальне приватне посилання.
        </p>
      )}
      {stale && (
        <p role="alert" className="mb-4 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-xs text-orange-950 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />Не вдалося оновити стан. Показано останні відомі дані, оплату вимкнено до свіжої перевірки.
          <button type="button" onClick={() => q.refetch()} className="underline font-medium">Оновити</button>
        </p>
      )}

      <p className="text-[11px] uppercase tracking-[0.24em] text-stone-500">Оплата існуючого бронювання</p>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">{view.hotelName}</h1>
      <p className="text-sm text-stone-600 mt-1">Продавець: {view.sellerName}</p>

      <section aria-live="polite" data-testid="guest-servio-status" className={`mt-6 rounded-2xl border p-5 ${toneCls}`}>
        <div className="flex items-start gap-3">
          {liveConfirmed ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden /> : <Clock className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />}
          <div>
            <p className="font-semibold">{res.state === "confirmed" && isTest ? "Тестова оплата отримана, бронювання не оплачено" : st.title}</p>
            <p className="text-sm mt-1 leading-relaxed opacity-90">{res.state === "confirmed" && isTest ? "Це тестовий режим без реальних грошей. Він не є оплатою чи гарантією бронювання, готель перевіряє його вручну." : st.body}</p>
            <p className="text-[11px] mt-2 opacity-70">Стан оновлюється автоматично кожні 10 секунд{q.dataUpdatedAt ? ` · перевірено ${new Date(q.dataUpdatedAt).toLocaleTimeString("uk-UA")}` : ""}. Повернення зі сторінки банку саме по собі не означає оплату.</p>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <BedDouble className="w-5 h-5 text-stone-500 mt-0.5" aria-hidden />
            <div><p className="font-medium" data-testid="text-guest-servio-category">{res.categoryName}</p><p className="text-sm text-stone-600">Тариф: {res.rateName}</p></div>
          </div>
          <span className={`text-[11px] font-mono rounded-full border px-2.5 py-1 ${isTest ? "border-violet-300 bg-violet-50 text-violet-900" : "border-stone-900 bg-stone-900 text-[#fbfaf7]"}`} data-testid="text-guest-servio-mode">
            {isTest ? "Тестовий режим · без реальних грошей" : "Реальна оплата"}
          </span>
        </div>
        <dl className="mt-5 grid sm:grid-cols-2 gap-4 text-sm">
          <div className="flex gap-3"><CalendarDays className="w-4 h-4 text-stone-500 mt-0.5" aria-hidden /><div><dt className="text-xs text-stone-500">Заїзд</dt><dd>{fmtDate(res.checkIn)}</dd></div></div>
          <div className="flex gap-3"><CalendarDays className="w-4 h-4 text-stone-500 mt-0.5" aria-hidden /><div><dt className="text-xs text-stone-500">Виїзд</dt><dd>{fmtDate(res.checkOut)}</dd></div></div>
          <div className="flex gap-3"><CreditCard className="w-4 h-4 text-stone-500 mt-0.5" aria-hidden /><div><dt className="text-xs text-stone-500">Рахунок</dt><dd className="font-mono">{res.account ?? "ще не сформовано"}</dd></div></div>
          <div className="flex gap-3"><Clock className="w-4 h-4 text-stone-500 mt-0.5" aria-hidden /><div><dt className="text-xs text-stone-500">Посилання діє до</dt><dd>{fmtDateTime(view.accessExpiresAt)}</dd><p className="text-[11px] text-stone-500 mt-0.5">Це строк доступу до сторінки, а не утримання номера чи строк оплати.</p></div></div>
        </dl>
        <div className="mt-6 border-t border-stone-200 pt-5">
          <p className="text-xs text-stone-500">Фінальна сума до сплати · 100% передоплата</p>
          <p className="text-3xl md:text-4xl font-semibold font-mono tracking-tight mt-1" data-testid="guest-servio-amount">{res.total !== null ? money(res.total, res.currency) : "ще не визначено"}</p>
        </div>
      </section>

      {(view.terms.trim() || view.privacy.trim()) && (
        <section className="mt-4 grid md:grid-cols-2 gap-4">
          {[["Умови готелю", view.terms], ["Політика конфіденційності", view.privacy]].map(([t, body]) => (
            <details key={t} className="rounded-2xl border border-stone-200 bg-white p-5 group">
              <summary className="cursor-pointer font-medium text-sm">{t}</summary>
              <div className="mt-3 max-h-64 overflow-y-auto text-xs text-stone-700 whitespace-pre-wrap leading-relaxed">{body || "Не надано."}</div>
            </details>
          ))}
        </section>
      )}

      {payable && (
        <section className="mt-4 rounded-2xl border-2 bg-white p-5 md:p-6 space-y-3" style={{ borderColor: ACCENT }}>
          {!hasLegal && <p role="alert" className="text-sm text-red-800">Готель не надав повні умови або політику. Оплата недоступна, зверніться до готелю.</p>}
          {[
            { id: "terms", v: agreeTerms, set: setAgreeTerms, tid: "guest-servio-consent-terms", body: <span>Я ознайомився(-лася) з умовами готелю та політикою конфіденційності й погоджуюся з ними.</span> },
            { id: "nr", v: agreeNr, set: setAgreeNr, tid: "guest-servio-consent-nonrefundable", body: (
              <span>
                <span className="block whitespace-pre-wrap">{res.acknowledgementText}</span>
                <span className="block mt-1.5 font-medium">Сума до сплати: {res.total !== null ? money(res.total, res.currency) : ""}. Без повернення коштів і без зміни дат, окрім випадків, прямо передбачених законом.</span>
                <span className="block font-mono text-[10px] text-stone-400 mt-1">політика {res.policyVersion}</span>
              </span>
            ) },
          ].map((c) => (
            <label key={c.id} htmlFor={`guest-servio-${c.id}`} className={`flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed cursor-pointer ${c.v ? "border-stone-900" : "border-stone-300"} ${busy || !hasLegal ? "opacity-60 cursor-not-allowed" : ""}`}>
              <input id={`guest-servio-${c.id}`} data-testid={c.tid} type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-stone-900"
                checked={c.v} disabled={busy || !hasLegal} onChange={(e) => c.set(e.target.checked)} />
              {c.body}
            </label>
          ))}
          <button type="button" data-testid="button-guest-servio-pay" disabled={!canSubmit} onClick={pay}
            className="w-full h-14 rounded-xl text-white font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            style={{ background: ACCENT }}>
            {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <Lock className="w-4 h-4" aria-hidden />}
            {redirecting ? "Переходимо до LiqPay" : res.state === "awaiting_payment" ? "Продовжити оплату" : `Сплатити ${res.total !== null ? money(res.total, res.currency) : ""}`}
          </button>
          {!fresh && !stale && <p className="text-xs text-stone-600" role="status">Чекаємо на свіжий стан перед повторною спробою.</p>}
          <p className="text-[11px] text-stone-500">Ця дія не створює нове бронювання. Оплата відбувається на захищеній сторінці LiqPay у цій вкладці.{isTest ? " Тестовий режим: реальні гроші не списуються." : ""}</p>
        </section>
      )}

      {err && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</p>}

      <p className="mt-8 text-xs text-stone-500 leading-relaxed">Не пересилайте це посилання: воно дає доступ до перегляду й оплати лише цього бронювання. Питання щодо бронювання: {view.phone || view.email ? <>{view.phone}{view.phone && view.email ? " · " : ""}{view.email}</> : "зверніться до готелю"}.</p>
    </Shell>
  );
}
