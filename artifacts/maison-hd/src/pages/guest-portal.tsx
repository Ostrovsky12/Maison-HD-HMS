import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { format, differenceInCalendarDays, parseISO, isAfter } from "date-fns";
import { uk } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  CalendarDays, MapPin, Users, Star, CheckCircle2, Clock, CreditCard,
  Wifi, Coffee, Car, Sparkles, ChevronRight, Phone, Loader2, AlertCircle,
  ShoppingBag, Home, UserCheck, Send, Heart, MessageSquare, ArrowLeft,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";

type Tab = "reservation" | "checkin" | "services" | "payment";

interface BookingData {
  booking: {
    id: number;
    checkIn: string;
    checkOut: string;
    checkinTime: string;
    checkoutTime: string;
    status: string;
    paymentStatus: string;
    totalAmount: string;
    paidAmount: string;
    adults: number;
    childrenUnder6: number;
    childrenOver6: number;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    notes: string | null;
    paymentLink: string | null;
    checkinFormSubmitted: boolean;
    checkinFormData: Record<string, string>;
    selectedAddons: Record<string, boolean | string>;
    unitName: string;
    unitCategory: string;
    unitDescription: string | null;
    unitCapacity: number;
    unitHasBalcony: boolean | null;
    unitHasView: string | null;
    unitSquareMeters: string | null;
    propertyName: string;
    propertyAddress: string | null;
    orgName: string;
  };
  orders: any[];
}

interface Service {
  id: string;
  type: string;
  icon: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  available: boolean;
  slots?: string[];
  perDay?: boolean;
}

const statusMap: Record<string, { label: string; color: string }> = {
  pending:    { label: "Очікує підтвердження", color: "bg-yellow-100 text-yellow-800" },
  confirmed:  { label: "Підтверджено",         color: "bg-green-100 text-green-800" },
  checked_in: { label: "Ви в готелі",          color: "bg-blue-100 text-blue-800" },
  checked_out:{ label: "Виїзд завершено",      color: "bg-gray-100 text-gray-700" },
  cancelled:  { label: "Скасовано",            color: "bg-red-100 text-red-700" },
  draft:      { label: "Чернетка",             color: "bg-gray-100 text-gray-600" },
};

const paymentStatusMap: Record<string, { label: string; color: string }> = {
  unpaid:  { label: "Не оплачено", color: "bg-red-100 text-red-700" },
  partial: { label: "Часткова оплата", color: "bg-yellow-100 text-yellow-800" },
  paid:    { label: "Оплачено",    color: "bg-green-100 text-green-800" },
};

const serviceTypeLabels: Record<string, string> = {
  spa: "SPA & Wellness",
  rental: "Оренда",
  activity: "Активності",
  food: "Харчування",
  service: "Сервіс",
};

const ADDON_LABELS: Record<string, string> = {
  animal_cat: "З кішкою 🐱",
  animal_dog: "З собакою 🐶",
  baby_cot: "Дитяче ліжечко 🛏",
  baby_chair: "Дитячий стілець 🪑",
  extra_pillows: "Додаткові подушки 🛋",
  extra_blanket: "Додаткова ковдра 🛌",
  double_bed: "Суцільне ліжко 🛏",
};

