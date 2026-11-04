import { useEffect, useRef, useState } from "react";
import {
  useGetBookingServioStatus, useSearchBookingServioAvailability, getGetBookingServioStatusQueryKey,
} from "@workspace/api-client-react";
import type { BookingServioSearchInput, BookingServioSearchResult, BookingServioRate } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Plus, X, ChevronDown, ChevronRight } from "lucide-react";

const MAX_INT = 2147483647;
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parseDay = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(t) && iso(new Date(t)) === s ? t : null;
};
const intIn = (s: string, min: number, max: number): number | null => {
  const v = s.trim();
  if (!/^\d{1,10}$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
};
const fmtDate = (s: string) => { const t = parseDay(s); return t === null ? s : new Date(t).toLocaleDateString("uk-UA", { timeZone: "UTC" }); };
const fmtMoney = (n: number, cur: string | null) =>
  new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(n) + (cur ? ` ${cur}` : " (валюта невідома)");

type Draft = {
  checkIn: string; checkOut: string; adults: string; childAges: string[]; useExtraBed: boolean;
  companyId: string; companyCodeId: string; conditionId: string;
};

function initialDraft(): Draft {
  const now = Date.now();
  return {
    checkIn: iso(new Date(now + 7 * DAY)), checkOut: iso(new Date(now + 9 * DAY)), adults: "2", childAges: [],
    useExtraBed: false, companyId: "0", companyCodeId: "0", conditionId: "0",
  };
}

function validate(d: Draft): { input: BookingServioSearchInput | null; errors: string[] } {
  const errors: string[] = [];
  const a = parseDay(d.checkIn), b = parseDay(d.checkOut);
  if (a === null) errors.push("Вкажіть коректну дату заїзду.");
  if (b === null) errors.push("Вкажіть коректну дату виїзду.");
  if (a !== null && b !== null) {
    const nights = Math.round((b - a) / DAY);
    if (nights < 1) errors.push("Виїзд має бути щонайменше на 1 ніч пізніше заїзду.");
    else if (nights > 31) errors.push("Діагностика обмежена 31 ніччю.");
  }
  const adults = intIn(d.adults, 1, 20);
  if (adults === null) errors.push("Дорослих: ціле число від 1 до 20.");
  if (d.childAges.length > 10) errors.push("Не більше 10 дітей.");
  const ages = d.childAges.map(s => intIn(s, 0, 17));
  if (ages.some(x => x === null)) errors.push("Вік кожної дитини: ціле число від 0 до 17.");
  const companyId = intIn(d.companyId, 0, MAX_INT);
  const companyCodeId = intIn(d.companyCodeId, 0, MAX_INT);
  const conditionId = intIn(d.conditionId, 0, MAX_INT);
  if (companyId === null) errors.push("CompanyID: ціле невід’ємне число.");
  if (companyCodeId === null) errors.push("CompanyCodeID: ціле невід’ємне число.");
  if (conditionId === null) errors.push("ConditionID: ціле невід’ємне число.");
  if (companyId !== null && companyCodeId !== null && (companyId === 0) !== (companyCodeId === 0))
    errors.push("CompanyID і CompanyCodeID задаються разом: обидва додатні або обидва 0.");
  if (companyId === 0 && conditionId !== null && conditionId > 0)
    errors.push("Для окремої умови договору потрібні CompanyID і CompanyCodeID. Без компанії ConditionID має бути 0.");
  if (errors.length || adults === null || companyId === null || companyCodeId === null || conditionId === null) return { input: null, errors };
  return { input: {
    checkIn: d.checkIn, checkOut: d.checkOut, adults, childAges: ages as number[], useExtraBed: d.useExtraBed,
    companyId, companyCodeId, conditionId,
  }, errors };
}

function guests(q: BookingServioSearchInput) {
  const kids = q.childAges.length ? `, дітей ${q.childAges.length} (вік: ${q.childAges.join(", ")})` : ", без дітей";
  return `Дорослих ${q.adults}${kids}${q.useExtraBed ? ", з додатковим ліжком" : ""}`;
}

function RateRow({ rate, currency, partial, id }: { rate: BookingServioRate; currency: string | null; partial: boolean; id: string }) {
  const [open, setOpen] = useState(false);
  const sale = rate.saleAllowed === true ? { t: "Продаж дозволено Servio", c: "text-emerald-800 bg-emerald-50 border-emerald-200" }
    : rate.saleAllowed === false ? { t: "Продаж заблоковано", c: "text-red-800 bg-red-50 border-red-200" }
    : { t: "Обмеження не перевірено повністю", c: "text-amber-800 bg-amber-50 border-amber-200" };
  return (
    <li className="border-t border-stone-100 px-3 py-2" data-testid={`row-servio-rate-${id}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-1 font-medium text-stone-800 text-left" data-testid={`button-servio-rate-details-${id}`}>
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {rate.name || `Прайс #${rate.priceListId}`}
        </button>
        <span className="font-mono text-[10px] text-stone-400">PL {rate.priceListId} · Cond {rate.conditionId}</span>
        {rate.nonRefundable && <span className="rounded border border-stone-300 px-1.5 text-[10px]">Неповоротний</span>}
        {rate.specialRate && <span className="rounded border border-stone-300 px-1.5 text-[10px]">Спецтариф</span>}
        <span className={`rounded border px-1.5 text-[10px] ${sale.c}`}>{sale.t}</span>
        <span className="ml-auto font-mono text-sm text-stone-900">{partial ? "Ціна недоступна" : fmtMoney(rate.total, currency)}</span>
      </div>
      {rate.restrictions.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 pl-5 text-[11px]">
          {rate.restrictions.map((r, i) => (
            <li key={i} className={r.blocksSale ? "text-red-700" : "text-stone-600"}>
              <span className="font-mono text-[10px] mr-1">{r.code}</span>{r.message}{r.blocksSale ? " — блокує продаж" : ""}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-2 pl-5">
          {rate.charges.length === 0 ? <p className="text-[11px] text-stone-500">Servio не повернув розбивку нарахувань.</p> : (
            <table className="w-full text-[11px]">
              <thead><tr className="text-left text-stone-400"><th className="py-1 pr-2">Послуга</th><th className="pr-2">Дата</th><th className="text-right">Сума</th></tr></thead>
              <tbody>{rate.charges.map((c, i) => (
                <tr key={i} className="border-t border-stone-100">
                  <td className="py-1 pr-2">{c.serviceName || `#${c.serviceId}`} <span className="text-stone-400 font-mono">({c.serviceId})</span></td>
                  <td className="pr-2 whitespace-nowrap">{fmtDate(c.date.slice(0, 10))}</td>
                  <td className="text-right font-mono">{partial ? "—" : fmtMoney(c.amount, currency)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}

export function ServioAvailability({ organizationId, role, dirty, hasToken }: {
  organizationId: number | null; role: string | undefined; dirty: boolean; hasToken: boolean;
}) {
  const queryKey = [...getGetBookingServioStatusQueryKey(), organizationId];
  const status = useGetBookingServioStatus({ query: { queryKey, enabled: organizationId !== null, staleTime: 0 } });
  const search = useSearchBookingServioAvailability();
  const canRun = !!role && ["super_admin", "owner", "admin"].includes(role);

  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [advanced, setAdvanced] = useState(false);
  const [snap, setSnap] = useState<{ sig: string; data: BookingServioSearchResult } | null>(null);
  const [err, setErr] = useState<{ sig: string; msg: string } | null>(null);
  const gen = useRef(0);

  const connected = status.data?.status === "connected";
  const { input, errors } = validate(draft);
  const connSig = `${organizationId}|${hasToken}|${status.data?.status}|${status.data?.checkedAt}`;
  const sig = input ? JSON.stringify([connSig, input]) : "invalid";

  // Any change in form or saved connection invalidates in-flight requests and old snapshots.
  useEffect(() => { gen.current += 1; }, [sig, dirty]);
  useEffect(() => { if (dirty) { setSnap(null); setErr(null); } }, [dirty]);

  const result = snap && snap.sig === sig && !dirty ? snap.data : null;
  const shownErr = err && err.sig === sig && !dirty ? err.msg : null;
  const disabledReason = dirty ? "Збережіть налаштування перед перевіркою наявності."
    : !hasToken ? "Токен Servio не збережено."
    : status.isLoading ? null
    : !connected ? "Спершу успішно перевірте з’єднання Servio вище."
    : null;

  const run = () => {
    if (!input || disabledReason || search.isPending) return;
    const my = ++gen.current; const mySig = sig;
    setErr(null); setSnap(null);
    search.mutate({ data: input }, {
      onSuccess: data => { if (gen.current === my) setSnap({ sig: mySig, data }); },
      onError: e => {
        if (gen.current !== my) return;
        const d = (e as { data?: { error?: string; message?: string } })?.data;
        setErr({ sig: mySig, msg: d?.error || d?.message || "Не вдалося отримати наявність. Спробуйте ще раз." });
      },
    });
  };

  const upd = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }));
  const pendingCurrent = search.isPending && !dirty;
  const showResultSlot = result || (snap && !result);

  return (
    <div className="mt-4 rounded-xl border border-stone-200 bg-white" data-testid="servio-availability">
      <div className="px-4 py-3 border-b border-stone-100">
        <p className="text-sm font-medium text-stone-900">Діагностика наявності й тарифів Servio</p>
        <p className="text-xs text-stone-500 mt-0.5">Лише читання. Бронювання, рахунки й оплати не створюються, продажі залишаються заблокованими, номери не утримуються — кількість вільних може змінитися будь-якої миті.</p>
      </div>

      {canRun && (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1"><Label className="text-xs text-stone-600">Заїзд</Label>
              <Input type="date" data-testid="input-servio-check-in" value={draft.checkIn} onChange={e => upd("checkIn", e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs text-stone-600">Виїзд</Label>
              <Input type="date" data-testid="input-servio-check-out" value={draft.checkOut} onChange={e => upd("checkOut", e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs text-stone-600">Дорослих (1–20)</Label>
              <Input inputMode="numeric" data-testid="input-servio-adults" value={draft.adults} onChange={e => upd("adults", e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm text-stone-700 self-end pb-2">
              <input type="checkbox" data-testid="checkbox-servio-extra-bed" checked={draft.useExtraBed} onChange={e => upd("useExtraBed", e.target.checked)} />
              Додаткове ліжко
            </label>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-stone-600">Діти: {draft.childAges.length} (вік 0–17)</Label>
              <Button type="button" size="sm" variant="ghost" className="h-7" data-testid="button-servio-add-child"
                disabled={draft.childAges.length >= 10} onClick={() => upd("childAges", [...draft.childAges, ""])}>
                <Plus className="w-3.5 h-3.5 mr-1" />Дитина
              </Button>
            </div>
            {draft.childAges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {draft.childAges.map((age, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input inputMode="numeric" className="w-16 h-8" aria-label={`Вік дитини ${i + 1}`} data-testid={`input-servio-child-age-${i}`}
                      value={age} onChange={e => upd("childAges", draft.childAges.map((a, j) => j === i ? e.target.value : a))} />
                    <button type="button" className="text-stone-400 hover:text-stone-700" aria-label="Прибрати" data-testid={`button-servio-remove-child-${i}`}
                      onClick={() => upd("childAges", draft.childAges.filter((_, j) => j !== i))}><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="button" className="text-xs text-stone-600 flex items-center gap-1" data-testid="button-servio-advanced" onClick={() => setAdvanced(a => !a)}>
            {advanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}Розширено: компанія та умови тарифу
          </button>
          {advanced && (
            <div className="grid md:grid-cols-3 gap-3">
              {([["companyId", "CompanyID"], ["companyCodeId", "CompanyCodeID"], ["conditionId", "ConditionID"]] as const).map(([k, l]) => (
                <div key={k} className="space-y-1"><Label className="text-xs text-stone-600">{l}</Label>
                  <Input inputMode="numeric" className="font-mono" data-testid={`input-servio-${k}`} value={draft[k]} onChange={e => upd(k, e.target.value)} /></div>
              ))}
              <p className="md:col-span-3 text-[11px] text-stone-400">0 означає публічний / системний тариф Servio. CompanyID і CompanyCodeID — різні ідентифікатори; вказуйте обидва з довідника Servio або залиште обидва 0.</p>
            </div>
          )}

          {errors.length > 0 && <ul className="text-xs text-amber-800 space-y-0.5" data-testid="text-servio-availability-validation">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
          {disabledReason && <p className="text-xs text-amber-800">{disabledReason}</p>}
          {status.error && <div className="flex items-center gap-2 text-xs text-red-700">Не вдалося отримати стан з’єднання.<Button size="sm" variant="outline" onClick={() => status.refetch()}>Повторити</Button></div>}

          <Button type="button" variant="outline" data-testid="button-servio-availability"
            disabled={!input || !!disabledReason || status.isLoading || search.isPending} onClick={run}>
            {pendingCurrent ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            {pendingCurrent ? "Читаємо Servio…" : result ? "Оновити з Servio" : "Перевірити наявність"}
          </Button>
        </div>
      )}
      {!canRun && <p className="px-4 py-3 text-xs text-stone-500">Запустити перевірку наявності може лише власник або адміністратор.</p>}

      <div aria-live="polite" className="px-4 pb-4 space-y-2">
        {pendingCurrent && <div className="space-y-2"><div className="h-4 w-48 rounded bg-stone-100 animate-pulse" /><div className="h-16 rounded bg-stone-100 animate-pulse" /></div>}
        {shownErr && !search.isPending && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700">{shownErr}
            {canRun && <Button size="sm" variant="outline" disabled={!input || !!disabledReason} onClick={run}>Повторити</Button>}</div>
        )}
        {!result && snap && !search.isPending && <p className="text-xs text-stone-500">Попередній результат приховано: параметри або підключення змінилися. Запустіть перевірку знову.</p>}
        {result && !search.isPending && (
          <div data-testid="result-servio-availability" className="rounded-lg border border-stone-200">
            <div className="px-3 py-2 bg-[#fbfaf7] text-xs space-y-0.5 border-b border-stone-200">
              <p className={result.status === "complete" ? "text-emerald-800 font-medium" : result.status === "partial" ? "text-amber-800 font-medium" : "text-red-700 font-medium"}>
                {result.status === "complete" ? "Повна відповідь" : result.status === "partial" ? "Часткова відповідь: доступні не всі дані тарифів" : "Помилка читання"} · <span className="font-mono">{result.code}</span>
              </p>
              <p className="text-stone-700">{result.message}</p>
              <p className="text-stone-600" data-testid="text-servio-availability-query">
                {fmtDate(result.query.checkIn)} – {fmtDate(result.query.checkOut)} · {guests(result.query)}
                {(result.query.companyId || result.query.companyCodeId) ? ` · CompanyID ${result.query.companyId} / CodeID ${result.query.companyCodeId}` : " · публічний тариф"}
                {result.query.conditionId ? ` · ConditionID ${result.query.conditionId}` : ""}
              </p>
              <p className="text-stone-500">Знімок на {new Date(result.checkedAt).toLocaleString("uk-UA")} · HotelID {result.hotelId} · валюта {result.currency ?? "невідома"}</p>
            </div>
            {result.status === "failed" ? null : result.categories.length === 0 ? (
              <p className="px-3 py-4 text-sm text-stone-600">Servio не повернув вільних категорій на ці дати й склад гостей.</p>
            ) : (
              <ul>{result.categories.map(cat => (
                <li key={cat.id} className="border-t border-stone-200 first:border-t-0" data-testid={`row-servio-category-${cat.id}`}>
                  <div className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
                    <p className="text-sm font-medium text-stone-900">{cat.name}</p>
                    <span className="font-mono text-[10px] text-stone-400">ID {cat.id}</span>
                    <span className="ml-auto text-xs text-stone-700">Вільно: <b className="font-mono">{cat.freeRooms}</b> · Основних місць: <b className="font-mono">{cat.mainPlaces}</b></span>
                    {cat.nearestDate && <span className="w-full text-[11px] text-stone-500">Найближча дата: {fmtDate(cat.nearestDate.slice(0, 10))}</span>}
                  </div>
                  {cat.rates.length === 0 ? <p className="px-3 pb-2 text-[11px] text-stone-500">Тарифів не повернуто.</p>
                    : <ul>{cat.rates.map((r, i) => <RateRow key={`${r.priceListId}-${r.conditionId}-${i}`} id={`${cat.id}-${i}`} rate={r} currency={result.currency} partial={result.currency === null} />)}</ul>}
                </li>
              ))}</ul>
            )}
          </div>
        )}
        {!showResultSlot && !pendingCurrent && !shownErr && !canRun && <p className="text-xs text-stone-400">Знімка наявності ще немає.</p>}
      </div>
    </div>
  );
}
