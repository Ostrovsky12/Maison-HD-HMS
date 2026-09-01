import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Search, Send, Sparkles, Link2, CheckCheck, Clock, AlertCircle,
  MessageSquare, Instagram, Mail, Phone, Globe, RefreshCw, Filter,
  Plus, X, User, Calendar, MoreVertical, Loader2, Bot, Paperclip,
  ArrowLeft, ChevronDown, StickyNote, Tag, UserCheck, TrendingUp,
  Building2, Hash, Inbox, Target, ChevronRight, Edit3, Check,
  DollarSign, Star, Zap, Bell, BellOff, FileText, Eye, BookOpen,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  isNotificationSoundEnabled,
  NOTIFICATION_SOUND_CHANGE_EVENT,
  playNotificationChime,
  setNotificationSoundEnabled,
} from "@/lib/notification-sound";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

// ── Channel meta ────────────────────────────────────────────────────────────
const CH: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; dot: string }> = {
  telegram: {
    label: "Telegram",
    icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.069l-2.055 9.677c-.154.678-.557.843-1.128.524l-3.1-2.285-1.497 1.44c-.165.165-.304.304-.624.304l.223-3.147 5.74-5.185c.25-.222-.054-.345-.386-.123L7.38 14.413l-3.04-.95c-.66-.205-.673-.66.138-.976l11.878-4.578c.549-.199 1.029.133.207.16z"/></svg>,
    color: "text-sky-500", bg: "bg-sky-50 border-sky-100", dot: "bg-sky-400",
  },
  instagram: {
    label: "Instagram",
    icon: <Instagram className="w-3.5 h-3.5" />,
    color: "text-pink-500", bg: "bg-pink-50 border-pink-100", dot: "bg-pink-400",
  },
  website: {
    label: "Сайт",
    icon: <Globe className="w-3.5 h-3.5" />,
    color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", dot: "bg-emerald-400",
  },
  email: {
    label: "Email",
    icon: <Mail className="w-3.5 h-3.5" />,
    color: "text-violet-500", bg: "bg-violet-50 border-violet-100", dot: "bg-violet-400",
  },
  phone: {
    label: "Телефон",
    icon: <Phone className="w-3.5 h-3.5" />,
    color: "text-gray-500", bg: "bg-gray-50 border-gray-100", dot: "bg-gray-400",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.554 4.095 1.518 5.815L0 24l6.335-1.482A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm6.18 16.963c-.26.733-1.515 1.4-2.072 1.485-.53.08-1.197.114-1.93-.12-.445-.143-1.015-.335-1.745-.654-3.065-1.325-5.063-4.407-5.215-4.612-.152-.205-1.24-1.648-1.24-3.144 0-1.497.784-2.233 1.062-2.54.277-.305.605-.381.807-.381h.58c.185.008.435-.07.68.519.26.619.88 2.14.958 2.297.078.157.13.34.026.549-.104.21-.156.34-.307.524-.152.183-.32.41-.456.55-.152.157-.31.328-.134.641.177.314.785 1.296 1.685 2.098 1.157 1.032 2.133 1.35 2.447 1.503.313.152.496.128.679-.077.183-.205.784-.916.993-1.23.21-.312.42-.26.707-.156.287.104 1.822.86 2.135 1.016.313.157.52.235.596.365.078.13.078.752-.182 1.488z"/></svg>,
    color: "text-green-500", bg: "bg-green-50 border-green-100", dot: "bg-green-400",
  },
  viber: {
    label: "Viber",
    icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M11.997 0C5.372 0 0 5.372 0 11.997 0 18.623 5.372 24 11.997 24 18.623 24 24 18.623 24 11.997 24 5.372 18.623 0 11.997 0zm4.13 16.463c-.213.58-.957 1.043-1.608 1.173-.43.087-.99.155-2.878-.617-2.417-.98-3.978-3.462-4.1-3.621-.12-.156-1.01-1.341-1.01-2.558 0-1.217.636-1.815.862-2.063.227-.247.494-.31.657-.31H8.2c.18 0 .35.066.48.183.14.125.26.308.39.65.35.908.673 1.573.673 1.573.128.22.09.494-.013.69-.1.197-.17.323-.338.504-.17.18-.355.402-.508.54-.158.142-.323.297-.138.58.184.28.816 1.345 1.751 2.18 1.203 1.072 2.218 1.407 2.53 1.568.313.162.497.135.68-.083.185-.218.796-.932 1.01-1.252.213-.32.425-.267.713-.161.288.105 1.836.866 2.152 1.023.316.157.527.237.603.37.078.13.078.76-.182 1.342z"/></svg>,
    color: "text-purple-500", bg: "bg-purple-50 border-purple-100", dot: "bg-purple-400",
  },
};

// ── Lead pipeline stages ────────────────────────────────────────────────────
const LEAD_STAGES: Record<string, { label: string; color: string; bg: string; order: number }> = {
  new:         { label: "Новий",         color: "text-gray-600",  bg: "bg-gray-100",   order: 0 },
  contacted:   { label: "Контактували",  color: "text-blue-600",  bg: "bg-blue-100",   order: 1 },
  qualified:   { label: "Кваліфік.",     color: "text-cyan-600",  bg: "bg-cyan-100",   order: 2 },
  quote_sent:  { label: "КП надіслано",  color: "text-violet-600",bg: "bg-violet-100", order: 3 },
  negotiating: { label: "Переговори",    color: "text-amber-600", bg: "bg-amber-100",  order: 4 },
  booked:      { label: "Заброньовано",  color: "text-emerald-600",bg: "bg-emerald-100",order: 5 },
  lost:        { label: "Втрачено",      color: "text-red-600",   bg: "bg-red-100",    order: 6 },
  spam:        { label: "Спам",          color: "text-red-400",   bg: "bg-red-50",     order: 7 },
};

const CONV_STATUS: Record<string, { label: string; color: string }> = {
  open:     { label: "Відкрито",  color: "bg-green-100 text-green-700" },
  pending:  { label: "Очікує",    color: "bg-amber-100 text-amber-700" },
  resolved: { label: "Вирішено",  color: "bg-gray-100 text-gray-600" },
  spam:     { label: "Спам",      color: "bg-red-100 text-red-600" },
};

interface Conversation {
  id: number; channel: string; guestName: string | null; guestPhone: string | null;
  guestEmail: string | null; subject: string | null; lastMessagePreview: string | null;
  lastMessageAt: string; status: string; unreadCount: number; bookingId: number | null;
  leadId: number | null; leadStatus: string | null; tags: string[];
  assignedToId: number | null; assignedToName: string | null; estimatedValue: string | null;
}

interface Message {
  id: number; conversationId: number; direction: "inbound" | "outbound";
  messageType: string; content: string | null; senderName: string | null;
  isAiGenerated: boolean; isInternal: boolean; isRead: boolean; createdAt: string;
  mediaUrl?: string;
}

interface Lead {
  id: number; source: string; status: string; first_name: string | null;
  last_name: string | null; email: string | null; phone: string | null;
  subject: string | null; notes: string | null; estimated_value: string | null;
  quoted_amount: string | null; assigned_to_id: number | null; assigned_to_name: string | null;
  check_in_date: string | null; check_out_date: string | null; guests_count: number;
  priority: string; created_at: string; updated_at: string;
  channel?: string; conv_status?: string; unread_count?: number;
  last_message_at?: string; last_message_preview?: string;
}

interface CannedReply { id: number; title: string; content: string; category: string; shortcut: string | null; use_count: number; }
interface StaffMember { id: number; name: string; role: string; }
interface AiKnowledgeSource { id: number; title: string; category: string; updatedAt: string; }
interface BookingIntake {
  detected: boolean; checkIn: string | null; checkOut: string | null;
  adults: number | null; children: number | null; needsManagerReview: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  phone: "Телефон", telegram: "Telegram", instagram: "Instagram", website: "Сайт",
  booking_com: "Booking.com", airbnb: "Airbnb", expedia: "Expedia",
  direct: "Прямо", referral: "Рефер.", repeat: "Повторний", other: "Інше",
};

