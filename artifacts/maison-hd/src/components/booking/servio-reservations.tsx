import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListBookingServioReservations, getListBookingServioReservationsQueryKey,
  useCreateBookingServioReservation, useCheckoutBookingServioReservation, useCancelBookingServioReservation,
  useGetBookingEngineSettings, getGetBookingEngineSettingsQueryKey,
  useIssueBookingServioGuestLink,
} from "@workspace/api-client-react";
import type { BookingServioPreflightInput, BookingServioReservation, BookingServioPreflightCheck } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { absoluteGuestUrl } from "@/lib/servio-guest-payment";
import { AlertTriangle, BookOpen, Copy, Link2, ExternalLink, Inbox, Loader2, Lock, RefreshCw, ShieldAlert, XCircle } from "lucide-react";

/* ---------- shared helpers ---------- */

export const SERVIO_GATING_CODES = new Set([
  "servio_seller_assignment", "reservation_workflow", "payment_confirmation", "controlled_test", "live_mode",
]);
export const servioBaseChecksPass = (checks: BookingServioPreflightCheck[]) =>
  checks.length > 0 && checks.filter(c => !SERVIO_GATING_CODES.has(c.code)).every(c => c.status === "passed");

const ACTIVE = new Set(["creating", "billing", "bill_ready", "awaiting_payment", "expiring", "confirming", "review", "cancelling"]);
const UNCERTAIN = new Set(["creating", "billing", "expiring", "confirming", "review", "cancelling"]);

const STATE: Record<string, { label: string; c: string }> = {
  creating: { label: "Створюється в Servio", c: "bg-amber-50 text-amber-900 border-amber-200" },
  billing: { label: "Формується рахунок", c: "bg-amber-50 text-amber-900 border-amber-200" },
  bill_ready: { label: "Рахунок готовий", c: "bg-sky-50 text-sky-900 border-sky-200" },
  awaiting_payment: { label: "Очікує оплату", c: "bg-sky-50 text-sky-900 border-sky-200" },
  expiring: { label: "Строк оплати минув, перевірка", c: "bg-orange-50 text-orange-900 border-orange-300" },
  confirming: { label: "Перевірка оплати", c: "bg-amber-50 text-amber-900 border-amber-200" },
  confirmed: { label: "Підтверджено (live)", c: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  review: { label: "Ручна перевірка", c: "bg-orange-50 text-orange-900 border-orange-300" },
  failed: { label: "Помилка", c: "bg-red-50 text-red-800 border-red-200" },
  cancelling: { label: "Скасовується", c: "bg-stone-100 text-stone-700 border-stone-300" },
  cancelled: { label: "Скасовано", c: "bg-stone-100 text-stone-600 border-stone-200" },
};

const fmtDate = (s: string) => {
  const t = Date.parse(s.slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("uk-UA", { timeZone: "UTC" }) : s;
};
const fmtMoney = (n: number, cur: string) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(n) + " " + cur;
const safeErr = (e: unknown, fb: string) => {
  const d = (e as { data?: { error?: unknown; message?: unknown } })?.data;
  const m = typeof d?.error === "string" ? d.error : typeof d?.message === "string" ? d.message : "";
  return m && m.length < 400 ? m : fb;
};
const httpStatus = (e: unknown) => {
  const s = (e as { status?: unknown })?.status;
  return typeof s === "number" ? s : null;
};
export const isLiqpayCheckoutUrl = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && x.hostname === "www.liqpay.ua" && x.pathname.replace(/\/$/, "") === "/api/3/checkout" && !x.username && !x.password;
  } catch { return false; }
};
const uuid = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

export function useServioReservationList(organizationId: number | null, enabled = true) {
  const queryKey = useMemo(() => [...getListBookingServioReservationsQueryKey(), organizationId], [organizationId]);
  const q = useListBookingServioReservations({
    query: { queryKey, enabled: organizationId != null && enabled, refetchInterval: 10000, refetchIntervalInBackground: false },
  });
  return { ...q, listKey: queryKey };
}

function useInvalidateServio() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: getListBookingServioReservationsQueryKey() });
}

