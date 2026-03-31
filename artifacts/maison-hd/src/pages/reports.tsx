import { useGetOccupancyAnalytics } from "@workspace/api-client-react";
import { format, subDays } from "date-fns";
import { uk } from "date-fns/locale";
import { Loader2, Calendar } from "lucide-react";
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
  Legend
} from "recharts";

import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ReportsPage() {
  const endDate = format(new Date(), 'yyyy-MM-dd');
  const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  
  const { data: analytics, isLoading } = useGetOccupancyAnalytics({
    dateFrom: startDate,
    dateTo: endDate
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  // Transform data for charting if it exists
  const chartData = analytics?.map(item => ({
    ...item,
    dateLabel: format(new Date(item.date), 'd MMM', { locale: uk })
  })) || [];

  const formatUAH = (val: number) => {
    if (val >= 1000) return `${(val/1000).toFixed(1)}к ₴`;
    return `${val} ₴`;
  };

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

        <div className="grid grid-cols-1 gap-8">
          {/* Revenue Chart */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Динаміка доходів</CardTitle>
              <CardDescription>Дохід по днях за обраний період</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full mt-4">
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

          {/* Occupancy Chart */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Завантаженість номерного фонду (%)</CardTitle>
              <CardDescription>Відсоток зайнятих номерів по днях</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full mt-4">
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
      </div>
    </AppLayout>
  );
}