function fmt(n: number | string | null | undefined, cur = "₴") {
  if (!n) return "—";
  return `${cur} ${Number(n).toLocaleString("uk-UA", { minimumFractionDigits: 0 })}`;
}

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// ── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ name, channel, size = "md" }: { name: string | null; channel?: string; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "w-7 h-7 text-[10px]", md: "w-9 h-9 text-xs", lg: "w-11 h-11 text-sm" }[size];
  const ch = channel ? CH[channel] : null;
  const colors = ["bg-indigo-100 text-indigo-700", "bg-pink-100 text-pink-700", "bg-amber-100 text-amber-700", "bg-emerald-100 text-emerald-700", "bg-purple-100 text-purple-700"];
  const idx = name ? name.charCodeAt(0) % colors.length : 0;
  return (
    <div className={`${s} rounded-full flex items-center justify-center font-semibold relative flex-shrink-0 ${colors[idx]}`}>
      {initials(name)}
      {ch && (
        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border border-white flex items-center justify-center ${ch.dot}`}>
          <span className="text-white scale-75">{ch.icon}</span>
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  const [view, setView] = useState<"conversations" | "leads" | "portal">("conversations");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [booking, setBooking] = useState<any>(null);
  const [convLead, setConvLead] = useState<Lead | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [cannedReplies, setCannedReplies] = useState<CannedReply[]>([]);
  const [stats, setStats] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("");
  const [leadStageFilter, setLeadStageFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [replyText, setReplyText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [aiDraft, setAiDraft] = useState("");
  const [aiSources, setAiSources] = useState<AiKnowledgeSource[]>([]);
  const [aiHandoffSuggested, setAiHandoffSuggested] = useState(false);
  const [bookingIntake, setBookingIntake] = useState<BookingIntake | null>(null);
  const [showCanned, setShowCanned] = useState(false);
  const [cannedSearch, setCannedSearch] = useState("");

  const [showLinkBooking, setShowLinkBooking] = useState(false);
  const [bookingIdInput, setBookingIdInput] = useState("");
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showMobileDetail, setShowMobileDetail] = useState(false);

  const [editingTag, setEditingTag] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ firstName: "", lastName: "", email: "", phone: "", source: "phone", subject: "", estimatedValue: "" });

  const [portalThreads, setPortalThreads] = useState<any[]>([]);
  const [selectedPortal, setSelectedPortal] = useState<any | null>(null);
  const [portalMessages, setPortalMessages] = useState<any[]>([]);
  const [portalDraft, setPortalDraft] = useState("");
  const [portalSending, setPortalSending] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const portalBottomRef = useRef<HTMLDivElement>(null);

  // ── Sound notifications ───────────────────────────────────────────────────
  const [soundEnabled, setSoundEnabled] = useState(isNotificationSoundEnabled);
  const lastUnreadRef = useRef<number>(0);
  const lastPortalUnreadRef = useRef<number>(0);
  const lastCheckinIdRef = useRef<number>(0);

  function showBrowserNotif(title: string, body: string) {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico", tag: "inbox-msg" });
    }
  }

  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [channels, setChannels] = useState<any[]>([]);
  const [tgToken, setTgToken] = useState("");
  const [igAccessToken, setIgAccessToken] = useState("");
  const [igPageId, setIgPageId] = useState("");
  const [igAppSecret, setIgAppSecret] = useState("");
  const [igVerifyToken, setIgVerifyToken] = useState(() => Math.random().toString(36).slice(2, 12));
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waAppSecret, setWaAppSecret] = useState("");
  const [waVerifyToken] = useState(() => `wa_${Math.random().toString(36).slice(2, 14)}`);
  const [channelSetupLoading, setChannelSetupLoading] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // ── Load channels config ─────────────────────────────────────────────────
  async function loadChannels() {
    const r = await apiFetch(`${API}/inbox/channels`);
    const data = await r.json();
    if (Array.isArray(data)) setChannels(data);
  }

  // ── Connect Telegram bot ─────────────────────────────────────────────────
  async function setupTelegram() {
    if (!tgToken.trim()) return;
    setChannelSetupLoading("telegram");
    try {
      const r = await apiFetch(`${API}/inbox/channels/telegram/setup`, {
        method: "POST", body: JSON.stringify({ botToken: tgToken }),
      });
      const d = await r.json();
      if (d.success) {
        toast({ title: `✅ Telegram підключено`, description: `@${d.botUsername}` });
        setTgToken("");
        loadChannels();
      } else {
        toast({ title: "Помилка", description: d.error, variant: "destructive" });
      }
    } finally { setChannelSetupLoading(""); }
  }

  // ── Disconnect Telegram ──────────────────────────────────────────────────
  async function disconnectTelegram() {
    setChannelSetupLoading("telegram-disconnect");
    try {
      await apiFetch(`${API}/inbox/channels/telegram/setup`, { method: "DELETE" });
      toast({ title: "Telegram відключено" });
      loadChannels();
    } finally { setChannelSetupLoading(""); }
  }

  // ── Secure a legacy Telegram webhook without showing its token ─────────────
  async function secureTelegramWebhook() {
    setChannelSetupLoading("telegram-secure");
    try {
      const r = await apiFetch(`${API}/inbox/channels/telegram/secure-webhook`, { method: "POST" });
      const d = await r.json();
      if (d.success) {
        toast({ title: "✅ Захист Telegram оновлено", description: "Webhook тепер приймає лише підписані запити Telegram." });
        loadChannels();
      } else {
        toast({ title: "Помилка", description: d.error || "Не вдалося оновити захист Telegram", variant: "destructive" });
      }
    } finally { setChannelSetupLoading(""); }
  }

  // ── Enable Telegram Business connected bot ────────────────────────────────
  async function setupTelegramBusiness() {
    setChannelSetupLoading("telegram-business");
    try {
      const r = await apiFetch(`${API}/inbox/channels/telegram/business/setup`, { method: "POST" });
      const d = await r.json();
      if (d.success) {
        toast({ title: "✅ Telegram Business увімкнено", description: `Підключіть @${d.botUsername} у Telegram Business` });
        loadChannels();
      } else {
        toast({ title: "Помилка", description: d.error || "Не вдалося увімкнути Telegram Business", variant: "destructive" });
      }
    } finally { setChannelSetupLoading(""); }
  }

  // ── Stop Telegram Business message processing ─────────────────────────────
  async function disconnectTelegramBusiness() {
    setChannelSetupLoading("telegram-business-disconnect");
    try {
      const r = await apiFetch(`${API}/inbox/channels/telegram/business/setup`, { method: "DELETE" });
      if (r.ok) {
        toast({ title: "Telegram Business відключено" });
        loadChannels();
      } else {
        const d = await r.json().catch(() => ({}));
        toast({ title: "Помилка", description: d.error || "Не вдалося відключити Telegram Business", variant: "destructive" });
      }
    } finally { setChannelSetupLoading(""); }
  }

  // ── Connect Instagram ────────────────────────────────────────────────────
  async function setupInstagram() {
    if (!igAccessToken.trim() || !igPageId.trim() || !igAppSecret.trim()) return;
    setChannelSetupLoading("instagram");
    try {
      const r = await apiFetch(`${API}/inbox/channels/instagram/setup`, {
        method: "POST", body: JSON.stringify({
          accessToken: igAccessToken,
          pageId: igPageId,
          verifyToken: igVerifyToken,
          appSecret: igAppSecret,
        }),
      });
      const d = await r.json();
      if (d.success) {
        toast({ title: `✅ Instagram підключено`, description: d.pageName });
        setIgAccessToken("");
        setIgPageId("");
        setIgAppSecret("");
        loadChannels();
      } else {
        toast({ title: "Помилка", description: d.error, variant: "destructive" });
      }
    } finally { setChannelSetupLoading(""); }
  }

  // ── Disconnect Instagram ─────────────────────────────────────────────────
  async function disconnectInstagram() {
    setChannelSetupLoading("instagram-disconnect");
    try {
      await apiFetch(`${API}/inbox/channels/instagram/setup`, { method: "DELETE" });
      toast({ title: "Instagram відключено" });
      loadChannels();
    } finally { setChannelSetupLoading(""); }
  }

  // ── Connect WhatsApp Business ─────────────────────────────────────────────
  async function setupWhatsApp() {
    if (!waPhoneNumberId.trim() || !waAccessToken.trim() || !waAppSecret.trim()) return;
    setChannelSetupLoading("whatsapp");
    try {
      const r = await apiFetch(`${API}/inbox/channels/whatsapp/setup`, {
        method: "POST", body: JSON.stringify({
          phoneNumberId: waPhoneNumberId,
          accessToken: waAccessToken,
          appSecret: waAppSecret,
          verifyToken: waVerifyToken,
        }),
      });
      const d = await r.json();
      if (d.success) {
        toast({ title: `✅ WhatsApp підключено`, description: `${d.verifiedName} · ${d.displayPhone}` });
        setWaPhoneNumberId("");
        setWaAccessToken("");
        setWaAppSecret("");
        loadChannels();
      } else {
        toast({ title: "Помилка", description: d.error, variant: "destructive" });
      }
    } finally { setChannelSetupLoading(""); }
  }

  // ── Disconnect WhatsApp Business ──────────────────────────────────────────
  async function disconnectWhatsApp() {
    setChannelSetupLoading("whatsapp-disconnect");
    try {
      await apiFetch(`${API}/inbox/channels/whatsapp/setup`, { method: "DELETE" });
      toast({ title: "WhatsApp відключено" });
      loadChannels();
    } finally { setChannelSetupLoading(""); }
  }

  // ── Portal: load threads ──────────────────────────────────────────────────
  async function loadPortalThreads() {
    try {
      const r = await apiFetch(`${API}/guest/portal-threads`);
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d)) {
          setPortalThreads(d);
          // Init ref to avoid false sound on first load
          if (lastPortalUnreadRef.current === 0) {
            lastPortalUnreadRef.current = d.reduce((a: number, t: any) => a + parseInt(t.unread_count || "0"), 0);
          }
        }
      }
    } catch {}
  }

  // ── Portal: load messages for selected thread ─────────────────────────────
  async function loadPortalMessages(bookingId: number) {
    setPortalLoading(true);
    try {
      const r = await apiFetch(`${API}/guest/messages/${bookingId}`);
      if (r.ok) { const d = await r.json(); if (Array.isArray(d)) setPortalMessages(d); }
      // Mark all as read
      await apiFetch(`${API}/guest/portal-threads/${bookingId}/read-all`, { method: "PATCH" });
      setPortalThreads(prev => prev.map(t => t.booking_id === bookingId ? { ...t, unread_count: "0" } : t));
    } finally { setPortalLoading(false); }
  }

  // ── Portal: confirm guest payment ─────────────────────────────────────────
  const [confirmingPayment, setConfirmingPayment] = useState<number | null>(null);
  async function confirmGuestPayment(bookingId: number) {
    setConfirmingPayment(bookingId);
    try {
      const r = await apiFetch(`${API}/guest/payment-confirm/${bookingId}`, { method: "POST" });
      if (r.ok) {
        const d = await r.json();
        toast({ title: "✅ Оплату підтверджено", description: `${d.guestName} — ${(d.confirmedAmount || 0).toLocaleString("uk-UA")} ₴. Баланс гостя: 0 ₴.` });
        await loadPortalMessages(bookingId);
      } else {
        const d = await r.json().catch(() => ({}));
        toast({ title: "Помилка", description: d.error || "Не вдалося підтвердити оплату", variant: "destructive" });
      }
    } catch {
      toast({ title: "Помилка мережі", variant: "destructive" });
    } finally { setConfirmingPayment(null); }
  }

  // ── Portal: send reply ────────────────────────────────────────────────────
  async function sendPortalReply() {
    if (!selectedPortal || !portalDraft.trim()) return;
    setPortalSending(true);
    try {
      const r = await apiFetch(`${API}/guest/message/${selectedPortal.booking_id}`, {
        method: "POST", body: JSON.stringify({ message: portalDraft.trim() }),
      });
      if (r.ok) {
        setPortalDraft("");
        await loadPortalMessages(selectedPortal.booking_id);
        setPortalThreads(prev => prev.map(t =>
          t.booking_id === selectedPortal.booking_id
            ? { ...t, last_message: portalDraft.trim(), last_direction: "hotel_to_guest", last_message_at: new Date().toISOString() }
            : t
        ));
      } else {
        toast({ title: "Помилка відправки", variant: "destructive" });
      }
    } finally { setPortalSending(false); }
  }

  // ── Load ────────────────────────────────────────────────────────────────
  async function loadAll() {
    setLoading(true);
    try {
      const [statsR, convR, leadR, cannedR, staffR] = await Promise.all([
        apiFetch(`${API}/inbox/stats`).then(r => r.json()),
        apiFetch(`${API}/inbox/conversations`).then(r => r.json()),
        apiFetch(`${API}/inbox/leads`).then(r => r.json()),
        apiFetch(`${API}/inbox/canned-replies`).then(r => r.json()),
        apiFetch(`${API}/inbox/staff`).then(r => r.json()),
      ]);
      setStats(statsR);
      if (convR.conversations) setConversations(convR.conversations);
      if (Array.isArray(leadR)) setLeads(leadR);
      if (Array.isArray(cannedR)) setCannedReplies(cannedR);
      if (Array.isArray(staffR)) setStaff(staffR);
      // Initialize unread ref to avoid false-positive sound on first load
      if (lastUnreadRef.current === 0 && statsR?.unreadByStatus?.all) {
        lastUnreadRef.current = statsR.unreadByStatus.all;
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    loadPortalThreads();
    // Request browser notification permission
    if (Notification.permission === "default") Notification.requestPermission();
  }, []);

  // Keep the Inbox control in sync with the global notification-bell control.
  useEffect(() => {
    const syncSoundPreference = () => setSoundEnabled(isNotificationSoundEnabled());
    window.addEventListener(NOTIFICATION_SOUND_CHANGE_EVENT, syncSoundPreference);
    window.addEventListener("storage", syncSoundPreference);
    return () => {
      window.removeEventListener(NOTIFICATION_SOUND_CHANGE_EVENT, syncSoundPreference);
      window.removeEventListener("storage", syncSoundPreference);
    };
  }, []);

  // ── Polling: check for new messages every 30s ─────────────────────────────
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        // Check inbox unread
        const sR = await apiFetch(`${API}/inbox/stats`);
        if (sR.ok) {
          const s = await sR.json();
          const total = (s.unreadByStatus?.all || 0) as number;
          if (total > lastUnreadRef.current && lastUnreadRef.current >= 0) {
            if (soundEnabled) playNotificationChime("message");
            showBrowserNotif("Новe повідомлення — Inbox", `${total - lastUnreadRef.current} нових повідомлень`);
            toast({ title: "💬 Нові повідомлення", description: `${total - lastUnreadRef.current} непрочитаних` });
            // Refresh conversations
            const cR = await apiFetch(`${API}/inbox/conversations`);
            if (cR.ok) { const cd = await cR.json(); if (cd.conversations) setConversations(cd.conversations); }
          }
          if (total !== lastUnreadRef.current) lastUnreadRef.current = total;
          setStats(s);
        }
        // Check portal unread
        const pR = await apiFetch(`${API}/guest/portal-threads`);
        if (pR.ok) {
          const threads = await pR.json();
          if (Array.isArray(threads)) {
            const portalUnread = threads.reduce((acc: number, t: any) => acc + parseInt(t.unread_count || "0"), 0);
            if (portalUnread > lastPortalUnreadRef.current && lastPortalUnreadRef.current >= 0) {
              if (soundEnabled) playNotificationChime("message");
              showBrowserNotif("Нове повідомлення — Гостьовий портал", "Гість написав через портал");
              toast({ title: "🏠 Портал: нове повідомлення", description: "Гість написав через гостьовий портал" });
            }
            if (portalUnread !== lastPortalUnreadRef.current) lastPortalUnreadRef.current = portalUnread;
            setPortalThreads(threads);
          }
        }
        // Check new checkin submissions
        const ciR = await apiFetch(`${API}/guest/checkins?limit=1`);
        if (ciR.ok) {
          const ci = await ciR.json();
          if (Array.isArray(ci) && ci.length > 0) {
            const latestId = ci[0].id as number;
            const prevId = lastCheckinIdRef.current;
            if (prevId > 0 && latestId > prevId) {
              if (soundEnabled) playNotificationChime("checkin");
              showBrowserNotif("✅ Онлайн чекін", `${ci[0].first_name} ${ci[0].last_name} заповнив форму заїзду`);
              toast({ title: "✅ Онлайн чекін", description: `${ci[0].first_name} ${ci[0].last_name} зареєструвався онлайн` });
            }
            if (latestId !== prevId) lastCheckinIdRef.current = latestId;
          }
        }
      } catch {}
    }, 30_000);
    return () => clearInterval(timer);
  }, [soundEnabled]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    portalBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [portalMessages]);

  const filteredConvs = conversations.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (channelFilter && c.channel !== channelFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return c.guestName?.toLowerCase().includes(s) ||
        c.guestPhone?.includes(s) || c.subject?.toLowerCase().includes(s) ||
        c.lastMessagePreview?.toLowerCase().includes(s);
    }
    return true;
  });

  const filteredLeads = leads.filter(l => {
    if (leadStageFilter !== "all" && l.status !== leadStageFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return l.first_name?.toLowerCase().includes(s) || l.last_name?.toLowerCase().includes(s) ||
        l.email?.toLowerCase().includes(s) || l.phone?.includes(s) || l.subject?.toLowerCase().includes(s);
    }
    return true;
  });

  const filteredCanned = cannedReplies.filter(c =>
    !cannedSearch || c.title.toLowerCase().includes(cannedSearch.toLowerCase()) ||
    c.content.toLowerCase().includes(cannedSearch.toLowerCase()) ||
    c.shortcut?.includes(cannedSearch)
  );

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);

  // ── Open conversation ───────────────────────────────────────────────────
  async function openConv(conv: Conversation) {
    setSelectedConv(conv);
    setMsgsLoading(true);
    setAiDraft("");
    setAiSources([]);
    setAiHandoffSuggested(false);
    setBookingIntake(null);
    setIsInternal(false);
    setReplyText("");
    setShowMobileDetail(true);
    setBooking(null);
    setConvLead(null);
    try {
      const r = await apiFetch(`${API}/inbox/conversations/${conv.id}`);
      const d = await r.json();
      if (d.messages) setMessages(d.messages);
      if (d.booking) setBooking(d.booking);
      if (d.lead) setConvLead(d.lead);
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c));
    } finally {
      setMsgsLoading(false);
    }
  }

  // ── Send message ────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = replyText.trim();
    if (!text || !selectedConv) return;
    setSending(true);
    try {
      const endpoint = isInternal
        ? `${API}/inbox/conversations/${selectedConv.id}/internal-note`
        : `${API}/inbox/conversations/${selectedConv.id}/reply`;
      const body = isInternal ? { content: text } : { content: text, isAiGenerated: text === aiDraft };
      const r = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      const d = await r.json();
      if (d.message) {
        setMessages(prev => [...prev, d.message]);
        setReplyText("");
        setAiDraft("");
        if (!isInternal) {
          setConversations(prev => prev.map(c => c.id === selectedConv.id
            ? { ...c, lastMessagePreview: text.slice(0, 80), lastMessageAt: new Date().toISOString(), status: "pending" }
            : c));
        }
      }
    } finally {
      setSending(false);
      setTimeout(() => replyRef.current?.focus(), 100);
    }
  }

  // ── AI draft ────────────────────────────────────────────────────────────
  async function getAiDraft() {
    if (!selectedConv) return;
    setAiLoading(true);
    setAiDraft("");
    setAiSources([]);
    setAiHandoffSuggested(false);
    setBookingIntake(null);
    try {
      const r = await apiFetch(`${API}/inbox/conversations/${selectedConv.id}/ai-suggest`, { method: "POST" });
      const d = await r.json();
      if (d.suggestion) {
        setAiDraft(d.suggestion);
        setAiSources(Array.isArray(d.sources) ? d.sources : []);
        setAiHandoffSuggested(Boolean(d.handoffSuggested));
        setBookingIntake(d.bookingIntake || null);
      } else {
        toast({ title: "AI Concierge", description: d.error || "Не вдалося створити чернетку", variant: "destructive" });
      }
    } finally {
      setAiLoading(false);
    }
  }

  // ── Update conv ──────────────────────────────────────────────────────────
  async function updateConv(updates: Record<string, any>) {
    if (!selectedConv) return;
    const r = await apiFetch(`${API}/inbox/conversations/${selectedConv.id}`, {
      method: "PATCH", body: JSON.stringify(updates),
    });
    const d = await r.json();
    const newConv = { ...selectedConv, ...updates };
    setSelectedConv(newConv as any);
    setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, ...updates } : c));
    if (updates.status) {
      toast({ title: `Статус: ${CONV_STATUS[updates.status]?.label}` });
      const sysMsg: Message = {
        id: Date.now(), conversationId: selectedConv.id, direction: "outbound",
        messageType: "system", content: `Статус змінено: ${CONV_STATUS[updates.status]?.label}`,
        senderName: "Система", isAiGenerated: false, isInternal: false, isRead: true,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, sysMsg]);
    }
    if (updates.assignedToId !== undefined) {
      const staffMember = staff.find(s => s.id === updates.assignedToId);
      setSelectedConv(prev => prev ? { ...prev, assignedToName: staffMember?.name || null, assignedToId: updates.assignedToId } : null);
    }
  }

  // ── Update lead ──────────────────────────────────────────────────────────
  async function updateLead(id: number, updates: Record<string, any>) {
    const r = await apiFetch(`${API}/inbox/leads/${id}`, {
      method: "PATCH", body: JSON.stringify(updates),
    });
    const d = await r.json();
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...d } : l));
    if (convLead?.id === id) setConvLead(prev => prev ? { ...prev, ...d } : null);
    if (updates.status) toast({ title: `Lead: ${LEAD_STAGES[updates.status]?.label}` });
  }

  // ── Link booking ─────────────────────────────────────────────────────────
  async function linkBooking() {
    if (!selectedConv || !bookingIdInput) return;
    const r = await apiFetch(`${API}/inbox/conversations/${selectedConv.id}/link-booking/${bookingIdInput}`, { method: "POST" });
    const d = await r.json();
    if (!d.error) {
      toast({ title: "✅ Бронювання прив'язано" });
      setShowLinkBooking(false);
      openConv(selectedConv);
    } else {
      toast({ title: "Помилка", description: d.error, variant: "destructive" });
    }
  }

  // ── Add tag ───────────────────────────────────────────────────────────────
  async function addTag(tag: string) {
    if (!selectedConv || !tag.trim()) return;
    const tags = [...(selectedConv.tags || [])];
    if (!tags.includes(tag.trim())) tags.push(tag.trim());
    await updateConv({ tags });
    setEditingTag("");
  }

  async function removeTag(tag: string) {
    if (!selectedConv) return;
    const tags = (selectedConv.tags || []).filter(t => t !== tag);
    await updateConv({ tags });
  }

  // ── Canned reply select ───────────────────────────────────────────────────
  async function useCannedReply(cr: CannedReply) {
    setReplyText(cr.content);
    setShowCanned(false);
    setCannedSearch("");
    apiFetch(`${API}/inbox/canned-replies/${cr.id}/use`, { method: "POST" });
    setTimeout(() => replyRef.current?.focus(), 100);
  }

  // ── Create lead ────────────────────────────────────────────────────────────
  async function createLead() {
    const r = await apiFetch(`${API}/inbox/leads`, {
      method: "POST", body: JSON.stringify({
        ...newLeadForm,
        estimatedValue: newLeadForm.estimatedValue ? parseFloat(newLeadForm.estimatedValue) : null,
      }),
    });
    const d = await r.json();
    if (!d.error) {
      setLeads(prev => [d, ...prev]);
      setShowLeadForm(false);
      setNewLeadForm({ firstName: "", lastName: "", email: "", phone: "", source: "phone", subject: "", estimatedValue: "" });
      toast({ title: "✅ Лід створено" });
    }
  }

  const ch = selectedConv ? CH[selectedConv.channel] : null;

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-50">

        {/* ══ LEFT PANEL ═══════════════════════════════════════════════════ */}
        <div className={`flex flex-col bg-white border-r border-gray-100 flex-shrink-0 w-full md:w-80 lg:w-[340px] ${showMobileDetail ? "hidden md:flex" : "flex"}`}>

          {/* Header */}
          <div className="px-4 pt-4 pb-0 border-b border-gray-50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                  <Inbox className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-gray-900 text-base">Comm Hub</span>
                {totalUnread > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{totalUnread}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={loadAll}><RefreshCw className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                  title={soundEnabled ? "Звук увімкнено (натисніть, щоб вимкнути)" : "Звук вимкнено (натисніть, щоб увімкнути)"}
                  onClick={() => {
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    setNotificationSoundEnabled(next);
                    if (next) playNotificationChime("message");
                    toast({ title: next ? "🔔 Звук увімкнено" : "🔕 Звук вимкнено" });
                  }}>
                  {soundEnabled
                    ? <Bell className="w-3.5 h-3.5 text-indigo-500" />
                    : <BellOff className="w-3.5 h-3.5 text-gray-400" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Налаштування каналів"
                  onClick={() => { setShowChannelSettings(true); loadChannels(); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                </Button>
                <Button size="sm" className="h-7 px-2 gap-1 text-xs bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => { if (view === "leads") setShowLeadForm(true); }}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Stats mini */}
            {stats && (
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {[
                  { label: "Відкриті", val: stats.open, color: "text-emerald-600" },
                  { label: "Очікують", val: stats.pending, color: "text-amber-500" },
                  { label: "Ліди", val: stats.leads?.total || 0, color: "text-violet-600" },
                  { label: "Непрочит.", val: stats.totalUnread, color: "text-red-500" },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 rounded-xl px-1.5 py-1.5 text-center">
                    <p className={`text-sm font-bold leading-none ${s.color}`}>{s.val}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* View tabs */}
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 mb-3">
              <button
                onClick={() => setView("conversations")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all ${view === "conversations" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <MessageSquare className="w-3 h-3" /> Inbox
                {totalUnread > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1 rounded-full">{totalUnread}</span>}
              </button>
              <button
                onClick={() => { setView("portal"); setSelectedPortal(null); setPortalMessages([]); loadPortalThreads(); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all ${view === "portal" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Globe className="w-3 h-3" /> Портал
                {portalThreads.filter(t => parseInt(t.unread_count) > 0).length > 0 && (
                  <span className="bg-emerald-500 text-white text-[10px] font-bold px-1 rounded-full">
                    {portalThreads.filter(t => parseInt(t.unread_count) > 0).length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setView("leads")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all ${view === "leads" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Target className="w-3 h-3" /> Ліди
                <span className="bg-violet-100 text-violet-700 text-[10px] font-bold px-1 rounded-full">{leads.length}</span>
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={view === "conversations" ? "Пошук розмов…" : view === "portal" ? "Пошук гостей…" : "Пошук лідів…"}
                className="pl-8 h-8 text-sm bg-gray-50 border-gray-100" />
            </div>

            {/* Filters */}
            {view === "conversations" ? (
              <>
                <div className="flex gap-0.5 mb-2">
                  {["all", "open", "pending", "resolved"].map((f) => (
                    <button key={f} onClick={() => setStatusFilter(f)}
                      className={`flex-1 py-1 text-[11px] rounded-lg font-medium transition-all ${statusFilter === f ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                      {f === "all" ? "Всі" : CONV_STATUS[f]?.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 flex-wrap pb-2">
                  {Object.keys(CH).filter(c => stats?.byChannel?.[c] > 0).map(c => {
                    const meta = CH[c];
                    return (
                      <button key={c} onClick={() => setChannelFilter(prev => prev === c ? "" : c)}
                        className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] border transition-all ${channelFilter === c ? `${meta.bg} ${meta.color} font-semibold border-current` : "bg-white border-gray-100 text-gray-400"}`}>
                        <span className={meta.color}>{meta.icon}</span>
                        {stats?.byChannel?.[c] || 0}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : view === "leads" ? (
              <div className="flex gap-0.5 flex-wrap pb-2">
                <button onClick={() => setLeadStageFilter("all")}
                  className={`px-2 py-0.5 text-[11px] rounded-full font-medium transition-all ${leadStageFilter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>
                  Всі
                </button>
                {Object.entries(LEAD_STAGES).slice(0, 6).map(([k, v]) => (
                  <button key={k} onClick={() => setLeadStageFilter(prev => prev === k ? "all" : k)}
                    className={`px-2 py-0.5 text-[11px] rounded-full font-medium transition-all ${leadStageFilter === k ? `${v.bg} ${v.color}` : "bg-gray-100 text-gray-500"}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
            ) : view === "portal" ? (
              // Portal threads list
              portalThreads.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                  <Globe className="w-10 h-10 text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">Немає повідомлень через портал</p>
                </div>
              ) : portalThreads.map(t => {
                const unread = parseInt(t.unread_count || "0") > 0;
                const isSelected = selectedPortal?.booking_id === t.booking_id;
                return (
                  <button key={t.booking_id}
                    onClick={() => { setSelectedPortal(t); loadPortalMessages(t.booking_id); }}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isSelected ? "bg-emerald-50 border-l-2 border-l-emerald-500" : ""}`}>
                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${unread ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                        {(t.guest_name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-sm truncate ${unread ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                            {t.guest_name}
                          </span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {t.last_message_at ? formatDistanceToNow(new Date(t.last_message_at), { locale: uk, addSuffix: false }) : ""}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate">{t.unit_name} · #{t.booking_ref}</p>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-[11px] text-gray-400 truncate flex-1">
                            {t.last_direction === "hotel_to_guest" ? "Ви: " : ""}{t.last_message}
                          </p>
                          {unread && (
                            <span className="bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1">
                              {t.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : view === "conversations" ? (
              filteredConvs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                  <MessageSquare className="w-10 h-10 text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">Немає розмов</p>
                </div>
              ) : filteredConvs.map(conv => {
                const meta = CH[conv.channel] || CH.website;
                const isSelected = selectedConv?.id === conv.id;
                return (
                  <button key={conv.id} onClick={() => openConv(conv)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isSelected ? "bg-indigo-50 border-l-2 border-l-indigo-500" : ""}`}>
                    <div className="flex items-start gap-2.5">
                      <Avatar name={conv.guestName} channel={conv.channel} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-sm font-semibold truncate ${conv.unreadCount > 0 ? "text-gray-900" : "text-gray-700"}`}>
                            {conv.guestName || "Невідомий"}
                          </span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {formatDistanceToNow(new Date(conv.lastMessageAt), { locale: uk, addSuffix: false })}
                          </span>
                        </div>
                        {conv.subject && <p className="text-[11px] text-gray-500 truncate">{conv.subject}</p>}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className={`text-xs truncate flex-1 ${conv.unreadCount > 0 ? "text-gray-700 font-medium" : "text-gray-400"}`}>
                            {conv.lastMessagePreview}
                          </p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {conv.unreadCount > 0 && (
                              <span className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{conv.unreadCount}</span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${CONV_STATUS[conv.status]?.color}`}>
                              {CONV_STATUS[conv.status]?.label}
                            </span>
                          </div>
                        </div>
                        {conv.leadStatus && (
                          <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full ${LEAD_STAGES[conv.leadStatus]?.bg} ${LEAD_STAGES[conv.leadStatus]?.color}`}>
                            {LEAD_STAGES[conv.leadStatus]?.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              // Leads view
              filteredLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                  <Target className="w-10 h-10 text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">Немає лідів</p>
                  <Button size="sm" className="mt-2 h-7 text-xs" onClick={() => setShowLeadForm(true)}>
                    <Plus className="w-3 h-3 mr-1" /> Додати лід
                  </Button>
                </div>
              ) : filteredLeads.map(lead => {
                const stage = LEAD_STAGES[lead.status] || LEAD_STAGES.new;
                const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Невідомий";
                return (
                  <div key={lead.id} className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50">
                    <div className="flex items-start gap-2.5">
                      <Avatar name={name} channel={lead.channel} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-semibold text-gray-800 truncate">{name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${stage.bg} ${stage.color}`}>{stage.label}</span>
                        </div>
                        {lead.subject && <p className="text-[11px] text-gray-500 truncate">{lead.subject}</p>}
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[11px] text-gray-400">{SOURCE_LABELS[lead.source] || lead.source}</span>
                          {lead.estimated_value && (
                            <span className="text-[11px] font-semibold text-emerald-600">{fmt(lead.estimated_value)}</span>
                          )}
                        </div>
                        {lead.assigned_to_name && (
                          <p className="text-[10px] text-gray-400 mt-0.5">→ {lead.assigned_to_name}</p>
                        )}
                        {/* Quick stage change */}
                        <div className="flex gap-0.5 mt-1.5 flex-wrap">
                          {["contacted", "quote_sent", "booked", "lost"].map(s => (
                            <button key={s} onClick={() => updateLead(lead.id, { status: s })}
                              className={`text-[9px] px-1 py-0.5 rounded transition-all ${lead.status === s ? `${LEAD_STAGES[s].bg} ${LEAD_STAGES[s].color} font-semibold` : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}>
                              {LEAD_STAGES[s].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ══ MAIN CHAT ═════════════════════════════════════════════════════ */}
        {/* ── Portal chat view ── */}
        {view === "portal" && selectedPortal ? (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Portal header */}
            <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
              <button onClick={() => { setSelectedPortal(null); setPortalMessages([]); }} className="md:hidden text-gray-400">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                {(selectedPortal.guest_name || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-gray-900 truncate">{selectedPortal.guest_name}</h2>
                  {selectedPortal.phone && <span className="text-xs text-gray-400">{selectedPortal.phone}</span>}
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">
                    🏠 {selectedPortal.unit_name}
                  </span>
                  <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                    #{selectedPortal.booking_ref}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400">
                  {selectedPortal.check_in ? new Date(selectedPortal.check_in).toLocaleDateString("uk-UA") : ""} →{" "}
                  {selectedPortal.check_out ? new Date(selectedPortal.check_out).toLocaleDateString("uk-UA") : ""}
                </p>
              </div>
              <a href={`/bookings?code=${selectedPortal.guest_access_code}`} target="_blank" rel="noreferrer"
                className="text-xs text-indigo-600 hover:underline flex-shrink-0">
                Бронювання →
              </a>
            </div>

            {/* Portal messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
              {portalLoading ? (
                <div className="flex justify-center pt-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
              ) : portalMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <Globe className="w-8 h-8 text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">Немає повідомлень</p>
                </div>
              ) : portalMessages.map((msg: any) => {
                const isStaff = msg.direction === "hotel_to_guest";
                const isPaymentClaim = !isStaff && msg.message?.includes("PAYMENT_CLAIM");
                const paymentClaimMatch = isPaymentClaim ? msg.message.match(/amount=([\d.]+)/) : null;
                const paymentClaimAmount = paymentClaimMatch ? parseFloat(paymentClaimMatch[1]) : 0;
                const displayMessage = isPaymentClaim
                  ? msg.message.replace(/💸 PAYMENT_CLAIM\|bookingId=\d+\|amount=[\d.]+\n?/, "💸 ")
                  : msg.message;
                return (
                  <div key={msg.id} className={`flex flex-col ${isStaff ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${isStaff
                      ? "bg-emerald-600 text-white rounded-br-sm"
                      : isPaymentClaim
                        ? "bg-amber-50 border-2 border-amber-300 text-gray-800 rounded-bl-sm shadow-sm"
                        : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm"}`}>
                      {!isStaff && (
                        <p className={`text-[10px] font-semibold mb-0.5 ${isPaymentClaim ? "text-amber-600" : "text-emerald-600"}`}>
                          {msg.sender_name || selectedPortal.guest_name}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{displayMessage}</p>
                      <p className={`text-[10px] mt-1 ${isStaff ? "text-emerald-200" : "text-gray-400"}`}>
                        {msg.created_at ? new Date(msg.created_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : ""}
                      </p>
                    </div>
                    {isPaymentClaim && (
                      <button
                        onClick={() => confirmGuestPayment(selectedPortal.booking_id)}
                        disabled={confirmingPayment === selectedPortal.booking_id}
                        className="mt-1 max-w-[75%] w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-semibold rounded-xl px-3 py-2 flex items-center justify-center gap-1.5 transition">
                        {confirmingPayment === selectedPortal.booking_id
                          ? "Підтверджуємо…"
                          : `✅ Підтвердити оплату ${paymentClaimAmount > 0 ? `${paymentClaimAmount.toLocaleString("uk-UA")} ₴` : ""}`}
                      </button>
                    )}
                  </div>
                );
              })}
              <div ref={portalBottomRef} />
            </div>

            {/* Portal reply input */}
            <div className="bg-white border-t border-gray-100 p-3 flex gap-2 flex-shrink-0">
              <textarea
                value={portalDraft}
                onChange={e => setPortalDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPortalReply(); } }}
                placeholder="Напишіть відповідь гостю… (Enter — надіслати)"
                className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 min-h-[64px] max-h-32"
              />
              <button
                onClick={sendPortalReply}
                disabled={portalSending || !portalDraft.trim()}
                className="self-end px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5">
                {portalSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="hidden sm:inline">Надіслати</span>
              </button>
            </div>
          </div>
        ) : !selectedConv && !showMobileDetail ? (
          <div className="flex-1 hidden md:flex flex-col items-center justify-center text-center p-8">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-50 to-purple-100 flex items-center justify-center mb-6">
              <Inbox className="w-12 h-12 text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Unified Communication Hub</h2>
            <p className="text-sm text-gray-400 max-w-sm mb-6">Всі канали комунікації, ліди та гості в одному місці. Оберіть розмову або лід зліва.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {Object.entries(CH).map(([k, v]) => (
                <div key={k} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs ${v.bg} ${v.color}`}>
                  {v.icon} {v.label}
                </div>
              ))}
            </div>
          </div>
        ) : selectedConv ? (
          <div className={`flex-1 flex flex-col min-w-0 ${showMobileDetail ? "flex" : "hidden md:flex"}`}>

            {/* Chat header */}
            <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
              <button onClick={() => setShowMobileDetail(false)} className="md:hidden text-gray-400">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <Avatar name={selectedConv.guestName} channel={selectedConv.channel} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-gray-900 truncate">{selectedConv.guestName || "Невідомий"}</h2>
                  {selectedConv.guestPhone && <span className="text-xs text-gray-400 hidden sm:block">{selectedConv.guestPhone}</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${CONV_STATUS[selectedConv.status]?.color}`}>
                    {CONV_STATUS[selectedConv.status]?.label}
                  </span>
                  {selectedConv.leadStatus && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${LEAD_STAGES[selectedConv.leadStatus]?.bg} ${LEAD_STAGES[selectedConv.leadStatus]?.color}`}>
                      {LEAD_STAGES[selectedConv.leadStatus]?.label}
                    </span>
                  )}
                  {booking && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                      📎 Бронювання #{booking.id}
                    </span>
                  )}
                </div>
                {selectedConv.subject && <p className="text-xs text-gray-400 truncate">{selectedConv.subject}</p>}
              </div>

              {/* Quick actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {selectedConv.status !== "resolved" ? (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 hidden sm:flex"
                    onClick={() => updateConv({ status: "resolved" })}>
                    <CheckCheck className="w-3 h-3" /> Вирішено
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 hidden sm:flex"
                    onClick={() => updateConv({ status: "open" })}>
                    <RefreshCw className="w-3 h-3" /> Відкрити
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hidden sm:flex"
                  onClick={() => setShowLinkBooking(!showLinkBooking)}>
                  <Link2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={() => setShowRightPanel(!showRightPanel)}>
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Link booking panel */}
            {showLinkBooking && (
              <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center gap-2 flex-shrink-0">
                <Link2 className="w-4 h-4 text-blue-400" />
                <Input value={bookingIdInput} onChange={e => setBookingIdInput(e.target.value)}
                  placeholder="ID бронювання" className="h-7 text-xs max-w-[140px] bg-white"
                  onKeyDown={e => e.key === "Enter" && linkBooking()} />
                <Button size="sm" className="h-7 text-xs" onClick={linkBooking}>Прив'язати</Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowLinkBooking(false)}><X className="w-3 h-3" /></Button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {msgsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="w-10 h-10 text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">Немає повідомлень</p>
                </div>
              ) : messages.map((msg, i) => {
                if (msg.messageType === "system") {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <span className="text-[11px] text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                        {msg.content} · {format(new Date(msg.createdAt), "HH:mm", { locale: uk })}
                      </span>
                    </div>
                  );
                }
                if (msg.isInternal) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="max-w-[80%] bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm">
                        <div className="flex items-center gap-1 mb-1">
                          <StickyNote className="w-3 h-3 text-amber-500" />
                          <span className="text-[10px] font-semibold text-amber-600">Внутрішня нотатка · {msg.senderName}</span>
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">{msg.content}</p>
                        <p className="text-[10px] text-amber-400 mt-1 text-right">{format(new Date(msg.createdAt), "HH:mm", { locale: uk })}</p>
                      </div>
                    </div>
                  );
                }
                const isOut = msg.direction === "outbound";
                return (
                  <div key={msg.id} className={`flex gap-2 ${isOut ? "justify-end" : "justify-start"}`}>
                    {!isOut && <Avatar name={selectedConv.guestName} channel={selectedConv.channel} size="sm" />}
                    <div className={`max-w-[70%] ${isOut ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      {!isOut && <span className="text-[11px] text-gray-400 ml-1">{msg.senderName || selectedConv.guestName}</span>}
                      <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isOut
                          ? `bg-indigo-600 text-white rounded-tr-md ${msg.isAiGenerated ? "ring-1 ring-violet-400" : ""}`
                          : "bg-white border border-gray-100 text-gray-800 rounded-tl-md shadow-sm"
                      }`}>
                        {msg.messageType === "booking_card" ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 font-semibold"><Building2 className="w-3.5 h-3.5" /> Картка бронювання</div>
                            <p className="text-sm opacity-80">{msg.content}</p>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                        {msg.isAiGenerated && (
                          <div className={`flex items-center gap-1 mt-1 ${isOut ? "text-violet-200" : "text-violet-400"}`}>
                            <Sparkles className="w-3 h-3" /><span className="text-[10px]">AI</span>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 mx-1">
                        {format(new Date(msg.createdAt), "HH:mm", { locale: uk })}
                        {isOut && msg.isRead && " ✓✓"}
                      </span>
                    </div>
                    {isOut && (
                      <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 self-end">
                        <User className="w-3.5 h-3.5 text-indigo-600" />
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* AI draft banner */}
            {aiDraft && (
              <div className="mx-4 mb-2 bg-violet-50 border border-violet-200 rounded-xl p-3 flex-shrink-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <Sparkles className="w-4 h-4 text-violet-500" />
                  <span className="text-xs font-semibold text-violet-700">AI-чернетка</span>
                  <button onClick={() => setAiDraft("")} className="ml-auto text-violet-300 hover:text-violet-500"><X className="w-3.5 h-3.5" /></button>
                </div>
                <p className="text-xs text-violet-700 whitespace-pre-wrap line-clamp-3">{aiDraft}</p>
                {aiSources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-violet-100">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">Підтверджені джерела</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {aiSources.map(source => (
                        <span key={source.id} className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-violet-700 border border-violet-100">
                          <BookOpen className="w-2.5 h-2.5" />{source.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {aiHandoffSuggested && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-amber-700">
                    <AlertCircle className="w-3 h-3" /> Підтверджених знань недостатньо — уточніть у менеджера.
                  </div>
                )}
                {bookingIntake?.detected && (
                  <div className="mt-2 rounded-lg bg-white/80 px-2 py-1.5 text-[10px] text-violet-700">
                    Запит на проживання: {bookingIntake.checkIn && bookingIntake.checkOut ? `${bookingIntake.checkIn} — ${bookingIntake.checkOut}` : "потрібно уточнити дати"}
                    {bookingIntake.adults ? ` · ${bookingIntake.adults} дорослих` : ""}{bookingIntake.children ? ` · ${bookingIntake.children} дітей` : ""}
                    <span className="ml-1 font-semibold">Потребує перевірки менеджером.</span>
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <Button size="sm" className="h-6 text-xs px-3 bg-violet-600 hover:bg-violet-700"
                    onClick={() => { setReplyText(aiDraft); setAiDraft(""); setAiSources([]); setAiHandoffSuggested(false); setBookingIntake(null); setTimeout(() => replyRef.current?.focus(), 100); }}>
                    Використати
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-violet-500" onClick={() => { setAiDraft(""); setAiSources([]); setAiHandoffSuggested(false); setBookingIntake(null); }}>
                    Відхилити
                  </Button>
                </div>
              </div>
            )}

            {/* Canned replies picker */}
            {showCanned && (
              <div className="mx-4 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg flex-shrink-0 max-h-56 overflow-hidden flex flex-col">
                <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-semibold text-gray-700">Шаблони відповідей</span>
                  <div className="flex-1 relative">
                    <input value={cannedSearch} onChange={e => setCannedSearch(e.target.value)}
                      placeholder="Пошук або /ярлик…" className="w-full h-6 px-2 text-xs border border-gray-200 rounded-lg" />
                  </div>
                  <button onClick={() => setShowCanned(false)}><X className="w-3.5 h-3.5 text-gray-400" /></button>
                </div>
                <div className="overflow-y-auto">
                  {filteredCanned.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 py-3">Шаблони не знайдено</p>
                  ) : filteredCanned.map(cr => (
                    <button key={cr.id} onClick={() => useCannedReply(cr)}
                      className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-gray-50 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-gray-800">{cr.title}</span>
                          {cr.shortcut && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{cr.shortcut}</span>}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">{cr.content}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Composer */}
            <div className="bg-white border-t border-gray-100 p-3 flex-shrink-0">
              {/* Mode toggle */}
              <div className="flex items-center gap-1.5 mb-2">
                <button onClick={() => setIsInternal(false)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${!isInternal ? "bg-indigo-100 text-indigo-700" : "text-gray-400 hover:bg-gray-100"}`}>
                  <Send className="w-3 h-3" /> Відповідь
                </button>
                <button onClick={() => setIsInternal(true)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${isInternal ? "bg-amber-100 text-amber-700" : "text-gray-400 hover:bg-gray-100"}`}>
                  <StickyNote className="w-3 h-3" /> Нотатка
                </button>
                <div className="flex-1" />
                <button onClick={getAiDraft} disabled={aiLoading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 transition-all disabled:opacity-50">
                  {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  AI Чернетка
                </button>
                <button onClick={() => { setShowCanned(!showCanned); setCannedSearch(""); }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${showCanned ? "bg-amber-100 text-amber-700" : "text-gray-500 hover:bg-gray-100"}`}>
                  <Zap className="w-3 h-3" /> Шаблони
                </button>
              </div>

              <div className="flex gap-2 items-end">
                <div className={`flex-1 border rounded-xl overflow-hidden transition-all ${isInternal ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}>
                  <Textarea
                    ref={replyRef}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder={isInternal ? "Внутрішня нотатка (видима лише команді)…" : `Відповідь через ${CH[selectedConv.channel]?.label || "канал"}…`}
                    className="border-0 bg-transparent resize-none text-sm min-h-[60px] max-h-[140px] focus-visible:ring-0 p-3"
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendMessage(); }}
                  />
                  <div className="flex items-center gap-1 px-2 pb-1.5">
                    <button className="p-1 text-gray-300 hover:text-gray-500 transition-colors" title="Вкласти файл (скоро)">
                      <Paperclip className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] text-gray-300 ml-auto">⌘↵ для надсилання</span>
                  </div>
                </div>
                <Button onClick={sendMessage} disabled={sending || !replyText.trim()}
                  className={`h-10 w-10 p-0 rounded-xl flex-shrink-0 ${isInternal ? "bg-amber-500 hover:bg-amber-600" : "bg-indigo-600 hover:bg-indigo-700"}`}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ══ RIGHT PANEL ═══════════════════════════════════════════════════ */}
        {selectedConv && showRightPanel && (
          <div className="hidden lg:flex flex-col w-[280px] flex-shrink-0 border-l border-gray-100 bg-white overflow-y-auto">

            {/* Contact info */}
            <div className="p-4 border-b border-gray-50">
              <div className="flex items-center gap-3 mb-3">
                <Avatar name={selectedConv.guestName} channel={selectedConv.channel} size="lg" />
                <div>
                  <p className="font-bold text-gray-900 text-sm">{selectedConv.guestName || "Невідомий"}</p>
                  <p className="text-[11px] text-gray-400">{CH[selectedConv.channel]?.label}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {selectedConv.guestPhone && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <a href={`tel:${selectedConv.guestPhone}`} className="hover:text-indigo-600">{selectedConv.guestPhone}</a>
                  </div>
                )}
                {selectedConv.guestEmail && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <a href={`mailto:${selectedConv.guestEmail}`} className="hover:text-indigo-600 truncate">{selectedConv.guestEmail}</a>
                  </div>
                )}
                {selectedConv.estimatedValue && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <DollarSign className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="font-semibold text-emerald-600">{fmt(selectedConv.estimatedValue)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Assignment */}
            <div className="p-4 border-b border-gray-50">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Відповідальний</p>
              <div className="relative">
                <button onClick={() => setShowAssign(!showAssign)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 hover:border-indigo-300 text-sm transition-all">
                  <UserCheck className="w-4 h-4 text-gray-400" />
                  <span className="flex-1 text-left text-gray-700 text-xs truncate">
                    {selectedConv.assignedToName || "Не призначено"}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
                {showAssign && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                    <button onClick={() => { updateConv({ assignedToId: null }); setShowAssign(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50">
                      Не призначено
                    </button>
                    {staff.map(s => (
                      <button key={s.id} onClick={() => { updateConv({ assignedToId: s.id }); setShowAssign(false); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{s.name}</p>
                          <p className="text-[10px] text-gray-400">{s.role}</p>
                        </div>
                        {selectedConv.assignedToId === s.id && <Check className="w-3.5 h-3.5 text-indigo-500 ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Conv status */}
            <div className="p-4 border-b border-gray-50">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Статус розмови</p>
              <div className="grid grid-cols-2 gap-1">
                {["open", "pending", "resolved", "spam"].map(s => (
                  <button key={s} onClick={() => updateConv({ status: s })}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${selectedConv.status === s ? `${CONV_STATUS[s].color} border-current` : "text-gray-500 border-gray-100 hover:border-gray-200 hover:bg-gray-50"}`}>
                    {CONV_STATUS[s]?.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lead pipeline */}
            {convLead && (
              <div className="p-4 border-b border-gray-50">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Лід · Стадія</p>
                <div className="space-y-1">
                  {["new", "contacted", "qualified", "quote_sent", "negotiating", "booked"].map(s => {
                    const stage = LEAD_STAGES[s];
                    const isActive = convLead.status === s;
                    const isPast = LEAD_STAGES[s].order < LEAD_STAGES[convLead.status]?.order;
                    return (
                      <button key={s} onClick={() => updateLead(convLead.id, { status: s })}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                          isActive ? `${stage.bg} ${stage.color} ring-1 ring-current` :
                          isPast ? "bg-gray-50 text-gray-400" : "text-gray-500 hover:bg-gray-50"
                        }`}>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive || isPast ? stage.color.replace("text-", "bg-") : "bg-gray-200"}`} />
                        {stage.label}
                        {isActive && <Check className="w-3 h-3 ml-auto" />}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 space-y-2">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Очікувана сума</p>
                    <p className="text-sm font-bold text-emerald-600">{fmt(convLead.estimated_value)}</p>
                  </div>
                  {convLead.quoted_amount && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1">КП надіслано</p>
                      <p className="text-sm font-bold text-violet-600">{fmt(convLead.quoted_amount)}</p>
                    </div>
                  )}
                  {convLead.check_in_date && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {convLead.check_in_date} → {convLead.check_out_date || "?"}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Linked booking */}
            {booking && (
              <div className="p-4 border-b border-gray-50">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Бронювання #{booking.id}</p>
                <div className="bg-blue-50 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-medium text-blue-800">{booking.unit_name}</span>
                  </div>
                  {booking.property_name && <p className="text-[11px] text-blue-600 ml-5">{booking.property_name}</p>}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs text-blue-700">
                      {booking.check_in ? format(new Date(booking.check_in), "dd.MM", { locale: uk }) : "?"} →{" "}
                      {booking.check_out ? format(new Date(booking.check_out), "dd.MM.yy", { locale: uk }) : "?"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-blue-100">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${booking.payment_status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {booking.payment_status === "paid" ? "Оплачено" : "Не оплачено"}
                    </span>
                    <span className="text-xs font-bold text-blue-800">{fmt(booking.total_amount)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tags */}
            <div className="p-4 border-b border-gray-50">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Теги</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {(selectedConv.tags || []).map(tag => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[11px] rounded-full border border-indigo-100">
                    #{tag}
                    <button onClick={() => removeTag(tag)} className="text-indigo-300 hover:text-indigo-600"><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <Input value={editingTag} onChange={e => setEditingTag(e.target.value)}
                  placeholder="Додати тег…" className="h-7 text-xs flex-1"
                  onKeyDown={e => e.key === "Enter" && addTag(editingTag)} />
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => addTag(editingTag)}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Mini timeline */}
            <div className="p-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Timeline</p>
              <div className="space-y-2">
                {messages.slice().reverse().slice(0, 6).reverse().map(msg => (
                  <div key={msg.id} className="flex gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      msg.messageType === "system" ? "bg-gray-300" :
                      msg.isInternal ? "bg-amber-400" :
                      msg.direction === "inbound" ? "bg-indigo-400" : "bg-emerald-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 text-[11px] leading-tight truncate">
                        {msg.messageType === "system" ? msg.content :
                          msg.isInternal ? `📌 ${msg.content}` :
                          msg.direction === "inbound" ? `← ${msg.content}` :
                          `→ ${msg.content}`}
                      </p>
                      <p className="text-[10px] text-gray-400">{format(new Date(msg.createdAt), "dd.MM HH:mm", { locale: uk })}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ Lead create form modal ══════════════════════════════════════════ */}
      {showLeadForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-violet-600" />
                <h3 className="font-bold text-gray-900">Новий лід</h3>
              </div>
              <button onClick={() => setShowLeadForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">Ім'я</label>
                  <Input value={newLeadForm.firstName} onChange={e => setNewLeadForm(p => ({ ...p, firstName: e.target.value }))} placeholder="Ім'я" className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">Прізвище</label>
                  <Input value={newLeadForm.lastName} onChange={e => setNewLeadForm(p => ({ ...p, lastName: e.target.value }))} placeholder="Прізвище" className="h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">Телефон</label>
                  <Input value={newLeadForm.phone} onChange={e => setNewLeadForm(p => ({ ...p, phone: e.target.value }))} placeholder="+380..." className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">Email</label>
                  <Input value={newLeadForm.email} onChange={e => setNewLeadForm(p => ({ ...p, email: e.target.value }))} placeholder="email@..." className="h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">Джерело</label>
                  <select value={newLeadForm.source} onChange={e => setNewLeadForm(p => ({ ...p, source: e.target.value }))}
                    className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white">
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">Сума (₴)</label>
                  <Input value={newLeadForm.estimatedValue} onChange={e => setNewLeadForm(p => ({ ...p, estimatedValue: e.target.value }))} placeholder="50000" type="number" className="h-9 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Тема запиту</label>
                <Input value={newLeadForm.subject} onChange={e => setNewLeadForm(p => ({ ...p, subject: e.target.value }))} placeholder="Весілля, корпоратив, проживання…" className="h-9 text-sm" />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <Button variant="outline" className="flex-1 h-9" onClick={() => setShowLeadForm(false)}>Скасувати</Button>
              <Button className="flex-1 h-9 bg-violet-600 hover:bg-violet-700" onClick={createLead}>
                <Plus className="w-4 h-4 mr-1" /> Створити лід
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CHANNEL SETTINGS MODAL ════════════════════════════════════════════ */}
      {showChannelSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowChannelSettings(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900 text-base">Підключення каналів</h2>
                <p className="text-xs text-gray-400 mt-0.5">Telegram Business, Telegram Bot та Instagram для Unified Inbox</p>
              </div>
              <button onClick={() => setShowChannelSettings(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">

              {/* ── TELEGRAM ────────────────────────────────────────────────── */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-sky-50">
                  <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.069l-2.055 9.677c-.154.678-.557.843-1.128.524l-3.1-2.285-1.497 1.44c-.165.165-.304.304-.624.304l.223-3.147 5.74-5.185c.25-.222-.054-.345-.386-.123L7.38 14.413l-3.04-.95c-.66-.205-.673-.66.138-.976l11.878-4.578c.549-.199 1.029.133.207.16z"/></svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-sky-900">Telegram Bot</p>
                    <p className="text-[11px] text-sky-600">
                      {channels.find(c => c.channel === "telegram")?.isEnabled
                        ? `✓ Підключено — @${channels.find(c => c.channel === "telegram")?.config?.bot_username || "..."}`
                        : "Не підключено"}
                    </p>
                  </div>
                  {channels.find(c => c.channel === "telegram")?.isEnabled && (
                    <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-semibold">ACTIVE</span>
                  )}
                </div>

                <div className="px-4 py-4 space-y-3">
                  {channels.find(c => c.channel === "telegram")?.isEnabled ? (
                    <div className="space-y-2">
                      {channels.find(c => c.channel === "telegram")?.config?.needs_secure_webhook === "true" && (
                        <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-800 space-y-2">
                          <p>Потрібно оновити захист webhook. Це не змінює бота та не вимагає повторно вводити токен.</p>
                          <Button size="sm" className="h-8 w-full bg-amber-600 hover:bg-amber-700"
                            onClick={secureTelegramWebhook} disabled={channelSetupLoading === "telegram-secure"}>
                            {channelSetupLoading === "telegram-secure" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Оновити захист Telegram"}
                          </Button>
                        </div>
                      )}
                      <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                        <p className="font-medium mb-0.5">Webhook URL:</p>
                        <p className="font-mono text-[10px] break-all">{channels.find(c => c.channel === "telegram")?.webhookUrl}</p>
                      </div>
                      <Button variant="outline" size="sm" className="w-full h-8 text-red-500 border-red-200 hover:bg-red-50"
                        onClick={disconnectTelegram} disabled={channelSetupLoading === "telegram-disconnect"}>
                        {channelSetupLoading === "telegram-disconnect" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Відключити"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <ol className="text-xs text-gray-500 space-y-1 pl-4 list-decimal">
                        <li>Відкрийте <span className="text-sky-600 font-medium">@BotFather</span> у Telegram</li>
                        <li>Відправте <code className="bg-gray-100 px-1 rounded">/newbot</code> та дайте ім'я боту</li>
                        <li>Скопіюйте токен бота та вставте нижче</li>
                      </ol>
                      <div className="flex gap-2">
                        <Input
                          value={tgToken}
                          onChange={e => setTgToken(e.target.value)}
                          placeholder="1234567890:ABCdef..."
                          className="h-9 text-sm font-mono flex-1"
                          onKeyDown={e => e.key === "Enter" && setupTelegram()}
                        />
                        <Button size="sm" className="h-9 px-3 bg-sky-500 hover:bg-sky-600 whitespace-nowrap"
                          onClick={setupTelegram} disabled={!tgToken.trim() || channelSetupLoading === "telegram"}>
                          {channelSetupLoading === "telegram" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Підключити"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── TELEGRAM BUSINESS ───────────────────────────────────────── */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-indigo-900">Telegram Business</p>
                    <p className="text-[11px] text-indigo-600">
                      {channels.find(c => c.channel === "telegram_business")?.isEnabled
                        ? `✓ Підключено — ${channels.find(c => c.channel === "telegram_business")?.config?.business_connection_count || 0} business-акаунт(ів)`
                        : channels.find(c => c.channel === "telegram")?.isEnabled
                          ? "Готово до підключення у вашому Telegram"
                          : "Спочатку підключіть Telegram Bot"}
                    </p>
                  </div>
                  {channels.find(c => c.channel === "telegram_business")?.isEnabled && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">ACTIVE</span>
                  )}
                </div>

                <div className="px-4 py-4 space-y-3">
                  {!channels.find(c => c.channel === "telegram")?.isEnabled ? (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-800">
                      Спершу підключіть Telegram Bot вище. Він стане офіційним Connected Business Bot для вашого звичайного Telegram Business акаунта.
                    </div>
                  ) : channels.find(c => c.channel === "telegram_business")?.isEnabled ? (
                    <div className="space-y-3">
                      <div className="bg-indigo-50 rounded-lg px-3 py-2 text-xs text-indigo-800">
                        <p className="font-medium mb-1">Підключення активне</p>
                        <p>У Telegram відкрийте <strong>Налаштування → Telegram Business → Чат-боти</strong>, оберіть цього бота та визначте чати, до яких він має доступ. Коди входу, пароль і 2FA ніколи не потрібні.</p>
                      </div>
                      <Button variant="outline" size="sm" className="w-full h-8 text-red-500 border-red-200 hover:bg-red-50"
                        onClick={disconnectTelegramBusiness} disabled={channelSetupLoading === "telegram-business-disconnect"}>
                        {channelSetupLoading === "telegram-business-disconnect" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Відключити Telegram Business"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <ol className="text-xs text-gray-600 space-y-1 pl-4 list-decimal">
                        <li>Натисніть «Увімкнути Telegram Business» нижче</li>
                        <li>У своєму Telegram відкрийте <strong>Налаштування → Telegram Business → Чат-боти</strong></li>
                        <li>Оберіть підключеного бота та дозволені чати</li>
                      </ol>
                      <div className="bg-gray-50 rounded-lg px-3 py-2 text-[11px] text-gray-500">
                        Гості продовжать писати на ваш звичайний Telegram Business акаунт, а повідомлення з вибраних чатів з’являться в Inbox.
                      </div>
                      <Button size="sm" className="w-full h-9 bg-indigo-600 hover:bg-indigo-700"
                        onClick={setupTelegramBusiness} disabled={channelSetupLoading === "telegram-business"}>
                        {channelSetupLoading === "telegram-business" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Увімкнути Telegram Business"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── INSTAGRAM ───────────────────────────────────────────────── */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-pink-50">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-pink-900">Instagram DM</p>
                    <p className="text-[11px] text-pink-600">
                      {channels.find(c => c.channel === "instagram")?.isEnabled
                        ? `✓ Підключено — ${channels.find(c => c.channel === "instagram")?.config?.page_name || "..."}`
                        : "Не підключено"}
                    </p>
                  </div>
                  {channels.find(c => c.channel === "instagram")?.isEnabled && (
                    <span className="text-[10px] bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full font-semibold">ACTIVE</span>
                  )}
                </div>

                <div className="px-4 py-4 space-y-3">
                  {channels.find(c => c.channel === "instagram")?.isEnabled ? (
                    <div className="space-y-2">
                      <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600 space-y-1">
                        <p><span className="font-medium">Webhook URL:</span></p>
                        <p className="font-mono text-[10px] break-all">{channels.find(c => c.channel === "instagram")?.webhookUrl}</p>
                        <p className="mt-1"><span className="font-medium">Verify Token:</span> <span className="font-mono">{igVerifyToken}</span></p>
                      </div>
                      <Button variant="outline" size="sm" className="w-full h-8 text-red-500 border-red-200 hover:bg-red-50"
                        onClick={disconnectInstagram} disabled={channelSetupLoading === "instagram-disconnect"}>
                        {channelSetupLoading === "instagram-disconnect" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Відключити"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
                        <p className="font-semibold mb-1">Потрібно:</p>
                        <ol className="space-y-1 pl-3 list-decimal">
                          <li>Meta Business App з дозволом <code>instagram_manage_messages</code></li>
                          <li>Facebook Page з підключеним Instagram Business акаунтом</li>
                          <li>Page Access Token (не User Token)</li>
                          <li>App Secret із Meta Business App</li>
                        </ol>
                      </div>
                      <div className="space-y-2">
                        <Input value={igPageId} onChange={e => setIgPageId(e.target.value)}
                          placeholder="Facebook Page ID (числовий)" className="h-9 text-sm font-mono" />
                        <Input value={igAccessToken} onChange={e => setIgAccessToken(e.target.value)}
                          placeholder="Page Access Token (EAABxxx...)" className="h-9 text-sm font-mono" />
                        <Input value={igAppSecret} onChange={e => setIgAppSecret(e.target.value)}
                          type="password" placeholder="Meta App Secret" className="h-9 text-sm font-mono" />
                        <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500">
                          <p className="font-medium text-gray-700 mb-0.5">Verify Token (для Meta Webhook):</p>
                          <p className="font-mono">{igVerifyToken}</p>
                          <p className="mt-1">Webhook URL: <span className="font-mono text-[10px] break-all">{`${window.location.origin.replace(/\/maison-hd.*/, "")}/api/inbox/webhooks/instagram`}</span></p>
                        </div>
                        <Button size="sm" className="w-full h-9 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                          onClick={setupInstagram} disabled={!igAccessToken.trim() || !igPageId.trim() || !igAppSecret.trim() || channelSetupLoading === "instagram"}>
                          {channelSetupLoading === "instagram" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Підключити Instagram"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── WHATSAPP BUSINESS ────────────────────────────────────────── */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-green-50">
                  <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.554 4.095 1.518 5.815L0 24l6.335-1.482A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm6.18 16.963c-.26.733-1.515 1.4-2.072 1.485-.53.08-1.197.114-1.93-.12-.445-.143-1.015-.335-1.745-.654-3.065-1.325-5.063-4.407-5.215-4.612-.152-.205-1.24-1.648-1.24-3.144 0-1.497.784-2.233 1.062-2.54.277-.305.605-.381.807-.381h.58c.185.008.435-.07.68.519.26.619.88 2.14.958 2.297.078.157.13.34.026.549-.104.21-.156.34-.307.524-.152.183-.32.41-.456.55-.152.157-.31.328-.134.641.177.314.785 1.296 1.685 2.098 1.157 1.032 2.133 1.35 2.447 1.503.313.152.496.128.679-.077.183-.205.784-.916.993-1.23.21-.312.42-.26.707-.156.287.104 1.822.86 2.135 1.016.313.157.52.235.596.365.078.13.078.752-.182 1.488z"/></svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-green-900">WhatsApp Business</p>
                    <p className="text-[11px] text-green-700">
                      {channels.find(c => c.channel === "whatsapp")?.isEnabled
                        ? `✓ Підключено — ${channels.find(c => c.channel === "whatsapp")?.config?.verified_name || ""} · ${channels.find(c => c.channel === "whatsapp")?.config?.display_phone || ""}`
                        : "Не підключено"}
                    </p>
                  </div>
                  {channels.find(c => c.channel === "whatsapp")?.isEnabled && (
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">ACTIVE</span>
                  )}
                </div>

                <div className="px-4 py-4 space-y-3">
                  {channels.find(c => c.channel === "whatsapp")?.isEnabled ? (
                    <div className="space-y-2">
                      <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600 space-y-1">
                        <p><span className="font-medium">Webhook URL:</span></p>
                        <p className="font-mono text-[10px] break-all">{channels.find(c => c.channel === "whatsapp")?.webhookUrl}</p>
                        <p className="mt-1"><span className="font-medium">Verify Token:</span> <span className="font-mono">{channels.find(c => c.channel === "whatsapp")?.config?.verify_token || "—"}</span></p>
                        <p className="mt-1 text-[10px] text-gray-400">Підпишіть цей Webhook URL у Meta Business Manager → WhatsApp → Configuration → Webhooks. Виберіть поле <code>messages</code>.</p>
                      </div>
                      <Button variant="outline" size="sm" className="w-full h-8 text-red-500 border-red-200 hover:bg-red-50"
                        onClick={disconnectWhatsApp} disabled={channelSetupLoading === "whatsapp-disconnect"}>
                        {channelSetupLoading === "whatsapp-disconnect" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Відключити"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
                        <p className="font-semibold mb-1">Потрібно у Meta Business Manager:</p>
                        <ol className="space-y-1 pl-3 list-decimal">
                          <li>WhatsApp Business App з дозволом <code>whatsapp_business_messaging</code></li>
                          <li>Бізнес-акаунт WhatsApp Business із підтвердженим номером</li>
                          <li>Phone Number ID (з WhatsApp → Getting Started)</li>
                          <li>System User Access Token із правами на цей номер</li>
                          <li>App Secret зі сторінки App Settings</li>
                        </ol>
                      </div>
                      <div className="space-y-2">
                        <Input value={waPhoneNumberId} onChange={e => setWaPhoneNumberId(e.target.value)}
                          placeholder="Phone Number ID (числовий, напр. 1234567890)" className="h-9 text-sm font-mono" />
                        <Input value={waAccessToken} onChange={e => setWaAccessToken(e.target.value)}
                          placeholder="System User Access Token (EAABxxx...)" className="h-9 text-sm font-mono" />
                        <Input value={waAppSecret} onChange={e => setWaAppSecret(e.target.value)}
                          type="password" placeholder="Meta App Secret" className="h-9 text-sm font-mono" />
                        <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500">
                          <p className="font-medium text-gray-700 mb-0.5">Verify Token (для Meta Webhook):</p>
                          <p className="font-mono">{waVerifyToken}</p>
                          <p className="mt-1">Webhook URL: <span className="font-mono text-[10px] break-all">{`${window.location.origin.replace(/\/maison-hd.*/, "")}/api/inbox/webhooks/whatsapp`}</span></p>
                        </div>
                        <Button size="sm" className="w-full h-9 bg-green-600 hover:bg-green-700"
                          onClick={setupWhatsApp}
                          disabled={!waPhoneNumberId.trim() || !waAccessToken.trim() || !waAppSecret.trim() || channelSetupLoading === "whatsapp"}>
                          {channelSetupLoading === "whatsapp" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Підключити WhatsApp Business"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── INFO ─────────────────────────────────────────────────────── */}
              <div className="bg-indigo-50 rounded-xl px-4 py-3 text-xs text-indigo-700">
                <p className="font-semibold mb-1">Як це працює:</p>
                <p>Гість пише у ваш Telegram-бот, Telegram Business, Instagram DM або WhatsApp Business → повідомлення з'являється тут в Inbox → ви відповідаєте з панелі → відповідь іде гостю назад у той самий канал.</p>
              </div>

            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
