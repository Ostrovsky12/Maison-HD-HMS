import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { parsePaymentStatus, type PaymentStatus, type ReturnRef } from "@/lib/booking-payment";

const money = (v: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(v) + " грн";
const POLL_MS = 5000;
const POLL_LIMIT = 36; // about 3 minutes, then manual refresh

type Props = { api: string; slug: string; ref_: ReturnRef; accent: string; base: string; onDismiss: () => void };

export function PaymentStatusView({ api, slug, ref_, accent, base, onDismiss }: Props) {
  const [st, setSt] = useState<PaymentStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [polls, setPolls] = useState(0);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ bookingId: String(ref_.bookingId), code: ref_.code });
      const r = await fetch(`${api}/booking-engine/${encodeURIComponent(slug)}/payment-status?${p}`);
      if (!r.ok) {
        let msg = `Помилка ${r.status}`;
        try { const j = await r.json(); if (typeof j?.error === "string") msg = j.error; } catch { /* ignore */ }
        throw new Error(r.status === 404 ? "Бронювання не знайдено. Перевірте посилання або зверніться до готелю." : msg);
      }
      const parsed = parsePaymentStatus(await r.json());
      if (!parsed) throw new Error("Сервер повернув невідомий статус оплати");
      setSt(parsed); setErr(null);
    } catch (e) { setErr((e as Error).message || "Не вдалося перевірити оплату"); }
    finally { setLoading(false); setPolls((x) => x + 1); }
  }, [api, slug, ref_.bookingId, ref_.code]);

  useEffect(() => { void load(); }, [load]);

  const awaiting = !st || st.status === "awaiting_payment";
  useEffect(() => {
    if (!awaiting || loading || polls >= POLL_LIMIT || err) return;
    timer.current = window.setTimeout(() => { void load(); }, POLL_MS);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [awaiting, loading, polls, err, load]);

  const ref = st?.bookingRef || `#${ref_.bookingId}`;
  const view = (() => {
    if (!st) return null;
    switch (st.status) {
      case "paid": return { icon: CheckCircle2, tone: "emerald", title: "Оплату отримано, бронювання підтверджено",
        body: "Платіжна система підтвердила оплату 100% вартості. Деталі надіслано на ваші контакти." };
      case "review": return { icon: ShieldAlert, tone: "amber", title: "Оплату отримано, готель перевіряє бронювання",
        body: "Платіж надійшов, але потребує звірки готелем. Готель зв'яжеться з вами. Не створюйте повторне бронювання." };
      case "expired": return { icon: AlertTriangle, tone: "red", title: "Оплату не зафіксовано, час на оплату минув",
        body: "Бронювання не оплачено і не гарантоване. Нове бронювання автоматично не створюється. Якщо кошти було списано, зверніться до готелю, вказавши номер бронювання." };
      default: return { icon: Clock, tone: "stone", title: "Очікуємо підтвердження оплати",
        body: "Ми ще не отримали підтвердження від платіжної системи. Номер не гарантовано, доки оплату не підтверджено. Сторінка оновлюється автоматично." };
    }
  })();
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-900 border-emerald-200", amber: "bg-amber-50 text-amber-900 border-amber-200",
    red: "bg-red-50 text-red-900 border-red-200", stone: "bg-white text-stone-800 border-stone-200",
  };

  return (
    <div className="max-w-xl mx-auto rounded-3xl bg-white border border-stone-200 shadow-sm overflow-hidden" data-testid="panel-payment-status">
      <div className="h-1.5" style={{ background: accent }} />
      <div className="p-6 md:p-8">
        <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Статус оплати</p>
        <p className="font-mono text-sm mt-1" data-testid="text-booking-ref">Бронювання {ref}</p>
        {!st && !err && <div className="mt-6 flex items-center gap-2 text-stone-600"><Loader2 className="w-4 h-4 animate-spin" />Перевіряємо статус оплати...</div>}
        {err && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" data-testid="text-payment-status-error">
            <p>{err}</p>
            <button type="button" onClick={() => { setPolls(0); void load(); }} className="mt-2 inline-flex items-center gap-1.5 underline" data-testid="button-recheck-payment"><RefreshCw className="w-3.5 h-3.5" />Перевірити ще раз</button>
          </div>
        )}
        {view && st && (
          <>
            <div className={`mt-5 rounded-2xl border p-4 flex gap-3 ${tones[view.tone]}`} data-testid={`status-payment-${st.status}`}>
              <view.icon className={`w-5 h-5 shrink-0 mt-0.5 ${st.status === "awaiting_payment" && loading ? "animate-pulse" : ""}`} />
              <div><p className="font-semibold">{view.title}</p><p className="text-sm mt-1 opacity-90">{view.body}</p></div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-stone-500">Вартість</dt><dd className="font-mono font-semibold text-right">{money(st.totalAmount)}</dd>
              <dt className="text-stone-500">Оплачено</dt><dd className="font-mono text-right" data-testid="text-paid-amount">{money(st.paidAmount)}</dd>
            </dl>
            {st.status === "awaiting_payment" && polls >= POLL_LIMIT && (
              <button type="button" onClick={() => { setPolls(0); void load(); }} className="mt-4 inline-flex items-center gap-1.5 text-sm underline" data-testid="button-recheck-payment"><RefreshCw className="w-3.5 h-3.5" />Перевірити ще раз</button>
            )}
            {(st.status === "paid" || st.status === "review") && (
              <a href={`${base}/guest/${ref_.code}`} className="mt-6 inline-block rounded-xl px-5 py-3 text-sm font-semibold text-white" style={{ background: accent }} data-testid="link-guest-portal">Відкрити кабінет гостя</a>
            )}
          </>
        )}
        <button type="button" onClick={onDismiss} className="mt-6 block text-xs text-stone-500 underline" data-testid="button-dismiss-status">Повернутися до пошуку</button>
      </div>
    </div>
  );
}
