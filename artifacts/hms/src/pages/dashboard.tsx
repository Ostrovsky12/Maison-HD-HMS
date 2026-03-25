import { useGetDashboardAnalytics } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/shared";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Users, CalendarCheck, BedDouble, ArrowUpRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export default function Dashboard() {
  // Pass realistic date range for seed data logic if needed, or rely on defaults
  const { data: analytics, isLoading } = useGetDashboardAnalytics({});

  if (isLoading) return <AppLayout><div className="p-8 text-muted-foreground animate-pulse">Loading analytics...</div></AppLayout>;
  if (!analytics) return null;

  const COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'];

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Overview of your properties performance today.</p>
          </div>
          <Badge variant="outline" className="px-4 py-1.5 text-sm bg-background">Last 30 Days</Badge>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-gradient-to-br from-card to-card/50 shadow-lg border-border/50 relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-primary/10 rounded-bl-full translate-x-8 -translate-y-8 transition-transform group-hover:scale-110" />
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Occupancy Rate</p>
                  <h3 className="text-3xl font-display font-bold">{analytics.occupancyRate}%</h3>
                </div>
                <div className="p-3 bg-primary/10 rounded-xl"><BedDouble className="w-5 h-5 text-primary" /></div>
              </div>
              <div className="mt-4 flex items-center text-sm text-emerald-500 font-medium">
                <TrendingUp className="w-4 h-4 mr-1" /> +2.4% <span className="text-muted-foreground ml-2 font-normal">vs last month</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-card/50 shadow-lg border-border/50 relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full translate-x-8 -translate-y-8 transition-transform group-hover:scale-110" />
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Total Revenue</p>
                  <h3 className="text-3xl font-display font-bold">{formatCurrency(analytics.totalRevenue)}</h3>
                </div>
                <div className="p-3 bg-emerald-500/10 rounded-xl"><ArrowUpRight className="w-5 h-5 text-emerald-500" /></div>
              </div>
              <div className="mt-4 flex items-center text-sm text-emerald-500 font-medium">
                <TrendingUp className="w-4 h-4 mr-1" /> +12.5% <span className="text-muted-foreground ml-2 font-normal">vs last month</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-card/50 shadow-lg border-border/50 relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-amber-500/10 rounded-bl-full translate-x-8 -translate-y-8 transition-transform group-hover:scale-110" />
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Total Bookings</p>
                  <h3 className="text-3xl font-display font-bold">{analytics.totalBookings}</h3>
                </div>
                <div className="p-3 bg-amber-500/10 rounded-xl"><CalendarCheck className="w-5 h-5 text-amber-500" /></div>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                <span className="text-foreground font-medium">{analytics.pendingBookings}</span> pending approval
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-card/50 shadow-lg border-border/50 relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-blue-500/10 rounded-bl-full translate-x-8 -translate-y-8 transition-transform group-hover:scale-110" />
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Today's Activity</p>
                  <div className="flex space-x-4 mt-2">
                    <div>
                      <div className="text-2xl font-display font-bold text-foreground">{analytics.checkedInToday}</div>
                      <div className="text-xs text-muted-foreground">Arrivals</div>
                    </div>
                    <div className="w-px bg-border"></div>
                    <div>
                      <div className="text-2xl font-display font-bold text-foreground">{analytics.checkingOutToday}</div>
                      <div className="text-xs text-muted-foreground">Departures</div>
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
              <CardTitle>Revenue by Property</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.revenueByProperty} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="propertyName" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dx={-10} tickFormatter={(value) => `$${value}`} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.5)' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Booking Sources</CardTitle>
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
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full space-y-2 mt-4">
                {analytics.bookingsBySource.map((source, i) => (
                  <div key={source.source} className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="capitalize">{source.source}</span>
                    </div>
                    <span className="font-medium">{source.percentage}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
