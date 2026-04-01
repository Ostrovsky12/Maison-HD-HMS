import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, differenceInCalendarDays, addDays } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  CalendarDays, Clock, Users, PawPrint, FileText, Link2, Copy,
  Send, Printer, AlertCircle, ChevronDown, ChevronUp, Percent, X, Tag,
  Minus, Plus,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const tok = () => localStorage.getItem("hms_token");
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

// ── Standard addon keys ──────────────────────────────────────────
const STANDARD_ADDONS = [
  { key: "animal_cat", label: "З кішкою 🐱", icon: "🐱" },
  { key: "animal_dog", label: "З собакою 🐶", icon: "🐶" },
  { key: "baby_cot", label: "Дитяче ліжечко", icon: "🛏" },
  { key: "baby_chair", label: "Дитячий стілець", icon: "🪑" },
  { key: "extra_pillows", label: "Додаткові подушки", icon: "🛋" },
  { key: "extra_blanket", label: "Додаткова ковдра", icon: "🛌" },
  { key: "double_bed", label: "Суцільне ліжко", icon: "🛏" },
];

// ── Types ───────────────────────────────────────────────────────
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
  discountId: number | "";
  discountValue: number;
  discountType: string;
  totalAmount: number;
  source: string;
}

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
  discountId: "",
  discountValue: 0,
  discountType: "",
  totalAmount: 0,
  source: "direct",
});

