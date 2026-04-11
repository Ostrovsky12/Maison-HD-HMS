import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { format, differenceInCalendarDays, parseISO, isAfter, isBefore, isToday } from "date-fns";
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
  Award, FileText, Download, Crown, Gift, Tag, MessageCircle, ThumbsUp,
  RefreshCw, ChevronDown, Building2, Shield,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";

type Tab = "reservation" | "checkin" | "services" | "messages" | "loyalty" | "review" | "documents" | "payment";

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
    email: string | null;
    notes: string | null;
    paymentLink: string | null;
    checkinFormSubmitted: boolean;
    checkinFormData: Record<string, string>;
    selectedAddons: Record<string, boolean | string>;
    bookingRef: string | null;
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
    orgId: number;
  };
  orders: any[];
  loyalty: any | null;
  messages: any[];
  review: any | null;
  offers: any[];
}

interface Service {
  id: string; addonId?: number; type: string; icon: string; name: string;
  description: string; price: number; currency: string; available: boolean;
  unit?: string; slots?: string[]; perDay?: boolean; maxQuantity?: number;
}

const statusMap: Record<string, { label: string; color: string }> = {
  pending:     { label: "Очікує підтвердження", color: "bg-yellow-100 text-yellow-800" },
  confirmed:   { label: "Підтверджено",         color: "bg-green-100 text-green-800" },
  checked_in:  { label: "Ви в готелі",          color: "bg-blue-100 text-blue-800" },
  checked_out: { label: "Виїзд завершено",      color: "bg-gray-100 text-gray-700" },
  cancelled:   { label: "Скасовано",            color: "bg-red-100 text-red-700" },
  draft:       { label: "Чернетка",             color: "bg-gray-100 text-gray-600" },
};

const paymentStatusMap: Record<string, { label: string; color: string }> = {
  unpaid:  { label: "Не оплачено", color: "bg-red-100 text-red-700" },
  partial: { label: "Часткова оплата", color: "bg-yellow-100 text-yellow-800" },
  paid:    { label: "Оплачено",    color: "bg-green-100 text-green-800" },
};

const TIER_CONFIG: Record<string, { label: string; color: string; icon: string; next: number }> = {
  bronze:   { label: "Bronze",   color: "text-orange-600", icon: "🥉", next: 500 },
  silver:   { label: "Silver",   color: "text-gray-600",   icon: "🥈", next: 2000 },
  gold:     { label: "Gold",     color: "text-yellow-600", icon: "🥇", next: 5000 },
  platinum: { label: "Platinum", color: "text-purple-600", icon: "💎", next: 99999 },
};

const serviceTypeLabels: Record<string, string> = {
  spa: "SPA & Wellness", rental: "Оренда", activity: "Активності", food: "Харчування", service: "Сервіс",
};

