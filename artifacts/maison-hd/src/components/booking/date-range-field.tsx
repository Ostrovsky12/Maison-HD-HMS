import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { uk } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

export const MAX_NIGHTS = 31;
const parse = (v: string) => { const d = new Date(v + "T00:00:00"); return isNaN(d.getTime()) ? undefined : d; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const add = (d: Date, k: number) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
const big = (v: string) => { const d = parse(v); return d ? d.toLocaleDateString("uk-UA", { day: "numeric", month: "long" }) : "Оберіть дату"; };
const wd = (v: string) => { const d = parse(v); return d ? d.toLocaleDateString("uk-UA", { weekday: "long" }) : ""; };
const nightsWord = (n: number) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? "ніч" : a >= 2 && a <= 4 && (b < 12 || b > 14) ? "ночі" : "ночей"; };

type Props = {
  checkIn: string; setCheckIn: (v: string) => void;
  checkOut: string; setCheckOut: (v: string) => void;
  minDate: string;
};

/** DOGODA date-range picker: two triggers (arrival / departure) share one Ukrainian calendar. Values stay YYYY-MM-DD. */
export function DateRangeFields(p: Props) {
  const [open, setOpen] = useState<null | "in" | "out">(null);
  const [months, setMonths] = useState(2);
  const [month, setMonth] = useState<Date>(() => parse(p.checkIn) ?? new Date());
  const box = useRef<HTMLDivElement>(null);
  const arrivalTrigger = useRef<HTMLButtonElement>(null);
  const departureTrigger = useRef<HTMLButtonElement>(null);
  const min = parse(p.minDate) ?? new Date();
  const ci = parse(p.checkIn), co = parse(p.checkOut);
  const nights = ci && co ? Math.round((co.getTime() - ci.getTime()) / 86400000) : 0;
  const close = () => {
    const trigger = open === "out" ? departureTrigger.current : arrivalTrigger.current;
    setOpen(null);
    requestAnimationFrame(() => trigger?.focus());
  };

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const f = () => setMonths(mq.matches ? 2 : 1); f();
    mq.addEventListener("change", f); return () => mq.removeEventListener("change", f);
  }, []);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const openAt = (f: "in" | "out") => { setMonth((f === "out" ? co : ci) ?? min); setOpen((x) => (x === f ? null : f)); };

  const pick = (d: Date) => {
    const v = ymd(d);
    if (open === "in" || !ci || d <= ci) {
      p.setCheckIn(v);
      if (!co || co <= d || (co.getTime() - d.getTime()) / 86400000 > MAX_NIGHTS) p.setCheckOut(ymd(add(d, 1)));
      setOpen("out");
      return;
    }
    p.setCheckOut(v);
    close();
  };

  const disabled = open === "out" && ci ? [{ before: add(ci, 1) }, { after: add(ci, MAX_NIGHTS) }] : [{ before: min }];
  const manualDate = (field: "in" | "out", value: string) => {
    const date = parse(value);
    if (!date || value < p.minDate) return;
    if (field === "in") {
      p.setCheckIn(value);
      if (!co || co <= date || co > add(date, MAX_NIGHTS)) p.setCheckOut(ymd(add(date, 1)));
    } else if (ci && date > ci && date <= add(ci, MAX_NIGHTS)) {
      p.setCheckOut(value);
    }
  };

  const trigger = (f: "in" | "out", label: string, v: string, testid: string) => (
    <div className={`dg-search-field dg-search-date dg-date-trigger ${open === f ? "is-active" : ""}`}>
      <button ref={f === "in" ? arrivalTrigger : departureTrigger} type="button" data-testid={`button-open-${testid}`} aria-haspopup="dialog" aria-expanded={open === f}
        aria-label={`${label}: ${big(v)}. Відкрити календар`} onClick={() => openAt(f)} className="dg-date-btn">
        <span className="dg-date-lbl"><CalendarDays className="w-3.5 h-3.5" />{label}</span>
        <span className="dg-date-val">{big(v)}</span>
        <span className="dg-date-wd">{wd(v)}</span>
      </button>
      <label className="sr-only focus-within:not-sr-only">{label} (ввести вручну, РРРР-ММ-ДД)
        <input data-testid={`input-${testid}`} type="date" min={f === "in" ? p.minDate : ci ? ymd(add(ci, 1)) : p.minDate}
          max={f === "out" && ci ? ymd(add(ci, MAX_NIGHTS)) : undefined} value={v}
          onChange={(e) => manualDate(f, e.target.value)} />
      </label>
    </div>
  );

  return (
    <div ref={box} className="dg-dates">
      {trigger("in", "Заїзд", p.checkIn, "checkin")}
      <span aria-hidden className="dg-date-sep">{nights > 0 ? <><b>{nights}</b>{nightsWord(nights)}</> : "—"}</span>
      {trigger("out", "Виїзд", p.checkOut, "checkout")}
      {open && (
        <div role="dialog" aria-modal="false" aria-label={open === "in" ? "Оберіть дату заїзду" : "Оберіть дату виїзду"} className="dg-cal" data-testid="panel-calendar">
          <div className="dg-cal-head">
            <div className="dg-cal-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={open === "in"} onClick={() => setOpen("in")} data-testid="tab-calendar-checkin">
                <small>Заїзд</small>{big(p.checkIn)}
              </button>
              <ChevronRight aria-hidden className="w-4 h-4 opacity-50" />
              <button type="button" role="tab" aria-selected={open === "out"} onClick={() => setOpen("out")} data-testid="tab-calendar-checkout">
                <small>Виїзд</small>{big(p.checkOut)}
              </button>
            </div>
            <button type="button" aria-label="Закрити календар" onClick={close} className="dg-cal-x" data-testid="button-close-calendar"><X className="w-4 h-4" /></button>
          </div>
          <p className="dg-cal-hint" aria-live="polite">
            {open === "in" ? "Оберіть день заїзду" : `Оберіть день виїзду, до ${MAX_NIGHTS} ночей`}
          </p>
          <DayPicker
            mode="range" locale={uk} numberOfMonths={months} month={month} onMonthChange={setMonth}
            selected={{ from: ci, to: co }} onDayClick={(d, m) => { if (!m.disabled) pick(d); }}
            disabled={disabled} startMonth={min} autoFocus showOutsideDays={false}
            components={{ Chevron: ({ orientation }) => orientation === "left" ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" /> }}
            classNames={{
              root: "dg-dp", months: "dg-dp-months", month: "dg-dp-month", month_caption: "dg-dp-caption", caption_label: "dg-dp-caption-label",
              nav: "dg-dp-nav", button_previous: "dg-dp-navbtn", button_next: "dg-dp-navbtn", month_grid: "dg-dp-grid", weekdays: "dg-dp-wds",
              weekday: "dg-dp-wd", week: "dg-dp-week", day: "dg-dp-day", day_button: "dg-dp-btn", selected: "is-sel",
              range_start: "is-start", range_middle: "is-mid", range_end: "is-end", today: "is-today", disabled: "is-off", hidden: "is-hidden",
            }}
          />
          <div className="dg-cal-foot">
            <span>{nights > 0 ? `${nights} ${nightsWord(nights)}` : ""}</span>
            <button type="button" onClick={close} className="dg-cal-done" data-testid="button-calendar-done">Готово</button>
          </div>
        </div>
      )}
    </div>
  );
}
