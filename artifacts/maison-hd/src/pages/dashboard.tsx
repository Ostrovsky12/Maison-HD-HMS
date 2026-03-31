import { useGetDashboardAnalytics, useListBookings } from "@workspace/api-client-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { 
  Users, 
  CreditCard, 
  TrendingUp, 
  CalendarCheck,
  ArrowRightLeft,
  ArrowRight,
  ArrowLeft,
  Loader2
} from "lucide-react";

import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line } from "recharts";

export default function DashboardPage() {
  const { data: analytics, isLoading: analyticsLoading } = useGetDashboardAnalytics({});
  
  // Today's arrivals and departures
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: todayBookings, isLoading: bookingsLoading } = useListBookings({
    dateFrom: today,
    dateTo: today
  });

  if (analyticsLoading || bookingsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const formatCurrency = (amount: number = 0) => {
    return new Intl.NumberFormat("uk-UA", {
      style: "currency",
      currency: "UAH",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const checkins = todayBookings?.filter(b => b.checkIn.startsWith(today)) || [];
  const checkouts = todayBookings?.filter(b => b.checkOut.startsWith(today)) || [];

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Головна панель</h1>
            <p className="text-muted-foreground mt-1">Огляд показників на сьогодні, {format(new Date(), 'd MMMM yyyy', { locale: uk })}</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Завантаженість</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(analytics?.occupancyRate || 0)}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                Поточний стан номерного фонду
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Дохід за місяць</CardTitle>
              <CreditCard className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(analytics?.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Загальна сума з {format(new Date(), 'MMMM', { locale: uk })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Заїзди сьогодні</CardTitle>
              <ArrowRight className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.checkedInToday || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Гостей очікується
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Виїзди сьогодні</CardTitle>
              <ArrowLeft className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.checkingOutToday || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Гостей покидають готель
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts & Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Дохід за джерелами</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {analytics?.bookingsBySource && analytics.bookingsBySource.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.bookingsBySource}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="source" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                      <RechartsTooltip 
                        cursor={{fill: 'hsl(var(--muted))'}}
                        contentStyle={{backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))'}}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Немає даних для відображення</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5" /> Рух гостей
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Заїзди ({checkins.length})
                  </h3>
                  {checkins.length > 0 ? (
                    <div className="space-y-3">
                      {checkins.map(booking => (
                        <div key={booking.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                          <div>
                            <div className="font-medium">{booking.guestName || `Гість #${booking.guestId}`}</div>
                            <div className="text-muted-foreground text-xs">{booking.unitName || `Номер #${booking.unitId}`}</div>
                          </div>
                          <Badge variant={booking.status === 'checked_in' ? 'default' : 'outline'}>
                            {booking.status === 'checked_in' ? 'Заїхав' : 'Очікується'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">На сьогодні заїздів немає.</p>
                  )}
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    Виїзди ({checkouts.length})
                  </h3>
                  {checkouts.length > 0 ? (
                    <div className="space-y-3">
                      {checkouts.map(booking => (
                        <div key={booking.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                          <div>
                            <div className="font-medium">{booking.guestName || `Гість #${booking.guestId}`}</div>
                            <div className="text-muted-foreground text-xs">{booking.unitName || `Номер #${booking.unitId}`}</div>
                          </div>
                          <Badge variant={booking.status === 'checked_out' ? 'secondary' : 'outline'}>
                            {booking.status === 'checked_out' ? 'Виїхав' : 'Проживає'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">На сьогодні виїздів немає.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          
        </div>
      </div>
    </AppLayout>
  );
}
