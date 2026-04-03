import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, parseISO, differenceInDays } from "date-fns";
import { uk } from "date-fns/locale";
import {
  LayoutDashboard, Users, BedDouble, ArrowDownCircle, ArrowUpCircle, Clock, AlertCircle,
  CheckCircle2, Search, Plus, MessageSquare, ChevronRight, Phone, Mail, Send,
  CreditCard, Banknote, Zap, Star, Home, TreePine, Building2, Tent, MapPin,
  RefreshCw, Bell, Moon, Calendar, DollarSign, Activity, Bot, Sparkles,
  SlidersHorizontal, KeyRound, LogIn, LogOut, ArrowRight, TrendingUp, Layers,
  Inbox, X, Eye, Edit, Check, MoreHorizontal, Hash, UserCheck, Loader2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_BASE = BASE.replace("/maison-hd", "") + "/api";
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API_BASE + path, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

// ─── Helpers ────────────────────────────────────────────────────────────────
const PROP_ICON: Record<string, any> = { hotel: BedDouble, house: Home, villa: Star, apartment: Building2, glamping: TreePine, camping: MapPin, bungalow: Tent };
const PROP_UA: Record<string, string> = { hotel: "Готель", house: "Будинок", villa: "Вілла", apartment: "Апарт.", glamping: "Глемпінг", camping: "Кемпінг", bungalow: "Бунгало" };
const STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-800", checked_in: "bg-green-100 text-green-800",
  checked_out: "bg-gray-100 text-gray-500", pending: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-700",
};
const STATUS_UA: Record<string, string> = {
  pending: "Очікує", confirmed: "Підтверджено", checked_in: "Проживає",
  checked_out: "Виїхав", cancelled: "Скасовано",
};
const HK_UA: Record<string, string> = { dirty: "Потребує прибирання", clean: "Чисто", in_progress: "В процесі", inspected: "Перевірено" };
const HK_DOT: Record<string, string> = { dirty: "bg-red-400", clean: "bg-green-400", in_progress: "bg-amber-400", inspected: "bg-blue-400" };
const SOURCE_UA: Record<string, string> = { direct: "Прямий", booking: "Booking.com", airbnb: "Airbnb", other: "Інший" };
const CHANNEL_ICON: Record<string, string> = { telegram: "💬", instagram: "📷", whatsapp: "🟢", website: "🌐", phone: "📞", email: "📧" };

const fmt = (d: string) => d ? format(parseISO(d), "dd.MM", { locale: uk }) : "";
const fmtFull = (d: string) => d ? format(parseISO(d), "dd MMM", { locale: uk }) : "";
const fmtMoney = (v: number) => Math.round(v).toLocaleString("uk-UA");

// ─── Panel types ─────────────────────────────────────────────────────────────
type Panel = "arrivals" | "departures" | "inhouse" | "pending" | "booking" | "inbox" | "quick_book";

