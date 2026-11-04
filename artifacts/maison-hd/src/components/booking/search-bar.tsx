import { CalendarDays, Building2, Minus, Plus, Search, Users } from "lucide-react";

type Props = {
  properties: { id: number; name: string }[];
  propertyId: string; setPropertyId: (v: string) => void;
  checkIn: string; setCheckIn: (v: string) => void;
  checkOut: string; setCheckOut: (v: string) => void;
  guests: number; setGuests: (v: number) => void;
  minDate: string; searching: boolean; onSearch: () => void; accent: string;
};

const seg = "flex-1 min-w-0 px-5 py-3 rounded-full hover:bg-stone-100 focus-within:bg-white focus-within:shadow-[0_6px_20px_-6px_rgba(0,0,0,0.25)] transition";
const lbl = "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-800";
const inp = "w-full bg-transparent text-sm text-stone-700 outline-none mt-0.5";

export function SearchBar(p: Props) {
  const nights = Math.round((new Date(p.checkOut).getTime() - new Date(p.checkIn).getTime()) / 86400000);
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); p.onSearch(); }}
      className="rounded-[28px] md:rounded-full bg-white border border-stone-200 shadow-[0_10px_40px_-12px_rgba(30,30,30,0.25)] p-2 flex flex-col md:flex-row md:items-center gap-1">
      {p.properties.length > 1 ? (
        <label className={seg}>
          <span className={lbl}><Building2 className="w-3.5 h-3.5" />Об'єкт</span>
          <select data-testid="select-property" value={p.propertyId} onChange={(e) => p.setPropertyId(e.target.value)} className={`${inp} appearance-none cursor-pointer`}>
            {p.properties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      ) : (
        <div className={seg}>
          <span className={lbl}><Building2 className="w-3.5 h-3.5" />Об'єкт</span>
          <p className="text-sm text-stone-700 mt-0.5 truncate">{p.properties[0]?.name ?? "—"}</p>
        </div>
      )}
      <span className="hidden md:block w-px h-8 bg-stone-200" />
      <label className={seg}>
        <span className={lbl}><CalendarDays className="w-3.5 h-3.5" />Заїзд</span>
        <input data-testid="input-checkin" type="date" min={p.minDate} value={p.checkIn} onChange={(e) => p.setCheckIn(e.target.value)} className={inp} />
      </label>
      <span className="hidden md:block w-px h-8 bg-stone-200" />
      <label className={seg}>
        <span className={lbl}><CalendarDays className="w-3.5 h-3.5" />Виїзд{nights > 0 ? <span className="normal-case tracking-normal font-normal text-stone-500">· {nights} ноч.</span> : null}</span>
        <input data-testid="input-checkout" type="date" min={p.checkIn} value={p.checkOut} onChange={(e) => p.setCheckOut(e.target.value)} className={inp} />
      </label>
      <span className="hidden md:block w-px h-8 bg-stone-200" />
      <div className={`${seg} md:flex-[0.9]`}>
        <span className={lbl}><Users className="w-3.5 h-3.5" />Дорослих</span>
        <div className="flex items-center gap-2 mt-0.5">
          <button type="button" aria-label="Менше гостей" onClick={() => p.setGuests(Math.max(1, p.guests - 1))} disabled={p.guests <= 1}
            className="w-6 h-6 rounded-full border border-stone-300 flex items-center justify-center disabled:opacity-30" data-testid="button-guests-minus"><Minus className="w-3 h-3" /></button>
          <input data-testid="input-guests" type="number" min={1} max={20} value={p.guests} aria-label="Кількість дорослих"
            onChange={(e) => p.setGuests(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="w-8 text-center bg-transparent text-sm outline-none" />
          <button type="button" aria-label="Більше гостей" onClick={() => p.setGuests(Math.min(20, p.guests + 1))} disabled={p.guests >= 20}
            className="w-6 h-6 rounded-full border border-stone-300 flex items-center justify-center disabled:opacity-30" data-testid="button-guests-plus"><Plus className="w-3 h-3" /></button>
        </div>
      </div>
      <button data-testid="button-search" type="submit" disabled={p.searching}
        className="h-12 md:h-14 md:w-auto px-6 rounded-full text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60 shrink-0"
        style={{ background: p.accent }}>
        <Search className="w-4 h-4" />{p.searching ? "Пошук..." : "Знайти"}
      </button>
    </form>
  );
}
