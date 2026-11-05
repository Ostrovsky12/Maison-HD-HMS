import { DateRangeFields } from "@/components/booking/date-range-field";
import { CalendarDays, Building2, Baby, Minus, Plus, Search, Users, X } from "lucide-react";

export const MAX_PARTY = 20;

type Props = {
  properties: { id: number; name: string }[];
  /** Display-only hotel name for provider inventory; never a local property ID. */
  hotelName?: string;
  propertyId: string; setPropertyId: (v: string) => void;
  checkIn: string; setCheckIn: (v: string) => void;
  checkOut: string; setCheckOut: (v: string) => void;
  guests: number; setGuests: (v: number) => void;
  minDate: string; searching: boolean; onSearch: () => void; accent: string;
  /** When provided, children with mandatory ages (0–17) can be added. Each null entry is an unselected age. */
  childAges?: (number | null)[]; setChildAges?: (v: (number | null)[]) => void;
  /** Closed sales: search button is honestly disabled. */
  locked?: boolean; lockedNote?: string;
  /** DOGODA: custom Ukrainian range calendar instead of native date inputs. */
  rangeCalendar?: boolean;
};

const seg = "flex-1 min-w-0 px-5 py-3 rounded-full hover:bg-stone-100 focus-within:bg-white focus-within:shadow-[0_6px_20px_-6px_rgba(0,0,0,0.25)] transition";
const lbl = "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-800";
const inp = "w-full bg-transparent text-sm text-stone-700 outline-none mt-0.5";
const stepBtn = "w-6 h-6 rounded-full border border-stone-300 flex items-center justify-center disabled:opacity-30";
const AGES = Array.from({ length: 18 }, (_, i) => i);
const ageLabel = (a: number) => (a === 0 ? "до 1 року" : a === 1 ? "1 рік" : a < 5 ? `${a} роки` : `${a} років`);

