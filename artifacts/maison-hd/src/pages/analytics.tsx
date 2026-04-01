import { useState } from "react";
import {
  useListKpiHistory,
  useListForecasts,
  useGetAnalyticsSummary,
  useGenerateKpi,
  useGenerateForecast,
  getListKpiHistoryQueryKey,
  getGetAnalyticsSummaryQueryKey,
  getListForecastsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Hotel,
  DollarSign,
  BarChart3,
  Sparkles,
  RefreshCw,
  Target,
  Activity,
} from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const formatUAH = (val: number | null | undefined) => {
  if (!val) return "0 ₴";
  return new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", minimumFractionDigits: 0 }).format(val);
};

const formatPct = (val: number) => `${val.toFixed(1)}%`;

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: summary, isLoading: summaryLoading } = useGetAnalyticsSummary();
  const { data: kpiHistory, isLoading: kpiLoading } = useListKpiHistory({ days: 60 });
  const { data: forecasts, isLoading: forecastLoading } = useListForecasts({ days: 30 });

  const generateKpiMutation = useGenerateKpi();
  const generateForecastMutation = useGenerateForecast();

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

  const isLoading = summaryLoading || kpiLoading;

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Розширена аналітика</h1>
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
              Генерувати прогноз
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <Hotel className="w-5 h-5 text-blue-600" />
                    <span className="text-xs font-medium text-blue-600 bg-blue-200 px-2 py-0.5 rounded-full">Поточний місяць</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-900">{formatPct(summary?.avgOccupancy || 0)}</p>
                  <p className="text-sm text-blue-700 mt-1">Середня зайнятість</p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-200 px-2 py-0.5 rounded-full">ADR</span>
                  </div>
                  <p className="text-3xl font-bold text-emerald-900">{formatUAH(summary?.avgAdr || 0)}</p>
                  <p className="text-sm text-emerald-700 mt-1">Середня ціна номеру</p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-gradient-to-br from-violet-50 to-violet-100">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <BarChart3 className="w-5 h-5 text-violet-600" />
                    <span className="text-xs font-medium text-violet-600 bg-violet-200 px-2 py-0.5 rounded-full">RevPAR</span>
                  </div>
                  <p className="text-3xl font-bold text-violet-900">{formatUAH(summary?.avgRevpar || 0)}</p>
                  <p className="text-sm text-violet-700 mt-1">Дохід на номер</p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-amber-100">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <TrendingUp className="w-5 h-5 text-amber-600" />
                    <span className="text-xs font-medium text-amber-600 bg-amber-200 px-2 py-0.5 rounded-full">Місяць</span>
                  </div>
                  <p className="text-3xl font-bold text-amber-900">{formatUAH(summary?.totalRevenue || 0)}</p>
                  <p className="text-sm text-amber-700 mt-1">Загальний дохід</p>
                </CardContent>
              </Card>
            </div>

            {/* KPI History Chart */}
            {kpiChartData.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    Динаміка KPI (60 днів)
                  </CardTitle>
                  <CardDescription>Зайнятість, ADR та RevPAR по днях</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={kpiChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} minTickGap={20} />
                        <YAxis yAxisId="pct" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                        <YAxis yAxisId="uah" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}к` : v} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                          formatter={(value: number, name: string) => {
                            if (name === "occupancyRate") return [`${value.toFixed(1)}%`, "Зайнятість"];
                            if (name === "adr") return [formatUAH(value), "ADR"];
                            if (name === "revpar") return [formatUAH(value), "RevPAR"];
                            return [value, name];
                          }}
                        />
                        <Legend formatter={(val) => val === "occupancyRate" ? "Зайнятість" : val === "adr" ? "ADR" : "RevPAR"} />
                        <Area yAxisId="pct" type="monotone" dataKey="occupancyRate" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.1)" strokeWidth={2} />
                        <Line yAxisId="uah" type="monotone" dataKey="adr" stroke="#10b981" strokeWidth={2} dot={false} />
                        <Line yAxisId="uah" type="monotone" dataKey="revpar" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Forecast Chart */}
            {forecastChartData.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    Прогноз попиту (30 днів)
                  </CardTitle>
                  <CardDescription>Прогноз зайнятості та доходу з довірчим інтервалом</CardDescription>
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
                            if (name === "predictedOccupancy") return [`${value.toFixed(1)}%`, "Прогноз"];
                            if (name === "confidenceLower") return [`${value.toFixed(1)}%`, "Мін."];
                            if (name === "confidenceUpper") return [`${value.toFixed(1)}%`, "Макс."];
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
                    <div className="flex items-center gap-1.5">
                      <div className="w-8 h-0.5 bg-primary" style={{ borderTop: "2px dashed" }} />
                      <span>Прогноз зайнятості</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-3 bg-violet-200 rounded opacity-60" />
                      <span>Довірчий інтервал (95%)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Revenue Bar Chart */}
            {kpiChartData.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Щоденний дохід</CardTitle>
                  <CardDescription>Динаміка доходів за останні 60 днів</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={kpiChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} minTickGap={20} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}к` : String(v)} />
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
            )}

            {/* Empty state */}
            {!kpiLoading && kpiChartData.length === 0 && (
              <Card className="border-2 border-dashed">
                <CardContent className="py-16 text-center">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground font-medium">Дані KPI відсутні</p>
                  <p className="text-sm text-muted-foreground mt-1">Натисніть "Оновити KPI" щоб згенерувати дані за сьогодні</p>
                  <Button onClick={handleGenerateKpi} className="mt-4 gap-2" disabled={generateKpiMutation.isPending}>
                    {generateKpiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Оновити KPI
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
