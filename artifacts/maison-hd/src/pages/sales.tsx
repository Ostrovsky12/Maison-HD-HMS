import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Phone, MessageSquare, Instagram, Globe, ExternalLink, Star,
  TrendingUp, TrendingDown, Users, Target, Zap, Mail, Send,
  Plus, ChevronRight, RefreshCw, Copy, Check, Clock,
  ArrowRight, DollarSign, BarChart2, Award, Repeat, Filter,
  Bot, Loader2, ChevronDown, X, Calendar, Edit, Trash2,
  Radio, BookOpen, ShoppingCart, Gift, Megaphone, Layers,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { uk } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const tok = () => localStorage.getItem("hms_token") || "";
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

// ── Types ─────────────────────────────────────────────────────────────────────
type Lead = {
  id: number; source: string; status: string; first_name: string; last_name: string;
  email?: string; phone?: string; subject?: string; notes?: string; priority: string;
  ai_score?: number; estimated_value?: string; quoted_amount?: string;
  check_in_date?: string; check_out_date?: string; guests_count?: number;
  follow_up_at?: string; created_at: string; assigned_name?: string;
};
type Campaign = {
  id: number; name: string; description?: string; type: string; status: string;
  target_segment: string; subject?: string; message_template: string;
  offer_code?: string; discount_pct?: string;
  sent_count: number; opened_count: number; clicked_count: number;
  booked_count: number; revenue_generated: string; scheduled_at?: string; sent_at?: string;
};
type Upsell = {
  id: number; offer_type: string; title: string; description?: string;
  price?: string; status: string; booking_ref?: string; guest_name?: string;
  check_in?: string; channel: string; created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const SOURCE_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  phone: { label: "Телефон", color: "text-green-700", bg: "bg-green-100", icon: <Phone className="w-3.5 h-3.5" /> },
  telegram: { label: "Telegram", color: "text-blue-700", bg: "bg-blue-100", icon: <MessageSquare className="w-3.5 h-3.5" /> },
  instagram: { label: "Instagram", color: "text-pink-700", bg: "bg-pink-100", icon: <Instagram className="w-3.5 h-3.5" /> },
  website: { label: "Сайт", color: "text-indigo-700", bg: "bg-indigo-100", icon: <Globe className="w-3.5 h-3.5" /> },
  booking_com: { label: "Booking.com", color: "text-blue-800", bg: "bg-blue-100", icon: <BookOpen className="w-3.5 h-3.5" /> },
  airbnb: { label: "Airbnb", color: "text-red-700", bg: "bg-red-100", icon: <Layers className="w-3.5 h-3.5" /> },
  direct: { label: "Прямий", color: "text-emerald-700", bg: "bg-emerald-100", icon: <ArrowRight className="w-3.5 h-3.5" /> },
  repeat: { label: "Повторний", color: "text-purple-700", bg: "bg-purple-100", icon: <Repeat className="w-3.5 h-3.5" /> },
  referral: { label: "Рекомендація", color: "text-orange-700", bg: "bg-orange-100", icon: <Users className="w-3.5 h-3.5" /> },
  other: { label: "Інше", color: "text-gray-700", bg: "bg-gray-100", icon: <Radio className="w-3.5 h-3.5" /> },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "Новий", color: "text-blue-700", bg: "bg-blue-100" },
  contacted: { label: "Контактували", color: "text-indigo-700", bg: "bg-indigo-100" },
  qualified: { label: "Кваліфіковано", color: "text-purple-700", bg: "bg-purple-100" },
  quote_sent: { label: "КП відправлено", color: "text-amber-700", bg: "bg-amber-100" },
  negotiating: { label: "Переговори", color: "text-orange-700", bg: "bg-orange-100" },
  booked: { label: "Заброньовано", color: "text-green-700", bg: "bg-green-100" },
  lost: { label: "Програно", color: "text-red-700", bg: "bg-red-100" },
  spam: { label: "Спам", color: "text-gray-500", bg: "bg-gray-100" },
};

const PIPELINE_STATUSES = ["new", "contacted", "qualified", "quote_sent", "negotiating", "booked"];

const fmt = (v: string | number | null | undefined, decimals = 0) =>
  v == null ? "—" : Number(v).toLocaleString("uk-UA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

function SourceBadge({ source }: { source: string }) {
  const m = SOURCE_META[source] || SOURCE_META.other;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.bg} ${m.color}`}>
      {m.icon}{m.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] || { label: status, color: "text-gray-600", bg: "bg-gray-100" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.bg} ${m.color}`}>{m.label}</span>;
}

