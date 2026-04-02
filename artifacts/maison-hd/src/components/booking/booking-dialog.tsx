import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInCalendarDays, addDays } from "date-fns";
import { uk } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import {
  X, ChevronRight, ChevronLeft, BedDouble, Calendar, User, Star,
  Minus, Plus, Tag, Check, AlertTriangle, Loader2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = BASE.replace("/maison-hd", "") + "/api";
const tok  = () => localStorage.getItem("hms_token");
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const fmt = (n: number) =>
  new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(n);

const nightsLabel = (n: number) => n === 1 ? "ніч" : n < 5 ? "ночі" : "ночей";

// ── Types ──────────────────────────────────────────────────────────────────
export interface BookingDialogProps {
  open: boolean;
  onClose: () => void;
  unitId?: number;
  unitName?: string;
  checkIn?: string;
  checkOut?: string;
  booking?: any;
  onSuccess?: (booking: any) => void;
}

interface BookingForm {
  unitId: number | "";
  checkIn: string;
  checkOut: string;
  checkinTime: string;
  checkoutTime: string;
  rateId: number | "";
  rateName: string;
  adults: number;
  childrenUnder6: number;
  childrenOver6: number;
  extraBeds: number;
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  notes: string;
  selectedAddons: Record<string, boolean>;
  discountValue: number;
  discountType: string;
  totalAmount: number;
  source: string;
}

const STANDARD_ADDONS = [
  { key: "animal_cat",    label: "З кішкою",         icon: "🐱" },
  { key: "animal_dog",    label: "З собакою",         icon: "🐶" },
  { key: "baby_cot",      label: "Дитяче ліжечко",   icon: "🛏" },
  { key: "baby_chair",    label: "Дитячий стілець",   icon: "🪑" },
  { key: "extra_pillows", label: "Доп. подушки",      icon: "🛋" },
  { key: "extra_blanket", label: "Доп. ковдра",       icon: "🛌" },
  { key: "double_bed",    label: "Суцільне ліжко",    icon: "🛏" },
];

const SOURCE_OPTIONS = [
  { value: "direct",  label: "Прямий" },
  { value: "booking", label: "Booking.com" },
  { value: "airbnb",  label: "Airbnb" },
  { value: "other",   label: "Інший" },
];

const emptyForm = (unitId?: number, checkIn?: string, checkOut?: string): BookingForm => ({
  unitId: unitId || "",
  checkIn: checkIn || format(new Date(), "yyyy-MM-dd"),
  checkOut: checkOut || format(addDays(new Date(), 1), "yyyy-MM-dd"),
  checkinTime: "14:00",
  checkoutTime: "12:00",
  rateId: "",
  rateName: "",
  adults: 1,
  childrenUnder6: 0,
  childrenOver6: 0,
  extraBeds: 0,
  lastName: "",
  firstName: "",
  middleName: "",
  phone: "",
  notes: "",
  selectedAddons: {},
  discountValue: 0,
  discountType: "percent",
  totalAmount: 0,
  source: "direct",
});

// ── Step config ────────────────────────────────────────────────────────────
const STEPS = [
  { key: "room",    label: "Номер", icon: BedDouble },
  { key: "guest",   label: "Гість", icon: User },
  { key: "details", label: "Деталі", icon: Star },
  { key: "confirm", label: "Підтвердження", icon: Check },
];

// ── Sub-components ─────────────────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="space-y-0">{children}</div>;
}

