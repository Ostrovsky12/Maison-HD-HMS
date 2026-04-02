import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Hotel, TrendingUp, Users, UtensilsCrossed, Waves, PartyPopper,
  Sparkles, MessageSquare, LogIn, LogOut, ArrowUp, ArrowDown,
  RefreshCw, Activity, BarChart3, DollarSign, BedDouble, Star,
  ChevronRight, Clock, AlertTriangle, CheckCircle2, Zap,
  Building2, PieChart, CreditCard, Target, TrendingDown, Calendar,
  AlertCircle, Percent, Hash, Banknote, Receipt,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/maison-hd";
const API = BASE.replace("/maison-hd", "") + "/api";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string) => fetch(API + path, { headers: { Authorization: `Bearer ${token()}` } });

const fmt = (n: number) => n.toLocaleString("uk");
const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}к` : n.toString();
const pct = (a: number, b: number) => b === 0 ? 0 : Math.round(((a - b) / b) * 100);

const MONTHS_UA = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
const DEPT_COLORS: Record<string, string> = { accommodation: "#3b82f6", fb: "#f97316", spa: "#14b8a6", events: "#ec4899" };
const PAYMENT_STATUS_UA: Record<string, string> = { paid: "Оплачено", partial: "Часткова", unpaid: "Не оплачено" };
const PAYMENT_STATUS_COLOR: Record<string, string> = { paid: "bg-green-100 text-green-700", partial: "bg-yellow-100 text-yellow-700", unpaid: "bg-red-100 text-red-600" };
const ORDER_STATUS_UA: Record<string, string> = { open: "Відкрито", in_kitchen: "На кухні", ready: "Готово", served: "Подано" };
const ORDER_STATUS_COLOR: Record<string, string> = { open: "bg-gray-100 text-gray-700", in_kitchen: "bg-orange-100 text-orange-700", ready: "bg-green-100 text-green-700", served: "bg-blue-100 text-blue-700" };
const SPA_STATUS_UA: Record<string, string> = { scheduled: "Заплановано", confirmed: "Підтверджено", in_progress: "Проводиться", completed: "Завершено" };
const SPA_STATUS_COLOR: Record<string, string> = { scheduled: "bg-blue-100 text-blue-700", confirmed: "bg-green-100 text-green-700", in_progress: "bg-orange-100 text-orange-700", completed: "bg-gray-100 text-gray-600" };
const EVENT_STATUS_COLOR: Record<string, string> = { inquiry: "bg-gray-100 text-gray-600", offer_sent: "bg-blue-100 text-blue-700", confirmed: "bg-green-100 text-green-700", deposit_paid: "bg-purple-100 text-purple-700", completed: "bg-indigo-100 text-indigo-700", cancelled: "bg-red-100 text-red-600" };

function KpiCard({ label, value, unit = "", sub, icon: Icon, color, trend, onClick }: any) {
  return (
    <Card className={`border-0 shadow-sm ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all" : ""}`} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color || "text-gray-900"}`}>
              {value}{unit && <span className="text-sm ml-0.5">{unit}</span>}
            </p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2 ${color ? color.replace("text-","bg-").replace("-600","-100").replace("-700","-100") : "bg-gray-100"}`}>
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

function PlanActualRow({ label, actual, target, pctVal, color = "blue" }: any) {
  const clr = pctVal >= 100 ? "bg-green-500" : pctVal >= 70 ? "bg-blue-500" : pctVal >= 40 ? "bg-yellow-500" : "bg-red-500";
  const textClr = pctVal >= 100 ? "text-green-600" : pctVal >= 70 ? "text-blue-600" : pctVal >= 40 ? "text-yellow-600" : "text-red-600";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 font-medium">{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs">{fmt(actual)} / {fmt(target)} ₴</span>
          <span className={`font-bold text-sm ${textClr}`}>{pctVal}%</span>
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${clr}`} style={{ width: `${Math.min(pctVal, 100)}%` }} />
      </div>
    </div>
  );
}