// ── Number stepper helper ────────────────────────────────────────
function Stepper({ value, onChange, min = 0, max = 20, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground flex-1">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="h-7 w-7 rounded-full border flex items-center justify-center hover:bg-muted disabled:opacity-40" disabled={value <= min}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-6 text-center text-sm font-medium">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="h-7 w-7 rounded-full border flex items-center justify-center hover:bg-muted disabled:opacity-40" disabled={value >= max}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────
export function BookingDialog({ open, onClose, unitId, unitName, checkIn: initCheckIn, checkOut: initCheckOut, booking, onSuccess }: BookingDialogProps) {
  const qc = useQueryClient();
  const isEdit = !!booking;
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
        discountId: booking.discountId || "",
        discountValue: Number(booking.discountValue || 0),
        discountType: booking.discountType || "",
        totalAmount: Number(booking.totalAmount || 0),
        source: booking.source || "direct",
      };
    }
    return emptyForm(unitId, initCheckIn, initCheckOut);
  });

  // Sub-dialog states
  const [draftConflict, setDraftConflict] = useState<any>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showDiscounts, setShowDiscounts] = useState(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [selectedLegalEntity, setSelectedLegalEntity] = useState<string>("");
  const [payerDetails, setPayerDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const invoicePrintRef = useRef<HTMLDivElement>(null);

  const f = (field: keyof BookingForm, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const nights = form.checkIn && form.checkOut
    ? Math.max(0, differenceInCalendarDays(new Date(form.checkOut), new Date(form.checkIn)))
    : 0;

  // Fetch units (for selector when no unitId is preselected)
  const { data: unitsData } = useQuery<any[]>({
    queryKey: ["units"],
    enabled: open && !unitId,
    queryFn: async () => {
      const r = await authFetch(`${API}/units`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  // Fetch data
  const { data: ratesData } = useQuery<any[]>({
    queryKey: ["rates"],
    enabled: open,
    queryFn: async () => {
      const r = await authFetch(`${API}/rates`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: addonsData } = useQuery<any[]>({
    queryKey: ["addons"],
    enabled: open,
    queryFn: async () => {
      const r = await authFetch(`${API}/addons`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: discountTypes } = useQuery<any[]>({
    queryKey: ["discount-types"],
    enabled: open,
    queryFn: async () => {
      const r = await authFetch(`${API}/discount-types`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: legalEntities } = useQuery<any[]>({
    queryKey: ["legal-entities"],
    enabled: open,
    queryFn: async () => {
      const r = await authFetch(`${API}/legal-entities`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: pricingPreview } = useQuery<any>({
    queryKey: ["pricing-preview", form.unitId, form.checkIn, form.checkOut],
    enabled: open && !!form.unitId && !!form.checkIn && !!form.checkOut && nights > 0,
    queryFn: async () => {
      const r = await authFetch(`${API}/bookings/pricing-preview?unitId=${form.unitId}&checkIn=${form.checkIn}&checkOut=${form.checkOut}`);
      if (!r.ok) return null;
      return r.json();
    },
  });

  // Compute addon prices map
  const addonPriceMap: Record<string, number> = {};
  if (addonsData) {
    addonsData.forEach((a: any) => {
      const key = a.name?.toLowerCase().replace(/\s+/g, "_");
      if (key) addonPriceMap[key] = Number(a.price || 0);
    });
  }

  // Calculate total
  useEffect(() => {
    let base = pricingPreview?.total || 0;
    if (!base && pricingPreview?.breakdown) {
      base = pricingPreview.breakdown.reduce((sum: number, d: any) => sum + d.price, 0);
    }
    // Add addon costs
    let addonTotal = 0;
    STANDARD_ADDONS.forEach(({ key }) => {
      if (form.selectedAddons[key]) {
        const price = addonPriceMap[key] || 0;
        addonTotal += price * nights;
      }
    });
    let total = base + addonTotal;
    // Apply discount
    if (form.discountValue > 0) {
      const disc = form.discountType === "percent"
        ? total * form.discountValue / 100
        : form.discountValue;
      total = Math.max(0, total - disc);
    }
    if (total !== form.totalAmount) f("totalAmount", Math.round(total * 100) / 100);
  }, [pricingPreview, form.selectedAddons, form.discountValue, form.discountType, nights]);

  // Draft conflict check
  useEffect(() => {
    if (!open || isEdit || !form.unitId || !form.checkIn || !form.checkOut || nights < 1) return;
    authFetch(`${API}/bookings/check-draft?unitId=${form.unitId}&checkIn=${form.checkIn}&checkOut=${form.checkOut}`)
      .then(r => r.json())
      .then(data => {
        if (data.hasDraft) setDraftConflict(data.draft);
      })
      .catch(() => {});
  }, [form.unitId, form.checkIn, form.checkOut, open]);

  const handleSave = async (status: "confirmed" | "pending" | "draft") => {
    if (!form.unitId) { toast({ title: "Виберіть номер/об'єкт", variant: "destructive" }); return; }
    if (!form.checkIn || !form.checkOut) { toast({ title: "Вкажіть дати", variant: "destructive" }); return; }
    if (nights < 1) { toast({ title: "Дата виїзду має бути пізніше дати заїзду", variant: "destructive" }); return; }

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
        discountId: form.discountId || undefined,
        discountValue: form.discountValue || undefined,
        discountType: form.discountType || undefined,
        selectedAddons: form.selectedAddons,
        notes: form.notes || undefined,
      };

      const url = isEdit ? `${API}/bookings/${booking.id}` : `${API}/bookings`;
      const method = isEdit ? "PUT" : "POST";
      const r = await authFetch(url, { method, body: JSON.stringify(body) });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Помилка збереження");
      }
      const saved = await r.json();

      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });

      if (status === "draft") {
        toast({ title: "Чернетку збережено", description: "Бронювання зарезервовано на 6 годин" });
      } else {
        toast({ title: isEdit ? "Бронювання оновлено" : "Бронювання створено" });
      }

      onSuccess?.(saved);
      onClose();
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePaymentLink = async (legalEntityId: string) => {
    if (!isEdit || !booking?.id) {
      toast({ title: "Спочатку збережіть бронювання", variant: "destructive" });
      return;
    }
    try {
      const r = await authFetch(`${API}/bookings/${booking.id}/payment-link`, {
        method: "POST",
        body: JSON.stringify({ legalEntityId: legalEntityId ? parseInt(legalEntityId) : undefined }),
      });
      if (!r.ok) throw new Error("Помилка генерації посилання");
      const data = await r.json();
      setPaymentResult(data);
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    }
  };

  const handleGetInvoice = async () => {
    if (!isEdit || !booking?.id) {
      toast({ title: "Спочатку збережіть бронювання", variant: "destructive" });
      return;
    }
    try {
      const params = new URLSearchParams();
      if (selectedLegalEntity) params.set("legalEntityId", selectedLegalEntity);
      if (payerDetails) params.set("payerDetails", JSON.stringify({ name: payerDetails }));
      const r = await authFetch(`${API}/bookings/${booking.id}/invoice?${params}`);
      if (!r.ok) throw new Error("Помилка отримання рахунку");
      const data = await r.json();
      setInvoiceData(data);
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    }
  };

  const handlePrintInvoice = () => {
    const printContent = invoicePrintRef.current?.innerHTML;
    if (!printContent) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Рахунок</title><style>
      body{font-family:Arial,sans-serif;padding:20px;color:#000}
      table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #ccc;text-align:left}
      th{background:#f5f5f5}.total{font-weight:bold;font-size:1.1em}.header{display:flex;justify-content:space-between}
      h2{margin-top:0}
    </style></head><body>${printContent}</body></html>`);
    win.document.close();
    win.print();
  };

  const selectedDiscount = discountTypes?.find((d: any) => d.id === form.discountId);

  const fmt = (n: number) => new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(n);

  const totalGuests = form.adults + form.childrenUnder6 + form.childrenOver6;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0">
          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-3 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5 text-primary" />
              {isEdit ? "Редагувати бронювання" : "Нове бронювання"}
              {form.unitId && unitName && <Badge variant="secondary" className="ml-2 font-normal">{unitName}</Badge>}
            </DialogTitle>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Unit selector — shown only when no unit is preselected */}
            {!unitId && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Номер / Об'єкт</Label>
                <Select value={form.unitId ? String(form.unitId) : ""} onValueChange={v => f("unitId", parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Виберіть номер або об'єкт..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unitsData?.map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name} {u.category ? `(${u.category})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Draft conflict warning */}
            {draftConflict && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-medium text-amber-800">Існує чернетка бронювання</p>
                  <p className="text-amber-700 mt-0.5">
                    Гість: <strong>{draftConflict.guestName}</strong> {draftConflict.phone ? `· ${draftConflict.phone}` : ""}
                    <span className="ml-2 text-xs text-amber-600">
                      (діє до {draftConflict.draftExpiresAt ? format(new Date(draftConflict.draftExpiresAt), "HH:mm") : "?"})
                    </span>
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDraftConflict(null)}>
                      Продовжити чернетку
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={async () => {
                      await authFetch(`${API}/bookings/${draftConflict.id}`, { method: "DELETE" });
                      setDraftConflict(null);
                      qc.invalidateQueries({ queryKey: ["calendar"] });
                    }}>
                      Скасувати чернетку
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Section 1: Дати та час ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-muted-foreground" /> Дати та час
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Заїзд</Label>
                  <div className="flex gap-2">
                    <Input type="date" value={form.checkIn} onChange={e => f("checkIn", e.target.value)} className="flex-1" />
                    <Input type="time" value={form.checkinTime} onChange={e => f("checkinTime", e.target.value)} className="w-24" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Виїзд</Label>
                  <div className="flex gap-2">
                    <Input type="date" value={form.checkOut} min={form.checkIn} onChange={e => f("checkOut", e.target.value)} className="flex-1" />
                    <Input type="time" value={form.checkoutTime} onChange={e => f("checkoutTime", e.target.value)} className="w-24" />
                  </div>
                </div>
              </div>
              {nights > 0 && (
                <p className="text-xs text-muted-foreground">
                  Тривалість: <strong>{nights} {nights === 1 ? "ніч" : nights < 5 ? "ночі" : "ночей"}</strong>
                </p>
              )}
            </div>

            {/* ── Section 2: Тариф ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Tag className="h-4 w-4 text-muted-foreground" /> Тариф / Прайс
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Обраний тариф</Label>
                  <Select value={form.rateId ? String(form.rateId) : "custom"} onValueChange={v => {
                    if (v === "custom") { f("rateId", ""); f("rateName", "Індивідуальний"); return; }
                    const rate = ratesData?.find((r: any) => r.id === parseInt(v));
                    f("rateId", parseInt(v));
                    f("rateName", rate?.name || "");
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Виберіть тариф" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Індивідуальний</SelectItem>
                      {ratesData?.map((rate: any) => (
                        <SelectItem key={rate.id} value={String(rate.id)}>
                          {rate.name} — {fmt(Number(rate.pricePerNight))}/ніч
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Канал продажу</Label>
                  <Select value={form.source} onValueChange={v => f("source", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">Прямий</SelectItem>
                      <SelectItem value="booking">Booking.com</SelectItem>
                      <SelectItem value="airbnb">Airbnb</SelectItem>
                      <SelectItem value="other">Інший</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {pricingPreview && (
                <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Базова вартість: <strong className="text-foreground">{fmt(pricingPreview.total || 0)}</strong>
                  {nights > 0 && <span className="ml-2">· {fmt(Math.round((pricingPreview.total || 0) / nights))}/ніч</span>}
                </div>
              )}
            </div>

            {/* ── Section 3: Гості ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Users className="h-4 w-4 text-muted-foreground" /> Кількість гостей
              </h3>
              <div className="rounded-lg border p-4 space-y-3">
                <Stepper value={form.adults} onChange={v => f("adults", v)} min={1} label="Дорослі" />
                <Stepper value={form.childrenOver6} onChange={v => f("childrenOver6", v)} label="Діти (старше 6 років)" />
                <Stepper value={form.childrenUnder6} onChange={v => f("childrenUnder6", v)} label="Діти (до 6 років)" />
                <div className="pt-2 border-t">
                  <Stepper value={form.extraBeds} onChange={v => f("extraBeds", v)} label="Додаткові місця" />
                </div>
                <p className="text-xs text-muted-foreground pt-1">Всього гостей: <strong>{totalGuests}</strong>, місць: <strong>{form.adults + form.extraBeds}</strong></p>
              </div>
            </div>

            {/* ── Section 4: Додаткові послуги ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <PawPrint className="h-4 w-4 text-muted-foreground" /> Додатково
              </h3>
              <div className="rounded-lg border p-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
                {STANDARD_ADDONS.map(({ key, label }) => {
                  const price = addonPriceMap[key] || 0;
                  return (
                    <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                      <Checkbox
                        checked={!!form.selectedAddons[key]}
                        onCheckedChange={checked => {
                          f("selectedAddons", { ...form.selectedAddons, [key]: !!checked });
                        }}
                      />
                      <span className="text-sm group-hover:text-primary transition-colors flex-1">{label}</span>
                      {price > 0 && (
                        <span className="text-xs text-muted-foreground">{fmt(price)}/ніч</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* ── Section 5: Дані гостя ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Users className="h-4 w-4 text-muted-foreground" /> Дані гостя
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Прізвище</Label>
                  <Input placeholder="Іванченко" value={form.lastName} onChange={e => f("lastName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Ім'я</Label>
                  <Input placeholder="Олексій" value={form.firstName} onChange={e => f("firstName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">По батькові</Label>
                  <Input placeholder="Михайлович" value={form.middleName} onChange={e => f("middleName", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Контактний телефон</Label>
                <Input type="tel" placeholder="+380 XX XXX XX XX" value={form.phone} onChange={e => f("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Примітки</Label>
                <Textarea rows={2} placeholder="Особливі побажання, коментарі..." value={form.notes} onChange={e => f("notes", e.target.value)} className="resize-none" />
              </div>
            </div>

            {/* ── Section 6: Знижки ── */}
            <div className="space-y-2">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                onClick={() => setShowDiscounts(!showDiscounts)}
              >
                <Percent className="h-4 w-4 text-muted-foreground" />
                Знижка
                {form.discountId && selectedDiscount && (
                  <Badge variant="secondary" className="ml-1 font-normal text-xs">{selectedDiscount.name}</Badge>
                )}
                {showDiscounts ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
              </button>
              {showDiscounts && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {discountTypes?.map((d: any) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          if (form.discountId === d.id) {
                            f("discountId", ""); f("discountValue", 0); f("discountType", "");
                          } else {
                            f("discountId", d.id);
                            f("discountValue", Number(d.value));
                            f("discountType", d.valueType);
                          }
                        }}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition-all hover:border-primary ${form.discountId === d.id ? "border-primary bg-primary/5" : ""}`}
                      >
                        <div className="font-medium">{d.name}</div>
                        <div className="text-xs text-muted-foreground">
                          −{d.value}{d.valueType === "percent" ? "%" : " ₴"}
                        </div>
                      </button>
                    ))}
                  </div>
                  {form.discountId && (
                    <div className="flex items-center gap-3 text-sm">
                      <Label className="text-xs text-muted-foreground">Розмір знижки:</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          className="w-20 h-7 text-sm"
                          value={form.discountValue}
                          onChange={e => f("discountValue", Number(e.target.value))}
                        />
                        <Select value={form.discountType} onValueChange={v => f("discountType", v)}>
                          <SelectTrigger className="w-20 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">%</SelectItem>
                            <SelectItem value="fixed">₴</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <button type="button" onClick={() => { f("discountId", ""); f("discountValue", 0); f("discountType", ""); }} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Price summary ── */}
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Базова вартість ({nights} ніч/ночей)</span>
                <span>{fmt(pricingPreview?.total || 0)}</span>
              </div>
              {Object.entries(form.selectedAddons).filter(([, v]) => !!v).map(([key]) => {
                const addon = STANDARD_ADDONS.find(a => a.key === key);
                const price = addonPriceMap[key] || 0;
                if (!addon || price === 0) return null;
                return (
                  <div key={key} className="flex items-center justify-between text-sm mt-1">
                    <span className="text-muted-foreground">{addon.label}</span>
                    <span>+{fmt(price * nights)}</span>
                  </div>
                );
              })}
              {form.discountValue > 0 && (
                <div className="flex items-center justify-between text-sm mt-1 text-green-700">
                  <span>Знижка ({selectedDiscount?.name || ""})</span>
                  <span>−{form.discountType === "percent" ? `${form.discountValue}%` : fmt(form.discountValue)}</span>
                </div>
              )}
              <div className="flex items-center justify-between font-semibold text-base mt-2 pt-2 border-t">
                <span>До сплати</span>
                <span className="text-primary">{fmt(form.totalAmount)}</span>
              </div>
              {/* Manual override */}
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Сума (ручне коригування):</span>
                <Input
                  type="number"
                  value={form.totalAmount}
                  onChange={e => f("totalAmount", Number(e.target.value))}
                  className="h-6 w-28 text-xs"
                />
                <span>₴</span>
              </div>
            </div>

          </div>{/* end scroll area */}

          {/* Footer */}
          <DialogFooter className="px-6 py-4 border-t flex-shrink-0 flex-wrap gap-2">
            <div className="flex gap-2 flex-1 flex-wrap">
              {/* Draft button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 border-dashed border-gray-400 text-gray-600 hover:border-gray-600"
                disabled={saving}
                onClick={() => handleSave("draft")}
              >
                <Clock className="h-3.5 w-3.5" /> Чернетка
              </Button>

              {/* Payment link */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => { setShowPaymentDialog(true); setPaymentResult(null); }}
              >
                <Link2 className="h-3.5 w-3.5" /> Посилання на оплату
              </Button>

              {/* Invoice */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => { setShowInvoiceDialog(true); setInvoiceData(null); }}
              >
                <FileText className="h-3.5 w-3.5" /> Рахунок
              </Button>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Скасувати</Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={saving}
                onClick={() => handleSave("confirmed")}
              >
                {saving ? "Збереження..." : isEdit ? "Зберегти" : "Підтвердити"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payment Link Dialog ── */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Посилання на оплату
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Юридична особа</Label>
              <Select value={selectedLegalEntity} onValueChange={setSelectedLegalEntity}>
                <SelectTrigger>
                  <SelectValue placeholder="Виберіть юр. особу" />
                </SelectTrigger>
                <SelectContent>
                  {legalEntities?.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name} ({e.type.toUpperCase()})</SelectItem>
                  ))}
                  <SelectItem value="">Без юр. особи</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">Сума: <strong>{fmt(form.totalAmount)}</strong></div>

            {!paymentResult ? (
              <Button className="w-full gap-2" onClick={() => handleGeneratePaymentLink(selectedLegalEntity)}>
                <Link2 className="h-4 w-4" /> Згенерувати посилання
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-muted p-3 text-xs break-all">{paymentResult.paymentLink}</div>
                {paymentResult.isSandbox && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">Тестовий режим</Badge>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-1.5" onClick={() => {
                    navigator.clipboard.writeText(paymentResult.paymentLink);
                    toast({ title: "Скопійовано!" });
                  }}>
                    <Copy className="h-4 w-4" /> Копіювати
                  </Button>
                  <Button variant="outline" className="flex-1 gap-1.5" onClick={() => {
                    const text = encodeURIComponent(`Посилання на оплату: ${paymentResult.paymentLink}`);
                    window.open(`https://t.me/share/url?url=${text}`, "_blank");
                  }}>
                    <Send className="h-4 w-4" /> Telegram
                  </Button>
                </div>
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setPaymentResult(null)}>
                  Скасувати
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Invoice Dialog ── */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Рахунок-фактура
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {!invoiceData ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Юридична особа (продавець)</Label>
                  <Select value={selectedLegalEntity} onValueChange={setSelectedLegalEntity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Виберіть юр. особу" />
                    </SelectTrigger>
                    <SelectContent>
                      {legalEntities?.map((e: any) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Реквізити платника (покупця)</Label>
                  <Textarea
                    rows={4}
                    placeholder={"Вставте реквізити отримані від замовника:\nНазва організації, ЄДРПОУ, адреса..."}
                    value={payerDetails}
                    onChange={e => setPayerDetails(e.target.value)}
                    className="resize-none text-sm"
                  />
                </div>
                <Button className="w-full gap-2" onClick={handleGetInvoice}>
                  <FileText className="h-4 w-4" /> Сформувати рахунок
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Printable invoice */}
                <div ref={invoicePrintRef} className="border rounded-lg p-6 text-sm space-y-4 bg-white">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold">Рахунок #{invoiceData.invoiceNumber}</h2>
                      <p className="text-muted-foreground">Від {invoiceData.date}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>Бронювання #{invoiceData.booking.id}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">ПРОДАВЕЦЬ</p>
                      <p className="font-medium">{invoiceData.seller?.name}</p>
                      {invoiceData.seller?.type && <p className="text-xs">{invoiceData.seller.type.toUpperCase()}</p>}
                      {invoiceData.seller?.edrpou && <p className="text-xs">ЄДРПОУ: {invoiceData.seller.edrpou}</p>}
                      {invoiceData.seller?.iban && <p className="text-xs">IBAN: {invoiceData.seller.iban}</p>}
                      {invoiceData.seller?.bank && <p className="text-xs">Банк: {invoiceData.seller.bank}</p>}
                      {invoiceData.seller?.address && <p className="text-xs">{invoiceData.seller.address}</p>}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">ПОКУПЕЦЬ</p>
                      {invoiceData.buyer?.name ? (
                        <p className="font-medium whitespace-pre-wrap text-xs">{invoiceData.buyer.name}</p>
                      ) : (
                        <p className="font-medium">{invoiceData.booking.guestName}</p>
                      )}
                      {invoiceData.booking.phone && <p className="text-xs">{invoiceData.booking.phone}</p>}
                    </div>
                  </div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="border px-3 py-2 text-left">Опис</th>
                        <th className="border px-3 py-2 text-center">К-сть</th>
                        <th className="border px-3 py-2 text-right">Сума</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border px-3 py-2">
                          Проживання: {invoiceData.booking.unitName}<br />
                          <span className="text-xs text-muted-foreground">
                            {invoiceData.booking.checkIn} {invoiceData.booking.checkinTime} — {invoiceData.booking.checkOut} {invoiceData.booking.checkoutTime}
                          </span>
                        </td>
                        <td className="border px-3 py-2 text-center">{invoiceData.booking.nights} ніч</td>
                        <td className="border px-3 py-2 text-right font-medium">{fmt(invoiceData.booking.totalAmount)}</td>
                      </tr>
                      {invoiceData.booking.paidAmount > 0 && (
                        <tr className="text-green-700">
                          <td className="border px-3 py-2" colSpan={2}>Сплачено</td>
                          <td className="border px-3 py-2 text-right">−{fmt(invoiceData.booking.paidAmount)}</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold">
                        <td className="border px-3 py-2" colSpan={2}>До сплати</td>
                        <td className="border px-3 py-2 text-right text-lg">{fmt(invoiceData.booking.dueAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" className="gap-1.5" onClick={handlePrintInvoice}>
                    <Printer className="h-4 w-4" /> Роздрукувати
                  </Button>
                  <Button variant="outline" className="gap-1.5" onClick={() => {
                    const text = encodeURIComponent(`Рахунок #${invoiceData.invoiceNumber}: ${fmt(invoiceData.booking.dueAmount)}`);
                    window.open(`https://t.me/share/url?url=${text}`, "_blank");
                  }}>
                    <Send className="h-4 w-4" /> Telegram
                  </Button>
                  <Button variant="ghost" className="gap-1.5 ml-auto" onClick={() => setInvoiceData(null)}>
                    Змінити реквізити
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