function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400
        focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all ${className}`}
    />
  );
}

function Select({ value, onChange, children, placeholder }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900
        focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all appearance-none"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {children}
    </select>
  );
}

function Stepper({ value, onChange, min = 0, max = 20, label, sub }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; sub?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div>
        <div className="text-sm font-medium text-gray-800">{label}</div>
        {sub && <div className="text-xs text-gray-400">{sub}</div>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-5 text-center text-base font-bold text-gray-900">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Step 1: Room + Dates ───────────────────────────────────────────────────
function StepRoom({ form, f, unitsData, ratesData, pricingPreview, draftConflict, setDraftConflict, qc }: any) {
  const nights = form.checkIn && form.checkOut
    ? Math.max(0, differenceInCalendarDays(new Date(form.checkOut), new Date(form.checkIn)))
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <Label required>Номер / Юніт</Label>
        <Select value={form.unitId ? String(form.unitId) : ""} onChange={v => f("unitId", parseInt(v))} placeholder="Виберіть номер або об'єкт...">
          {unitsData?.map((u: any) => (
            <option key={u.id} value={String(u.id)}>
              {u.name}{u.category ? ` — ${u.category}` : ""}
            </option>
          ))}
        </Select>
      </div>

      {/* Date row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label required>Дата заїзду</Label>
          <Input type="date" value={form.checkIn} onChange={e => f("checkIn", e.target.value)} />
        </div>
        <div>
          <Label required>Дата виїзду</Label>
          <Input type="date" value={form.checkOut} min={form.checkIn} onChange={e => f("checkOut", e.target.value)} />
        </div>
      </div>

      {/* Time row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Час заїзду</Label>
          <Input type="time" value={form.checkinTime} onChange={e => f("checkinTime", e.target.value)} />
        </div>
        <div>
          <Label>Час виїзду</Label>
          <Input type="time" value={form.checkoutTime} onChange={e => f("checkoutTime", e.target.value)} />
        </div>
      </div>

      {/* Nights badge */}
      {nights > 0 && (
        <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
          <Calendar className="w-5 h-5 text-indigo-500 shrink-0" />
          <div className="flex-1">
            <span className="font-bold text-indigo-700 text-xl">{nights}</span>
            <span className="text-indigo-500 ml-1 text-sm">{nightsLabel(nights)}</span>
          </div>
          {pricingPreview?.total > 0 && (
            <div className="text-right">
              <div className="font-black text-indigo-700 text-xl">{fmt(pricingPreview.total)}</div>
              <div className="text-xs text-indigo-400">{fmt(Math.round(pricingPreview.total / nights))}/ніч</div>
            </div>
          )}
        </div>
      )}

      {/* Тариф */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Тариф</Label>
          <Select
            value={form.rateId ? String(form.rateId) : "custom"}
            onChange={v => {
              if (v === "custom") { f("rateId", ""); f("rateName", "Індивідуальний"); return; }
              const rate = ratesData?.find((r: any) => r.id === parseInt(v));
              f("rateId", parseInt(v));
              f("rateName", rate?.name || "");
            }}
          >
            <option value="custom">Індивідуальний</option>
            {ratesData?.map((r: any) => (
              <option key={r.id} value={String(r.id)}>
                {r.name} — {fmt(Number(r.pricePerNight))}/ніч
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Канал продажу</Label>
          <Select value={form.source} onChange={v => f("source", v)}>
            {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
      </div>

      {/* Draft conflict */}
      {draftConflict && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Існує чернетка бронювання</p>
            <p className="text-xs text-amber-600 mt-0.5">Гість: {draftConflict.guestName}</p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setDraftConflict(null)}
                className="text-xs px-3 py-1.5 bg-white border border-amber-200 rounded-lg text-amber-700 font-semibold hover:bg-amber-50"
              >
                Зберегти чернетку
              </button>
              <button
                type="button"
                onClick={async () => {
                  await authFetch(`${API}/bookings/${draftConflict.id}`, { method: "DELETE" });
                  setDraftConflict(null);
                  qc.invalidateQueries({ queryKey: ["calendar"] });
                }}
                className="text-xs px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-red-600 font-semibold hover:bg-red-100"
              >
                Скасувати чернетку
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 2: Guest info ────────────────────────────────────────────────────
function StepGuest({ form, f }: any) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3 sm:col-span-1">
          <Label>Прізвище</Label>
          <Input placeholder="Іванченко" value={form.lastName} onChange={e => f("lastName", e.target.value)} />
        </div>
        <div>
          <Label>Ім'я</Label>
          <Input placeholder="Олексій" value={form.firstName} onChange={e => f("firstName", e.target.value)} />
        </div>
        <div>
          <Label>По батькові</Label>
          <Input placeholder="Михайлович" value={form.middleName} onChange={e => f("middleName", e.target.value)} />
        </div>
      </div>

      <div>
        <Label required>Телефон</Label>
        <Input type="tel" placeholder="+380 XX XXX XX XX" value={form.phone} onChange={e => f("phone", e.target.value)} />
      </div>

      {/* Guest preview card */}
      {(form.lastName || form.firstName || form.phone) && (
        <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-2xl border border-gray-100">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-black text-lg shrink-0">
            {(form.lastName || form.firstName || "G")[0].toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-gray-900">{[form.lastName, form.firstName, form.middleName].filter(Boolean).join(" ") || "—"}</div>
            <div className="text-sm text-gray-400">{form.phone || "Телефон не вказано"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Details / Addons ──────────────────────────────────────────────
function StepDetails({ form, f, addonPriceMap, nights }: any) {
  const [showDiscount, setShowDiscount] = useState(false);

  return (
    <div className="space-y-6">
      {/* Occupancy */}
      <div>
        <Label>Кількість гостей</Label>
        <div className="bg-gray-50 rounded-2xl border border-gray-100 px-4">
          <Stepper value={form.adults}         onChange={v => f("adults", v)}         min={1} label="Дорослі" />
          <Stepper value={form.childrenOver6}  onChange={v => f("childrenOver6", v)}        label="Діти 6–12 років" />
          <Stepper value={form.childrenUnder6} onChange={v => f("childrenUnder6", v)}        label="Діти до 6 років" />
          <Stepper value={form.extraBeds}      onChange={v => f("extraBeds", v)}             label="Додаткові місця" sub="Нарахується за стандартною ставкою" />
        </div>
      </div>

      {/* Addons */}
      <div>
        <Label>Додаткові опції</Label>
        <div className="grid grid-cols-2 gap-2">
          {STANDARD_ADDONS.map(({ key, label, icon }) => {
            const active = !!form.selectedAddons[key];
            const price  = addonPriceMap[key] || 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => f("selectedAddons", { ...form.selectedAddons, [key]: !active })}
                className={`flex items-center gap-2.5 p-3 rounded-2xl border-2 text-left transition-all ${
                  active ? "border-indigo-400 bg-indigo-50" : "border-gray-100 bg-gray-50 hover:border-gray-200"
                }`}
              >
                <span className="text-xl">{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-semibold ${active ? "text-indigo-700" : "text-gray-700"}`}>{label}</div>
                  {price > 0 && <div className="text-[10px] text-gray-400">{fmt(price)}/ніч · {fmt(price * nights)}</div>}
                </div>
                {active && <Check className="w-4 h-4 text-indigo-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Discount */}
      <div>
        <button
          type="button"
          onClick={() => setShowDiscount(s => !s)}
          className={`flex items-center gap-2 text-sm font-semibold transition-colors ${showDiscount ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}
        >
          <Tag className="w-4 h-4" />
          {form.discountValue > 0 ? `Знижка: −${form.discountType === "percent" ? `${form.discountValue}%` : fmt(form.discountValue)}` : "Додати знижку"}
        </button>
        {showDiscount && (
          <div className="mt-3 p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
            <input
              type="number"
              min="0"
              value={form.discountValue || ""}
              onChange={e => f("discountValue", Number(e.target.value))}
              placeholder="0"
              className="w-24 h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            />
            <div className="flex rounded-xl overflow-hidden border border-gray-200">
              {[{ v: "percent", l: "%" }, { v: "fixed", l: "₴" }].map(o => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => f("discountType", o.v)}
                  className={`px-4 h-10 text-sm font-bold transition-colors ${form.discountType === o.v ? "bg-indigo-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <Label>Примітки</Label>
        <textarea
          value={form.notes}
          onChange={e => f("notes", e.target.value)}
          rows={3}
          placeholder="Особливі побажання, алергії, поверх..."
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none transition-all"
        />
      </div>
    </div>
  );
}

// ── Step 4: Confirm / Summary ─────────────────────────────────────────────
function StepConfirm({ form, nights, pricingPreview, addonPriceMap, totalAmount, unitsData }: any) {
  const unit   = unitsData?.find((u: any) => u.id === form.unitId);
  const addons = Object.entries(form.selectedAddons).filter(([, v]) => v).map(([k]) => k);

  const baseCost  = pricingPreview?.total || 0;
  const addonCost = addons.reduce((s, k) => s + (addonPriceMap[k] || 0) * nights, 0);
  const discount  = form.discountValue > 0
    ? form.discountType === "percent" ? (baseCost + addonCost) * form.discountValue / 100 : form.discountValue
    : 0;

  const guestFull = [form.lastName, form.firstName, form.middleName].filter(Boolean).join(" ");

  return (
    <div className="space-y-5">
      {/* Guest */}
      {guestFull && (
        <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100/50">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-black text-lg shrink-0">
            {guestFull[0].toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-gray-900">{guestFull}</div>
            <div className="text-sm text-gray-400">{form.phone || "Без телефону"}</div>
          </div>
        </div>
      )}

      {/* Stay */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: "Заїзд",  value: form.checkIn  ? format(new Date(form.checkIn),  "d MMM", { locale: uk }) : "—" },
          { label: "Виїзд",  value: form.checkOut ? format(new Date(form.checkOut), "d MMM", { locale: uk }) : "—" },
          { label: "Ночей",  value: String(nights) },
        ].map(t => (
          <div key={t.label} className="bg-gray-50 rounded-2xl p-3.5 text-center border border-gray-100">
            <div className="text-lg font-black text-gray-900">{t.value}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Unit */}
      {unit && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border border-gray-100">
          <BedDouble className="w-5 h-5 text-gray-400 shrink-0" />
          <span className="text-sm font-semibold text-gray-800">{unit.name}</span>
          {unit.category && <span className="text-xs text-gray-400">{unit.category}</span>}
        </div>
      )}

      {/* Price breakdown */}
      <div className="rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Розрахунок</span>
        </div>
        <div className="px-4 py-2 space-y-1">
          {baseCost > 0 && (
            <div className="flex justify-between py-2 text-sm">
              <span className="text-gray-600">Проживання ({nights} {nightsLabel(nights)})</span>
              <span className="font-semibold text-gray-900">{fmt(baseCost)}</span>
            </div>
          )}
          {addonCost > 0 && (
            <div className="flex justify-between py-2 text-sm border-t border-gray-50">
              <span className="text-gray-600">Додаткові послуги</span>
              <span className="font-semibold text-gray-900">{fmt(addonCost)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between py-2 text-sm border-t border-gray-50">
              <span className="text-emerald-600">Знижка {form.discountType === "percent" ? `(${form.discountValue}%)` : ""}</span>
              <span className="font-semibold text-emerald-600">−{fmt(discount)}</span>
            </div>
          )}
        </div>
        <div className="flex justify-between items-baseline px-4 py-4 border-t border-gray-100 bg-gradient-to-r from-indigo-50 to-violet-50">
          <span className="text-sm font-bold text-gray-600">Разом</span>
          <span className="text-2xl font-black text-indigo-700">{fmt(totalAmount)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function BookingDialog({ open, onClose, unitId, unitName, checkIn: initCheckIn, checkOut: initCheckOut, booking, onSuccess }: BookingDialogProps) {
  const qc     = useQueryClient();
  const isEdit = !!booking;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draftConflict, setDraftConflict] = useState<any>(null);

  const [form, setForm] = useState<BookingForm>(() => {
    if (booking) {
      return {
        unitId: booking.unitId || "",
        checkIn: booking.checkIn || "",
        checkOut: booking.checkOut || "",
        checkinTime: booking.checkinTime || "14:00",
        checkoutTime: booking.checkoutTime || "12:00",
        rateId: booking.rateId || "",
        rateName: booking.rateName || "",
        adults: booking.adults || 1,
        childrenUnder6: booking.childrenUnder6 || 0,
        childrenOver6: booking.childrenOver6 || 0,
        extraBeds: booking.extraBeds || 0,
        lastName: booking.lastName || "",
        firstName: booking.firstName || "",
        middleName: booking.middleName || "",
        phone: booking.phone || "",
        notes: booking.notes || "",
        selectedAddons: booking.selectedAddons || {},
        discountValue: Number(booking.discountValue || 0),
        discountType: booking.discountType || "percent",
        totalAmount: Number(booking.totalAmount || 0),
        source: booking.source || "direct",
      };
    }
    return emptyForm(unitId, initCheckIn, initCheckOut);
  });

  const f = (field: keyof BookingForm, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const nights = form.checkIn && form.checkOut
    ? Math.max(0, differenceInCalendarDays(new Date(form.checkOut), new Date(form.checkIn)))
    : 0;

  // Reset to step 0 when opening fresh
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // Data fetches
  const { data: unitsData } = useQuery<any[]>({
    queryKey: ["units"],
    enabled: open,
    queryFn: () => authFetch(`${API}/units`).then(r => r.ok ? r.json() : []),
  });

  const { data: ratesData } = useQuery<any[]>({
    queryKey: ["rates"],
    enabled: open,
    queryFn: () => authFetch(`${API}/rates`).then(r => r.ok ? r.json() : []),
  });

  const { data: addonsData } = useQuery<any[]>({
    queryKey: ["addons"],
    enabled: open,
    queryFn: () => authFetch(`${API}/addons`).then(r => r.ok ? r.json() : []),
  });

  const { data: pricingPreview } = useQuery<any>({
    queryKey: ["pricing-preview", form.unitId, form.checkIn, form.checkOut],
    enabled: open && !!form.unitId && !!form.checkIn && !!form.checkOut && nights > 0,
    queryFn: () => authFetch(`${API}/bookings/pricing-preview?unitId=${form.unitId}&checkIn=${form.checkIn}&checkOut=${form.checkOut}`)
      .then(r => r.ok ? r.json() : null),
  });

  // Draft conflict check
  useEffect(() => {
    if (!open || isEdit || !form.unitId || !form.checkIn || !form.checkOut || nights < 1) return;
    authFetch(`${API}/bookings/check-draft?unitId=${form.unitId}&checkIn=${form.checkIn}&checkOut=${form.checkOut}`)
      .then(r => r.json())
      .then(d => { if (d.hasDraft) setDraftConflict(d.draft); })
      .catch(() => {});
  }, [form.unitId, form.checkIn, form.checkOut, open]);

  // Addon price map
  const addonPriceMap: Record<string, number> = {};
  addonsData?.forEach((a: any) => {
    const key = a.name?.toLowerCase().replace(/\s+/g, "_");
    if (key) addonPriceMap[key] = Number(a.price || 0);
  });

  // Compute total
  const base = pricingPreview?.total || 0;
  const addonCost = STANDARD_ADDONS.reduce((s, { key }) => {
    return form.selectedAddons[key] ? s + (addonPriceMap[key] || 0) * nights : s;
  }, 0);
  const discount = form.discountValue > 0
    ? form.discountType === "percent" ? (base + addonCost) * form.discountValue / 100 : form.discountValue
    : 0;
  const totalAmount = Math.max(0, Math.round((base + addonCost - discount) * 100) / 100);

  // Sync totalAmount into form for save
  useEffect(() => {
    if (totalAmount !== form.totalAmount) f("totalAmount", totalAmount);
  }, [totalAmount]);

  // Validate per step
  const canGoNext = () => {
    if (step === 0) return !!form.unitId && !!form.checkIn && !!form.checkOut && nights >= 1;
    if (step === 1) return true; // guest info optional
    return true;
  };

  const handleSave = async (status: "confirmed" | "pending") => {
    if (!form.unitId) { toast({ title: "Виберіть номер", variant: "destructive" }); return; }
    if (!form.checkIn || !form.checkOut || nights < 1) { toast({ title: "Вкажіть коректні дати", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = {
        unitId: form.unitId,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        checkinTime: form.checkinTime,
        checkoutTime: form.checkoutTime,
        status,
        source: form.source,
        rateId: form.rateId || undefined,
        rateName: form.rateName || undefined,
        adults: form.adults,
        childrenUnder6: form.childrenUnder6,
        childrenOver6: form.childrenOver6,
        extraBeds: form.extraBeds,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        middleName: form.middleName || undefined,
        phone: form.phone || undefined,
        totalAmount: form.totalAmount,
        discountValue: form.discountValue || undefined,
        discountType: form.discountType || undefined,
        selectedAddons: form.selectedAddons,
        notes: form.notes || undefined,
      };
      const url    = isEdit ? `${API}/bookings/${booking.id}` : `${API}/bookings`;
      const method = isEdit ? "PUT" : "POST";
      const r      = await authFetch(url, { method, body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Помилка"); }
      const saved = await r.json();
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      toast({ title: isEdit ? "Бронювання оновлено" : "Бронювання створено" });
      onSuccess?.(saved);
      onClose();
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />

      {/* Slide-over panel */}
      <div className={`fixed top-0 right-0 h-screen w-[560px] max-w-full z-50 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>

        {/* ── Header ── */}
        <div className="shrink-0 px-6 pt-6 pb-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-black text-gray-900">{isEdit ? "Редагувати бронювання" : "Нове бронювання"}</h2>
              {unitName && <p className="text-sm text-gray-400 mt-0.5">{unitName}</p>}
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => {
              const done    = i < step;
              const current = i === step;
              return (
                <div key={s.key} className="flex items-center gap-1 flex-1">
                  <button
                    type="button"
                    onClick={() => { if (done) setStep(i); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex-1 justify-center ${
                      current ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/30"
                      : done   ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 cursor-pointer"
                      : "bg-gray-100 text-gray-400 cursor-default"
                    }`}
                  >
                    {done ? <Check className="w-3 h-3 shrink-0" /> : <s.icon className="w-3 h-3 shrink-0" />}
                    <span className="hidden sm:inline truncate">{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={`w-4 h-0.5 shrink-0 rounded-full transition-colors ${done ? "bg-emerald-300" : "bg-gray-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 0 && (
            <StepRoom form={form} f={f} unitsData={unitsData} ratesData={ratesData} pricingPreview={pricingPreview} draftConflict={draftConflict} setDraftConflict={setDraftConflict} qc={qc} />
          )}
          {step === 1 && (
            <StepGuest form={form} f={f} />
          )}
          {step === 2 && (
            <StepDetails form={form} f={f} addonPriceMap={addonPriceMap} nights={nights} />
          )}
          {step === 3 && (
            <StepConfirm form={form} nights={nights} pricingPreview={pricingPreview} addonPriceMap={addonPriceMap} totalAmount={totalAmount} unitsData={unitsData} />
          )}
        </div>

        {/* ── Footer nav ── */}
        <div className="shrink-0 px-6 py-5 border-t border-gray-100 flex items-center gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1.5 px-5 py-3 rounded-2xl border border-gray-200 text-sm text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Назад
            </button>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex-1" />

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => { if (canGoNext()) setStep(s => s + 1); }}
              disabled={!canGoNext()}
              className="flex items-center gap-1.5 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-bold transition-colors shadow-sm shadow-indigo-500/25"
            >
              Далі <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex gap-2">
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => handleSave("pending")}
                  disabled={saving}
                  className="px-5 py-3 rounded-2xl border border-gray-200 text-sm text-gray-600 font-semibold hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  Зберегти як чернетку
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSave("confirmed")}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-bold transition-colors shadow-sm shadow-indigo-500/25"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {isEdit ? "Зберегти зміни" : "Підтвердити бронювання"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
