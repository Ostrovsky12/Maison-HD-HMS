import { useGetOccupancyAnalytics, useListNightAudits, useRunNightAudit } from "@workspace/api-client-react";
import { format, subDays } from "date-fns";
import { uk } from "date-fns/locale";
import { Loader2, Calendar, Moon, Play, TrendingUp, Users, Hotel, DollarSign, CheckCircle2, AlertCircle } from "lucide-react";
import { 
  LineChart, 
  Line, 
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
} from "recharts";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function ReportsPage() {
  const { toast } = useToast();
  const endDate = format(new Date(), 'yyyy-MM-dd');
  const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  
  const { data: analytics, isLoading } = useGetOccupancyAnalytics({
    dateFrom: startDate,
    dateTo: endDate
  });

  const { data: nightAudits, refetch: refetchAudits } = useListNightAudits({});
  const runAuditMutation = useRunNightAudit();

  const handleRunAudit = () => {
    runAuditMutation.mutate(
      { data: {} },
      {
        onSuccess: (data) => {
          refetchAudits();
          toast({
            title: "Нічний аудит виконано",
            description: `Дата: ${data.auditDate} · Завантаженість: ${data.occupancyRate?.toFixed(1)}%`,
          });
        },
        onError: () => {
          toast({
            title: "Помилка",
            description: "Не вдалося виконати нічний аудит",
            variant: "destructive",
          });
        },
      }
    );
  };

  const chartData = analytics?.map(item => ({
    ...item,
    dateLabel: format(new Date(item.date), 'd MMM', { locale: uk })
  })) || [];

  const formatUAH = (val: number) => {
    if (val >= 1000) return `${(val/1000).toFixed(1)}к ₴`;
    return `${val} ₴`;
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (!val) return "0 ₴";
    return new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", minimumFractionDigits: 0 }).format(val);
  };

  const latestAudit = (nightAudits || [])[0];

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Аналітика та Звіти</h1>
            <p className="text-muted-foreground mt-1">Детальний аналіз доходів та завантаженості.</p>
          </div>
          <Button variant="outline" className="gap-2">
            <Calendar className="w-4 h-4" />
            Останні 30 днів
          </Button>
        </div>

        {/* Night Audit Section */}
        <Card className="border-2 border-dashed border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="w-5 h-5 text-primary" />
                <CardTitle>Нічний аудит</CardTitle>
              </div>
              <Button
                onClick={handleRunAudit}
                disabled={runAuditMutation.isPending}
                className="gap-2"
              >
                {runAuditMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Виконати аудит
              </Button>
            </div>
            <CardDescription>Закриття дня: підрахунок зайнятості, виручки та ключових показників</CardDescription>
          </CardHeader>
          <CardContent>
            {latestAudit ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {latestAudit.status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  )}
                  <span>Останній аудит: {latestAudit.auditDate} — </span>
                  <span className={latestAudit.status === "completed" ? "text-emerald-600" : "text-amber-600"}>
                    {latestAudit.status === "completed" ? "Виконано" : "Помилка"}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-2 mb-1">
                      <Hotel className="w-4 h-4 text-blue-500" />
                      <span className="text-xs text-blue-700">Зайнятість</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-800">{latestAudit.occupancyRate?.toFixed(1)}%</p>
                    <p className="text-xs text-blue-600">{latestAudit.occupiedUnits} / {latestAudit.totalUnits} номерів</p>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs text-emerald-700">Виручка</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-800">{formatCurrency(latestAudit.totalRevenue)}</p>
                    <p className="text-xs text-emerald-600">Проживання: {formatCurrency(latestAudit.accommodationRevenue)}</p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-amber-500" />
                      <span className="text-xs text-amber-700">Гостей</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-800">{latestAudit.totalGuests}</p>
                    <p className="text-xs text-amber-600">Заселень: {latestAudit.newCheckins} · Виїздів: {latestAudit.checkouts}</p>
                  </div>
                  <div className="p-4 bg-violet-50 rounded-xl border border-violet-100">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-violet-500" />
                      <span className="text-xs text-violet-700">Бронювання</span>
                    </div>
                    <p className="text-2xl font-bold text-violet-800">{latestAudit.newBookings}</p>
                    <p className="text-xs text-violet-600">Скасувань: {latestAudit.cancellations}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Moon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Натисніть "Виконати аудит" для закриття поточного дня</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audit History */}
        {(nightAudits || []).length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Історія нічних аудитів</CardTitle>
              <CardDescription>Останні записи закриття дня</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">Дата</th>
                      <th className="text-right py-2 pr-4">Зайнятість</th>
                      <th className="text-right py-2 pr-4">Номерів</th>
                      <th className="text-right py-2 pr-4">Виручка</th>
                      <th className="text-right py-2 pr-4">Гостей</th>
                      <th className="text-right py-2">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(nightAudits || []).slice(0, 10).map((audit) => (
                      <tr key={audit.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="py-2.5 pr-4 font-medium">{audit.auditDate}</td>
                        <td className="py-2.5 pr-4 text-right">{audit.occupancyRate?.toFixed(1)}%</td>
                        <td className="py-2.5 pr-4 text-right">{audit.occupiedUnits}/{audit.totalUnits}</td>
                        <td className="py-2.5 pr-4 text-right">{formatCurrency(audit.totalRevenue)}</td>
                        <td className="py-2.5 pr-4 text-right">{audit.totalGuests}</td>
                        <td className="py-2.5 text-right">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            audit.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          }`}>
                            {audit.status === "completed" ? "Виконано" : "Помилка"}
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

        {/* Occupancy analytics charts */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Динаміка доходів</CardTitle>
                <CardDescription>Дохід по днях за обраний період</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[350px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: "hsl(var(--muted-foreground))"}} minTickGap={30} />
                      <YAxis tickFormatter={formatUAH} axisLine={false} tickLine={false} tick={{fontSize: 12, fill: "hsl(var(--muted-foreground))"}} />
                      <Tooltip
                        formatter={(value: number) => [`${value.toLocaleString('uk-UA')} ₴`, 'Дохід']}
                        labelStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold", marginBottom: "4px" }}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Завантаженість номерного фонду (%)</CardTitle>
                <CardDescription>Відсоток зайнятих номерів по днях</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: "hsl(var(--muted-foreground))"}} minTickGap={30} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: "hsl(var(--muted-foreground))"}} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, 'Завантаженість']}
                        labelStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold", marginBottom: "4px" }}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      />
                      <Line type="monotone" dataKey="occupancyRate" stroke="hsl(var(--chart-1))" strokeWidth={3} dot={{r: 2, fill: "hsl(var(--chart-1))"}} activeDot={{r: 6}} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
