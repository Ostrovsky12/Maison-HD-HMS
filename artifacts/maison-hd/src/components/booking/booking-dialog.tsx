import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInCalendarDays, addDays } from "date-fns";
import { uk } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import {
  X, ChevronRight, ChevronLeft, BedDouble, Calendar, User, Star,
  Minus, Plus, Tag, Check, AlertTriangle, Loader2,
  FileText, Link2, CreditCard, Banknote, Copy, Send, ChevronDown,
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
  { value: "direct",    label: "🏨 Прямий (з сайту)" },
  { value: "phone",     label: "📞 Телефон" },
  { value: "walk_in",   label: "🚶 Walk-in (з вулиці)" },
  { value: "instagram", label: "📸 Instagram" },
  { value: "telegram",  label: "✈️ Telegram" },
  { value: "viber",     label: "💬 Viber" },
  { value: "booking",   label: "🌐 Booking.com" },
  { value: "airbnb",    label: "🏡 Airbnb" },
  { value: "expedia",   label: "✈️ Expedia" },
  { value: "olx",       label: "📋 OLX" },
  { value: "email",     label: "📧 Email" },
  { value: "corporate", label: "🏢 Корпоративний" },
  { value: "agent",     label: "🤝 Агент / Партнер" },
  { value: "referral",  label: "💎 Рекомендація" },
  { value: "repeat",    label: "🔄 Повторний гість" },
  { value: "other",     label: "❓ Інший" },
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
  source: "phone",
});

