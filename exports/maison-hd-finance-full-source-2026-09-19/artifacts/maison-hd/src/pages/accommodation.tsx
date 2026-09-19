import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";
import { uk } from "date-fns/locale";
import {
  BedDouble, Home, TreePine, Building2, Tent, MapPin, Users, Calendar, Plus, TrendingUp,
  Search, ChevronRight, BarChart2, Lock, Unlock, X, AlertCircle, CheckCircle2,
  ArrowRight, DollarSign, Moon, Star, Filter, Clock, ArrowUpRight, Layers,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/accommodation";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { "Authorization": `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const TABS = [
  { id: "overview", label: "Огляд", icon: Home },
  { id: "bookings", label: "Бронювання", icon: Calendar },
  { id: "units", label: "Номерний фонд", icon: BedDouble },
  { id: "groups", label: "Групові", icon: Users },
  { id: "blocks", label: "Блокування", icon: Lock },
  { id: "longterm", label: "Довгострокові", icon: Moon },
  { id: "analytics", label: "Аналітика", icon: BarChart2 },
];

const PROP_TYPE_UA: Record<string, string> = {
  hotel: "Готель", house: "Будинок/Котедж", villa: "Вілла",
  apartment: "Апартаменти", glamping: "Глемпінг", camping: "Кемпінг",
  bungalow: "Бунгало", other: "Інше",
};
const PROP_TYPE_ICON: Record<string, any> = {
  hotel: BedDouble, house: Home, villa: Star, apartment: Building2,
  glamping: TreePine, camping: MapPin, bungalow: Tent, other: Home,
};
const PROP_TYPE_COLOR: Record<string, string> = {
  hotel: "bg-blue-100 text-blue-700 border-blue-200",
  house: "bg-green-100 text-green-700 border-green-200",
  villa: "bg-purple-100 text-purple-700 border-purple-200",
  apartment: "bg-indigo-100 text-indigo-700 border-indigo-200",
  glamping: "bg-emerald-100 text-emerald-700 border-emerald-200",
  camping: "bg-amber-100 text-amber-700 border-amber-200",
  bungalow: "bg-teal-100 text-teal-700 border-teal-200",
  other: "bg-gray-100 text-gray-600 border-gray-200",
};

const BOOKING_STATUS_UA: Record<string, string> = {
  pending: "Очікує", confirmed: "Підтверджено", checked_in: "Проживає",
  checked_out: "Виїхав", cancelled: "Скасовано", draft: "Чернетка",
};
const BOOKING_STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  checked_in: "bg-green-100 text-green-800 border-green-200",
  checked_out: "bg-gray-100 text-gray-600 border-gray-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  draft: "bg-orange-100 text-orange-700 border-orange-200",
};
const GROUP_STATUS_UA: Record<string, string> = {
  inquiry: "Запит", confirmed: "Підтверджено", arrived: "Прибули",
  completed: "Завершено", cancelled: "Скасовано",
};
const GROUP_STATUS_COLOR: Record<string, string> = {
  inquiry: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  arrived: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};
const BLOCK_TYPE_UA: Record<string, string> = {
  event: "Подія", maintenance: "Обслуговування", owner_stay: "Власник",
  seasonal_close: "Сезонне закриття", renovation: "Ремонт", other: "Інше",
};
const BLOCK_TYPE_COLOR: Record<string, string> = {
  event: "bg-purple-100 text-purple-800",
  maintenance: "bg-orange-100 text-orange-800",
  owner_stay: "bg-blue-100 text-blue-800",
  seasonal_close: "bg-gray-100 text-gray-600",
  renovation: "bg-red-100 text-red-700",
  other: "bg-gray-100 text-gray-600",
};
const SOURCE_UA: Record<string, string> = {
  direct: "Прямий", booking: "Booking.com", airbnb: "Airbnb", other: "Інший",
};

