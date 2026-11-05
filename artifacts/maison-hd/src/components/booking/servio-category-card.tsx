import { useState } from "react";
import { BedDouble, Check, ChevronDown, Info, Maximize2, Sofa, Users } from "lucide-react";
import type { BookingRoomDetails } from "@workspace/api-client-react";
import { UnitGallery } from "./unit-gallery";
import { CANONICAL_PAYMENT_NOTICE, PAYMENT_WINDOW_LABEL } from "@/lib/payment-window";
import { guestRateName } from "@/lib/guest-rate-name";

export type ServioCharge = { serviceName: string; date: string; amount: number };
export type ServioRateOption = { id: number; rateName: string; total: number; charges: ServioCharge[]; viewOnlyReason?: string };

const money = (v: number) => new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + " грн";
const shortDate = (v: string) => { const d = new Date(v.slice(0, 10) + "T00:00:00"); return isNaN(d.getTime()) ? v : d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }); };

type Props = {
  categoryKey: string; name: string; photos: string[]; description: string; details?: BookingRoomDetails;
  capacity: number; rates: ServioRateOption[]; selectedId: number | null; disabled: boolean; accent: string;
  supplementary: string; onSelect: (id: number) => void; compact?: boolean;
};

export function ServioCategoryCard(p: Props) {
  const d = p.details ?? {};
  const [descOpen, setDescOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(true);
  const [rateDesc, setRateDesc] = useState<number | null>(null);
  const [info, setInfo] = useState<number | null>(null);
  const title = d.displayName?.trim() || p.name;
  const amenities = (d.amenities ?? []).filter((a) => a.trim());
  const tid = p.categoryKey.replace(/[^a-z0-9]/gi, "-");
  return (
    <article className={`dg-card rounded-3xl bg-white border border-stone-200 overflow-hidden ${p.compact ? "dg-compact-category" : ""}`} data-testid={`card-servio-category-${tid}`}>
      <div className="dg-category-photo h-60 md:h-72">
        {p.photos.length ? <UnitGallery photos={p.photos} title={title} unitId={p.rates[0]?.id ?? 0} accent={p.accent} />
          : <div className="h-full grid place-items-center bg-stone-200"><BedDouble className="w-8 h-8 opacity-50" /></div>}
      </div>
      <div className="dg-category-content p-5 md:p-7 space-y-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-2xl md:text-3xl tracking-tight">{title}</h3>
          {amenities.length > 0 && (
            <button type="button" onClick={() => setMoreOpen((x) => !x)} className="shrink-0 inline-flex items-center gap-1 text-sm mt-2" data-testid={`button-category-more-${tid}`} aria-expanded={moreOpen}>
              {moreOpen ? "Згорнути" : "Детальніше"}<ChevronDown className={`w-4 h-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
        <ul className="dg-category-facts space-y-2 text-sm">
          {(d.occupancyText?.trim() || p.capacity > 0) && <li className="flex gap-2"><Users className="w-4 h-4 shrink-0 mt-0.5" />{d.occupancyText?.trim() || `до ${p.capacity} гостей`}</li>}
          {d.sofaText?.trim() && <li className="flex gap-2"><Sofa className="w-4 h-4 shrink-0 mt-0.5" />{d.sofaText}</li>}
          {d.bedsText?.trim() && <li className="flex gap-2"><BedDouble className="w-4 h-4 shrink-0 mt-0.5" />{d.bedsText}</li>}
          {d.areaText?.trim() && <li className="flex gap-2"><Maximize2 className="w-4 h-4 shrink-0 mt-0.5" />{d.areaText}</li>}
        </ul>
        {moreOpen && amenities.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" data-testid={`list-amenities-${tid}`}>
            {amenities.map((a) => <li key={a} className="rounded-full border border-stone-300 px-3 py-1 text-xs">{a}</li>)}
          </ul>
        )}
        {p.description && (
          <div>
            {(!p.compact || descOpen) && <p className={`text-sm leading-relaxed whitespace-pre-line text-stone-600 ${descOpen ? "" : "line-clamp-4"}`}>{p.description}</p>}
            <button type="button" onClick={() => setDescOpen((x) => !x)} className="mt-1 inline-flex items-center gap-1 text-sm" data-testid={`button-category-desc-${tid}`}>
              {descOpen ? "Згорнути" : p.compact ? "Про це розміщення" : "Розгорнути"}<ChevronDown className={`w-4 h-4 transition-transform ${descOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        )}
        <div className="dg-category-rates border-t border-stone-200 pt-4">
          {(!p.compact || p.rates.length > 1) && <button type="button" onClick={() => setRatesOpen((x) => !x)} className="inline-flex items-center gap-1 text-sm font-medium" aria-expanded={ratesOpen} data-testid={`button-rates-toggle-${tid}`}>
            Тарифи: {p.rates.length}<ChevronDown className={`w-4 h-4 transition-transform ${ratesOpen ? "rotate-180" : ""}`} />
          </button>}
          {ratesOpen && (
            <div className="mt-3 space-y-3">
              {p.rates.map((r) => {
                const sel = p.selectedId === r.id;
                const rTitle = guestRateName(r.viewOnlyReason ? r.rateName : d.tariffTitle?.trim() || r.rateName);
                const sum = r.charges.reduce((a, c) => a + c.amount, 0);
                return (
                  <div key={r.id} className="dg-rate rounded-2xl p-4 border" style={{ background: "color-mix(in srgb, var(--dg-button, #cfe8c9) 22%, transparent)", borderColor: sel ? "var(--dg-text, #222)" : "transparent" }} data-testid={`card-rate-${r.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{rTitle}</p>
                      </div>
                      {!r.viewOnlyReason && d.tariffDescription?.trim() && (
                        <button type="button" onClick={() => setRateDesc((x) => (x === r.id ? null : r.id))} className="shrink-0 inline-flex items-center gap-1 text-xs" data-testid={`button-rate-desc-${r.id}`}>
                          {rateDesc === r.id ? "Згорнути" : "Детальніше"}<ChevronDown className={`w-3.5 h-3.5 ${rateDesc === r.id ? "rotate-180" : ""}`} />
                        </button>
                      )}
                    </div>
                    {r.viewOnlyReason ? <p className="mt-2 text-xs text-amber-900" data-testid={`text-rate-view-only-${r.id}`}>{r.viewOnlyReason}</p>
                      : d.tariffDescription?.trim() && (!p.compact || rateDesc === r.id) && <p className={`mt-2 text-xs leading-relaxed whitespace-pre-line text-stone-600 ${rateDesc === r.id ? "" : "line-clamp-1"}`}>{guestRateName(d.tariffDescription)}</p>}
                    {info === r.id && (
                      <div className="mt-3 rounded-xl bg-white border border-stone-300 p-3 text-xs space-y-1.5" data-testid={`panel-rate-info-${r.id}`}>
                        <p className="font-semibold text-sm">Деталі</p>
                        {r.charges.length ? r.charges.map((c, i) => (
                          <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2"><span>{guestRateName(c.serviceName)}</span><span>{shortDate(c.date)}</span><span className="font-mono">{money(c.amount)}</span></div>
                        )) : <p className="text-stone-500">Servio не передав розбивку за послугами.</p>}
                        {r.charges.length > 0 && Math.abs(sum - r.total) > 0.005 && <p className="text-stone-500">Підсумок Servio відрізняється від суми рядків; показано підсумок Servio.</p>}
                        <div className="flex justify-between border-t border-stone-200 pt-1.5 font-semibold"><span>Всього</span><span className="font-mono">{money(r.total)}</span></div>
                        {r.viewOnlyReason ? <p className="text-amber-900">{r.viewOnlyReason} Для бронювання зверніться до готелю.</p> : <>
                          <p className="rounded-lg px-2 py-1.5 text-center whitespace-pre-line" style={{ background: "var(--dg-button, #e9d96a)" }}>{p.supplementary || CANONICAL_PAYMENT_NOTICE}</p>
                          <p className="text-stone-600">{PAYMENT_WINDOW_LABEL}</p>
                          <p className="text-center">Оплата на сайті</p>
                        </>}
                      </div>
                    )}
                    <div className="dg-rate-actions mt-3 flex items-center justify-end gap-2">
                      <span className="dg-rate-total font-semibold font-mono" data-testid={`text-rate-total-${r.id}`}>{money(r.total)}</span>
                      <button type="button" aria-label="Деталі ціни та оплати" aria-expanded={info === r.id} onClick={() => setInfo((x) => (x === r.id ? null : r.id))}
                        className="w-8 h-8 rounded-full grid place-items-center" style={{ background: "var(--dg-button, #e9d96a)" }} data-testid={`button-rate-info-${r.id}`}><Info className="w-4 h-4" /></button>
                      <button type="button" disabled={p.disabled || !!r.viewOnlyReason} onClick={() => { if (!r.viewOnlyReason) p.onSelect(r.id); }} className="rounded-full px-5 h-10 text-sm font-semibold bg-stone-900 text-[#fbfaf7] disabled:opacity-50 inline-flex items-center gap-1.5" data-testid={`button-select-rate-${r.id}`}>
                        {sel && <Check className="w-4 h-4" />}{r.viewOnlyReason ? "Лише перегляд" : sel ? "Обрано" : "Обрати"}
                      </button>
                    </div>
                    {p.compact && <p className="dg-period-label">за весь період проживання</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