function ScoreBadge({ score }: { score?: number }) {
  if (!score) return null;
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : "bg-red-400";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white ${color}`}>
      <Zap className="w-3 h-3" />{score}
    </span>
  );
}

// ── TABS ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview", label: "Огляд", icon: BarChart2 },
  { id: "leads", label: "CRM Ліди", icon: Target },
  { id: "upsell", label: "Upsell & Повторні", icon: Gift },
  { id: "campaigns", label: "Кампанії", icon: Megaphone },
  { id: "channels", label: "Канали & Віджет", icon: Layers },
] as const;

type TabId = typeof TABS[number]["id"];

// ══════════════════════════════════════════════════════════════════════════════
export default function SalesPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const [summary, setSummary] = useState<any>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [channelData, setChannelData] = useState<any>(null);
  const [widgetData, setWidgetData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [leadFilter, setLeadFilter] = useState({ status: "", source: "", search: "" });
  const [aiTyping, setAiTyping] = useState<number | null>(null);
  const [copiedWidget, setCopiedWidget] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [newLead, setNewLead] = useState({ firstName: "", lastName: "", phone: "", email: "", source: "phone", subject: "", estimatedValue: "", checkIn: "", checkOut: "", guestsCount: "2", priority: "medium", notes: "" });
  const [showAddCampaign, setShowAddCampaign] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", type: "email", targetSegment: "all", subject: "", messageTemplate: "", offerCode: "", discountPct: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, l, c, u, ch, w] = await Promise.all([
        authFetch(`${API}/sales/summary`).then(r => r.json()),
        authFetch(`${API}/sales/leads`).then(r => r.json()),
        authFetch(`${API}/sales/campaigns`).then(r => r.json()),
        authFetch(`${API}/sales/upsells`).then(r => r.json()),
        authFetch(`${API}/sales/channels`).then(r => r.json()),
        authFetch(`${API}/sales/widget`).then(r => r.json()),
      ]);
      setSummary(s);
      setLeads(l.leads || []);
      setCampaigns(c.campaigns || []);
      setUpsells(u.upsells || []);
      setChannelData(ch);
      setWidgetData(w);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredLeads = leads.filter(l => {
    if (leadFilter.status && l.status !== leadFilter.status) return false;
    if (leadFilter.source && l.source !== leadFilter.source) return false;
    if (leadFilter.search) {
      const q = leadFilter.search.toLowerCase();
      return [l.first_name, l.last_name, l.email, l.phone, l.subject].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  });

  // ── Update lead status ─────────────────────────────────────────────────────
  const updateLead = async (id: number, data: any) => {
    await authFetch(`${API}/sales/leads/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...data } : l));
    toast({ title: "Лід оновлено" });
  };

  // ── AI suggest reply ───────────────────────────────────────────────────────
  const aiSuggest = async (leadId: number) => {
    setAiTyping(leadId);
    await new Promise(r => setTimeout(r, 1400));
    const lead = leads.find(l => l.id === leadId);
    const suggestions: Record<string, string> = {
      new: `Доброго дня, ${lead?.first_name}! Дякуємо за звернення. Вас цікавить проживання ${lead?.check_in_date ? `з ${format(new Date(lead.check_in_date), "d MMMM", { locale: uk })}` : ""}. Хочемо запропонувати наш кращий варіант — оцінена вартість ~${fmt(lead?.estimated_value)} ₴. Чи зручно вам зараз обговорити деталі?`,
      qualified: `${lead?.first_name}, підготували для вас комерційну пропозицію з детальним описом послуг та умовами проживання. Можемо надати знижку при підтвердженні до п'ятниці. Надіслати на ${lead?.email || "вашу пошту"}?`,
      negotiating: `Розуміємо, що ціна важлива. Пропонуємо компроміс: знижка 8% + безкоштовний ранній заїзд. Пропозиція дійсна до кінця тижня.`,
    };
    const msg = suggestions[lead?.status || "new"] || `Дякуємо за інтерес! Як ми можемо допомогти ${lead?.first_name}?`;
    setAiTyping(null);
    toast({ title: "AI пропозиція готова", description: msg.slice(0, 80) + "..." });
  };

  // ── Create lead ────────────────────────────────────────────────────────────
  const createLead = async () => {
    if (!newLead.firstName && !newLead.phone) { toast({ title: "Вкажіть ім'я або телефон", variant: "destructive" }); return; }
    const r = await authFetch(`${API}/sales/leads`, { method: "POST", body: JSON.stringify({
      source: newLead.source, firstName: newLead.firstName, lastName: newLead.lastName,
      phone: newLead.phone, email: newLead.email, subject: newLead.subject,
      estimatedValue: newLead.estimatedValue ? parseFloat(newLead.estimatedValue) : undefined,
      checkIn: newLead.checkIn || undefined, checkOut: newLead.checkOut || undefined,
      guestsCount: parseInt(newLead.guestsCount) || 2, priority: newLead.priority, notes: newLead.notes,
    }) });
    const data = await r.json();
    if (data.lead) {
      setLeads(prev => [data.lead, ...prev]);
      setShowAddLead(false);
      setNewLead({ firstName: "", lastName: "", phone: "", email: "", source: "phone", subject: "", estimatedValue: "", checkIn: "", checkOut: "", guestsCount: "2", priority: "medium", notes: "" });
      toast({ title: "Лід додано!" });
    }
  };

  // ── Send campaign ──────────────────────────────────────────────────────────
  const sendCampaign = async (id: number) => {
    const r = await authFetch(`${API}/sales/campaigns/${id}/send`, { method: "PATCH" });
    const data = await r.json();
    if (data.success) {
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: "sent", sent_count: data.sentCount } : c));
      toast({ title: `Надіслано ${data.sentCount} одержувачам!`, description: `Відкрито: ~${data.openedCount}` });
    }
  };

  // ── Create campaign ────────────────────────────────────────────────────────
  const createCampaign = async () => {
    if (!newCampaign.name || !newCampaign.messageTemplate) { toast({ title: "Заповніть назву та шаблон", variant: "destructive" }); return; }
    const r = await authFetch(`${API}/sales/campaigns`, { method: "POST", body: JSON.stringify({
      name: newCampaign.name, type: newCampaign.type, targetSegment: newCampaign.targetSegment,
      subject: newCampaign.subject, messageTemplate: newCampaign.messageTemplate,
      offerCode: newCampaign.offerCode || undefined, discountPct: newCampaign.discountPct ? parseFloat(newCampaign.discountPct) : undefined,
    }) });
    const data = await r.json();
    if (data.campaign) {
      setCampaigns(prev => [data.campaign, ...prev]);
      setShowAddCampaign(false);
      setNewCampaign({ name: "", type: "email", targetSegment: "all", subject: "", messageTemplate: "", offerCode: "", discountPct: "" });
      toast({ title: "Кампанію створено!" });
    }
  };

  const copyWidget = () => {
    if (widgetData?.embedCode) {
      navigator.clipboard.writeText(widgetData.embedCode);
      setCopiedWidget(true);
      setTimeout(() => setCopiedWidget(false), 2000);
      toast({ title: "Код скопійовано!" });
    }
  };

  if (loading) return (
    <AppLayout>
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    </AppLayout>
  );

  const funnel = summary?.funnel || {};
  const conversionRate = funnel.total_leads > 0 ? ((funnel.converted / funnel.total_leads) * 100).toFixed(1) : "0";

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b sticky top-0 z-20">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Продажі та Комунікація
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">CRM · Канали · Upsell · Кампанії · Booking Widget</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
              <Button size="sm" onClick={() => setShowAddLead(true)} className="gap-2">
                <Plus className="w-4 h-4" />Новий лід
              </Button>
            </div>
          </div>
          {/* Tabs */}
          <div className="px-6 flex gap-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                <t.icon className="w-4 h-4" />{t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* ═══════════════════════════════════════════════ TAB: OVERVIEW ═══ */}
          {tab === "overview" && (
            <div className="space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Всього лідів", value: funnel.total_leads || 0, icon: Target, color: "text-blue-600", bg: "bg-blue-50" },
                  { label: "Активних", value: funnel.active_leads || 0, icon: Zap, color: "text-amber-600", bg: "bg-amber-50" },
                  { label: "Конверсія", value: `${conversionRate}%`, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
                  { label: "Сума конверсій", value: `${fmt(funnel.converted_value)} ₴`, icon: DollarSign, color: "text-purple-600", bg: "bg-purple-50" },
                ].map(k => (
                  <div key={k.label} className="bg-white dark:bg-gray-800 rounded-xl border p-4">
                    <div className={`inline-flex p-2 rounded-lg ${k.bg} mb-3`}>
                      <k.icon className={`w-5 h-5 ${k.color}`} />
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{k.value}</p>
                    <p className="text-sm text-gray-500 mt-1">{k.label}</p>
                  </div>
                ))}
              </div>

              {/* Pipeline funnel */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" />Воронка продажів
                </h3>
                <div className="flex items-end gap-3">
                  {PIPELINE_STATUSES.map((s, i) => {
                    const statusData = (summary?.leadsByStatus || []).find((x: any) => x.status === s);
                    const cnt = parseInt(statusData?.cnt || "0");
                    const total = parseInt(funnel.total_leads || "1");
                    const pct = Math.max(8, Math.round((cnt / total) * 100));
                    const meta = STATUS_META[s];
                    return (
                      <div key={s} className="flex-1 text-center">
                        <div className="text-xs text-gray-500 mb-1">{cnt}</div>
                        <div className={`w-full rounded-t-lg ${s === "booked" ? "bg-green-500" : s === "new" ? "bg-blue-500" : s === "lost" ? "bg-red-400" : "bg-indigo-400"}`}
                          style={{ height: `${pct * 1.4}px`, minHeight: "20px" }} />
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">{meta.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* By source */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Radio className="w-4 h-4 text-primary" />Виручка за каналом
                  </h3>
                  <div className="space-y-3">
                    {(summary?.sourceRevenue || []).map((s: any) => {
                      const total = (summary?.sourceRevenue || []).reduce((a: number, x: any) => a + Number(x.revenue || 0), 0) || 1;
                      const pct = Math.round((Number(s.revenue) / total) * 100);
                      return (
                        <div key={s.source}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <div className="flex items-center gap-2"><SourceBadge source={s.source} /><span className="text-gray-500">{s.bookings} бр.</span></div>
                            <span className="font-medium">{fmt(s.revenue)} ₴</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full"><div className="h-2 bg-primary rounded-full" style={{ width: `${pct}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top leads */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" />Гарячі ліди
                  </h3>
                  <div className="space-y-3">
                    {(summary?.topLeads || []).map((l: any) => (
                      <div key={l.id} className="flex items-start justify-between gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer" onClick={() => setTab("leads")}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-sm text-gray-900 dark:text-white">{l.first_name} {l.last_name}</span>
                            <ScoreBadge score={l.ai_score} />
                          </div>
                          <p className="text-xs text-gray-500 truncate">{l.subject}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <SourceBadge source={l.source} />
                            <StatusBadge status={l.status} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmt(l.estimated_value)} ₴</p>
                          {l.check_in_date && <p className="text-xs text-gray-400">{format(new Date(l.check_in_date), "d MMM", { locale: uk })}</p>}
                        </div>
                      </div>
                    ))}
                    {!(summary?.topLeads?.length) && <p className="text-sm text-gray-400 text-center py-4">Немає активних лідів</p>}
                  </div>
                </div>
              </div>

              {/* Campaign stats + Upsell summary */}
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { label: "Кампанії надіслано", value: fmt(summary?.campaigns?.total_sent), icon: Megaphone, sub: `${summary?.campaigns?.total || 0} кампаній` },
                  { label: "Брон. з кампаній", value: fmt(summary?.campaigns?.total_booked), icon: ShoppingCart, sub: `${fmt(summary?.campaigns?.total_revenue)} ₴ дохід` },
                  { label: "Upsells прийнято", value: (summary?.upsells || []).find((u: any) => u.status === "accepted")?.cnt || 0, icon: Gift, sub: `${fmt((summary?.upsells || []).find((u: any) => u.status === "accepted")?.total_price)} ₴` },
                ].map(k => (
                  <div key={k.label} className="bg-white dark:bg-gray-800 rounded-xl border p-4 flex items-center gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg"><k.icon className="w-5 h-5 text-primary" /></div>
                    <div><p className="text-xl font-bold text-gray-900 dark:text-white">{k.value}</p><p className="text-sm text-gray-500">{k.label}</p><p className="text-xs text-gray-400">{k.sub}</p></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════ TAB: LEADS ════ */}
          {tab === "leads" && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border p-4 flex flex-wrap gap-3 items-center">
                <Input placeholder="Пошук..." value={leadFilter.search}
                  onChange={e => setLeadFilter(f => ({ ...f, search: e.target.value }))}
                  className="w-48 h-9 text-sm" />
                <select value={leadFilter.status} onChange={e => setLeadFilter(f => ({ ...f, status: e.target.value }))}
                  className="h-9 px-3 border rounded-md text-sm bg-white dark:bg-gray-800">
                  <option value="">Усі статуси</option>
                  {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={leadFilter.source} onChange={e => setLeadFilter(f => ({ ...f, source: e.target.value }))}
                  className="h-9 px-3 border rounded-md text-sm bg-white dark:bg-gray-800">
                  <option value="">Усі канали</option>
                  {Object.entries(SOURCE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <span className="text-sm text-gray-500 ml-auto">{filteredLeads.length} лідів</span>
              </div>

              {/* Leads table */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 border-b">
                    <tr>
                      {["Контакт", "Канал", "Статус", "Тема / Запит", "Дати", "Сума", "Скор", "Дії"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {filteredLeads.map(l => (
                      <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white">{l.first_name} {l.last_name}</div>
                          <div className="text-xs text-gray-400">{l.phone || l.email || "—"}</div>
                        </td>
                        <td className="px-4 py-3"><SourceBadge source={l.source} /></td>
                        <td className="px-4 py-3">
                          <select value={l.status}
                            onChange={e => updateLead(l.id, { status: e.target.value })}
                            className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${STATUS_META[l.status]?.bg} ${STATUS_META[l.status]?.color}`}>
                            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="truncate text-gray-700 dark:text-gray-300">{l.subject || "—"}</div>
                          {l.notes && <div className="text-xs text-gray-400 truncate">{l.notes}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {l.check_in_date ? (<>{format(new Date(l.check_in_date), "d MMM", { locale: uk })} → {l.check_out_date ? format(new Date(l.check_out_date), "d MMM", { locale: uk }) : "?"} <br/>{l.guests_count} ос.</>) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {l.estimated_value && <div className="font-semibold text-gray-900 dark:text-white">{fmt(l.estimated_value)} ₴</div>}
                          {l.quoted_amount && <div className="text-xs text-green-600">КП: {fmt(l.quoted_amount)} ₴</div>}
                        </td>
                        <td className="px-4 py-3"><ScoreBadge score={l.ai_score} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600" title="AI підказка"
                              onClick={() => aiSuggest(l.id)} disabled={aiTyping === l.id}>
                              {aiTyping === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                            </Button>
                            {l.phone && (
                              <a href={`tel:${l.phone}`}><Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600" title="Подзвонити"><Phone className="w-3.5 h-3.5" /></Button></a>
                            )}
                            {l.status === "quote_sent" && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-emerald-600"
                                onClick={() => updateLead(l.id, { status: "booked" })}>
                                → Брон.
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredLeads.length && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Лідів не знайдено</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════ TAB: UPSELL ════ */}
          {tab === "upsell" && (
            <div className="space-y-6">
              {/* Upsell stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Запропоновано", key: "pending", color: "text-amber-600", bg: "bg-amber-50" },
                  { label: "Прийнято", key: "accepted", color: "text-green-600", bg: "bg-green-50" },
                  { label: "Відхилено", key: "declined", color: "text-red-600", bg: "bg-red-50" },
                  { label: "Конверсія", value: (() => {
                    const tot = upsells.length; const acc = upsells.filter(u => u.status === "accepted").length;
                    return tot > 0 ? `${Math.round((acc / tot) * 100)}%` : "—";
                  })(), color: "text-purple-600", bg: "bg-purple-50" },
                ].map(k => {
                  const cnt = k.value ?? upsells.filter(u => u.status === k.key).length;
                  return (
                    <div key={k.label} className="bg-white dark:bg-gray-800 rounded-xl border p-4">
                      <div className={`text-2xl font-bold ${k.color}`}>{cnt}</div>
                      <div className="text-sm text-gray-500 mt-1">{k.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* Upsell list */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
                <div className="p-4 border-b flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Gift className="w-4 h-4 text-primary" />Upsell пропозиції</h3>
                  <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 border-b">
                    <tr>
                      {["Пропозиція", "Гість / Бронь", "Ціна", "Канал", "Статус", "Дата"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {upsells.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white">{u.title}</div>
                          <div className="text-xs text-gray-400">{u.description?.slice(0, 60)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-700 dark:text-gray-300">{u.guest_name || "—"}</div>
                          {u.booking_ref && <div className="text-xs text-gray-400">#{u.booking_ref}</div>}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{u.price ? `${fmt(u.price)} ₴` : "—"}</td>
                        <td className="px-4 py-3"><span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{u.channel}</span></td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.status === "accepted" ? "bg-green-100 text-green-700" :
                            u.status === "declined" ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>{u.status === "accepted" ? "Прийнято" : u.status === "declined" ? "Відхилено" : "Очікує"}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {formatDistanceToNow(new Date(u.created_at), { addSuffix: true, locale: uk })}
                        </td>
                      </tr>
                    ))}
                    {!upsells.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Немає пропозицій</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* Repeat guests */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-primary" />Повторні гості & Лояльність
                </h3>
                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    { icon: Users, label: "Постійних гостей", value: "12", sub: "Були 2+ разів", color: "text-blue-600" },
                    { icon: DollarSign, label: "Виручка повторних", value: "67 200 ₴", sub: "31% від загального", color: "text-green-600" },
                    { icon: Award, label: "Середній LTV", value: "8 400 ₴", sub: "На 1 постійного гостя", color: "text-purple-600" },
                  ].map(k => (
                    <div key={k.label} className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                      <k.icon className={`w-8 h-8 mx-auto mb-2 ${k.color}`} />
                      <div className="text-xl font-bold text-gray-900 dark:text-white">{k.value}</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">{k.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{k.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-800">
                  <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
                    <Bot className="w-4 h-4" />AI рекомендація для повторних гостей
                  </h4>
                  <p className="text-sm text-purple-800 dark:text-purple-200">
                    3 гості не приїжджали більше 6 місяців. Рекомендуємо запустити кампанію "Реактивація" зі знижкою 20% —
                    очікувана конверсія 18-25%, потенційний дохід ~45 000 ₴.
                  </p>
                  <Button size="sm" className="mt-3 bg-purple-600 hover:bg-purple-700" onClick={() => setTab("campaigns")}>
                    Запустити кампанію <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════ TAB: CAMPAIGNS ══ */}
          {tab === "campaigns" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{campaigns.length} кампаній</p>
                <Button size="sm" onClick={() => setShowAddCampaign(true)} className="gap-2">
                  <Plus className="w-4 h-4" />Нова кампанія
                </Button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {campaigns.map(c => {
                  const openRate = c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0;
                  const clickRate = c.opened_count > 0 ? Math.round((c.clicked_count / c.opened_count) * 100) : 0;
                  return (
                    <div key={c.id} className="bg-white dark:bg-gray-800 rounded-xl border p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-white">{c.name}</h4>
                          {c.description && <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>}
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ml-2 ${
                          c.status === "sent" ? "bg-green-100 text-green-700" :
                          c.status === "draft" ? "bg-gray-100 text-gray-600" :
                          c.status === "scheduled" ? "bg-blue-100 text-blue-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>{c.status === "sent" ? "Надіслано" : c.status === "draft" ? "Чернетка" : c.status === "scheduled" ? "Заплановано" : c.status}</span>
                      </div>

                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{c.type === "email" ? "📧 Email" : c.type === "push" ? "🔔 Push" : "📱 SMS"}</span>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                          {c.target_segment === "all" ? "Всі гості" : c.target_segment === "repeat_guests" ? "Постійні" : c.target_segment === "upcoming_guests" ? "Майбутні заїзди" : c.target_segment}
                        </span>
                        {c.offer_code && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">🏷 {c.offer_code}</span>}
                        {c.discount_pct && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">-{c.discount_pct}%</span>}
                      </div>

                      {c.sent_count > 0 && (
                        <div className="grid grid-cols-4 gap-2 mb-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          {[
                            { l: "Надіслано", v: c.sent_count },
                            { l: "Відкрито", v: `${c.opened_count} (${openRate}%)` },
                            { l: "Кліки", v: `${c.clicked_count} (${clickRate}%)` },
                            { l: "Брон.", v: c.booked_count },
                          ].map(s => (
                            <div key={s.l} className="text-center">
                              <div className="font-semibold text-gray-900 dark:text-white text-sm">{s.v}</div>
                              <div className="text-xs text-gray-400">{s.l}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {c.revenue_generated && Number(c.revenue_generated) > 0 && (
                        <div className="text-sm font-medium text-green-700 mb-3">
                          💰 Дохід: {fmt(c.revenue_generated)} ₴
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        {c.status === "draft" && (
                          <Button size="sm" onClick={() => sendCampaign(c.id)} className="gap-1 flex-1">
                            <Send className="w-3.5 h-3.5" />Надіслати зараз
                          </Button>
                        )}
                        {c.status === "scheduled" && (
                          <Button size="sm" variant="outline" onClick={() => sendCampaign(c.id)} className="gap-1 flex-1">
                            <Send className="w-3.5 h-3.5" />Надіслати зараз
                          </Button>
                        )}
                        {c.status === "sent" && <span className="text-xs text-gray-400 flex items-center gap-1"><Check className="w-3 h-3 text-green-500" />Надіслано {c.sent_at ? format(new Date(c.sent_at), "d MMM", { locale: uk }) : ""}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════ TAB: CHANNELS ═══ */}
          {tab === "channels" && (
            <div className="space-y-6">
              {/* Channel performance */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />Ефективність каналів
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        {["Канал", "Бронювань", "Виручка", "Серед. бронь", "Повторних", "Avg гостей"].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                      {(channelData?.bySource || []).map((s: any) => (
                        <tr key={s.source} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-3 py-3"><SourceBadge source={s.source} /></td>
                          <td className="px-3 py-3 font-medium">{s.bookings}</td>
                          <td className="px-3 py-3 font-semibold">{fmt(s.revenue)} ₴</td>
                          <td className="px-3 py-3">{fmt(s.avg_booking)} ₴</td>
                          <td className="px-3 py-3">{s.repeat_bookings || 0}</td>
                          <td className="px-3 py-3">{Number(s.avg_guests || 0).toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Channel tiles */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { id: "telegram", name: "Telegram Bot", icon: <MessageSquare className="w-5 h-5 text-blue-500" />, status: "active", desc: "Автоматична обробка запитів, бронювання через @DogodaBot", stat: "6 розмов" },
                  { id: "instagram", name: "Instagram DM", icon: <Instagram className="w-5 h-5 text-pink-500" />, status: "active", desc: "Запити через Direct, відповіді менеджера в Inbox", stat: "2 розмови" },
                  { id: "website", name: "Booking Widget", icon: <Globe className="w-5 h-5 text-indigo-500" />, status: "active", desc: "Вбудований віджет на сайті dogoda.com.ua", stat: "47 бронювань" },
                  { id: "phone", name: "Телефонні бронювання", icon: <Phone className="w-5 h-5 text-green-500" />, status: "active", desc: "Ручне введення від reception, прив'язка до CRM", stat: "18 лідів" },
                  { id: "booking_com", name: "Booking.com", icon: <BookOpen className="w-5 h-5 text-blue-700" />, status: "active", desc: "OTA синхронізація через Channel Manager", stat: "1 бронювання" },
                  { id: "email", name: "Email-кампанії", icon: <Mail className="w-5 h-5 text-purple-500" />, status: "active", desc: "Розсилки через CRM, автоматичні upsell", stat: "4 кампанії" },
                ].map(ch => (
                  <div key={ch.id} className="bg-white dark:bg-gray-800 rounded-xl border p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {ch.icon}
                        <span className="font-medium text-gray-900 dark:text-white">{ch.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ch.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {ch.status === "active" ? "Активний" : "Вимкнено"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{ch.desc}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-primary">{ch.stat}</span>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setTab(ch.id === "website" ? "channels" : "leads")}>
                        Налаштувати <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Booking Widget */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />Booking Widget — Код для вашого сайту
                </h3>
                <div className="grid md:grid-cols-3 gap-4 mb-5">
                  {[
                    { label: "Бронювань з сайту", value: widgetData?.widget?.total_bookings || 47, icon: ShoppingCart },
                    { label: "Виручка", value: `${fmt(widgetData?.widget?.total_revenue || 342000)} ₴`, icon: DollarSign },
                    { label: "Конверсія", value: "3.2%", icon: TrendingUp },
                  ].map(k => (
                    <div key={k.label} className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                      <k.icon className="w-6 h-6 mx-auto mb-2 text-primary" />
                      <div className="text-xl font-bold text-gray-900 dark:text-white">{k.value}</div>
                      <div className="text-sm text-gray-500">{k.label}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-gray-900 rounded-xl p-4 relative">
                  <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap leading-5">
                    {widgetData?.embedCode || `<!-- Dogoda Booking Widget -->
<div id="dogoda-booking-widget"></div>
<script>
  window.DogodaWidget = {
    orgId: '1',
    lang: 'uk',
    primaryColor: '#1e3a5f',
    accentColor: '#f59e0b',
  };
</script>
<script src="https://widget.dogoda.com.ua/widget.js" async></script>`}
                  </pre>
                  <Button size="sm" onClick={copyWidget}
                    className="absolute top-3 right-3 gap-1 bg-gray-700 hover:bg-gray-600 text-white border-0">
                    {copiedWidget ? <><Check className="w-3.5 h-3.5" />Скопійовано</> : <><Copy className="w-3.5 h-3.5" />Копіювати</>}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" />
                  Вставте цей код у HTML вашого сайту перед тегом &lt;/body&gt;
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: Add Lead ─────────────────────────────────────────────────── */}
      {showAddLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Plus className="w-4 h-4 text-primary" />Новий лід</h3>
              <button onClick={() => setShowAddLead(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Ім'я</label><Input value={newLead.firstName} onChange={e => setNewLead(f => ({ ...f, firstName: e.target.value }))} placeholder="Іван" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Прізвище</label><Input value={newLead.lastName} onChange={e => setNewLead(f => ({ ...f, lastName: e.target.value }))} placeholder="Петренко" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Телефон</label><Input value={newLead.phone} onChange={e => setNewLead(f => ({ ...f, phone: e.target.value }))} placeholder="+380..." /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Email</label><Input value={newLead.email} onChange={e => setNewLead(f => ({ ...f, email: e.target.value }))} placeholder="email@gmail.com" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Канал</label>
                  <select value={newLead.source} onChange={e => setNewLead(f => ({ ...f, source: e.target.value }))} className="w-full h-10 px-3 border rounded-md text-sm bg-white dark:bg-gray-800">
                    {Object.entries(SOURCE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">Пріоритет</label>
                  <select value={newLead.priority} onChange={e => setNewLead(f => ({ ...f, priority: e.target.value }))} className="w-full h-10 px-3 border rounded-md text-sm bg-white dark:bg-gray-800">
                    <option value="high">🔴 Високий</option><option value="medium">🟡 Середній</option><option value="low">🟢 Низький</option>
                  </select>
                </div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">Тема / Запит</label><Input value={newLead.subject} onChange={e => setNewLead(f => ({ ...f, subject: e.target.value }))} placeholder="Цікавить проживання на вихідні..." /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Заїзд</label><Input type="date" value={newLead.checkIn} onChange={e => setNewLead(f => ({ ...f, checkIn: e.target.value }))} /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Виїзд</label><Input type="date" value={newLead.checkOut} onChange={e => setNewLead(f => ({ ...f, checkOut: e.target.value }))} /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Гостей</label><Input type="number" value={newLead.guestsCount} onChange={e => setNewLead(f => ({ ...f, guestsCount: e.target.value }))} min={1} /></div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">Орієнтовна вартість (₴)</label><Input type="number" value={newLead.estimatedValue} onChange={e => setNewLead(f => ({ ...f, estimatedValue: e.target.value }))} placeholder="0" /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">Нотатки</label><Textarea value={newLead.notes} onChange={e => setNewLead(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Детальна інформація..." /></div>
            </div>
            <div className="p-5 border-t flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddLead(false)}>Скасувати</Button>
              <Button className="flex-1" onClick={createLead}>Додати лід</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add Campaign ─────────────────────────────────────────────── */}
      {showAddCampaign && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Megaphone className="w-4 h-4 text-primary" />Нова кампанія</h3>
              <button onClick={() => setShowAddCampaign(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="text-xs text-gray-500 mb-1 block">Назва кампанії *</label><Input value={newCampaign.name} onChange={e => setNewCampaign(f => ({ ...f, name: e.target.value }))} placeholder="Весняна акція 2026" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Тип</label>
                  <select value={newCampaign.type} onChange={e => setNewCampaign(f => ({ ...f, type: e.target.value }))} className="w-full h-10 px-3 border rounded-md text-sm bg-white dark:bg-gray-800">
                    <option value="email">📧 Email</option><option value="sms">📱 SMS</option><option value="push">🔔 Push</option>
                  </select>
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">Аудиторія</label>
                  <select value={newCampaign.targetSegment} onChange={e => setNewCampaign(f => ({ ...f, targetSegment: e.target.value }))} className="w-full h-10 px-3 border rounded-md text-sm bg-white dark:bg-gray-800">
                    <option value="all">Всі гості</option>
                    <option value="repeat_guests">Постійні гості</option>
                    <option value="upcoming_guests">Майбутні заїзди</option>
                    <option value="inactive_guests">Неактивні 6+ міс.</option>
                  </select>
                </div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">Тема листа</label><Input value={newCampaign.subject} onChange={e => setNewCampaign(f => ({ ...f, subject: e.target.value }))} placeholder="Ексклюзивна пропозиція для вас 🎁" /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">{"Текст повідомлення * ({{first_name}} — ім'я) *"}</label>
                <Textarea value={newCampaign.messageTemplate} onChange={e => setNewCampaign(f => ({ ...f, messageTemplate: e.target.value }))} rows={4} placeholder="Доброго дня, {{first_name}}! Пропонуємо особливу знижку..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Промокод</label><Input value={newCampaign.offerCode} onChange={e => setNewCampaign(f => ({ ...f, offerCode: e.target.value }))} placeholder="PROMO20" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Знижка %</label><Input type="number" value={newCampaign.discountPct} onChange={e => setNewCampaign(f => ({ ...f, discountPct: e.target.value }))} placeholder="15" min={0} max={100} /></div>
              </div>
            </div>
            <div className="p-5 border-t flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddCampaign(false)}>Скасувати</Button>
              <Button className="flex-1" onClick={createCampaign}>Створити кампанію</Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