export default function AccommodationPage() {
  const [tab, setTab] = useState("overview");
  const { toast } = useToast();

  // Data states
  const [stats, setStats] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [longTerm, setLongTerm] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [termFilter, setTermFilter] = useState("all");
  const [unitTypeFilter, setUnitTypeFilter] = useState("all");

  // Analytics
  const [analyticsFrom, setAnalyticsFrom] = useState(
    format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd")
  );
  const [analyticsTo, setAnalyticsTo] = useState(format(new Date(), "yyyy-MM-dd"));

  // Dialogs
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewBlock, setShowNewBlock] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);

  const loadStats = async () => {
    const r = await apiFetch("/stats");
    if (r.ok) setStats(await r.json());
  };
  const loadBookings = async () => {
    const p = new URLSearchParams();
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (typeFilter !== "all") p.set("type", typeFilter);
    if (termFilter !== "all") p.set("term", termFilter);
    if (search) p.set("search", search);
    const r = await apiFetch(`/bookings?${p}`);
    if (r.ok) { const d = await r.json(); setBookings(d.bookings || []); }
  };
  const loadUnits = async () => {
    const p = new URLSearchParams();
    if (unitTypeFilter !== "all") p.set("type", unitTypeFilter);
    const r = await apiFetch(`/units?${p}`);
    if (r.ok) { const d = await r.json(); setUnits(d.units || []); }
  };
  const loadGroups = async () => {
    const p = new URLSearchParams();
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (search) p.set("search", search);
    const r = await apiFetch(`/group-bookings?${p}`);
    if (r.ok) { const d = await r.json(); setGroups(d.groups || []); }
  };
  const loadBlocks = async () => {
    const r = await apiFetch("/blocks");
    if (r.ok) { const d = await r.json(); setBlocks(d.blocks || []); }
  };
  const loadLongTerm = async () => {
    const p = new URLSearchParams();
    if (statusFilter !== "all") p.set("status", statusFilter);
    const r = await apiFetch(`/long-term?${p}`);
    if (r.ok) { const d = await r.json(); setLongTerm(d.bookings || []); }
  };
  const loadAnalytics = async () => {
    const r = await apiFetch(`/analytics?from=${analyticsFrom}&to=${analyticsTo}`);
    if (r.ok) setAnalytics(await r.json());
  };

  useEffect(() => { loadStats(); }, []);
  useEffect(() => {
    if (tab === "bookings") loadBookings();
    if (tab === "units") loadUnits();
    if (tab === "groups") loadGroups();
    if (tab === "blocks") loadBlocks();
    if (tab === "longterm") loadLongTerm();
    if (tab === "analytics") loadAnalytics();
  }, [tab, statusFilter, typeFilter, termFilter, unitTypeFilter, search]);
  useEffect(() => { if (tab === "analytics") loadAnalytics(); }, [analyticsFrom, analyticsTo]);

  const handleBookingStatus = async (id: number, status: string) => {
    const r = await apiFetch(`/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (r.ok) { toast({ title: `Статус: ${BOOKING_STATUS_UA[status]}` }); loadBookings(); loadStats(); setSelectedBooking(null); }
  };
  const handleGroupStatus = async (id: number, status: string) => {
    const r = await apiFetch(`/group-bookings/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (r.ok) { toast({ title: `Статус групи: ${GROUP_STATUS_UA[status]}` }); loadGroups(); setSelectedGroup(null); }
  };
  const handleDeleteBlock = async (id: number) => {
    const r = await apiFetch(`/blocks/${id}`, { method: "DELETE" });
    if (r.ok) { toast({ title: "Блокування знято" }); loadBlocks(); }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BedDouble className="h-7 w-7 text-blue-600" /> Проживання
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">Управління номерним фондом, бронюваннями та гостями</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {tab === "bookings" && (
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowNewBooking(true)}>
                <Plus className="h-4 w-4 mr-1" /> Нове бронювання
              </Button>
            )}
            {tab === "groups" && (
              <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowNewGroup(true)}>
                <Plus className="h-4 w-4 mr-1" /> Нова група
              </Button>
            )}
            {tab === "blocks" && (
              <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => setShowNewBlock(true)}>
                <Lock className="h-4 w-4 mr-1" /> Додати блокування
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        {stats && tab === "overview" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Зараз проживають</p>
                <p className="text-2xl font-bold text-green-600">{stats.today?.checked_in || 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">Прибуває сьогодні: {stats.today?.arrivals_today || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-blue-500" /> Виїздів сьогодні</p>
                <p className="text-2xl font-bold text-blue-600">{stats.today?.departures_today || 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">Очікуваних: {stats.today?.upcoming || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 flex items-center gap-1"><Users className="h-3.5 w-3.5 text-purple-500" /> Групових броні</p>
                <p className="text-2xl font-bold text-purple-600">{stats.groups?.total || 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">Активних: {stats.groups?.active || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Виручка (місяць)</p>
                <p className="text-2xl font-bold text-emerald-600">{(stats.revenue?.total || 0).toLocaleString()} ₴</p>
                <p className="text-xs text-gray-400 mt-0.5">{stats.revenue?.bookings || 0} бронювань</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <div className="flex overflow-x-auto gap-1 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setSearch(""); setStatusFilter("all"); setTypeFilter("all"); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* ─── OVERVIEW ─── */}
        {tab === "overview" && stats && (
          <div className="space-y-4">
            {/* Property type grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {(stats.properties || []).map((p: any) => {
                const Icon = PROP_TYPE_ICON[p.type] || Home;
                const occ = stats.occupancy?.find((o: any) => o.type === p.type);
                const occupied = occ?.occupied || 0;
                const total = p.active_units || 1;
                const pct = Math.round((occupied / total) * 100);
                return (
                  <Card key={p.id} className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => { setTab("bookings"); setTypeFilter(p.type); }}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${PROP_TYPE_COLOR[p.type] || "bg-gray-100"}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{p.name}</p>
                            <Badge variant="outline" className={`text-xs ${PROP_TYPE_COLOR[p.type]}`}>{PROP_TYPE_UA[p.type]}</Badge>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{p.unit_count} об'єктів · Від {parseFloat(p.avg_price || 0).toLocaleString()} ₴/ніч</p>
                          <div className="mt-2">
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                              <span>Зайнято: {occupied}/{total}</span>
                              <span className={pct > 80 ? "text-red-500 font-medium" : pct > 50 ? "text-amber-500" : "text-green-500"}>{pct}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full transition-all ${pct > 80 ? "bg-red-400" : pct > 50 ? "bg-amber-400" : "bg-green-400"}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Quick info: active blocks */}
            {(stats.blocks?.active || 0) > 0 && (
              <Card className="border-0 shadow-sm border-l-4 border-l-orange-400">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-500 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800">Є активні блокування</p>
                    <p className="text-sm text-gray-500">{stats.blocks.active} об'єктів тимчасово заблоковано</p>
                  </div>
                  <Button variant="outline" size="sm" className="ml-auto flex-shrink-0" onClick={() => setTab("blocks")}>Переглянути <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
                </CardContent>
              </Card>
            )}

            {/* Occupancy by type table */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Завантаженість по типах</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {(stats.occupancy || []).map((o: any) => {
                    const pct = o.occupancy_pct || 0;
                    return (
                      <div key={o.type} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium flex items-center gap-2">
                            {(() => { const Icon = PROP_TYPE_ICON[o.type] || Home; return <Icon className="h-4 w-4 text-gray-400" />; })()}
                            {PROP_TYPE_UA[o.type] || o.type}
                          </span>
                          <span className="text-gray-500">{o.occupied}/{o.total_units} · <span className={pct > 80 ? "text-red-600 font-semibold" : pct > 50 ? "text-amber-600 font-semibold" : "text-green-600 font-semibold"}>{pct}%</span></span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className={`h-2 rounded-full ${pct > 80 ? "bg-red-400" : pct > 50 ? "bg-amber-400" : "bg-blue-400"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── BOOKINGS ─── */}
        {tab === "bookings" && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input className="pl-9" placeholder="Пошук по гостю, номеру, телефону…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі статуси</SelectItem>
                  {Object.entries(BOOKING_STATUS_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Тип об'єкту" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі типи</SelectItem>
                  {Object.entries(PROP_TYPE_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={termFilter} onValueChange={setTermFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Термін" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Будь-який термін</SelectItem>
                  <SelectItem value="short">До 7 ночей</SelectItem>
                  <SelectItem value="medium">7-27 ночей</SelectItem>
                  <SelectItem value="long">28+ ночей</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {bookings.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-10 text-center text-gray-400">Бронювань не знайдено</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {bookings.map(b => (
                  <Card key={b.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setSelectedBooking(b)}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-2 self-stretch rounded-full flex-shrink-0 ${b.status === "checked_in" ? "bg-green-400" : b.status === "confirmed" ? "bg-blue-400" : b.status === "cancelled" ? "bg-red-300" : "bg-gray-300"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{b.first_name} {b.last_name}</span>
                            <Badge className={`text-xs border ${BOOKING_STATUS_COLOR[b.status]}`}>{BOOKING_STATUS_UA[b.status]}</Badge>
                            {b.nights >= 28 && <Badge variant="outline" className="text-xs border-moon-300 text-indigo-700"><Moon className="h-3 w-3 mr-0.5 inline" /> Довгострок</Badge>}
                            {(() => { const Icon = PROP_TYPE_ICON[b.property_type] || Home; return <Badge variant="outline" className={`text-xs ${PROP_TYPE_COLOR[b.property_type]}`}><Icon className="h-3 w-3 mr-0.5 inline" />{PROP_TYPE_UA[b.property_type]}</Badge>; })()}
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">{b.unit_name} · {b.property_name}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{b.check_in} → {b.check_out} ({b.nights} н.)</span>
                            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{b.adults || b.guests_count || 1} ос.</span>
                            <span>{SOURCE_UA[b.source] || b.source}</span>
                            {b.booking_ref && <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{b.booking_ref}</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-gray-800">{parseFloat(b.total_amount || 0).toLocaleString()} ₴</p>
                          <p className={`text-xs mt-0.5 ${b.payment_status === "paid" ? "text-green-600" : b.payment_status === "partial" ? "text-amber-600" : "text-red-500"}`}>
                            {b.payment_status === "paid" ? "Оплачено" : b.payment_status === "partial" ? "Часткова оплата" : "Не оплачено"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── UNITS ─── */}
        {tab === "units" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Select value={unitTypeFilter} onValueChange={setUnitTypeFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Тип об'єкту" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі типи</SelectItem>
                  {Object.entries(PROP_TYPE_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {units.map(u => {
                const Icon = PROP_TYPE_ICON[u.property_type] || Home;
                return (
                  <Card key={u.id} className={`border-0 shadow-sm ${!u.is_available ? "opacity-70" : ""}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${PROP_TYPE_COLOR[u.property_type] || "bg-gray-100"}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm leading-snug">{u.name}</p>
                            <p className="text-xs text-gray-500">{u.property_name} · {u.category}</p>
                          </div>
                        </div>
                        <Badge className={`text-xs flex-shrink-0 ${u.is_available ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
                          {u.is_available ? "Вільний" : "Зайнятий"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-3 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{u.capacity}{u.max_capacity && u.max_capacity > u.capacity ? `–${u.max_capacity}` : ""} ос.</span>
                        {u.square_meters && <span>{parseFloat(u.square_meters)} м²</span>}
                        {u.floor && <span>{u.floor} пов.</span>}
                        {u.has_balcony && <span>🏡 Балкон</span>}
                        {u.has_view && <span>🌄 Вид</span>}
                      </div>
                      <p className="text-sm font-bold text-blue-700 mt-2">{parseFloat(u.base_price || 0).toLocaleString()} ₴/ніч</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── GROUPS ─── */}
        {tab === "groups" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input className="pl-9" placeholder="Пошук групи…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі статуси</SelectItem>
                  {Object.entries(GROUP_STATUS_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {groups.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-10 text-center text-gray-400">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                Групових бронювань не знайдено
              </CardContent></Card>
            ) : groups.map(g => (
              <Card key={g.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setSelectedGroup(g)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{g.group_name}</p>
                        <Badge className={`text-xs ${GROUP_STATUS_COLOR[g.status]}`}>{GROUP_STATUS_UA[g.status]}</Badge>
                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{g.booking_ref}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{g.contact_name} · {g.contact_phone}{g.company && ` · ${g.company}`}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                        <span><Calendar className="h-3 w-3 inline mr-0.5" />{g.check_in} → {g.check_out} ({g.nights} н.)</span>
                        <span><Users className="h-3 w-3 inline mr-0.5" />{g.total_guests} гостей · {g.room_count} кімн.</span>
                        <span>{g.adults} дорослих{g.children > 0 ? ` · ${g.children} дітей` : ""}</span>
                      </div>
                      {Array.isArray(g.units_detail) && g.units_detail.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {g.units_detail.map((u: any) => (
                            <Badge key={u.id} variant="outline" className="text-xs">{u.name}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-gray-800">{parseFloat(g.total_amount || 0).toLocaleString()} ₴</p>
                      <p className="text-xs text-gray-400 mt-0.5">Оплачено: {parseFloat(g.paid_amount || 0).toLocaleString()} ₴</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ─── BLOCKS ─── */}
        {tab === "blocks" && (
          <div className="space-y-3">
            {blocks.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-10 text-center text-gray-400">
                <Unlock className="h-10 w-10 mx-auto mb-3 opacity-40" />
                Активних блокувань немає
              </CardContent></Card>
            ) : blocks.map(b => (
              <Card key={b.id} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <Lock className="h-5 w-5 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{b.title}</p>
                        <Badge className={`text-xs ${BLOCK_TYPE_COLOR[b.block_type]}`}>{BLOCK_TYPE_UA[b.block_type]}</Badge>
                        <Badge variant="outline" className="text-xs">{b.days} д.</Badge>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">{b.start_date} → {b.end_date}</p>
                      {b.reason && <p className="text-xs text-gray-400 mt-0.5">{b.reason}</p>}
                      {Array.isArray(b.units_detail) && b.units_detail.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {b.units_detail.map((u: any) => (
                            <Badge key={u.id} variant="outline" className="text-xs">{u.name}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50 flex-shrink-0" onClick={() => handleDeleteBlock(b.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ─── LONG-TERM ─── */}
        {tab === "longterm" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі статуси</SelectItem>
                  {Object.entries(BOOKING_STATUS_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {longTerm.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-gray-400">
                <Moon className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Довгострокових бронювань немає</p>
                <p className="text-sm mt-1">Бронювання від 28 ночей відображаються тут</p>
              </CardContent></Card>
            ) : longTerm.map(b => (
              <Card key={b.id} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Moon className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{b.first_name} {b.last_name}</p>
                        <Badge className={`text-xs border ${BOOKING_STATUS_COLOR[b.status]}`}>{BOOKING_STATUS_UA[b.status]}</Badge>
                        <Badge variant="outline" className="text-xs border-indigo-300 text-indigo-700">{b.nights} ночей</Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{b.unit_name} · {b.property_name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                        <span><Calendar className="h-3 w-3 inline mr-0.5" />{b.check_in} → {b.check_out}</span>
                        <span><Users className="h-3 w-3 inline mr-0.5" />{b.adults || 1} ос.</span>
                        <span>{b.phone}</span>
                        {b.booking_ref && <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{b.booking_ref}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-gray-800">{parseFloat(b.total_amount || 0).toLocaleString()} ₴</p>
                      <p className="text-xs text-gray-400">{parseFloat(b.price_per_night || 0).toLocaleString()} ₴/ніч</p>
                      <p className={`text-xs mt-0.5 ${b.payment_status === "paid" ? "text-green-600" : "text-amber-600"}`}>
                        {b.payment_status === "paid" ? "Оплачено" : `Оплачено: ${parseFloat(b.paid_amount || 0).toLocaleString()} ₴`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ─── ANALYTICS ─── */}
        {tab === "analytics" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">Від</Label>
                <Input type="date" value={analyticsFrom} onChange={e => setAnalyticsFrom(e.target.value)} className="w-40" />
                <Label className="text-sm whitespace-nowrap">До</Label>
                <Input type="date" value={analyticsTo} onChange={e => setAnalyticsTo(e.target.value)} className="w-40" />
              </div>
              {[
                { label: "Місяць", from: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") },
                { label: "7 днів", from: format(addDays(new Date(), -7), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") },
                { label: "Квартал", from: format(new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3, 1), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") },
              ].map(p => (
                <Button key={p.label} variant="outline" size="sm" onClick={() => { setAnalyticsFrom(p.from); setAnalyticsTo(p.to); }}>{p.label}</Button>
              ))}
            </div>

            {!analytics ? (
              <Card className="border-dashed"><CardContent className="py-10 text-center text-gray-400">Завантаження…</CardContent></Card>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="border-0 shadow-sm"><CardContent className="p-4">
                    <p className="text-xs text-gray-500 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-blue-500" /> Виручка</p>
                    <p className="text-2xl font-bold text-blue-600">{(analytics.totals.revenue || 0).toLocaleString()} ₴</p>
                    <p className="text-xs text-gray-400 mt-0.5">Оплачено: {(analytics.totals.paid || 0).toLocaleString()} ₴</p>
                  </CardContent></Card>
                  <Card className="border-0 shadow-sm"><CardContent className="p-4">
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-purple-500" /> Бронювань</p>
                    <p className="text-2xl font-bold text-purple-600">{analytics.totals.total || 0}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Скасовано: {analytics.totals.cancelled || 0}</p>
                  </CardContent></Card>
                  <Card className="border-0 shadow-sm"><CardContent className="p-4">
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Moon className="h-3.5 w-3.5 text-indigo-500" /> Сер. ночей</p>
                    <p className="text-2xl font-bold text-indigo-600">{analytics.totals.avg_nights || 0}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Довгострок.: {analytics.totals.long_term || 0}</p>
                  </CardContent></Card>
                  <Card className="border-0 shadow-sm"><CardContent className="p-4">
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-emerald-500" /> Типів об'єктів</p>
                    <p className="text-2xl font-bold text-emerald-600">{analytics.byType.length}</p>
                    <p className="text-xs text-gray-400 mt-0.5">з активними броні</p>
                  </CardContent></Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Виручка за типами</CardTitle></CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {analytics.byType.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Немає даних</p> :
                        analytics.byType.map((t: any) => {
                          const maxR = Math.max(...analytics.byType.map((x: any) => x.revenue));
                          const pct = maxR > 0 ? (t.revenue / maxR) * 100 : 0;
                          const Icon = PROP_TYPE_ICON[t.type] || Home;
                          return (
                            <div key={t.type} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="font-medium flex items-center gap-1.5"><Icon className="h-4 w-4 text-gray-400" />{PROP_TYPE_UA[t.type] || t.type}</span>
                                <span className="text-gray-500">{t.revenue.toLocaleString()} ₴ · {t.bookings} бр. · {t.avg_nights}н.</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Джерела бронювань</CardTitle></CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {analytics.sources.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Немає даних</p> :
                        analytics.sources.map((s: any) => {
                          const total = analytics.sources.reduce((a: number, x: any) => a + x.bookings, 0);
                          const pct = total > 0 ? Math.round((s.bookings / total) * 100) : 0;
                          return (
                            <div key={s.source} className="flex items-center gap-3">
                              <span className="text-sm font-medium w-28">{SOURCE_UA[s.source] || s.source}</span>
                              <div className="flex-1 bg-gray-100 rounded-full h-2">
                                <div className="bg-purple-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-sm text-gray-600 w-20 text-right">{s.bookings} ({pct}%)</span>
                            </div>
                          );
                        })}
                    </CardContent>
                  </Card>
                </div>

                {/* Occupancy by type */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Завантаженість за типами (за період)</CardTitle></CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {analytics.occupancy.map((o: any) => {
                      const Icon = PROP_TYPE_ICON[o.type] || Home;
                      return (
                        <div key={o.type} className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm font-medium w-36 flex-shrink-0">{PROP_TYPE_UA[o.type] || o.type}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div className={`h-2 rounded-full ${(o.occupancy_pct||0) > 80 ? "bg-red-400" : (o.occupancy_pct||0) > 50 ? "bg-amber-400" : "bg-green-400"}`}
                              style={{ width: `${o.occupancy_pct || 0}%` }} />
                          </div>
                          <span className="text-sm text-gray-600 w-28 text-right">{o.booked}/{o.total_units} · {o.occupancy_pct || 0}%</span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Daily chart */}
                {analytics.daily.length > 1 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Динаміка заїздів</CardTitle></CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-end gap-1 h-24 overflow-x-auto">
                        {analytics.daily.map((d: any) => {
                          const max = Math.max(...analytics.daily.map((x: any) => x.bookings), 1);
                          const h = Math.max(4, (d.bookings / max) * 80);
                          return (
                            <div key={d.date} className="flex flex-col items-center gap-0.5 flex-1 min-w-[28px]" title={`${d.date}: ${d.bookings} заїздів`}>
                              <div className="w-full rounded-t-sm bg-blue-400" style={{ height: `${h}px` }} />
                              <span className="text-[8px] text-gray-400">{d.date?.slice(8)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Booking Detail Dialog ─── */}
      <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
        <DialogContent className="max-w-md">
          {selectedBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BedDouble className="h-5 w-5 text-blue-600" />
                  {selectedBooking.first_name} {selectedBooking.last_name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                  <Row label="Об'єкт" value={`${selectedBooking.unit_name} · ${selectedBooking.property_name}`} />
                  <Row label="Тип" value={PROP_TYPE_UA[selectedBooking.property_type] || selectedBooking.property_type} />
                  <Row label="Заїзд" value={`${selectedBooking.check_in} о ${selectedBooking.checkin_time || "14:00"}`} />
                  <Row label="Виїзд" value={`${selectedBooking.check_out} о ${selectedBooking.checkout_time || "12:00"}`} />
                  <Row label="Тривалість" value={`${selectedBooking.nights} ночей`} />
                  <Row label="Гостей" value={`${selectedBooking.adults || selectedBooking.guests_count || 1} ос.`} />
                  <Row label="Телефон" value={selectedBooking.phone || "—"} />
                  <Row label="Сума" value={`${parseFloat(selectedBooking.total_amount || 0).toLocaleString()} ₴`} bold />
                  <Row label="Оплачено" value={`${parseFloat(selectedBooking.paid_amount || 0).toLocaleString()} ₴`} />
                  <Row label="Джерело" value={SOURCE_UA[selectedBooking.source] || selectedBooking.source} />
                  {selectedBooking.booking_ref && <Row label="Реф." value={selectedBooking.booking_ref} />}
                </div>
                {selectedBooking.notes && (
                  <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-800">{selectedBooking.notes}</div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Змінити статус:</p>
                  <div className="flex flex-wrap gap-2">
                    {["confirmed", "checked_in", "checked_out", "cancelled"].map(s => (
                      <Button key={s} size="sm" variant={selectedBooking.status === s ? "default" : "outline"}
                        className={selectedBooking.status === s ? "bg-blue-600" : ""}
                        onClick={() => handleBookingStatus(selectedBooking.id, s)}
                        disabled={selectedBooking.status === s}>
                        {BOOKING_STATUS_UA[s]}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Group Detail Dialog ─── */}
      <Dialog open={!!selectedGroup} onOpenChange={() => setSelectedGroup(null)}>
        <DialogContent className="max-w-lg">
          {selectedGroup && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-600" /> {selectedGroup.group_name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                  <Row label="Контакт" value={`${selectedGroup.contact_name} · ${selectedGroup.contact_phone}`} />
                  {selectedGroup.company && <Row label="Компанія" value={selectedGroup.company} />}
                  {selectedGroup.contact_email && <Row label="Email" value={selectedGroup.contact_email} />}
                  <Row label="Заїзд" value={selectedGroup.check_in} />
                  <Row label="Виїзд" value={selectedGroup.check_out} />
                  <Row label="Тривалість" value={`${selectedGroup.nights} ночей`} />
                  <Row label="Гостей" value={`${selectedGroup.total_guests} ос. (${selectedGroup.adults} дор. + ${selectedGroup.children} дітей)`} />
                  <Row label="Кімнат" value={`${selectedGroup.room_count}`} />
                  <Row label="Сума" value={`${parseFloat(selectedGroup.total_amount || 0).toLocaleString()} ₴`} bold />
                  <Row label="Оплачено" value={`${parseFloat(selectedGroup.paid_amount || 0).toLocaleString()} ₴`} />
                  <Row label="Реф." value={selectedGroup.booking_ref} />
                </div>
                {selectedGroup.notes && <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-800">{selectedGroup.notes}</div>}
                {Array.isArray(selectedGroup.units_detail) && selectedGroup.units_detail.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Зарезервовані об'єкти:</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedGroup.units_detail.map((u: any) => (
                        <Badge key={u.id} variant="outline" className="text-xs">{u.name}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Змінити статус:</p>
                  <div className="flex flex-wrap gap-2">
                    {["inquiry", "confirmed", "arrived", "completed", "cancelled"].map(s => (
                      <Button key={s} size="sm" variant={selectedGroup.status === s ? "default" : "outline"}
                        className={selectedGroup.status === s ? "bg-purple-600" : ""}
                        onClick={() => handleGroupStatus(selectedGroup.id, s)}
                        disabled={selectedGroup.status === s}>
                        {GROUP_STATUS_UA[s]}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── New Booking Dialog ─── */}
      <NewBookingDialog open={showNewBooking} onClose={() => setShowNewBooking(false)}
        onSave={async (data: any) => {
          const r = await apiFetch("/bookings", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Бронювання створено" }); setShowNewBooking(false); loadBookings(); loadStats(); }
          else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
        }} />

      {/* ─── New Group Dialog ─── */}
      <NewGroupDialog open={showNewGroup} onClose={() => setShowNewGroup(false)}
        onSave={async (data: any) => {
          const r = await apiFetch("/group-bookings", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Групу створено" }); setShowNewGroup(false); loadGroups(); }
          else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
        }} />

      {/* ─── New Block Dialog ─── */}
      <NewBlockDialog open={showNewBlock} onClose={() => setShowNewBlock(false)}
        onSave={async (data: any) => {
          const r = await apiFetch("/blocks", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Блокування додано" }); setShowNewBlock(false); loadBlocks(); }
          else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
        }} />
    </AppLayout>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={bold ? "font-bold text-blue-700" : "font-medium text-right"}>{value}</span>
    </div>
  );
}

function NewBookingDialog({ open, onClose, onSave }: any) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState({ unitId: "", checkIn: today, checkOut: format(addDays(new Date(), 2), "yyyy-MM-dd"), firstName: "", lastName: "", phone: "", email: "", adults: 1, childrenUnder6: 0, childrenOver6: 0, source: "direct", status: "confirmed", notes: "", paidAmount: 0, checkinTime: "14:00", checkoutTime: "12:00" });
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      const p = new URLSearchParams();
      if (form.checkIn) p.set("checkIn", form.checkIn);
      if (form.checkOut) p.set("checkOut", form.checkOut);
      fetch(`${BASE.replace("/maison-hd", "")}/api/accommodation/units?${p}`, { headers: { "Authorization": `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setUnits(d.units || []));
    }
  }, [open, form.checkIn, form.checkOut]);

  const handleSubmit = async () => {
    if (!form.unitId || !form.checkIn || !form.checkOut || !form.firstName) return;
    setLoading(true);
    await onSave(form);
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Нове бронювання</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Ім'я *</Label><Input placeholder="Олена" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
            <div><Label>Прізвище</Label><Input placeholder="Коваль" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Телефон</Label><Input placeholder="+38050…" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Заїзд *</Label><Input type="date" value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} /></div>
            <div><Label>Виїзд *</Label><Input type="date" value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} /></div>
          </div>
          <div>
            <Label>Об'єкт *</Label>
            <Select value={form.unitId} onValueChange={v => setForm(f => ({ ...f, unitId: v }))}>
              <SelectTrigger><SelectValue placeholder="Оберіть кімнату/будинок…" /></SelectTrigger>
              <SelectContent>
                {units.filter(u => u.is_available).map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name} · {u.property_name} · {parseFloat(u.base_price || 0).toLocaleString()} ₴/ніч
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Дорослі</Label><Input type="number" min={1} value={form.adults} onChange={e => setForm(f => ({ ...f, adults: parseInt(e.target.value) }))} /></div>
            <div><Label>Діти до 6</Label><Input type="number" min={0} value={form.childrenUnder6} onChange={e => setForm(f => ({ ...f, childrenUnder6: parseInt(e.target.value) }))} /></div>
            <div><Label>Діти 6+</Label><Input type="number" min={0} value={form.childrenOver6} onChange={e => setForm(f => ({ ...f, childrenOver6: parseInt(e.target.value) }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Джерело</Label>
              <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Прямий</SelectItem>
                  <SelectItem value="booking">Booking.com</SelectItem>
                  <SelectItem value="airbnb">Airbnb</SelectItem>
                  <SelectItem value="other">Інший</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Статус</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Підтверджено</SelectItem>
                  <SelectItem value="pending">Очікує</SelectItem>
                  <SelectItem value="checked_in">Заселити зараз</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Нотатки</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-blue-600 hover:bg-blue-700">{loading ? "…" : "Забронювати"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewGroupDialog({ open, onClose, onSave }: any) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState({ groupName: "", contactName: "", contactPhone: "", contactEmail: "", company: "", checkIn: today, checkOut: format(addDays(new Date(), 3), "yyyy-MM-dd"), roomCount: 2, totalGuests: 10, adults: 10, children: 0, status: "inquiry", totalAmount: 0, paidAmount: 0, source: "direct", notes: "", specialRequests: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.groupName || !form.checkIn || !form.checkOut) return;
    setLoading(true);
    await onSave({ ...form, unitIds: [] });
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Нова група</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Назва групи *</Label><Input placeholder="Корпоратив ІТ Компанія" value={form.groupName} onChange={e => setForm(f => ({ ...f, groupName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Контактна особа</Label><Input placeholder="Ім'я" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} /></div>
            <div><Label>Телефон</Label><Input placeholder="+38050…" value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Email</Label><Input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} /></div>
            <div><Label>Компанія</Label><Input placeholder="Назва компанії" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Заїзд *</Label><Input type="date" value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} /></div>
            <div><Label>Виїзд *</Label><Input type="date" value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Кімнат</Label><Input type="number" min={1} value={form.roomCount} onChange={e => setForm(f => ({ ...f, roomCount: parseInt(e.target.value) }))} /></div>
            <div><Label>Дорослих</Label><Input type="number" min={1} value={form.adults} onChange={e => setForm(f => ({ ...f, adults: parseInt(e.target.value), totalGuests: parseInt(e.target.value) + form.children }))} /></div>
            <div><Label>Дітей</Label><Input type="number" min={0} value={form.children} onChange={e => setForm(f => ({ ...f, children: parseInt(e.target.value), totalGuests: form.adults + parseInt(e.target.value) }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Сума (₴)</Label><Input type="number" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: parseFloat(e.target.value) }))} /></div>
            <div><Label>Статус</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inquiry">Запит</SelectItem>
                  <SelectItem value="confirmed">Підтверджено</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Нотатки</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div><Label>Особливі побажання</Label><Textarea rows={2} value={form.specialRequests} onChange={e => setForm(f => ({ ...f, specialRequests: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-purple-600 hover:bg-purple-700">{loading ? "…" : "Створити групу"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewBlockDialog({ open, onClose, onSave }: any) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState({ title: "", blockType: "maintenance", startDate: today, endDate: format(addDays(new Date(), 7), "yyyy-MM-dd"), reason: "", notes: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.title || !form.startDate || !form.endDate) return;
    setLoading(true);
    await onSave({ ...form, unitIds: [] });
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Нове блокування</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Назва *</Label><Input placeholder="Ремонт покрівлі" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><Label>Тип</Label>
            <Select value={form.blockType} onValueChange={v => setForm(f => ({ ...f, blockType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(BLOCK_TYPE_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Від *</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
            <div><Label>До *</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
          </div>
          <div><Label>Причина</Label><Input placeholder="Чому блокується…" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></div>
          <div><Label>Нотатки</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-orange-600 hover:bg-orange-700">{loading ? "…" : "Заблокувати"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
