import { useGetDashboardAnalytics, useListBookings, useGetMe } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  TrendingUp, CreditCard, ArrowRight, ArrowLeft, Users,
  CalendarCheck, BedDouble, Loader2, Sparkles, ChevronRight,
  BarChart2, Clock, CheckCircle, AlertCircle, Home,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { useLocation } from "wouter";

function KpiCard({
  label, value, sub, icon: Icon, iconBg, iconColor, trend, accent,
}: {
  label: string; value: string; sub?: string; icon: any;
  iconBg: string; iconColor: string; trend?: string; accent?: boolean;
}) {
  return (
    <div className={`relative bg-white rounded-2xl border border-gray-200/80 p-5 overflow-hidden shadow-sm hover:shadow-md transition-shadow ${accent ? "ring-2 ring-indigo-500/20" : ""}`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        {trend && (
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">{trend}</span>
        )}
      </div>
      <div className="font-bold text-2xl text-gray-900 tracking-tight mb-0.5 font-display">{value}</div>
      <div className="text-sm text-gray-500 font-medium">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-emerald-500",
    pending: "bg-amber-400",
    cancelled: "bg-red-400",
    checked_in: "bg-blue-500",
    checked_out: "bg-gray-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status] || "bg-gray-300"}`} />;
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Підтверджено",
  pending: "Очікує",
  cancelled: "Скасовано",
  checked_in: "Заселено",
  checked_out: "Виселено",
};

const API = import.meta.env.VITE_API_URL || "";
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (url: string) => fetch(url, { headers: { Authorization: `Bearer ${tok()}` } });

export default function DashboardPage() {
  const { data: analytics, isLoading: analyticsLoading } = useGetDashboardAnalytics({});
  const { data: user } = useGetMe();
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: todayBookings } = useListBookings({ dateFrom: today, dateTo: today });
  const [, navigate] = useLocation();
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");

  const { data: paymentSummary } = useQuery<{ count: number; totalDebt: number; payOnArrivalCount: number }>({
    queryKey: ["payment-summary"],
    queryFn: () => apiFetch(`${API}/bookings/payment-summary`).then((r: Response) => r.ok ? r.json() : { count: 0, totalDebt: 0, payOnArrivalCount: 0 }),
    refetchInterval: 60000,
  });

  if (analyticsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full min-h-[50vh]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Завантаження...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const fmt = (n: number = 0) =>
    new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(n);

  const occupancy = Math.round(analytics?.occupancyRate || 0);
  const checkins = analytics?.checkedInToday || 0;
  const checkouts = analytics?.checkingOutToday || 0;
  const totalGuests = analytics?.totalGuests || 0;
  const revenue = analytics?.totalRevenue || 0;
  const revenueData = analytics?.revenueByMonth || [];
  const bookingsByDay = analytics?.bookingsByDay || [];
  const recent = todayBookings?.slice(0, 8) || [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Доброго ранку" : hour < 18 ? "Доброго дня" : "Доброго вечора";
  const firstName = user?.name?.split(" ")[0] || "Команда";

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* ── Page header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
          <div>
            <p className="text-sm text-gray-400 font-medium mb-1">
              {format(new Date(), "EEEE, d MMMM yyyy", { locale: uk })}
            </p>
            <h1 className="text-2xl font-bold text-gray-900 font-display">
              {greeting}, {firstName} 👋
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`~${BASE}/bookings`)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-500/30"
            >
              <Sparkles className="w-4 h-4" />
              Нове бронювання
            </button>
          </div>
        </div>

        {/* ── KPI row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Завантаженість"
            value={`${occupancy}%`}
            sub="Поточний день"
            icon={BedDouble}
            iconBg="bg-indigo-100"
            iconColor="text-indigo-600"
            accent={true}
          />
          <KpiCard
            label="Дохід за місяць"
            value={fmt(revenue)}
            icon={CreditCard}
            iconBg="bg-emerald-100"
            iconColor="text-emerald-600"
          />
          <KpiCard
            label="Заїзди сьогодні"
            value={String(checkins)}
            sub="Очікується"
            icon={ArrowRight}
            iconBg="bg-sky-100"
            iconColor="text-sky-600"
          />
          <KpiCard
            label="Виїзди сьогодні"
            value={String(checkouts)}
            sub="Гостей виїжджає"
            icon={ArrowLeft}
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
          />
        </div>

        {/* ── Очікуємо оплат ── */}
        {paymentSummary && paymentSummary.count > 0 && (
          <div
            className="flex items-center gap-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-4 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(`~${BASE}/bookings`)}
          >
            <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
              <AlertCircle className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 text-base">Очікуємо оплат</div>
              <div className="text-sm text-gray-500">
                {paymentSummary.count} бронювань на суму{" "}
                <span className="font-bold text-orange-700">
                  {new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(paymentSummary.totalDebt)}
                </span>
                {paymentSummary.payOnArrivalCount > 0 && (
                  <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                    {paymentSummary.payOnArrivalCount} при заїзді
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-orange-600 hidden sm:block">Переглянути</span>
              <ChevronRight className="w-4 h-4 text-orange-400" />
            </div>
          </div>
        )}

        {/* ── Secondary stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Всього гостей", value: totalGuests, icon: Users, color: "text-violet-600", bg: "bg-violet-100" },
            { label: "Бронювань сьогодні", value: todayBookings?.length || 0, icon: CalendarCheck, color: "text-rose-600", bg: "bg-rose-100" },
            { label: "Активних резервацій", value: analytics?.activeBookings || 0, icon: CheckCircle, color: "text-teal-600", bg: "bg-teal-100" },
            { label: "Середнє перебування", value: `${(analytics?.avgStayLength || 0).toFixed(1)} н`, icon: Clock, color: "text-orange-600", bg: "bg-orange-100" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-200/80 p-4 flex items-center gap-3 shadow-sm">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.bg} shrink-0`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <div className="font-bold text-xl text-gray-900 font-display leading-tight">{s.value}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Charts + Arrivals ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Revenue chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-gray-800">Дохід по місяцях</h3>
                <p className="text-xs text-gray-400 mt-0.5">Динаміка за поточний рік</p>
              </div>
              <BarChart2 className="w-4 h-4 text-gray-300" />
            </div>
            {revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={revenueData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                    tickFormatter={v => (v / 1000).toFixed(0) + "к"} />
                  <ReTooltip
                    contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
                    formatter={(v: any) => [fmt(v), "Дохід"]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#4F46E5" strokeWidth={2} fill="url(#rev)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-44 flex items-center justify-center text-sm text-gray-400">
                Недостатньо даних для графіка
              </div>
            )}
          </div>

          {/* Occupancy / quick stats */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm flex flex-col">
            <h3 className="font-semibold text-gray-800 mb-4">Статус сьогодні</h3>

            {/* Occupancy gauge */}
            <div className="flex-1 flex flex-col items-center justify-center py-4">
              <div className="relative w-28 h-28 mb-3">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F3F4F6" strokeWidth="2.5" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#4F46E5" strokeWidth="2.5"
                    strokeDasharray={`${(occupancy / 100) * 100} 100`}
                    strokeLinecap="round" className="transition-all duration-700" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900 font-display">{occupancy}%</span>
                  <span className="text-[10px] text-gray-400">Зайнятість</span>
                </div>
              </div>

              <div className="w-full space-y-2 mt-2">
                {[
                  { label: "Заїздів", value: checkins, color: "bg-sky-500" },
                  { label: "Виїздів", value: checkouts, color: "bg-amber-500" },
                  { label: "Гостей", value: totalGuests, color: "bg-violet-500" },
                ].map(r => (
                  <div key={r.label} className="flex items-center gap-2.5 text-sm">
                    <div className={`w-2 h-2 rounded-full ${r.color} shrink-0`} />
                    <span className="text-gray-500 flex-1">{r.label}</span>
                    <span className="font-semibold text-gray-800">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Today's arrivals table ── */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h3 className="font-semibold text-gray-800">Бронювання сьогодні</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {format(new Date(), "d MMMM", { locale: uk })} · {todayBookings?.length || 0} бронювань
              </p>
            </div>
            <button
              onClick={() => navigate(`~${BASE}/bookings`)}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              Всі бронювання <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recent.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarCheck className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Бронювань на сьогодні немає</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recent.map((b: any) => (
                <div key={b.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {(b.guestName || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-800 truncate">{b.guestName || "—"}</div>
                    <div className="text-xs text-gray-400">#{b.id} · Кімната {b.unitName || "—"}</div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
                    <ArrowRight className="w-3 h-3 text-emerald-500" />
                    {format(new Date(b.checkIn), "d MMM", { locale: uk })}
                    <span className="text-gray-300">→</span>
                    {format(new Date(b.checkOut), "d MMM", { locale: uk })}
                  </div>
                  <div className="shrink-0">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                      b.status === "confirmed" ? "bg-emerald-50 text-emerald-700" :
                      b.status === "checked_in" ? "bg-blue-50 text-blue-700" :
                      b.status === "cancelled" ? "bg-red-50 text-red-600" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      <StatusDot status={b.status} />
                      {STATUS_LABELS[b.status] || b.status}
                    </span>
                  </div>
                  <div className="hidden sm:block text-sm font-semibold text-gray-800 shrink-0">
                    {new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(b.totalAmount || 0)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Booking activity chart ── */}
        {bookingsByDay.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-gray-800">Активність бронювань</h3>
                <p className="text-xs text-gray-400 mt-0.5">Кількість бронювань по днях</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={bookingsByDay} margin={{ top: 0, right: 0, left: -25, bottom: 0 }} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                  tickFormatter={d => format(new Date(d), "d MMM", { locale: uk })} />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <ReTooltip
                  contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
                  formatter={(v: any) => [v, "Бронювань"]}
                />
                <Bar dataKey="bookings" fill="#4F46E5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
