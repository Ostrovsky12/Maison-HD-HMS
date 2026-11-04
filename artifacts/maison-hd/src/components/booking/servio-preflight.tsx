import { useEffect, useMemo, useRef, useState } from "react";
import {
  useCheckBookingServioPreflight, useGetBookingLiqpaySettings, getGetBookingLiqpaySettingsQueryKey,
} from "@workspace/api-client-react";
import type { BookingServioSearchResult, BookingServioPreflight, BookingServioPreflightInput } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";

const fmtDate = (s: string) => {
  const t = Date.parse(s.slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("uk-UA", { timeZone: "UTC" }) : s;
};
const fmtMoney = (n: number | null, cur: string | null) =>
  n === null ? "Сума не повернута" : new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(n) + (cur ? ` ${cur}` : " (валюта невідома)");
const errText = (e: unknown, fb: string) => {
  const d = (e as { data?: { error?: string; message?: string } })?.data;
  return d?.error || d?.message || fb;
};

const STATUS = {
  passed: { label: "Пройдено", c: "text-emerald-800 bg-emerald-50 border-emerald-200", Icon: CheckCircle2 },
  blocked: { label: "Блокує", c: "text-red-800 bg-red-50 border-red-200", Icon: XCircle },
  unverified: { label: "Не перевірено", c: "text-amber-800 bg-amber-50 border-amber-200", Icon: CircleHelp },
} as const;

export function ServioPreflight({ organizationId, result, canRun }: {
  organizationId: number | null; result: BookingServioSearchResult; canRun: boolean;
}) {
  const key = useMemo(() => [...getGetBookingLiqpaySettingsQueryKey(), organizationId], [organizationId]);
  const liq = useGetBookingLiqpaySettings({ query: { queryKey: key, enabled: organizationId != null && canRun } });
  const check = useCheckBookingServioPreflight();

  const rates = useMemo(() => result.categories.flatMap(cat =>
    cat.rates.map((r, i) => ({ k: `${cat.id}:${r.priceListId}:${r.conditionId}:${i}`, cat, r }))), [result]);
  const properties = liq.data?.properties ?? [];
  const sellers = liq.data?.legalEntities ?? [];

  const [rateKey, setRateKey] = useState<string>(rates[0]?.k ?? "");
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [snap, setSnap] = useState<{ sig: string; data: BookingServioPreflight } | null>(null);
  const [err, setErr] = useState<{ sig: string; msg: string } | null>(null);
  const gen = useRef(0);

  useEffect(() => {
    if (propertyId === null || !properties.some(p => p.id === propertyId)) setPropertyId(properties[0]?.id ?? null);
  }, [properties, propertyId]);

  const sel = rates.find(x => x.k === rateKey) ?? null;
  const property = properties.find(p => p.id === propertyId) ?? null;
  const seller = property?.legalEntityId != null ? sellers.find(s => s.id === property.legalEntityId) ?? null : null;
  const sig = JSON.stringify([organizationId, result.checkedAt, rateKey, propertyId,
    property?.legalEntityId, seller?.verification, seller?.hasSecretKey, seller?.publicKey, liq.data?.callbackConfigured]);

  useEffect(() => { gen.current += 1; setSnap(null); setErr(null); }, [sig]);

  const input: BookingServioPreflightInput | null = sel && property ? {
    ...result.query, categoryId: sel.cat.id, priceListId: sel.r.priceListId, rateConditionId: sel.r.conditionId, propertyId: property.id,
  } : null;

  const run = () => {
    if (!input || !canRun || check.isPending) return;
    const my = ++gen.current; const mySig = sig;
    setSnap(null); setErr(null);
    check.mutate({ data: input }, {
      onSuccess: d => { if (gen.current === my) setSnap({ sig: mySig, data: d }); },
      onError: e => { if (gen.current === my) setErr({ sig: mySig, msg: errText(e, "Не вдалося виконати перевірку. Спробуйте ще раз.") }); },
    });
  };

  const shown = snap && snap.sig === sig ? snap.data : null;
  const shownErr = err && err.sig === sig ? err.msg : null;
  const pending = check.isPending;
  const selCls = "w-full h-9 rounded-md border border-stone-300 bg-white px-3 text-sm disabled:opacity-60";

  return (
    <div className="mt-3 rounded-lg border border-stone-200" data-testid="servio-preflight">
      <div className="px-3 py-2 bg-[#fbfaf7] border-b border-stone-200">
        <p className="text-sm font-medium text-stone-900 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-stone-500" />Перевірка перед запуском</p>
        <p className="text-[11px] text-stone-500 mt-0.5">Лише читання. Бронювання, рахунки, платіжні посилання й оплати не створюються, у Servio нічого не записується. Продажі залишаються заблокованими за будь-якого результату.</p>
      </div>

      <div className="p-3 space-y-3">
        <p className="text-[11px] text-stone-600" data-testid="text-servio-preflight-query">
          Запит: {fmtDate(result.query.checkIn)} – {fmtDate(result.query.checkOut)} · дорослих {result.query.adults}
          {result.query.childAges.length ? `, дітей ${result.query.childAges.length}` : ""}{result.query.useExtraBed ? ", дод. ліжко" : ""}
          {" · "}знімок {new Date(result.checkedAt).toLocaleString("uk-UA")}
        </p>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="servio-preflight-rate" className="text-xs text-stone-600">Категорія й тариф (з поточної відповіді Servio)</Label>
            <select id="servio-preflight-rate" data-testid="select-servio-preflight-rate" className={selCls} disabled={!canRun || pending}
              value={rateKey} onChange={e => setRateKey(e.target.value)}>
              {rates.map(x => <option key={x.k} value={x.k}>{x.cat.name} — {x.r.name || `Прайс #${x.r.priceListId}`} · {result.currency === null ? "ціна недоступна" : fmtMoney(x.r.total, result.currency)}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="servio-preflight-property" className="text-xs text-stone-600">Об'єкт і продавець для перевірки реквізитів</Label>
            {liq.isLoading ? <div className="h-9 rounded-md bg-stone-100 animate-pulse" />
              : liq.error ? (
                <div className="flex items-center gap-2 text-xs text-red-700" role="alert">Не вдалося завантажити об'єкти.
                  <Button size="sm" variant="outline" onClick={() => liq.refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1" />Повторити</Button></div>
              ) : properties.length === 0 ? (
                <p className="text-xs text-amber-800 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">Немає об'єктів. Додайте об'єкт і призначте продавця в налаштуваннях LiqPay.</p>
              ) : (
                <select id="servio-preflight-property" data-testid="select-servio-preflight-property" className={selCls} disabled={!canRun || pending}
                  value={propertyId ?? ""} onChange={e => setPropertyId(Number(e.target.value))}>
                  {properties.map(p => {
                    const s = p.legalEntityId != null ? sellers.find(l => l.id === p.legalEntityId) : null;
                    return <option key={p.id} value={p.id}>{p.name} — {s ? s.name : p.legalEntityId == null ? "продавця не призначено" : "продавець недоступний"}</option>;
                  })}
                </select>
              )}
            {property && !seller && (
              <p className="text-[11px] text-amber-700 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                {property.legalEntityId == null ? "Об'єкту не призначено продавця — оплата неможлива." : "Призначений продавець не належить до доступних у цій організації."}</p>
            )}
          </div>
        </div>

        {sel && (
          <p className="text-xs text-stone-700">Поточна сума Servio: <b className="font-mono">{result.currency === null ? "недоступна" : fmtMoney(sel.r.total, result.currency)}</b>
            <span className="font-mono text-[10px] text-stone-400 ml-2">Cat {sel.cat.id} · PL {sel.r.priceListId} · Cond {sel.r.conditionId}</span></p>
        )}

        {canRun ? (
          <Button type="button" variant="outline" data-testid="button-servio-preflight" disabled={!input || pending} onClick={run}>
            {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
            {pending ? "Перевіряємо…" : "Перевірити тариф і оплату"}
          </Button>
        ) : <p className="text-xs text-stone-500">Запустити перевірку може лише власник або адміністратор.</p>}

        <div aria-live="polite" className="space-y-2">
          {pending && <div className="space-y-2"><div className="h-4 w-56 rounded bg-stone-100 animate-pulse" /><div className="h-20 rounded bg-stone-100 animate-pulse" /></div>}
          {shownErr && !pending && (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700">{shownErr}
              <Button size="sm" variant="outline" disabled={!input} onClick={run}>Повторити</Button></div>
          )}
          {shown && !pending && (
            <div data-testid="result-servio-preflight" className="rounded-lg border border-stone-200">
              <div className="px-3 py-2 border-b border-stone-200 text-xs space-y-0.5">
                <p className="font-medium text-stone-900">{shown.categoryName ?? `Категорія #${shown.input.categoryId}`} · {shown.rateName ?? `Прайс #${shown.input.priceListId}`}</p>
                <p className="text-stone-700">Сума: <b className="font-mono">{fmtMoney(shown.total, shown.currency)}</b> · {fmtDate(shown.input.checkIn)} – {fmtDate(shown.input.checkOut)} · дорослих {shown.input.adults}{shown.input.childAges.length ? `, дітей ${shown.input.childAges.length}` : ""}</p>
                <p className="text-stone-500">Перевірено {new Date(shown.checkedAt).toLocaleString("uk-UA")} · HotelID {shown.hotelId} · політика {shown.policyVersion}</p>
              </div>
              <ul>{shown.checks.map((c, i) => {
                const s = STATUS[c.status] ?? STATUS.unverified;
                return (
                  <li key={`${c.code}-${i}`} className="flex gap-2 px-3 py-2 border-t border-stone-100 first:border-t-0 text-xs" data-testid={`row-servio-preflight-check-${c.code}`}>
                    <span className={`inline-flex items-center gap-1 shrink-0 rounded border px-1.5 h-5 text-[10px] ${s.c}`}><s.Icon className="w-3 h-3" />{s.label}</span>
                    <span className="text-stone-700">{c.message} <span className="font-mono text-[10px] text-stone-400">{c.code}</span></span>
                  </li>
                );
              })}</ul>
              <div className="px-3 py-2 border-t border-stone-200 bg-amber-50 text-xs text-amber-900 space-y-1" data-testid="text-servio-preflight-verdict">
                <p className="font-medium">{shown.inputChecksPassed ? "Вхідні перевірки пройдено, але продажі залишаються заблокованими." : "Є блокуючі або неперевірені умови. Продажі заблоковано."}</p>
                <p>Створення бронювання та прийом оплати в цьому режимі недоступні. Нічого не створено й не списано.</p>
              </div>
              <div className="px-3 py-2 border-t border-stone-200 text-xs">
                <p className="text-stone-500 mb-1">Текст підтвердження для гостя (лише попередній перегляд, згода не збирається й не зберігається):</p>
                <blockquote className="border-l-2 border-stone-300 pl-2 text-stone-700 whitespace-pre-wrap" data-testid="text-servio-preflight-ack">{shown.acknowledgementText}</blockquote>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
