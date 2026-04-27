import { useState, useEffect, useCallback, useRef } from "react";
import { useGetOccupancyAnalytics, useListNightAudits, useRunNightAudit } from "@workspace/api-client-react";
import { format, subDays, startOfMonth, subMonths, startOfYear, subYears } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Loader2, Calendar, Moon, Play, TrendingUp, Users, Hotel, DollarSign,
  CheckCircle2, AlertCircle, Printer, FileText, BarChart2, RefreshCw,
  ArrowUpRight, ArrowDownRight, Minus, Building2, Crown, Sparkles, ArrowLeftRight,
  Repeat2, ShoppingCart, Package, Landmark, UtensilsCrossed, BedDouble, ConciergeBell,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/reports";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const STATUS_UA: Record<string, string> = { confirmed: "Підтверджено", checked_in: "Проживає", checked_out: "Виїхав", pending: "Очікує", cancelled: "Скасовано" };
const PAY_UA: Record<string, string> = { paid: "Сплачено", unpaid: "Не сплачено", partial: "Частково" };
const SOURCE_UA: Record<string, string> = { direct: "Прямий", booking: "Booking.com", airbnb: "Airbnb", other: "Інший" };
const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6"];

const fmtUAH = (v: number) => new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", minimumFractionDigits: 0 }).format(v || 0);
const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}к ₴` : `${v} ₴`;
const fmtPct = (v: number) => `${v}%`;

const TABS = [
  { id: "summary",    label: "Зведення",       icon: BarChart2 },
  { id: "bookings",   label: "Бронювання",      icon: FileText },
  { id: "guests",     label: "Гості",           icon: Users },
  { id: "financial",  label: "Фінанси",         icon: DollarSign },
  { id: "units",      label: "Будинки",         icon: Building2 },
  { id: "services",   label: "Послуги",         icon: Package },
  { id: "comparison", label: "Порівняння",      icon: ArrowLeftRight },
  { id: "owner",      label: "Власник",         icon: Crown },
  { id: "housekeeping", label: "Прибирання",    icon: Sparkles },
  { id: "audit",      label: "Нічний аудит",    icon: Moon },
];

const SERVICE_CATEGORY_ICONS: Record<string, any> = {
  accommodation: BedDouble,
  touristTax: Landmark,
  addons: Package,
  serviceOrders: ConciergeBell,
  minibar: UtensilsCrossed,
};
const SERVICE_CATEGORY_COLORS: Record<string, string> = {
  accommodation: "#6366f1",
  touristTax: "#22c55e",
  addons: "#f59e0b",
  serviceOrders: "#ec4899",
  minibar: "#06b6d4",
};

// Delta badge helper
function Delta({ curr, prev, suffix = "" }: { curr: number; prev: number; suffix?: string }) {
  if (!prev) return <span className="text-gray-400 text-xs">—</span>;
  const pct = Math.round(((curr - prev) / prev) * 100);
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct)}%{suffix}
    </span>
  );
}

export default function ReportsPage() {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState("summary");
  const [summary, setSummary] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [guestsData, setGuestsData] = useState<any>(null);
  const [financialData, setFinancialData] = useState<any>(null);
  const [unitsData, setUnitsData] = useState<any>(null);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [ownerData, setOwnerData] = useState<any>(null);
  const [hkData, setHkData] = useState<any>(null);
  const [servicesData, setServicesData] = useState<any>(null);

  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const setLoad = (key: string, v: boolean) => setLoading(p => ({ ...p, [key]: v }));

  // Global date range
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  // Comparison mode
  const [cmpMode, setCmpMode] = useState<"month" | "year" | "custom">("month");
  const [p1from, setP1from] = useState(format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"));
  const [p1to, setP1to] = useState(format(subDays(startOfMonth(new Date()), 1), "yyyy-MM-dd"));
  const [p2from, setP2from] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [p2to, setP2to] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: analytics, isLoading: analyticsLoading } = useGetOccupancyAnalytics({ dateFrom: format(subDays(new Date(), 30), "yyyy-MM-dd"), dateTo: dateTo });
  const { data: nightAudits, refetch: refetchAudits } = useListNightAudits({});
  const runAuditMutation = useRunNightAudit();

  const load = useCallback(async (key: string, path: string, setter: (d: any) => void) => {
    setLoad(key, true);
    const r = await apiFetch(path);
    if (r.ok) setter(await r.json());
    setLoad(key, false);
  }, []);

  const loadSummary = useCallback(() => load("summary", `/summary?from=${dateFrom}&to=${dateTo}`, setSummary), [dateFrom, dateTo, load]);
  const loadBookings = useCallback(() => load("bookings", `/bookings?from=${dateFrom}&to=${dateTo}`, d => setBookings(d.bookings || [])), [dateFrom, dateTo, load]);
  const loadGuests = useCallback(() => load("guests", `/guests?from=${dateFrom}&to=${dateTo}`, setGuestsData), [dateFrom, dateTo, load]);
  const loadFinancial = useCallback(() => load("financial", `/financial?from=${dateFrom}&to=${dateTo}`, setFinancialData), [dateFrom, dateTo, load]);
  const loadUnits = useCallback(() => load("units", `/units-perf?from=${dateFrom}&to=${dateTo}`, setUnitsData), [dateFrom, dateTo, load]);
  const loadOwner = useCallback(() => load("owner", `/owner?from=${dateFrom}&to=${dateTo}`, setOwnerData), [dateFrom, dateTo, load]);
  const loadHk = useCallback(() => load("hk", `/housekeeping`, setHkData), [load]);
  const loadServices = useCallback(() => load("services", `/services?from=${dateFrom}&to=${dateTo}`, setServicesData), [dateFrom, dateTo, load]);

  const loadComparison = useCallback(() => {
    let f1 = p1from, t1 = p1to, f2 = p2from, t2 = p2to;
    if (cmpMode === "month") {
      const prev = subMonths(new Date(), 1);
      f1 = format(startOfMonth(prev), "yyyy-MM-dd");
      t1 = format(subDays(startOfMonth(new Date()), 1), "yyyy-MM-dd");
      f2 = format(startOfMonth(new Date()), "yyyy-MM-dd");
      t2 = format(new Date(), "yyyy-MM-dd");
    } else if (cmpMode === "year") {
      const prevYear = subYears(new Date(), 1);
      f1 = format(startOfMonth(prevYear), "yyyy-MM-dd");
      t1 = format(new Date(prevYear.getFullYear(), prevYear.getMonth() + 1, 0), "yyyy-MM-dd");
      f2 = format(startOfMonth(new Date()), "yyyy-MM-dd");
      t2 = format(new Date(), "yyyy-MM-dd");
    }
    load("comparison", `/comparison?p1from=${f1}&p1to=${t1}&p2from=${f2}&p2to=${t2}`, setComparisonData);
  }, [cmpMode, p1from, p1to, p2from, p2to, load]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    if (tab === "bookings") loadBookings();
    else if (tab === "guests") loadGuests();
    else if (tab === "financial") loadFinancial();
    else if (tab === "units") loadUnits();
    else if (tab === "comparison") loadComparison();
    else if (tab === "owner") loadOwner();
    else if (tab === "housekeeping") loadHk();
    else if (tab === "services") loadServices();
  }, [tab]);

  const handleRunAudit = () => {
    runAuditMutation.mutate({ data: {} }, {
      onSuccess: (data) => { refetchAudits(); toast({ title: "Нічний аудит виконано", description: `Дата: ${data.auditDate} · Завантаженість: ${data.occupancyRate?.toFixed(1)}%` }); },
      onError: () => toast({ title: "Помилка", description: "Не вдалося виконати нічний аудит", variant: "destructive" }),
    });
  };

  const chartData = (analytics || []).map((item: any) => ({ ...item, dateLabel: format(new Date(item.date), "d MMM", { locale: uk }) }));
  const latestAudit = (nightAudits || [])[0];

  const refreshAll = () => {
    loadSummary();
    if (tab === "bookings") loadBookings();
    else if (tab === "guests") loadGuests();
    else if (tab === "financial") loadFinancial();
    else if (tab === "units") loadUnits();
    else if (tab === "comparison") loadComparison();
    else if (tab === "owner") loadOwner();
    else if (tab === "housekeeping") loadHk();
    else if (tab === "services") loadServices();
  };

  const isLoading = (key: string) => !!loading[key];

  return (
    <AppLayout>
      <style>{`
        @media print { nav, header, [data-sidebar], .no-print { display: none !important; } body { background: white !important; } .print-full { padding: 0 !important; max-width: 100% !important; } .print-table { font-size: 11px; } }
      `}</style>

      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto print-full" ref={printRef}>
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart2 className="h-7 w-7 text-violet-600" />Аналітика та Звіти</h1>
            <p className="text-gray-500 text-sm">Детальний аналіз доходів, завантаженості та бронювань</p>
          </div>
          <div className="flex items-center gap-2 no-print flex-wrap">
            <div className="flex items-center gap-1 text-xs text-gray-500 border rounded-lg px-2 py-1">
              <Calendar className="h-3.5 w-3.5" />
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-transparent text-xs" />
              <span>→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-transparent text-xs" />
            </div>
            <Button variant="outline" size="sm" onClick={refreshAll}><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Друк</Button>
          </div>
        </div>

        {/* Quick KPI strip */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { bg: "bg-violet-50", icon: DollarSign, ic: "text-violet-600", label: "Виручка", value: `${Math.round(summary.revenue?.total || 0).toLocaleString()} ₴`, sub: summary.revenue?.outstanding > 0 ? `Борг: ${Math.round(summary.revenue.outstanding).toLocaleString()} ₴` : "Сплачено повністю", sColor: summary.revenue?.outstanding > 0 ? "text-red-500" : "text-emerald-600" },
              { bg: "bg-blue-50", icon: Hotel, ic: "text-blue-600", label: "Завантаженість", value: `${summary.occupancy?.avgPercent ?? 0}%`, sub: `${summary.occupancy?.totalNights} ліжко-ночей`, sColor: "text-blue-500" },
              { bg: "bg-green-50", icon: Users, ic: "text-green-600", label: "Гостей", value: `${summary.guests?.total || 0}`, sub: `Ср. перебування: ${summary.guests?.avgStay} н.`, sColor: "text-green-500" },
              { bg: "bg-amber-50", icon: FileText, ic: "text-amber-600", label: "Бронювань", value: `${summary.bookings?.confirmed || 0}`, sub: summary.bookings?.cancelled > 0 ? `Скасовано: ${summary.bookings.cancelled}` : "Без скасувань", sColor: summary.bookings?.cancelled > 0 ? "text-red-400" : "text-green-500" },
            ].map(c => (
              <Card key={c.label} className={`border-0 shadow-sm ${c.bg}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1"><c.icon className={`h-4 w-4 ${c.ic}`} /><p className={`text-xs ${c.ic}`}>{c.label}</p></div>
                  <p className={`text-2xl font-bold ${c.ic}`}>{c.value}</p>
                  <p className={`text-xs ${c.sColor}`}>{c.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs nav */}
        <div className="flex gap-1 border-b overflow-x-auto no-print">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-violet-600 text-violet-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* ══ SUMMARY ══ */}
        {tab === "summary" && (
          <div className="space-y-4">
            {isLoading("summary") ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-500" /></div>
            : summary ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-xs text-gray-500 mb-1">RevPAR</p><p className="text-xl font-bold">{(summary.kpis?.revPar || 0).toLocaleString()} ₴</p><p className="text-xs text-gray-400">дохід / номер / ніч</p></CardContent></Card>
                  <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-xs text-gray-500 mb-1">ADR (середня ціна)</p><p className="text-xl font-bold">{(summary.kpis?.avgRevPerNight || 0).toLocaleString()} ₴</p><p className="text-xs text-gray-400">за ніч проживання</p></CardContent></Card>
                  <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-xs text-gray-500 mb-1">Оплачено</p><p className="text-xl font-bold text-green-700">{Math.round(summary.revenue?.paid || 0).toLocaleString()} ₴</p><p className="text-xs text-gray-400">з {Math.round(summary.revenue?.total || 0).toLocaleString()} ₴</p></CardContent></Card>
                </div>
                {summary.bySource?.length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-base">Виручка за джерелом бронювання</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {summary.bySource.map((s: any, i: number) => {
                        const pct = summary.revenue?.total > 0 ? Math.round((s.amount / summary.revenue.total) * 100) : 0;
                        return (
                          <div key={s.source} className="flex items-center gap-3">
                            <div className="w-24 text-xs text-gray-600">{SOURCE_UA[s.source] || s.source}</div>
                            <div className="flex-1 bg-gray-100 rounded-full h-3.5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} /></div>
                            <div className="text-xs font-medium w-32 text-right">{Math.round(s.amount).toLocaleString()} ₴ <span className="text-gray-400">({pct}%)</span></div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
                <Card className="border-0 shadow-sm">
                  <CardHeader><CardTitle className="text-base">Динаміка доходів (30 днів)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} /><stop offset="95%" stopColor="#7c3aed" stopOpacity={0} /></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} minTickGap={30} />
                          <YAxis tickFormatter={fmtK} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                          <Tooltip formatter={(v: number) => [`${v.toLocaleString("uk-UA")} ₴`, "Дохід"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                          <Area type="monotone" dataKey="revenue" stroke="#7c3aed" strokeWidth={2.5} fill="url(#rg)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : <div className="text-center py-8 text-gray-400">Немає даних</div>}
          </div>
        )}

        {/* ══ BOOKINGS TABLE ══ */}
        {tab === "bookings" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{bookings.length} бронювань за {dateFrom} — {dateTo}</p>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="no-print"><Printer className="h-4 w-4 mr-1" />Друк / PDF</Button>
            </div>
            {isLoading("bookings") ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin" /></div> : (
              <Card className="border-0 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm print-table">
                    <thead className="bg-gray-50">
                      <tr>{["#", "Гість", "Номер", "Заїзд", "Виїзд", "Сума", "Оплата", "Статус", "Джерело"].map(h => (
                        <th key={h} className={`${h === "Сума" ? "text-right" : "text-left"} px-3 py-2.5 text-xs text-gray-500 font-medium`}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bookings.map(b => (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{b.bookingRef || `#${b.id}`}</td>
                          <td className="px-3 py-2 font-medium">{b.firstName} {b.lastName}</td>
                          <td className="px-3 py-2 text-gray-600 text-xs">{b.unitName || "—"}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{b.checkIn}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{b.checkOut}</td>
                          <td className="px-3 py-2 text-right font-medium">{parseFloat(b.totalAmount || 0).toLocaleString()} ₴</td>
                          <td className="px-3 py-2"><Badge className={`text-xs ${b.paymentStatus === "paid" ? "bg-green-100 text-green-700" : b.paymentStatus === "partial" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{PAY_UA[b.paymentStatus] || b.paymentStatus}</Badge></td>
                          <td className="px-3 py-2"><Badge className={`text-xs ${b.status === "checked_in" ? "bg-green-100 text-green-700" : b.status === "confirmed" ? "bg-blue-100 text-blue-700" : b.status === "cancelled" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600"}`}>{STATUS_UA[b.status] || b.status}</Badge></td>
                          <td className="px-3 py-2 text-xs text-gray-500">{SOURCE_UA[b.source] || b.source || "—"}</td>
                        </tr>
                      ))}
                      {bookings.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-gray-400">Немає бронювань за обраний період</td></tr>}
                    </tbody>
                    {bookings.length > 0 && (
                      <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-sm font-semibold text-gray-600">Разом ({bookings.filter(b => b.status !== "cancelled").length} бронювань)</td>
                          <td className="px-3 py-2 text-right font-bold">{bookings.filter(b => b.status !== "cancelled").reduce((s, b) => s + parseFloat(b.totalAmount || 0), 0).toLocaleString()} ₴</td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ══ GUESTS ══ */}
        {tab === "guests" && (
          <div className="space-y-4">
            {isLoading("guests") ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-500" /></div>
            : guestsData ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Унікальних гостей", value: guestsData.stats.totalUnique, color: "text-violet-700", bg: "bg-violet-50" },
                    { label: "Повторні гості", value: guestsData.stats.repeatGuests, color: "text-blue-700", bg: "bg-blue-50" },
                    { label: "Відсоток повторних", value: `${guestsData.stats.returnRate}%`, color: "text-emerald-700", bg: "bg-emerald-50" },
                    { label: "Середнє перебування", value: `${guestsData.stats.avgStay} н.`, color: "text-amber-700", bg: "bg-amber-50" },
                  ].map(c => (
                    <Card key={c.label} className={`border-0 shadow-sm ${c.bg}`}>
                      <CardContent className="p-4"><p className={`text-xs ${c.color} mb-1`}>{c.label}</p><p className={`text-2xl font-bold ${c.color}`}>{c.value}</p></CardContent>
                    </Card>
                  ))}
                </div>

                {guestsData.stats.bySource?.length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-base">Бронювання за джерелом</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid md:grid-cols-2 gap-4 items-center">
                        <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={guestsData.stats.bySource} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${SOURCE_UA[name] || name} ${(percent * 100).toFixed(0)}%`}>
                                {guestsData.stats.bySource.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                              </Pie>
                              <Tooltip formatter={(v: any, n: any) => [v, SOURCE_UA[n] || n]} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-2">
                          {guestsData.stats.bySource.map((s: any, i: number) => (
                            <div key={s.source} className="flex items-center justify-between">
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} /><span className="text-sm">{SOURCE_UA[s.source] || s.source}</span></div>
                              <span className="font-semibold text-sm">{s.count} бронювань</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {guestsData.repeatGuests?.length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2"><Repeat2 className="h-4 w-4 text-blue-500" />Повторні гості</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b text-gray-400 text-xs">{["Гість", "Телефон", "Візитів", "Ночей", "Дохід", "Останній візит"].map(h => <th key={h} className="text-left py-2 px-3">{h}</th>)}</tr></thead>
                          <tbody>
                            {guestsData.repeatGuests.map((g: any, i: number) => (
                              <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="py-2.5 px-3 font-medium">{g.name}</td>
                                <td className="py-2.5 px-3 text-gray-500 text-xs">{g.phone}</td>
                                <td className="py-2.5 px-3"><Badge className="bg-blue-100 text-blue-700 text-xs">{g.bookings}×</Badge></td>
                                <td className="py-2.5 px-3 text-gray-600">{g.nights} н.</td>
                                <td className="py-2.5 px-3 font-semibold text-emerald-700">{Math.round(g.revenue).toLocaleString()} ₴</td>
                                <td className="py-2.5 px-3 text-gray-500 text-xs">{g.lastVisit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Топ гостей за виручкою</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-gray-400 text-xs">{["", "Гість", "Телефон", "Візитів", "Ночей", "Дохід"].map((h, i) => <th key={i} className={`${i >= 4 ? "text-right" : "text-left"} py-2 px-3`}>{h}</th>)}</tr></thead>
                        <tbody>
                          {(guestsData.topGuests || []).slice(0, 15).map((g: any, i: number) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                              <td className="py-2 px-3 text-gray-400 text-xs w-6">{i + 1}</td>
                              <td className="py-2.5 px-3 font-medium">{g.name}</td>
                              <td className="py-2.5 px-3 text-gray-500 text-xs">{g.phone}</td>
                              <td className="py-2.5 px-3 text-center">{g.bookings}</td>
                              <td className="py-2.5 px-3 text-right">{g.nights}</td>
                              <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">{Math.round(g.revenue).toLocaleString()} ₴</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : <div className="text-center py-8 text-gray-400">Немає даних. Оберіть діапазон і натисніть оновити.</div>}
          </div>
        )}

        {/* ══ FINANCIAL ══ */}
        {tab === "financial" && (
          <div className="space-y-4">
            {isLoading("financial") ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-500" /></div>
            : financialData ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Проживання", value: financialData.revenue?.accommodation || 0, color: "text-violet-700", bg: "bg-violet-50" },
                    { label: "Мінібар", value: financialData.revenue?.minibar || 0, color: "text-amber-700", bg: "bg-amber-50" },
                    { label: "Разом нараховано", value: financialData.revenue?.total || 0, color: "text-gray-800", bg: "bg-gray-50" },
                    { label: "Не сплачено", value: financialData.revenue?.outstanding || 0, color: financialData.revenue?.outstanding > 0 ? "text-red-700" : "text-emerald-700", bg: financialData.revenue?.outstanding > 0 ? "bg-red-50" : "bg-emerald-50" },
                  ].map(c => (
                    <Card key={c.label} className={`border-0 shadow-sm ${c.bg}`}>
                      <CardContent className="p-4"><p className={`text-xs ${c.color} mb-1`}>{c.label}</p><p className={`text-2xl font-bold ${c.color}`}>{Math.round(c.value).toLocaleString()} ₴</p></CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-base">Структура доходів</CardTitle></CardHeader>
                    <CardContent>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={[
                              { name: "Проживання", value: financialData.revenue?.accommodation || 0 },
                              { name: "Мінібар", value: financialData.revenue?.minibar || 0 },
                            ]} dataKey="value" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                              <Cell fill="#7c3aed" /><Cell fill="#f59e0b" />
                            </Pie>
                            <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString()} ₴`} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-base">Стан оплати</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3 pt-2">
                        {Object.entries(financialData.byPaymentStatus || {}).map(([status, amount]: [string, any]) => {
                          const total = financialData.revenue?.accommodation || 1;
                          const pct = Math.round((amount / total) * 100);
                          const colors: Record<string, string> = { paid: "bg-emerald-500", partial: "bg-amber-400", unpaid: "bg-red-400" };
                          return (
                            <div key={status}>
                              <div className="flex justify-between text-sm mb-1"><span>{PAY_UA[status] || status}</span><span className="font-medium">{Math.round(amount).toLocaleString()} ₴ ({pct}%)</span></div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${colors[status] || "bg-gray-400"}`} style={{ width: `${pct}%` }} /></div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {financialData.byProperty?.length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-base">Дохід по об'єктах</CardTitle></CardHeader>
                    <CardContent>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={financialData.byProperty} layout="vertical" margin={{ left: 10, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                            <XAxis type="number" tickFormatter={fmtK} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#374151" }} width={100} />
                            <Tooltip formatter={(v: number) => [`${Math.round(v).toLocaleString()} ₴`, "Дохід"]} contentStyle={{ borderRadius: 8 }} />
                            <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                              {financialData.byProperty.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-4 divide-y">
                        {financialData.byProperty.map((p: any, i: number) => (
                          <div key={i} className="flex items-center justify-between py-2 text-sm">
                            <span className="font-medium">{p.name}</span>
                            <div className="flex gap-4 text-gray-600">
                              <span>{p.bookings} бронювань</span>
                              <span>{p.nights} ночей</span>
                              <span className="font-semibold text-gray-800">{Math.round(p.revenue).toLocaleString()} ₴</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : <div className="text-center py-8 text-gray-400">Немає даних</div>}
          </div>
        )}

        {/* ══ UNITS ══ */}
        {tab === "units" && (
          <div className="space-y-4">
            {isLoading("units") ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-500" /></div>
            : unitsData ? (
              <>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(unitsData.units || []).slice(0, 12)} margin={{ top: 5, right: 10, left: 10, bottom: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7280" }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tickFormatter={fmtK} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                      <Tooltip formatter={(v: number) => [`${Math.round(v).toLocaleString()} ₴`, "Дохід"]} contentStyle={{ borderRadius: 8 }} />
                      <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                        {(unitsData.units || []).slice(0, 12).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <Card className="border-0 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>{["Рейт.", "Будинок", "Об'єкт", "Зайнятість", "Ночей", "ADR", "Бронювань", "Дохід"].map(h => (
                          <th key={h} className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(unitsData.units || []).map((u: any, i: number) => (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                            <td className="px-3 py-2.5 font-medium">{u.name}</td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs">{u.propertyName}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${u.occupancy}%` }} /></div>
                                <span className="text-xs">{u.occupancy}%</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-gray-600">{u.nights}</td>
                            <td className="px-3 py-2.5">{u.adr > 0 ? `${u.adr.toLocaleString()} ₴` : "—"}</td>
                            <td className="px-3 py-2.5 text-center">{u.bookings}</td>
                            <td className="px-3 py-2.5 font-semibold text-emerald-700">{Math.round(u.revenue).toLocaleString()} ₴</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            ) : <div className="text-center py-8 text-gray-400">Немає даних</div>}
          </div>
        )}

        {/* ══ COMPARISON ══ */}
        {tab === "comparison" && (
          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Режим порівняння</p>
                    <div className="flex gap-1">
                      {[{ id: "month", label: "Місяць до місяця" }, { id: "year", label: "Рік до року" }, { id: "custom", label: "Довільний" }].map(m => (
                        <button key={m.id} onClick={() => setCmpMode(m.id as any)}
                          className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${cmpMode === m.id ? "bg-violet-600 text-white border-violet-600" : "text-gray-600 border-gray-200 hover:border-violet-300"}`}>{m.label}</button>
                      ))}
                    </div>
                  </div>
                  {cmpMode === "custom" && (
                    <>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Період 1</p>
                        <div className="flex items-center gap-1 border rounded px-2 py-1 text-xs">
                          <input type="date" value={p1from} onChange={e => setP1from(e.target.value)} className="bg-transparent" />
                          <span>—</span>
                          <input type="date" value={p1to} onChange={e => setP1to(e.target.value)} className="bg-transparent" />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Період 2</p>
                        <div className="flex items-center gap-1 border rounded px-2 py-1 text-xs">
                          <input type="date" value={p2from} onChange={e => setP2from(e.target.value)} className="bg-transparent" />
                          <span>—</span>
                          <input type="date" value={p2to} onChange={e => setP2to(e.target.value)} className="bg-transparent" />
                        </div>
                      </div>
                    </>
                  )}
                  <Button size="sm" onClick={loadComparison} className="bg-violet-600 hover:bg-violet-700">Порівняти</Button>
                </div>
              </CardContent>
            </Card>

            {isLoading("comparison") ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-500" /></div>
            : comparisonData ? (() => {
              const p1 = comparisonData.period1;
              const p2 = comparisonData.period2;
              if (!p1 || !p2) return <div className="text-center py-8 text-gray-400">Немає даних</div>;
              const metrics = [
                { label: "Виручка", p1: p1.revenue, p2: p2.revenue, fmt: (v: number) => `${Math.round(v).toLocaleString()} ₴` },
                { label: "Зайнятість", p1: p1.occupancy, p2: p2.occupancy, fmt: (v: number) => `${v}%` },
                { label: "ADR", p1: p1.adr, p2: p2.adr, fmt: (v: number) => `${v.toLocaleString()} ₴` },
                { label: "RevPAR", p1: p1.revpar, p2: p2.revpar, fmt: (v: number) => `${v.toLocaleString()} ₴` },
                { label: "Бронювань", p1: p1.bookings, p2: p2.bookings, fmt: (v: number) => `${v}` },
                { label: "Ліжко-ночей", p1: p1.nights, p2: p2.nights, fmt: (v: number) => `${v}` },
                { label: "Ср. перебування", p1: p1.avgStay, p2: p2.avgStay, fmt: (v: number) => `${v} н.` },
                { label: "Скасувань", p1: p1.cancelled, p2: p2.cancelled, fmt: (v: number) => `${v}` },
              ];
              return (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-2 text-xs text-center font-semibold text-gray-500 uppercase tracking-wide">
                    <div>Показник</div>
                    <div className="text-violet-700">Період 1 ({p1.from} — {p1.to})</div>
                    <div className="text-blue-700">Період 2 ({p2.from} — {p2.to})</div>
                  </div>
                  <Card className="border-0 shadow-sm divide-y">
                    {metrics.map(m => (
                      <div key={m.label} className="grid grid-cols-3 gap-2 px-4 py-3 items-center hover:bg-gray-50">
                        <div className="text-sm font-medium text-gray-700">{m.label}</div>
                        <div className="text-center"><span className="text-lg font-bold text-violet-700">{m.fmt(m.p1)}</span></div>
                        <div className="text-center flex flex-col items-center gap-0.5">
                          <span className="text-lg font-bold text-blue-700">{m.fmt(m.p2)}</span>
                          <Delta curr={Number(m.p2)} prev={Number(m.p1)} />
                        </div>
                      </div>
                    ))}
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-base">Порівняння виручки</CardTitle></CardHeader>
                    <CardContent>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[{ name: "Виручка", p1: p1.revenue, p2: p2.revenue }, { name: "Оплачено", p1: p1.paid, p2: p2.paid }]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                            <YAxis tickFormatter={fmtK} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                            <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString()} ₴`} contentStyle={{ borderRadius: 8 }} />
                            <Legend formatter={v => v === "p1" ? `Пер. 1 (${p1.from})` : `Пер. 2 (${p2.from})`} />
                            <Bar dataKey="p1" name="p1" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="p2" name="p2" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </>
              );
            })() : <div className="text-center py-8 text-gray-400">Оберіть режим і натисніть "Порівняти"</div>}
          </div>
        )}

        {/* ══ OWNER ══ */}
        {tab === "owner" && (
          <div className="space-y-4">
            {isLoading("owner") ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-500" /></div>
            : ownerData?.current ? (() => {
              const c = ownerData.current;
              const p = ownerData.previous;
              return (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="h-5 w-5 text-amber-500" />
                    <h2 className="font-semibold text-gray-800">Звіт для власника</h2>
                    <span className="text-sm text-gray-400">{c.from} — {c.to}</span>
                    <Button variant="outline" size="sm" className="ml-auto no-print" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />PDF</Button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Виручка", curr: c.revenue, prev: p?.revenue, fmt: (v: number) => `${Math.round(v).toLocaleString()} ₴`, color: "text-violet-700", bg: "bg-violet-50" },
                      { label: "Зайнятість", curr: c.occupancy, prev: p?.occupancy, fmt: (v: number) => `${v}%`, color: "text-blue-700", bg: "bg-blue-50" },
                      { label: "ADR", curr: c.adr, prev: p?.adr, fmt: (v: number) => `${v.toLocaleString()} ₴`, color: "text-emerald-700", bg: "bg-emerald-50" },
                      { label: "RevPAR", curr: c.revpar, prev: p?.revpar, fmt: (v: number) => `${v.toLocaleString()} ₴`, color: "text-amber-700", bg: "bg-amber-50" },
                    ].map(m => (
                      <Card key={m.label} className={`border-0 shadow-sm ${m.bg}`}>
                        <CardContent className="p-4">
                          <p className={`text-xs ${m.color} mb-1`}>{m.label}</p>
                          <p className={`text-2xl font-bold ${m.color}`}>{m.fmt(m.curr)}</p>
                          {m.prev != null && <Delta curr={m.curr} prev={m.prev} />}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Бронювання</CardTitle></CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">Підтверджених</span><span className="font-semibold">{c.bookings}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Скасованих</span><span className="font-semibold text-red-500">{c.cancelled}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Ніч проживання</span><span className="font-semibold">{c.nights}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Ср. тривалість</span><span className="font-semibold">{c.avgStay} н.</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Гостей</span><span className="font-semibold">{c.totalGuests}</span></div>
                      </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Фінанси</CardTitle></CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">Нараховано</span><span className="font-semibold">{Math.round(c.revenue).toLocaleString()} ₴</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Оплачено</span><span className="font-semibold text-emerald-700">{Math.round(c.paid).toLocaleString()} ₴</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Борг</span><span className={`font-semibold ${c.outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>{Math.round(c.outstanding).toLocaleString()} ₴</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Мінібар</span><span className="font-semibold text-amber-700">{Math.round(ownerData.minibarRevenue || 0).toLocaleString()} ₴</span></div>
                        <div className="flex justify-between border-t pt-2 mt-2"><span className="font-medium">Всього дохід</span><span className="font-bold">{Math.round((c.revenue || 0) + (ownerData.minibarRevenue || 0)).toLocaleString()} ₴</span></div>
                      </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-emerald-500" />Прибирання</CardTitle></CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        {[
                          { key: "clean", label: "Чисті", color: "bg-emerald-500" },
                          { key: "dirty", label: "Брудні", color: "bg-red-400" },
                          { key: "in_progress", label: "В роботі", color: "bg-amber-400" },
                          { key: "inspected", label: "Перевірені", color: "bg-blue-400" },
                        ].map(s => {
                          const count = ownerData.housekeeping?.[s.key] || 0;
                          const pct = ownerData.totalUnits > 0 ? Math.round((count / ownerData.totalUnits) * 100) : 0;
                          return (
                            <div key={s.key} className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${s.color}`} />
                              <span className="text-gray-600 flex-1">{s.label}</span>
                              <span className="font-semibold">{count}</span>
                              <span className="text-gray-400 text-xs w-8 text-right">{pct}%</span>
                            </div>
                          );
                        })}
                        <div className="border-t pt-1 text-xs text-gray-400">Всього: {ownerData.totalUnits} номерів</div>
                      </CardContent>
                    </Card>
                  </div>

                  {ownerData.unpaidBookings?.length > 0 && (
                    <Card className="border-0 shadow-sm border-l-4 border-l-red-400">
                      <CardHeader className="pb-2"><CardTitle className="text-base text-red-700 flex items-center gap-2"><AlertCircle className="h-4 w-4" />Несплачені бронювання ({ownerData.unpaidBookings.length})</CardTitle></CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="border-b text-gray-400 text-xs">{["Бронювання", "Гість", "Будинок", "Заїзд", "Виїзд", "Сума"].map(h => <th key={h} className="text-left py-2 px-2">{h}</th>)}</tr></thead>
                            <tbody>
                              {ownerData.unpaidBookings.map((b: any) => (
                                <tr key={b.id} className="border-b last:border-0 hover:bg-red-50">
                                  <td className="py-2 px-2 text-xs text-gray-400">{b.bookingRef || `#${b.id}`}</td>
                                  <td className="py-2 px-2 font-medium">{b.firstName} {b.lastName}</td>
                                  <td className="py-2 px-2 text-gray-500 text-xs">{b.unitName}</td>
                                  <td className="py-2 px-2 text-xs">{b.checkIn}</td>
                                  <td className="py-2 px-2 text-xs">{b.checkOut}</td>
                                  <td className="py-2 px-2 font-bold text-red-700">{Math.round(parseFloat(b.totalAmount || "0")).toLocaleString()} ₴</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-red-50">
                              <tr><td colSpan={5} className="px-2 py-2 text-sm font-semibold text-red-700">Разом до стягнення</td>
                              <td className="px-2 py-2 font-bold text-red-700">{Math.round(ownerData.unpaidBookings.reduce((s: number, b: any) => s + parseFloat(b.totalAmount || "0"), 0)).toLocaleString()} ₴</td></tr>
                            </tfoot>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              );
            })() : <div className="text-center py-8 text-gray-400">Оберіть діапазон і натисніть оновити</div>}
          </div>
        )}

        {/* ══ SERVICES ══ */}
        {tab === "services" && (
          <div className="space-y-4">
            {isLoading("services") ? (
              <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-500" /></div>
            ) : servicesData ? (
              <>
                {/* Total + bookings KPI */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Card className="border-0 shadow-sm bg-violet-50 col-span-2 md:col-span-1">
                    <CardContent className="p-4">
                      <p className="text-xs text-violet-600 mb-1">Загальний дохід</p>
                      <p className="text-3xl font-bold text-violet-700">{fmtUAH(servicesData.total)}</p>
                      <p className="text-xs text-violet-500 mt-1">{servicesData.bookings} бронювань у виб. діапазоні</p>
                    </CardContent>
                  </Card>
                  {(servicesData.categories || []).filter((c: any) => c.amount > 0).slice(0, 4).map((cat: any) => {
                    const Icon = SERVICE_CATEGORY_ICONS[cat.key] || Package;
                    return (
                      <Card key={cat.key} className="border-0 shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon className="h-3.5 w-3.5 text-gray-500" />
                            <p className="text-xs text-gray-500">{cat.label}</p>
                          </div>
                          <p className="text-xl font-bold text-gray-800">{fmtUAH(cat.amount)}</p>
                          {servicesData.total > 0 && (
                            <p className="text-xs text-gray-400 mt-0.5">{Math.round((cat.amount / servicesData.total) * 100)}% від загального</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Pie + Category breakdown */}
                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="border-0 shadow-sm">
                    <CardHeader><CardTitle className="text-base">Структура доходу</CardTitle></CardHeader>
                    <CardContent>
                      {(servicesData.categories || []).some((c: any) => c.amount > 0) ? (
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={(servicesData.categories || []).filter((c: any) => c.amount > 0)}
                              dataKey="amount" nameKey="label" cx="50%" cy="50%" outerRadius={85} label={({ label, percent }: any) => `${label} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                              {(servicesData.categories || []).filter((c: any) => c.amount > 0).map((cat: any) => (
                                <Cell key={cat.key} fill={SERVICE_CATEGORY_COLORS[cat.key] || "#94a3b8"} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v: any) => fmtUAH(v)} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-[220px] text-gray-400">
                          <Package className="h-10 w-10 mb-2 opacity-30" />
                          <p className="text-sm">Немає даних за вибраний період</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader><CardTitle className="text-base">Категорії доходів</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(servicesData.categories || []).map((cat: any) => {
                          const Icon = SERVICE_CATEGORY_ICONS[cat.key] || Package;
                          const pct = servicesData.total > 0 ? (cat.amount / servicesData.total) * 100 : 0;
                          return (
                            <div key={cat.key}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4" style={{ color: SERVICE_CATEGORY_COLORS[cat.key] || "#94a3b8" }} />
                                  <span className="text-sm font-medium">{cat.label}</span>
                                </div>
                                <span className="text-sm font-semibold">{fmtUAH(cat.amount)}</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: SERVICE_CATEGORY_COLORS[cat.key] || "#94a3b8" }} />
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5 text-right">{pct.toFixed(1)}%</p>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* By Property */}
                {(servicesData.byProperty || []).length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader><CardTitle className="text-base">Розбивка по об'єктах</CardTitle></CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b text-gray-400 text-xs">
                            {["Об'єкт", "Проживання", "Турист. збір", "Дод. послуги", "Сервіс", "Мінібар", "Всього"].map(h => (
                              <th key={h} className="text-right first:text-left py-2 pr-3">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {(servicesData.byProperty || []).map((p: any, i: number) => (
                              <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="py-2.5 pr-3 font-medium">{p.name}</td>
                                <td className="py-2.5 pr-3 text-right tabular-nums">{fmtUAH(p.accommodation)}</td>
                                <td className="py-2.5 pr-3 text-right tabular-nums">{fmtUAH(p.touristTax)}</td>
                                <td className="py-2.5 pr-3 text-right tabular-nums">{fmtUAH(p.addons)}</td>
                                <td className="py-2.5 pr-3 text-right tabular-nums">{fmtUAH(p.serviceOrders)}</td>
                                <td className="py-2.5 pr-3 text-right tabular-nums">{fmtUAH(p.minibar)}</td>
                                <td className="py-2.5 text-right tabular-nums font-semibold text-violet-700">{fmtUAH(p.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Top addons + service orders */}
                <div className="grid md:grid-cols-2 gap-4">
                  {(servicesData.addonsList || []).length > 0 && (
                    <Card className="border-0 shadow-sm">
                      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-amber-500" />Додаткові послуги</CardTitle></CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {(servicesData.addonsList || []).slice(0, 10).map((a: any, i: number) => (
                            <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                                <span className="text-sm">{a.name}</span>
                                <Badge variant="outline" className="text-xs h-5 px-1.5">{a.qty} шт.</Badge>
                              </div>
                              <span className="text-sm font-semibold">{fmtUAH(a.amount)}</span>
                            </div>
                          ))}
                        </div>
                        {(servicesData.addonsList || []).length === 0 && (
                          <p className="text-sm text-gray-400 text-center py-4">Немає даних</p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {(servicesData.serviceOrdersList || []).length > 0 && (
                    <Card className="border-0 shadow-sm">
                      <CardHeader><CardTitle className="text-base flex items-center gap-2"><ConciergeBell className="h-4 w-4 text-pink-500" />Сервісні замовлення</CardTitle></CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {(servicesData.serviceOrdersList || []).slice(0, 10).map((s: any, i: number) => (
                            <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                                <span className="text-sm">{s.name}</span>
                                <Badge variant="outline" className="text-xs h-5 px-1.5">{s.count} зам.</Badge>
                              </div>
                              <span className="text-sm font-semibold">{fmtUAH(s.amount)}</span>
                            </div>
                          ))}
                        </div>
                        {(servicesData.serviceOrdersList || []).length === 0 && (
                          <p className="text-sm text-gray-400 text-center py-4">Немає даних</p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {(servicesData.addonsList || []).length === 0 && (servicesData.serviceOrdersList || []).length === 0 && (
                    <Card className="border-0 shadow-sm col-span-2">
                      <CardContent className="flex flex-col items-center justify-center py-10 text-gray-400">
                        <ShoppingCart className="h-10 w-10 mb-2 opacity-30" />
                        <p className="text-sm">Немає сервісних замовлень та додатків за вибраний період</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Оберіть діапазон і натисніть оновити</p>
              </div>
            )}
          </div>
        )}

        {/* ══ HOUSEKEEPING ══ */}
        {tab === "housekeeping" && (
          <div className="space-y-4">
            {isLoading("hk") ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-500" /></div>
            : hkData ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { key: "clean", label: "Чисті", color: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" },
                    { key: "dirty", label: "Брудні", color: "text-red-700", bg: "bg-red-50", dot: "bg-red-400" },
                    { key: "in_progress", label: "В роботі", color: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-400" },
                    { key: "inspected", label: "Перевірені", color: "text-blue-700", bg: "bg-blue-50", dot: "bg-blue-400" },
                  ].map(s => (
                    <Card key={s.key} className={`border-0 shadow-sm ${s.bg}`}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${s.dot}`} />
                        <div><p className={`text-xs ${s.color}`}>{s.label}</p><p className={`text-3xl font-bold ${s.color}`}>{hkData.stats?.[s.key] || 0}</p></div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-base">Розподіл статусів</CardTitle></CardHeader>
                    <CardContent>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={[
                              { name: "Чисті", value: hkData.stats?.clean || 0 },
                              { name: "Брудні", value: hkData.stats?.dirty || 0 },
                              { name: "В роботі", value: hkData.stats?.in_progress || 0 },
                              { name: "Перевірені", value: hkData.stats?.inspected || 0 },
                            ].filter(d => d.value > 0)} dataKey="value" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`}>
                              <Cell fill="#22c55e" /><Cell fill="#ef4444" /><Cell fill="#f59e0b" /><Cell fill="#3b82f6" />
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-base">Список номерів</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                        {(hkData.units || []).map((u: any) => {
                          const colors: Record<string, string> = { clean: "bg-emerald-100 text-emerald-700", dirty: "bg-red-100 text-red-700", in_progress: "bg-amber-100 text-amber-700", inspected: "bg-blue-100 text-blue-700" };
                          const labels: Record<string, string> = { clean: "Чистий", dirty: "Брудний", in_progress: "Прибирають", inspected: "Перевірено" };
                          return (
                            <div key={u.id} className="flex items-center justify-between py-1 border-b last:border-0">
                              <span className="text-sm font-medium">{u.name}</span>
                              <Badge className={`text-xs ${colors[u.housekeepingStatus] || "bg-gray-100 text-gray-600"}`}>{labels[u.housekeepingStatus] || u.housekeepingStatus}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : <div className="text-center py-8 text-gray-400">Немає даних</div>}
          </div>
        )}

        {/* ══ NIGHT AUDIT ══ */}
        {tab === "audit" && (
          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Moon className="w-5 h-5 text-indigo-500" /><CardTitle>Нічний аудит</CardTitle></div>
                  <Button onClick={handleRunAudit} disabled={runAuditMutation.isPending} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                    {runAuditMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}Виконати аудит
                  </Button>
                </div>
                <CardDescription>Закриття дня: підрахунок зайнятості, виручки та ключових показників</CardDescription>
              </CardHeader>
              <CardContent>
                {latestAudit ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {latestAudit.status === "completed" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
                      <span>Останній: {latestAudit.auditDate} — </span>
                      <span className={latestAudit.status === "completed" ? "text-emerald-600" : "text-amber-600"}>{latestAudit.status === "completed" ? "Виконано" : "Помилка"}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { icon: Hotel, color: "blue", label: "Зайнятість", value: `${latestAudit.occupancyRate?.toFixed(1)}%`, sub: `${latestAudit.occupiedUnits}/${latestAudit.totalUnits} номерів` },
                        { icon: DollarSign, color: "emerald", label: "Виручка", value: fmtUAH(latestAudit.totalRevenue), sub: `Проживання: ${fmtUAH(latestAudit.accommodationRevenue)}` },
                        { icon: Users, color: "amber", label: "Гостей", value: latestAudit.totalGuests, sub: `+${latestAudit.newCheckins} заїздів, -${latestAudit.checkouts} виїздів` },
                        { icon: FileText, color: "violet", label: "Бронювань", value: latestAudit.newBookings, sub: `Скасувань: ${latestAudit.cancellations}` },
                      ].map(s => (
                        <div key={s.label} className={`p-4 bg-${s.color}-50 rounded-xl border border-${s.color}-100`}>
                          <div className="flex items-center gap-2 mb-1"><s.icon className={`w-4 h-4 text-${s.color}-500`} /><span className={`text-xs text-${s.color}-700`}>{s.label}</span></div>
                          <p className={`text-2xl font-bold text-${s.color}-800`}>{s.value}</p>
                          <p className={`text-xs text-${s.color}-600`}>{s.sub}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400">
                    <Moon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Натисніть "Виконати аудит" для закриття поточного дня</p>
                  </div>
                )}
              </CardContent>
            </Card>
            {(nightAudits || []).length > 1 && (
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-base">Історія аудитів</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-gray-400">
                        {["Дата", "Зайнятість", "Номерів", "Виручка", "Гостей", "Статус"].map(h => <th key={h} className="text-left py-2 pr-4 text-xs">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {(nightAudits || []).slice(0, 15).map((a: any) => (
                          <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-2.5 pr-4 font-medium">{a.auditDate}</td>
                            <td className="py-2.5 pr-4">{a.occupancyRate?.toFixed(1)}%</td>
                            <td className="py-2.5 pr-4">{a.occupiedUnits}/{a.totalUnits}</td>
                            <td className="py-2.5 pr-4">{fmtUAH(a.totalRevenue)}</td>
                            <td className="py-2.5 pr-4">{a.totalGuests}</td>
                            <td className="py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full ${a.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{a.status === "completed" ? "✓" : "✗"}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
