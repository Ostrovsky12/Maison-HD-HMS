import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, RefreshCw, LogOut,
  Banknote, CreditCard, QrCode, Users, ShoppingBag,
  BedDouble, ArrowDownToLine, ArrowUpFromLine, Layers,
  ChevronRight, Star, Coffee,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split("T")[0];
}

function weekAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().split("T")[0];
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return Math.round(n).toString();
}

function fmtFull(n: number) {
  return new Intl.NumberFormat("uk-UA").format(Math.round(n));
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("uk-UA", { weekday: "short" });
}

async function apiFetch(path: string) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

// ─── Period tabs ──────────────────────────────────────────────────────────────

type Period = "today" | "week" | "month";

function periodRange(p: Period): { from: string; to: string } {
  const t = today();
  if (p === "today") return { from: t, to: t };
  if (p === "week") return { from: weekAgo(), to: t };
  const d = new Date();
  d.setDate(1);
  return { from: d.toISOString().split("T")[0], to: t };
}

// ─── Payment method labels ─────────────────────────────────────────────────

const PAY_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  cash:    { label: "Готівка",  icon: <Banknote className="w-4 h-4" />,   color: "text-green-600 bg-green-50" },
  card:    { label: "Картка",   icon: <CreditCard className="w-4 h-4" />,  color: "text-blue-600 bg-blue-50" },
  liqpay:  { label: "LiqPay",   icon: <QrCode className="w-4 h-4" />,      color: "text-purple-600 bg-purple-50" },
  online:  { label: "Онлайн",   icon: <QrCode className="w-4 h-4" />,      color: "text-indigo-600 bg-indigo-50" },
};

