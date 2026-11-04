import { Ban, CalendarX2, CreditCard, ShieldAlert } from "lucide-react";
import type { TariffPolicy } from "@/lib/booking-payment";

type Props = { policy: TariffPolicy; total: number; checked: boolean; onChange: (v: boolean) => void };

const money = (v: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(v) + " грн";

/** Conspicuous, separate acknowledgement shown immediately before the payment button. */
export function NonRefundableConsent({ policy, total, checked, onChange }: Props) {
  return (
    <section data-testid="panel-policy" aria-labelledby="policy-title"
      className={`rounded-2xl border-2 p-4 md:p-5 transition-colors ${checked ? "border-red-700 bg-red-50" : "border-red-500 bg-[#fff4f2]"}`}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0"><ShieldAlert className="w-5 h-5" /></span>
        <div>
          <h3 id="policy-title" className="text-base md:text-lg font-bold text-red-900 uppercase tracking-wide">Неповоротний тариф</h3>
          <p className="text-sm text-red-900/90">Прочитайте уважно перед оплатою.</p>
        </div>
      </div>
      <ul className="mt-4 grid sm:grid-cols-3 gap-2">
        <li className="rounded-xl bg-white border border-red-200 p-3 text-sm"><CreditCard className="w-4 h-4 text-red-700 mb-1" /><b className="block text-red-950">Оплата 100% зараз</b><span className="text-stone-600 font-mono">{money(total)}</span></li>
        <li className="rounded-xl bg-white border border-red-200 p-3 text-sm"><Ban className="w-4 h-4 text-red-700 mb-1" /><b className="block text-red-950">Без повернення коштів</b><span className="text-stone-600">крім випадків за законом</span></li>
        <li className="rounded-xl bg-white border border-red-200 p-3 text-sm"><CalendarX2 className="w-4 h-4 text-red-700 mb-1" /><b className="block text-red-950">Дати не змінюються</b><span className="text-stone-600">після оплати</span></li>
      </ul>
      <label className="mt-4 flex items-start gap-3 rounded-xl bg-white border border-red-300 p-3 cursor-pointer">
        <input data-testid="checkbox-agree-nonrefundable" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-5 h-5 accent-red-700 shrink-0" aria-describedby="policy-title" />
        <span className="text-sm font-medium text-stone-900 leading-snug" data-testid="text-policy-ack">{policy.acknowledgementText}</span>
      </label>
      <p className="mt-2 text-[11px] text-red-900/70 font-mono">Версія правил: {policy.version}</p>
    </section>
  );
}
