import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "wouter";
import {
  Hotel, TrendingUp, Users, UtensilsCrossed, Waves, PartyPopper,
  Sparkles, MessageSquare, LogIn, LogOut, ArrowUp, ArrowDown,
  RefreshCw, Activity, BarChart3, DollarSign, BedDouble, Star,
  ChevronRight, Clock, AlertTriangle, CheckCircle2, Zap,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/maison-hd";
const API = BASE.replace("/maison-hd", "") + "/api";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string) => fetch(API + path, { headers: { Authorization: `Bearer ${token()}` } });

const ORDER_STATUS_UA: Record<string, string> = { open: "Відкрито", in_kitchen: "На кухні", ready: "Готово", served: "Подано" };
const ORDER_STATUS_COLOR: Record<string, string> = {
  open: "bg-gray-100 text-gray-700", in_kitchen: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700", served: "bg-blue-100 text-blue-700",
};
const EVENT_TYPE_UA: Record<string, string> = {
  wedding: "Весілля", corporate: "Корпоратив", birthday: "День народження",
  conference: "Конференція", gala: "Гала-вечір", seminar: "Семінар", party: "Вечірка", other: "Інше",
};
const EVENT_STATUS_COLOR: Record<string, string> = {
  inquiry: "bg-gray-100 text-gray-600", offer_sent: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700", deposit_paid: "bg-purple-100 text-purple-700",
  completed: "bg-indigo-100 text-indigo-700", cancelled: "bg-red-100 text-red-600",
};
const SPA_STATUS_UA: Record<string, string> = { scheduled: "Заплановано", confirmed: "Підтверджено", in_progress: "Проводиться", completed: "Завершено" };
const SPA_STATUS_COLOR: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700", confirmed: "bg-green-100 text-green-700",
  in_progress: "bg-orange-100 text-orange-700", completed: "bg-gray-100 text-gray-600",
};

const fmt = (n: number) => n.toLocaleString("uk");
const pct = (a: number, b: number) => b === 0 ? 0 : Math.round(((a - b) / b) * 100);

