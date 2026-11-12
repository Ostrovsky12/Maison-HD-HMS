import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, CreditCard, RefreshCw, Banknote } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const API_ROOT = BASE.replace("/maison-hd", "") + "/api";

export type ServiceBill = {
  point: { id: number; number: string; groupId: number | null; groupName: string | null; location: string | null };
  order: null | { id: number; totalAmount: number; status: string };
  items: { id: number; name: string; quantity: number; total: number; awaitingAcceptance: boolean; released: boolean }[];
  paymentAvailable: boolean;
  paymentMessage: string;
  cashRequestAvailable?: boolean;
  cashRequestPending?: boolean;
   cashRequestDestination?: "maison_hd" | "poster";
   cashRequestMessage?: string;
   cashRequestDelivery?: "none" | "queued" | "delivered";
  tipsAvailable?: boolean;
  tipsMessage?: string;
};

const money = (n: number) => `${Number(n || 0).toFixed(2)} ₴`;

function isLiqpayUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && (u.hostname === "www.liqpay.ua" || u.hostname === "liqpay.ua");
  } catch { return false; }
}

export function QrServiceBill({ orgSlug, tableId, onBill }: {
  orgSlug: string;
  tableId: string;
  /** Called after each successful poll with the current order id (null = no open bill). */
  onBill?: (orderId: number | null) => void;
}) {
  const [bill, setBill] = useState<ServiceBill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [method, setMethod] = useState<"liqpay" | "cash">("liqpay");
  const [tipPct, setTipPct] = useState(0);
  const [cashMessage, setCashMessage] = useState<string | null>(null);
  const onBillRef = useRef(onBill);
  onBillRef.current = onBill;

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_ROOT}/fb/public/service-points/${encodeURIComponent(orgSlug)}/${encodeURIComponent(tableId)}/bill`, { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setBill(d);
       if (!d.cashRequestPending) setCashMessage(null);
      setError(null);
      onBillRef.current?.(d.order?.id ?? null);
    } catch (e) {
      setBill(null); // never keep a stale payable bill
      setError((e as Error).message || "Не вдалося завантажити рахунок");
    } finally {
      setLoading(false);
    }
  }, [orgSlug, tableId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    setTipPct(0);
    setPayError(null);
    setCashMessage(null);
   }, [bill?.order?.id, bill?.order?.totalAmount]);

  const cash = method === "cash";
  const baseKopecks = Math.round((bill?.order?.totalAmount ?? 0) * 100);
  const tipKopecks = cash ? 0 : Math.round(baseKopecks * tipPct / 100);
  const paymentBlocked = cash
    ? !bill?.cashRequestAvailable || bill?.cashRequestPending || !!cashMessage
    : !bill?.paymentAvailable || (tipPct > 0 && !bill?.tipsAvailable);

  const pay = async () => {
    if (!bill?.order || paymentBlocked || paying) return;
    setPaying(true);
    setPayError(null);
    try {
      const endpoint = cash
        ? `/fb/public/service-points/${encodeURIComponent(orgSlug)}/${encodeURIComponent(tableId)}/cash-request`
        : "/fb/public/liqpay-checkout";
      const r = await fetch(`${API_ROOT}${endpoint}`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cash
          ? { expectedOrderId: bill.order.id, expectedTotal: bill.order.totalAmount }
          : { orgSlug, tableId: Number(tableId), expectedOrderId: bill.order.id, expectedTotal: bill.order.totalAmount, tipPct }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      if (cash) {
         if (d.ok !== true || d.destination !== "poster") throw new Error("Надсилання запиту не підтверджено.");
        setCashMessage(d.message);
        void load();
        return;
      }
      if (!isLiqpayUrl(d.url)) throw new Error("Некоректне посилання на оплату");
      window.location.assign(d.url);
    } catch (e) {
      setPayError((e as Error).message);
      load();
    } finally {
      setPaying(false);
    }
  };

  if (loading && !bill) {
    return <div className="mx-5 mb-4 h-16 rounded-2xl bg-white/70 border border-stone-100 animate-pulse" data-testid="bill-loading" />;
  }

  if (error) {
    return (
      <div className="mx-5 mb-4 rounded-2xl bg-white border border-red-100 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-2" data-testid="bill-error">
        <span>Рахунок недоступний: {error}</span>
        <button onClick={load} className="shrink-0 p-2 rounded-full hover:bg-red-50" data-testid="button-bill-retry"><RefreshCw className="w-4 h-4" /></button>
      </div>
    );
  }
  if (!bill) return null;

  const p = bill.point;
  return (
    <section className="mx-5 mb-4 rounded-2xl bg-white border border-stone-100 shadow-sm px-4 py-3" data-testid="section-service-bill">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-[#7A756D] font-semibold truncate" data-testid="text-bill-group">{p.groupName || "Без групи"}</div>
          <div className="font-serif text-[#2D2A26] text-lg leading-tight" data-testid="text-bill-point">№{p.number}{p.location ? ` · ${p.location}` : ""}</div>
        </div>
        {bill.order && <div className="font-serif text-[#A37346] text-lg shrink-0" data-testid="text-bill-total">{money(bill.order.totalAmount)}</div>}
      </div>

      {bill.order ? (
        <>
          {bill.items.length > 0 && (
            <ul className="mt-2 divide-y divide-stone-100 text-sm">
              {bill.items.map(it => (
                <li key={it.id} className="py-1.5 flex items-center justify-between gap-2" data-testid={`row-bill-item-${it.id}`}>
                  <span className="min-w-0 text-[#2D2A26]">
                    <span className="text-[#7A756D]">{it.quantity} ×</span> {it.name}
                    {it.awaitingAcceptance && <span className="ml-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">очікує підтвердження</span>}
                  </span>
                  <span className="shrink-0 text-[#2D2A26]">{money(it.total)}</span>
                </li>
              ))}
            </ul>
          )}
          <fieldset className="mt-3" disabled={paying}>
            <legend className="text-sm font-medium text-[#2D2A26]">Спосіб розрахунку</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["liqpay", "cash"] as const).map(value => (
                <label key={value} className={`rounded-xl border p-3 text-sm cursor-pointer ${method === value ? "border-[#A37346] bg-stone-50" : "border-stone-100"}`}>
                  <input type="radio" name={`bill-method-${tableId}`} value={value} checked={method === value}
                    onChange={() => { setMethod(value); setTipPct(0); setPayError(null); }}
                    data-testid={`radio-payment-${value}`} className="mr-2 accent-[#A37346]" />
                  {value === "liqpay" ? "LiqPay" : "Готівкою"}
                </label>
              ))}
            </div>
          </fieldset>
          {!cash && <fieldset className="mt-3" disabled={paying}>
            <legend className="text-sm font-medium text-[#2D2A26]">Чайові офіціанту</legend>
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[0, 10, 15, 20].map(pct => <button key={pct} type="button" aria-pressed={tipPct === pct}
                onClick={() => { setTipPct(pct); setPayError(null); }} data-testid={`button-tip-${pct}`}
                className={`rounded-xl py-2.5 text-xs border ${tipPct === pct ? "bg-[#2D2A26] text-white border-[#2D2A26]" : "border-stone-100 text-[#7A756D]"}`}>
                {pct === 0 ? "Без чайових" : `${pct}%`}
              </button>)}
            </div>
            <p className="mt-2 text-xs text-[#7A756D]">Чайові — окремо від суми страв, лише при онлайн-оплаті.</p>
            {tipPct > 0 && <div className="mt-2 text-sm space-y-1" data-testid="tip-summary">
              <div className="flex justify-between"><span>Рахунок закладу</span><span>{money(baseKopecks / 100)}</span></div>
              <div className="flex justify-between"><span>Чайові {tipPct}%</span><span data-testid="text-tip-amount">{money(tipKopecks / 100)}</span></div>
              <div className="flex justify-between font-semibold"><span>Разом до оплати</span><span data-testid="text-payment-total">{money((baseKopecks + tipKopecks) / 100)}</span></div>
            </div>}
            {tipPct > 0 && !bill.tipsAvailable && <p className="mt-2 text-xs text-amber-800" role="status">{bill.tipsMessage || "Переказ чайових ще не підключений. Кошти не списуватимуться."}</p>}
          </fieldset>}
          {cash && <p className="mt-2 text-xs text-[#7A756D]">
             {bill.cashRequestMessage || "Запит на касу Poster без чайових. Оплату підтвердить касир після отримання коштів."}
          </p>}
          <button
            onClick={pay}
            disabled={!!paymentBlocked || paying}
            className="mt-3 w-full h-11 rounded-full bg-[#2D2A26] text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40"
            data-testid="button-bill-pay"
          >
            {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : cash ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
             {cash ? (cashMessage || bill.cashRequestPending
               ? bill.cashRequestDelivery === "delivered" ? "Сповіщення показано в Poster" : "Очікуємо підтвердження Poster"
               : "Розрахуватися готівкою") : "Перейти до LiqPay"}
          </button>
           {cashMessage && <p className="mt-2 text-xs text-green-800 text-center" role="status" data-testid="text-cash-request-success">{bill.cashRequestPending ? bill.cashRequestMessage : cashMessage}</p>}
           {!cash && bill.paymentMessage && <p className="mt-2 text-xs text-[#7A756D] text-center" data-testid="text-bill-payment-message">{bill.paymentMessage}</p>}
          {payError && <p className="mt-2 text-xs text-red-600 text-center" role="alert">{payError}</p>}
        </>
      ) : (
        <p className="mt-1 text-xs text-[#7A756D]" data-testid="text-bill-empty">Відкритого рахунку немає. Оберіть страви, щоб почати.</p>
      )}
    </section>
  );
}

export default QrServiceBill;
