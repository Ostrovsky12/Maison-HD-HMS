import { useState, useEffect } from "react";
import {
  useListKpiHistory,
  useListForecasts,
  useGetAnalyticsSummary,
  useGenerateKpi,
  useGenerateForecast,
  useGetMonthlyReport,
  getListKpiHistoryQueryKey,
  getGetAnalyticsSummaryQueryKey,
  getListForecastsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Loader2,
  Hotel,
  DollarSign,
  BarChart3,
  TrendingUp,
  RefreshCw,
  Target,
  Activity,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Calendar,
  Users,
  XCircle,
  Clock,
  Wifi,
  Layers,
  Globe,
} from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const formatUAH = (val: number | null | undefined) => {
  if (!val && val !== 0) return "—";
  return new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", minimumFractionDigits: 0 }).format(val);
};
const formatPct = (val: number) => `${val.toFixed(1)}%`;

const PIE_COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#8b5cf6"];

const MONTHS_UK = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const now = new Date();
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);

  const { data: summary, isLoading: summaryLoading } = useGetAnalyticsSummary();
  const { data: kpiHistory, isLoading: kpiLoading } = useListKpiHistory({ days: 60 });
  const { data: forecasts, isLoading: forecastLoading } = useListForecasts({ days: 30 });
  const { data: monthlyReport, isLoading: monthlyLoading } = useGetMonthlyReport({ year: reportYear, month: reportMonth });

  const generateKpiMutation = useGenerateKpi();
  const generateForecastMutation = useGenerateForecast();

  // Channels data
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const API = BASE.replace("/maison-hd", "") + "/api";
  const authFetch = (url: string, opts?: RequestInit) =>
    fetch(url, { ...opts, headers: { ...(opts?.headers || {}), Authorization: `Bearer ${localStorage.getItem("hms_token")}`, "Content-Type": "application/json" } });

  const [channelDays, setChannelDays] = useState(90);
  const [channelsData, setChannelsData] = useState<any>(null);
  const [channelsLoading, setChannelsLoading] = useState(false);

  useEffect(() => {
    setChannelsLoading(true);
    authFetch(`${API}/analytics/channels?days=${channelDays}`)
      .then(r => r.json())
      .then(d => { setChannelsData(d); setChannelsLoading(false); })
      .catch(() => setChannelsLoading(false));
  }, [channelDays]);

  const handleGenerateKpi = () => {
    generateKpiMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListKpiHistoryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAnalyticsSummaryQueryKey() });
        toast({ title: "KPI збережено", description: "Дані за сьогодні успішно оновлено" });
      },
      onError: () => toast({ title: "Помилка", description: "Не вдалося оновити KPI", variant: "destructive" }),
    });
  };

  const handleGenerateForecast = () => {
    generateForecastMutation.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListForecastsQueryKey() });
        toast({ title: "Прогноз згенеровано", description: `${data.forecasts.length} днів` });
      },
      onError: () => toast({ title: "Помилка", description: "Не вдалося згенерувати прогноз", variant: "destructive" }),
    });
  };

  const kpiChartData = (kpiHistory || []).map(k => ({
    ...k,
    label: format(new Date(k.date), "d MMM", { locale: uk }),
  }));

  const forecastChartData = (forecasts || []).map(f => ({
    ...f,
    label: format(new Date(f.forecastDate), "d MMM", { locale: uk }),
  }));

  const channelPieData = summary
    ? [
        { name: "Прямі", value: Math.round((100 - (summary as any).otaPct || 60)) },
        { name: "OTA", value: Math.round((summary as any).otaPct || 40) },
      ]
    : [];

  const kpiLast = kpiChartData.length > 0 ? kpiChartData[kpiChartData.length - 1] : null;

  const years = [now.getFullYear() - 1, now.getFullYear()];

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Аналітика</h1>
            <p className="text-muted-foreground mt-1">KPI, ADR, RevPAR та прогнозування попиту</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleGenerateKpi}
              disabled={generateKpiMutation.isPending}
              className="gap-2"
            >
              {generateKpiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Оновити KPI
            </Button>
            <Button
              onClick={handleGenerateForecast}
              disabled={generateForecastMutation.isPending}
              className="gap-2"
            >
              {generateForecastMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Прогноз
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="gap-2"><Activity className="w-4 h-4" /> Огляд</TabsTrigger>
            <TabsTrigger value="monthly" className="gap-2"><Calendar className="w-4 h-4" /> Місячний звіт</TabsTrigger>
            <TabsTrigger value="forecast" className="gap-2"><Target className="w-4 h-4" /> Прогноз</TabsTrigger>
            <TabsTrigger value="channels" className="gap-2"><Globe className="w-4 h-4" /> Канали</TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW TAB ───────────────────────────────── */}
          <TabsContent value="overview" className="space-y-6">
            {summaryLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Top KPI cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    {
                      icon: Hotel,
                      label: "Зайнятість",
                      sub: "Поточний місяць",
                      value: formatPct(summary?.avgOccupancy || 0),
                      from: "bg-blue-50 to-blue-100",
                      text: "text-blue-900",
                      muted: "text-blue-700",
                      badge: "bg-blue-200 text-blue-600",
                    },
                    {
                      icon: DollarSign,
                      label: "ADR",
                      sub: "Середня ціна ночі",
                      value: formatUAH(summary?.avgAdr || 0),
                      from: "bg-emerald-50 to-emerald-100",
                      text: "text-emerald-900",
                      muted: "text-emerald-700",
                      badge: "bg-emerald-200 text-emerald-600",
                    },
                    {
                      icon: BarChart3,
                      label: "RevPAR",
                      sub: "Дохід на номер",
                      value: formatUAH(summary?.avgRevpar || 0),
                      from: "bg-violet-50 to-violet-100",
                      text: "text-violet-900",
                      muted: "text-violet-700",
                      badge: "bg-violet-200 text-violet-600",
                    },
                    {
                      icon: TrendingUp,
                      label: "Дохід",
                      sub: "Місяць",
                      value: formatUAH(summary?.totalRevenue || 0),
                      from: "bg-amber-50 to-amber-100",
                      text: "text-amber-900",
                      muted: "text-amber-700",
                      badge: "bg-amber-200 text-amber-600",
                    },
                  ].map(k => (
                    <Card key={k.label} className={`border-0 shadow-sm bg-gradient-to-br ${k.from}`}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-3">
                          <k.icon className={`w-5 h-5 ${k.muted}`} />
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${k.badge}`}>{k.sub}</span>
                        </div>
                        <p className={`text-2xl font-bold ${k.text}`}>{k.value}</p>
                        <p className={`text-sm ${k.muted} mt-1`}>{k.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Secondary stats row */}
                {kpiLast && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { icon: Users, label: "Заселень сьогодні", value: kpiLast.checkins },
                      { icon: XCircle, label: "Виселень сьогодні", value: kpiLast.checkouts },
                      { icon: Clock, label: "Середнє перебування", value: `${(kpiLast.avgStay || 0).toFixed(1)} ніч.` },
                      { icon: Wifi, label: "Нові бронювання", value: kpiLast.newBookings },
                    ].map(s => (
                      <Card key={s.label} className="shadow-sm border">
                        <CardContent className="pt-4 pb-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted rounded-lg">
                              <s.icon className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-xl font-bold">{s.value}</p>
                              <p className="text-xs text-muted-foreground">{s.label}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* KPI History Chart */}
                {kpiChartData.length > 0 ? (
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" />
                        Динаміка KPI (60 днів)
                      </CardTitle>
                      <CardDescription>Зайнятість, ADR та RevPAR по днях</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={kpiChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} minTickGap={20} />
                            <YAxis yAxisId="pct" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                            <YAxis yAxisId="uah" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}к` : v} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                              formatter={(value: number, name: string) => {
                                if (name === "occupancyRate") return [`${Number(value).toFixed(1)}%`, "Зайнятість"];
                                if (name === "adr") return [formatUAH(Number(value)), "ADR"];
                                if (name === "revpar") return [formatUAH(Number(value)), "RevPAR"];
                                return [value, name];
                              }}
                            />
                            <Area yAxisId="pct" type="monotone" dataKey="occupancyRate" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.1)" strokeWidth={2} />
                            <Line yAxisId="uah" type="monotone" dataKey="adr" stroke="#10b981" strokeWidth={2} dot={false} />
                            <Line yAxisId="uah" type="monotone" dataKey="revpar" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-2 border-dashed">
                    <CardContent className="py-16 text-center">
                      <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
                      <p className="text-muted-foreground font-medium">Дані KPI відсутні</p>
                      <p className="text-sm text-muted-foreground mt-1">Натисніть "Оновити KPI" щоб згенерувати дані</p>
                      <Button onClick={handleGenerateKpi} className="mt-4 gap-2" disabled={generateKpiMutation.isPending}>
                        {generateKpiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Оновити KPI
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Bottom row: Revenue bar + Channel pie */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card className="shadow-sm lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Щоденний дохід</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={kpiChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} minTickGap={20} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}к` : String(v)} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                              formatter={(value: number) => [formatUAH(value), "Дохід"]}
                            />
                            <Bar dataKey="totalRevenue" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle>Канали бронювань</CardTitle>
                      <CardDescription>Прямі vs OTA</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {kpiLast && (kpiLast.directBookings || 0) + (kpiLast.otaBookings || 0) > 0 ? (
                        <div className="h-[180px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={[
                                  { name: "Прямі", value: kpiLast.directBookings || 0 },
                                  { name: "OTA", value: kpiLast.otaBookings || 0 },
                                ]}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={80}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                <Cell fill="hsl(var(--primary))" />
                                <Cell fill="#10b981" />
                              </Pie>
                              <Tooltip formatter={(value: number, name: string) => [`${value} броню.`, name]} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="flex justify-center gap-4 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" /> Прямі ({kpiLast.directBookings || 0})</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> OTA ({kpiLast.otaBookings || 0})</span>
                          </div>
                        </div>
                      ) : (
                        <div className="h-[180px] flex flex-col items-center justify-center text-muted-foreground text-sm">
                          <BarChart3 className="w-8 h-8 mb-2 opacity-30" />
                          Немає даних
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── MONTHLY REPORT TAB ─────────────────────────── */}
          <TabsContent value="monthly" className="space-y-6">
            <div className="flex items-center gap-3">
              <Select value={String(reportMonth)} onValueChange={v => setReportMonth(parseInt(v))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS_UK.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(reportYear)} onValueChange={v => setReportYear(parseInt(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {monthlyLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : monthlyReport ? (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Дохід за місяць", value: formatUAH(monthlyReport.summary.totalRevenue), icon: DollarSign, color: "text-emerald-700", bg: "bg-emerald-50" },
                    { label: "Середня зайнятість", value: formatPct(monthlyReport.summary.avgOccupancy), icon: Hotel, color: "text-blue-700", bg: "bg-blue-50" },
                    { label: "ADR", value: formatUAH(monthlyReport.summary.avgAdr), icon: BarChart3, color: "text-violet-700", bg: "bg-violet-50" },
                    { label: "RevPAR", value: formatUAH(monthlyReport.summary.avgRevpar), icon: TrendingUp, color: "text-amber-700", bg: "bg-amber-50" },
                  ].map(k => (
                    <Card key={k.label} className="shadow-sm">
                      <CardContent className="pt-5">
                        <div className={`inline-flex p-2 rounded-lg ${k.bg} mb-3`}>
                          <k.icon className={`w-5 h-5 ${k.color}`} />
                        </div>
                        <p className="text-2xl font-bold">{k.value}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{k.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Заселень", value: monthlyReport.summary.totalCheckins },
                    { label: "Виселень", value: monthlyReport.summary.totalCheckouts },
                    { label: "Середнє перебування", value: `${monthlyReport.summary.avgStay.toFixed(1)} ніч.` },
                    { label: "Скасувань", value: `${monthlyReport.summary.avgCancellationRate.toFixed(1)}%` },
                  ].map(s => (
                    <Card key={s.label} className="shadow-sm">
                      <CardContent className="pt-4 pb-4">
                        <p className="text-2xl font-bold">{s.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle>Канали продажів</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-primary inline-block" /> Прямі бронювання
                          </span>
                          <span className="font-semibold">{monthlyReport.summary.totalDirectBookings}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> OTA бронювання
                          </span>
                          <span className="font-semibold">{monthlyReport.summary.totalOtaBookings}</span>
                        </div>
                        <div className="border-t pt-2 flex items-center justify-between">
                          <span className="text-sm font-medium">Всього нових бронювань</span>
                          <span className="font-bold">{monthlyReport.summary.totalNewBookings}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {monthlyReport.daily.length > 0 && (
                    <Card className="shadow-sm">
                      <CardHeader>
                        <CardTitle>Дохід по днях</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[180px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyReport.daily.map(d => ({
                              ...d,
                              label: format(new Date(d.date), "d", { locale: uk }),
                            }))} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                              <YAxis hide />
                              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} formatter={(v: number) => [formatUAH(v), "Дохід"]} />
                              <Bar dataKey="totalRevenue" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {monthlyReport.daily.length === 0 && (
                  <Card className="border-2 border-dashed">
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">Немає даних за цей місяць</p>
                      <p className="text-sm mt-1">Оновіть KPI щоб побачити дані</p>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}
          </TabsContent>

          {/* ── FORECAST TAB ───────────────────────────────── */}
          <TabsContent value="forecast" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Прогноз попиту</h2>
                <p className="text-sm text-muted-foreground">Наступні 30 днів з 95% довірчим інтервалом</p>
              </div>
              <Button onClick={handleGenerateForecast} disabled={generateForecastMutation.isPending} className="gap-2">
                {generateForecastMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Оновити прогноз
              </Button>
            </div>

            {forecastLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : forecastChartData.length > 0 ? (
              <>
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      Прогноз зайнятості
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={forecastChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} minTickGap={15} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                            formatter={(value: number, name: string) => {
                              if (name === "predictedOccupancy") return [`${Number(value).toFixed(1)}%`, "Прогноз"];
                              if (name === "confidenceLower") return [`${Number(value).toFixed(1)}%`, "Мін."];
                              if (name === "confidenceUpper") return [`${Number(value).toFixed(1)}%`, "Макс."];
                              return [value, name];
                            }}
                          />
                          <Area type="monotone" dataKey="confidenceUpper" stroke="transparent" fill="#ddd6fe" fillOpacity={0.5} />
                          <Area type="monotone" dataKey="confidenceLower" stroke="transparent" fill="#fff" fillOpacity={1} />
                          <Line type="monotone" dataKey="predictedOccupancy" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} strokeDasharray="5 3" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><span className="w-8 border-t-2 border-dashed border-primary" /> Прогноз</span>
                      <span className="flex items-center gap-1.5"><span className="w-4 h-3 bg-violet-200 rounded opacity-60" /> Довірчий інтервал (95%)</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Прогноз доходу</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={forecastChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} minTickGap={15} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}к` : String(v)} />
                          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} formatter={(v: number) => [formatUAH(v), "Прогноз доходу"]} />
                          <Bar dataKey="predictedRevenue" fill="hsl(var(--primary)/0.7)" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="border-2 border-dashed">
                <CardContent className="py-16 text-center">
                  <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground font-medium">Прогноз відсутній</p>
                  <p className="text-sm text-muted-foreground mt-1">Натисніть "Оновити прогноз" щоб згенерувати</p>
                  <Button onClick={handleGenerateForecast} className="mt-4 gap-2" disabled={generateForecastMutation.isPending}>
                    {generateForecastMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Генерувати прогноз
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── CHANNELS TAB ────────────────────────────────── */}
          <TabsContent value="channels" className="space-y-6">
            {/* Period selector */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Канали бронювання</h2>
                <p className="text-sm text-muted-foreground">Розподіл бронювань та доходу по джерелах</p>
              </div>
              <div className="flex items-center gap-2">
                {[30, 60, 90].map(d => (
                  <button
                    key={d}
                    onClick={() => setChannelDays(d)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${channelDays === d ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
                  >{d} днів</button>
                ))}
              </div>
            </div>

            {channelsLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : !channelsData || channelsData.totalBookings === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="py-16 text-center">
                  <Globe className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground font-medium">Немає даних за обраний період</p>
                  <p className="text-sm text-muted-foreground mt-1">Бронювання з'являться тут після їх додавання</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* KPI row */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Всього бронювань", value: channelsData.totalBookings, icon: <Layers className="w-4 h-4" />, color: "text-primary" },
                    { label: "Загальний дохід", value: formatUAH(channelsData.totalRevenue), icon: <DollarSign className="w-4 h-4" />, color: "text-emerald-600" },
                    { label: "Середній чек", value: formatUAH(channelsData.totalBookings > 0 ? Math.round(channelsData.totalRevenue / channelsData.totalBookings) : 0), icon: <TrendingUp className="w-4 h-4" />, color: "text-violet-600" },
                  ].map(kpi => (
                    <Card key={kpi.label} className="shadow-sm">
                      <CardContent className="pt-4 pb-3">
                        <div className={`flex items-center gap-1.5 text-sm font-medium mb-1 ${kpi.color}`}>
                          {kpi.icon} {kpi.label}
                        </div>
                        <p className="text-2xl font-bold">{kpi.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Main charts row */}
                <div className="grid grid-cols-5 gap-4">
                  {/* Bar chart — bookings by channel */}
                  <Card className="col-span-3 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart3 className="w-4 h-4 text-primary" /> Бронювання по каналах
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={channelsData.channels} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                            <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }} width={120} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                              formatter={(v: number, name: string) => [name === "bookings" ? `${v} бронювань` : formatUAH(v), name === "bookings" ? "Кількість" : "Дохід"]}
                            />
                            <Bar dataKey="bookings" radius={[0, 4, 4, 0]}>
                              {channelsData.channels.map((c: any) => <Cell key={c.source} fill={c.color} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pie chart — revenue share */}
                  <Card className="col-span-2 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Globe className="w-4 h-4 text-primary" /> Частка доходу
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={channelsData.channels} dataKey="revenue" nameKey="label" cx="50%" cy="50%" outerRadius={72} innerRadius={36}>
                              {channelsData.channels.map((c: any) => <Cell key={c.source} fill={c.color} />)}
                            </Pie>
                            <Tooltip
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                              formatter={(v: number, name: string) => [formatUAH(v), name]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Legend */}
                      <div className="space-y-1.5 mt-2">
                        {channelsData.channels.map((c: any) => (
                          <div key={c.source} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                              <span className="text-muted-foreground">{c.label}</span>
                            </div>
                            <span className="font-medium">{c.revenuePct}%</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Detailed table */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Детальний розбір по каналах</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                          <th className="text-left pb-2">Канал</th>
                          <th className="text-right pb-2">Бронювань</th>
                          <th className="text-right pb-2">% від загалу</th>
                          <th className="text-right pb-2">Дохід</th>
                          <th className="text-right pb-2">Частка доходу</th>
                          <th className="text-right pb-2">Ср. чек</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {channelsData.channels.map((c: any) => (
                          <tr key={c.source} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                                <span className="font-medium">{c.label}</span>
                              </div>
                            </td>
                            <td className="text-right py-2.5 font-mono">{c.bookings}</td>
                            <td className="text-right py-2.5">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
                                </div>
                                <span className="w-8 text-right text-muted-foreground">{c.pct}%</span>
                              </div>
                            </td>
                            <td className="text-right py-2.5 font-mono">{formatUAH(c.revenue)}</td>
                            <td className="text-right py-2.5 text-muted-foreground">{c.revenuePct}%</td>
                            <td className="text-right py-2.5 font-mono">{c.bookings > 0 ? formatUAH(Math.round(c.revenue / c.bookings)) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Occupancy heatmap */}
                {channelsData.occupancyHeatmap?.length > 0 && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="w-4 h-4 text-primary" /> Теплова карта зайнятості (35 днів)
                      </CardTitle>
                      <CardDescription>Кожна клітинка — один день; колір — % завантаження</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {/* Day-of-week labels */}
                      <div className="grid grid-cols-7 gap-1.5 mb-1">
                        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map(d => (
                          <div key={d} className="text-center text-xs text-muted-foreground">{d}</div>
                        ))}
                      </div>
                      {/* Heatmap grid */}
                      <div className="grid grid-cols-7 gap-1.5">
                        {channelsData.occupancyHeatmap.map((day: any) => {
                          const occ = day.occupancy;
                          const bg = occ === 0
                            ? "bg-muted/40"
                            : occ < 25 ? "bg-emerald-100 dark:bg-emerald-950"
                            : occ < 50 ? "bg-emerald-300 dark:bg-emerald-800"
                            : occ < 75 ? "bg-amber-400 dark:bg-amber-700"
                            : "bg-red-500 dark:bg-red-700";
                          const textColor = occ >= 50 ? "text-white" : "text-foreground";
                          const d = new Date(day.date + "T12:00:00");
                          return (
                            <div
                              key={day.date}
                              title={`${day.date}: ${occ}% (${day.bookings} бронювань)`}
                              className={`${bg} ${textColor} rounded-md h-12 flex flex-col items-center justify-center cursor-default transition-transform hover:scale-105`}
                            >
                              <span className="text-xs font-medium">{d.getDate()}</span>
                              <span className="text-[10px] opacity-75">{occ}%</span>
                            </div>
                          );
                        })}
                      </div>
                      {/* Legend */}
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span>Завантаження:</span>
                        {[
                          { label: "0%", bg: "bg-muted/40" },
                          { label: "1–24%", bg: "bg-emerald-100" },
                          { label: "25–49%", bg: "bg-emerald-300" },
                          { label: "50–74%", bg: "bg-amber-400" },
                          { label: "75–100%", bg: "bg-red-500" },
                        ].map(l => (
                          <div key={l.label} className="flex items-center gap-1">
                            <span className={`w-3 h-3 rounded ${l.bg} inline-block`} />
                            {l.label}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