function Consent({ id, testId, checked, onChange, disabled, children }: {
  id: string; testId: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className={`flex gap-3 rounded-lg border px-3 py-2.5 text-xs leading-relaxed cursor-pointer transition-colors ${checked ? "border-stone-900 bg-white" : "border-stone-300 bg-white/60 hover:border-stone-500"} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}>
      <input id={id} data-testid={testId} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-stone-900" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="text-stone-800">{children}</span>
    </label>
  );
}

/* ---------- creator (mounted in preflight) ---------- */

export function ServioReservationCreate({ organizationId, input, expectedTotal, currency, policyVersion, acknowledgementText, testKeys }: {
  organizationId: number | null; input: BookingServioPreflightInput; expectedTotal: number; currency: string | null;
  policyVersion: string; acknowledgementText: string; testKeys: boolean;
}) {
  const list = useServioReservationList(organizationId);
  const invalidate = useInvalidateServio();
  const create = useCreateBookingServioReservation();
  const settingsKey = useMemo(() => [...getGetBookingEngineSettingsQueryKey(), organizationId], [organizationId]);
  const settings = useGetBookingEngineSettings({ query: { queryKey: settingsKey, enabled: organizationId != null } });
  const cfg = (settings.data?.config ?? {}) as Record<string, unknown>;
  const terms = typeof cfg.terms === "string" ? cfg.terms.trim() : "";
  const privacy = typeof cfg.privacy === "string" ? cfg.privacy.trim() : "";

  const selSig = useMemo(() => hash(JSON.stringify([organizationId, input, expectedTotal, policyVersion])), [organizationId, input, expectedTotal, policyVersion]);
  const storeKey = `maison:servio-res-request:${organizationId ?? "none"}:${selSig}`;
  const [requestId, setRequestId] = useState<string>(() => {
    try { const v = sessionStorage.getItem(storeKey); if (v && /^[0-9a-f-]{36}$/i.test(v)) return v; } catch { /* storage unavailable */ }
    const n = uuid();
    try { sessionStorage.setItem(storeKey, n); } catch { /* storage unavailable */ }
    return n;
  });

  const [firstName, setFirst] = useState(""); const [lastName, setLast] = useState("");
  const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [agreeTerms, setTerms] = useState(false); const [agreeNR, setNR] = useState(false); const [authorize, setAuth] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<{ msg: string; frozen: boolean } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const inflight = useRef(false);

  const rows = list.data ?? [];
  const mine = rows.find(r => r.requestId === requestId) ?? null;
  const others = rows.filter(r => r.requestId !== requestId && ACTIVE.has(r.state));

  const phoneOk = /^[+0-9()\-\s]{7,30}$/.test(phone.trim());
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const fieldsOk = firstName.trim().length >= 1 && firstName.trim().length <= 50 && lastName.trim().length >= 1 && lastName.trim().length <= 50 && phoneOk && emailOk && email.trim().length <= 200;
  const legalReady = !!terms && !!privacy;
  const ready = fieldsOk && agreeTerms && agreeNR && authorize && legalReady && expectedTotal > 0 && !mine && !error?.frozen && !create.isPending && list.isSuccess;

  const submit = () => {
    if (!ready || inflight.current) return;
    inflight.current = true; setError(null); setConfirmOpen(false);
    create.mutate({
      data: {
        ...input, requestId, firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), email: email.trim(),
        expectedTotal, authorizeProviderWrite: authorize, agreeTerms, agreeNonRefundable: agreeNR, tariffPolicyVersion: policyVersion,
      },
    }, {
      onSuccess: () => { setFirst(""); setLast(""); setPhone(""); setEmail(""); invalidate(); list.refetch(); },
      onError: (e) => {
        const s = httpStatus(e);
        const definite = s === 400 || s === 401 || s === 403 || s === 422;
        setError({
          frozen: !definite,
          msg: definite
            ? safeErr(e, "Сервер відхилив запит до звернення в Servio. Виправте дані й повторіть.")
            : "Результат невідомий: спроба могла бути записана в Servio. Спершу перевірте журнал нижче. Нова відправка заблокована, доки статус цієї спроби не з'ясовано.",
        });
        invalidate();
      },
      onSettled: () => { inflight.current = false; },
    });
  };

  const verify = async () => {
    setVerifying(true);
    const r = await list.refetch();
    setVerifying(false);
    if (r.isSuccess && !(r.data ?? []).some(x => x.requestId === requestId)) {
      setError({ frozen: false, msg: "Спробу не знайдено серед останніх записів журналу. Повторний запит використає той самий ідентифікатор для захисту від дублювання; не створюйте нову спробу навмання." });
    }
  };

  const restart = () => {
    const n = uuid();
    try { sessionStorage.setItem(storeKey, n); } catch { /* storage unavailable */ }
    setRequestId(n); setError(null); setTerms(false); setNR(false); setAuth(false);
  };

  const dis = create.isPending || !!mine || !!error?.frozen;

  return (
    <div className="mt-4 rounded-xl border-2 border-red-300 bg-[#fff8f4]" data-testid="servio-reservation-create">
      <div className="px-4 py-3 border-b border-red-200 flex gap-2.5">
        <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-red-700">Контрольний запис · не публічний продаж</p>
          <p className="text-sm font-semibold text-stone-900 mt-0.5">Створення реального бронювання в Servio</p>
          <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
            Перевірка вище лише читала дані. Ця окрема дія записує в Servio: створює бронювання (AddRoomReservation) і рахунок (SetReservationBill).
            {testKeys && <b className="text-red-800"> Навіть із тестовими ключами LiqPay (sandbox) у Servio буде створене справжнє бронювання.</b>}
            {" "}Публічні продажі залишаються вимкненими; фіскалізація та еквайринг запускаються окремо.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-stone-400">Сума за доступністю (попередня)</p>
          <p className="text-xl font-semibold font-mono text-stone-900" data-testid="text-servio-create-expected">{fmtMoney(expectedTotal, currency ?? "")}</p>
          <p className="text-[11px] text-stone-500">Підсумковий рахунок Servio може відрізнятися. Перед оплатою знадобиться нова окрема згода біля фінальної суми.</p>
        </div>

        {mine ? (
          <div role="status" className="rounded-lg border border-stone-300 bg-white px-3 py-3 text-sm space-y-1" data-testid="text-servio-create-done">
            <p className="font-medium text-stone-900">Спробу зафіксовано: {STATE[mine.state]?.label ?? mine.state}</p>
            <p className="text-xs text-stone-600">{mine.message}</p>
            <p className="text-xs text-stone-600">Подальші дії — лише в журналі Servio-бронювань у студії. Повторне створення для цього вибору недоступне.</p>
          </div>
        ) : (
          <>
            {others.length > 0 && (
              <p className="text-xs text-amber-900 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                У журналі є {others.length} незавершен{others.length === 1 ? "а спроба" : "і спроби"}. Перевірте журнал перед створенням іншого бронювання.
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              {([
                ["first", "Ім'я гостя", firstName, setFirst, "text", "given-name", 50],
                ["last", "Прізвище гостя", lastName, setLast, "text", "family-name", 50],
                ["phone", "Телефон", phone, setPhone, "tel", "tel", 30],
                ["email", "Email", email, setEmail, "email", "email", 200],
              ] as const).map(([k, l, v, fn, t, ac, max]) => (
                <div key={k} className="space-y-1">
                  <Label htmlFor={`servio-res-${k}`} className="text-xs text-stone-600">{l}</Label>
                  <Input id={`servio-res-${k}`} data-testid={`input-servio-res-${k}`} type={t} autoComplete={ac} maxLength={max}
                    value={v} disabled={dis} onChange={e => fn(e.target.value)} className="bg-white" />
                </div>
              ))}
            </div>
            {phone && !phoneOk && <p className="text-[11px] text-red-700">Телефон: 7–30 символів, цифри, +, пробіли, дужки.</p>}
            {!emailOk && <p className="text-[11px] text-red-700">Перевірте email.</p>}

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Три окремі обов'язкові згоди</p>
              {settings.isLoading ? <div className="h-16 rounded-lg bg-stone-100 animate-pulse" /> : settings.error ? (
                <div role="alert" className="text-xs text-red-700 flex items-center gap-2">Не вдалося завантажити умови готелю.
                  <Button size="sm" variant="outline" onClick={() => settings.refetch()}>Повторити</Button></div>
              ) : !legalReady ? (
                <p className="text-xs text-red-800 rounded-lg border border-red-200 bg-red-50 px-3 py-2">Умови бронювання та політику конфіденційності не заповнено. Збережіть їх у розділі «Правові тексти».</p>
              ) : (
                <details className="rounded-lg border border-stone-200 bg-white text-xs">
                  <summary className="cursor-pointer px-3 py-2 font-medium text-stone-700 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" />Умови готелю та конфіденційність</summary>
                  <div className="px-3 pb-3 max-h-56 overflow-y-auto space-y-2 text-stone-700 whitespace-pre-wrap" data-testid="text-servio-res-terms">
                    {terms && <div><p className="font-medium text-stone-900">Умови бронювання</p>{terms}</div>}
                    {privacy && <div><p className="font-medium text-stone-900">Конфіденційність</p>{privacy}</div>}
                  </div>
                </details>
              )}
              <Consent id="servio-res-terms" testId="checkbox-servio-agree-terms" checked={agreeTerms} onChange={setTerms} disabled={dis || !legalReady}>
                Гість ознайомився та погоджується з умовами бронювання і політикою конфіденційності готелю.
              </Consent>
              <Consent id="servio-res-nr" testId="checkbox-servio-agree-nonrefundable" checked={agreeNR} onChange={setNR} disabled={dis}>
                <span className="block whitespace-pre-wrap">{acknowledgementText}</span>
                <span className="block mt-1 font-mono text-[10px] text-stone-400">політика {policyVersion}</span>
              </Consent>
              <Consent id="servio-res-auth" testId="checkbox-servio-authorize-write" checked={authorize} onChange={setAuth} disabled={dis}>
                <b>Я дозволяю створити одне РЕАЛЬНЕ бронювання в Servio</b> і обираю продавця цього об'єкта юридичним продавцем саме для цього бронювання. Це не постійне призначення продавця.
              </Consent>
            </div>

            <div aria-live="polite">
              {error && (
                <div role="alert" className={`rounded-lg border px-3 py-2.5 text-xs space-y-2 ${error.frozen ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900"}`} data-testid="text-servio-create-error">
                  <p>{error.msg}</p>
                  {error.frozen && (
                    <Button size="sm" variant="outline" onClick={verify} disabled={verifying} data-testid="button-servio-verify-attempt">
                      {verifying ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}Перевірити журнал
                    </Button>
                  )}
                </div>
              )}
            </div>

            <Button type="button" data-testid="button-create-servio-reservation" disabled={!ready}
              onClick={() => setConfirmOpen(true)} className="w-full sm:w-auto bg-red-800 hover:bg-red-900 text-[#fff8f4]">
              {create.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
              {create.isPending ? "Створюємо в Servio…" : "Створити контрольне бронювання в Servio"}
            </Button>
            {!list.isSuccess && <p className="text-[11px] text-stone-500">Очікуємо журнал спроб, щоб уникнути дубля.</p>}
            <button type="button" onClick={restart} disabled={dis} className="block text-[11px] text-stone-500 underline underline-offset-2 disabled:opacity-50" data-testid="button-servio-reset-consents">
              Скинути згоди та почати нову спробу
            </button>
          </>
        )}
        <p className="text-[11px] text-stone-500 font-mono">Ідентифікатор запиту {requestId.slice(0, 8)}… зберігається лише в цій вкладці.</p>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Записати бронювання в Servio?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Буде створено одне реальне бронювання й рахунок у Servio на {fmtDate(input.checkIn)} – {fmtDate(input.checkOut)}, попередньо {fmtMoney(expectedTotal, currency ?? "")}.</p>
                <p>Невідомі результати не повторюються автоматично. Неоплачене бронювання в Servio автоматично не скасовується.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Назад</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-servio-reservation" className="bg-red-800 hover:bg-red-900" onClick={submit}>Створити в Servio</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------- journal (mounted in studio) ---------- */

export function ServioReservationJournal({ organizationId }: { organizationId: number | null }) {
  const list = useServioReservationList(organizationId);
  const rows = list.data ?? [];
  return (
    <div className="mt-5 rounded-xl border border-stone-200 bg-white" data-testid="servio-reservation-journal">
      <div className="px-4 py-3 border-b border-stone-200 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-stone-900">Журнал контрольних бронювань Servio</p>
          <p className="text-[11px] text-stone-500 mt-0.5">Останні 50 спроб · оновлюється кожні 10 с · публічні продажі вимкнені</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => list.refetch()} disabled={list.isFetching} data-testid="button-refresh-servio-journal">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${list.isFetching ? "animate-spin" : ""}`} />Оновити
        </Button>
      </div>
      <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 space-y-1">
        <p><b>Неоплачене бронювання в Servio не спливає й не скасовується автоматично.</b> Рахунок не оновлюється сервером. Перевіряйте журнал і закривайте утримання вручну.</p>
        <p>Стани з невизначеним результатом потребують ручної звірки в Servio та LiqPay; повтори й записи для них недоступні. Фіскалізація й еквайринг вмикаються окремо.</p>
      </div>
      {list.isLoading ? (
        <div className="p-4 space-y-2"><div className="h-20 rounded-lg bg-stone-100 animate-pulse" /><div className="h-20 rounded-lg bg-stone-100 animate-pulse" /></div>
      ) : list.error ? (
        <div role="alert" className="p-4 text-sm text-red-700 flex flex-wrap items-center gap-2">{safeErr(list.error, "Не вдалося завантажити журнал.")}
          <Button size="sm" variant="outline" onClick={() => list.refetch()}>Повторити</Button></div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-stone-400"><Inbox className="w-7 h-7 mx-auto mb-2" /><p className="text-sm">Контрольних бронювань ще немає</p>
          <p className="text-[11px] mt-1">Створіть одне через перевірку доступності вище.</p></div>
      ) : (
        <ul className="divide-y divide-stone-100">{rows.map(r => <JournalRow key={r.id} r={r} />)}</ul>
      )}
    </div>
  );
}

function JournalRow({ r }: { r: BookingServioReservation }) {
  const invalidate = useInvalidateServio();
  const checkout = useCheckoutBookingServioReservation();
  const cancel = useCancelBookingServioReservation();
  const [consent, setConsent] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const issueGuest = useIssueBookingServioGuestLink();
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestAuth, setGuestAuth] = useState(false);
  const [guestLink, setGuestLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [guestErr, setGuestErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const guestOk = r.state === "bill_ready" || r.state === "awaiting_payment";
  useEffect(() => { if (!guestOk) { setGuestLink(null); setGuestOpen(false); setGuestAuth(false); } }, [guestOk]);
  const canIssueGuest = guestOk && (r.state === "bill_ready" || r.hasGuestAccess === true) && r.total !== null && r.total > 0;
  const doIssueGuest = () => {
    if (!canIssueGuest || !guestAuth || issueGuest.isPending) return;
    setGuestErr(null);
    issueGuest.mutate({ id: r.id, data: { authorizeGuestAccess: true } }, {
      onSuccess: (res) => { setGuestOpen(false); setGuestAuth(false); if (res.reservationId === r.id && res.url) { setGuestLink({ url: absoluteGuestUrl(res.url), expiresAt: res.expiresAt }); invalidate(); } else setGuestErr("Сервер повернув неочікувану відповідь."); },
      onError: (e) => { setGuestOpen(false); setGuestAuth(false); setGuestErr(safeErr(e, "Не вдалося створити приватне посилання.")); invalidate(); },
    });
  };
  const copyGuest = async () => {
    if (!guestLink) return;
    try { await navigator.clipboard.writeText(guestLink.url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setGuestErr("Не вдалося скопіювати. Виділіть посилання вручну."); }
  };
  const st = STATE[r.state] ?? { label: r.state, c: "bg-stone-100 text-stone-700 border-stone-200" };
  const canPay = (r.state === "bill_ready" || r.state === "awaiting_payment") && r.total !== null && r.total > 0;
  const canCancel = r.state === "bill_ready" && !link;
  const busy = checkout.isPending || cancel.isPending;
  const consentKey = `${r.total}:${r.policyVersion}:${r.state}`;
  const prevKey = useRef(consentKey);
  useEffect(() => { if (prevKey.current !== consentKey) { prevKey.current = consentKey; setConsent(false); } }, [consentKey]);

  const doCheckout = () => {
    if (!canPay || !consent || busy || r.total === null) return;
    setErr(null);
    checkout.mutate({ id: r.id, data: { expectedTotal: r.total, agreeNonRefundable: true, tariffPolicyVersion: r.policyVersion } }, {
      onSuccess: (res) => {
        if (isLiqpayCheckoutUrl(res.url)) setLink(res.url);
        else setErr("Сервер повернув неочікувану адресу оплати. Посилання не відкрито.");
        setConsent(false); invalidate();
      },
      onError: (e) => { setErr(safeErr(e, "Не вдалося отримати посилання на оплату. Перевірте стан у журналі.")); setConsent(false); invalidate(); },
    });
  };
  const doCancel = () => {
    if (!canCancel || busy) return;
    setErr(null); setCancelOpen(false);
    cancel.mutate({ id: r.id }, {
      onSuccess: () => invalidate(),
      onError: (e) => { setErr(safeErr(e, "Скасування не підтверджено. Перевірте стан у Servio.")); invalidate(); },
    });
  };

  return (
    <li className="px-4 py-4" data-testid={`row-servio-reservation-${r.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-900">{r.categoryName} · {r.rateName}</p>
          <p className="text-xs text-stone-600">{fmtDate(r.checkIn)} – {fmtDate(r.checkOut)} · рахунок <span className="font-mono">{r.account ?? "ще немає"}</span></p>
          <p className="text-[11px] text-stone-400 font-mono">створено {new Date(r.createdAt).toLocaleString("uk-UA")} · оновлено {new Date(r.updatedAt).toLocaleString("uk-UA")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`text-[11px] font-medium rounded-full border px-2 py-0.5 ${st.c}`} data-testid={`status-servio-reservation-${r.id}`}>{st.label}</span>
          <span className={`text-[11px] font-mono rounded-full border px-2 py-0.5 ${r.mode === "test" ? "border-violet-300 bg-violet-50 text-violet-900" : "border-stone-900 bg-stone-900 text-[#fbfaf7]"}`}>
            {r.mode === "test" ? "LiqPay sandbox" : "LiqPay live"}
          </span>
        </div>
      </div>
      <p className="text-xs text-stone-700 mt-2">{r.message}</p>

      {r.mode === "test" && (
        <p className="text-[11px] text-violet-900 mt-1.5">Тестові ключі: реальні гроші не списуються, але бронювання в Servio справжнє. Тестова оплата веде лише до ручної перевірки й не є оплатою чи гарантією Servio.</p>
      )}
      {UNCERTAIN.has(r.state) && (
        <p className="text-[11px] text-orange-900 mt-1.5 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />Потрібна ручна звірка в Servio{r.state !== "creating" && r.state !== "billing" ? " і LiqPay" : ""}. Автоматичних повторів немає.</p>
      )}
      {r.state === "confirmed" && r.mode === "live" && <p className="text-[11px] text-emerald-800 mt-1.5">Підтверджено підписаним зворотним викликом LiqPay.</p>}
      {["confirmed", "review"].includes(r.state) && r.notifications && (
        <div className="text-[11px] mt-2 space-y-1" data-testid={`reservation-mail-${r.id}`}>
          {(r.state === "confirmed" ? ["guest", "admin"] : ["review"]).map(kind => (
            <p key={kind} className={r.notifications?.[kind] === "sent" ? "text-emerald-800" : "text-amber-800"}>
              {kind === "guest" ? "Лист гостю" : "Лист адміністраторам"}: {
                r.notifications?.[kind] === "sent" ? "відправлено" :
                r.notifications?.[kind] === "failed" ? "помилка відправлення, очікує повтору" :
                r.notifications?.[kind] === "sending" ? "відправляється" : "у черзі"}
            </p>
          ))}
        </div>
      )}

      {canPay && (
        <div className="mt-3 rounded-lg border border-stone-300 bg-[#fbfaf7] p-3 space-y-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Фінальна сума рахунку Servio</p>
            <p className="text-2xl font-semibold font-mono text-stone-900" data-testid={`text-servio-final-total-${r.id}`}>{fmtMoney(r.total!, r.currency)}</p>
            <p className="text-[11px] text-stone-500">Може відрізнятися від суми доступності. Згода нижче стосується лише цієї суми.</p>
          </div>
          <Consent id={`servio-final-${r.id}`} testId={`input-servio-final-consent-${r.id}`} checked={consent} onChange={setConsent} disabled={busy}>
            <span className="block whitespace-pre-wrap">{r.acknowledgementText}</span>
            <span className="block mt-1 font-medium">Сума до сплати: {fmtMoney(r.total!, r.currency)}. <span className="font-mono text-[10px] text-stone-400">політика {r.policyVersion}</span></span>
          </Consent>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" data-testid={`button-servio-checkout-${r.id}`} disabled={!consent || busy} onClick={doCheckout}>
              {checkout.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              {r.state === "awaiting_payment" ? "Отримати посилання повторно" : "Отримати посилання на оплату"}
            </Button>
            {link && (
              <Button size="sm" variant="outline" data-testid={`button-servio-open-liqpay-${r.id}`}
                onClick={() => { if (isLiqpayCheckoutUrl(link)) window.open(link, "_blank", "noopener,noreferrer"); }}>
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Відкрити LiqPay
              </Button>
            )}
          </div>
          <p className="text-[11px] text-stone-500">Повернення зі сторінки LiqPay не означає оплату. Статус змінює лише підписаний зворотний виклик.</p>
        </div>
      )}

      {(canIssueGuest || (guestOk && guestLink)) && (
        <div className="mt-3 rounded-lg border border-dashed border-stone-300 p-3 space-y-2">
          {canIssueGuest && (
            <Button size="sm" variant="outline" data-testid={`button-servio-guest-link-${r.id}`} disabled={issueGuest.isPending} onClick={() => { setGuestAuth(false); setGuestOpen(true); }}>
              {issueGuest.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5 mr-1.5" />}{r.hasGuestAccess ? "Отримати приватне посилання повторно" : "Створити приватне посилання для гостя"}
            </Button>
          )}
          {guestLink && (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <Input readOnly value={guestLink.url} aria-label="Приватне посилання для гостя" className="font-mono text-xs" data-testid={`servio-guest-link-${r.id}`} onFocus={e => e.currentTarget.select()} />
                <Button size="sm" variant="outline" data-testid={`button-copy-servio-guest-link-${r.id}`} onClick={copyGuest}><Copy className="w-3.5 h-3.5 mr-1.5" />{copied ? "Скопійовано" : "Копіювати"}</Button>
              </div>
              <p className="text-[11px] text-stone-500">Доступ діє до {new Date(guestLink.expiresAt).toLocaleString("uk-UA")} (24 год). Це строк доступу до сторінки, а не утримання номера чи строк оплати. Надсилайте лише гостю цього бронювання.</p>
            </div>
          )}
          {guestErr && <p role="alert" className="text-xs text-red-700">{guestErr}</p>}
        </div>
      )}

      {canCancel && (
        <Button size="sm" variant="ghost" className="mt-2 text-red-800 hover:bg-red-50" data-testid={`button-servio-cancel-${r.id}`} disabled={busy} onClick={() => setCancelOpen(true)}>
          {cancel.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5 mr-1.5" />}Скасувати в Servio
        </Button>
      )}
      {err && <p role="alert" className="mt-2 text-xs text-red-700">{err}</p>}

      <AlertDialog open={guestOpen} onOpenChange={(o) => { setGuestOpen(o); if (!o) setGuestAuth(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Створити приватне посилання для гостя?</AlertDialogTitle>
            <AlertDialogDescription>
              Будь-хто з цим посиланням зможе переглянути й оплатити лише це бронювання ({r.categoryName}, {fmtDate(r.checkIn)} – {fmtDate(r.checkOut)}). Це не відкриває самостійні продажі, не створює нового бронювання і не звертається до банку. Повторне створення поверне те саме чинне посилання. Доступ діє 24 години.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Consent id={`servio-guest-auth-${r.id}`} testId={`input-servio-guest-auth-${r.id}`} checked={guestAuth} onChange={setGuestAuth} disabled={issueGuest.isPending}>
            Я дозволяю видати гостю посилання на перегляд і оплату цього бронювання.
          </Consent>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction disabled={!guestAuth || issueGuest.isPending} data-testid={`button-confirm-servio-guest-link-${r.id}`} onClick={(e) => { e.preventDefault(); doIssueGuest(); }}>Створити посилання</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Скасувати бронювання в Servio?</AlertDialogTitle>
            <AlertDialogDescription>Доступно лише до видачі посилання на оплату. Результат невизначеного скасування звіряється вручну.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Назад</AlertDialogCancel>
            <AlertDialogAction className="bg-red-800 hover:bg-red-900" onClick={doCancel}>Скасувати бронювання</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
