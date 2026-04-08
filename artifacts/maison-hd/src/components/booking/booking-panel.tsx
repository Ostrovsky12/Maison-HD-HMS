import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
import { uk } from "date-fns/locale";
import {
  X, LogIn, LogOut, FileEdit, Trash2, BedDouble, Clock, Calendar,
  User, Phone, Mail, CreditCard, Sparkles, MessageSquare, ClipboardList,
  ChevronRight, Plus, Send, Copy, CheckCheck, AlertTriangle, Link2,
  Star, ShoppingBag, Waves, Bike, Zap, StickyNote, CheckCircle2, Circle,
  BadgeCheck, TrendingUp, Smartphone, FileText, ExternalLink, Loader2,
  Download, ChevronDown, ClipboardSignature,
} from "lucide-react";
import { openGuestCard } from "./guest-card-print";

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

// ── Tab: Guest ─────────────────────────────────────────────────────────────
function TabGuest({ b }: { b: any }) {
  const loyalty = b.loyaltyTier ? LOYALTY_CFG[b.loyaltyTier] : null;
  const fullName = [b.lastName, b.firstName, b.middleName].filter(Boolean).join(" ") || b.guestName || "—";

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

      {/* Guest portal link */}
      {b.guestAccessCode && (
        <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-3">
          <Smartphone className="w-4 h-4 text-indigo-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-indigo-700">Гостьовий портал</p>
            <p className="text-xs text-indigo-500 truncate">/guest/{b.guestAccessCode}</p>
          </div>
          <CopyButton text={`${window.location.origin}${BASE}/guest/${b.guestAccessCode}`} />
        </div>
      )}

      {/* Stay history placeholder */}
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
  const [invoice, setInvoice] = useState<any | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceCopied, setInvoiceCopied] = useState(false);

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

  // Generate invoice
  const generateInvoice = async () => {
    setInvoiceLoading(true);
    try {
      const res = await apiFetch(`${API}/bookings/${b.id}/invoice`);
      const data = await res.json();
      setInvoice(data);
      setInvoiceOpen(true);
    } catch {
      setInvoice(null);
    } finally {
      setInvoiceLoading(false);
    }
  };

  const copyInvoiceText = async () => {
    if (!invoice) return;
    const text = [
      `РАХУНОК № ${invoice.invoiceNumber}`,
      `Дата: ${invoice.date}`,
      ``,
      `Гість: ${invoice.booking?.guestName}`,
      `Номер: ${invoice.booking?.unitName}`,
      `Заїзд: ${invoice.booking?.checkIn} о ${invoice.booking?.checkinTime || "14:00"}`,
      `Виїзд: ${invoice.booking?.checkOut} о ${invoice.booking?.checkoutTime || "12:00"}`,
      `Ночей: ${invoice.booking?.nights}`,
      ``,
      `До сплати: ${uah(invoice.booking?.totalAmount)}`,
      `Оплачено: ${uah(invoice.booking?.paidAmount)}`,
      `Залишок: ${uah(invoice.booking?.dueAmount)}`,
      ``,
      invoice.seller?.name ? `Постачальник: ${invoice.seller.name}` : "",
      invoice.seller?.edrpou ? `ЄДРПОУ: ${invoice.seller.edrpou}` : "",
      invoice.seller?.iban ? `IBAN: ${invoice.seller.iban}` : "",
    ].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(text).catch(() => {});
    setInvoiceCopied(true);
    setTimeout(() => setInvoiceCopied(false), 2500);
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
          onClick={generateInvoice}
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

      {/* ── Generated invoice ── */}
      {invoice && (
        <div className="rounded-2xl border border-indigo-100 overflow-hidden">
          <button
            onClick={() => setInvoiceOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 hover:bg-indigo-100 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-700">
              <FileText className="w-3.5 h-3.5" />
              Рахунок № {invoice.invoiceNumber}
            </div>
            <ChevronDown className={`w-4 h-4 text-indigo-500 transition-transform ${invoiceOpen ? "rotate-180" : ""}`} />
          </button>

          {invoiceOpen && (
            <div className="p-4 bg-white space-y-3 text-xs">
              {/* Header */}
              <div className="flex justify-between text-gray-500">
                <span>Дата:</span>
                <span className="font-semibold text-gray-800">{invoice.date}</span>
              </div>

              {/* Booking details */}
              <div className="space-y-1.5 py-3 border-y border-gray-100">
                <div className="flex justify-between">
                  <span className="text-gray-500">Гість</span>
                  <span className="font-semibold text-gray-800">{invoice.booking?.guestName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Номер / юніт</span>
                  <span className="font-semibold text-gray-800">{invoice.booking?.unitName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Заїзд</span>
                  <span className="font-semibold text-gray-800">{invoice.booking?.checkIn} о {invoice.booking?.checkinTime || "14:00"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Виїзд</span>
                  <span className="font-semibold text-gray-800">{invoice.booking?.checkOut} о {invoice.booking?.checkoutTime || "12:00"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Ночей</span>
                  <span className="font-semibold text-gray-800">{invoice.booking?.nights}</span>
                </div>
              </div>

              {/* Amounts */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-gray-500">
                  <span>Загальна сума</span>
                  <span className="font-bold text-gray-900 text-sm">{uah(invoice.booking?.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Оплачено</span>
                  <span className="font-semibold text-emerald-600">{uah(invoice.booking?.paidAmount)}</span>
                </div>
                {invoice.booking?.dueAmount > 0 && (
                  <div className="flex justify-between font-bold border-t border-gray-100 pt-2">
                    <span className="text-red-600">До сплати</span>
                    <span className="text-red-600 text-sm">{uah(invoice.booking?.dueAmount)}</span>
                  </div>
                )}
              </div>

              {/* Seller info */}
              {invoice.seller?.name && invoice.seller.name !== "Maison HD" && (
                <div className="pt-2 border-t border-gray-100 space-y-1 text-gray-400">
                  <div className="font-semibold text-gray-600 text-[11px] uppercase tracking-wide mb-1">Постачальник</div>
                  <div>{invoice.seller.name}</div>
                  {invoice.seller.edrpou && <div>ЄДРПОУ: {invoice.seller.edrpou}</div>}
                  {invoice.seller.iban && <div>IBAN: {invoice.seller.iban}</div>}
                  {invoice.seller.bank && <div>Банк: {invoice.seller.bank}</div>}
                </div>
              )}

              {/* Copy button */}
              <button
                onClick={copyInvoiceText}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-indigo-100 text-indigo-600 hover:bg-indigo-50 text-xs font-semibold transition-colors"
              >
                {invoiceCopied ? <><CheckCheck className="w-3.5 h-3.5" /> Скопійовано!</> : <><Copy className="w-3.5 h-3.5" /> Копіювати рахунок</>}
              </button>
            </div>
          )}
        </div>
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

// ── Tab: Services ──────────────────────────────────────────────────────────
function TabServices({ b }: { b: any }) {
  const addons = b.selectedAddons || {};
  const addonKeys = Object.entries(addons).filter(([, v]) => v).map(([k]) => k);

  const ADDON_LABELS: Record<string, { label: string; icon: string }> = {
    animal_cat:    { label: "З кішкою",              icon: "🐱" },
    animal_dog:    { label: "З собакою",              icon: "🐶" },
    baby_cot:      { label: "Дитяче ліжечко",         icon: "🛏" },
    baby_chair:    { label: "Дитячий стілець",         icon: "🪑" },
    extra_pillows: { label: "Додаткові подушки",      icon: "🛋" },
    extra_blanket: { label: "Додаткова ковдра",       icon: "🛌" },
    double_bed:    { label: "Суцільне ліжко",         icon: "🛏" },
  };

  return (
    <div className="space-y-4">
      {/* Addons */}
      <div>
        <SectionLabel>Обрані опції</SectionLabel>
        {addonKeys.length === 0 ? (
          <div className="p-5 rounded-2xl border border-dashed border-gray-200 text-center text-sm text-gray-400">
            Немає обраних опцій
          </div>
        ) : (
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
        )}
      </div>

      {/* Spa placeholder */}
      <div>
        <SectionLabel>SPA-записи</SectionLabel>
        <div className="p-5 rounded-2xl border border-dashed border-gray-200 text-center">
          <Waves className="w-7 h-7 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Немає SPA-записів</p>
          <button className="mt-2 text-xs text-indigo-500 hover:underline font-semibold">+ Записати на SPA</button>
        </div>
      </div>

      {/* Rental placeholder */}
      <div>
        <SectionLabel>Прокат</SectionLabel>
        <div className="p-5 rounded-2xl border border-dashed border-gray-200 text-center">
          <Bike className="w-7 h-7 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Прокат не замовлений</p>
          <button className="mt-2 text-xs text-indigo-500 hover:underline font-semibold">+ Додати прокат</button>
        </div>
      </div>
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
  return (
    <div className="space-y-4">
      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "SMS гостю",   icon: Smartphone, color: "text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-100" },
          { label: "Email гостю", icon: Mail,        color: "text-indigo-600 bg-indigo-50 border-indigo-100 hover:bg-indigo-100" },
          { label: "Telegram",    icon: Send,         color: "text-sky-600 bg-sky-50 border-sky-100 hover:bg-sky-100" },
          { label: "Зателефонуй", icon: Phone,        color: "text-emerald-600 bg-emerald-50 border-emerald-100 hover:bg-emerald-100" },
        ].map(a => (
          <button key={a.label} className={`flex items-center gap-2 p-3.5 rounded-2xl border text-sm font-semibold transition-colors ${a.color}`}>
            <a.icon className="w-4 h-4 shrink-0" /> {a.label}
          </button>
        ))}
      </div>

      {/* Message log */}
      <div>
        <SectionLabel>Листування</SectionLabel>
        <div className="space-y-3">
          {[
            { from: "Система", text: "Підтвердження бронювання надіслано", time: "10:32", out: true },
            { from: b.guestName || "Гість", text: "Дякую, чекаємо з нетерпінням!", time: "10:45", out: false },
          ].map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.out ? "justify-end" : "justify-start"}`}>
              {!m.out && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                  {(m.from || "?")[0].toUpperCase()}
                </div>
              )}
              <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm ${m.out ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-gray-100 text-gray-800 rounded-tl-sm"}`}>
                <p>{m.text}</p>
                <p className={`text-[10px] mt-1 ${m.out ? "text-indigo-200" : "text-gray-400"} text-right`}>{m.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compose */}
      <div className="flex gap-2 items-end">
        <textarea
          rows={2}
          placeholder="Написати повідомлення..."
          className="flex-1 px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
        />
        <button className="h-9 w-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl flex items-center justify-center shrink-0 transition-colors">
          <Send className="w-4 h-4" />
        </button>
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