function OccupancyBar({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const clr = value >= 80 ? "bg-green-500" : value >= 60 ? "bg-blue-500" : value >= 40 ? "bg-yellow-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-gray-500 w-8 text-right">{label}</span>}
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${clr}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700 w-8">{value}%</span>
    </div>
  );
}

export default function HqPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, navigate] = useLocation();

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

  const { kpi, arrivals, departures, hk, spaToday, eventsUpcoming, fbOpenOrders, fbTables, inbox, sevenDayRevenue, byProperty, byDepartment, financials, debtors, forecast, budget } = data;
  const monthTrend = pct(kpi.revenueThisMonth, kpi.revenueLastMonth);
  const now = new Date();
  const currentMonthName = MONTHS_UA[now.getMonth()];

  const deptData = byDepartment ? [
    { name: "Проживання", value: byDepartment.accommodation?.revenue || 0, color: DEPT_COLORS.accommodation },
    { name: "F&B", value: byDepartment.fb?.revenue || 0, color: DEPT_COLORS.fb },
    { name: "SPA", value: byDepartment.spa?.revenue || 0, color: DEPT_COLORS.spa },
    { name: "Events", value: byDepartment.events?.revenue || 0, color: DEPT_COLORS.events },
  ] : [];

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">

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

        {/* TOP KPIs — always visible */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Завантаженість" value={kpi.occupancy} unit="%" icon={Hotel}
            color="text-blue-600" sub={`${kpi.inHouseCount} з ${kpi.totalUnits} юнітів`}
            onClick={() => navigate("/bookings")} />
          <KpiCard label="Виручка місяця" value={fmt(kpi.totalMonthRevenue || kpi.revenueThisMonth)} unit="₴" icon={TrendingUp}
            color="text-green-600" trend={monthTrend} sub={`Минулий: ${fmt(kpi.revenueLastMonth)} ₴`} />
          <KpiCard label="ADR (сер. тариф)" value={fmt(kpi.adr)} unit="₴" icon={Percent}
            color="text-purple-600" sub="Середній за ніч цього місяця" />
          <KpiCard label="Борги гостей" value={fmt(kpi.totalDebt)} unit="₴" icon={AlertCircle}
            color={kpi.totalDebt > 0 ? "text-red-600" : "text-gray-500"} sub={`${debtors?.length || 0} бронювань з заборг.`} />
        </div>

        <Tabs defaultValue="operations">
          <TabsList className="w-full grid grid-cols-5 h-10">
            <TabsTrigger value="operations" className="text-xs"><Activity className="h-3.5 w-3.5 mr-1" />Зараз</TabsTrigger>
            <TabsTrigger value="properties" className="text-xs"><Building2 className="h-3.5 w-3.5 mr-1" />По об'єктах</TabsTrigger>
            <TabsTrigger value="departments" className="text-xs"><PieChart className="h-3.5 w-3.5 mr-1" />Підрозділи</TabsTrigger>
            <TabsTrigger value="finance" className="text-xs"><CreditCard className="h-3.5 w-3.5 mr-1" />Фінанси</TabsTrigger>
            <TabsTrigger value="forecast" className="text-xs"><Calendar className="h-3.5 w-3.5 mr-1" />Прогноз</TabsTrigger>
          </TabsList>

          {/* ========== TAB 1: OPERATIONS ========== */}
          <TabsContent value="operations" className="space-y-4 mt-4">
            {/* Secondary KPIs */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                { icon: LogIn, val: kpi.arrivalsToday, label: "Заїздів", color: "text-green-600", path: "/bookings" },
                { icon: LogOut, val: kpi.departuresToday, label: "Виїздів", color: "text-red-500", path: "/bookings" },
                { icon: Waves, val: kpi.spaTodayCount, label: "SPA", color: "text-teal-600", path: "/spa" },
                { icon: PartyPopper, val: kpi.eventsThisWeek, label: "Events", color: "text-pink-600", path: "/events" },
                { icon: Sparkles, val: kpi.hkPending + kpi.hkInProgress, label: "HK задач", color: "text-yellow-600", path: "/housekeeping" },
                { icon: MessageSquare, val: kpi.inboxUnread, label: "Непрочит.", color: "text-blue-600", path: "/inbox" },
              ].map(({ icon: Icon, val, label, color, path }) => (
                <Card key={label} className="border-0 shadow-sm cursor-pointer hover:shadow-md" onClick={() => navigate(path)}>
                  <CardContent className="p-3 text-center">
                    <Icon className={`h-5 w-5 ${color} mx-auto mb-1`} />
                    <p className={`text-xl font-bold ${color}`}>{val}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* LEFT col */}
              <div className="space-y-4">
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

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <LogOut className="h-4 w-4 text-red-500" />Виїзди сьогодні
                      <Badge className="bg-red-100 text-red-600 ml-1">{departures.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {departures.length === 0 ? <p className="text-xs text-gray-400 py-2">Виїздів немає</p> :
                      departures.map((b: any) => (
                        <div key={b.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                          <p className="text-sm font-medium">{b.name}</p>
                        </div>
                      ))}
                  </CardContent>
                </Card>

                <Card className={`border-0 shadow-sm ${hk.pending + hk.inProgress > 0 ? "border-l-4 border-l-yellow-400" : ""}`}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-yellow-600" />Housekeeping</CardTitle>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/housekeeping")}>Деталі <ChevronRight className="h-3 w-3" /></Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-yellow-50 rounded-lg"><p className="text-lg font-bold text-yellow-700">{hk.pending}</p><p className="text-xs text-yellow-600">Очікують</p></div>
                      <div className="p-2 bg-blue-50 rounded-lg"><p className="text-lg font-bold text-blue-700">{hk.inProgress}</p><p className="text-xs text-blue-600">В роботі</p></div>
                      <div className={`p-2 rounded-lg ${hk.high > 0 ? "bg-red-50" : "bg-gray-50"}`}><p className={`text-lg font-bold ${hk.high > 0 ? "text-red-600" : "text-gray-500"}`}>{hk.high}</p><p className={`text-xs ${hk.high > 0 ? "text-red-500" : "text-gray-400"}`}>Термінових</p></div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* CENTER col */}
              <div className="space-y-4">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <UtensilsCrossed className="h-4 w-4 text-orange-600" />F&B — активні
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
                              <span className="text-sm font-medium truncate">{ord.tableNumber ? `Стіл ${ord.tableNumber}` : ord.roomNumber ? `🛏 ${ord.roomNumber}` : ord.guestName || "Замовлення"}</span>
                              <Badge className={`text-xs shrink-0 ${ORDER_STATUS_COLOR[ord.status]}`}>{ORDER_STATUS_UA[ord.status]}</Badge>
                            </div>
                            <p className="text-xs text-gray-400">{new Date(ord.openedAt).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                          <span className="text-sm font-bold text-orange-600 ml-2">{fmt(parseFloat(ord.totalAmount || 0))} ₴</span>
                        </div>
                      ))}
                    <div className="pt-1 flex gap-4 text-xs text-gray-500">
                      <span>🟢 Вільних: {fbTables.free}</span><span>🔴 Зайнятих: {fbTables.occupied}</span>
                    </div>
                  </CardContent>
                </Card>

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
                  </CardContent>
                </Card>
              </div>

              {/* RIGHT col */}
              <div className="space-y-4">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <BarChart3 className="h-4 w-4 text-blue-600" />Виручка — 7 днів
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={sevenDayRevenue} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                        <Tooltip formatter={(v: any) => [`${fmt(v)} ₴`, "Виручка"]} labelFormatter={(l) => l} />
                        <Bar dataKey="rooms" radius={[3, 3, 0, 0]}>
                          {sevenDayRevenue.map((d: any, i: number) => (
                            <Cell key={i} fill={d.isToday ? "#3b82f6" : "#bfdbfe"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>Цей місяць: <span className="font-bold text-blue-600">{fmt(kpi.revenueThisMonth)} ₴</span></span>
                      <span className={`font-medium ${monthTrend >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {monthTrend >= 0 ? "+" : ""}{monthTrend}%
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <PartyPopper className="h-4 w-4 text-pink-600" />Events
                        <Badge className="bg-pink-100 text-pink-700 ml-1">{eventsUpcoming.length}</Badge>
                      </CardTitle>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/events")}>Всі <ChevronRight className="h-3 w-3" /></Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {eventsUpcoming.length === 0 ? <p className="text-xs text-gray-400 py-2">Немає</p> :
                      eventsUpcoming.map((ev: any) => (
                        <div key={ev.id} className="py-1.5 border-b border-gray-50 last:border-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate flex-1">{ev.name}</span>
                            <Badge className={`text-xs shrink-0 ${EVENT_STATUS_COLOR[ev.status]}`}>{ev.status}</Badge>
                          </div>
                          <div className="flex justify-between mt-0.5">
                            <p className="text-xs text-gray-400">
                              {new Date(ev.eventDate).toLocaleDateString("uk", { day: "numeric", month: "short" })}
                              {ev.startTime && ` · ${ev.startTime}`}
                            </p>
                            <span className="text-xs font-bold text-pink-600">{fmt(parseFloat(ev.totalPrice || 0))} ₴</span>
                          </div>
                        </div>
                      ))}
                  </CardContent>
                </Card>

                {inbox.length > 0 && (
                  <Card className="border-0 shadow-sm border-l-4 border-l-blue-400">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                          <MessageSquare className="h-4 w-4 text-blue-600" />Inbox
                          {kpi.inboxUnread > 0 && <Badge className="bg-blue-600 text-white ml-1">{kpi.inboxUnread}</Badge>}
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/inbox")}>Відкрити <ChevronRight className="h-3 w-3" /></Button>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
                      {inbox.slice(0, 3).map((c: any) => (
                        <div key={c.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{c.guestName || c.subject}</p>
                            <p className="text-xs text-gray-400">{c.channel}</p>
                          </div>
                          <Badge className="bg-blue-600 text-white text-xs">{c.unreadCount}</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ========== TAB 2: BY PROPERTY ========== */}
          <TabsContent value="properties" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(byProperty || []).map((prop: any) => (
                <Card key={prop.id} className="border-0 shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-blue-600" />{prop.name}
                      </CardTitle>
                      <Badge className="bg-gray-100 text-gray-600">{prop.totalUnits} юн.</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    {/* Occupancy bar */}
                    <div>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Завантаженість</span>
                        <span className="font-bold">{prop.inHouse} / {prop.totalUnits}</span>
                      </div>
                      <OccupancyBar value={prop.occupancy} />
                    </div>

                    {/* Revenue */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-blue-50 rounded-lg p-2.5">
                        <p className="text-xs text-blue-600 font-medium">Виручка місяця</p>
                        <p className="text-lg font-bold text-blue-700">{fmtK(prop.revenueMonth)} ₴</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-2.5">
                        <p className="text-xs text-purple-600 font-medium">ADR</p>
                        <p className="text-lg font-bold text-purple-700">{fmt(prop.adr)} ₴</p>
                      </div>
                    </div>

                    {/* Today's movement */}
                    <div className="flex gap-3 text-xs">
                      <div className="flex items-center gap-1 text-green-600">
                        <LogIn className="h-3.5 w-3.5" />{prop.arrivalsToday} заїздів
                      </div>
                      <div className="flex items-center gap-1 text-red-500">
                        <LogOut className="h-3.5 w-3.5" />{prop.departuresToday} виїздів
                      </div>
                      <div className="flex items-center gap-1 text-gray-500">
                        <Hash className="h-3.5 w-3.5" />{prop.bookingsMonth} броніт.
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Summary table */}
            {byProperty?.length > 1 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Порівняльна таблиця об'єктів</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-gray-500">
                          <th className="text-left py-2 font-medium">Об'єкт</th>
                          <th className="text-right py-2 font-medium">Юнітів</th>
                          <th className="text-right py-2 font-medium">Завант.</th>
                          <th className="text-right py-2 font-medium">Виручка</th>
                          <th className="text-right py-2 font-medium">ADR</th>
                          <th className="text-right py-2 font-medium">Бронів</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byProperty.map((p: any) => (
                          <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 font-medium">{p.name}</td>
                            <td className="py-2 text-right text-gray-600">{p.totalUnits}</td>
                            <td className="py-2 text-right">
                              <span className={`font-bold ${p.occupancy >= 70 ? "text-green-600" : p.occupancy >= 40 ? "text-yellow-600" : "text-red-500"}`}>{p.occupancy}%</span>
                            </td>
                            <td className="py-2 text-right font-bold text-blue-600">{fmt(p.revenueMonth)} ₴</td>
                            <td className="py-2 text-right text-purple-600">{fmt(p.adr)} ₴</td>
                            <td className="py-2 text-right text-gray-600">{p.bookingsMonth}</td>
                          </tr>
                        ))}
                        <tr className="font-bold bg-gray-50">
                          <td className="py-2">Всього</td>
                          <td className="py-2 text-right">{byProperty.reduce((s: number, p: any) => s + p.totalUnits, 0)}</td>
                          <td className="py-2 text-right text-blue-600">{kpi.occupancy}%</td>
                          <td className="py-2 text-right text-blue-600">{fmt(byProperty.reduce((s: number, p: any) => s + p.revenueMonth, 0))} ₴</td>
                          <td className="py-2 text-right text-purple-600">{fmt(kpi.adr)} ₴</td>
                          <td className="py-2 text-right">{byProperty.reduce((s: number, p: any) => s + p.bookingsMonth, 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ========== TAB 3: DEPARTMENTS ========== */}
          <TabsContent value="departments" className="mt-4 space-y-4">
            {/* Revenue by department */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {byDepartment && Object.entries(byDepartment).map(([key, dept]: [string, any]) => (
                <Card key={key} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-500 font-medium">{dept.label}</p>
                      <Badge style={{ backgroundColor: `${DEPT_COLORS[key]}20`, color: DEPT_COLORS[key] }} className="text-xs">{dept.share}%</Badge>
                    </div>
                    <p className="text-2xl font-bold" style={{ color: DEPT_COLORS[key] }}>{fmtK(dept.revenue)} ₴</p>
                    {dept.bookings !== undefined && <p className="text-xs text-gray-400 mt-1">{dept.bookings} бронювань</p>}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Bar chart */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">Виручка по підрозділах — {currentMonthName}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={deptData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} />
                    <Tooltip formatter={(v: any) => [`${fmt(v)} ₴`, "Виручка"]} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {deptData.map((entry: any, i: number) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Donut representation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Структура виручки</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {byDepartment && Object.entries(byDepartment).map(([key, dept]: [string, any]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DEPT_COLORS[key] }} />
                          <span className="font-medium text-gray-700">{dept.label}</span>
                        </div>
                        <span className="text-gray-600">{fmt(dept.revenue)} ₴</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full">
                        <div className="h-full rounded-full" style={{ width: `${dept.share}%`, backgroundColor: DEPT_COLORS[key] }} />
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t">
                    <div className="flex justify-between font-bold text-sm">
                      <span>Всього</span>
                      <span className="text-blue-600">{fmt(financials?.totalMonthRevenue || 0)} ₴</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Завантаженість та ADR</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                      <Hotel className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-blue-600">{kpi.occupancy}%</p>
                      <p className="text-xs text-blue-500">Завантаженість</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-3 text-center">
                      <Banknote className="h-5 w-5 text-purple-600 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-purple-600">{fmt(kpi.adr)}</p>
                      <p className="text-xs text-purple-500">ADR (₴/ніч)</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <BedDouble className="h-5 w-5 text-green-600 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-green-600">{kpi.inHouseCount}</p>
                      <p className="text-xs text-green-500">Гостей зараз</p>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-3 text-center">
                      <Receipt className="h-5 w-5 text-orange-600 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-orange-600">{fmt(kpi.revenueToday)}</p>
                      <p className="text-xs text-orange-500">Виручка сьогодні</p>
                    </div>
                  </div>
                  {byProperty?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-gray-500 font-medium">Завантаженість по об'єктах</p>
                      {byProperty.map((p: any) => (
                        <OccupancyBar key={p.id} value={p.occupancy} label={p.name.slice(0, 6)} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ========== TAB 4: FINANCE ========== */}
          <TabsContent value="finance" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Payments breakdown */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-blue-600" />Оплати цього місяця
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-sm text-gray-600">Оплачено</span></div>
                      <span className="font-bold text-green-600">{financials?.paidCount || 0} броніт.</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-yellow-500" /><span className="text-sm text-gray-600">Часткова</span></div>
                      <span className="font-bold text-yellow-600">{financials?.partialCount || 0} броніт.</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-sm text-gray-600">Не оплачено</span></div>
                      <span className="font-bold text-red-600">{financials?.unpaidCount || 0} броніт.</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Отримано</span>
                      <span className="font-bold text-green-600">{fmt(financials?.paidThisMonth || 0)} ₴</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Борг</span>
                      <span className="font-bold text-red-600">{fmt(kpi.totalDebt)} ₴</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span>Загалом місяць</span>
                      <span className="text-blue-600">{fmt(kpi.revenueThisMonth)} ₴</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Key metrics */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-green-600" />Ключові метрики
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {[
                    { label: "ADR (середній тариф)", value: `${fmt(kpi.adr)} ₴/ніч`, color: "text-purple-600" },
                    { label: "RevPAR", value: `${fmt(Math.round((kpi.adr || 0) * (kpi.occupancy || 0) / 100))} ₴`, color: "text-blue-600" },
                    { label: "YTD виручка (проживання)", value: `${fmtK(kpi.revenueYTD || 0)} ₴`, color: "text-green-600" },
                    { label: "Загалом місяць (всі підрозд.)", value: `${fmt(financials?.totalMonthRevenue || 0)} ₴`, color: "text-indigo-600" },
                    { label: "Відсоток збору", value: financials?.totalMonthRevenue > 0 ? `${Math.round(((financials?.paidThisMonth || 0) / financials.totalMonthRevenue) * 100)}%` : "—", color: "text-teal-600" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between items-baseline">
                      <span className="text-xs text-gray-500">{label}</span>
                      <span className={`font-bold text-sm ${color}`}>{value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Plan vs Actual */}
              {budget ? (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <Target className="h-4 w-4 text-orange-600" />План / Факт — {currentMonthName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <PlanActualRow label="Загальний план" actual={budget.actuals.total} target={budget.targets.total} pctVal={budget.pct.total} />
                    <PlanActualRow label="Проживання" actual={budget.actuals.accommodation} target={budget.targets.accommodation} pctVal={budget.pct.accommodation} />
                    <PlanActualRow label="F&B" actual={budget.actuals.fb} target={budget.targets.fb} pctVal={budget.pct.fb} />
                    <PlanActualRow label="SPA" actual={budget.actuals.spa} target={budget.targets.spa} pctVal={budget.pct.spa} />
                    <PlanActualRow label="Events" actual={budget.actuals.events} target={budget.targets.events} pctVal={budget.pct.events} />
                    <div className="pt-2 border-t grid grid-cols-2 gap-2 text-center">
                      <div>
                        <p className="text-xs text-gray-500">Завант. план/факт</p>
                        <p className="font-bold text-sm">{kpi.occupancy}% / {budget.targets.occupancy}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">ADR план/факт</p>
                        <p className="font-bold text-sm">{fmt(kpi.adr)} / {fmt(budget.targets.adr)} ₴</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-0 shadow-sm border-dashed">
                  <CardContent className="p-6 text-center text-gray-400">
                    <Target className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">Бюджет на поточний місяць не задано</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Debtors table */}
            {debtors && debtors.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-red-500" />Борги гостей
                      <Badge className="bg-red-100 text-red-600 ml-1">{debtors.length}</Badge>
                    </CardTitle>
                    <span className="text-sm font-bold text-red-600">{fmt(kpi.totalDebt)} ₴ всього</span>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-gray-500">
                          <th className="text-left py-2 font-medium">Гість</th>
                          <th className="text-left py-2 font-medium">Реф.</th>
                          <th className="text-right py-2 font-medium">Заїзд</th>
                          <th className="text-right py-2 font-medium">Виїзд</th>
                          <th className="text-right py-2 font-medium">Сума</th>
                          <th className="text-right py-2 font-medium">Оплачено</th>
                          <th className="text-right py-2 font-medium">Борг</th>
                          <th className="text-right py-2 font-medium">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {debtors.map((d: any) => (
                          <tr key={d.id} className="border-b border-gray-50 hover:bg-red-50/30">
                            <td className="py-2 font-medium">{d.name}</td>
                            <td className="py-2 text-gray-500 text-xs">{d.bookingRef || "—"}</td>
                            <td className="py-2 text-right text-xs text-gray-500">{d.checkIn}</td>
                            <td className="py-2 text-right text-xs text-gray-500">{d.checkOut}</td>
                            <td className="py-2 text-right text-gray-700">{fmt(d.totalAmount)} ₴</td>
                            <td className="py-2 text-right text-green-600">{fmt(d.paidAmount)} ₴</td>
                            <td className="py-2 text-right font-bold text-red-600">{fmt(d.debt)} ₴</td>
                            <td className="py-2 text-right">
                              <Badge className={`text-xs ${PAYMENT_STATUS_COLOR[d.paymentStatus]}`}>{PAYMENT_STATUS_UA[d.paymentStatus]}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ========== TAB 5: FORECAST ========== */}
          <TabsContent value="forecast" className="mt-4 space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {forecast && [
                { label: "Сер. завант. 7 днів", value: forecast.slice(0, 7).length > 0 ? Math.round(forecast.slice(0, 7).reduce((s: number, d: any) => s + d.occupancy, 0) / 7) + "%" : "—", color: "text-blue-600", icon: Hotel },
                { label: "Сер. завант. 30 днів", value: forecast.length > 0 ? Math.round(forecast.reduce((s: number, d: any) => s + d.occupancy, 0) / forecast.length) + "%" : "—", color: "text-purple-600", icon: BarChart3 },
                { label: "Заїздів наступні 7 дн.", value: forecast.slice(0, 7).reduce((s: number, d: any) => s + d.arrivals, 0), color: "text-green-600", icon: LogIn },
                { label: "Заїздів наступні 30 дн.", value: forecast.reduce((s: number, d: any) => s + d.arrivals, 0), color: "text-teal-600", icon: Calendar },
              ].map(({ label, value, color, icon: Icon }) => (
                <Card key={label} className="border-0 shadow-sm">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color.replace("text-", "bg-").replace("-600", "-100")}`}>
                      <Icon className={`h-5 w-5 ${color}`} />
                    </div>
                    <div>
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-gray-500">{label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Occupancy chart */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">Прогноз завантаженості — 30 днів</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={forecast || []} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: any) => [`${v}%`, "Завантаженість"]} labelFormatter={(l) => l} />
                    <Area type="monotone" dataKey="occupancy" stroke="#3b82f6" fill="url(#occGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Calendar grid */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">Деталі по днях</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-1.5">
                  {(forecast || []).map((d: any) => {
                    const occ = d.occupancy;
                    const bg = occ >= 80 ? "bg-green-500 text-white" : occ >= 60 ? "bg-blue-400 text-white" : occ >= 40 ? "bg-yellow-400 text-gray-800" : occ >= 20 ? "bg-orange-200 text-gray-700" : "bg-gray-100 text-gray-500";
                    return (
                      <div key={d.date} className={`rounded-lg p-1.5 text-center ${bg} ${d.isToday ? "ring-2 ring-blue-700" : ""} ${d.isWeekend ? "ring-1 ring-inset ring-white/30" : ""}`} title={`${d.label}: ${occ}%, ${d.arrivals} заїздів`}>
                        <p className="text-xs font-bold">{new Date(d.date).getDate()}</p>
                        <p className="text-xs">{occ}%</p>
                        {d.arrivals > 0 && <p className="text-xs opacity-80">+{d.arrivals}</p>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" />80%+</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-400" />60-79%</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-400" />40-59%</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-200" />20-39%</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-100" />&lt;20%</div>
                  <span className="ml-2 text-gray-400">+N = кількість заїздів</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
