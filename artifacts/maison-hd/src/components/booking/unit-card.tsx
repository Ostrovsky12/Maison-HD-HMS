import { useState } from "react";
import { BedDouble, Check, Maximize2, Mountain, Users, Fence } from "lucide-react";
import { UnitGallery } from "./unit-gallery";
import { UnitVideo } from "./unit-video";
import { VIEW_LABELS } from "@/lib/booking-media";

export type PublicUnit = {
  id: number; name: string; category: string; capacity: number; description: string;
  basePrice: number; totalPrice: number; propertyName: string;
  photos: string[]; videoUrl: string; squareMeters: number | null; hasBalcony: boolean | null; hasView: string | null; maxCapacity: number | null;
};

const money = (v: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(v) + " грн";
const nightsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "ніч" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "ночі" : "ночей");

type Props = { unit: PublicUnit; nights: number; accent: string; active: boolean; disabled: boolean; onSelect: () => void; policyBadge?: string; viewOnlyReason?: string };

export function UnitCard({ unit: u, nights, accent, active, disabled, onSelect, policyBadge, viewOnlyReason }: Props) {
  const [expanded, setExpanded] = useState(false);
  const longDesc = u.description.length > 220 || u.description.split("\n").length > 3;
  const amenities: { icon: typeof Users; label: string }[] = [];
  amenities.push({ icon: Users, label: `до ${u.capacity} гостей` });
  if (u.maxCapacity && u.maxCapacity > u.capacity) amenities.push({ icon: BedDouble, label: `макс. ${u.maxCapacity} з дод. місцями` });
  if (u.squareMeters) amenities.push({ icon: Maximize2, label: `${u.squareMeters} м²` });
  if (u.hasBalcony) amenities.push({ icon: Fence, label: "Балкон" });
  if (u.hasView) amenities.push({ icon: Mountain, label: VIEW_LABELS[u.hasView] ?? "Гарний вид" });

  return (
    <article data-testid={`card-unit-${u.id}`}
      className={`rounded-3xl bg-white overflow-hidden grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] transition-shadow ${active ? "ring-2 shadow-lg" : "border border-stone-200 hover:shadow-md"}`}
      style={active ? { ["--tw-ring-color" as string]: accent } : undefined}>
      <div className="h-60 sm:h-72 md:h-auto md:min-h-[320px]">
        <UnitGallery photos={u.photos} title={u.name} category={u.category} unitId={u.id} accent={accent} />
      </div>
      <div className="p-5 md:p-6 flex flex-col">
        <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{u.category}{u.propertyName ? ` · ${u.propertyName}` : ""}</p>
        <h3 className="text-xl md:text-2xl font-semibold tracking-tight mt-1">{u.name}</h3>
        <ul className="flex flex-wrap gap-1.5 mt-3">
          {amenities.map((a) => (
            <li key={a.label} className="inline-flex items-center gap-1 text-xs text-stone-700 bg-white border border-stone-200 rounded-full px-2.5 py-1"><a.icon className="w-3.5 h-3.5" />{a.label}</li>
          ))}
        </ul>
        {u.description && (
          <div className="mt-3">
            <p id={`desc-${u.id}`} className={`text-sm text-stone-600 whitespace-pre-line ${expanded ? "" : "line-clamp-3"}`}>{u.description}</p>
            {longDesc && (
              <button type="button" data-testid={`button-desc-${u.id}`} aria-expanded={expanded} aria-controls={`desc-${u.id}`}
                onClick={() => setExpanded((e) => !e)} className="text-sm font-medium underline mt-1">{expanded ? "Згорнути опис" : "Повний опис"}</button>
            )}
          </div>
        )}
        {u.videoUrl && <div className="mt-3"><UnitVideo url={u.videoUrl} title={u.name} unitId={u.id} /></div>}
        <div className="mt-auto pt-5 flex items-end justify-between gap-3 border-t border-stone-200/80">
          <div>
            <p className="text-2xl font-semibold font-mono" data-testid={`text-total-${u.id}`}>{money(u.totalPrice)}</p>
            <p className="text-xs text-stone-500">за {nights} {nightsWord(nights)}, {viewOnlyReason ? "ціна Servio для перегляду" : "онлайн-тариф"}</p>
            {viewOnlyReason && <p className="mt-1 text-xs text-amber-900">{viewOnlyReason}</p>}
            {policyBadge && <p className="mt-1 inline-block text-[11px] font-semibold text-red-800 bg-red-50 border border-red-200 rounded-md px-2 py-0.5">{policyBadge}</p>}
          </div>
          <button type="button" data-testid={`button-select-unit-${u.id}`} disabled={disabled || !!viewOnlyReason} onClick={() => { if (!viewOnlyReason) onSelect(); }}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1.5" style={{ background: accent }}>
            {viewOnlyReason ? "Лише перегляд" : active ? <><Check className="w-4 h-4" />Обрано</> : "Обрати"}
          </button>
        </div>
      </div>
    </article>
  );
}