function payInfo(method: string) {
  return PAY_LABELS[method] || { label: method, icon: <CreditCard className="w-4 h-4" />, color: "text-gray-600 bg-gray-50" };
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, accent }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; accent?: string;
}) {
  return (
    <div className={`rounded-2xl p-4 flex flex-col gap-1 ${accent || "bg-white"} shadow-sm border border-black/5`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <span className="opacity-40">{icon}</span>
      </div>
      <span className="text-2xl font-bold tracking-tight text-gray-900">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function Section({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pt-5 pb-1">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
      {right}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OwnerDashboard() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [period, setPeriod] = useState<Period>("today");
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const { from, to } = periodRange(period);
  const t = today();
  const w = weekAgo();

  // Redirect if not logged in
  useEffect(() => {
    if (!localStorage.getItem("hms_token")) navigate("/login");
  }, []);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const id = setInterval(() => setRefreshKey(k => k + 1), 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const qOpts = { refetchOnWindowFocus: false };

  const { data: fbOverview } = useQuery({
    queryKey: ["owner-fb-overview", from, to, refreshKey],
    queryFn: () => apiFetch(`/api/fb/analytics/overview?from=${from}&to=${to}`),
    ...qOpts,
  });

  const { data: fbShift } = useQuery({
    queryKey: ["owner-fb-shift", refreshKey],
    queryFn: () => apiFetch("/api/fb/cashbox/x-report"),
    ...qOpts,
  });

  const { data: fbProducts } = useQuery({
    queryKey: ["owner-fb-products", from, to, refreshKey],
    queryFn: () => apiFetch(`/api/fb/analytics/products?from=${from}&to=${to}`),
    ...qOpts,
  });

  const { data: fbWeek } = useQuery({
    queryKey: ["owner-fb-week", refreshKey],
    queryFn: () => apiFetch(`/api/fb/analytics/overview?from=${w}&to=${t}`),
    ...qOpts,
  });

  const { data: rooms } = useQuery({
    queryKey: ["owner-rooms", refreshKey],
    queryFn: () => apiFetch(`/analytics/dashboard?dateFrom=${t}&dateTo=${t}`),
    ...qOpts,
  });

  // Computed values
  const kpi = fbOverview?.kpi || {};
  const revenue = Number(kpi.revenue || 0);
  const checks = Number(kpi.checks || 0);
  const avgCheck = Number(kpi.avg_check || 0);
  const guests = Number(kpi.guests || 0);

  const shift = fbShift?.session;
  const shiftTotals = fbShift?.totals || {};
  const shiftRevenue = Number(shiftTotals.revenue || 0);
  const shiftChecks = Number(shiftTotals.checks || 0);
  const byPayment: any[] = fbShift?.byPayment || [];

  const topItems = (fbProducts?.products || []).slice(0, 5);

  const weekChart = (fbWeek?.chart || []).map((d: any) => ({
    day: dayLabel(d.date),
    revenue: Number(d.revenue || 0),
    date: d.date,
    isToday: d.date === t,
  }));

  const occupancy = rooms?.occupancyRate ? Math.round(rooms.occupancyRate) : null;
  const arrivals = rooms?.checkedInToday?.[0]?.count || 0;
  const departures = rooms?.checkingOutToday?.[0]?.count || 0;

  // Date heading
  const dateHeading = new Date().toLocaleDateString("uk-UA", {
    weekday: "long", day: "numeric", month: "long",
  });

  const PERIODS: { key: Period; label: string }[] = [
    { key: "today", label: "Сьогодні" },
    { key: "week", label: "7 днів" },
    { key: "month", label: "Місяць" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-12" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Header ── */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-gray-900">Maison HD</span>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Boss</span>
          </div>
          <p className="text-xs text-gray-400 capitalize">{dateHeading}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className={`p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-all ${refreshing ? "animate-spin text-blue-500" : ""}`}>
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => { logout(); navigate("/login"); }}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-400">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Period selector ── */}
      <div className="flex gap-1 px-4 pt-4 pb-1">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
              period === p.key
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── F&B KPIs ── */}
      <Section title="🍽 F&B — Ресторан" />
      <div className="grid grid-cols-2 gap-3 px-4">
        <div className="col-span-2 rounded-2xl p-4 bg-gray-900 text-white shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 font-medium">Виручка</span>
            <TrendingUp className="w-4 h-4 opacity-40" />
          </div>
          <div className="text-3xl font-bold tracking-tight">{fmtFull(revenue)} ₴</div>
          <div className="text-xs text-gray-400 mt-1">
            {checks} чеків · середній {fmtFull(avgCheck)} ₴
          </div>
        </div>
        <KpiCard label="Гостей" value={fmt(guests)} sub="за обраний період"
          icon={<Users className="w-4 h-4" />} accent="bg-white" />
        <KpiCard label="Чеків" value={fmt(checks)} sub={`~${fmtFull(avgCheck)} ₴ сер.`}
          icon={<ShoppingBag className="w-4 h-4" />} accent="bg-white" />
      </div>

      {/* ── Payment breakdown ── */}
      {byPayment.length > 0 && (
        <>
          <Section title="💳 Каса — поточна зміна"
            right={
              shift ? (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  ● Відкрита
                </span>
              ) : (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Закрита</span>
              )
            }
          />
          <div className="px-4 space-y-2">
            {/* Shift total */}
            <div className="bg-white rounded-2xl px-4 py-3 border border-black/5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Зміна з {shift?.opened_at ? new Date(shift.opened_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                  <div className="text-2xl font-bold text-gray-900">{fmtFull(shiftRevenue)} ₴</div>
                  <div className="text-xs text-gray-400">{shiftChecks} чеків</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400 mb-1">Баланс каси</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {fmtFull(Number(shift?.expected_balance || 0))} ₴
                  </div>
                </div>
              </div>
            </div>

            {/* By payment method */}
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
              {byPayment.map((pm: any, i: number) => {
                const info = payInfo(pm.method);
                const pct = shiftRevenue > 0 ? (Number(pm.amount) / shiftRevenue * 100) : 0;
                return (
                  <div key={pm.method} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-gray-50" : ""}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${info.color}`}>
                      {info.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">{info.label}</span>
                        <span className="text-sm font-semibold text-gray-900">{fmtFull(Number(pm.amount))} ₴</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-800 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{pm.cnt} чеків · {Math.round(pct)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Top items ── */}
      {topItems.length > 0 && (
        <>
          <Section title="🏆 Топ страви" />
          <div className="px-4">
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
              {topItems.map((item: any, i: number) => (
                <div key={item.item_id || i} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-gray-50" : ""}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? "bg-amber-100 text-amber-700" :
                    i === 1 ? "bg-gray-100 text-gray-600" :
                    i === 2 ? "bg-orange-100 text-orange-700" :
                    "bg-gray-50 text-gray-400"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
                    <div className="text-xs text-gray-400">{item.category_name} · {Math.round(Number(item.qty))} шт.</div>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 shrink-0">
                    {fmtFull(Number(item.revenue))} ₴
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Week trend chart ── */}
      {weekChart.length > 1 && (
        <>
          <Section title="📈 Виручка за тиждень" />
          <div className="px-4">
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weekChart} barCategoryGap="30%">
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded-lg shadow-lg">
                          <div className="font-semibold">{fmtFull(d.revenue)} ₴</div>
                          <div className="text-gray-400">{d.date}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                    {weekChart.map((entry, i) => (
                      <Cell key={i} fill={entry.isToday ? "#1f2937" : "#e5e7eb"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-3 mt-2 justify-center">
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <span className="w-3 h-3 bg-gray-800 rounded-sm inline-block" /> Сьогодні
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <span className="w-3 h-3 bg-gray-200 rounded-sm inline-block" /> Минулі дні
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Rooms ── */}
      {(occupancy !== null || arrivals > 0 || departures > 0) && (
        <>
          <Section title="🏨 Номери — сьогодні" />
          <div className="grid grid-cols-3 gap-3 px-4">
            {occupancy !== null && (
              <KpiCard label="Заповненість" value={`${occupancy}%`}
                icon={<BedDouble className="w-4 h-4" />} accent="bg-white" />
            )}
            <KpiCard label="Заїзди" value={String(arrivals)}
              icon={<ArrowDownToLine className="w-4 h-4" />} accent="bg-white" />
            <KpiCard label="Виїзди" value={String(departures)}
              icon={<ArrowUpFromLine className="w-4 h-4" />} accent="bg-white" />
          </div>
        </>
      )}

      {/* ── Footer ── */}
      <div className="px-4 pt-8 pb-4 text-center">
        <p className="text-xs text-gray-300">
          Maison HD Boss · оновлюється кожні 2 хв
        </p>
        {user && (
          <p className="text-xs text-gray-300 mt-0.5">{user.email}</p>
        )}
      </div>
    </div>
  );
}
