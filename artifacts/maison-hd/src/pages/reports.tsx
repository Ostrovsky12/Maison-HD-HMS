import { useState, useEffect, useCallback, useRef } from "react";
import { useGetOccupancyAnalytics, useListNightAudits, useRunNightAudit } from "@workspace/api-client-react";
import { format, subDays, startOfMonth } from "date-fns";
import { uk } from "date-fns/locale";
import { Loader2, Calendar, Moon, Play, TrendingUp, Users, Hotel, DollarSign, CheckCircle2, AlertCircle, Printer, Download, FileText, BarChart2, RefreshCw } from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
const SOURCE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4"];

const TABS = [
  { id: "summary",  label: "Зведення",       icon: BarChart2 },
  { id: "bookings", label: "Бронювання",      icon: FileText },
  { id: "audit",    label: "Нічний аудит",    icon: Moon },
  { id: "charts",   label: "Графіки",         icon: TrendingUp },
];

const fmtUAH = (v: number) => new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", minimumFractionDigits: 0 }).format(v || 0);
const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}к ₴` : `${v} ₴`;

export default function ReportsPage() {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState("summary");
  const [summary, setSummary] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Date range: current month
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const endDate = dateTo;
  const startDate = dateFrom;

  const { data: analytics, isLoading: analyticsLoading } = useGetOccupancyAnalytics({ dateFrom: format(subDays(new Date(), 30), "yyyy-MM-dd"), dateTo: endDate });
  const { data: nightAudits, refetch: refetchAudits } = useListNightAudits({});
  const runAuditMutation = useRunNightAudit();

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    const r = await apiFetch(`/summary?from=${dateFrom}&to=${dateTo}`);
    if (r.ok) setSummary(await r.json());
    setLoadingSummary(false);
  }, [dateFrom, dateTo]);

  const loadBookings = useCallback(async () => {
    setLoadingBookings(true);
    const r = await apiFetch(`/bookings?from=${dateFrom}&to=${dateTo}`);
    if (r.ok) { const d = await r.json(); setBookings(d.bookings || []); }
    setLoadingBookings(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { if (tab === "bookings") loadBookings(); }, [tab, loadBookings]);

  const handleRunAudit = () => {
    runAuditMutation.mutate({ data: {} }, {
      onSuccess: (data) => {
        refetchAudits();
        toast({ title: "Нічний аудит виконано", description: `Дата: ${data.auditDate} · Завантаженість: ${data.occupancyRate?.toFixed(1)}%` });
      },
      onError: () => toast({ title: "Помилка", description: "Не вдалося виконати нічний аудит", variant: "destructive" }),
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const chartData = (analytics || []).map((item: any) => ({
    ...item,
    dateLabel: format(new Date(item.date), "d MMM", { locale: uk }),
  }));

  const latestAudit = (nightAudits || [])[0];

  return (
    <AppLayout>
      {/* Print styles injected inline */}
      <style>{`
        @media print {
          nav, header, [data-sidebar], .no-print { display: none !important; }
          body { background: white !important; }
          .print-full { padding: 0 !important; max-width: 100% !important; }
          .print-table { font-size: 11px; }
        }
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
            <Button variant="outline" size="sm" onClick={() => { loadSummary(); if (tab === "bookings") loadBookings(); }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />Друк
            </Button>
          </div>
        </div>

        {/* Quick KPI cards (always visible) */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm bg-violet-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-violet-600" /><p className="text-xs text-violet-700">Виручка за період</p></div>
                <p className="text-2xl font-bold text-violet-700">{Math.round(summary.revenue?.total || 0).toLocaleString()} ₴</p>
                {summary.revenue?.outstanding > 0 && <p className="text-xs text-red-500">Не сплачено: {Math.round(summary.revenue.outstanding).toLocaleString()} ₴</p>}
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Hotel className="h-4 w-4 text-blue-600" /><p className="text-xs text-blue-700">Завантаженість</p></div>
                <p className="text-2xl font-bold text-blue-700">{summary.occupancy?.avgPercent ?? 0}%</p>
                <p className="text-xs text-blue-500">{summary.occupancy?.totalNights} ліжко-ночей</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-green-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-green-600" /><p className="text-xs text-green-700">Гостей</p></div>
                <p className="text-2xl font-bold text-green-700">{summary.guests?.total || 0}</p>
                <p className="text-xs text-green-500">Ср. перебування: {summary.guests?.avgStay} н.</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-amber-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><FileText className="h-4 w-4 text-amber-600" /><p className="text-xs text-amber-700">Бронювань</p></div>
                <p className="text-2xl font-bold text-amber-700">{summary.bookings?.confirmed || 0}</p>
                {summary.bookings?.cancelled > 0 && <p className="text-xs text-red-400">Скасовано: {summary.bookings.cancelled}</p>}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b overflow-x-auto no-print">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-violet-600 text-violet-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* ── SUMMARY TAB ── */}
        {tab === "summary" && (
          <div className="space-y-4">
            {loadingSummary ? (
              <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-500" /></div>
            ) : summary ? (
              <>
                {/* KPI detail */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-xs text-gray-500 mb-1">RevPAR</p>
                      <p className="text-xl font-bold text-gray-800">{(summary.kpis?.revPar || 0).toLocaleString()} ₴</p>
                      <p className="text-xs text-gray-400">дохід / номер / ніч</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-xs text-gray-500 mb-1">ADR (середня ціна)</p>
                      <p className="text-xl font-bold text-gray-800">{(summary.kpis?.avgRevPerNight || 0).toLocaleString()} ₴</p>
                      <p className="text-xs text-gray-400">за ніч проживання</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-xs text-gray-500 mb-1">Оплачено</p>
                      <p className="text-xl font-bold text-green-700">{Math.round(summary.revenue?.paid || 0).toLocaleString()} ₴</p>
                      <p className="text-xs text-gray-400">з {Math.round(summary.revenue?.total || 0).toLocaleString()} ₴ нарахованих</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Revenue by source */}
                {summary.bySource?.length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-base">Виручка за джерелом бронювання</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {summary.bySource.map((s: any, i: number) => {
                          const pct = summary.revenue?.total > 0 ? Math.round((s.amount / summary.revenue.total) * 100) : 0;
                          return (
                            <div key={s.source} className="flex items-center gap-3">
                              <div className="w-20 text-xs text-gray-600 flex-shrink-0">{SOURCE_UA[s.source] || s.source}</div>
                              <div className="flex-1 bg-gray-100 rounded-full h-4 relative overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                              </div>
                              <div className="text-xs font-medium w-28 text-right">{Math.round(s.amount).toLocaleString()} ₴ <span className="text-gray-400">({pct}%)</span></div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-400">Немає даних за обраний період</div>
            )}
          </div>
        )}

        {/* ── BOOKINGS TABLE ── */}
        {tab === "bookings" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{bookings.length} бронювань за {dateFrom} — {dateTo}</p>
              <Button variant="outline" size="sm" onClick={handlePrint} className="no-print">
                <Printer className="h-4 w-4 mr-1" />Друк / PDF
              </Button>
            </div>
            {loadingBookings ? (
              <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin" /></div>
            ) : (
              <Card className="border-0 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm print-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">#</th>
                        <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Гість</th>
                        <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Номер</th>
                        <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Заїзд</th>
                        <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Виїзд</th>
                        <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">Сума</th>
                        <th className="text-center px-3 py-2.5 text-xs text-gray-500 font-medium">Оплата</th>
                        <th className="text-center px-3 py-2.5 text-xs text-gray-500 font-medium">Статус</th>
                        <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Джерело</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bookings.map((b, i) => (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{b.bookingRef || `#${b.id}`}</td>
                          <td className="px-3 py-2 font-medium">{b.firstName} {b.lastName}</td>
                          <td className="px-3 py-2 text-gray-600 text-xs">{b.unitName || "—"}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{b.checkIn}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{b.checkOut}</td>
                          <td className="px-3 py-2 text-right font-medium">{parseFloat(b.totalAmount || 0).toLocaleString()} ₴</td>
                          <td className="px-3 py-2 text-center">
                            <Badge className={`text-xs ${b.paymentStatus === "paid" ? "bg-green-100 text-green-700" : b.paymentStatus === "partial" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                              {PAY_UA[b.paymentStatus] || b.paymentStatus}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Badge className={`text-xs ${b.status === "checked_in" ? "bg-green-100 text-green-700" : b.status === "confirmed" ? "bg-blue-100 text-blue-700" : b.status === "cancelled" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600"}`}>
                              {STATUS_UA[b.status] || b.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{SOURCE_UA[b.source] || b.source || "—"}</td>
                        </tr>
                      ))}
                      {bookings.length === 0 && (
                        <tr><td colSpan={9} className="text-center py-8 text-gray-400">Немає бронювань за обраний період</td></tr>
                      )}
                    </tbody>
                    {bookings.length > 0 && (
                      <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-sm font-semibold text-gray-600">Разом ({bookings.filter(b => b.status !== "cancelled").length} бронювань)</td>
                          <td className="px-3 py-2 text-right font-bold text-gray-800">
                            {bookings.filter(b => b.status !== "cancelled").reduce((s, b) => s + parseFloat(b.totalAmount || 0), 0).toLocaleString()} ₴
                          </td>
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

        {/* ── NIGHT AUDIT ── */}
        {tab === "audit" && (
          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Moon className="w-5 h-5 text-indigo-500" />
                    <CardTitle>Нічний аудит</CardTitle>
                  </div>
                  <Button onClick={handleRunAudit} disabled={runAuditMutation.isPending} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                    {runAuditMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                    Виконати аудит
                  </Button>
                </div>
                <CardDescription>Закриття дня: підрахунок зайнятості, виручки та ключових показників</CardDescription>
              </CardHeader>
              <CardContent>
                {latestAudit ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {latestAudit.status === "completed" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
                      <span>Останній: {latestAudit.auditDate} —</span>
                      <span className={latestAudit.status === "completed" ? "text-emerald-600" : "text-amber-600"}>
                        {latestAudit.status === "completed" ? "Виконано" : "Помилка"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { icon: Hotel, color: "blue", label: "Зайнятість", value: `${latestAudit.occupancyRate?.toFixed(1)}%`, sub: `${latestAudit.occupiedUnits}/${latestAudit.totalUnits} номерів` },
                        { icon: DollarSign, color: "emerald", label: "Виручка", value: fmtUAH(latestAudit.totalRevenue), sub: `Проживання: ${fmtUAH(latestAudit.accommodationRevenue)}` },
                        { icon: Users, color: "amber", label: "Гостей", value: latestAudit.totalGuests, sub: `+${latestAudit.newCheckins} заїздів, -${latestAudit.checkouts} виїздів` },
                        { icon: FileText, color: "violet", label: "Бронювань", value: latestAudit.newBookings, sub: `Скасувань: ${latestAudit.cancellations}` },
                      ].map(s => (
                        <div key={s.label} className={`p-4 bg-${s.color}-50 rounded-xl border border-${s.color}-100`}>
                          <div className="flex items-center gap-2 mb-1">
                            <s.icon className={`w-4 h-4 text-${s.color}-500`} />
                            <span className={`text-xs text-${s.color}-700`}>{s.label}</span>
                          </div>
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

            {/* Audit history */}
            {(nightAudits || []).length > 1 && (
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-base">Історія аудитів</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-gray-400">
                          <th className="text-left py-2 pr-4">Дата</th>
                          <th className="text-right py-2 pr-4">Зайнятість</th>
                          <th className="text-right py-2 pr-4">Номерів</th>
                          <th className="text-right py-2 pr-4">Виручка</th>
                          <th className="text-right py-2 pr-4">Гостей</th>
                          <th className="text-right py-2">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(nightAudits || []).slice(0, 15).map((a: any) => (
                          <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-2.5 pr-4 font-medium">{a.auditDate}</td>
                            <td className="py-2.5 pr-4 text-right">{a.occupancyRate?.toFixed(1)}%</td>
                            <td className="py-2.5 pr-4 text-right">{a.occupiedUnits}/{a.totalUnits}</td>
                            <td className="py-2.5 pr-4 text-right">{fmtUAH(a.totalRevenue)}</td>
                            <td className="py-2.5 pr-4 text-right">{a.totalGuests}</td>
                            <td className="py-2.5 text-right">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${a.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                {a.status === "completed" ? "✓" : "✗"}
                              </span>
                            </td>
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

        {/* ── CHARTS ── */}
        {tab === "charts" && (
          <div className="space-y-6">
            {analyticsLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-violet-500" /></div>
            ) : (
              <>
                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle>Динаміка доходів (30 днів)</CardTitle>
                    <CardDescription>Дохід по днях</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} minTickGap={30} />
                          <YAxis tickFormatter={fmtK} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                          <Tooltip formatter={(v: number) => [`${v.toLocaleString("uk-UA")} ₴`, "Дохід"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                          <Area type="monotone" dataKey="revenue" stroke="#7c3aed" strokeWidth={2.5} fill="url(#revGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle>Завантаженість номерного фонду (%)</CardTitle>
                    <CardDescription>Відсоток зайнятих номерів по днях</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} minTickGap={30} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                          <Tooltip formatter={(v: number) => [`${v}%`, "Завантаженість"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                          <Line type="monotone" dataKey="occupancyRate" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Revenue by source bar chart */}
                {summary?.bySource?.length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Виручка за джерелом</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={summary.bySource} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="source" tickFormatter={s => SOURCE_UA[s] || s} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                            <YAxis tickFormatter={fmtK} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                            <Tooltip formatter={(v: number) => [`${v.toLocaleString("uk-UA")} ₴`, "Виручка"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                              {summary.bySource.map((_: any, i: number) => (
                                <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