function KpiCard({ label, value, unit = "", sub, icon: Icon, color, trend, onClick }: any) {
  return (
    <Card className={`border-0 shadow-sm cursor-pointer hover:shadow-md transition-all ${onClick ? "hover:-translate-y-0.5" : ""}`} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color || "text-gray-900"}`}>
              {value}{unit && <span className="text-sm ml-0.5">{unit}</span>}
            </p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2 ${color ? color.replace("text-", "bg-").replace("-600", "-100").replace("-700", "-100") : "bg-gray-100"}`}>
            <Icon className={`h-5 w-5 ${color || "text-gray-600"}`} />
          </div>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend >= 0 ? "text-green-600" : "text-red-500"}`}>
            {trend >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(trend)}% vs минулий місяць
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniBarChart({ data }: { data: Array<{ label: string; rooms: number; date: string }> }) {
  const max = Math.max(...data.map(d => d.rooms), 1);
  const today = new Date().toISOString().split("T")[0];
  return (
    <div className="flex items-end gap-1.5 h-20 mt-2">
      {data.map((d, i) => {
        const h = Math.round((d.rooms / max) * 100);
        const isToday = d.date === today;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full relative flex items-end" style={{ height: "56px" }}>
              <div
                className={`w-full rounded-t-sm transition-all ${isToday ? "bg-blue-500" : "bg-blue-200"}`}
                style={{ height: `${Math.max(h, 4)}%` }}
                title={`${d.label}: ${fmt(d.rooms)} ₴`}
              />
            </div>
            <span className={`text-xs ${isToday ? "font-bold text-blue-600" : "text-gray-400"}`}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function HqPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/hq/overview");
      if (r.ok) { setData(await r.json()); setLastUpdated(new Date()); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 60_000); return () => clearInterval(iv); }, [load]);

  if (loading && !data) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64 text-gray-400">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />Завантаження…
      </div>
    </AppLayout>
  );

  if (!data) return <AppLayout><div className="p-8 text-center text-gray-400">Помилка завантаження</div></AppLayout>;

  const { kpi, arrivals, departures, inHouse, hk, spaToday, eventsUpcoming, fbOpenOrders, fbTables, inbox, sevenDayRevenue } = data;
  const monthTrend = pct(kpi.revenueThisMonth, kpi.revenueLastMonth);
  const now = new Date();

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-6 w-6 text-blue-600" />Command Center
            </h1>
            <p className="text-gray-500 text-sm">
              {now.toLocaleDateString("uk", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {lastUpdated && <span className="ml-2 text-gray-400">· оновлено о {lastUpdated.toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })}</span>}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Оновити
          </Button>
        </div>

        {/* PRIMARY KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Завантаженість" value={kpi.occupancy} unit="%" icon={Hotel}
            color="text-blue-600" sub={`${kpi.inHouseCount} з ${kpi.totalUnits} номерів`}
            onClick={() => navigate("/bookings")} />
          <KpiCard label="Виручка сьогодні" value={fmt(kpi.revenueToday)} unit="₴" icon={DollarSign}
            color="text-green-600" sub={`SPA: ${fmt(kpi.spaRevenueToday)} · F&B: ${fmt(kpi.fbRevenueToday)}`} />
          <KpiCard label="Виручка цього місяця" value={fmt(kpi.revenueThisMonth)} unit="₴" icon={TrendingUp}
            color="text-purple-600" trend={monthTrend} sub={`Минулий: ${fmt(kpi.revenueLastMonth)} ₴`} />
          <KpiCard label="Відкрито замовлень" value={kpi.fbOpenOrders} icon={UtensilsCrossed}
            color="text-orange-600" sub={`Столів: ${fbTables.occupied}/${fbTables.total} зайнято`}
            onClick={() => navigate("/fb")} />
        </div>

        {/* SECONDARY KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md" onClick={() => navigate("/bookings")}>
            <CardContent className="p-3 text-center">
              <LogIn className="h-5 w-5 text-green-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-green-600">{kpi.arrivalsToday}</p>
              <p className="text-xs text-gray-500">Заїздів сьогодні</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md" onClick={() => navigate("/bookings")}>
            <CardContent className="p-3 text-center">
              <LogOut className="h-5 w-5 text-red-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-red-500">{kpi.departuresToday}</p>
              <p className="text-xs text-gray-500">Виїздів сьогодні</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md" onClick={() => navigate("/spa")}>
            <CardContent className="p-3 text-center">
              <Waves className="h-5 w-5 text-teal-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-teal-600">{kpi.spaTodayCount}</p>
              <p className="text-xs text-gray-500">SPA сьогодні</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md" onClick={() => navigate("/events")}>
            <CardContent className="p-3 text-center">
              <PartyPopper className="h-5 w-5 text-pink-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-pink-600">{kpi.eventsThisWeek}</p>
              <p className="text-xs text-gray-500">Events тижня</p>
            </CardContent>
          </Card>
          <Card className={`border-0 shadow-sm cursor-pointer hover:shadow-md ${kpi.hkPending + kpi.hkInProgress > 0 ? "ring-1 ring-yellow-300" : ""}`} onClick={() => navigate("/housekeeping")}>
            <CardContent className="p-3 text-center">
              <Sparkles className="h-5 w-5 text-yellow-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-yellow-600">{kpi.hkPending + kpi.hkInProgress}</p>
              <p className="text-xs text-gray-500">HK завдань</p>
            </CardContent>
          </Card>
          <Card className={`border-0 shadow-sm cursor-pointer hover:shadow-md ${kpi.inboxUnread > 0 ? "ring-1 ring-blue-300" : ""}`} onClick={() => navigate("/inbox")}>
            <CardContent className="p-3 text-center">
              <MessageSquare className="h-5 w-5 text-blue-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-blue-600">{kpi.inboxUnread}</p>
              <p className="text-xs text-gray-500">Непрочитаних</p>
            </CardContent>
          </Card>
        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* LEFT: Arrivals + Departures */}
          <div className="lg:col-span-1 space-y-4">

            {/* Arrivals */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <LogIn className="h-4 w-4 text-green-600" />Заїзди сьогодні
                    <Badge className="bg-green-100 text-green-700 ml-1">{arrivals.length}</Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/bookings")}>Всі <ChevronRight className="h-3 w-3" /></Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {arrivals.length === 0 ? <p className="text-xs text-gray-400 py-2">Заїздів немає</p> :
                  arrivals.map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{b.name}</p>
                        <p className="text-xs text-gray-400">{b.guestCount} ос. · виїзд {b.checkOut}</p>
                      </div>
                      <CheckCircle2 className="h-4 w-4 text-gray-300" />
                    </div>
                  ))}
              </CardContent>
            </Card>

            {/* Departures */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <LogOut className="h-4 w-4 text-red-500" />Виїзди сьогодні
                    <Badge className="bg-red-100 text-red-600 ml-1">{departures.length}</Badge>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {departures.length === 0 ? <p className="text-xs text-gray-400 py-2">Виїздів немає</p> :
                  departures.map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{b.name}</p>
                        <p className="text-xs text-gray-400">{b.guestCount} ос.</p>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>

            {/* Housekeeping */}
            <Card className={`border-0 shadow-sm ${hk.pending + hk.inProgress > 0 ? "border-l-4 border-l-yellow-400" : ""}`}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-yellow-600" />Housekeeping
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/housekeeping")}>Деталі <ChevronRight className="h-3 w-3" /></Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-yellow-50 rounded-lg">
                    <p className="text-lg font-bold text-yellow-700">{hk.pending}</p>
                    <p className="text-xs text-yellow-600">Очікують</p>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <p className="text-lg font-bold text-blue-700">{hk.inProgress}</p>
                    <p className="text-xs text-blue-600">В роботі</p>
                  </div>
                  <div className={`p-2 rounded-lg ${hk.high > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                    <p className={`text-lg font-bold ${hk.high > 0 ? "text-red-600" : "text-gray-500"}`}>{hk.high}</p>
                    <p className={`text-xs ${hk.high > 0 ? "text-red-500" : "text-gray-400"}`}>Термінових</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* CENTER: F&B + SPA */}
          <div className="lg:col-span-1 space-y-4">

            {/* F&B live orders */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <UtensilsCrossed className="h-4 w-4 text-orange-600" />F&B — активні замовлення
                    <Badge className="bg-orange-100 text-orange-700 ml-1">{fbOpenOrders.length}</Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/fb")}>Зал <ChevronRight className="h-3 w-3" /></Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {fbOpenOrders.length === 0 ? <p className="text-xs text-gray-400 py-2">Активних замовлень немає</p> :
                  fbOpenOrders.map((ord: any) => (
                    <div key={ord.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">
                            {ord.tableNumber ? `Стіл ${ord.tableNumber}` : ord.roomNumber ? `🛏 ${ord.roomNumber}` : ord.guestName || "Замовлення"}
                          </span>
                          <Badge className={`text-xs shrink-0 ${ORDER_STATUS_COLOR[ord.status]}`}>{ORDER_STATUS_UA[ord.status]}</Badge>
                        </div>
                        <p className="text-xs text-gray-400">
                          {new Date(ord.openedAt).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-orange-600 ml-2">{fmt(parseFloat(ord.totalAmount || 0))} ₴</span>
                    </div>
                  ))}
                <div className="pt-1 flex gap-4 text-xs text-gray-500">
                  <span>🟢 Вільних: {fbTables.free}</span>
                  <span>🔴 Зайнятих: {fbTables.occupied}</span>
                </div>
              </CardContent>
            </Card>

            {/* SPA today */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <Waves className="h-4 w-4 text-teal-600" />SPA — сьогодні
                    <Badge className="bg-teal-100 text-teal-700 ml-1">{spaToday.length}</Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/spa")}>Розклад <ChevronRight className="h-3 w-3" /></Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {spaToday.length === 0 ? <p className="text-xs text-gray-400 py-2">Записів немає</p> :
                  spaToday.map((apt: any) => (
                    <div key={apt.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-gray-400 shrink-0" />
                          <span className="text-xs font-medium text-gray-600">{apt.startTime}–{apt.endTime}</span>
                          <Badge className={`text-xs ${SPA_STATUS_COLOR[apt.status]}`}>{SPA_STATUS_UA[apt.status]}</Badge>
                        </div>
                        <p className="text-sm font-medium truncate">{apt.guestName}</p>
                        <p className="text-xs text-gray-400 truncate">{apt.serviceName}</p>
                      </div>
                      <span className="text-sm font-bold text-teal-600 ml-2">{fmt(parseFloat(apt.totalPrice || 0))} ₴</span>
                    </div>
                  ))}
                {kpi.spaRevenueToday > 0 && (
                  <div className="pt-1 text-xs text-gray-500">Виручка сьогодні: <span className="font-bold text-teal-600">{fmt(kpi.spaRevenueToday)} ₴</span></div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: Events + Inbox + Chart */}
          <div className="lg:col-span-1 space-y-4">

            {/* Revenue chart */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-blue-600" />Виручка — 7 днів
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <MiniBarChart data={sevenDayRevenue} />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Цей місяць: <span className="font-bold text-blue-600">{fmt(kpi.revenueThisMonth)} ₴</span></span>
                  <span className={`font-medium ${monthTrend >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {monthTrend >= 0 ? "+" : ""}{monthTrend}%
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Events upcoming */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <PartyPopper className="h-4 w-4 text-pink-600" />Events — цей тиждень
                    <Badge className="bg-pink-100 text-pink-700 ml-1">{eventsUpcoming.length}</Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/events")}>Всі <ChevronRight className="h-3 w-3" /></Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {eventsUpcoming.length === 0 ? <p className="text-xs text-gray-400 py-2">Заходів немає</p> :
                  eventsUpcoming.map((ev: any) => (
                    <div key={ev.id} className="py-1.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate flex-1">{ev.name}</span>
                        <Badge className={`text-xs shrink-0 ${EVENT_STATUS_COLOR[ev.status]}`}>{ev.status}</Badge>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-gray-400">
                          {new Date(ev.eventDate).toLocaleDateString("uk", { day: "numeric", month: "short" })}
                          {ev.startTime && ` · ${ev.startTime}`}
                          {ev.spaceName && ` · ${ev.spaceName}`}
                        </p>
                        <span className="text-xs font-bold text-pink-600">{fmt(parseFloat(ev.totalPrice || 0))} ₴</span>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>

            {/* Inbox unread */}
            <Card className={`border-0 shadow-sm ${inbox.length > 0 ? "border-l-4 border-l-blue-400" : ""}`}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4 text-blue-600" />Inbox — непрочитані
                    {kpi.inboxUnread > 0 && <Badge className="bg-blue-600 text-white ml-1">{kpi.inboxUnread}</Badge>}
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/inbox")}>Inbox <ChevronRight className="h-3 w-3" /></Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {inbox.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-500" />Всі повідомлення прочитано</p>
                ) : inbox.map((c: any) => (
                  <div key={c.id} className="flex items-start justify-between py-1.5 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded px-1" onClick={() => navigate("/inbox")}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{c.guestName || c.subject || "Гість"}</span>
                        <Badge className="bg-blue-100 text-blue-700 text-xs shrink-0">{c.channel}</Badge>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{c.subject}</p>
                    </div>
                    {c.unreadCount > 0 && (
                      <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center ml-2 shrink-0">{c.unreadCount}</span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* In-house guests (compact row at bottom) */}
        {inHouse.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <BedDouble className="h-4 w-4 text-gray-600" />Зараз у готелі — {inHouse.length} бронювань
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/bookings")}>Всі <ChevronRight className="h-3 w-3" /></Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                {inHouse.map((b: any) => (
                  <div key={b.id} className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-2">
                    <Users className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-sm font-medium">{b.name}</span>
                    <span className="text-xs text-gray-400">до {b.checkOut}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