export default function GuestPortalPage() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() || "";

  const [data, setData] = useState<BookingData | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("reservation");

  // Check-in form state
  const [checkinForm, setCheckinForm] = useState({
    firstName: "", lastName: "", middleName: "", phone: "", email: "",
    passportType: "passport", passportNumber: "", nationality: "UA",
    birthDate: "", arrivalTime: "14:00", specialRequests: "",
  });
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [checkinDone, setCheckinDone] = useState(false);

  // Service ordering state
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [serviceQty, setServiceQty] = useState(1);
  const [serviceTime, setServiceTime] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [orderingService, setOrderingService] = useState(false);

  // Checkout request state
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [checkoutTime, setCheckoutTime] = useState("12:00");
  const [luggageStorage, setLuggageStorage] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutDone, setCheckoutDone] = useState(false);

  useEffect(() => {
    if (!code) return;
    fetch(`${API}/guest/${code}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setData(d);
        if (d.booking.checkinFormSubmitted) {
          setCheckinDone(true);
          const fd = d.booking.checkinFormData || {};
          setCheckinForm(prev => ({ ...prev, ...fd }));
        } else {
          setCheckinForm(prev => ({
            ...prev,
            firstName: d.booking.firstName || "",
            lastName: d.booking.lastName || "",
            phone: d.booking.phone || "",
            arrivalTime: d.booking.checkinTime || "14:00",
          }));
        }
      })
      .catch(() => setError("Не вдалося завантажити дані бронювання"))
      .finally(() => setLoading(false));

    fetch(`${API}/guest/${code}/services`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setServices(d); })
      .catch(() => {});
  }, [code]);

  const nights = data
    ? differenceInCalendarDays(parseISO(data.booking.checkOut), parseISO(data.booking.checkIn))
    : 0;

  async function submitCheckin() {
    setCheckinSubmitting(true);
    try {
      const r = await fetch(`${API}/guest/${code}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkinForm),
      });
      const d = await r.json();
      if (d.success) {
        setCheckinDone(true);
        toast({ title: "✅ Форму подано!", description: "Дякуємо! Ваші дані збережено." });
      } else {
        toast({ title: "Помилка", description: d.error, variant: "destructive" });
      }
    } finally {
      setCheckinSubmitting(false);
    }
  }

  async function orderService() {
    if (!selectedService) return;
    setOrderingService(true);
    try {
      const r = await fetch(`${API}/guest/${code}/service-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          serviceType: selectedService.type,
          quantity: serviceQty,
          requestedTime: serviceTime,
          guestNotes: serviceNotes,
          price: selectedService.price,
        }),
      });
      const d = await r.json();
      if (d.success) {
        toast({ title: "✅ Замовлення прийнято!", description: `${selectedService.name} — очікуйте підтвердження від персоналу.` });
        setSelectedService(null);
        setServiceQty(1);
        setServiceTime("");
        setServiceNotes("");
        // Refresh orders
        fetch(`${API}/guest/${code}/orders`).then(r => r.json()).then(d => {
          if (Array.isArray(d)) setData(prev => prev ? { ...prev, orders: d } : prev);
        });
      } else {
        toast({ title: "Помилка", description: d.error, variant: "destructive" });
      }
    } finally {
      setOrderingService(false);
    }
  }

  async function submitCheckout() {
    setCheckoutSubmitting(true);
    try {
      const r = await fetch(`${API}/guest/${code}/checkout-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredTime: checkoutTime, luggageStorage, feedbackRating, feedbackComment }),
      });
      const d = await r.json();
      if (d.success) {
        setCheckoutDone(true);
        toast({ title: "✅ Запит надіслано", description: "Адміністратор підготує все до вашого виїзду." });
      }
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  // ── Loading / Error ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 to-amber-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500 mx-auto mb-4" />
          <p className="text-stone-500 text-sm">Завантажуємо ваше бронювання…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 to-amber-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-stone-800 mb-2">Посилання недійсне</h2>
          <p className="text-stone-500 text-sm">{error || "Бронювання не знайдено. Перевірте посилання або зверніться до адміністратора."}</p>
        </div>
      </div>
    );
  }

  const { booking, orders } = data;
  const bookingStatus = statusMap[booking.status] || { label: booking.status, color: "bg-gray-100 text-gray-700" };
  const paymentStatus = paymentStatusMap[booking.paymentStatus] || { label: booking.paymentStatus, color: "bg-gray-100 text-gray-700" };
  const total = parseFloat(booking.totalAmount);
  const paid = parseFloat(booking.paidAmount);
  const remaining = total - paid;
  const guestName = [booking.lastName, booking.firstName].filter(Boolean).join(" ");
  const activeAddons = Object.entries(booking.selectedAddons || {})
    .filter(([_, v]) => v === true || v === "true")
    .map(([k]) => ADDON_LABELS[k] || k);

  const servicesByType = services.reduce((acc, s) => {
    if (!acc[s.type]) acc[s.type] = [];
    acc[s.type].push(s);
    return acc;
  }, {} as Record<string, Service[]>);

  const pendingOrders = orders.filter(o => o.status === "pending" || o.status === "confirmed");

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-amber-50">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-stone-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">M</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wide leading-none">{booking.orgName}</p>
            <p className="text-sm font-semibold text-stone-800 truncate leading-tight">{booking.propertyName}</p>
          </div>
          <div className="ml-auto">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${bookingStatus.color}`}>{bookingStatus.label}</span>
          </div>
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white">
        <div className="max-w-lg mx-auto px-4 py-6">
          <p className="text-amber-100 text-sm mb-1">Вітаємо, {guestName || "Гість"}!</p>
          <h1 className="text-2xl font-bold mb-1">{booking.unitCategory} «{booking.unitName}»</h1>
          {booking.propertyAddress && (
            <div className="flex items-center gap-1 text-amber-100 text-xs mt-1">
              <MapPin className="w-3 h-3" />
              <span>{booking.propertyAddress}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-amber-100" />
              <div>
                <p className="text-[10px] text-amber-100 uppercase tracking-wide">Заїзд</p>
                <p className="text-sm font-semibold">
                  {format(parseISO(booking.checkIn), "d MMM", { locale: uk })}
                  <span className="text-amber-200 text-xs ml-1">{booking.checkinTime}</span>
                </p>
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-amber-100" />
              <div>
                <p className="text-[10px] text-amber-100 uppercase tracking-wide">Виїзд</p>
                <p className="text-sm font-semibold">
                  {format(parseISO(booking.checkOut), "d MMM", { locale: uk })}
                  <span className="text-amber-200 text-xs ml-1">{booking.checkoutTime}</span>
                </p>
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-100" />
              <div>
                <p className="text-[10px] text-amber-100 uppercase tracking-wide">Ночей</p>
                <p className="text-sm font-semibold">{nights}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ──────────────────────────────────── */}
      <div className="bg-white border-b border-stone-100 sticky top-[56px] z-10">
        <div className="max-w-lg mx-auto flex">
          {([
            { id: "reservation" as Tab, label: "Бронювання", icon: Home },
            { id: "checkin" as Tab, label: "Заїзд", icon: UserCheck },
            { id: "services" as Tab, label: "Послуги", icon: Sparkles },
            { id: "payment" as Tab, label: "Оплата", icon: CreditCard },
          ] as { id: Tab; label: string; icon: any }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-center transition-all relative ${
                activeTab === tab.id ? "text-amber-600" : "text-stone-400 hover:text-stone-600"
              }`}
            >
              <tab.icon className={`w-4 h-4 mx-auto mb-0.5 ${activeTab === tab.id ? "text-amber-500" : ""}`} />
              <span className="text-[10px] font-medium block">{tab.label}</span>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
              )}
              {tab.id === "services" && pendingOrders.length > 0 && (
                <span className="absolute top-1.5 right-2 bg-amber-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {pendingOrders.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto px-4 py-5 pb-16">

        {/* ━━━━ RESERVATION TAB ━━━━ */}
        {activeTab === "reservation" && (
          <div className="space-y-4">
            {/* Booking card */}
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <h3 className="font-semibold text-stone-800 text-sm">Деталі проживання</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Заїзд</p>
                  <p className="font-medium text-stone-800">
                    {format(parseISO(booking.checkIn), "d MMMM yyyy", { locale: uk })}
                  </p>
                  <p className="text-xs text-amber-600">з {booking.checkinTime}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Виїзд</p>
                  <p className="font-medium text-stone-800">
                    {format(parseISO(booking.checkOut), "d MMMM yyyy", { locale: uk })}
                  </p>
                  <p className="text-xs text-amber-600">до {booking.checkoutTime}</p>
                </div>
              </div>
              <div className="border-t border-stone-50 pt-3 flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5 text-sm text-stone-600">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>
                    {booking.adults} дор.
                    {booking.childrenOver6 > 0 && `, ${booking.childrenOver6} дit. (6+)`}
                    {booking.childrenUnder6 > 0 && `, ${booking.childrenUnder6} дit. (до 6)`}
                  </span>
                </div>
                {booking.unitSquareMeters && (
                  <span className="text-xs text-stone-500 bg-stone-50 px-2 py-0.5 rounded-full">
                    {booking.unitSquareMeters} м²
                  </span>
                )}
                {booking.unitHasBalcony && (
                  <span className="text-xs text-stone-500 bg-stone-50 px-2 py-0.5 rounded-full">🏡 Балкон</span>
                )}
                {booking.unitHasView && (
                  <span className="text-xs text-stone-500 bg-stone-50 px-2 py-0.5 rounded-full">🌅 {booking.unitHasView}</span>
                )}
              </div>
            </div>

            {/* Unit description */}
            {booking.unitDescription && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-stone-800 text-sm mb-2">Про ваш номер</h3>
                <p className="text-sm text-stone-600 leading-relaxed">{booking.unitDescription}</p>
              </div>
            )}

            {/* Addons */}
            {activeAddons.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-stone-800 text-sm mb-2">Включено в бронювання</h3>
                <div className="flex flex-wrap gap-2">
                  {activeAddons.map(a => (
                    <span key={a} className="text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-100">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {booking.notes && (
              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-800">{booking.notes}</p>
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h3 className="font-semibold text-stone-800 text-sm mb-3">Швидкі дії</h3>
              <div className="space-y-2">
                {!booking.checkinFormSubmitted && (
                  <button
                    onClick={() => setActiveTab("checkin")}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-green-50 hover:bg-green-100 transition-colors text-left"
                  >
                    <UserCheck className="w-5 h-5 text-green-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800">Online Check-in</p>
                      <p className="text-xs text-green-600">Заповніть форму заздалегідь — заощадите час</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-green-400" />
                  </button>
                )}
                <button
                  onClick={() => setActiveTab("services")}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-amber-50 hover:bg-amber-100 transition-colors text-left"
                >
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">Замовити послуги</p>
                    <p className="text-xs text-amber-600">SPA, оренда, харчування, активності</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-400" />
                </button>
                {booking.paymentStatus !== "paid" && booking.paymentLink && (
                  <a
                    href={booking.paymentLink}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    <CreditCard className="w-5 h-5 text-blue-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-800">Оплатити онлайн</p>
                      <p className="text-xs text-blue-600">Залишок: {remaining.toFixed(0)} грн</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-blue-400" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ━━━━ CHECK-IN TAB ━━━━ */}
        {activeTab === "checkin" && (
          <div className="space-y-4">
            {checkinDone ? (
              <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-stone-800 mb-2">Дані подані!</h3>
                <p className="text-sm text-stone-500 mb-4">
                  Ваша форма online check-in заповнена. Персонал вже бачить вашу інформацію.<br />
                  Заїзд буде ще швидшим та комфортнішим.
                </p>
                <div className="bg-stone-50 rounded-xl p-3 text-left space-y-1.5 text-sm">
                  {checkinForm.firstName && <p><span className="text-stone-400">Ім'я:</span> <span className="font-medium">{[checkinForm.lastName, checkinForm.firstName, checkinForm.middleName].filter(Boolean).join(" ")}</span></p>}
                  {checkinForm.arrivalTime && <p><span className="text-stone-400">Планований час заїзду:</span> <span className="font-medium">{checkinForm.arrivalTime}</span></p>}
                  {checkinForm.passportNumber && <p><span className="text-stone-400">Документ:</span> <span className="font-medium">•••• {checkinForm.passportNumber.slice(-4)}</span></p>}
                  {checkinForm.specialRequests && <p><span className="text-stone-400">Побажання:</span> <span className="font-medium">{checkinForm.specialRequests}</span></p>}
                </div>
              </div>
            ) : (
              <>
                <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
                  <div className="flex items-start gap-2">
                    <UserCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-green-800">Online Check-in</p>
                      <p className="text-xs text-green-600 mt-0.5">
                        Заповніть форму заздалегідь — ваш заїзд пройде без черг і паперів.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
                  <h3 className="font-semibold text-stone-800 text-sm">Особисті дані</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs text-stone-500">Прізвище *</Label>
                      <Input value={checkinForm.lastName} onChange={e => setCheckinForm(p => ({...p, lastName: e.target.value}))} placeholder="Іваненко" className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-stone-500">Ім'я *</Label>
                      <Input value={checkinForm.firstName} onChange={e => setCheckinForm(p => ({...p, firstName: e.target.value}))} placeholder="Олег" className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-stone-500">По батькові</Label>
                      <Input value={checkinForm.middleName} onChange={e => setCheckinForm(p => ({...p, middleName: e.target.value}))} placeholder="Петрович" className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-stone-500">Телефон</Label>
                      <Input value={checkinForm.phone} onChange={e => setCheckinForm(p => ({...p, phone: e.target.value}))} placeholder="+380" className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-stone-500">Email</Label>
                      <Input value={checkinForm.email} onChange={e => setCheckinForm(p => ({...p, email: e.target.value}))} placeholder="email@domain.com" type="email" className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-stone-500">Дата народження</Label>
                      <Input value={checkinForm.birthDate} onChange={e => setCheckinForm(p => ({...p, birthDate: e.target.value}))} type="date" className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-stone-500">Громадянство</Label>
                      <Select value={checkinForm.nationality} onValueChange={v => setCheckinForm(p => ({...p, nationality: v}))}>
                        <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UA">🇺🇦 Україна</SelectItem>
                          <SelectItem value="PL">🇵🇱 Польща</SelectItem>
                          <SelectItem value="DE">🇩🇪 Германія</SelectItem>
                          <SelectItem value="US">🇺🇸 США</SelectItem>
                          <SelectItem value="OTHER">Інше</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                  <h3 className="font-semibold text-stone-800 text-sm">Документ</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-stone-500">Тип</Label>
                      <Select value={checkinForm.passportType} onValueChange={v => setCheckinForm(p => ({...p, passportType: v}))}>
                        <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="passport">Паспорт</SelectItem>
                          <SelectItem value="id_card">ID-картка</SelectItem>
                          <SelectItem value="foreign_passport">Закордонний паспорт</SelectItem>
                          <SelectItem value="other">Інший</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-stone-500">Номер документа</Label>
                      <Input value={checkinForm.passportNumber} onChange={e => setCheckinForm(p => ({...p, passportNumber: e.target.value}))} placeholder="AA123456" className="mt-1 h-9 text-sm" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                  <h3 className="font-semibold text-stone-800 text-sm">Прибуття та побажання</h3>
                  <div>
                    <Label className="text-xs text-stone-500">Планований час заїзду</Label>
                    <Select value={checkinForm.arrivalTime} onValueChange={v => setCheckinForm(p => ({...p, arrivalTime: v}))}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00"].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-stone-500">Особливі побажання (необов'язково)</Label>
                    <Textarea
                      value={checkinForm.specialRequests}
                      onChange={e => setCheckinForm(p => ({...p, specialRequests: e.target.value}))}
                      placeholder="Алергія, дієта, особливі побажання до номеру…"
                      className="mt-1 text-sm resize-none"
                      rows={3}
                    />
                  </div>
                </div>

                <Button
                  onClick={submitCheckin}
                  disabled={!checkinForm.firstName || !checkinForm.lastName || checkinSubmitting}
                  className="w-full bg-green-500 hover:bg-green-600 text-white h-12 text-sm font-semibold rounded-xl"
                >
                  {checkinSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  Подати форму заїзду
                </Button>
              </>
            )}
          </div>
        )}

        {/* ━━━━ SERVICES TAB ━━━━ */}
        {activeTab === "services" && (
          <div className="space-y-4">
            {/* Active orders */}
            {pendingOrders.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-stone-800 text-sm mb-3 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-amber-500" />
                  Ваші замовлення
                </h3>
                <div className="space-y-2">
                  {pendingOrders.map(o => (
                    <div key={o.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-800 truncate">{o.serviceName}</p>
                        <p className="text-xs text-stone-400">
                          {o.quantity > 1 && `${o.quantity}x `}
                          {parseFloat(o.totalPrice) > 0 && `${parseFloat(o.totalPrice).toFixed(0)} грн`}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        o.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {o.status === "confirmed" ? "Підтверджено" : "Обробляється"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Service selection modal */}
            {selectedService && (
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
                <div className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">{selectedService.icon}</span>
                    <div>
                      <h3 className="font-bold text-stone-800">{selectedService.name}</h3>
                      <p className="text-sm text-stone-500">{selectedService.description}</p>
                      <p className="text-sm font-semibold text-amber-600 mt-1">{selectedService.price} грн{selectedService.perDay ? "/день" : ""}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-stone-500">Кількість</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <button onClick={() => setServiceQty(q => Math.max(1, q-1))} className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700 font-bold">−</button>
                        <span className="w-8 text-center text-sm font-semibold">{serviceQty}</span>
                        <button onClick={() => setServiceQty(q => q+1)} className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700 font-bold">+</button>
                      </div>
                    </div>
                    {selectedService.slots && (
                      <div>
                        <Label className="text-xs text-stone-500">Час</Label>
                        <Select value={serviceTime} onValueChange={setServiceTime}>
                          <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Обрати…" /></SelectTrigger>
                          <SelectContent>
                            {selectedService.slots.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-stone-500">Коментар (необов'язково)</Label>
                    <Textarea value={serviceNotes} onChange={e => setServiceNotes(e.target.value)} placeholder="Побажання…" rows={2} className="mt-1 text-sm resize-none" />
                  </div>
                  <div className="flex items-center justify-between text-sm font-semibold text-stone-800 border-t border-stone-50 pt-3">
                    <span>Сума:</span>
                    <span className="text-amber-600">{(selectedService.price * serviceQty).toFixed(0)} грн</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSelectedService(null)} className="flex-1 h-11 rounded-xl text-sm">Скасувати</Button>
                    <Button onClick={orderService} disabled={orderingService} className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold">
                      {orderingService ? <Loader2 className="w-4 h-4 animate-spin" /> : "Замовити"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Service catalog */}
            {Object.entries(servicesByType).map(([type, svcs]) => (
              <div key={type} className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-stone-700 text-xs uppercase tracking-wide mb-3">{serviceTypeLabels[type] || type}</h3>
                <div className="space-y-2">
                  {svcs.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedService(s); setServiceQty(1); setServiceTime(""); setServiceNotes(""); }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-amber-50 transition-colors text-left"
                    >
                      <span className="text-2xl flex-shrink-0">{s.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-800">{s.name}</p>
                        <p className="text-xs text-stone-400 truncate">{s.description}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-amber-600">{s.price} грн</p>
                        {s.perDay && <p className="text-[10px] text-stone-400">/день</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Checkout request */}
            {(booking.status === "checked_in" || booking.status === "confirmed") && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-stone-700 text-xs uppercase tracking-wide mb-3">Виїзд</h3>
                {checkoutDone ? (
                  <div className="text-center py-4">
                    <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
                    <p className="text-sm text-stone-600">Запит на виїзд надіслано. Ми готуємося!</p>
                  </div>
                ) : !showCheckoutForm ? (
                  <button
                    onClick={() => setShowCheckoutForm(true)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors text-left"
                  >
                    <ArrowLeft className="w-5 h-5 text-stone-500 rotate-180" />
                    <div>
                      <p className="text-sm font-medium text-stone-800">Запит на виїзд</p>
                      <p className="text-xs text-stone-400">Повідомте про час виїзду та залиште відгук</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-stone-400 ml-auto" />
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-stone-500">Час виїзду</Label>
                      <Select value={checkoutTime} onValueChange={setCheckoutTime}>
                        <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["09:00","10:00","11:00","12:00","13:00","14:00","15:00"].map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={luggageStorage} onChange={e => setLuggageStorage(e.target.checked)} className="rounded" />
                      <span className="text-sm text-stone-600">Потрібне тимчасове зберігання багажу</span>
                    </label>
                    <div>
                      <Label className="text-xs text-stone-500">Ваш відгук</Label>
                      <div className="flex gap-1 mt-1 mb-2">
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={() => setFeedbackRating(n)} className="text-2xl">
                            <Star className={`w-6 h-6 ${n <= feedbackRating ? "fill-amber-400 text-amber-400" : "text-stone-200"}`} />
                          </button>
                        ))}
                      </div>
                      <Textarea value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} placeholder="Що вам сподобалось? Що можна покращити?" rows={2} className="text-sm resize-none" />
                    </div>
                    <Button onClick={submitCheckout} disabled={checkoutSubmitting} className="w-full h-10 bg-stone-800 hover:bg-stone-900 text-white rounded-xl text-sm">
                      {checkoutSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Надіслати запит на виїзд"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ━━━━ PAYMENT TAB ━━━━ */}
        {activeTab === "payment" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h3 className="font-semibold text-stone-800 text-sm mb-4">Стан оплати</h3>
              <div className="flex items-center justify-between mb-4">
                <span className="text-stone-500 text-sm">Статус</span>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${paymentStatus.color}`}>{paymentStatus.label}</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-stone-500">Загальна сума</span>
                  <span className="font-semibold text-stone-800">{total.toFixed(2)} грн</span>
                </div>
                {paid > 0 && (
                  <div className="flex justify-between">
                    <span className="text-stone-500">Сплачено</span>
                    <span className="font-semibold text-green-600">−{paid.toFixed(2)} грн</span>
                  </div>
                )}
                {remaining > 0 && (
                  <>
                    <div className="border-t border-stone-50 pt-2 flex justify-between">
                      <span className="font-semibold text-stone-700">До сплати</span>
                      <span className="font-bold text-red-600">{remaining.toFixed(2)} грн</span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 bg-stone-100 rounded-full overflow-hidden mt-2">
                      <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${total > 0 ? (paid/total)*100 : 0}%` }} />
                    </div>
                  </>
                )}
                {remaining <= 0 && paid > 0 && (
                  <div className="flex items-center gap-2 mt-3 bg-green-50 rounded-xl p-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <p className="text-sm text-green-700 font-medium">Оплата отримана в повному обсязі!</p>
                  </div>
                )}
              </div>
            </div>

            {remaining > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-stone-800 text-sm mb-3">Способи оплати</h3>
                {booking.paymentLink ? (
                  <a href={booking.paymentLink} target="_blank" rel="noreferrer">
                    <Button className="w-full h-12 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold flex items-center gap-2">
                      <CreditCard className="w-5 h-5" />
                      Оплатити {remaining.toFixed(0)} грн онлайн
                    </Button>
                  </a>
                ) : (
                  <div className="bg-stone-50 rounded-xl p-4 text-center">
                    <Phone className="w-6 h-6 text-stone-400 mx-auto mb-2" />
                    <p className="text-sm text-stone-600">Оплата готівкою або терміналом на рецепції</p>
                    <p className="text-xs text-stone-400 mt-1">Зверніться до адміністратора</p>
                  </div>
                )}
              </div>
            )}

            {/* Service orders payment */}
            {orders.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-stone-800 text-sm mb-3">Замовлені послуги</h3>
                <div className="space-y-2">
                  {orders.map(o => (
                    <div key={o.id} className="flex items-center justify-between text-sm">
                      <span className="text-stone-600">{o.serviceName} {o.quantity > 1 && `×${o.quantity}`}</span>
                      <span className="font-medium text-stone-800">{parseFloat(o.totalPrice).toFixed(0)} грн</span>
                    </div>
                  ))}
                  <div className="border-t border-stone-50 pt-2 flex justify-between font-semibold text-sm">
                    <span>Разом за послуги</span>
                    <span>{orders.reduce((s, o) => s + parseFloat(o.totalPrice || "0"), 0).toFixed(0)} грн</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-100 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <p className="text-[10px] text-stone-400">Powered by <span className="font-semibold text-stone-600">Maison HD</span></p>
          <div className="flex items-center gap-1">
            <Heart className="w-3 h-3 text-red-400 fill-red-400" />
            <p className="text-[10px] text-stone-400">Приємного відпочинку!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
