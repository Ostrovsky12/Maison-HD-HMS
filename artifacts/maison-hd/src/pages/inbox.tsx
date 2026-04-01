import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Search, Send, Sparkles, Link2, CheckCheck, Clock, AlertCircle,
  MessageSquare, Instagram, Mail, Phone, Globe, RefreshCw, Filter,
  Plus, X, ChevronDown, User, Calendar, MoreVertical, Loader2,
  Bot, Smile, Paperclip, ArrowLeft, Check,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { uk } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const tok = () => localStorage.getItem("hms_token") || "";
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

// ── Channel meta ───────────────────────────────────────────────────────────
const CHANNEL_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  telegram: {
    label: "Telegram",
    icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.069l-2.055 9.677c-.154.678-.557.843-1.128.524l-3.1-2.285-1.497 1.44c-.165.165-.304.304-.624.304l.223-3.147 5.74-5.185c.25-.222-.054-.345-.386-.123L7.38 14.413l-3.04-.95c-.66-.205-.673-.66.138-.976l11.878-4.578c.549-.199 1.029.133.207.16z"/></svg>,
    color: "text-blue-500",
    bg: "bg-blue-50 border-blue-100",
  },
  instagram: {
    label: "Instagram",
    icon: <Instagram className="w-3.5 h-3.5" />,
    color: "text-pink-500",
    bg: "bg-pink-50 border-pink-100",
  },
  website: {
    label: "Сайт",
    icon: <Globe className="w-3.5 h-3.5" />,
    color: "text-green-600",
    bg: "bg-green-50 border-green-100",
  },
  email: {
    label: "Email",
    icon: <Mail className="w-3.5 h-3.5" />,
    color: "text-purple-500",
    bg: "bg-purple-50 border-purple-100",
  },
  phone: {
    label: "Телефон",
    icon: <Phone className="w-3.5 h-3.5" />,
    color: "text-gray-600",
    bg: "bg-gray-50 border-gray-100",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.554 4.095 1.518 5.815L0 24l6.335-1.482A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm6.18 16.963c-.26.733-1.515 1.4-2.072 1.485-.53.08-1.197.114-1.93-.12-.445-.143-1.015-.335-1.745-.654-3.065-1.325-5.063-4.407-5.215-4.612-.152-.205-1.24-1.648-1.24-3.144 0-1.497.784-2.233 1.062-2.54.277-.305.605-.381.807-.381.201 0 .403.002.58.01.185.008.435-.07.68.519.26.619.88 2.14.958 2.297.078.157.13.34.026.549-.104.21-.156.34-.307.524-.152.183-.32.41-.456.55-.152.157-.31.328-.134.641.177.314.785 1.296 1.685 2.098 1.157 1.032 2.133 1.35 2.447 1.503.313.152.496.128.679-.077.183-.205.784-.916.993-1.23.21-.312.42-.26.707-.156.287.104 1.822.86 2.135 1.016.313.157.52.235.596.365.078.13.078.752-.182 1.488z"/></svg>,
    color: "text-emerald-500",
    bg: "bg-emerald-50 border-emerald-100",
  },
  viber: {
    label: "Viber",
    icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M11.997 0C5.372 0 0 5.372 0 11.997 0 18.623 5.372 24 11.997 24 18.623 24 24 18.623 24 11.997 24 5.372 18.623 0 11.997 0zm4.13 16.463c-.213.58-.957 1.043-1.608 1.173-.43.087-.99.155-2.878-.617-2.417-.98-3.978-3.462-4.1-3.621-.12-.156-1.01-1.341-1.01-2.558 0-1.217.636-1.815.862-2.063.227-.247.494-.31.657-.31H8.2c.18 0 .35.066.48.183.14.125.26.308.39.65.35.908.673 1.573.673 1.573.128.22.09.494-.013.69-.1.197-.17.323-.338.504-.17.18-.355.402-.508.54-.158.142-.323.297-.138.58.184.28.816 1.345 1.751 2.18 1.203 1.072 2.218 1.407 2.53 1.568.313.162.497.135.68-.083.185-.218.796-.932 1.01-1.252.213-.32.425-.267.713-.161.288.105 1.836.866 2.152 1.023.316.157.527.237.603.37.078.13.078.76-.182 1.342z"/></svg>,
    color: "text-violet-500",
    bg: "bg-violet-50 border-violet-100",
  },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  open:     { label: "Відкрито",   color: "bg-green-100 text-green-700" },
  pending:  { label: "Очікує",     color: "bg-yellow-100 text-yellow-700" },
  resolved: { label: "Вирішено",   color: "bg-gray-100 text-gray-600" },
  spam:     { label: "Спам",       color: "bg-red-100 text-red-700" },
};

