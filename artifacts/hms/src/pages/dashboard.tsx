import { useGetDashboardAnalytics } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/shared";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Users, CalendarCheck, BedDouble, ArrowUpRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const SOURCE_LABELS: Record<string, string> = {
  direct: "Прямий",
  booking: "Booking.com",
  airbnb: "Airbnb",
  expedia: "Expedia",
  other: "Інше",
};

const STATUS_UA: Record<string, string> = {
  confirmed: "Підтверджено",
  pending: "Очікує",
  checked_in: "Заселено",
  checked_out: "Виїхав",
  cancelled: "Скасовано",
};

const PAYMENT_UA: Record<string, string> = {
  paid: "Оплачено",
  unpaid: "Не оплачено",
  partial: "Частково",
  refunded: "Повернено",
};

export default function Dashboard() {
  const { data: analytics, isLoading } = useGetDashboardAnalytics({});

  if (isLoading) return <AppLayout><div className="p-8 text-muted-foreground animate-pulse">Завантаження аналітики...</div></AppLayout>;
  if (!analytics) return null;

  const COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'];

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Дашборд</h1>
            <p className="text-muted-foreground mt-1">Загальний огляд роботи готелю за сьогодні.</p>
          </div>
          <Badge variant="outline" className="px-4 py-1.5 text-sm bg-background">Останні 30 днів</Badge>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-gradient-to-br from-card to-card/50 shadow-lg border-border/50 relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-primary/10 rounded-bl-full translate-x-8 -translate-y-8 transition-transform group-hover:scale-110" />
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Завантаженість</p>
                  <h3 className="text-3xl font-display font-bold">{analytics.occupancyRate}%</h3>
                </div>
                <div className="p-3 bg-primary/10 rounded-xl"><BedDouble className="w-5 h-5 text-primary" /></div>
              </div>
              <div className="mt-4 flex items-center text-sm text-emerald-500 font-medium">
                <TrendingUp className="w-4 h-4 mr-1" /> +2.4% <span className="text-muted-foreground ml-2 font-normal">до минулого місяця</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-card/50 shadow-lg border-border/50 relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full translate-x-8 -translate-y-8 transition-transform group-hover:scale-110" />
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Виручка</p>
                  <h3 className="text-3xl font-display font-bold">{formatCurrency(analytics.totalRevenue)}</h3>
                </div>
                <div className="p-3 bg-emerald-500/10 rounded-xl"><ArrowUpRight className="w-5 h-5 text-emerald-500" /></div>
              </div>
              <div className="mt-4 flex items-center text-sm text-emerald-500 font-medium">
                <TrendingUp className="w-4 h-4 mr-1" /> +12.5% <span className="text-muted-foreground ml-2 font-normal">до минулого місяця</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-card/50 shadow-lg border-border/50 relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-amber-500/10 rounded-bl-full translate-x-8 -translate-y-8 transition-transform group-hover:scale-110" />
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Бронювання</p>
                  <h3 className="text-3xl font-display font-bold">{analytics.totalBookings}</h3>
                </div>
                <div className="p-3 bg-amber-500/10 rounded-xl"><CalendarCheck className="w-5 h-5 text-amber-500" /></div>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                <span className="text-foreground font-medium">{analytics.pendingBookings}</span> очікують підтвердження
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-card/50 shadow-lg border-border/50 relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-blue-500/10 rounded-bl-full translate-x-8 -translate-y-8 transition-transform group-hover:scale-110" />
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Активність сьогодні</p>
                  <div className="flex space-x-4 mt-2">
                    <div>
                      <div className="text-2xl font-display font-bold text-foreground">{analytics.checkedInToday}</div>
                      <div className="text-xs text-muted-foreground">Заїзди</div>
                    </div>
                    <div className="w-px bg-border"></div>
                    <div>
                      <div className="text-2xl font-display font-bold text-foreground">{analytics.checkingOutToday}</div>
                      <div className="text-xs text-muted-foreground">Виїзди</div>
                    </div>
                  </div>
                </div>
                <div className="p-3 bg-blue-500/10 rounded-xl"><Users className="w-5 h-5 text-blue-500" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 shadow-md">
            <CardHeader>
              <CardTitle>Виручка за об'єктами</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.revenueByProperty} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="propertyName" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dx={-10} tickFormatter={(value) => `$${value}`} />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--muted)/0.5)' }} 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(value: number) => [formatCurrency(value), 'Виручка']}
                    />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Джерела бронювань</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center">
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.bookingsBySource}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="count"
                      nameKey="source"
                    >
                      {analytics.bookingsBySource.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(value, name) => [value, SOURCE_LABELS[name as string] || name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full space-y-2 mt-4">
                {analytics.bookingsBySource.map((source, i) => (
                  <div key={source.source} className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span>{SOURCE_LABELS[source.source] || source.source}</span>
                    </div>
                    <span className="font-medium">{source.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Bookings */}
        {analytics.recentBookings && analytics.recentBookings.length > 0 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Останні бронювання</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                    <tr>
                      <th className="px-6 py-3 text-left">Гість</th>
                      <th className="px-6 py-3 text-left">Юніт</th>
                      <th className="px-6 py-3 text-left">Заїзд</th>
                      <th className="px-6 py-3 text-left">Виїзд</th>
                      <th className="px-6 py-3 text-left">Статус</th>
                      <th className="px-6 py-3 text-left">Оплата</th>
                      <th className="px-6 py-3 text-right">Сума</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {analytics.recentBookings.map((b: any) => (
                      <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-3 font-medium">{b.guestName}</td>
                        <td className="px-6 py-3 text-muted-foreground">{b.unitName}</td>
                        <td className="px-6 py-3">{b.checkIn}</td>
                        <td className="px-6 py-3">{b.checkOut}</td>
                        <td className="px-6 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            b.status === 'checked_in' ? 'bg-emerald-500/10 text-emerald-600' :
                            b.status === 'confirmed' ? 'bg-blue-500/10 text-blue-600' :
                            b.status === 'pending' ? 'bg-amber-500/10 text-amber-600' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {STATUS_UA[b.status] || b.status}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            b.paymentStatus === 'paid' ? 'bg-emerald-500/10 text-emerald-600' :
                            b.paymentStatus === 'partial' ? 'bg-amber-500/10 text-amber-600' :
                            'bg-red-500/10 text-red-600'
                          }`}>
                            {PAYMENT_UA[b.paymentStatus] || b.paymentStatus}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right font-medium">{formatCurrency(b.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