// ── Step config ────────────────────────────────────────────────────────────
const STEPS = [
  { key: "room",    label: "Номер", icon: BedDouble },
  { key: "guest",   label: "Гість", icon: User },
  { key: "details", label: "Деталі", icon: Star },
  { key: "payment", label: "Оплата", icon: CreditCard },
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
          {(() => {
            const selRate = form.rateId ? ratesData?.find((r: any) => r.id === form.rateId) : null;
            const rateTotal = selRate ? Number(selRate.pricePerNight) * nights : 0;
            const displayTotal = rateTotal > 0 ? rateTotal : (pricingPreview?.totalAmount || 0);
            const displayPerNight = nights > 0 ? Math.round(displayTotal / nights) : 0;
            return displayTotal > 0 ? (
              <div className="text-right">
                <div className="font-black text-indigo-700 text-xl">{fmt(displayTotal)}</div>
                <div className="text-xs text-indigo-400">{fmt(displayPerNight)}/ніч</div>
              </div>
            ) : null;
          })()}
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

// ── Action Card (helper) ──────────────────────────────────────────────────
const COLOR_MAP: Record<string, string> = {
  blue:   "border-blue-200 bg-blue-50 text-blue-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  emerald:"border-emerald-200 bg-emerald-50 text-emerald-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
};

function ActionCard({ icon, color, title, subtitle, expanded, onToggle, children }: {
  icon: React.ReactNode; color: string; title: string; subtitle: string;
  expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const cls = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <div className={`rounded-2xl border-2 transition-all ${expanded ? cls : "border-gray-100 bg-white hover:border-gray-200"}`}>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-4 p-4 text-left">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${expanded ? cls.split(" ").slice(0,2).join(" ") : "bg-gray-100 text-gray-500"}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-bold text-sm transition-colors ${expanded ? "text-gray-900" : "text-gray-700"}`}>{title}</div>
          <div className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <div className="border-t border-gray-100 pt-3">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 4: Payment Actions ────────────────────────────────────────────────
function StepPayment({ form, nights, pricingPreview, addonPriceMap, totalAmount, touristTax, touristTaxRate, unitsData, legalEntities, onConfirm, saving }: any) {
  const [expanded, setExpanded] = useState<"invoice" | "link" | "pay" | "arrival" | null>(null);
  const [legalEntityId, setLegalEntityId] = useState(() => legalEntities?.[0]?.id?.toString() || "");
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<"card" | "cash">("card");
  const [partialAmount, setPartialAmount] = useState<number>(() => Math.round(totalAmount * 0.5 * 100) / 100);
  const [usePartial, setUsePartial] = useState(false);

  // Sync default partial when totalAmount changes (first render)
  useEffect(() => {
    setPartialAmount(Math.round(totalAmount * 0.5 * 100) / 100);
  }, [totalAmount]);

  const unit     = unitsData?.find((u: any) => u.id === form.unitId);
  const guestFull = [form.lastName, form.firstName, form.middleName].filter(Boolean).join(" ");

  const copyLink = async () => {
    if (paymentLink) {
      await navigator.clipboard.writeText(paymentLink);
      toast({ title: "Посилання скопійовано" });
    }
  };
  const sendLink = () => {
    if (paymentLink) {
      const msg = encodeURIComponent(`Оплатіть бронювання за посиланням: ${paymentLink}`);
      window.open(`https://wa.me/?text=${msg}`, "_blank");
    }
  };
  const handleAction = async (type: "invoice" | "link" | "card" | "cash" | "arrival") => {
    const extra: any = {};
    if (type === "arrival") {
      extra.payOnArrival = true;
    } else if (usePartial && partialAmount > 0 && partialAmount < totalAmount) {
      extra.partialAmount = partialAmount;
    }
    // Link = save as PENDING (awaiting online payment), everything else = confirmed
    const saveStatus = type === "link" ? "pending" : "confirmed";
    const result = await onConfirm(saveStatus, type, extra);
    if (result && type === "link") {
      try {
        const lr = await authFetch(`${API}/bookings/${result.id}/payment-link`, { method: "POST" });
        const ld = await lr.json();
        if (lr.ok && ld.paymentLink) {
          setPaymentLink(ld.paymentLink);
          toast({ title: "✅ Посилання сформовано!", description: "Скопіюйте та надішліть гостю для оплати. Після оплати бронювання підтвердиться автоматично." });
        } else if (ld.error === "liqpay_not_configured") {
          toast({
            title: "LiqPay не налаштований",
            description: "Перейдіть у Налаштування → Юридичні особи та додайте LiqPay ключі",
            variant: "destructive",
          });
        } else {
          toast({ title: "Помилка генерації посилання", description: ld.error || "Спробуйте пізніше", variant: "destructive" });
        }
      } catch {
        toast({ title: "Помилка генерації посилання", variant: "destructive" });
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Mini summary */}
      <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100/60 p-4 space-y-2.5">
        {guestFull && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-black text-base shrink-0">
              {guestFull[0].toUpperCase()}
            </div>
            <div>
              <div className="font-bold text-gray-900 text-sm">{guestFull}</div>
              <div className="text-xs text-gray-400">{form.phone || "Без телефону"}</div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {unit && <span className="flex items-center gap-1.5 text-gray-700 font-medium"><BedDouble className="w-3.5 h-3.5 text-gray-400" />{unit.name}</span>}
          <span className="text-gray-300">·</span>
          <span className="text-gray-500">
            {form.checkIn ? format(new Date(form.checkIn), "d MMM", { locale: uk }) : "—"}
            {" → "}
            {form.checkOut ? format(new Date(form.checkOut), "d MMM", { locale: uk }) : "—"}
          </span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-500">{nights} {nightsLabel(nights)}</span>
        </div>
        {touristTax > 0 && (
          <div className="flex justify-between items-center text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
            <span className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              Туристичний збір ({touristTaxRate} ₴ × {form.adults || 1} гост. × {nights} ніч)
            </span>
            <span className="font-bold">{fmt(touristTax)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-2 border-t border-indigo-100/80">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">До сплати</span>
          <span className="text-2xl font-black text-indigo-700">{fmt(totalAmount)}</span>
        </div>

        {/* Часткова передоплата */}
        <div className="border border-indigo-100 rounded-xl p-3 space-y-2.5">
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <div
              onClick={() => setUsePartial(!usePartial)}
              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${usePartial ? "bg-indigo-500" : "bg-gray-200"}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${usePartial ? "translate-x-4" : ""}`} />
            </div>
            <span className="text-xs font-semibold text-gray-700">Часткова передоплата</span>
          </label>
          {usePartial && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {[25, 50, 100].map(pct => {
                  const amt = Math.round(totalAmount * pct / 100 * 100) / 100;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setPartialAmount(amt)}
                      className={`h-8 rounded-lg text-xs font-bold border-2 transition-all ${
                        partialAmount === amt
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200"
                      }`}
                    >
                      {pct === 100 ? "Повна" : `${pct}%`}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 shrink-0">Сума ₴</span>
                <input
                  type="number"
                  min={1}
                  max={totalAmount}
                  value={partialAmount}
                  onChange={e => setPartialAmount(Math.min(totalAmount, Math.max(0, Number(e.target.value))))}
                  className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
              </div>
              {partialAmount < totalAmount && (
                <div className="flex justify-between text-xs text-orange-700 bg-orange-50 rounded-lg px-2 py-1.5">
                  <span>Залишок (борг при заїзді)</span>
                  <span className="font-bold">{fmt(Math.round((totalAmount - partialAmount) * 100) / 100)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action 1 — Виставити рахунок */}
      <ActionCard
        icon={<FileText className="w-5 h-5" />}
        color="blue"
        title="Виставити рахунок"
        subtitle="Юридичний документ для оплати від бізнесу"
        expanded={expanded === "invoice"}
        onToggle={() => setExpanded(expanded === "invoice" ? null : "invoice")}
      >
        {legalEntities?.length > 0 ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Юридична особа</label>
              <select
                value={legalEntityId}
                onChange={e => setLegalEntityId(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 appearance-none"
              >
                {legalEntities.map((le: any) => (
                  <option key={le.id} value={String(le.id)}>{le.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => handleAction("invoice")}
              disabled={saving || !legalEntityId}
              className="w-full flex items-center justify-center gap-2 h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Виставити рахунок
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              Немає юридичних осіб. Додайте їх у Налаштуваннях → Юридичні особи.
            </p>
            <button
              type="button"
              onClick={() => handleAction("invoice")}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Виставити рахунок
            </button>
          </div>
        )}
      </ActionCard>

      {/* Action 2 — Посилання на оплату */}
      <ActionCard
        icon={<Link2 className="w-5 h-5" />}
        color="violet"
        title="Згенерувати посилання на оплату"
        subtitle="Надішліть гостю посилання для онлайн-оплати"
        expanded={expanded === "link"}
        onToggle={() => { if (!paymentLink) setExpanded(expanded === "link" ? null : "link"); }}
      >
        {paymentLink ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-xl">
              <Link2 className="w-4 h-4 text-violet-500 shrink-0" />
              <span className="text-xs text-violet-800 font-mono truncate flex-1">{paymentLink}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={sendLink}
                className="flex items-center justify-center gap-2 h-11 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors"
              >
                <Send className="w-4 h-4" /> Надіслати
              </button>
              <button
                type="button"
                onClick={copyLink}
                className="flex items-center justify-center gap-2 h-11 bg-white border-2 border-violet-200 hover:bg-violet-50 text-violet-700 rounded-xl text-sm font-bold transition-colors"
              >
                <Copy className="w-4 h-4" /> Скопіювати
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handleAction("link")}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 h-11 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Згенерувати посилання
          </button>
        )}
      </ActionCard>

      {/* Action 3 — Оплата на місці */}
      <ActionCard
        icon={<CreditCard className="w-5 h-5" />}
        color="emerald"
        title="Забронювати та Сплатити"
        subtitle={usePartial && partialAmount < totalAmount ? `Зараз: ${fmt(partialAmount)} · Борг: ${fmt(Math.round((totalAmount - partialAmount)*100)/100)}` : "Оплата картою через термінал або готівкою"}
        expanded={expanded === "pay"}
        onToggle={() => setExpanded(expanded === "pay" ? null : "pay")}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPayMethod("card")}
              className={`flex items-center justify-center gap-2 h-12 rounded-xl border-2 text-sm font-semibold transition-all ${
                payMethod === "card"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200"
              }`}
            >
              <CreditCard className="w-4 h-4" /> Картка (термінал)
            </button>
            <button
              type="button"
              onClick={() => setPayMethod("cash")}
              className={`flex items-center justify-center gap-2 h-12 rounded-xl border-2 text-sm font-semibold transition-all ${
                payMethod === "cash"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200"
              }`}
            >
              <Banknote className="w-4 h-4" /> Готівка
            </button>
          </div>
          <button
            type="button"
            onClick={() => handleAction(payMethod)}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {usePartial && partialAmount < totalAmount
              ? `${payMethod === "card" ? "Картка" : "Готівка"} — ${fmt(partialAmount)}`
              : payMethod === "card" ? "Оплачено карткою" : "Оплачено готівкою"}
          </button>
        </div>
      </ActionCard>

      {/* Action 4 — Розрахунок на місці */}
      <ActionCard
        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
        color="orange"
        title="Розрахунок на місці"
        subtitle="Зберегти бронювання без оплати — гість сплатить при заїзді"
        expanded={expanded === "arrival"}
        onToggle={() => setExpanded(expanded === "arrival" ? null : "arrival")}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 p-3 bg-orange-50 border border-orange-100 rounded-xl text-xs text-orange-800">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              Бронювання буде збережене зі статусом <strong>«Оплата при заїзді»</strong>. Ресепшн побачить цю мітку та зможе прийняти оплату (готівка або картка) при заїзді гостя.
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleAction("arrival")}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 h-11 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
            Зберегти — оплата при заїзді
          </button>
        </div>
      </ActionCard>
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

  // Reset form + step when opening fresh (not edit mode)
  useEffect(() => {
    if (open) {
      setStep(0);
      if (!booking) {
        setForm(emptyForm(unitId, initCheckIn, initCheckOut));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const { data: propertiesData } = useQuery<any[]>({
    queryKey: ["properties"],
    enabled: open,
    queryFn: () => authFetch(`${API}/properties`).then(r => r.ok ? r.json() : []),
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

  const { data: legalEntities } = useQuery<any[]>({
    queryKey: ["legal-entities"],
    enabled: open,
    queryFn: () => authFetch(`${API}/legal-entities`).then(r => r.ok ? r.json() : []),
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

  // Compute total — use rate price as fallback when unit has no base_price
  const selectedRate = ratesData?.find((r: any) => r.id === form.rateId);
  const selectedUnit = unitsData?.find((u: any) => u.id === form.unitId);
  const selectedProperty = propertiesData?.find((p: any) => p.id === (selectedUnit?.propertyId || selectedUnit?.property_id));
  const touristTaxRate = Number(selectedProperty?.tourist_tax_rate || 0);

  // Auto-fill check-in/check-out times from property settings (not in edit mode)
  useEffect(() => {
    if (!open || isEdit || !selectedProperty) return;
    const propIn  = selectedProperty.check_in_time  || selectedProperty.checkInTime;
    const propOut = selectedProperty.check_out_time || selectedProperty.checkOutTime;
    if (!propIn && !propOut) return;
    setForm(prev => ({
      ...prev,
      ...(propIn  ? { checkinTime:  propIn  } : {}),
      ...(propOut ? { checkoutTime: propOut } : {}),
    }));
  }, [selectedProperty?.id, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const touristTax = touristTaxRate > 0 ? Math.round(touristTaxRate * (form.adults || 1) * nights * 100) / 100 : 0;

  const previewTotal = pricingPreview?.totalAmount || 0;
  // If a specific rate is selected, its price takes priority over the preview total
  const rateBase = selectedRate ? Number(selectedRate.pricePerNight) * nights : 0;
  const base = rateBase > 0 ? rateBase : previewTotal;
  const addonCost = STANDARD_ADDONS.reduce((s, { key }) => {
    return form.selectedAddons[key] ? s + (addonPriceMap[key] || 0) * nights : s;
  }, 0);
  const discount = form.discountValue > 0
    ? form.discountType === "percent" ? (base + addonCost) * form.discountValue / 100 : form.discountValue
    : 0;
  const totalAmount = Math.max(0, Math.round((base + addonCost - discount + touristTax) * 100) / 100);

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

  const handleSave = async (status: "confirmed" | "pending", paymentMethod?: string, extra?: { payOnArrival?: boolean; partialAmount?: number }): Promise<any> => {
    if (!form.unitId) { toast({ title: "Виберіть номер", variant: "destructive" }); return null; }
    if (!form.checkIn || !form.checkOut || nights < 1) { toast({ title: "Вкажіть коректні дати", variant: "destructive" }); return null; }
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
        ...(paymentMethod && paymentMethod !== "arrival" && paymentMethod !== "link" && paymentMethod !== "invoice" && { paymentMethod }),
        ...(extra?.payOnArrival && { payOnArrival: true }),
        ...(extra?.partialAmount && extra.partialAmount < form.totalAmount && { partialAmount: extra.partialAmount }),
      };
      const url    = isEdit ? `${API}/bookings/${booking.id}` : `${API}/bookings`;
      const method = isEdit ? "PUT" : "POST";
      const r      = await authFetch(url, { method, body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Помилка"); }
      const saved = await r.json();
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      const payLabels: Record<string, string> = {
        invoice: "Рахунок виставлено",
        link:    "Бронювання збережено — генерую посилання…",
        card:    "Оплачено карткою",
        cash:    "Оплачено готівкою",
        arrival: "Збережено — оплата при заїзді",
      };
      // Don't show "saved" toast for link — it will show after link generation
      if (paymentMethod !== "link") {
        toast({ title: payLabels[paymentMethod || ""] || (isEdit ? "Бронювання оновлено" : "Бронювання створено") });
      }
      onSuccess?.(saved);
      if (paymentMethod !== "link") onClose();
      return saved;
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
      return null;
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
            <StepPayment
              form={form}
              nights={nights}
              pricingPreview={pricingPreview}
              addonPriceMap={addonPriceMap}
              totalAmount={totalAmount}
              touristTax={touristTax}
              touristTaxRate={touristTaxRate}
              unitsData={unitsData}
              legalEntities={legalEntities || []}
              onConfirm={handleSave}
              saving={saving}
            />
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

          {step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={() => { if (canGoNext()) setStep(s => s + 1); }}
              disabled={!canGoNext()}
              className="flex items-center gap-1.5 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-bold transition-colors shadow-sm shadow-indigo-500/25"
            >
              Далі <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === STEPS.length - 1 && isEdit && (
            <button
              type="button"
              onClick={() => handleSave("confirmed")}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-bold transition-colors shadow-sm shadow-indigo-500/25"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Зберегти зміни
            </button>
          )}
        </div>
      </div>
    </>
  );
}