const ADDON_LABELS: Record<string, string> = {
  animal_cat: "З кішкою 🐱", animal_dog: "З собакою 🐶", baby_cot: "Дитяче ліжечко 🛏",
  baby_chair: "Дитячий стілець 🪑", extra_pillows: "Додаткові подушки 🛋",
  extra_blanket: "Додаткова ковдра 🛌", double_bed: "Суцільне ліжко 🛏",
};

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} onClick={() => onChange(i)} className="focus:outline-none transition-transform hover:scale-110">
          <Star className={`h-7 w-7 ${i <= value ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
        </button>
      ))}
    </div>
  );
}

export default function GuestPortalPage() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() || "";

  const [data, setData] = useState<BookingData | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("reservation");

  // Check-in form
  const [checkinForm, setCheckinForm] = useState({
    firstName: "", lastName: "", middleName: "", phone: "", email: "",
    passportType: "passport", passportNumber: "", nationality: "UA",
    birthDate: "", arrivalTime: "14:00", specialRequests: "",
    carNumber: "", hasPet: false, petType: "", petName: "",
    coGuests: [] as Array<{ firstName: string; lastName: string; passportNumber: string }>,
  });
  const [checkinStep, setCheckinStep] = useState(1);
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [checkinDone, setCheckinDone] = useState(false);

  // Service ordering
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [serviceQty, setServiceQty] = useState(1);
  const [serviceTime, setServiceTime] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [orderingService, setOrderingService] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Checkout
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [checkoutTime, setCheckoutTime] = useState("12:00");
  const [luggageStorage, setLuggageStorage] = useState(false);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutDone, setCheckoutDone] = useState(false);

  // Messages
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Review
  const [reviewForm, setReviewForm] = useState({
    overallRating: 0, cleanlinessRating: 0, serviceRating: 0,
    locationRating: 0, valueRating: 0, reviewText: "", npsScore: 0,
    wouldReturn: true, recommendToFriend: true,
  });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);

  // Documents
  const [documents, setDocuments] = useState<any[]>([]);

  useEffect(() => {
    if (!code) return;
    fetch(`${API}/guest/${code}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setData(d);
        setMessages(d.messages || []);
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
            email: d.booking.email || "",
            arrivalTime: d.booking.checkinTime || "14:00",
          }));
        }
        if (d.review?.submittedAt) { setReviewDone(true); }
      })
      .catch(() => setError("Не вдалося завантажити дані бронювання"))
      .finally(() => setLoading(false));

    fetch(`${API}/guest/${code}/services`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setServices(d); })
      .catch(() => {});

    fetch(`${API}/guest/${code}/documents`)
      .then(r => r.json())
      .then(d => { if (d.documents) setDocuments(d.documents); })
      .catch(() => {});
  }, [code]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Live polling: refresh messages every 15s when chat tab is open
  useEffect(() => {
    if (!code || activeTab !== "messages") return;
    const poll = setInterval(() => {
      fetch(`${API}/guest/${code}`)
        .then(r => r.json())
        .then(d => {
          if (d.messages) setMessages(d.messages);
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(poll);
  }, [code, activeTab]);

  const nights = data ? differenceInCalendarDays(parseISO(data.booking.checkOut), parseISO(data.booking.checkIn)) : 0;
  const now = new Date();
  const checkInDate = data ? parseISO(data.booking.checkIn) : null;
  const checkOutDate = data ? parseISO(data.booking.checkOut) : null;
  const daysUntilCheckIn = checkInDate ? differenceInCalendarDays(checkInDate, now) : 0;
  const isBeforeStay = checkInDate ? isBefore(now, checkInDate) : false;
  const isDuringStay = checkInDate && checkOutDate ? !isBefore(now, checkInDate) && !isAfter(now, checkOutDate) : false;
  const isAfterStay = checkOutDate ? isAfter(now, checkOutDate) : false;

  async function submitCheckin() {
    setCheckinSubmitting(true);
    try {
      const r = await fetch(`${API}/guest/${code}/checkin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkinForm),
      });
      const d = await r.json();
      if (d.success) {
        setCheckinDone(true);
        toast({ title: "✅ Форму подано!", description: d.message || "Дякуємо! Ваші дані збережено." });
      } else {
        toast({ title: "Помилка", description: d.error, variant: "destructive" });
      }
    } finally { setCheckinSubmitting(false); }
  }

  async function orderService() {
    if (!selectedService) return;
    setOrderingService(true);
    try {
      const r = await fetch(`${API}/guest/${code}/service-order`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedService.id,
          addonId: selectedService.addonId || null,
          serviceName: selectedService.name,
          serviceType: selectedService.type, quantity: serviceQty,
          requestedTime: serviceTime || null, guestNotes: serviceNotes, price: selectedService.price,
        }),
      });
      const d = await r.json();
      if (d.success) {
        toast({ title: "✅ Замовлення прийнято!", description: `${selectedService.name} — очікуйте підтвердження` });
        setSelectedService(null); setServiceQty(1); setServiceTime(""); setServiceNotes("");
      } else {
        toast({ title: "Помилка", description: d.error, variant: "destructive" });
      }
    } finally { setOrderingService(false); }
  }

  async function requestCheckout() {
    setCheckoutSubmitting(true);
    try {
      const r = await fetch(`${API}/guest/${code}/checkout-request`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredTime: checkoutTime, luggageStorage }),
      });
      const d = await r.json();
      if (d.success) {
        setCheckoutDone(true);
        toast({ title: "Запит прийнято", description: "Адміністратор зв'яжеться з вами незабаром" });
      }
    } finally { setCheckoutSubmitting(false); }
  }

  async function sendMessage() {
    if (!newMessage.trim()) return;
    setSendingMessage(true);
    try {
      const r = await fetch(`${API}/guest/${code}/message`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: newMessage }),
      });
      const d = await r.json();
      if (d.success) {
        setMessages(prev => [...prev, d.message]);
        setNewMessage("");
      } else {
        toast({ title: "Помилка", description: d.error, variant: "destructive" });
      }
    } finally { setSendingMessage(false); }
  }

  async function submitReview() {
    if (reviewForm.overallRating === 0) {
      toast({ title: "Оцінка обов'язкова", description: "Будь ласка, оцініть ваше перебування", variant: "destructive" });
      return;
    }
    setSubmittingReview(true);
    try {
      const r = await fetch(`${API}/guest/${code}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewForm),
      });
      const d = await r.json();
      if (d.success) {
        setReviewDone(true);
        toast({ title: "🌟 Дякуємо за відгук!", description: d.message });
      } else {
        toast({ title: "Помилка", description: d.error, variant: "destructive" });
      }
    } finally { setSubmittingReview(false); }
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "reservation", label: "Резервація", icon: <CalendarDays className="h-3.5 w-3.5" /> },
    { id: "checkin",     label: "Чекін",      icon: <UserCheck className="h-3.5 w-3.5" /> },
    { id: "services",    label: "Послуги",    icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: "messages",    label: "Чат",        icon: <MessageSquare className="h-3.5 w-3.5" /> },
    { id: "loyalty",     label: "Бонуси",     icon: <Crown className="h-3.5 w-3.5" /> },
    { id: "review",      label: "Відгук",     icon: <Star className="h-3.5 w-3.5" /> },
    { id: "documents",   label: "Документи",  icon: <FileText className="h-3.5 w-3.5" /> },
    { id: "payment",     label: "Оплата",     icon: <CreditCard className="h-3.5 w-3.5" /> },
  ];

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto mb-3" />
        <p className="text-gray-500">Завантаження…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-gray-800">Помилка</h2>
        <p className="text-gray-500 mt-2">{error}</p>
      </div>
    </div>
  );

  if (!data) return null;
  const { booking, orders, loyalty, offers } = data;
  const tierCfg = TIER_CONFIG[loyalty?.tier || "bronze"] || TIER_CONFIG.bronze;

  const categories = ["all", ...Array.from(new Set(services.map(s => s.type)))];
  const filteredServices = activeCategory === "all" ? services : services.filter(s => s.type === activeCategory);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">{booking.orgName}</p>
            <p className="font-bold text-gray-800 text-sm">{booking.propertyName}</p>
          </div>
          <div className="text-right">
            <Badge className={statusMap[booking.status]?.color || "bg-gray-100 text-gray-600"}>
              {statusMap[booking.status]?.label || booking.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Stay summary */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400 font-medium">Ваше бронювання</p>
              <h1 className="text-lg font-bold text-gray-900">{booking.unitName}</h1>
              <div className="flex items-center gap-1 text-gray-500 text-xs mt-0.5">
                <Building2 className="h-3 w-3" />{booking.unitCategory}
                {booking.unitSquareMeters && <span>· {booking.unitSquareMeters} м²</span>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">{booking.bookingRef || `#${booking.id}`}</p>
              <p className="text-2xl font-bold text-blue-600">{nights}</p>
              <p className="text-xs text-gray-500">ночей</p>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <div className="flex-1 bg-green-50 rounded-xl p-2 text-center">
              <p className="text-xs text-gray-500">Заїзд</p>
              <p className="font-bold text-gray-800 text-sm">{format(parseISO(booking.checkIn), "dd MMM", { locale: uk })}</p>
              <p className="text-xs text-green-600">{booking.checkinTime || "14:00"}</p>
            </div>
            <div className="flex items-center text-gray-300">→</div>
            <div className="flex-1 bg-orange-50 rounded-xl p-2 text-center">
              <p className="text-xs text-gray-500">Виїзд</p>
              <p className="font-bold text-gray-800 text-sm">{format(parseISO(booking.checkOut), "dd MMM", { locale: uk })}</p>
              <p className="text-xs text-orange-600">{booking.checkoutTime || "12:00"}</p>
            </div>
          </div>

          {isBeforeStay && daysUntilCheckIn > 0 && (
            <div className="mt-3 bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-blue-700 font-semibold text-sm">До вашого заїзду залишилося</p>
              <p className="text-3xl font-bold text-blue-600">{daysUntilCheckIn}</p>
              <p className="text-blue-500 text-xs">днів</p>
            </div>
          )}
          {isDuringStay && (
            <div className="mt-3 bg-green-50 rounded-xl p-3 text-center">
              <p className="text-green-700 font-bold">Ласкаво просимо! 🏨</p>
              <p className="text-green-600 text-xs">Приємного відпочинку у {booking.propertyName}</p>
            </div>
          )}
          {isAfterStay && (
            <div className="mt-3 bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-gray-600 font-medium text-sm">Дякуємо за ваш візит 🙏</p>
              <p className="text-gray-400 text-xs">Залиште відгук та отримайте 100 бонусних балів</p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto pb-1 mb-4">
          <div className="flex gap-1.5 min-w-max">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-gray-500 hover:bg-gray-50 border border-gray-100"
                }`}>
                {tab.icon}{tab.label}
                {tab.id === "messages" && messages.filter(m => m.direction === "hotel_to_guest" && !m.isRead).length > 0 && (
                  <span className="bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                    {messages.filter(m => m.direction === "hotel_to_guest" && !m.isRead).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ═══════════════ RESERVATION ═══════════════ */}
        {activeTab === "reservation" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-500" />Деталі бронювання
              </h3>
              <div className="space-y-2">
                {[
                  { label: "Гість", value: [booking.firstName, booking.lastName].filter(Boolean).join(" ") || "—" },
                  { label: "Телефон", value: booking.phone || "—" },
                  { label: "Email", value: booking.email || "—" },
                  { label: "Гостей", value: `${booking.adults} дор.${booking.childrenOver6 ? ` + ${booking.childrenOver6} діт.` : ""}${booking.childrenUnder6 ? ` + ${booking.childrenUnder6} малят.` : ""}` },
                  { label: "Адреса", value: booking.propertyAddress || "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm border-b border-gray-50 pb-1 last:border-0">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-gray-800 text-right max-w-[60%]">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Room details */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h3 className="font-semibold text-sm mb-3">Ваш номер</h3>
              {booking.unitDescription && <p className="text-xs text-gray-500 mb-3">{booking.unitDescription}</p>}
              <div className="flex flex-wrap gap-2">
                {booking.unitHasBalcony && <Badge className="bg-blue-50 text-blue-700 text-xs">🌿 Балкон</Badge>}
                {booking.unitHasView && <Badge className="bg-green-50 text-green-700 text-xs">🏞️ {booking.unitHasView}</Badge>}
                {booking.unitSquareMeters && <Badge className="bg-gray-100 text-gray-600 text-xs">📐 {booking.unitSquareMeters} м²</Badge>}
                <Badge className="bg-gray-100 text-gray-600 text-xs">👥 до {booking.unitCapacity} ос.</Badge>
                <Badge className="bg-purple-50 text-purple-700 text-xs">📶 WiFi</Badge>
                <Badge className="bg-orange-50 text-orange-700 text-xs">☕ Сніданок</Badge>
              </div>
              {booking.selectedAddons && Object.keys(booking.selectedAddons).filter(k => booking.selectedAddons[k]).length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-gray-500 mb-1">Додаткові опції:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(booking.selectedAddons).filter(([, v]) => v).map(([k]) => (
                      <Badge key={k} className="bg-purple-50 text-purple-700 text-xs">{ADDON_LABELS[k] || k}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Special offers */}
            {offers && offers.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Gift className="h-4 w-4 text-pink-500" />Спецпропозиції для вас
                </h3>
                <div className="space-y-2">
                  {offers.map((offer: any) => (
                    <div key={offer.id} className="bg-gradient-to-r from-pink-50 to-orange-50 rounded-xl p-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-sm text-gray-800">{offer.title}</p>
                        {offer.description && <p className="text-xs text-gray-500">{offer.description}</p>}
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        {offer.discountPct && <p className="font-bold text-pink-600">-{offer.discountPct}%</p>}
                        {offer.promoCode && <Badge className="bg-pink-100 text-pink-700 font-mono text-xs">{offer.promoCode}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ CHECK-IN ═══════════════ */}
        {activeTab === "checkin" && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            {checkinDone ? (
              <div className="text-center py-6">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-800">Форму подано!</h3>
                <p className="text-gray-500 text-sm mt-2">Дякуємо! Нараховано 50 бонусних балів 🎉</p>
                <div className="mt-4 bg-gray-50 rounded-xl p-4 text-left">
                  <p className="text-xs text-gray-400 mb-2 font-medium">Дані для заїзду:</p>
                  {[
                    { l: "Ім'я", v: checkinForm.firstName },
                    { l: "Прізвище", v: checkinForm.lastName },
                    { l: "По-батькові", v: checkinForm.middleName },
                    { l: "Телефон", v: checkinForm.phone },
                    { l: "Email", v: checkinForm.email },
                    { l: "Час приїзду", v: checkinForm.arrivalTime },
                    { l: "Нотатки", v: checkinForm.specialRequests },
                  ].filter(x => x.v).map(({ l, v }) => (
                    <div key={l} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                      <span className="text-gray-500">{l}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-4 text-white">
                  <p className="font-bold">🏨 Онлайн реєстрація</p>
                  <p className="text-xs opacity-80 mt-0.5">Заповніть заздалегідь — економте час на рецепції та отримайте 50 бонусних балів</p>
                  {/* Steps */}
                  <div className="flex items-center gap-1 mt-3">
                    {[1,2,3,4].map(s => (
                      <div key={s} className="flex items-center">
                        <div className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center transition-all ${s===checkinStep?"bg-white text-blue-600":s<checkinStep?"bg-white/40 text-white":"bg-white/20 text-white/60"}`}>
                          {s < checkinStep ? "✓" : s}
                        </div>
                        {s < 4 && <div className={`w-6 h-0.5 ${s < checkinStep ? "bg-white/60" : "bg-white/20"}`} />}
                      </div>
                    ))}
                    <span className="text-[10px] opacity-70 ml-2">
                      {checkinStep===1?"Особисті дані":checkinStep===2?"Документ та заїзд":checkinStep===3?"Супутники та авто":"Підтвердження"}
                    </span>
                  </div>
                </div>

                {/* STEP 1: Personal info */}
                {checkinStep === 1 && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-xs">Ім'я *</Label><Input value={checkinForm.firstName} onChange={e => setCheckinForm(p => ({ ...p, firstName: e.target.value }))} placeholder="Іван" /></div>
                      <div><Label className="text-xs">Прізвище *</Label><Input value={checkinForm.lastName} onChange={e => setCheckinForm(p => ({ ...p, lastName: e.target.value }))} placeholder="Петренко" /></div>
                    </div>
                    <div><Label className="text-xs">По-батькові</Label><Input value={checkinForm.middleName} onChange={e => setCheckinForm(p => ({ ...p, middleName: e.target.value }))} placeholder="Олександрович" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-xs">Телефон *</Label><Input value={checkinForm.phone} onChange={e => setCheckinForm(p => ({ ...p, phone: e.target.value }))} placeholder="+380…" /></div>
                      <div><Label className="text-xs">Email</Label><Input type="email" value={checkinForm.email} onChange={e => setCheckinForm(p => ({ ...p, email: e.target.value }))} placeholder="email@gmail.com" /></div>
                    </div>
                    <div><Label className="text-xs">Дата народження</Label><Input type="date" value={checkinForm.birthDate} onChange={e => setCheckinForm(p => ({ ...p, birthDate: e.target.value }))} /></div>
                    <Button className="w-full" disabled={!checkinForm.firstName || !checkinForm.lastName} onClick={() => setCheckinStep(2)}>Далі →</Button>
                  </div>
                )}

                {/* STEP 2: Document + arrival */}
                {checkinStep === 2 && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Тип документа</Label>
                        <Select value={checkinForm.passportType} onValueChange={v => setCheckinForm(p => ({ ...p, passportType: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="passport">Паспорт</SelectItem>
                            <SelectItem value="id_card">ID-картка</SelectItem>
                            <SelectItem value="international">Закордонний паспорт</SelectItem>
                            <SelectItem value="other">Інше</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-xs">Номер документа</Label><Input value={checkinForm.passportNumber} onChange={e => setCheckinForm(p => ({ ...p, passportNumber: e.target.value }))} placeholder="АА123456" /></div>
                    </div>
                    <div>
                      <Label className="text-xs">Очікуваний час заїзду</Label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {["10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00","23:00"].map(t => (
                          <button key={t} onClick={() => setCheckinForm(p => ({ ...p, arrivalTime: t }))}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${checkinForm.arrivalTime===t?"bg-blue-600 text-white border-blue-600":"bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-300"}`}>{t}</button>
                        ))}
                      </div>
                    </div>
                    <div><Label className="text-xs">Особливі побажання (поверх, тип ліжка, алергії…)</Label><Textarea value={checkinForm.specialRequests} onChange={e => setCheckinForm(p => ({ ...p, specialRequests: e.target.value }))} rows={2} className="mt-1 resize-none" /></div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setCheckinStep(1)}>← Назад</Button>
                      <Button className="flex-1" onClick={() => setCheckinStep(3)}>Далі →</Button>
                    </div>
                  </div>
                )}

                {/* STEP 3: Co-guests, car, pet */}
                {checkinStep === 3 && (
                  <div className="space-y-3">
                    {/* Car */}
                    <div className="bg-gray-50 rounded-xl p-3">
                      <Label className="text-xs font-semibold text-gray-700">🚗 Автомобіль</Label>
                      <Input className="mt-1" value={checkinForm.carNumber} onChange={e => setCheckinForm(p => ({ ...p, carNumber: e.target.value }))} placeholder="AA 1234 BB (номерний знак)" />
                    </div>

                    {/* Pet */}
                    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="hasPet" checked={checkinForm.hasPet} onChange={e => setCheckinForm(p => ({ ...p, hasPet: e.target.checked }))} className="accent-blue-600" />
                        <Label htmlFor="hasPet" className="text-xs font-semibold text-gray-700 cursor-pointer">🐾 Із домашнім вихованцем</Label>
                      </div>
                      {checkinForm.hasPet && (
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <div><Label className="text-xs">Тип</Label><Input value={checkinForm.petType} onChange={e => setCheckinForm(p => ({ ...p, petType: e.target.value }))} placeholder="Собака / Кіт…" /></div>
                          <div><Label className="text-xs">Кличка</Label><Input value={checkinForm.petName} onChange={e => setCheckinForm(p => ({ ...p, petName: e.target.value }))} placeholder="Барсик" /></div>
                        </div>
                      )}
                    </div>

                    {/* Co-guests */}
                    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-gray-700">👨‍👩‍👧 Супутники (co-guests)</Label>
                        <button onClick={() => setCheckinForm(p => ({ ...p, coGuests: [...p.coGuests, { firstName: "", lastName: "", passportNumber: "" }] }))}
                          className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">+ Додати</button>
                      </div>
                      {checkinForm.coGuests.map((cg, idx) => (
                        <div key={idx} className="bg-white rounded-lg p-2 space-y-1.5 border border-gray-200">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-gray-400 font-medium">Гість {idx + 2}</span>
                            <button onClick={() => setCheckinForm(p => ({ ...p, coGuests: p.coGuests.filter((_, i) => i !== idx) }))} className="text-red-400 text-xs hover:text-red-600">✕</button>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Input className="text-xs h-7" placeholder="Ім'я" value={cg.firstName} onChange={e => setCheckinForm(p => ({ ...p, coGuests: p.coGuests.map((c, i) => i===idx?{...c,firstName:e.target.value}:c) }))} />
                            <Input className="text-xs h-7" placeholder="Прізвище" value={cg.lastName} onChange={e => setCheckinForm(p => ({ ...p, coGuests: p.coGuests.map((c, i) => i===idx?{...c,lastName:e.target.value}:c) }))} />
                          </div>
                          <Input className="text-xs h-7" placeholder="Номер паспорту" value={cg.passportNumber} onChange={e => setCheckinForm(p => ({ ...p, coGuests: p.coGuests.map((c, i) => i===idx?{...c,passportNumber:e.target.value}:c) }))} />
                        </div>
                      ))}
                      {checkinForm.coGuests.length === 0 && <p className="text-xs text-gray-400">Якщо подорожуєте самі — залиште порожнім</p>}
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setCheckinStep(2)}>← Назад</Button>
                      <Button className="flex-1" onClick={() => setCheckinStep(4)}>Далі →</Button>
                    </div>
                  </div>
                )}

                {/* STEP 4: Review + submit */}
                {checkinStep === 4 && (
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Підтвердіть дані</p>
                      {[
                        ["Ім'я", `${checkinForm.firstName} ${checkinForm.lastName}`],
                        ["По-батькові", checkinForm.middleName],
                        ["Телефон", checkinForm.phone],
                        ["Документ", `${checkinForm.passportType} ${checkinForm.passportNumber}`],
                        ["Час заїзду", checkinForm.arrivalTime],
                        ["Авто", checkinForm.carNumber],
                        ["Вихованець", checkinForm.hasPet ? `${checkinForm.petType} (${checkinForm.petName})` : "—"],
                        ["Супутників", String(checkinForm.coGuests.length)],
                      ].filter(([,v]) => v).map(([l, v]) => (
                        <div key={l} className="flex justify-between border-b border-gray-100 pb-1 last:border-0">
                          <span className="text-gray-500">{l}</span>
                          <span className="font-medium text-gray-800">{v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                      ✅ Форма буде надіслана готелю та підтверджена за 2 год до заїзду.
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setCheckinStep(3)}>← Назад</Button>
                      <Button onClick={submitCheckin} disabled={checkinSubmitting || !checkinForm.firstName || !checkinForm.lastName} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                        {checkinSubmitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Подаємо…</> : <><UserCheck className="h-4 w-4 mr-2" />Підтвердити заїзд</>}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ SERVICES ═══════════════ */}
        {activeTab === "services" && (
          <div className="space-y-3">
            {/* Category filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    activeCategory === cat ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-gray-100 hover:bg-gray-50"
                  }`}>
                  {cat === "all" ? "Всі" : serviceTypeLabels[cat] || cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3">
              {filteredServices.map(service => (
                <div key={service.id} className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{service.icon}</span>
                        <div>
                          <h4 className="font-semibold text-sm">{service.name}</h4>
                          <p className="text-xs text-gray-500">{service.description}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-bold text-blue-600">{service.price.toLocaleString("uk")} ₴</p>
                      {service.perDay && <p className="text-xs text-gray-400">/ день</p>}
                    </div>
                  </div>
                  <Button size="sm" className="w-full mt-3 h-8 text-xs"
                    onClick={() => { setSelectedService(service); setServiceTime(""); setServiceQty(1); setServiceNotes(""); }}>
                    Замовити
                  </Button>
                </div>
              ))}
            </div>

            {/* Order modal */}
            {selectedService && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4">
                <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">{selectedService.icon} {selectedService.name}</h3>
                    <button onClick={() => setSelectedService(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
                  </div>
                  <p className="text-gray-500 text-sm">{selectedService.description}</p>
                  <div>
                    <Label className="text-xs">Кількість</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setServiceQty(q => Math.max(1, q-1))}>−</Button>
                      <span className="w-8 text-center font-bold">{serviceQty}</span>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setServiceQty(q => q+1)}>+</Button>
                      <span className="text-sm text-gray-500 ml-2">× {selectedService.price} ₴ = <strong>{(serviceQty * selectedService.price).toLocaleString("uk")} ₴</strong></span>
                    </div>
                  </div>
                  {selectedService.slots && (
                    <div>
                      <Label className="text-xs">Час</Label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {selectedService.slots.map(slot => (
                          <button key={slot} onClick={() => setServiceTime(slot)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium border ${serviceTime === slot ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-100"}`}>
                            {slot}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Нотатки</Label>
                    <Textarea value={serviceNotes} onChange={e => setServiceNotes(e.target.value)} placeholder="Побажання…" rows={2} className="mt-1" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSelectedService(null)} className="flex-1">Скасувати</Button>
                    <Button onClick={orderService} disabled={orderingService} className="flex-1">
                      {orderingService ? <Loader2 className="h-4 w-4 animate-spin" /> : "Замовити"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* My orders */}
            {orders.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-purple-500" />Мої замовлення
                </h3>
                <div className="space-y-2">
                  {orders.filter(o => (o.metadata as any)?.type !== "checkout_request").map((order: any) => (
                    <div key={order.id} className="flex justify-between items-center text-sm py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="font-medium">{order.serviceName}</p>
                        <p className="text-xs text-gray-400">{order.quantity} × {parseFloat(order.pricePerUnit || 0).toLocaleString("uk")} ₴</p>
                      </div>
                      <Badge className={order.status === "pending" ? "bg-yellow-100 text-yellow-700" : order.status === "completed" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}>
                        {order.status === "pending" ? "Очікує" : order.status === "confirmed" ? "Підтверджено" : order.status === "completed" ? "Виконано" : order.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Checkout section */}
            {(isDuringStay || isAfterStay) && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Car className="h-4 w-4 text-orange-500" />Запит на виїзд
                </h3>
                {checkoutDone ? (
                  <div className="text-center py-3">
                    <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Запит прийнято! Зустрічаємо вас на рецепції.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Час виїзду</Label>
                      <Select value={checkoutTime} onValueChange={setCheckoutTime}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00"].map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={luggageStorage} onChange={e => setLuggageStorage(e.target.checked)} className="rounded" />
                      <span className="text-sm">Потрібне зберігання багажу</span>
                    </label>
                    <Button onClick={requestCheckout} disabled={checkoutSubmitting} className="w-full">
                      {checkoutSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Надіслати запит на виїзд
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ MESSAGES ═══════════════ */}
        {activeTab === "messages" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                <h3 className="font-semibold text-sm">Чат з готелем</h3>
                <Badge className="bg-green-100 text-green-700 text-xs">Онлайн</Badge>
              </div>

              {/* Messages */}
              <div className="space-y-2 min-h-[200px] max-h-[400px] overflow-y-auto mb-4 pr-1">
                {messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <MessageCircle className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                    <p className="text-sm">Поки немає повідомлень</p>
                    <p className="text-xs">Задайте будь-яке запитання!</p>
                  </div>
                ) : messages.map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.direction === "guest_to_hotel" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                      msg.direction === "guest_to_hotel"
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}>
                      {msg.direction === "hotel_to_guest" && (
                        <p className="text-xs text-gray-500 mb-0.5">{msg.senderName || "Готель"}</p>
                      )}
                      <p className="text-sm">{msg.message}</p>
                      <p className={`text-[10px] mt-1 ${msg.direction === "guest_to_hotel" ? "text-blue-200" : "text-gray-400"}`}>
                        {new Date(msg.createdAt).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Напишіть повідомлення…"
                  className="flex-1"
                />
                <Button onClick={sendMessage} disabled={sendingMessage || !newMessage.trim()} size="icon">
                  {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {["Яка WiFi-мережа?", "Де ресторан?", "Можна пізно виїхати?", "Замовте прибирання"].map(q => (
                  <button key={q} onClick={() => setNewMessage(q)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 rounded-full transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Phone className="h-4 w-4 text-green-500" />Контакти
              </h3>
              <div className="space-y-1">
                <p className="text-sm text-gray-600">📞 Рецепція: <a href="tel:+380501234567" className="font-medium text-blue-600">+380 50 123 45 67</a></p>
                <p className="text-sm text-gray-600">🆘 Екстрений: <a href="tel:112" className="font-medium text-red-600">112</a></p>
                <p className="text-xs text-gray-400 mt-1">{booking.propertyAddress}</p>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ LOYALTY ═══════════════ */}
        {activeTab === "loyalty" && (
          <div className="space-y-3">
            {loyalty ? (
              <>
                {/* Loyalty card */}
                <div className={`rounded-2xl p-5 text-white shadow-lg ${
                  loyalty.tier === "platinum" ? "bg-gradient-to-br from-purple-600 to-purple-800" :
                  loyalty.tier === "gold" ? "bg-gradient-to-br from-yellow-500 to-orange-500" :
                  loyalty.tier === "silver" ? "bg-gradient-to-br from-gray-500 to-gray-700" :
                  "bg-gradient-to-br from-orange-400 to-orange-600"
                }`}>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <p className="text-white/70 text-xs">Учасник програми лояльності</p>
                      <p className="font-bold text-lg">{[loyalty.firstName, loyalty.lastName].filter(Boolean).join(" ") || "Наш гість"}</p>
                    </div>
                    <div className="text-3xl">{tierCfg.icon}</div>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-white/70 text-xs">Доступних балів</p>
                      <p className="text-3xl font-bold">{loyalty.points.toLocaleString("uk")}</p>
                    </div>
                    <div className="text-right">
                      <Badge className="bg-white/20 text-white text-sm font-bold">{tierCfg.label}</Badge>
                      <p className="text-white/70 text-xs mt-1">{loyalty.visitsCount} візитів</p>
                    </div>
                  </div>
                </div>

                {/* Progress to next tier */}
                {loyalty.tier !== "platinum" && (
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <h3 className="font-semibold text-sm mb-2">До наступного рівня</h3>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{loyalty.totalPoints.toLocaleString("uk")} балів</span>
                      <span>потрібно {tierCfg.next.toLocaleString("uk")}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (loyalty.totalPoints / tierCfg.next) * 100)}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Ще {Math.max(0, tierCfg.next - loyalty.totalPoints).toLocaleString("uk")} балів до {
                        loyalty.tier === "bronze" ? "Silver 🥈" : loyalty.tier === "silver" ? "Gold 🥇" : "Platinum 💎"
                      }
                    </p>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Балів всього", value: loyalty.totalPoints.toLocaleString("uk") },
                    { label: "Витрат загалом", value: `${parseFloat(loyalty.totalSpend || 0).toLocaleString("uk")} ₴` },
                    { label: "Візитів", value: loyalty.visitsCount },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white rounded-xl shadow-sm p-3 text-center">
                      <p className="font-bold text-gray-800">{value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                {/* How to earn */}
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <h3 className="font-semibold text-sm mb-3">Як заробити бали</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: "✅", action: "Онлайн чекін", pts: "+50" },
                      { icon: "🏨", action: "Проживання", pts: "+100–500" },
                      { icon: "⭐", action: "Відгук", pts: "+100" },
                      { icon: "👥", action: "Рекомендація", pts: "+200" },
                      { icon: "🧖", action: "SPA послуги", pts: "+50" },
                      { icon: "🍷", action: "Ресторан", pts: "+25" },
                    ].map(({ icon, action, pts }) => (
                      <div key={action} className="bg-gray-50 rounded-xl p-2 flex items-center gap-2">
                        <span>{icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{action}</p>
                        </div>
                        <span className="text-xs font-bold text-purple-600 shrink-0">{pts}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tier benefits */}
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <h3 className="font-semibold text-sm mb-3">Привілеї вашого рівня</h3>
                  <div className="space-y-2">
                    {(loyalty.tier === "platinum" ? [
                      "💎 Особистий дворецький", "🅿️ VIP паркінг", "🥂 Вітальний шампанський",
                      "⬆️ Апгрейд номеру (за наявності)", "🕐 Ранній заїзд + пізній виїзд безкоштовно",
                      "🎁 Подарунок до дня народження", "🔑 Ексклюзивний доступ до VIP-лаунжу",
                    ] : loyalty.tier === "gold" ? [
                      "🥇 Пріоритетне бронювання", "🅿️ Безкоштовний паркінг", "☕ Сніданок включено",
                      "⬆️ Апгрейд номеру (за наявності)", "🕐 Пізній виїзд до 14:00 безкоштовно",
                      "🎁 Подарунок на годовщину", "10% знижка на SPA",
                    ] : loyalty.tier === "silver" ? [
                      "🥈 5% знижка на послуги", "⬆️ Апгрейд номеру при наявності",
                      "🕐 Пізній виїзд до 13:00", "☕ Безкоштовна кава при заїзді",
                      "🎉 Привітання на День народження",
                    ] : [
                      "🥉 Нарахування балів за кожне бронювання",
                      "💡 Доступ до спецпропозицій для учасників",
                      "🎁 Бонус за онлайн чекін",
                    ]).map(b => (
                      <div key={b} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <span className="text-gray-700">{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                <Crown className="h-12 w-12 text-purple-300 mx-auto mb-3" />
                <h3 className="font-bold text-gray-800 mb-2">Програма лояльності</h3>
                <p className="text-sm text-gray-500 mb-4">Заповніть форму онлайн чекіну щоб приєднатись та отримати перші 50 балів!</p>
                <Button onClick={() => setActiveTab("checkin")} variant="outline">
                  Перейти до чекіну
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ REVIEW ═══════════════ */}
        {activeTab === "review" && (
          <div className="space-y-3">
            {reviewDone || (data.review?.submittedAt) ? (
              <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-gray-800">Дякуємо за відгук! 🌟</h3>
                <p className="text-gray-500 mt-2 text-sm">Ваш відгук допомагає нам ставати кращими</p>
                <p className="text-purple-600 font-medium mt-2">+100 бонусних балів нараховано</p>
                {data.review?.overallRating && (
                  <div className="mt-4 bg-gray-50 rounded-xl p-4">
                    <div className="flex justify-center gap-1 mb-2">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} className={`h-6 w-6 ${i <= (data.review?.overallRating || 0) ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
                      ))}
                    </div>
                    {data.review.reviewText && <p className="text-sm text-gray-600 italic">"{data.review.reviewText}"</p>}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
                <div>
                  <h3 className="font-bold text-gray-800 mb-1">Ваш відгук</h3>
                  <p className="text-xs text-gray-500">Оцініть ваше перебування у {booking.propertyName}</p>
                </div>

                {!isAfterStay && !isDuringStay && (
                  <div className="bg-yellow-50 rounded-xl p-3">
                    <p className="text-yellow-700 text-sm">Форма відгуку стане доступна після вашого виїзду</p>
                  </div>
                )}

                {/* Overall rating */}
                <div>
                  <Label className="text-sm font-semibold">Загальна оцінка *</Label>
                  <div className="mt-2"><StarPicker value={reviewForm.overallRating} onChange={v => setReviewForm(p => ({ ...p, overallRating: v }))} /></div>
                  <p className="text-xs text-gray-400 mt-1">
                    {reviewForm.overallRating === 5 ? "Відмінно! Ви наші зірки ⭐" : reviewForm.overallRating === 4 ? "Добре, дякуємо!" : reviewForm.overallRating === 3 ? "Можна краще — розкажіть що не сподобалось" : reviewForm.overallRating > 0 ? "Вибачаємось. Розкажіть де ми підвели" : "Оцініть загальне враження"}
                  </p>
                </div>

                {/* Category ratings */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { field: "cleanlinessRating", label: "🧹 Чистота" },
                    { field: "serviceRating", label: "🤝 Сервіс" },
                    { field: "locationRating", label: "📍 Локація" },
                    { field: "valueRating", label: "💰 Цінність" },
                  ].map(({ field, label }) => (
                    <div key={field}>
                      <Label className="text-xs">{label}</Label>
                      <div className="mt-1">
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(i => (
                            <button key={i} onClick={() => setReviewForm(p => ({ ...p, [field]: i }))}>
                              <Star className={`h-5 w-5 ${i <= (reviewForm as any)[field] ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Text review */}
                <div>
                  <Label className="text-xs">Відгук</Label>
                  <Textarea value={reviewForm.reviewText} onChange={e => setReviewForm(p => ({ ...p, reviewText: e.target.value }))} placeholder="Поділіться вашими враженнями…" rows={4} className="mt-1" />
                </div>

                {/* NPS */}
                <div>
                  <Label className="text-xs">Наскільки ви рекомендували б нас друзям? (0-10)</Label>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button key={n} onClick={() => setReviewForm(p => ({ ...p, npsScore: n }))}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                          reviewForm.npsScore === n
                            ? n >= 9 ? "bg-green-500 text-white" : n >= 7 ? "bg-yellow-500 text-white" : "bg-red-400 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">0 — точно ні · 10 — абсолютно рекомендую</p>
                </div>

                {/* Yes/No */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Повернетесь знову?</Label>
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => setReviewForm(p => ({ ...p, wouldReturn: true }))} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${reviewForm.wouldReturn ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600"}`}>Так ✓</button>
                      <button onClick={() => setReviewForm(p => ({ ...p, wouldReturn: false }))} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${!reviewForm.wouldReturn ? "bg-red-400 text-white" : "bg-gray-100 text-gray-600"}`}>Ні</button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Рекомендуєте друзям?</Label>
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => setReviewForm(p => ({ ...p, recommendToFriend: true }))} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${reviewForm.recommendToFriend ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600"}`}>Так ✓</button>
                      <button onClick={() => setReviewForm(p => ({ ...p, recommendToFriend: false }))} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${!reviewForm.recommendToFriend ? "bg-red-400 text-white" : "bg-gray-100 text-gray-600"}`}>Ні</button>
                    </div>
                  </div>
                </div>

                <Button onClick={submitReview} disabled={submittingReview || reviewForm.overallRating === 0} className="w-full">
                  {submittingReview ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Надсилаємо…</> : <><Star className="h-4 w-4 mr-2" />Залишити відгук</>}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ DOCUMENTS ═══════════════ */}
        {activeTab === "documents" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />Ваші документи
              </h3>
              {documents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Документи завантажуються…</p>
              ) : (
                <div className="space-y-3">
                  {documents.map(doc => (
                    <div key={doc.id} className={`flex items-center gap-3 p-3 rounded-xl ${doc.available ? "bg-gray-50 hover:bg-gray-100" : "bg-gray-50 opacity-50"}`}>
                      <span className="text-2xl">{doc.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{doc.title}</p>
                        <p className="text-xs text-gray-500 truncate">{doc.description}</p>
                        {doc.generatedAt && <p className="text-xs text-gray-400">{new Date(doc.generatedAt).toLocaleDateString("uk")}</p>}
                      </div>
                      {doc.available ? (
                        <Button size="sm" variant="outline" className="h-8 text-xs shrink-0">
                          <Download className="h-3.5 w-3.5 mr-1" />Скачати
                        </Button>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-400 text-xs shrink-0">Недоступно</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-blue-50 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800 text-sm">Захист даних</p>
                  <p className="text-blue-600 text-xs mt-1">Ваші документи зберігаються у захищеному хмарному середовищі та доступні тільки вам протягом 90 днів після виїзду.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ PAYMENT ═══════════════ */}
        {activeTab === "payment" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-green-500" />Оплата
              </h3>
              <div className="space-y-2">
                {[
                  { label: "Всього за проживання", value: `${parseFloat(booking.totalAmount || "0").toLocaleString("uk")} ₴` },
                  { label: "Оплачено", value: `${parseFloat(booking.paidAmount || "0").toLocaleString("uk")} ₴` },
                  { label: "Залишок", value: `${Math.max(0, parseFloat(booking.totalAmount || "0") - parseFloat(booking.paidAmount || "0")).toLocaleString("uk")} ₴` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm border-b border-gray-50 pb-2 last:border-0">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-bold text-gray-800">{value}</span>
                  </div>
                ))}
                <div className="pt-1">
                  <Badge className={paymentStatusMap[booking.paymentStatus]?.color || "bg-gray-100"}>
                    {paymentStatusMap[booking.paymentStatus]?.label || booking.paymentStatus}
                  </Badge>
                </div>
              </div>
            </div>

            {booking.paymentStatus !== "paid" && booking.paymentLink && (
              <a href={booking.paymentLink} target="_blank" rel="noopener noreferrer">
                <Button className="w-full bg-green-600 hover:bg-green-700">
                  <CreditCard className="h-4 w-4 mr-2" />Сплатити онлайн
                </Button>
              </a>
            )}

            {/* Service orders breakdown */}
            {orders.filter(o => parseFloat(o.totalPrice || 0) > 0).length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-sm mb-3">Додаткові послуги</h3>
                <div className="space-y-2">
                  {orders.filter(o => parseFloat(o.totalPrice || 0) > 0).map((order: any) => (
                    <div key={order.id} className="flex justify-between text-sm border-b border-gray-50 pb-1 last:border-0">
                      <span className="text-gray-600">{order.serviceName} × {order.quantity}</span>
                      <span className="font-medium">{parseFloat(order.totalPrice || 0).toLocaleString("uk")} ₴</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-1">
                    <span>Разом послуги</span>
                    <span>{orders.filter(o => parseFloat(o.totalPrice || 0) > 0).reduce((s, o) => s + parseFloat(o.totalPrice || 0), 0).toLocaleString("uk")} ₴</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-400 pb-4">
          <p>🏨 {booking.orgName} · {booking.propertyName}</p>
          {booking.propertyAddress && (
            <p className="mt-0.5 flex items-center justify-center gap-1">
              <MapPin className="w-3 h-3 inline-block" />
              {booking.propertyAddress}
            </p>
          )}
          <p className="mt-1">Гостьовий портал — приємного відпочинку!</p>
        </div>
      </div>
    </div>
  );
}
