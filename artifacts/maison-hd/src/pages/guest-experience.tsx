import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Heart, Star, MessageSquare, Gift, Tag, Users, TrendingUp, Award,
  CheckCircle2, Clock, RefreshCw, Plus, Send, Eye, EyeOff,
  ThumbsUp, Crown, Zap, AlertCircle, ChevronRight, Mail,
  BarChart3, Sparkles, Globe, Calendar, ShoppingBag, Check, X, Package,
  UserCheck, Phone, BedDouble, ChevronDown,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(API + path, { headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...opts?.headers }, ...opts });

const TIER_CONFIG: Record<string, { label: string; color: string; icon: string; minPts: number }> = {
  bronze:   { label: "Bronze",   color: "bg-orange-100 text-orange-700",  icon: "🥉", minPts: 0 },
  silver:   { label: "Silver",   color: "bg-gray-100 text-gray-700",      icon: "🥈", minPts: 500 },
  gold:     { label: "Gold",     color: "bg-yellow-100 text-yellow-700",  icon: "🥇", minPts: 2000 },
  platinum: { label: "Platinum", color: "bg-purple-100 text-purple-700",  icon: "💎", minPts: 5000 },
};

const AUDIENCE_LABELS: Record<string, string> = { all: "Всі гості", returning: "Постійні", vip: "VIP / Platinum", new: "Нові гості" };

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`${s} ${i <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
      ))}
    </div>
  );
}

function NpsBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400 text-xs">—</span>;
  const clr = score >= 9 ? "text-green-600" : score >= 7 ? "text-yellow-600" : "text-red-500";
  const label = score >= 9 ? "Promoter" : score >= 7 ? "Passive" : "Detractor";
  return <span className={`text-sm font-bold ${clr}`}>{score}/10 <span className="text-xs font-normal">{label}</span></span>;
}

// ── Service Orders Tab ────────────────────────────────────────────────────────
const ORDER_STATUS: Record<string, { label: string; pill: string; icon: any }> = {
  pending:   { label: "Нове",        pill: "bg-amber-50 text-amber-700 ring-amber-200",   icon: Clock },
  confirmed: { label: "Підтверджено",pill: "bg-blue-50 text-blue-700 ring-blue-200",      icon: CheckCircle2 },
  completed: { label: "Виконано",    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: Check },
  cancelled: { label: "Скасовано",   pill: "bg-gray-100 text-gray-500 ring-gray-200",     icon: X },
};

function ServiceOrdersTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(`/guest/service-orders?status=${filterStatus}&limit=200`);
    if (r.ok) setOrders(await r.json());
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const updateStatus = async (id: number, status: string) => {
    setUpdatingId(id);
    const r = await apiFetch(`/guest/service-orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (r.ok) { toast({ title: "Статус оновлено" }); loadOrders(); }
    setUpdatingId(null);
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch { return d; }
  };

  const pendingCount = orders.filter(o => o.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {[["all","Всі"],["pending","Нові"],["confirmed","Підтверджено"],["completed","Виконано"],["cancelled","Скасовано"]].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilterStatus(k)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              filterStatus === k ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {l}
            {k === "pending" && pendingCount > 0 && filterStatus !== "pending" && (
              <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{pendingCount}</span>
            )}
          </button>
        ))}
        <button onClick={loadOrders} className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Завантаження...
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400">
          <Package className="w-8 h-8 text-gray-200" />
          <p className="text-sm">Замовлень немає</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(o => {
            const st = ORDER_STATUS[o.status] || ORDER_STATUS.pending;
            const StIcon = st.icon;
            return (
              <Card key={o.id} className="border-0 shadow-sm">
                <CardContent className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-lg shrink-0">
                      {o.serviceIcon || "🛎️"}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{o.serviceName || o.serviceType}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${st.pill}`}>
                          <StIcon className="w-2.5 h-2.5" /> {st.label}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-3">
                        <span>👤 {o.guestName}</span>
                        <span>🛏 {o.unitName}</span>
                        <span>🕐 {fmtDate(o.createdAt)}</span>
                        {o.requestedTime && <span>⏰ {o.requestedTime}</span>}
                        {o.quantity > 1 && <span>×{o.quantity}</span>}
                      </div>
                      {o.guestNotes && (
                        <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1.5 inline-block">
                          💬 {o.guestNotes}
                        </div>
                      )}
                    </div>

                    {/* Price */}
                    <div className="text-right shrink-0">
                      <div className="font-bold text-gray-900 text-sm">
                        {o.price ? new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(o.price * (o.quantity || 1)) : "—"}
                      </div>

                      {/* Quick actions */}
                      <div className="flex gap-1 mt-1.5 justify-end">
                        {o.status === "pending" && (
                          <>
                            <button
                              onClick={() => updateStatus(o.id, "confirmed")}
                              disabled={updatingId === o.id}
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-lg transition-colors"
                            >
                              Підтвердити
                            </button>
                            <button
                              onClick={() => updateStatus(o.id, "cancelled")}
                              disabled={updatingId === o.id}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-semibold rounded-lg transition-colors"
                            >
                              Скасувати
                            </button>
                          </>
                        )}
                        {o.status === "confirmed" && (
                          <button
                            onClick={() => updateStatus(o.id, "completed")}
                            disabled={updatingId === o.id}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg transition-colors"
                          >
                            ✓ Виконано
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Online Checkins Tab ────────────────────────────────────────────────────────
function CheckinsTab() {
  const [checkins, setCheckins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/guest/checkins");
    if (r.ok) setCheckins(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" }); }
    catch { return d; }
  };
  const fmtDateTime = (d: string) => {
    try { return new Date(d).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch { return d; }
  };

  const FIELD_LABELS: Record<string, string> = {
    firstName: "Ім'я", lastName: "Прізвище", middleName: "По батькові",
    phone: "Телефон", email: "Email", passportType: "Документ", passportNumber: "Номер документа",
    nationality: "Громадянство", birthDate: "Дата народження", arrivalTime: "Час прибуття",
    specialRequests: "Побажання", carNumber: "Номер авто", hasPet: "Тварина", petType: "Вид тварини", petName: "Кличка",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Онлайн чекін-форми</span>
          {!loading && <Badge className="bg-emerald-100 text-emerald-700">{checkins.length}</Badge>}
        </div>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />Завантаження...
        </div>
      ) : checkins.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-400">
          <UserCheck className="w-10 h-10 text-gray-200" />
          <div className="text-center">
            <p className="text-sm font-medium">Жодного онлайн чекіну</p>
            <p className="text-xs text-gray-300 mt-1">Гості заповнять форму через гостьовий портал</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {checkins.map(c => (
            <Card key={c.id} className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <UserCheck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{c.guestName}</span>
                      <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">✅ Форма заповнена</Badge>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-3">
                      <span><BedDouble className="w-3 h-3 inline mr-0.5" />{c.unitName}</span>
                      <span>📅 {fmtDate(c.checkIn)} → {fmtDate(c.checkOut)}</span>
                      <span>🕐 {fmtDateTime(c.updatedAt)}</span>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded === c.id ? "rotate-180" : ""}`} />
                </div>

                {expanded === c.id && c.checkinFormData && Object.keys(c.checkinFormData).length > 0 && (
                  <div className="px-4 pb-4 border-t border-gray-50">
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {Object.entries(c.checkinFormData)
                        .filter(([k, v]) => v && k !== "coGuests" && typeof v !== "object")
                        .map(([k, v]) => (
                          <div key={k} className="text-xs">
                            <span className="text-gray-400">{FIELD_LABELS[k] || k}: </span>
                            <span className="font-medium text-gray-700">{String(v)}</span>
                          </div>
                        ))}
                    </div>
                    {c.checkinFormData.coGuests && Array.isArray(c.checkinFormData.coGuests) && c.checkinFormData.coGuests.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-400 font-semibold mb-1">Супутники ({c.checkinFormData.coGuests.length}):</p>
                        {c.checkinFormData.coGuests.map((g: any, i: number) => (
                          <p key={i} className="text-xs text-gray-700">• {g.firstName} {g.lastName} — {g.passportNumber}</p>
                        ))}
                      </div>
                    )}
                    {c.checkinFormData.specialRequests && (
                      <div className="mt-2 bg-amber-50 rounded-lg p-2">
                        <p className="text-xs text-amber-700">💬 {c.checkinFormData.specialRequests}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GuestExperiencePage() {
  const [summary, setSummary] = useState<any>(null);
  const [loyalty, setLoyalty] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [offerDialog, setOfferDialog] = useState(false);
  const [offerForm, setOfferForm] = useState({ title: "", description: "", promoCode: "", discountPct: "", validFrom: "", validUntil: "", targetAudience: "all", minNights: "" });
  const [savingOffer, setSavingOffer] = useState(false);
  const [responseDialog, setResponseDialog] = useState<{ id: number; guestName: string } | null>(null);
  const [responseText, setResponseText] = useState("");
  const [savingResponse, setSavingResponse] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [summRes, loyRes, revRes, offRes] = await Promise.all([
        apiFetch("/guest/summary"),
        apiFetch("/guest/loyalty-overview"),
        apiFetch("/guest/reviews"),
        apiFetch("/guest/offers"),
      ]);
      if (summRes.ok) setSummary(await summRes.json());
      if (loyRes.ok) { const d = await loyRes.json(); setLoyalty(d.accounts || []); }
      if (revRes.ok) { const d = await revRes.json(); setReviews(d.reviews || []); }
      if (offRes.ok) { const d = await offRes.json(); setOffers(d.offers || []); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function saveOffer() {
    if (!offerForm.title) return;
    setSavingOffer(true);
    try {
      const r = await apiFetch("/guest/offers", {
        method: "POST",
        body: JSON.stringify({ ...offerForm, discountPct: offerForm.discountPct ? parseInt(offerForm.discountPct) : null, minNights: offerForm.minNights ? parseInt(offerForm.minNights) : null }),
      });
      if (r.ok) {
        toast({ title: "Пропозицію створено" });
        setOfferDialog(false);
        setOfferForm({ title: "", description: "", promoCode: "", discountPct: "", validFrom: "", validUntil: "", targetAudience: "all", minNights: "" });
        loadAll();
      }
    } finally { setSavingOffer(false); }
  }

  async function toggleOfferStatus(id: number, currentStatus: string) {
    const newStatus = currentStatus === "active" ? "expired" : "active";
    await apiFetch(`/guest/offers/${id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
    loadAll();
  }

  async function toggleReviewPublish(id: number, isPublished: boolean) {
    await apiFetch(`/guest/reviews/${id}`, { method: "PATCH", body: JSON.stringify({ isPublished: !isPublished }) });
    loadAll();
  }

  async function saveResponse() {
    if (!responseDialog || !responseText.trim()) return;
    setSavingResponse(true);
    try {
      const r = await apiFetch(`/guest/reviews/${responseDialog.id}`, {
        method: "PATCH",
        body: JSON.stringify({ staffResponse: responseText }),
      });
      if (r.ok) {
        toast({ title: "Відповідь збережено" });
        setResponseDialog(null);
        setResponseText("");
        loadAll();
      }
    } finally { setSavingResponse(false); }
  }

  const avgRating = reviews.length > 0 && reviews.filter(r => r.submittedAt).length > 0
    ? (reviews.filter(r => r.submittedAt).reduce((s, r) => s + (r.overallRating || 0), 0) / reviews.filter(r => r.submittedAt).length).toFixed(1)
    : "—";

  if (loading && !summary) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64 text-gray-400">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />Завантаження…
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Heart className="h-6 w-6 text-pink-500" />Гостьовий досвід
            </h1>
            <p className="text-gray-500 text-sm">Loyalty · Відгуки · Повідомлення · Спецпропозиції</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Оновити
          </Button>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Loyalty учасників", value: summary?.loyaltyAccounts || 0, icon: Crown, color: "text-purple-600", sub: `${(summary?.totalLoyaltyPoints || 0).toLocaleString("uk")} балів всього` },
            { label: "Відгуків отримано", value: summary?.reviewsCount || 0, icon: Star, color: "text-yellow-600", sub: `Ср. рейтинг: ${avgRating} ⭐` },
            { label: "Активних пропозицій", value: summary?.activeOffers || 0, icon: Tag, color: "text-blue-600", sub: "Промокоди та знижки" },
            { label: "Непрочитаних повід.", value: summary?.unreadMessages || 0, icon: MessageSquare, color: summary?.unreadMessages > 0 ? "text-red-500" : "text-gray-500", sub: "Від гостей у порталі" },
          ].map(({ label, value, icon: Icon, color, sub }) => (
            <Card key={label} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-500 font-medium">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color.replace("text-","bg-").replace("-600","-100").replace("-500","-100")}`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="orders">
          <TabsList className="w-full grid grid-cols-6 h-10">
            <TabsTrigger value="orders" className="text-xs relative">
              <ShoppingBag className="h-3.5 w-3.5 mr-1" />Замовлення
            </TabsTrigger>
            <TabsTrigger value="checkins" className="text-xs">
              <UserCheck className="h-3.5 w-3.5 mr-1" />Чекін
            </TabsTrigger>
            <TabsTrigger value="loyalty" className="text-xs"><Crown className="h-3.5 w-3.5 mr-1" />Лояльність</TabsTrigger>
            <TabsTrigger value="reviews" className="text-xs"><Star className="h-3.5 w-3.5 mr-1" />Відгуки</TabsTrigger>
            <TabsTrigger value="offers" className="text-xs"><Tag className="h-3.5 w-3.5 mr-1" />Пропозиції</TabsTrigger>
            <TabsTrigger value="workflow" className="text-xs"><Zap className="h-3.5 w-3.5 mr-1" />Workflow</TabsTrigger>
          </TabsList>

          {/* ===== SERVICE ORDERS ===== */}
          <TabsContent value="orders" className="mt-4">
            <ServiceOrdersTab />
          </TabsContent>

          {/* ===== ONLINE CHECKINS ===== */}
          <TabsContent value="checkins" className="mt-4">
            <CheckinsTab />
          </TabsContent>

          {/* ===== LOYALTY ===== */}
          <TabsContent value="loyalty" className="mt-4 space-y-4">
            {/* Tier summary */}
            <div className="grid grid-cols-4 gap-3">
              {Object.entries(TIER_CONFIG).map(([tier, cfg]) => {
                const count = loyalty.filter(a => a.tier === tier).length;
                return (
                  <Card key={tier} className="border-0 shadow-sm text-center">
                    <CardContent className="p-4">
                      <p className="text-2xl mb-1">{cfg.icon}</p>
                      <p className={`text-xl font-bold ${cfg.color.split(" ")[1]}`}>{count}</p>
                      <Badge className={`${cfg.color} text-xs mt-1`}>{cfg.label}</Badge>
                      <p className="text-xs text-gray-400 mt-1">{cfg.minPts}+ балів</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Loyalty table */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-600" />Учасники програми ({loyalty.length})
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {loyalty.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Немає учасників</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-gray-500">
                          <th className="text-left py-2 font-medium">Гість</th>
                          <th className="text-left py-2 font-medium">Email</th>
                          <th className="text-center py-2 font-medium">Рівень</th>
                          <th className="text-right py-2 font-medium">Балів</th>
                          <th className="text-right py-2 font-medium">Всього балів</th>
                          <th className="text-right py-2 font-medium">Витрат</th>
                          <th className="text-right py-2 font-medium">Візитів</th>
                          <th className="text-right py-2 font-medium">Остання дата</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loyalty.map((a: any) => {
                          const tier = TIER_CONFIG[a.tier] || TIER_CONFIG.bronze;
                          return (
                            <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="py-2 font-medium">{[a.firstName, a.lastName].filter(Boolean).join(" ") || "—"}</td>
                              <td className="py-2 text-gray-500 text-xs">{a.email}</td>
                              <td className="py-2 text-center">
                                <Badge className={`text-xs ${tier.color}`}>{tier.icon} {tier.label}</Badge>
                              </td>
                              <td className="py-2 text-right font-bold text-purple-600">{a.points.toLocaleString("uk")}</td>
                              <td className="py-2 text-right text-gray-500">{a.totalPoints.toLocaleString("uk")}</td>
                              <td className="py-2 text-right text-green-600">{parseFloat(a.totalSpend || 0).toLocaleString("uk")} ₴</td>
                              <td className="py-2 text-right">{a.visitsCount}</td>
                              <td className="py-2 text-right text-gray-400 text-xs">{a.lastVisitDate || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tier rules */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Award className="h-4 w-4 text-yellow-600" />Правила нарахування балів
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { action: "Онлайн чекін", points: "+50", icon: "✅" },
                    { action: "Завершений виїзд", points: "+100–500", icon: "🏨" },
                    { action: "Залишений відгук", points: "+100", icon: "⭐" },
                    { action: "Рекомендація другу", points: "+200", icon: "👥" },
                    { action: "Bronze → Silver", points: "500 балів", icon: "🥈" },
                    { action: "Silver → Gold", points: "2000 балів", icon: "🥇" },
                    { action: "Gold → Platinum", points: "5000 балів", icon: "💎" },
                    { action: "1 ₴ витрат = 1 бал", points: "×1", icon: "💰" },
                  ].map(({ action, points, icon }) => (
                    <div key={action} className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xl mb-1">{icon}</p>
                      <p className="text-xs font-medium text-gray-700">{action}</p>
                      <p className="text-sm font-bold text-purple-600 mt-1">{points}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== REVIEWS ===== */}
          <TabsContent value="reviews" className="mt-4 space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Середній рейтинг", value: avgRating, icon: "⭐", color: "text-yellow-600" },
                { label: "Повернулися б", value: reviews.filter(r => r.wouldReturn).length, icon: "🔄", color: "text-green-600" },
                { label: "Порекомендували б", value: reviews.filter(r => r.recommendToFriend).length, icon: "👥", color: "text-blue-600" },
                { label: "Опубліковано", value: reviews.filter(r => r.isPublished).length, icon: "🌐", color: "text-purple-600" },
              ].map(({ label, value, icon, color }) => (
                <Card key={label} className="border-0 shadow-sm text-center">
                  <CardContent className="p-3">
                    <p className="text-2xl">{icon}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Reviews list */}
            <div className="space-y-3">
              {reviews.length === 0 ? (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-8 text-center text-gray-400">
                    <Star className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    Відгуків ще немає
                  </CardContent>
                </Card>
              ) : reviews.map((review: any) => (
                <Card key={review.id} className={`border-0 shadow-sm ${review.isPublished ? "border-l-4 border-l-green-400" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{review.guestName || review.guestEmail || "Гість"}</span>
                          {review.overallRating && <StarRating rating={review.overallRating} />}
                          {review.npsScore !== null && review.npsScore !== undefined && <NpsBar score={review.npsScore} />}
                          {review.submittedAt
                            ? <Badge className="bg-green-100 text-green-700 text-xs">Відгук залишено</Badge>
                            : <Badge className="bg-gray-100 text-gray-500 text-xs">Запит надіслано</Badge>}
                          {review.isPublished && <Badge className="bg-blue-100 text-blue-700 text-xs"><Globe className="h-2.5 w-2.5 mr-1" />Опубліковано</Badge>}
                        </div>

                        {review.submittedAt && review.overallRating && (
                          <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-gray-500">
                            <span>🧹 Чистота: {review.cleanlinessRating}/5</span>
                            <span>🤝 Сервіс: {review.serviceRating}/5</span>
                            <span>📍 Локація: {review.locationRating}/5</span>
                            <span>💰 Цінність: {review.valueRating}/5</span>
                          </div>
                        )}

                        {review.reviewText && (
                          <p className="mt-2 text-sm text-gray-700 italic">"{review.reviewText}"</p>
                        )}

                        {review.staffResponse && (
                          <div className="mt-2 bg-blue-50 rounded-lg p-2">
                            <p className="text-xs text-blue-600 font-medium">Відповідь готелю:</p>
                            <p className="text-xs text-blue-700">{review.staffResponse}</p>
                          </div>
                        )}

                        <p className="text-xs text-gray-400 mt-1">
                          {review.submittedAt ? `Відгук: ${new Date(review.submittedAt).toLocaleDateString("uk")}` : `Запит: ${new Date(review.requestSentAt || review.createdAt).toLocaleDateString("uk")}`}
                          {review.wouldReturn !== null && (review.wouldReturn ? " · Повернеться ✓" : " · Не повернеться")}
                        </p>
                      </div>

                      {review.submittedAt && (
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => toggleReviewPublish(review.id, review.isPublished)}>
                            {review.isPublished ? <><EyeOff className="h-3 w-3 mr-1" />Зняти</> : <><Eye className="h-3 w-3 mr-1" />Опублікувати</>}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => { setResponseDialog({ id: review.id, guestName: review.guestName || "гість" }); setResponseText(review.staffResponse || ""); }}>
                            <Send className="h-3 w-3 mr-1" />Відповісти
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ===== OFFERS ===== */}
          <TabsContent value="offers" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setOfferDialog(true)} size="sm">
                <Plus className="h-4 w-4 mr-1.5" />Нова пропозиція
              </Button>
            </div>

            {offers.length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-8 text-center text-gray-400">
                  <Tag className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  Немає активних пропозицій
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {offers.map((offer: any) => (
                  <Card key={offer.id} className={`border-0 shadow-sm ${offer.status === "active" ? "border-l-4 border-l-blue-400" : "opacity-60"}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm">{offer.title}</h3>
                            <Badge className={offer.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                              {offer.status === "active" ? "Активна" : "Неактивна"}
                            </Badge>
                          </div>
                          {offer.description && <p className="text-xs text-gray-500 mt-1">{offer.description}</p>}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {offer.promoCode && <Badge className="bg-blue-50 text-blue-700 font-mono text-xs">{offer.promoCode}</Badge>}
                            {offer.discountPct && <Badge className="bg-orange-100 text-orange-700 text-xs">-{offer.discountPct}%</Badge>}
                            <Badge className="bg-gray-100 text-gray-600 text-xs">{AUDIENCE_LABELS[offer.targetAudience] || offer.targetAudience}</Badge>
                            {offer.minNights && <Badge className="bg-gray-100 text-gray-600 text-xs">від {offer.minNights} ночей</Badge>}
                          </div>
                          {(offer.validFrom || offer.validUntil) && (
                            <p className="text-xs text-gray-400 mt-1">
                              <Calendar className="h-3 w-3 inline mr-1" />
                              {offer.validFrom || "—"} → {offer.validUntil || "—"}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">Використань: {offer.usageCount}</p>
                        </div>
                        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                          onClick={() => toggleOfferStatus(offer.id, offer.status)}>
                          {offer.status === "active" ? "Деактивувати" : "Активувати"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ===== WORKFLOW ===== */}
          <TabsContent value="workflow" className="mt-4 space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-600" />Гостьовий Journey — Автоматизація
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="relative">
                  {[
                    { stage: "Бронювання", time: "Одразу", icon: "📋", desc: "Підтвердження бронювання + посилання на гостьовий портал", color: "bg-blue-500", done: true },
                    { stage: "За 3 дні до заїзду", time: "72 год до", icon: "📲", desc: "Нагадування + онлайн-чекін + уpsell SPA / активності", color: "bg-purple-500", done: true },
                    { stage: "За 1 день до заїзду", time: "24 год до", icon: "🏨", desc: "Нагадування заповнити форму + спецпропозиції на час перебування", color: "bg-indigo-500", done: false },
                    { stage: "День заїзду", time: "Check-in", icon: "🔑", desc: "Вітальне повідомлення + WiFi + корисна інформація", color: "bg-green-500", done: false },
                    { stage: "Під час перебування", time: "In-stay", icon: "💬", desc: "Доступний чат з готелем + замовлення послуг", color: "bg-teal-500", done: true },
                    { stage: "День виїзду", time: "Check-out", icon: "🧳", desc: "Запит на виїзд + збір зворотнього зв'язку + квитанція", color: "bg-orange-500", done: true },
                    { stage: "Через 24 год", time: "Post-stay", icon: "⭐", desc: "Запит на відгук + нарахування loyalty балів", color: "bg-yellow-500", done: false },
                    { stage: "Через 30 днів", time: "+1 місяць", icon: "🎁", desc: "Спецпропозиція для повернення + loyalty бонус", color: "bg-pink-500", done: false },
                  ].map((step, i) => (
                    <div key={i} className="flex gap-4 mb-4 last:mb-0">
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full ${step.color} text-white flex items-center justify-center text-lg shrink-0`}>
                          {step.icon}
                        </div>
                        {i < 7 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">{step.stage}</h3>
                          <Badge className="bg-gray-100 text-gray-600 text-xs">{step.time}</Badge>
                          {step.done
                            ? <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Реалізовано</Badge>
                            : <Badge className="bg-orange-100 text-orange-700 text-xs"><Clock className="h-2.5 w-2.5 mr-1" />Планується</Badge>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Метрики гостьового досвіду</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {[
                    { label: "Онлайн чекін (заповнених форм)", value: "—", target: ">80%" },
                    { label: "Відгуки після виїзду", value: `${reviews.filter(r => r.submittedAt).length}/${reviews.length}`, target: ">60%" },
                    { label: "Позитивних відгуків (4-5⭐)", value: reviews.filter(r => r.overallRating >= 4).length, target: ">90%" },
                    { label: "NPS Promoters (9-10)", value: reviews.filter(r => r.npsScore >= 9).length, target: ">50%" },
                    { label: "Повернення (wouldReturn)", value: `${reviews.filter(r => r.wouldReturn).length}/${reviews.filter(r => r.submittedAt).length}`, target: ">75%" },
                  ].map(({ label, value, target }) => (
                    <div key={label} className="flex justify-between items-center text-sm border-b border-gray-50 pb-2 last:border-0">
                      <span className="text-gray-600">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{value}</span>
                        <span className="text-xs text-gray-400">ціль: {target}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Loyalty програма — рівні</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {Object.entries(TIER_CONFIG).map(([tier, cfg]) => (
                    <div key={tier} className="flex items-center gap-3">
                      <span className="text-xl">{cfg.icon}</span>
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <span className="font-medium text-sm">{cfg.label}</span>
                          <span className="text-xs text-gray-500">{cfg.minPts}+ балів</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                          <div className={`h-full rounded-full ${tier === "bronze" ? "bg-orange-400" : tier === "silver" ? "bg-gray-400" : tier === "gold" ? "bg-yellow-400" : "bg-purple-500"}`}
                            style={{ width: tier === "bronze" ? "25%" : tier === "silver" ? "50%" : tier === "gold" ? "75%" : "100%" }} />
                        </div>
                      </div>
                      <Badge className={`${cfg.color} text-xs`}>{loyalty.filter(a => a.tier === tier).length} гостей</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Offer Dialog */}
        <Dialog open={offerDialog} onOpenChange={setOfferDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Нова спецпропозиція</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Назва *</Label><Input value={offerForm.title} onChange={e => setOfferForm(p => ({ ...p, title: e.target.value }))} placeholder="Літня знижка 15%" /></div>
              <div><Label className="text-xs">Опис</Label><Textarea value={offerForm.description} onChange={e => setOfferForm(p => ({ ...p, description: e.target.value }))} placeholder="Бронюйте від 3 ночей…" rows={2} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Промокод</Label><Input value={offerForm.promoCode} onChange={e => setOfferForm(p => ({ ...p, promoCode: e.target.value.toUpperCase() }))} placeholder="SUMMER15" className="font-mono" /></div>
                <div><Label className="text-xs">Знижка %</Label><Input type="number" value={offerForm.discountPct} onChange={e => setOfferForm(p => ({ ...p, discountPct: e.target.value }))} placeholder="15" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Дійсна від</Label><Input type="date" value={offerForm.validFrom} onChange={e => setOfferForm(p => ({ ...p, validFrom: e.target.value }))} /></div>
                <div><Label className="text-xs">Дійсна до</Label><Input type="date" value={offerForm.validUntil} onChange={e => setOfferForm(p => ({ ...p, validUntil: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Аудиторія</Label>
                  <select className="w-full h-9 border rounded-md px-2 text-sm" value={offerForm.targetAudience} onChange={e => setOfferForm(p => ({ ...p, targetAudience: e.target.value }))}>
                    {Object.entries(AUDIENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><Label className="text-xs">Мін. ночей</Label><Input type="number" value={offerForm.minNights} onChange={e => setOfferForm(p => ({ ...p, minNights: e.target.value }))} placeholder="2" /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOfferDialog(false)}>Скасувати</Button>
              <Button onClick={saveOffer} disabled={savingOffer || !offerForm.title}>
                {savingOffer ? <RefreshCw className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Створити</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Response Dialog */}
        <Dialog open={!!responseDialog} onOpenChange={() => setResponseDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Відповідь на відгук — {responseDialog?.guestName}</DialogTitle>
            </DialogHeader>
            <Textarea value={responseText} onChange={e => setResponseText(e.target.value)} placeholder="Шановний гостю, дякуємо за ваш відгук…" rows={4} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setResponseDialog(null)}>Скасувати</Button>
              <Button onClick={saveResponse} disabled={savingResponse || !responseText.trim()}>
                {savingResponse ? <RefreshCw className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" />Зберегти</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