interface Conversation {
  id: number;
  channel: string;
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  subject: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  status: string;
  unreadCount: number;
  bookingId: number | null;
  tags: string[];
}

interface Message {
  id: number;
  conversationId: number;
  direction: "inbound" | "outbound";
  messageType: string;
  content: string | null;
  senderName: string | null;
  isAiGenerated: boolean;
  isRead: boolean;
  createdAt: string;
}

interface Stats {
  total: number;
  open: number;
  pending: number;
  resolved: number;
  totalUnread: number;
  byChannel: Record<string, number>;
}

const FILTERS = [
  { key: "all",      label: "Всі" },
  { key: "open",     label: "Відкриті" },
  { key: "pending",  label: "Очікують" },
  { key: "resolved", label: "Вирішені" },
];

const CHANNELS = ["telegram", "instagram", "website", "email", "whatsapp", "viber", "phone"];

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [linkedBooking, setLinkedBooking] = useState<any>(null);
  const [showLinkBooking, setShowLinkBooking] = useState(false);
  const [bookingIdInput, setBookingIdInput] = useState("");
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (channelFilter) params.set("channel", channelFilter);
      if (search) params.set("search", search);
      const r = await authFetch(`${API}/inbox/conversations?${params}`);
      const d = await r.json();
      if (d.conversations) {
        setConversations(d.conversations);
        setStats(prev => prev ? { ...prev, totalUnread: d.totalUnread } : null);
      }
    } catch {}
  }, [statusFilter, channelFilter, search]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [statsRes, convRes] = await Promise.all([
          authFetch(`${API}/inbox/stats`),
          authFetch(`${API}/inbox/conversations`),
        ]);
        const statsData = await statsRes.json();
        const convData = await convRes.json();
        setStats(statsData);
        if (convData.conversations) setConversations(convData.conversations);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function openConversation(conv: Conversation) {
    setSelectedConv(conv);
    setMessagesLoading(true);
    setAiSuggestion("");
    setLinkedBooking(null);
    setShowMobileDetail(true);
    try {
      const r = await authFetch(`${API}/inbox/conversations/${conv.id}`);
      const d = await r.json();
      if (d.messages) setMessages(d.messages);
      if (d.booking) setLinkedBooking(d.booking);
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c));
    } catch {
      toast({ title: "Помилка завантаження повідомлень", variant: "destructive" });
    } finally {
      setMessagesLoading(false);
    }
  }

  async function sendReply(text?: string) {
    const content = text || replyText.trim();
    if (!content || !selectedConv) return;
    setSending(true);
    try {
      const r = await authFetch(`${API}/inbox/conversations/${selectedConv.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      const d = await r.json();
      if (d.message) {
        setMessages(prev => [...prev, d.message]);
        setReplyText("");
        setAiSuggestion("");
        setConversations(prev => prev.map(c => c.id === selectedConv.id ? {
          ...c, lastMessagePreview: content.slice(0, 80), lastMessageAt: new Date().toISOString(), status: "pending",
        } : c));
      }
    } finally {
      setSending(false);
      setTimeout(() => replyRef.current?.focus(), 100);
    }
  }

  async function getAiSuggestion() {
    if (!selectedConv) return;
    setAiLoading(true);
    setAiSuggestion("");
    try {
      const r = await authFetch(`${API}/inbox/conversations/${selectedConv.id}/ai-suggest`, { method: "POST" });
      const d = await r.json();
      if (d.suggestion) setAiSuggestion(d.suggestion);
    } finally {
      setAiLoading(false);
    }
  }

  async function updateStatus(status: string) {
    if (!selectedConv) return;
    const r = await authFetch(`${API}/inbox/conversations/${selectedConv.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    const d = await r.json();
    setSelectedConv(prev => prev ? { ...prev, status } : null);
    setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, status } : c));
    toast({ title: `Статус змінено на «${STATUS_META[status]?.label}»` });
  }

  async function linkBooking() {
    if (!selectedConv || !bookingIdInput) return;
    const r = await authFetch(`${API}/inbox/conversations/${selectedConv.id}/link-booking/${bookingIdInput}`, { method: "POST" });
    const d = await r.json();
    if (!d.error) {
      toast({ title: "✅ Бронювання прив'язано" });
      setShowLinkBooking(false);
      openConversation(selectedConv);
    } else {
      toast({ title: "Помилка", description: d.error, variant: "destructive" });
    }
  }

  const ch = selectedConv ? CHANNEL_META[selectedConv.channel] : null;
  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-50">

        {/* ══ LEFT SIDEBAR ════════════════════════════════════════════════ */}
        <div className={`flex flex-col bg-white border-r border-gray-100 w-full md:w-80 lg:w-96 flex-shrink-0 ${showMobileDetail ? "hidden md:flex" : "flex"}`}>

          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900">Inbox</h1>
                {totalUnread > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{totalUnread}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={fetchConversations}><RefreshCw className="w-3.5 h-3.5" /></Button>
              </div>
            </div>

            {/* Stats row */}
            {stats && (
              <div className="flex gap-2 mb-3">
                {[
                  { label: "Відкриті", val: stats.open, color: "text-green-600" },
                  { label: "Очікують", val: stats.pending, color: "text-yellow-600" },
                  { label: "Вирішені", val: stats.resolved, color: "text-gray-500" },
                ].map(s => (
                  <div key={s.label} className="flex-1 bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                    <p className={`text-lg font-bold leading-none ${s.color}`}>{s.val}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Пошук розмов…"
                className="pl-8 h-8 text-sm bg-gray-50 border-gray-100"
              />
            </div>

            {/* Status filters */}
            <div className="flex gap-1">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all ${
                    statusFilter === f.key ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Channel filters */}
            <div className="flex gap-1 mt-2 flex-wrap">
              {CHANNELS.filter(ch => !stats || stats.byChannel[ch] > 0).map(ch => {
                const meta = CHANNEL_META[ch];
                return (
                  <button
                    key={ch}
                    onClick={() => setChannelFilter(prev => prev === ch ? "" : ch)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition-all ${
                      channelFilter === ch ? `${meta.bg} ${meta.color} font-semibold` : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"
                    }`}
                  >
                    <span className={meta.color}>{meta.icon}</span>
                    {meta.label}
                    {stats?.byChannel[ch] && <span className="font-bold">{stats.byChannel[ch]}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                <MessageSquare className="w-10 h-10 text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">Немає розмов</p>
              </div>
            ) : (
              conversations.map(conv => {
                const meta = CHANNEL_META[conv.channel] || CHANNEL_META.website;
                const isSelected = selectedConv?.id === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                      isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.bg} border`}>
                        <span className={meta.color}>{meta.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className={`text-sm font-semibold truncate ${conv.unreadCount > 0 ? "text-gray-900" : "text-gray-700"}`}>
                            {conv.guestName || "Невідомий"}
                          </span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {formatDistanceToNow(new Date(conv.lastMessageAt), { locale: uk, addSuffix: false })}
                          </span>
                        </div>
                        {conv.subject && (
                          <p className="text-xs text-gray-500 truncate mb-0.5">{conv.subject}</p>
                        )}
                        <div className="flex items-center gap-1.5">
                          <p className={`text-xs truncate flex-1 ${conv.unreadCount > 0 ? "text-gray-700 font-medium" : "text-gray-400"}`}>
                            {conv.lastMessagePreview}
                          </p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {conv.unreadCount > 0 && (
                              <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{conv.unreadCount}</span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_META[conv.status]?.color}`}>
                              {STATUS_META[conv.status]?.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ══ MAIN CHAT AREA ══════════════════════════════════════════════ */}
        {!selectedConv && !showMobileDetail ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 hidden md:flex">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center mb-4">
              <MessageSquare className="w-10 h-10 text-blue-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Unified Inbox</h2>
            <p className="text-sm text-gray-400 max-w-xs">Оберіть розмову зліва, щоб переглянути повідомлення та відповісти</p>
            <div className="flex flex-wrap gap-2 mt-6 justify-center">
              {Object.entries(CHANNEL_META).map(([k, v]) => (
                <div key={k} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs ${v.bg} ${v.color}`}>
                  {v.icon} {v.label}
                </div>
              ))}
            </div>
          </div>
        ) : selectedConv ? (
          <div className={`flex-1 flex flex-col min-w-0 ${showMobileDetail ? "flex" : "hidden md:flex"}`}>

            {/* Chat header */}
            <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
              <button onClick={() => { setShowMobileDetail(false); }} className="md:hidden text-gray-400 hover:text-gray-600">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border ${ch?.bg}`}>
                <span className={ch?.color}>{ch?.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-gray-900 truncate">{selectedConv.guestName || "Невідомий"}</h2>
                  {selectedConv.guestPhone && <span className="text-xs text-gray-400 hidden sm:block">{selectedConv.guestPhone}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_META[selectedConv.status]?.color}`}>
                    {STATUS_META[selectedConv.status]?.label}
                  </span>
                  {selectedConv.subject && <span className="text-xs text-gray-400 truncate hidden sm:block">{selectedConv.subject}</span>}
                  {linkedBooking && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                      📎 Бронювання #{linkedBooking.id}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {selectedConv.status !== "resolved" && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 hidden sm:flex" onClick={() => updateStatus("resolved")}>
                    <CheckCheck className="w-3 h-3" /> Вирішено
                  </Button>
                )}
                {selectedConv.status === "resolved" && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 hidden sm:flex" onClick={() => updateStatus("open")}>
                    <RefreshCw className="w-3 h-3" /> Відкрити
                  </Button>
                )}
                <Button
                  variant="outline" size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowLinkBooking(!showLinkBooking)}
                >
                  <Link2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Бронювання</span>
                </Button>
              </div>
            </div>

            {/* Link booking panel */}
            {showLinkBooking && (
              <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <Input
                  value={bookingIdInput}
                  onChange={e => setBookingIdInput(e.target.value)}
                  placeholder="ID бронювання (напр. 5)"
                  className="h-7 text-xs flex-1 max-w-[160px] bg-white"
                  onKeyDown={e => e.key === "Enter" && linkBooking()}
                />
                <Button size="sm" className="h-7 text-xs" onClick={linkBooking}>Прив'язати</Button>
                <button onClick={() => setShowLinkBooking(false)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
            )}

            {/* Linked booking card */}
            {linkedBooking && (
              <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center gap-3 text-xs">
                <Calendar className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span className="text-blue-700">
                  <span className="font-semibold">#{linkedBooking.id}</span> — {linkedBooking.unitName} · {linkedBooking.checkIn} → {linkedBooking.checkOut}
                </span>
                <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                  linkedBooking.paymentStatus === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                }`}>
                  {linkedBooking.paymentStatus === "paid" ? "Оплачено" : "Не оплачено"}
                </span>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
              {messagesLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
              ) : messages.map((msg, i) => {
                const isOut = msg.direction === "outbound";
                const isSystem = msg.messageType === "system";

                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <span className="text-[10px] text-gray-400 bg-white border border-gray-100 px-3 py-1 rounded-full">{msg.content}</span>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] ${isOut ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      {!isOut && (
                        <span className="text-[10px] text-gray-400 ml-2">
                          {msg.senderName || selectedConv.guestName}
                        </span>
                      )}
                      <div className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        isOut
                          ? "bg-blue-500 text-white rounded-br-sm" + (msg.isAiGenerated ? " bg-indigo-500" : "")
                          : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm"
                      }`}>
                        {msg.isAiGenerated && (
                          <div className="flex items-center gap-1 text-indigo-200 text-[10px] mb-1">
                            <Bot className="w-3 h-3" /> AI підказка
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <div className={`flex items-center gap-1 text-[10px] text-gray-400 px-1 ${isOut ? "justify-end" : ""}`}>
                        {isOut && msg.senderName && <span>{msg.senderName}</span>}
                        <span>{format(new Date(msg.createdAt), "HH:mm")}</span>
                        {isOut && <CheckCheck className="w-3 h-3 text-blue-400" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* AI suggestion */}
            {aiSuggestion && (
              <div className="bg-indigo-50 border-t border-indigo-100 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Bot className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-indigo-700 mb-1">AI підказка</p>
                    <p className="text-xs text-indigo-800 whitespace-pre-wrap leading-relaxed">{aiSuggestion}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" className="h-6 text-[10px] bg-indigo-500 hover:bg-indigo-600 text-white gap-1" onClick={() => { setReplyText(aiSuggestion); setAiSuggestion(""); replyRef.current?.focus(); }}>
                      Використати
                    </Button>
                    <button onClick={() => setAiSuggestion("")} className="text-indigo-300 hover:text-indigo-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Reply composer */}
            <div className="bg-white border-t border-gray-100 px-4 py-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Textarea
                    ref={replyRef}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    placeholder="Введіть відповідь… (Enter для відправки)"
                    rows={2}
                    className="resize-none text-sm border-gray-100 bg-gray-50 focus:bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    onClick={getAiSuggestion}
                    disabled={aiLoading}
                    className="h-8 bg-indigo-500 hover:bg-indigo-600 text-white gap-1 text-xs"
                    title="AI підказка"
                  >
                    {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">AI</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => sendReply()}
                    disabled={!replyText.trim() || sending}
                    className="h-8 bg-blue-500 hover:bg-blue-600 text-white gap-1 text-xs"
                  >
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">Відправити</span>
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] text-gray-400">Shift+Enter — новий рядок</span>
                <div className="flex gap-1 ml-auto">
                  {["open", "pending", "resolved"].filter(s => s !== selectedConv.status).map(s => (
                    <button key={s} onClick={() => updateStatus(s)} className={`text-[10px] px-2 py-0.5 rounded-full border transition-all hover:opacity-80 ${STATUS_META[s].color}`}>
                      → {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
