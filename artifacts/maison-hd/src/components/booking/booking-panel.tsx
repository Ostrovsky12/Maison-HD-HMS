import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
import { uk } from "date-fns/locale";
import {
  X, LogIn, LogOut, FileEdit, Trash2, BedDouble, Clock, Calendar,
  User, Phone, Mail, CreditCard, Sparkles, MessageSquare, ClipboardList,
  ChevronRight, Plus, Send, Copy, CheckCheck, AlertTriangle, Link2,
  Star, ShoppingBag, Waves, Bike, Zap, StickyNote, CheckCircle2, Circle,
  BadgeCheck, TrendingUp, Smartphone, FileText, ExternalLink, Loader2,
  Download, ChevronDown, ClipboardSignature, QrCode, Globe, RefreshCw,
} from "lucide-react";
import { createPortal } from "react-dom";
import { openGuestCard } from "./guest-card-print";
import { InvoiceModal, type InvoiceData } from "./invoice-modal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = BASE.replace("/maison-hd", "") + "/api";
const tok  = () => localStorage.getItem("hms_token");
const apiFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

// ── Format helpers ─────────────────────────────────────────────────────────
const uah = (n: number = 0) =>
  new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(n);

const STATUS_CFG: Record<string, { label: string; dot: string; pill: string }> = {
  pending:     { label: "Очікує",       dot: "bg-amber-400",   pill: "bg-amber-50 text-amber-700 ring-amber-200/60" },
  confirmed:   { label: "Підтверджено", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200/60" },
  checked_in:  { label: "Проживає",    dot: "bg-blue-500",    pill: "bg-blue-50 text-blue-700 ring-blue-200/60" },
  checked_out: { label: "Виїхав",      dot: "bg-gray-400",    pill: "bg-gray-50 text-gray-600 ring-gray-200/60" },
  cancelled:   { label: "Скасовано",   dot: "bg-red-400",     pill: "bg-red-50 text-red-600 ring-red-200/60" },
};

const PAY_CFG: Record<string, { label: string; color: string }> = {
  unpaid:  { label: "Не оплачено", color: "text-red-600 bg-red-50 ring-red-200/60" },
  partial: { label: "Частково",    color: "text-amber-600 bg-amber-50 ring-amber-200/60" },
  paid:    { label: "Оплачено",    color: "text-emerald-600 bg-emerald-50 ring-emerald-200/60" },
};

const SOURCE_LABEL: Record<string, string> = {
  direct: "Прямий", booking: "Booking.com", airbnb: "Airbnb", other: "Інше",
};

const LOYALTY_CFG: Record<string, { label: string; color: string; icon: typeof Star }> = {
  platinum: { label: "Platinum", color: "text-violet-600 bg-violet-50", icon: Star },
  gold:     { label: "Gold",     color: "text-yellow-600 bg-yellow-50", icon: Star },
  silver:   { label: "Silver",   color: "text-gray-500 bg-gray-100",    icon: Star },
  bronze:   { label: "Bronze",   color: "text-orange-600 bg-orange-50", icon: Star },
};

// ── Tabs ──────────────────────────────────────────────────────────────────
const TABS = [
  { key: "summary",  label: "Огляд",    icon: Calendar },
  { key: "guest",    label: "Гість",    icon: User },
  { key: "payments", label: "Оплата",   icon: CreditCard },
  { key: "services", label: "Послуги",  icon: ShoppingBag },
  { key: "notes",    label: "Нотатки",  icon: StickyNote },
  { key: "tasks",    label: "Завдання", icon: ClipboardList },
  { key: "comms",    label: "Зв'язок",  icon: MessageSquare },
  { key: "upsell",   label: "Апсейл",   icon: Sparkles },
];

// ── Sub-components ─────────────────────────────────────────────────────────
function Row({ icon: Icon, label, value, accent = false }: { icon: any; label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <Icon className="w-4 h-4 text-gray-300 shrink-0" />
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      <span className={`text-sm flex-1 font-medium ${accent ? "text-indigo-600 font-bold text-base" : "text-gray-800"}`}>{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">{children}</p>;
}

function Tile({ label, value, sub, color = "text-gray-900" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-[11px] text-gray-400 font-medium">{label}</span>
      <span className={`text-xl font-bold ${color}`}>{value}</span>
      {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
    </div>
  );
}

// ── Tab: Summary ───────────────────────────────────────────────────────────
function TabSummary({ b }: { b: any }) {
  const nights = b.checkIn && b.checkOut ? differenceInDays(new Date(b.checkOut), new Date(b.checkIn)) : 0;
  const ppn = nights > 0 && b.totalAmount ? Math.round(b.totalAmount / nights) : 0;

  return (
    <div className="space-y-5">
      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-2.5">
        <Tile label="Заїзд"  value={format(new Date(b.checkIn),  "d MMM", { locale: uk })} sub={format(new Date(b.checkIn), "yyyy")} color="text-emerald-600" />
        <Tile label="Виїзд"  value={format(new Date(b.checkOut), "d MMM", { locale: uk })} sub={format(new Date(b.checkOut), "yyyy")} color="text-amber-600" />
        <Tile label="Ночей"  value={String(nights)} sub={ppn ? `${uah(ppn)}/ніч` : undefined} color="text-gray-900" />
      </div>

      {/* Pricing */}
      <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-4 border border-indigo-100/50">
        <SectionLabel>Сума</SectionLabel>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-black text-indigo-700">{uah(b.totalAmount)}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${PAY_CFG[b.paymentStatus]?.color || ""}`}>
            {PAY_CFG[b.paymentStatus]?.label || "—"}
          </span>
          {b.paymentStatus === "partial" && b.totalAmount && (
            <span className="text-xs text-gray-500">залишок ~{uah(b.totalAmount * 0.5)}</span>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="rounded-2xl border border-gray-100 overflow-hidden">
        <Row icon={BedDouble}  label="Номер"   value={b.unitName || `#${b.unitId}`} />
        <Row icon={User}       label="Гостей"  value={`${b.adults || 1} дорослих`} />
        <Row icon={Clock}      label="Заїзд"   value={b.checkinTime  || "14:00"} />
        <Row icon={Clock}      label="Виїзд"   value={b.checkoutTime || "12:00"} />
        <Row icon={Link2}      label="Джерело" value={SOURCE_LABEL[b.source] || b.source || "Прямий"} />
        {b.rateName && <Row icon={BadgeCheck} label="Тариф" value={b.rateName} />}
      </div>
    </div>
  );
}

// ── Send Guest Link Modal ─────────────────────────────────────────────────
function SendGuestLinkModal({ b, code, onClose }: { b: any; code: string; onClose: () => void }) {
  const { toast } = useToast();
  const guestUrl = `${window.location.origin}${BASE}/guest/${code}`;
  const firstName = b.firstName || (b.guestName || "").split(" ").slice(-1)[0] || "Гість";
  const checkInFmt = b.checkIn ? format(new Date(b.checkIn), "dd.MM.yyyy") : "—";
  const checkOutFmt = b.checkOut ? format(new Date(b.checkOut), "dd.MM.yyyy") : "—";
  const unitName = b.unitName || `Номер #${b.unitId}`;
  const nights = b.checkIn && b.checkOut ? differenceInDays(new Date(b.checkOut), new Date(b.checkIn)) : 0;

  const whatsappMsg =
`Вітаємо, ${firstName}! 🏨

Ваше бронювання підтверджено.
📅 Заїзд: ${checkInFmt} · Виїзд: ${checkOutFmt}
🛏 ${unitName} · ${nights} ніч${nights === 1 ? "" : nights < 5 ? "і" : "ей"}

Ваш особистий гостьовий портал:
${guestUrl}

Там ви зможете:
✅ Зробити онлайн чекін
🛎 Замовити послуги
💬 Написати нам
💳 Оплатити онлайн

Чекаємо вас! До зустрічі 🤗`;

  const smsMsg = `Бронювання підтверджено! ${checkInFmt}-${checkOutFmt}, ${unitName}. Ваш портал: ${guestUrl}`;

  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);
  const [copiedSms, setCopiedSms] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeMsg, setActiveMsg] = useState<"whatsapp" | "sms">("whatsapp");

  const copyText = async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setter(true);
    setTimeout(() => setter(false), 2500);
    toast({ title: "Скопійовано ✓" });
  };

  const openWhatsApp = () => {
    const phone = (b.guestPhone || "").replace(/\D/g, "");
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsappMsg)}`
      : `https://wa.me/?text=${encodeURIComponent(whatsappMsg)}`;
    window.open(url, "_blank");
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(guestUrl)}&bgcolor=ffffff&color=1e40af&qzone=1`;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Відправити гостю</h2>
            <p className="text-xs text-gray-400 mt-0.5">Посилання на гостьовий портал</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Guest info */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-bold text-base shrink-0">
              {firstName[0]?.toUpperCase() || "?"}
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{firstName}</p>
              <p className="text-xs text-gray-400">{checkInFmt} → {checkOutFmt} · {unitName}</p>
            </div>
          </div>

          {/* Link + QR */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex gap-4 items-center">
            <img src={qrUrl} alt="QR" className="w-20 h-20 rounded-xl shrink-0 bg-white p-1 shadow-sm" />
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-xs font-semibold text-indigo-700">Гостьовий портал</p>
              <p className="text-[11px] text-indigo-500 break-all font-mono">{guestUrl}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => copyText(guestUrl, setCopiedLink)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-xs font-medium transition-colors"
                >
                  {copiedLink ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? "Скопійовано" : "Копіювати"}
                </button>
                <a href={guestUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-xs font-medium transition-colors">
                  <Globe className="w-3.5 h-3.5" />Відкрити
                </a>
              </div>
            </div>
          </div>

          {/* Tab toggle: WhatsApp / SMS */}
          <div className="flex gap-1.5 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setActiveMsg("whatsapp")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeMsg === "whatsapp" ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
            >
              💬 WhatsApp / Viber
            </button>
            <button
              onClick={() => setActiveMsg("sms")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeMsg === "sms" ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
            >
              📱 SMS
            </button>
          </div>

          {/* Message preview */}
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-green-700">
                {activeMsg === "whatsapp" ? "Шаблон повідомлення WhatsApp/Viber" : "Шаблон SMS"}
              </p>
              <button
                onClick={() => copyText(activeMsg === "whatsapp" ? whatsappMsg : smsMsg, activeMsg === "whatsapp" ? setCopiedWhatsapp : setCopiedSms)}
                className="flex items-center gap-1 px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-xs font-medium transition-colors"
              >
                {(activeMsg === "whatsapp" ? copiedWhatsapp : copiedSms)
                  ? <><CheckCheck className="w-3.5 h-3.5" />Скопійовано</>
                  : <><Copy className="w-3.5 h-3.5" />Копіювати</>}
              </button>
            </div>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-white/70 rounded-xl p-3 border border-green-100 max-h-52 overflow-y-auto">
              {activeMsg === "whatsapp" ? whatsappMsg : smsMsg}
            </pre>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={openWhatsApp}
              className="flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </button>
            <button
              onClick={() => copyText(whatsappMsg, setCopiedWhatsapp)}
              className="flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
            >
              <Send className="w-4 h-4" />
              Скопіювати та відправити
            </button>
          </div>

          {b.guestEmail && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3.5">
              <p className="text-xs font-semibold text-blue-700 mb-1.5">Email</p>
              <p className="text-xs text-blue-600 font-mono">{b.guestEmail}</p>
              <p className="text-xs text-blue-500 mt-1">Скопіюйте посилання та відправте на email вручну або через CRM</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Tab: Guest ─────────────────────────────────────────────────────────────
const CHECKIN_FIELD_LABELS: Record<string, string> = {
  firstName: "Ім'я", lastName: "Прізвище", middleName: "По батькові",
  phone: "Телефон", email: "Email", passportType: "Тип документа",
  passportNumber: "Номер документа", nationality: "Громадянство",
  birthDate: "Дата народження", arrivalTime: "Час прибуття",
  specialRequests: "Побажання", carNumber: "Номер авто",
  hasPet: "Тварина", petType: "Вид тварини", petName: "Кличка",
};

function TabGuest({ b }: { b: any }) {
  const { toast } = useToast();
  const loyalty = b.loyaltyTier ? LOYALTY_CFG[b.loyaltyTier] : null;
  const fullName = [b.lastName, b.firstName, b.middleName].filter(Boolean).join(" ") || b.guestName || "—";
  const [guestCode, setGuestCode] = useState<string>(b.guestAccessCode || "");
  const [generating, setGenerating] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [checkinData, setCheckinData] = useState<{ checkinFormSubmitted: boolean; checkinFormData: Record<string, any> } | null>(null);
  const [loadingCheckin, setLoadingCheckin] = useState(true);

  useEffect(() => {
    apiFetch(`${API}/guest/checkin-data/${b.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCheckinData(d); })
      .finally(() => setLoadingCheckin(false));
  }, [b.id]);

  const guestUrl = guestCode ? `${window.location.origin}${BASE}/guest/${guestCode}` : "";

  const generateCode = async () => {
    setGenerating(true);
    try {
      const res = await apiFetch(`${API}/guest/generate/${b.id}`, { method: "POST" });
      const data = await res.json();
      if (data.code) {
        setGuestCode(data.code);
        toast({ title: "Гостьовий портал створено ✓" });
      } else {
        toast({ title: "Помилка генерації", variant: "destructive" });
      }
    } catch {
      toast({ title: "Помилка підключення", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Guest card */}
      <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-2xl border border-gray-100">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-black text-xl shrink-0">
          {(b.guestName || "?")[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-900 text-base">{fullName}</div>
          {loyalty && (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${loyalty.color}`}>
              <Star className="w-3 h-3 fill-current" /> {loyalty.label}
            </span>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
      </div>

      {/* Contact */}
      <div className="rounded-2xl border border-gray-100 overflow-hidden">
        {b.guestPhone && <Row icon={Phone} label="Телефон" value={b.guestPhone} />}
        {b.guestEmail && <Row icon={Mail}  label="Email"   value={b.guestEmail} />}
        {!b.guestPhone && !b.guestEmail && (
          <div className="p-4 text-sm text-gray-400 text-center">Контакти не вказані</div>
        )}
      </div>

      {/* Guest portal section */}
      {guestCode ? (
        <div className="space-y-2">
          <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-indigo-700">Гостьовий портал активний</p>
                <p className="text-[11px] text-indigo-500 truncate font-mono mt-0.5">/guest/{guestCode}</p>
              </div>
              <CopyButton text={guestUrl} />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowSendModal(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors"
              >
                <Send className="w-3.5 h-3.5" /> Відправити гостю
              </button>
              <a href={guestUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 rounded-xl text-xs font-medium transition-colors">
                <Globe className="w-3.5 h-3.5" /> Переглянути
              </a>
              <button
                onClick={generateCode}
                disabled={generating}
                title="Регенерувати посилання"
                className="flex items-center justify-center px-3 py-2 border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-500 rounded-xl transition-colors"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={generateCode}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-600 rounded-2xl text-sm font-semibold transition-all"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Генерація…</>
          ) : (
            <><QrCode className="w-4 h-4" />Генерувати гостьовий портал</>
          )}
        </button>
      )}

      {/* ── Online Checkin Data ── */}
      {loadingCheckin ? (
        <div className="p-4 rounded-2xl border border-gray-100 flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Завантаження даних чекіну…</span>
        </div>
      ) : checkinData?.checkinFormSubmitted ? (
        <div className="p-4 rounded-2xl border border-emerald-100 bg-emerald-50/40">
          <div className="flex items-center gap-2 mb-3">
            <BadgeCheck className="w-4 h-4 text-emerald-600" />
            <SectionLabel>Онлайн чекін заповнено ✓</SectionLabel>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {Object.entries(checkinData.checkinFormData || {})
              .filter(([k, v]) => v && k !== "coGuests" && typeof v !== "object" && k !== "hasPet")
              .map(([k, v]) => (
                <div key={k} className="text-xs">
                  <span className="text-gray-400 block">{CHECKIN_FIELD_LABELS[k] || k}</span>
                  <span className="font-semibold text-gray-800">{String(v)}</span>
                </div>
              ))}
            {checkinData.checkinFormData?.hasPet && (
              <div className="col-span-2 text-xs">
                <span className="text-gray-400 block">Тварина</span>
                <span className="font-semibold text-gray-800">
                  {checkinData.checkinFormData?.petType || "Так"}{checkinData.checkinFormData?.petName ? ` — ${checkinData.checkinFormData.petName}` : ""}
                </span>
              </div>
            )}
          </div>
          {checkinData.checkinFormData?.coGuests && Array.isArray(checkinData.checkinFormData.coGuests) && checkinData.checkinFormData.coGuests.length > 0 && (
            <div className="mt-3 pt-3 border-t border-emerald-100">
              <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Супутники ({checkinData.checkinFormData.coGuests.length})</p>
              {(checkinData.checkinFormData.coGuests as any[]).map((g, i) => (
                <p key={i} className="text-xs text-gray-700">• {g.firstName} {g.lastName} — {g.passportNumber}</p>
              ))}
            </div>
          )}
          {checkinData.checkinFormData?.specialRequests && (
            <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-2.5">
              <p className="text-xs text-amber-700">💬 <span className="font-semibold">Побажання:</span> {checkinData.checkinFormData.specialRequests}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-2xl border border-dashed border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardSignature className="w-4 h-4 text-gray-300" />
            <span className="text-sm text-gray-400 font-medium">Онлайн чекін не заповнено</span>
          </div>
          <p className="text-xs text-gray-300">Гість заповнить форму через гостьовий портал</p>
        </div>
      )}

      {/* Stay stats */}
      <div className="p-4 rounded-2xl border border-gray-100">
        <SectionLabel>Статистика гостя</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-xl font-bold text-gray-900">1</div>
            <div className="text-[11px] text-gray-400">Візитів</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-gray-900">{differenceInDays(new Date(b.checkOut), new Date(b.checkIn))}</div>
            <div className="text-[11px] text-gray-400">Ночей разом</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-indigo-600">{uah(b.totalAmount || 0)}</div>
            <div className="text-[11px] text-gray-400">Витрачено</div>
          </div>
        </div>
      </div>

      {/* Send modal */}
      {showSendModal && (
        <SendGuestLinkModal b={b} code={guestCode} onClose={() => setShowSendModal(false)} />
      )}
    </div>
  );
}

// ── Tab: Payments ──────────────────────────────────────────────────────────
function TabPayments({ b }: { b: any }) {
  const { toast } = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Payment link state — initialize from DB if already generated
  const [linkLoading, setLinkLoading] = useState(false);
  const [paymentLink, setPaymentLink] = useState<string | null>((b as any).paymentLink || null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Invoice state
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch(`${API}/payments?booking_id=${b.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setPayments(Array.isArray(d) ? d : []))
      .catch(() => setPayments([]))
      .finally(() => setLoading(false));
  }, [b.id]);

  const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = (b.totalAmount || 0) - paid;

  const METHOD_LABEL: Record<string, string> = {
    cash: "Готівка", card: "Картка", liqpay: "LiqPay", wayforpay: "WayForPay", bank: "Банк", other: "Інше",
  };

  // Generate real LiqPay payment link
  const generatePaymentLink = async () => {
    setLinkLoading(true);
    setPaymentLink(null);
    try {
      const res = await apiFetch(`${API}/bookings/${b.id}/payment-link`, { method: "POST" });
      const data = await res.json();
      if (data.paymentLink || data.url) {
        setPaymentLink(data.paymentLink || data.url);
        toast({ title: "Посилання для оплати сформовано ✓" });
      } else if (data.error === "liqpay_not_configured") {
        toast({
          title: "LiqPay не налаштовано",
          description: "Додайте LiqPay Public та Private ключі у Налаштування → Юридичні особи",
          variant: "destructive",
        });
      } else {
        toast({ title: "Не вдалось сформувати посилання", description: data.message || data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Помилка підключення до сервера", variant: "destructive" });
    } finally {
      setLinkLoading(false);
    }
  };

  const copyPaymentLink = async () => {
    if (!paymentLink) return;
    await navigator.clipboard.writeText(paymentLink).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };

  // Generate / open invoice
  const generateInvoice = async (entityId?: number) => {
    setInvoiceLoading(true);
    try {
      const params = entityId ? `?legalEntityId=${entityId}` : "";
      const res = await apiFetch(`${API}/bookings/${b.id}/invoice${params}`);
      if (!res.ok) throw new Error("Failed to load invoice");
      const data = await res.json();
      setInvoiceData(data as InvoiceData);
    } catch {
      toast({ title: "Помилка завантаження рахунку", variant: "destructive" });
    } finally {
      setInvoiceLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Balance summary */}
      <div className="grid grid-cols-3 gap-2.5">
        <Tile label="Сума"     value={uah(b.totalAmount || 0)} color="text-gray-800" />
        <Tile label="Оплачено" value={uah(paid)} color="text-emerald-600" />
        <Tile label="Залишок"  value={uah(Math.max(0, balance))} color={balance > 0 ? "text-red-600" : "text-gray-400"} />
      </div>

      {/* ── PENDING PAYMENT BANNER ── */}
      {b.status === "pending" && paymentLink && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-bold text-amber-800">Очікує оплати від гостя</span>
          </div>
          <div className="text-[11px] text-amber-700 bg-white border border-amber-200 rounded-xl px-3 py-2 font-mono break-all">
            {paymentLink}
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyPaymentLink}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors"
            >
              {linkCopied ? <><CheckCheck className="w-3.5 h-3.5" /> Скопійовано!</> : <><Copy className="w-3.5 h-3.5" /> Копіювати</>}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Оплатіть бронювання за посиланням: ${paymentLink}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-colors"
            >
              WhatsApp
            </a>
            <a
              href={paymentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center px-3 rounded-xl border border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          <p className="text-[10px] text-amber-600">Після оплати бронювання підтвердиться автоматично</p>
        </div>
      )}

      {/* ── ACTION BUTTONS ── */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Invoice */}
        <button
          onClick={() => generateInvoice()}
          disabled={invoiceLoading}
          className="flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 border-indigo-100 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {invoiceLoading
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <FileText className="w-5 h-5" />}
          <span>Сформувати рахунок</span>
        </button>

        {/* Payment link */}
        <button
          onClick={generatePaymentLink}
          disabled={linkLoading}
          className="flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 border-violet-100 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {linkLoading
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <Link2 className="w-5 h-5" />}
          <span>LiqPay посилання</span>
        </button>
      </div>

      {/* ── Generated payment link ── */}
      {paymentLink && (
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-violet-700">
            <Link2 className="w-3.5 h-3.5" /> Посилання на оплату
          </div>
          <div className="text-[11px] text-violet-600 bg-white border border-violet-100 rounded-xl px-3 py-2 font-mono break-all">
            {paymentLink}
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyPaymentLink}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors"
            >
              {linkCopied ? <><CheckCheck className="w-3.5 h-3.5" /> Скопійовано!</> : <><Copy className="w-3.5 h-3.5" /> Копіювати</>}
            </button>
            <a
              href={paymentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center px-3 rounded-xl border border-violet-200 text-violet-600 hover:bg-violet-100 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* InvoiceModal rendered as portal */}
      {invoiceData && (
        <InvoiceModal
          data={invoiceData}
          bookingId={b.id}
          onClose={() => setInvoiceData(null)}
          onReload={(entityId) => generateInvoice(entityId)}
        />
      )}

      {/* ── Transaction list ── */}
      <div className="rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 pt-3 pb-2">
          <SectionLabel>Транзакції</SectionLabel>
        </div>
        {loading ? (
          <div className="p-4 text-center text-sm text-gray-400">Завантаження...</div>
        ) : payments.length === 0 ? (
          <div className="p-6 text-center">
            <CreditCard className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Платежів ще немає</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {payments.map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800">{uah(Number(p.amount))}</div>
                  <div className="text-[11px] text-gray-400">{METHOD_LABEL[p.payment_method] || p.payment_method} · {p.payment_date ? format(new Date(p.payment_date), "d MMM yyyy", { locale: uk }) : "—"}</div>
                </div>
                <span className="text-[11px] bg-emerald-50 text-emerald-600 font-semibold px-2 py-0.5 rounded-full">OK</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Send link button (if balance remains) */}
      {balance > 0 && paymentLink && (
        <button
          onClick={() => navigator.clipboard.writeText(`Оплата за бронювання:\n${paymentLink}`).catch(() => {})}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
        >
          <Send className="w-4 h-4" /> Скопіювати повідомлення з посиланням
        </button>
      )}
    </div>
  );
}

// ── Add Service Order Dialog + Tab: Services ───────────────────────────────
function AddServiceDialog({
  bookingId, type, onClose, onSaved,
}: { bookingId: number; type: "spa" | "rental" | "service"; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    serviceName: "", requestedTime: "", guestNotes: "", price: "", quantity: "1",
  });

  const PRESETS: Record<string, { name: string; price: string }[]> = {
    spa: [
      { name: "SPA — масаж класичний (60 хв)", price: "800" },
      { name: "SPA — масаж релакс (90 хв)", price: "1200" },
      { name: "SPA — ароматерапія", price: "700" },
      { name: "SPA — сауна (1 год)", price: "500" },
      { name: "SPA — джакузі (30 хв)", price: "400" },
    ],
    rental: [
      { name: "Прокат велосипеда (1 день)", price: "200" },
      { name: "Прокат самоката (1 день)", price: "150" },
      { name: "Прокат байдарки (1 год)", price: "300" },
      { name: "Прокат мангал + вугілля", price: "250" },
    ],
    service: [
      { name: "Барбекю-набір", price: "500" },
      { name: "Святковий декор кімнати", price: "800" },
      { name: "Букет квітів", price: "600" },
      { name: "Пляшка вина", price: "700" },
      { name: "Торт на замовлення", price: "1200" },
    ],
  };

  const title = type === "spa" ? "Записати на SPA" : type === "rental" ? "Додати прокат" : "Додати послугу";

  const save = async () => {
    if (!form.serviceName) { toast({ title: "Введіть назву послуги", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await apiFetch(`${API}/guest/service-orders`, {
        method: "POST",
        body: JSON.stringify({
          bookingId, serviceName: form.serviceName, serviceType: type,
          quantity: parseInt(form.quantity) || 1,
          requestedTime: form.requestedTime || null,
          guestNotes: form.guestNotes || null,
          price: form.price ? parseFloat(form.price) : null,
          totalPrice: form.price ? parseFloat(form.price) * (parseInt(form.quantity) || 1) : null,
        }),
      });
      if (r.ok) {
        toast({ title: `${title} — збережено ✓` });
        onSaved();
        onClose();
      } else {
        const d = await r.json();
        toast({ title: d.error || "Помилка", variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Presets */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Швидкий вибір</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS[type]?.map(p => (
                <button key={p.name} onClick={() => setForm(f => ({ ...f, serviceName: p.name, price: p.price }))}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.serviceName === p.name ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700"}`}>
                  {p.name.split("(")[0].trim()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold">Назва послуги *</label>
            <input value={form.serviceName} onChange={e => setForm(f => ({ ...f, serviceName: e.target.value }))}
              placeholder="Введіть назву..."
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-semibold">Час / дата</label>
              <input value={form.requestedTime} onChange={e => setForm(f => ({ ...f, requestedTime: e.target.value }))}
                placeholder="Напр. 14:00, 12.05"
                className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-semibold">Кількість</label>
              <input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold">Ціна (₴)</label>
            <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              placeholder="0"
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold">Нотатка</label>
            <textarea value={form.guestNotes} onChange={e => setForm(f => ({ ...f, guestNotes: e.target.value }))}
              rows={2} placeholder="Додаткова інформація..."
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Скасувати
            </button>
            <button onClick={save} disabled={saving || !form.serviceName}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors disabled:opacity-60">
              {saving ? "Збереження…" : "Зберегти"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

const ORDER_STATUS_PANEL: Record<string, { label: string; color: string }> = {
  pending:   { label: "Нове",         color: "bg-amber-50 text-amber-700 ring-amber-200" },
  confirmed: { label: "Підтверджено", color: "bg-blue-50 text-blue-700 ring-blue-200" },
  completed: { label: "Виконано",     color: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  cancelled: { label: "Скасовано",    color: "bg-gray-100 text-gray-500 ring-gray-200" },
};

function TabServices({ b }: { b: any }) {
  const { toast } = useToast();
  const addons = b.selectedAddons || {};
  const addonKeys = Object.entries(addons).filter(([, v]) => v).map(([k]) => k);
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [addDialog, setAddDialog] = useState<"spa" | "rental" | "service" | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const ADDON_LABELS: Record<string, { label: string; icon: string }> = {
    animal_cat:    { label: "З кішкою",         icon: "🐱" },
    animal_dog:    { label: "З собакою",         icon: "🐶" },
    baby_cot:      { label: "Дитяче ліжечко",    icon: "🛏" },
    baby_chair:    { label: "Дитячий стілець",    icon: "🪑" },
    extra_pillows: { label: "Додаткові подушки", icon: "🛋" },
    extra_blanket: { label: "Додаткова ковдра",  icon: "🛌" },
    double_bed:    { label: "Суцільне ліжко",    icon: "🛏" },
  };

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const r = await apiFetch(`${API}/guest/service-orders?status=all&limit=100`);
      if (r.ok) {
        const all = await r.json();
        setOrders(all.filter((o: any) => o.bookingId === b.id));
      }
    } finally { setLoadingOrders(false); }
  };

  useEffect(() => { loadOrders(); }, [b.id]);

  const updateStatus = async (id: number, status: string) => {
    setUpdatingId(id);
    const r = await apiFetch(`${API}/guest/service-orders/${id}`, {
      method: "PATCH", body: JSON.stringify({ status }),
    });
    if (r.ok) { toast({ title: "Статус оновлено" }); loadOrders(); }
    setUpdatingId(null);
  };

  const spaOrders = orders.filter(o => o.serviceType === "spa");
  const rentalOrders = orders.filter(o => o.serviceType === "rental");
  const otherOrders = orders.filter(o => o.serviceType !== "spa" && o.serviceType !== "rental");

  const OrderCard = ({ o }: { o: any }) => {
    const st = ORDER_STATUS_PANEL[o.status] || ORDER_STATUS_PANEL.pending;
    return (
      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{o.serviceName}</span>
            <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${st.color}`}>{st.label}</span>
          </div>
          {o.requestedTime && <p className="text-xs text-gray-400 mt-0.5">⏰ {o.requestedTime}</p>}
          {o.guestNotes && <p className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded mt-1 inline-block">💬 {o.guestNotes}</p>}
          {o.price && <p className="text-xs font-bold text-indigo-700 mt-0.5">{parseFloat(o.price).toLocaleString("uk")} ₴ × {o.quantity || 1}</p>}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {o.status === "pending" && (
            <>
              <button onClick={() => updateStatus(o.id, "confirmed")} disabled={updatingId === o.id}
                className="px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-700 transition-colors">
                {updatingId === o.id ? "…" : "Підтвердити"}
              </button>
              <button onClick={() => updateStatus(o.id, "cancelled")} disabled={updatingId === o.id}
                className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-semibold rounded-lg hover:bg-gray-200 transition-colors">
                Скасувати
              </button>
            </>
          )}
          {o.status === "confirmed" && (
            <button onClick={() => updateStatus(o.id, "completed")} disabled={updatingId === o.id}
              className="px-2 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-700 transition-colors">
              ✓ Виконано
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Addons */}
      {addonKeys.length > 0 && (
        <div>
          <SectionLabel>Обрані опції при бронюванні</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {addonKeys.map(k => {
              const cfg = ADDON_LABELS[k] || { label: k, icon: "✓" };
              return (
                <div key={k} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="text-xl">{cfg.icon}</span>
                  <span className="text-sm text-gray-700 font-medium">{cfg.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SPA */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>SPA-записи</SectionLabel>
          <button onClick={() => setAddDialog("spa")} className="text-xs text-indigo-600 font-semibold hover:text-indigo-800 flex items-center gap-1">
            <Plus className="w-3 h-3" />Записати
          </button>
        </div>
        {loadingOrders ? <div className="text-center py-3 text-gray-400"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
          : spaOrders.length === 0 ? (
            <div className="p-4 rounded-2xl border border-dashed border-gray-200 text-center">
              <Waves className="w-7 h-7 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Немає SPA-записів</p>
              <button onClick={() => setAddDialog("spa")} className="mt-2 text-xs text-indigo-500 hover:underline font-semibold">+ Записати на SPA</button>
            </div>
          ) : (
            <div className="space-y-2">{spaOrders.map(o => <OrderCard key={o.id} o={o} />)}</div>
          )}
      </div>

      {/* Rental */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Прокат</SectionLabel>
          <button onClick={() => setAddDialog("rental")} className="text-xs text-indigo-600 font-semibold hover:text-indigo-800 flex items-center gap-1">
            <Plus className="w-3 h-3" />Додати
          </button>
        </div>
        {loadingOrders ? <div className="text-center py-3 text-gray-400"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
          : rentalOrders.length === 0 ? (
            <div className="p-4 rounded-2xl border border-dashed border-gray-200 text-center">
              <Bike className="w-7 h-7 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Прокат не замовлений</p>
              <button onClick={() => setAddDialog("rental")} className="mt-2 text-xs text-indigo-500 hover:underline font-semibold">+ Додати прокат</button>
            </div>
          ) : (
            <div className="space-y-2">{rentalOrders.map(o => <OrderCard key={o.id} o={o} />)}</div>
          )}
      </div>

      {/* Other services */}
      {otherOrders.length > 0 && (
        <div>
          <SectionLabel>Інші послуги</SectionLabel>
          <div className="space-y-2">{otherOrders.map(o => <OrderCard key={o.id} o={o} />)}</div>
        </div>
      )}

      <button onClick={() => setAddDialog("service")}
        className="w-full py-2.5 border-2 border-dashed border-indigo-100 hover:border-indigo-300 text-indigo-600 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
        <Plus className="w-3.5 h-3.5" />Додати послугу
      </button>

      {addDialog && (
        <AddServiceDialog bookingId={b.id} type={addDialog} onClose={() => setAddDialog(null)} onSaved={loadOrders} />
      )}
    </div>
  );
}

// ── Tab: Notes ─────────────────────────────────────────────────────────────
function TabNotes({ b, onSave }: { b: any; onSave: (notes: string) => void }) {
  const [notes, setNotes] = useState(b.notes || "");
  const [saved, setSaved] = useState(false);

  const save = async () => {
    onSave(notes);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div>
        <SectionLabel>Нотатки до бронювання</SectionLabel>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={5}
          placeholder="Додайте нотатку для команди..."
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none transition-all"
        />
        <button
          onClick={save}
          className="mt-2 flex items-center gap-1.5 text-xs text-indigo-600 font-semibold hover:text-indigo-800"
        >
          {saved ? <><CheckCheck className="w-3.5 h-3.5" /> Збережено</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Зберегти нотатки</>}
        </button>
      </div>

      <div>
        <SectionLabel>Внутрішні нотатки (не видно гостю)</SectionLabel>
        <textarea
          rows={3}
          placeholder="Для персоналу..."
          className="w-full px-4 py-3 bg-amber-50 border border-amber-100 rounded-2xl text-sm text-gray-800 placeholder-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-300 resize-none transition-all"
        />
      </div>

      {/* Tags */}
      <div>
        <SectionLabel>Теги</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {["VIP", "Медовий місяць", "День народження", "Бізнес"].map(tag => (
            <button key={tag} className="px-3 py-1.5 rounded-full border-2 border-dashed border-gray-200 text-xs text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors font-medium">
              + {tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Tasks ─────────────────────────────────────────────────────────────
function TabTasks({ b }: { b: any }) {
  const tasks = [
    { id: 1, text: "Підготувати номер до заїзду", done: true,  priority: "high" },
    { id: 2, text: "Перевірити побажання гостя",  done: false, priority: "medium" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Завдання по бронюванню</SectionLabel>
        <button className="flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:text-indigo-800">
          <Plus className="w-3.5 h-3.5" /> Додати
        </button>
      </div>

      {tasks.map(t => (
        <div key={t.id} className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${t.done ? "bg-gray-50 border-gray-100 opacity-60" : "bg-white border-gray-200 shadow-sm"}`}>
          {t.done ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <Circle className="w-5 h-5 text-gray-300 shrink-0" />}
          <span className={`text-sm flex-1 ${t.done ? "line-through text-gray-400" : "text-gray-800 font-medium"}`}>{t.text}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.priority === "high" ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-400"}`}>
            {t.priority === "high" ? "Важливо" : "Звичайне"}
          </span>
        </div>
      ))}

      <button className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors font-medium flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Нове завдання
      </button>
    </div>
  );
}

// ── Tab: Communication ─────────────────────────────────────────────────────
function TabComms({ b }: { b: any }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const r = await apiFetch(`${API}/guest/messages/${b.id}`);
    if (r.ok) {
      const msgs = await r.json();
      setMessages(msgs);
    }
    setLoading(false);
  }, [b.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const r = await apiFetch(`${API}/guest/message/${b.id}`, {
        method: "POST", body: JSON.stringify({ message: text }),
      });
      if (r.ok) {
        setDraft("");
        await loadMessages();
      } else {
        toast({ title: "Помилка відправки", variant: "destructive" });
      }
    } finally { setSending(false); }
  };

  const fmtTime = (d: string) => {
    try { return new Date(d).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };
  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("uk-UA", { day: "2-digit", month: "short" }); }
    catch { return ""; }
  };

  // Group messages by date
  const grouped: { date: string; msgs: any[] }[] = [];
  for (const m of messages) {
    const day = fmtDate(m.createdAt);
    const last = grouped[grouped.length - 1];
    if (last?.date === day) last.msgs.push(m);
    else grouped.push({ date: day, msgs: [m] });
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Quick link to guest portal */}
      {b.guestAccessCode && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-xl">
          <MessageSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="text-xs text-indigo-600 font-medium flex-1 truncate">Чат через гостьовий портал /guest/{b.guestAccessCode}</span>
          <button onClick={loadMessages} className="p-1 text-indigo-400 hover:text-indigo-600">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-3" style={{ maxHeight: "400px", minHeight: "200px" }}>
        {loading ? (
          <div className="flex items-center justify-center h-24 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400">
            <MessageSquare className="w-8 h-8 text-gray-200" />
            <p className="text-sm">Повідомлень ще немає</p>
            <p className="text-xs text-gray-300">Напишіть першими або гість напише через портал</p>
          </div>
        ) : (
          grouped.map(({ date, msgs }) => (
            <div key={date}>
              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[10px] text-gray-400 font-medium px-2">{date}</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="space-y-2">
                {msgs.map((m: any) => {
                  const isOut = m.direction === "hotel_to_guest";
                  return (
                    <div key={m.id} className={`flex gap-2 ${isOut ? "justify-end" : "justify-start"}`}>
                      {!isOut && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">
                          {(m.senderName || b.guestName || "Г")[0].toUpperCase()}
                        </div>
                      )}
                      <div className={`max-w-[78%] group`}>
                        {!isOut && <p className="text-[10px] text-gray-400 mb-0.5 ml-1">{m.senderName || b.guestName || "Гість"}</p>}
                        <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isOut
                            ? "bg-indigo-600 text-white rounded-tr-sm"
                            : m.isRead === false
                            ? "bg-amber-50 text-gray-800 border border-amber-100 rounded-tl-sm"
                            : "bg-gray-100 text-gray-800 rounded-tl-sm"
                        }`}>
                          <p style={{ whiteSpace: "pre-wrap" }}>{m.message}</p>
                          <p className={`text-[10px] mt-1 text-right ${isOut ? "text-indigo-200" : "text-gray-400"}`}>{fmtTime(m.createdAt)}</p>
                        </div>
                      </div>
                      {isOut && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">
                          АД
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="border-t border-gray-100 pt-3 mt-2">
        <div className="flex gap-2 items-end">
          <textarea
            rows={2}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Написати повідомлення гостю... (Enter — надіслати)"
            className="flex-1 px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !draft.trim()}
            className="h-10 w-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl flex items-center justify-center shrink-0 transition-colors"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-gray-300 mt-1.5 text-center">Повідомлення з'явиться в гостьовому порталі гостя</p>
      </div>
    </div>
  );
}

// ── Tab: Upsell ────────────────────────────────────────────────────────────
function TabUpsell({ b }: { b: any }) {
  const actions = [
    { icon: Waves,   label: "Записати на SPA",         sub: "Пакети від 350 UAH",     color: "from-cyan-50 to-blue-50 border-cyan-100",   btn: "text-cyan-700 bg-cyan-100 hover:bg-cyan-200" },
    { icon: TrendingUp, label: "Апгрейд номера",       sub: "Є вільні кімнати вищого класу", color: "from-violet-50 to-indigo-50 border-violet-100", btn: "text-violet-700 bg-violet-100 hover:bg-violet-200" },
    { icon: ShoppingBag, label: "Замовити сніданок",   sub: "Включити в рахунок",     color: "from-amber-50 to-yellow-50 border-amber-100", btn: "text-amber-700 bg-amber-100 hover:bg-amber-200" },
    { icon: Bike,    label: "Прокат велосипеда",        sub: "700 UAH/день",           color: "from-emerald-50 to-green-50 border-emerald-100", btn: "text-emerald-700 bg-emerald-100 hover:bg-emerald-200" },
    { icon: Zap,     label: "Пізній виїзд до 15:00",   sub: "Запропонувати за 300 UAH", color: "from-orange-50 to-red-50 border-orange-100", btn: "text-orange-700 bg-orange-100 hover:bg-orange-200" },
  ];

  return (
    <div className="space-y-2.5">
      <SectionLabel>Пропозиції для гостя</SectionLabel>
      {actions.map((a, i) => (
        <div key={i} className={`flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r border ${a.color}`}>
          <div className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center shrink-0 shadow-sm">
            <a.icon className="w-5 h-5 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">{a.label}</p>
            <p className="text-xs text-gray-500">{a.sub}</p>
          </div>
          <button className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors ${a.btn}`}>
            Додати
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Copy button helper ─────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="p-1.5 rounded-lg hover:bg-indigo-100 text-indigo-400 hover:text-indigo-600 transition-colors">
      {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────
export interface BookingPanelProps {
  booking: any;
  open: boolean;
  onClose: () => void;
  onCheckin: (id: number) => void;
  onCheckout: (id: number) => void;
  onCancel: (id: number) => void;
  onEdit: (b: any) => void;
  onDelete: (id: number) => void;
}

export function BookingPanel({ booking: b, open, onClose, onCheckin, onCheckout, onCancel, onEdit, onDelete }: BookingPanelProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState("summary");

  useEffect(() => {
    if (open) setTab("summary");
  }, [b?.id, open]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!b) return null;

  const canCheckin  = b.status === "confirmed" || b.status === "pending";
  const canCheckout = b.status === "checked_in";
  const canCancel   = b.status === "confirmed" || b.status === "pending";
  const canDelete   = b.status === "checked_out" || b.status === "cancelled";

  const sCfg = STATUS_CFG[b.status] || STATUS_CFG.pending;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-screen w-[580px] max-w-full z-50 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>

        {/* ── Header ── */}
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-600 flex items-center justify-center text-white font-black text-lg shrink-0 shadow-sm">
              {(b.guestName || "?")[0].toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-gray-900 text-lg leading-tight truncate">{b.guestName || "—"}</h2>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${sCfg.pill}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sCfg.dot}`} />
                  {sCfg.label}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Бронювання #{b.id} · {b.unitName || `Юніт #${b.unitId}`}</p>
            </div>

            {/* Close */}
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary actions (contextual) */}
          <div className="flex gap-2 mt-4">
            {canCheckin && (
              <button
                onClick={() => { onCheckin(b.id); onClose(); }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm shadow-emerald-500/25"
              >
                <LogIn className="w-4 h-4" /> Check-in
              </button>
            )}
            {canCheckout && (
              <button
                onClick={() => { onCheckout(b.id); onClose(); }}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm shadow-blue-500/25"
              >
                <LogOut className="w-4 h-4" /> Check-out
              </button>
            )}
            {(b.status === "confirmed" || b.status === "checked_in") && (
              <button
                onClick={async () => {
                  let rules: string | null = null;
                  try {
                    const r = await apiFetch(`${API}/organizations/me`);
                    if (r.ok) { const org = await r.json(); rules = org.guestCardRules || null; }
                  } catch {}
                  openGuestCard(b, rules);
                }}
                title="Анкета гостя (друк)"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-violet-200 bg-violet-50 text-sm text-violet-700 font-semibold hover:bg-violet-100 transition-colors"
              >
                <ClipboardSignature className="w-4 h-4" /> Анкета
              </button>
            )}
            <button
              onClick={() => { onEdit(b); onClose(); }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              <FileEdit className="w-4 h-4" /> Редагувати
            </button>
            {canCancel && (
              <button
                onClick={() => { if (window.confirm("Скасувати?")) { onCancel(b.id); onClose(); } }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-200 text-sm text-red-600 font-semibold hover:bg-red-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => { if (window.confirm("Видалити бронювання?")) { onDelete(b.id); onClose(); } }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-200 text-sm text-red-600 font-semibold hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-0 mt-4 -mb-px overflow-x-auto scrollbar-hide">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
                  tab === t.key
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <t.icon className="w-3.5 h-3.5 shrink-0" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "summary"  && <TabSummary  b={b} />}
          {tab === "guest"    && <TabGuest    b={b} />}
          {tab === "payments" && <TabPayments b={b} />}
          {tab === "services" && <TabServices b={b} />}
          {tab === "notes"    && <TabNotes    b={b} onSave={() => {}} />}
          {tab === "tasks"    && <TabTasks    b={b} />}
          {tab === "comms"    && <TabComms    b={b} />}
          {tab === "upsell"   && <TabUpsell   b={b} />}
        </div>

        {/* ── Footer hint ── */}
        <div className="shrink-0 px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">Бронювання #{b.id}</span>
          <span className="text-[11px] text-gray-400">ESC — закрити</span>
        </div>
      </div>
    </>
  );
}