export function SearchBar(p: Props) {
  const nights = Math.round((new Date(p.checkOut).getTime() - new Date(p.checkIn).getTime()) / 86400000);
  const ages = p.childAges ?? [];
  const withKids = !!p.setChildAges;
  const total = p.guests + ages.length;
  const full = total >= MAX_PARTY;
  const setAge = (i: number, v: number | null) => p.setChildAges?.(ages.map((a, j) => (j === i ? v : a)));
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); if (!p.locked) p.onSearch(); }}
      className={`dg-search relative ${withKids && ages.length ? "rounded-[28px]" : "rounded-[28px] md:rounded-full"} bg-white border border-stone-200 shadow-[0_10px_40px_-12px_rgba(30,30,30,0.25)] p-2`}>
      <div className="dg-search-fields flex flex-col md:flex-row md:items-center gap-1">
        {p.properties.length > 1 ? (
          <label className={`${seg} dg-search-field dg-search-property`}>
            <span className={lbl}><Building2 className="w-3.5 h-3.5" />Об'єкт</span>
            <select data-testid="select-property" value={p.propertyId} onChange={(e) => p.setPropertyId(e.target.value)} className={`${inp} appearance-none cursor-pointer`}>
              {p.properties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        ) : (
          <div className={`${seg} dg-search-field dg-search-property`}>
            <span className={lbl}><Building2 className="w-3.5 h-3.5" />Об'єкт</span>
            <p data-testid="text-search-property" className={`text-sm text-stone-700 mt-0.5 ${p.rangeCalendar ? "dg-prop-name" : "truncate"}`} title={p.hotelName || p.properties[0]?.name}>{p.hotelName || p.properties[0]?.name || "—"}</p>
          </div>
        )}
        {p.rangeCalendar ? <>
          <span className="hidden md:block w-px h-8 bg-stone-200" />
          <DateRangeFields checkIn={p.checkIn} setCheckIn={p.setCheckIn} checkOut={p.checkOut} setCheckOut={p.setCheckOut} minDate={p.minDate} />
        </> : <>
        <span className="hidden md:block w-px h-8 bg-stone-200" />
        <label className={`${seg} dg-search-field dg-search-date`}>
          <span className={lbl}><CalendarDays className="w-3.5 h-3.5" />Заїзд</span>
          <input data-testid="input-checkin" type="date" min={p.minDate} value={p.checkIn} onChange={(e) => p.setCheckIn(e.target.value)} className={inp} />
        </label>
        <span className="hidden md:block w-px h-8 bg-stone-200" />
        <label className={`${seg} dg-search-field dg-search-date`}>
          <span className={lbl}><CalendarDays className="w-3.5 h-3.5" />Виїзд{nights > 0 ? <span className="normal-case tracking-normal font-normal text-stone-500">· {nights} ноч.</span> : null}</span>
          <input data-testid="input-checkout" type="date" min={p.checkIn} value={p.checkOut} onChange={(e) => p.setCheckOut(e.target.value)} className={inp} />
        </label>
        </>}
        <span className="hidden md:block w-px h-8 bg-stone-200" />
        <div className={`${seg} dg-search-field dg-search-party md:flex-[0.9]`}>
          <span className={lbl}><Users className="w-3.5 h-3.5" />Дорослих</span>
          <div className="dg-search-counter flex items-center gap-2 mt-0.5">
            <button type="button" aria-label="Менше дорослих" onClick={() => p.setGuests(Math.max(1, p.guests - 1))} disabled={p.guests <= 1}
              className={stepBtn} data-testid="button-guests-minus"><Minus className="w-3 h-3" /></button>
            <input data-testid="input-guests" type="number" min={1} max={MAX_PARTY - ages.length} value={p.guests} aria-label="Кількість дорослих"
              onChange={(e) => p.setGuests(Math.max(1, Math.min(MAX_PARTY - ages.length, Number(e.target.value) || 1)))} className="w-8 text-center bg-transparent text-sm outline-none" />
            <button type="button" aria-label="Більше дорослих" onClick={() => p.setGuests(Math.min(MAX_PARTY - ages.length, p.guests + 1))} disabled={full}
              className={stepBtn} data-testid="button-guests-plus"><Plus className="w-3 h-3" /></button>
          </div>
        </div>
        {withKids && <>
          <span className="hidden md:block w-px h-8 bg-stone-200" />
          <div className={`${seg} dg-search-field dg-search-party md:flex-[0.9]`}>
            <span className={lbl}><Baby className="w-3.5 h-3.5" />Дітей</span>
            <div className="dg-search-counter flex items-center gap-2 mt-0.5">
              <button type="button" aria-label="Прибрати дитину" onClick={() => p.setChildAges?.(ages.slice(0, -1))} disabled={ages.length === 0}
                className={stepBtn} data-testid="button-children-minus"><Minus className="w-3 h-3" /></button>
              <span className="w-8 text-center text-sm" data-testid="text-children-count">{ages.length}</span>
              <button type="button" aria-label="Додати дитину" onClick={() => p.setChildAges?.([...ages, null])} disabled={full}
                className={stepBtn} data-testid="button-children-plus"><Plus className="w-3 h-3" /></button>
            </div>
          </div>
        </>}
        <button data-testid="button-search" type="submit" disabled={p.searching || p.locked}
          className="dg-search-action h-12 md:h-14 md:w-auto px-6 rounded-full text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60 shrink-0"
          style={{ background: p.accent }}>
          <Search className="w-4 h-4" />{p.locked ? "Пошук вимкнено" : p.searching ? "Пошук..." : "Знайти"}
        </button>
      </div>
      {withKids && ages.length > 0 && (
        <div className="px-4 pt-3 pb-2 mt-1 border-t border-stone-200" data-testid="panel-child-ages">
          <p className="text-xs text-stone-600 mb-2">Вкажіть вік кожної дитини на дату заїзду (0–17 років). Без віку пошук неможливий.</p>
          <div className="flex flex-wrap gap-2">
            {ages.map((a, i) => (
              <div key={i} className={`flex items-center gap-1 rounded-full border pl-3 pr-1 py-1 ${a === null ? "border-red-400" : "border-stone-300"}`}>
                <label className="text-xs text-stone-700 flex items-center gap-1.5">
                  <span>Дитина {i + 1}</span>
                  <select data-testid={`select-child-age-${i}`} aria-label={`Вік дитини ${i + 1}`} aria-invalid={a === null} value={a === null ? "" : String(a)}
                    onChange={(e) => setAge(i, e.target.value === "" ? null : Number(e.target.value))}
                    className="bg-transparent text-sm outline-none cursor-pointer">
                    <option value="">вік?</option>
                    {AGES.map((x) => <option key={x} value={x}>{ageLabel(x)}</option>)}
                  </select>
                </label>
                <button type="button" aria-label={`Прибрати дитину ${i + 1}`} data-testid={`button-remove-child-${i}`}
                  onClick={() => p.setChildAges?.(ages.filter((_, j) => j !== i))} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-stone-100"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      {full && withKids && <p className="px-4 pb-2 text-xs text-stone-600" data-testid="text-party-cap">Максимум {MAX_PARTY} гостей в одному бронюванні.</p>}
      {p.locked && p.lockedNote && <p className="px-4 pb-2 pt-1 text-xs text-stone-600" data-testid="text-search-locked">{p.lockedNote}</p>}
    </form>
  );
}