export default function StaffConsolePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePanel, setActivePanel] = useState<Panel>("arrivals");
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Вітаю! Я AI-асистент Staff Console. Що потрібно? Можу перевірити доступність, знайти бронювання, порахувати оплату або підготувати відповідь гостю." }
  ]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<any>(null);
  const [msgInput, setMsgInput] = useState("");
  const [quickBookOpen, setQuickBookOpen] = useState(false);
  const [qbStep, setQbStep] = useState<"guest" | "unit" | "confirm">("guest");
  const [qbForm, setQbForm] = useState({ firstName: "", lastName: "", phone: "", email: "", checkIn: format(new Date(), "yyyy-MM-dd"), checkOut: format(addDays(new Date(), 2), "yyyy-MM-dd"), adults: 1, children: 0, source: "direct", notes: "", unitId: "", paidAmount: 0 });
  const [qbUnits, setQbUnits] = useState<any[]>([]);
  const [qbLoading, setQbLoading] = useState(false);
  const [payDialog, setPayDialog] = useState<{ bookingId: number; total: number; paid: number; name: string } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const aiEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const r = await apiFetch("/console/dashboard");
    if (r.ok) setData(await r.json());
    setLoading(false); setRefreshing(false);
  }, []);

  const loadInbox = async () => {
    const r = await apiFetch("/inbox/conversations");
    if (r.ok) { const d = await r.json(); setConversations(d.conversations || []); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (inboxOpen) loadInbox(); }, [inboxOpen]);
  useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMessages]);

  const refreshData = () => load(true);

  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(() => load(true), 60000);
    return () => clearInterval(t);
  }, [load]);

  const changeStatus = async (id: number, status: string) => {
    const r = await apiFetch(`/console/booking/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (r.ok) { toast({ title: `Статус: ${STATUS_UA[status]}` }); refreshData(); setSelectedBooking(null); }
    else toast({ title: "Помилка", variant: "destructive" });
  };

  const registerPayment = async () => {
    if (!payDialog || !payAmount) return;
    const r = await apiFetch(`/console/booking/${payDialog.bookingId}/payment`, { method: "POST", body: JSON.stringify({ amount: parseFloat(payAmount), method: "cash" }) });
    if (r.ok) { toast({ title: `Оплата ${fmtMoney(parseFloat(payAmount))} ₴ зарахована` }); setPayDialog(null); setPayAmount(""); refreshData(); }
  };

  const loadQbUnits = async () => {
    const r = await apiFetch(`/console/availability?checkIn=${qbForm.checkIn}&checkOut=${qbForm.checkOut}`);
    if (r.ok) { const d = await r.json(); setQbUnits(d.units || []); }
  };

  const createQuickBooking = async () => {
    setQbLoading(true);
    const r = await apiFetch("/console/quick-booking", { method: "POST", body: JSON.stringify(qbForm) });
    if (r.ok) {
      const d = await r.json();
      toast({ title: `✅ ${d.booking.booking_ref} — ${d.unitName}`, description: `${qbForm.firstName} ${qbForm.lastName}` });
      setQuickBookOpen(false); setQbStep("guest");
      setQbForm({ firstName: "", lastName: "", phone: "", email: "", checkIn: format(new Date(), "yyyy-MM-dd"), checkOut: format(addDays(new Date(), 2), "yyyy-MM-dd"), adults: 1, children: 0, source: "direct", notes: "", unitId: "", paidAmount: 0 });
      refreshData();
    } else toast({ title: "Помилка при бронюванні", variant: "destructive" });
    setQbLoading(false);
  };

  const aiSend = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput; setAiInput("");
    setAiMessages(m => [...m, { role: "user", text: userMsg }]);
    // Contextual AI based on data
    const kpis = data?.kpis || {};
    let reply = "";
    const q = userMsg.toLowerCase();
    if (q.includes("вільн") || q.includes("доступн")) {
      reply = `Сьогодні вільних номерів/об'єктів: ${kpis.free_units || 0}. ${kpis.arrivals_today > 0 ? `Сьогодні очікуємо ${kpis.arrivals_today} заїздів.` : "Нових заїздів сьогодні немає."} Хочете забронювати конкретний об'єкт?`;
    } else if (q.includes("оплат") || q.includes("борг")) {
      reply = `Непідтверджені оплати: ${kpis.unpaid || 0} бронювань. Борги гостей що зараз проживають: перевіряю... Хочете список?`;
    } else if (q.includes("заїзд") || q.includes("arrival")) {
      const arr = data?.arrivals || [];
      if (arr.length === 0) reply = "Сьогодні заїздів немає.";
      else reply = `Сьогодні ${arr.length} заїздів:\n${arr.map((a: any) => `• ${a.first_name} ${a.last_name} — ${a.unit_name} о ${a.checkin_time}`).join("\n")}`;
    } else if (q.includes("виїзд") || q.includes("checkout")) {
      const dep = data?.departures || [];
      if (dep.length === 0) reply = "Сьогодні виїздів немає.";
      else reply = `Сьогодні ${dep.length} виїздів:\n${dep.map((d: any) => `• ${d.first_name} ${d.last_name} — ${d.unit_name} о ${d.checkout_time}`).join("\n")}`;
    } else if (q.includes("дякую") || q.includes("дякуємо")) {
      reply = "Будь ласка! Якщо щось ще потрібно — звертайтеся. 😊";
    } else if (q.includes("гостей") || q.includes("проживає")) {
      reply = `Зараз проживає ${kpis.in_house || 0} бронювань. Виїздить сьогодні: ${kpis.departures_today || 0}.`;
    } else {
      reply = `Зрозумів: «${userMsg}». Я можу допомогти з: ✓ Перевірка вільних номерів ✓ Список заїздів/виїздів ✓ Статус оплат ✓ Швидке бронювання. Що конкретно потрібно?`;
    }
    setTimeout(() => setAiMessages(m => [...m, { role: "ai", text: reply }]), 600);
  };

  const kpis = data?.kpis || {};
  const arrivals = data?.arrivals || [];
  const departures = data?.departures || [];
  const inHouse = data?.inHouse || [];
  const pending = data?.pending || [];
  const alerts = data?.alerts || [];
  const hk = data?.housekeeping || [];
  const upcoming = data?.upcoming || [];

  const panelData: Record<string, any[]> = { arrivals, departures, inhouse: inHouse, pending };
  const filtered = (list: any[]) => {
    if (!searchQ) return list;
    return list.filter(b => `${b.first_name} ${b.last_name} ${b.phone} ${b.unit_name} ${b.booking_ref}`.toLowerCase().includes(searchQ.toLowerCase()));
  };

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto" />
          <p className="text-gray-500 text-sm">Завантаження Staff Console…</p>
        </div>
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-0px)] overflow-hidden bg-gray-50">

        {/* ─── TOP STATUS BAR ───────────────────────────────────────────── */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Live dot */}
            <div className="flex items-center gap-1.5 mr-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <span className="text-xs font-semibold text-gray-700">Staff Console</span>
              <span className="text-xs text-gray-400">{format(new Date(), "HH:mm, dd MMM", { locale: uk })}</span>
            </div>

            <div className="h-4 w-px bg-gray-200 mx-1" />

            {/* KPI pills */}
            {[
              { icon: LogIn, label: "Заїзди", val: kpis.arrivals_today || 0, color: "text-blue-600", bg: "bg-blue-50", panel: "arrivals" as Panel },
              { icon: LogOut, label: "Виїзди", val: kpis.departures_today || 0, color: "text-purple-600", bg: "bg-purple-50", panel: "departures" as Panel },
              { icon: Users, label: "Проживають", val: kpis.in_house || 0, color: "text-green-600", bg: "bg-green-50", panel: "inhouse" as Panel },
              { icon: BedDouble, label: "Вільних", val: kpis.free_units || 0, color: "text-gray-600", bg: "bg-gray-50", panel: "arrivals" as Panel },
              { icon: Clock, label: "Очікує", val: kpis.pending_confirm || 0, color: "text-amber-600", bg: "bg-amber-50", panel: "pending" as Panel },
            ].map(k => (
              <button key={k.label} onClick={() => setActivePanel(k.panel)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${activePanel === k.panel ? k.bg + " ring-1 ring-current " + k.color : "hover:" + k.bg + " text-gray-600"}`}>
                <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
                <span>{k.val}</span>
                <span className="text-gray-400 font-normal hidden sm:inline">{k.label}</span>
              </button>
            ))}

            <div className="h-4 w-px bg-gray-200 mx-1" />

            {/* Revenue today */}
            <div className="flex items-center gap-1 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full">
              <TrendingUp className="h-3.5 w-3.5" />
              {fmtMoney(kpis.revenue_today || 0)} ₴
              <span className="text-gray-400 font-normal hidden sm:inline">сьогодні</span>
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2.5 py-1 rounded-full animate-pulse">
                <AlertCircle className="h-3.5 w-3.5" />
                {alerts.length} сповіщень
              </div>
            )}

            {/* Actions */}
            <div className="ml-auto flex items-center gap-1.5">
              {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
              <button onClick={refreshData} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                <RefreshCw className="h-4 w-4" />
              </button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setInboxOpen(true); }}>
                <MessageSquare className="h-3.5 w-3.5 mr-1 text-blue-500" /> Inbox
                {conversations.filter(c => c.unread_count > 0).length > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full px-1 font-bold">{conversations.filter(c => c.unread_count > 0).length}</span>
                )}
              </Button>
              <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => { setQuickBookOpen(true); setQbStep("guest"); }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Бронювання
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAiOpen(v => !v)}>
                <Bot className="h-3.5 w-3.5 mr-1 text-purple-500" /> AI
              </Button>
            </div>
          </div>
        </div>

        {/* ─── MAIN BODY ───────────────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ─── LEFT PANEL — Navigation tabs ─── */}
          <div className="w-48 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto hidden md:flex">
            <div className="p-3 space-y-0.5">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold px-2 mb-2">Сьогодні</p>
              {[
                { id: "arrivals" as Panel, label: "Заїзди", icon: LogIn, count: arrivals.length, color: "text-blue-600" },
                { id: "departures" as Panel, label: "Виїзди", icon: LogOut, count: departures.length, color: "text-purple-600" },
                { id: "inhouse" as Panel, label: "Проживають", icon: UserCheck, count: inHouse.length, color: "text-green-600" },
                { id: "pending" as Panel, label: "Очікують", icon: Clock, count: pending.length, color: "text-amber-600" },
              ].map(item => (
                <button key={item.id} onClick={() => setActivePanel(item.id)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm transition-all ${activePanel === item.id ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}>
                  <span className="flex items-center gap-2">
                    <item.icon className={`h-4 w-4 ${activePanel === item.id ? item.color : "text-gray-400"}`} />
                    {item.label}
                  </span>
                  {item.count > 0 && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activePanel === item.id ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>{item.count}</span>
                  )}
                </button>
              ))}

              <div className="pt-3 mt-1 border-t border-gray-100">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold px-2 mb-2">Стани</p>
                {hk.map((h: any) => (
                  <div key={h.housekeeping_status} className="flex items-center justify-between px-2.5 py-1.5 text-xs text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${HK_DOT[h.housekeeping_status] || "bg-gray-300"}`} />
                      {HK_UA[h.housekeeping_status] || h.housekeeping_status}
                    </span>
                    <span className="font-semibold">{h.count}</span>
                  </div>
                ))}
              </div>

              {/* Upcoming arrivals mini-calendar */}
              {upcoming.length > 0 && (
                <div className="pt-3 mt-1 border-t border-gray-100">
                  <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold px-2 mb-2">Наступні 7 днів</p>
                  {upcoming.map((u: any) => (
                    <div key={u.date} className="flex items-center justify-between px-2.5 py-1 text-xs">
                      <span className="text-gray-500">{fmt(u.date)}</span>
                      <div className="flex items-center gap-1">
                        <div className="bg-blue-200 rounded-full h-1.5" style={{ width: `${Math.min(u.count * 8, 48)}px` }} />
                        <span className="text-gray-700 font-medium">{u.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Alerts */}
              {alerts.length > 0 && (
                <div className="pt-3 mt-1 border-t border-gray-100">
                  <p className="text-[10px] uppercase tracking-widest text-red-400 font-semibold px-2 mb-1">⚠ Сповіщення</p>
                  {alerts.map((a: any, i: number) => (
                    <div key={i} className="px-2.5 py-1.5 text-xs">
                      <p className="text-red-700 font-medium truncate">{a.guest}</p>
                      <p className="text-gray-400">{a.type === "unpaid_checkedin" ? `Борг: ${fmtMoney(a.amount_due)} ₴` : "Прострочений виїзд"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─── CENTER PANEL — Main workspace ─── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search bar */}
            <div className="flex-shrink-0 p-3 border-b border-gray-200 bg-white flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input className="pl-9 h-9 text-sm" placeholder="Пошук гостя, номера, телефону…" value={searchQ} onChange={e => setSearchQ(e.target.value)} />
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-xs text-gray-400">{
                  activePanel === "arrivals" ? `${arrivals.length} заїздів` :
                  activePanel === "departures" ? `${departures.length} виїздів` :
                  activePanel === "inhouse" ? `${inHouse.length} проживають` :
                  `${pending.length} очікують підтвердження`
                }</span>
                {/* Mobile panel switcher */}
                <div className="flex md:hidden gap-1">
                  {(["arrivals","departures","inhouse","pending"] as Panel[]).map(p => (
                    <button key={p} onClick={() => setActivePanel(p)}
                      className={`px-2 py-1 text-xs rounded-md ${activePanel === p ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                      {p === "arrivals" ? "↓" : p === "departures" ? "↑" : p === "inhouse" ? "🏠" : "⏳"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Booking list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {activePanel === "arrivals" && arrivals.length === 0 && (
                <EmptyState icon={LogIn} title="Заїздів сьогодні немає" sub="Бронювань на сьогодні з підтвердженим заїздом не знайдено" />
              )}
              {activePanel === "departures" && departures.length === 0 && (
                <EmptyState icon={LogOut} title="Виїздів сьогодні немає" sub="Гостей що мають виїхати сьогодні не знайдено" />
              )}
              {activePanel === "inhouse" && inHouse.length === 0 && (
                <EmptyState icon={UserCheck} title="Наразі ніхто не проживає" sub="Всі гості виїхали або ще не заїхали" />
              )}
              {activePanel === "pending" && pending.length === 0 && (
                <EmptyState icon={Clock} title="Очікуючих немає" sub="Всі бронювання підтверджено" />
              )}

              {filtered(panelData[activePanel] || []).map((b: any) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  panel={activePanel}
                  onSelect={() => setSelectedBooking(b)}
                  onCheckin={() => changeStatus(b.id, "checked_in")}
                  onCheckout={() => changeStatus(b.id, "checked_out")}
                  onConfirm={() => changeStatus(b.id, "confirmed")}
                  onPay={() => { setPayDialog({ bookingId: b.id, total: parseFloat(b.total_amount || 0), paid: parseFloat(b.paid_amount || 0), name: `${b.first_name} ${b.last_name}` }); setPayAmount(""); }}
                />
              ))}
            </div>
          </div>

          {/* ─── RIGHT PANEL — Detail / AI ─── */}
          {(selectedBooking || aiOpen) && (
            <div className="w-80 xl:w-96 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
              {selectedBooking && (
                <BookingDetailPanel
                  booking={selectedBooking}
                  onClose={() => setSelectedBooking(null)}
                  onCheckin={() => changeStatus(selectedBooking.id, "checked_in")}
                  onCheckout={() => changeStatus(selectedBooking.id, "checked_out")}
                  onConfirm={() => changeStatus(selectedBooking.id, "confirmed")}
                  onCancel={() => changeStatus(selectedBooking.id, "cancelled")}
                  onPay={() => { setPayDialog({ bookingId: selectedBooking.id, total: parseFloat(selectedBooking.total_amount || 0), paid: parseFloat(selectedBooking.paid_amount || 0), name: `${selectedBooking.first_name} ${selectedBooking.last_name}` }); setPayAmount(""); }}
                  navigate={navigate}
                />
              )}
              {!selectedBooking && aiOpen && (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">AI Асистент</p>
                        <p className="text-[10px] text-green-500 font-medium">● онлайн</p>
                      </div>
                    </div>
                    <button onClick={() => setAiOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                      <X className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {aiMessages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        {m.role === "ai" && (
                          <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center mr-2 flex-shrink-0 mt-1">
                            <Sparkles className="h-3 w-3 text-purple-600" />
                          </div>
                        )}
                        <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${m.role === "user" ? "bg-blue-600 text-white rounded-tr-sm" : "bg-gray-100 text-gray-800 rounded-tl-sm"}`}>
                          {m.text}
                        </div>
                      </div>
                    ))}
                    <div ref={aiEndRef} />
                  </div>
                  {/* Quick suggestions */}
                  <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
                    {["Вільні номери сьогодні", "Список заїздів", "Непоплачені бронювання"].map(s => (
                      <button key={s} onClick={() => { setAiInput(s); }} className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full border border-purple-200 hover:bg-purple-100 transition">
                        {s}
                      </button>
                    ))}
                  </div>
                  <div className="flex-shrink-0 p-3 border-t border-gray-100">
                    <div className="flex gap-2">
                      <Input placeholder="Запит до AI…" value={aiInput} onChange={e => setAiInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && aiSend()} className="text-sm h-9" />
                      <Button size="sm" onClick={aiSend} className="bg-purple-600 hover:bg-purple-700 h-9">
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── INBOX DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={inboxOpen} onOpenChange={setInboxOpen}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-5 w-5 text-blue-500" /> Unified Inbox
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-1 overflow-hidden">
            {/* Conversations list */}
            <div className="w-56 border-r border-gray-100 overflow-y-auto flex-shrink-0">
              {conversations.length === 0 && (
                <div className="p-4 text-center text-gray-400 text-sm">Повідомлень немає</div>
              )}
              {conversations.map(c => (
                <button key={c.id} onClick={() => setActiveConv(c)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition ${activeConv?.id === c.id ? "bg-blue-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{CHANNEL_ICON[c.channel] || "💬"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{c.guest_name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{c.last_message_preview || c.subject}</p>
                    </div>
                    {c.unread_count > 0 && (
                      <span className="bg-blue-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold flex-shrink-0">{c.unread_count}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {/* Conversation messages */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {!activeConv ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                  <div className="text-center">
                    <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    Оберіть розмову
                  </div>
                </div>
              ) : (
                <>
                  <div className="px-4 py-2.5 border-b border-gray-100 flex-shrink-0 bg-gray-50">
                    <p className="text-sm font-semibold">{activeConv.guest_name}</p>
                    <p className="text-xs text-gray-500">{activeConv.guest_phone} · {activeConv.channel}</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {(activeConv.messages || []).map((m: any, i: number) => (
                      <div key={i} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${m.direction === "outbound" ? "bg-blue-600 text-white rounded-tr-sm" : "bg-gray-100 text-gray-800 rounded-tl-sm"}`}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Quick actions for inbox */}
                  <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => { setInboxOpen(false); setQuickBookOpen(true); setQbStep("guest"); setQbForm(f => ({ ...f, firstName: activeConv.guest_name?.split(" ")[0] || "", lastName: activeConv.guest_name?.split(" ")[1] || "", phone: activeConv.guest_phone || "" })); }}>
                      <Plus className="h-3 w-3 mr-1" /> Забронювати
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7"><Phone className="h-3 w-3 mr-1" /> Зателефонувати</Button>
                  </div>
                  <div className="flex-shrink-0 p-3 border-t border-gray-100">
                    <div className="flex gap-2">
                      <Input placeholder="Відповісти…" value={msgInput} onChange={e => setMsgInput(e.target.value)} className="text-sm h-9" />
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-9"><Send className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── QUICK BOOKING DIALOG ─────────────────────────────────────────── */}
      <Dialog open={quickBookOpen} onOpenChange={v => { setQuickBookOpen(v); if (!v) setQbStep("guest"); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-500" />
              Швидке бронювання
              <div className="ml-auto flex gap-1">
                {["guest","unit","confirm"].map((s, i) => (
                  <div key={s} className={`h-1.5 w-8 rounded-full ${qbStep === s ? "bg-blue-600" : i < ["guest","unit","confirm"].indexOf(qbStep) ? "bg-blue-300" : "bg-gray-200"}`} />
                ))}
              </div>
            </DialogTitle>
          </DialogHeader>

          {qbStep === "guest" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Крок 1: Дані гостя та дати</p>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Ім'я *</Label><Input placeholder="Олена" value={qbForm.firstName} onChange={e => setQbForm(f => ({ ...f, firstName: e.target.value }))} /></div>
                <div><Label className="text-xs">Прізвище</Label><Input placeholder="Коваль" value={qbForm.lastName} onChange={e => setQbForm(f => ({ ...f, lastName: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Телефон</Label><Input placeholder="+38050…" value={qbForm.phone} onChange={e => setQbForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><Label className="text-xs">Email</Label><Input type="email" value={qbForm.email} onChange={e => setQbForm(f => ({ ...f, email: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Заїзд *</Label><Input type="date" value={qbForm.checkIn} onChange={e => setQbForm(f => ({ ...f, checkIn: e.target.value }))} /></div>
                <div><Label className="text-xs">Виїзд *</Label><Input type="date" value={qbForm.checkOut} onChange={e => setQbForm(f => ({ ...f, checkOut: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Дорослі</Label><Input type="number" min={1} value={qbForm.adults} onChange={e => setQbForm(f => ({ ...f, adults: parseInt(e.target.value) }))} /></div>
                <div><Label className="text-xs">Діти</Label><Input type="number" min={0} value={qbForm.children} onChange={e => setQbForm(f => ({ ...f, children: parseInt(e.target.value) }))} /></div>
                <div><Label className="text-xs">Джерело</Label>
                  <Select value={qbForm.source} onValueChange={v => setQbForm(f => ({ ...f, source: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SOURCE_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={async () => { await loadQbUnits(); setQbStep("unit"); }}
                disabled={!qbForm.firstName || !qbForm.checkIn || !qbForm.checkOut}>
                Далі — вибрати об'єкт <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {qbStep === "unit" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Крок 2: Вибір об'єкту на {fmt(qbForm.checkIn)}–{fmt(qbForm.checkOut)} ({differenceInDays(parseISO(qbForm.checkOut), parseISO(qbForm.checkIn))} н.)</p>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {qbUnits.filter(u => u.is_available).map(u => {
                  const Icon = PROP_ICON[u.property_type] || Home;
                  const nights = differenceInDays(parseISO(qbForm.checkOut), parseISO(qbForm.checkIn));
                  return (
                    <button key={u.id} onClick={() => setQbForm(f => ({ ...f, unitId: String(u.id) }))}
                      className={`w-full text-left p-3 rounded-xl border-2 transition-all ${qbForm.unitId === String(u.id) ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="text-sm font-semibold">{u.name}</p>
                            <p className="text-xs text-gray-500">{u.property_name} · {u.capacity} ос.</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-blue-700">{fmtMoney(parseFloat(u.base_price) * nights)} ₴</p>
                          <p className="text-xs text-gray-400">{fmtMoney(parseFloat(u.base_price))} ₴/ніч</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {qbUnits.filter(u => u.is_available).length === 0 && (
                  <div className="text-center py-6 text-gray-400 text-sm">На ці дати вільних об'єктів немає</div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setQbStep("guest")}>← Назад</Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={!qbForm.unitId} onClick={() => setQbStep("confirm")}>
                  Підтвердити <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {qbStep === "confirm" && (() => {
            const unit = qbUnits.find(u => String(u.id) === qbForm.unitId);
            const nights = differenceInDays(parseISO(qbForm.checkOut), parseISO(qbForm.checkIn));
            const total = parseFloat(unit?.base_price || "0") * nights;
            return (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">Крок 3: Підтвердження бронювання</p>
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Гість</span><span className="font-medium">{qbForm.firstName} {qbForm.lastName}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Телефон</span><span>{qbForm.phone || "—"}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Об'єкт</span><span className="font-medium">{unit?.name} · {unit?.property_name}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Дати</span><span>{fmt(qbForm.checkIn)} → {fmt(qbForm.checkOut)} ({nights} н.)</span></div>
                  <div className="flex justify-between text-sm font-bold border-t border-gray-200 pt-2"><span>Сума</span><span className="text-blue-700">{fmtMoney(total)} ₴</span></div>
                </div>
                <div><Label className="text-xs">Передоплата (₴)</Label><Input type="number" min={0} max={total} value={qbForm.paidAmount} onChange={e => setQbForm(f => ({ ...f, paidAmount: parseFloat(e.target.value) || 0 }))} /></div>
                <div><Label className="text-xs">Нотатки</Label><Textarea rows={2} value={qbForm.notes} onChange={e => setQbForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setQbStep("unit")}>← Назад</Button>
                  <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={createQuickBooking} disabled={qbLoading}>
                    {qbLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                    Забронювати
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── PAYMENT DIALOG ──────────────────────────────────────────────── */}
      <Dialog open={!!payDialog} onOpenChange={() => setPayDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-green-600" /> Реєстрація оплати</DialogTitle></DialogHeader>
          {payDialog && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">{payDialog.name}</p>
              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Сума до сплати</span><span className="font-bold text-blue-700">{fmtMoney(payDialog.total)} ₴</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Вже оплачено</span><span className="text-green-600">{fmtMoney(payDialog.paid)} ₴</span></div>
                <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1.5"><span>Залишок</span><span className="text-red-600">{fmtMoney(payDialog.total - payDialog.paid)} ₴</span></div>
              </div>
              <div>
                <Label>Сума до зарахування (₴) *</Label>
                <Input type="number" placeholder="0" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="text-lg font-bold" />
              </div>
              <div className="flex gap-2">
                {[payDialog.total - payDialog.paid, Math.round((payDialog.total - payDialog.paid) / 2), 500, 1000].filter(v => v > 0).map(v => (
                  <button key={v} onClick={() => setPayAmount(String(v))}
                    className="flex-1 text-xs py-1.5 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 rounded-lg font-medium transition">
                    {fmtMoney(v)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPayDialog(null)}>Скасувати</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={registerPayment} disabled={!payAmount}>
                  <Check className="h-4 w-4 mr-1" /> Зарахувати
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ─── Booking Card Component ───────────────────────────────────────────────────
function BookingCard({ booking: b, panel, onSelect, onCheckin, onCheckout, onConfirm, onPay }: any) {
  const nights = b.nights_remaining || differenceInDays(parseISO(b.check_out), parseISO(b.check_in));
  const Icon = PROP_ICON[b.property_type] || Home;
  const debtAmount = parseFloat(b.total_amount || 0) - parseFloat(b.paid_amount || 0);
  const hasDebt = debtAmount > 10;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          {/* Status bar */}
          <div className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${b.status === "checked_in" ? "bg-green-400" : b.status === "confirmed" ? "bg-blue-400" : b.status === "pending" ? "bg-amber-400" : "bg-gray-300"}`} />

          <div className="flex-1 min-w-0">
            {/* Guest name + status */}
            <div className="flex items-center gap-2 flex-wrap">
              <button className="font-semibold text-gray-900 text-sm hover:text-blue-600 transition" onClick={onSelect}>
                {b.first_name} {b.last_name}
              </button>
              <Badge className={`text-[10px] px-1.5 py-0.5 border-0 ${STATUS_COLOR[b.status]}`}>{STATUS_UA[b.status]}</Badge>
              {hasDebt && <Badge className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 border-0">💳 Борг {Math.round(debtAmount).toLocaleString()} ₴</Badge>}
              {panel === "inhouse" && b.nights_remaining <= 1 && (
                <Badge className="text-[10px] px-1.5 py-0.5 bg-orange-50 text-orange-700 border-0">⚡ Виїзд завтра</Badge>
              )}
            </div>

            {/* Room + property */}
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-500">
              <Icon className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-medium text-gray-700">{b.unit_name}</span>
              <span>·</span>
              <span>{b.property_name}</span>
              {b.source && <><span>·</span><span>{SOURCE_UA[b.source] || b.source}</span></>}
            </div>

            {/* Dates */}
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {panel === "arrivals" ? `Заїзд о ${b.checkin_time || "14:00"}` :
                 panel === "departures" ? `Виїзд о ${b.checkout_time || "12:00"}` :
                 panel === "inhouse" ? `${fmtFull(b.check_in)} → ${fmtFull(b.check_out)} · ще ${nights} н.` :
                 `${fmtFull(b.check_in)} → ${fmtFull(b.check_out)}`}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {b.adults || b.guests_count || 1} ос.
              </span>
              {b.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{b.phone}</span>}
            </div>
          </div>

          {/* Amount + quick actions */}
          <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
            <div className="text-right">
              <p className="text-sm font-bold text-gray-800">{fmtMoney(parseFloat(b.total_amount || 0))} ₴</p>
              <p className={`text-[10px] ${b.payment_status === "paid" ? "text-green-600" : b.payment_status === "partial" ? "text-amber-600" : "text-red-500"}`}>
                {b.payment_status === "paid" ? "✓ Оплачено" : b.payment_status === "partial" ? `Часткова: ${fmtMoney(parseFloat(b.paid_amount || 0))} ₴` : "Не оплачено"}
              </p>
            </div>
            <div className="flex gap-1">
              {panel === "arrivals" && (
                <button onClick={onCheckin} className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-lg text-[11px] font-semibold hover:bg-green-100 transition">
                  <LogIn className="h-3 w-3" /> Check-in
                </button>
              )}
              {panel === "departures" && (
                <button onClick={onCheckout} className="flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded-lg text-[11px] font-semibold hover:bg-purple-100 transition">
                  <LogOut className="h-3 w-3" /> Check-out
                </button>
              )}
              {panel === "pending" && (
                <button onClick={onConfirm} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-[11px] font-semibold hover:bg-blue-100 transition">
                  <Check className="h-3 w-3" /> Підтвердити
                </button>
              )}
              {hasDebt && (
                <button onClick={onPay} className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-semibold hover:bg-emerald-100 transition">
                  <Banknote className="h-3 w-3" /> Оплата
                </button>
              )}
              <button onClick={onSelect} className="p-1 bg-gray-50 text-gray-400 rounded-lg hover:bg-gray-100 transition">
                <Eye className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Booking Detail Panel ─────────────────────────────────────────────────────
function BookingDetailPanel({ booking: b, onClose, onCheckin, onCheckout, onConfirm, onCancel, onPay, navigate }: any) {
  const Icon = PROP_ICON[b.property_type] || Home;
  const debt = parseFloat(b.total_amount || 0) - parseFloat(b.paid_amount || 0);
  const nights = differenceInDays(parseISO(b.check_out), parseISO(b.check_in));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div>
          <p className="font-semibold text-sm">{b.first_name} {b.last_name}</p>
          <p className="text-[11px] text-gray-400 font-mono">{b.booking_ref}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => navigate(`/bookings`)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <ArrowRight className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Status badge */}
        <Badge className={`${STATUS_COLOR[b.status]} border-0`}>{STATUS_UA[b.status]}</Badge>

        {/* Room */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center gap-2 mb-2">
            <Icon className="h-4 w-4 text-gray-400" />
            <span className="font-semibold text-sm">{b.unit_name}</span>
          </div>
          <DRow label="Об'єкт" value={b.property_name} />
          <DRow label="Заїзд" value={`${b.check_in} о ${b.checkin_time || "14:00"}`} />
          <DRow label="Виїзд" value={`${b.check_out} о ${b.checkout_time || "12:00"}`} />
          <DRow label="Тривалість" value={`${nights} ночей`} />
          <DRow label="Гостей" value={`${b.adults || 1} дорослих${b.children_under_6 || b.children_over_6 ? ` + ${(b.children_under_6||0)+(b.children_over_6||0)} дітей` : ""}`} />
          <DRow label="Джерело" value={SOURCE_UA[b.source] || b.source} />
        </div>

        {/* Contacts */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
          {b.phone && (
            <a href={`tel:${b.phone}`} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
              <Phone className="h-3.5 w-3.5" /> {b.phone}
            </a>
          )}
          {b.email && (
            <a href={`mailto:${b.email}`} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
              <Mail className="h-3.5 w-3.5" /> {b.email}
            </a>
          )}
        </div>

        {/* Payment */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
          <DRow label="Сума" value={`${fmtMoney(parseFloat(b.total_amount||0))} ₴`} bold />
          <DRow label="Оплачено" value={`${fmtMoney(parseFloat(b.paid_amount||0))} ₴`} />
          {debt > 10 && <DRow label="Борг" value={`${fmtMoney(debt)} ₴`} red />}
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
            <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${Math.min(100, (parseFloat(b.paid_amount||0) / parseFloat(b.total_amount||1)) * 100)}%` }} />
          </div>
        </div>

        {/* Notes */}
        {b.notes && (
          <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-800">{b.notes}</div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Дії</p>
          <div className="grid grid-cols-2 gap-2">
            {b.status !== "checked_in" && b.status !== "checked_out" && b.status !== "cancelled" && (
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-xs h-8" onClick={onCheckin}>
                <LogIn className="h-3.5 w-3.5 mr-1" /> Check-in
              </Button>
            )}
            {b.status === "checked_in" && (
              <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-xs h-8" onClick={onCheckout}>
                <LogOut className="h-3.5 w-3.5 mr-1" /> Check-out
              </Button>
            )}
            {b.status === "pending" && (
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs h-8" onClick={onConfirm}>
                <Check className="h-3.5 w-3.5 mr-1" /> Підтвердити
              </Button>
            )}
            {debt > 0 && b.status !== "cancelled" && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs h-8" onClick={onPay}>
                <Banknote className="h-3.5 w-3.5 mr-1" /> Зарахувати
              </Button>
            )}
            {b.status !== "cancelled" && b.status !== "checked_in" && b.status !== "checked_out" && (
              <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 text-xs h-8" onClick={onCancel}>
                <X className="h-3.5 w-3.5 mr-1" /> Скасувати
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DRow({ label, value, bold, red }: { label: string; value: string; bold?: boolean; red?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${bold ? "text-blue-700 font-bold" : red ? "text-red-600 font-bold" : "text-gray-800"}`}>{value}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, sub }: { icon: any; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-12 w-12 text-gray-200 mb-3" />
      <p className="font-medium text-gray-600">{title}</p>
      <p className="text-sm text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
