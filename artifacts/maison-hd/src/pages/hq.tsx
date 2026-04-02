import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar,
} from "recharts";
import {
  TrendingUp, Hotel, CreditCard, Activity,
  AlertTriangle, Users, Building2, Star, Calendar,
  RefreshCw, ArrowUp, ArrowDown, Minus, Brain, Zap,
  Banknote, ShieldAlert, BarChart3, Globe,
  CheckCircle2, XCircle, Target,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const API  = `${BASE}/api`;

function apiFetch(path: string) {
  const token = localStorage.getItem("hms_token");
  return fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
}

const fmt    = (n: any) => Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtK   = (n: any) => { const v = Number(n || 0); return v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}М` : v >= 1_000 ? `${(v/1_000).toFixed(0)}К` : `${Math.round(v)}`; };

const UNIT_COLORS: Record<string, string> = {
  accommodation: "#4F46E5", spa: "#0EA5E9", restaurant: "#F97316",
  events: "#EC4899", rental: "#10B981", other: "#8B5CF6",
};

const SOURCE_ICONS: Record<string, string> = {
  airbnb: "🏠", booking: "🌐", direct: "🎯", walk_in: "🚶", expedia: "✈️", other: "📋",
};

const SEVERITY_CFG: Record<string, { cls: string; Icon: any }> = {
  high:   { cls: "bg-red-50 border-red-200 text-red-700",      Icon: ShieldAlert },
  medium: { cls: "bg-yellow-50 border-yellow-200 text-yellow-700", Icon: AlertTriangle },
  low:    { cls: "bg-blue-50 border-blue-200 text-blue-700",   Icon: Activity },
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Власник", manager: "Менеджер", reception: "Рецепція",
  housekeeping: "Покоївка", accountant: "Бухгалтер", super_admin: "Адмін",
};

// ─── Trend Badge ─────────────────────────────────────────────────────────────
function TrendBadge({ pct }: { pct: number }) {
  if (!pct) return <span className="flex items-center gap-0.5 text-gray-400 text-xs font-medium"><Minus className="w-3 h-3" />0%</span>;
  if (pct > 0) return <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-semibold"><ArrowUp className="w-3 h-3" />{pct}%</span>;
  return <span className="flex items-center gap-0.5 text-red-500 text-xs font-semibold"><ArrowDown className="w-3 h-3" />{Math.abs(pct)}%</span>;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const ACCENT: Record<string, string> = {
  indigo: "from-indigo-500/10 to-indigo-500/5 border-indigo-200",
  green:  "from-emerald-500/10 to-emerald-500/5 border-emerald-200",
  blue:   "from-blue-500/10 to-blue-500/5 border-blue-200",
  violet: "from-violet-500/10 to-violet-500/5 border-violet-200",
  teal:   "from-teal-500/10 to-teal-500/5 border-teal-200",
  orange: "from-orange-500/10 to-orange-500/5 border-orange-200",
  red:    "from-red-500/10 to-red-500/5 border-red-200",
  pink:   "from-pink-500/10 to-pink-500/5 border-pink-200",
};

function KpiCard({ label, value, sub, icon: Icon, color = "text-gray-800", trend, accent = "indigo" }: any) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${ACCENT[accent] || ACCENT.indigo}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
        {Icon && <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-white/70 shadow-sm ${color}`}><Icon className="w-4 h-4" /></div>}
      </div>
      <p className={`text-2xl font-bold font-space tracking-tight ${color}`}>{value}</p>
      <div className="flex items-center gap-2 mt-1.5">
        {sub && <p className="text-xs text-gray-400 flex-1">{sub}</p>}
        {trend !== undefined && <TrendBadge pct={trend} />}
      </div>
    </div>
  );
}

// ─── Health Ring ─────────────────────────────────────────────────────────────
function HealthRing({ score, headline }: { score: number; headline: string }) {
  const color = score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : "#EF4444";
  const data  = [{ value: score, fill: color }, { value: 100 - score, fill: "#F1F5F9" }];
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-16 h-16 shrink-0">
        <RadialBarChart width={64} height={64} cx={32} cy={32} innerRadius={22} outerRadius={32} data={data} startAngle={90} endAngle={-270}>
          <RadialBar dataKey="value" cornerRadius={4} background={false} />
        </RadialBarChart>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800 leading-snug">{headline}</p>
        <p className="text-xs text-gray-400 mt-0.5">Індекс здоров'я бізнесу</p>
      </div>
    </div>
  );
}

// ─── Unit Bar ─────────────────────────────────────────────────────────────────
function UnitBar({ label, value, total, color }: any) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="font-bold text-gray-900">{fmtK(value)} ₴</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <p className="text-xs text-gray-400 text-right">{Math.round(pct)}%</p>
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function ChTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-600 mb-1">{label}</p>
      {payload.map((p: any) => <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{fmt(p.value)} ₴</strong></p>)}
    </div>
  );
}

// ─── TABS CONFIG ─────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview",   label: "Огляд",       icon: BarChart3 },
  { id: "revenue",    label: "Виручка",      icon: TrendingUp },
  { id: "operations", label: "Операції",     icon: Hotel },
  { id: "pipeline",   label: "Пайплайн",     icon: Calendar },
  { id: "staff",      label: "Персонал",     icon: Users },
  { id: "forecast",   label: "Прогноз",      icon: Zap },
];

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function HqPage() {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoad]  = useState(true);
  const [tab, setTab]       = useState("overview");
  const [ts, setTs]         = useState(new Date());

  const load = useCallback(async () => {
    setLoad(true);
    try { setData(await apiFetch("/hq/owner-dashboard")); } catch {}
    setLoad(false);
    setTs(new Date());
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return (
    <AppLayout>
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
          <p className="text-gray-400 text-sm">Завантаження Owner Dashboard…</p>
        </div>
      </div>
    </AppLayout>
  );

  if (!data || data.error) return (
    <AppLayout>
      <div className="p-8 text-center text-gray-400">
        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p className="mb-4">Дані недоступні. Перевірте конфігурацію об'єктів.</p>
        <Button onClick={load}><RefreshCw className="w-4 h-4 mr-1" />Повторити</Button>
      </div>
    </AppLayout>
  );

  const { kpi, byUnit, balances, monthlyTrend, sources, pipeline, forecast, staff, properties, alerts, aiSummary, folio } = data;

  // chart data
  const unitSlices  = Object.entries(byUnit || {}).filter(([, v]: any) => v.revenue > 0).map(([k, v]: any) => ({ name: v.label, value: v.revenue, color: UNIT_COLORS[k] }));
  const totalUnitRev = unitSlices.reduce((s, d) => s + d.value, 0);

  const trend12     = (monthlyTrend || []).map((r: any) => ({ month: r.month?.slice(5) || r.month, revenue: r.revenue, bookings: r.bookings }));

  const pipeRows    = (pipeline || []).slice(0, 30).map((r: any) => ({
    date: typeof r.date === "string" ? r.date.slice(5, 10) : new Date(r.date).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
    revenue: r.revenue, arrivals: r.arrivals,
  }));

  const fcRows      = (forecast || []).map((r: any) => ({
    date: typeof r.date === "string" ? r.date.slice(5, 10) : new Date(r.date).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
    projected: r.projectedRev, occupancy: r.occupancyPct,
  }));

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                <Star className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 font-space">Owner Dashboard</h1>
              <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-semibold">HQ</span>
            </div>
            <p className="text-sm text-gray-400 pl-10">Єдина панель власника · MTD / YTD · Multi-property</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-400 hidden sm:block">
              {ts.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="text-xs">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Оновити
            </Button>
          </div>
        </div>

        {/* ── AI BANNER ──────────────────────────────────────────────────── */}
        {aiSummary && (
          <div className={`rounded-2xl border p-4 md:p-5 ${aiSummary.healthScore >= 80 ? "bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200" : aiSummary.healthScore >= 60 ? "bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200" : "bg-gradient-to-r from-red-50 to-rose-50 border-red-200"}`}>
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <HealthRing score={aiSummary.healthScore} headline={aiSummary.headline} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Аналіз бізнесу</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-1.5 mb-2">
                  {(aiSummary.bullets || []).map((b: string, i: number) => (
                    <p key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                      <span className="text-indigo-400 mt-px shrink-0">•</span>{b}
                    </p>
                  ))}
                </div>
                {(aiSummary.recommendations || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {aiSummary.recommendations.map((r: string, i: number) => (
                      <span key={i} className="text-xs bg-white/80 border border-gray-200 rounded-full px-2.5 py-0.5 text-gray-700 shadow-sm">{r}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ALERTS ─────────────────────────────────────────────────────── */}
        {(alerts || []).length > 0 && (
          <div className="space-y-2">
            {(alerts as any[]).map((a: any, i: number) => {
              const cfg = SEVERITY_CFG[a.severity] || SEVERITY_CFG.low;
              const Icon = cfg.Icon;
              return (
                <div key={i} className={`flex items-center gap-3 border rounded-xl px-4 py-2.5 text-sm ${cfg.cls}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <p className="flex-1">{a.message}</p>
                  <span className="text-xs font-medium bg-white/60 px-2 py-0.5 rounded-full capitalize">{a.severity}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TAB NAV ─────────────────────────────────────────────────────── */}
        <div className="border-b border-gray-200 overflow-x-auto">
          <nav className="flex gap-0 min-w-max">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${active ? "border-[--mhd-primary] text-[--mhd-primary]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                  <Icon className="w-4 h-4" />{t.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: OVERVIEW                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <div className="space-y-5">

            {/* KPI Grid — 8 cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Виручка MTD" value={`${fmtK(kpi?.totalRevenueMTD)} ₴`} sub={`Минулий міс: ${fmtK(kpi?.revenueLM)} ₴`} icon={TrendingUp} color="text-indigo-600" trend={kpi?.mtdPct} accent="indigo" />
              <KpiCard label="Виручка YTD" value={`${fmtK(kpi?.revenueYTD)} ₴`} sub={`Торік: ${fmtK(kpi?.revenueLY)} ₴`} icon={BarChart3} color="text-emerald-600" trend={kpi?.ytdPct} accent="green" />
              <KpiCard label="Завантаженість" value={`${kpi?.occupancy || 0}%`} sub={`${kpi?.occupiedUnits || 0} / ${kpi?.totalUnits || 0} юнітів`} icon={Hotel} color="text-blue-600" accent="blue" />
              <KpiCard label="ADR" value={`${fmt(kpi?.adr)} ₴`} sub={`RevPAR: ${fmt(kpi?.revpar)} ₴`} icon={Banknote} color="text-violet-600" accent="violet" />
              <KpiCard label="Прибуття сьогодні" value={kpi?.arrivalsToday || 0} sub="підтверджених" icon={Calendar} color="text-teal-600" accent="teal" />
              <KpiCard label="Від'їзди сьогодні" value={kpi?.departuresToday || 0} sub="заплановано" icon={Activity} color="text-orange-600" accent="orange" />
              <KpiCard label="Несплачено" value={`${fmtK(balances?.unpaid)} ₴`} sub={`${balances?.unpaidCount || 0} бронювань`} icon={CreditCard} color="text-red-500" accent="red" />
              <KpiCard label="Середній чек" value={`${fmt(kpi?.avgCheck)} ₴`} sub="за бронювання" icon={Target} color="text-pink-600" accent="pink" />
            </div>

            {/* Revenue by Unit + 12M Trend */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Unit Donut + Bars */}
              <Card className="border-gray-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-400" />Виручка по підрозділах</CardTitle>
                  <p className="text-xs text-gray-400">MTD — поточний місяць</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {unitSlices.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={130}>
                        <PieChart>
                          <Pie data={unitSlices} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={2} dataKey="value">
                            {unitSlices.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => [`${fmt(v)} ₴`]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-3">
                        {Object.entries(byUnit || {}).filter(([, v]: any) => v.revenue > 0).map(([k, v]: any) => (
                          <UnitBar key={k} label={v.label} value={v.revenue} total={totalUnitRev} color={UNIT_COLORS[k] || "#8B5CF6"} />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-40 flex items-center justify-center text-gray-300 flex-col gap-2">
                      <Building2 className="w-8 h-8 opacity-30" />
                      <p className="text-sm">Немає даних MTD</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 12M Trend */}
              <Card className="lg:col-span-2 border-gray-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-400" />Тренд виручки — 12 місяців</CardTitle>
                </CardHeader>
                <CardContent>
                  {trend12.length > 0 ? (
                    <ResponsiveContainer width="100%" height={230}>
                      <AreaChart data={trend12} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#4F46E5" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtK} />
                        <Tooltip content={<ChTip />} />
                        <Area type="monotone" dataKey="revenue" name="Виручка" stroke="#4F46E5" strokeWidth={2} fill="url(#g1)" dot={false} activeDot={{ r: 4, fill: "#4F46E5" }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-56 flex items-center justify-center text-gray-300 flex-col gap-2">
                      <TrendingUp className="w-8 h-8 opacity-30" />
                      <p className="text-sm">Немає даних для тренду</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Property Comparison */}
            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-400" />Порівняння об'єктів</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="border-b text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left py-2 px-3 font-medium">Об'єкт</th>
                        <th className="text-right py-2 px-3 font-medium">Юніти</th>
                        <th className="text-right py-2 px-3 font-medium">Зайнято</th>
                        <th className="text-right py-2 px-3 font-medium">Завантаж.</th>
                        <th className="text-right py-2 px-3 font-medium">ADR</th>
                        <th className="text-right py-2 px-3 font-medium">RevPAR</th>
                        <th className="text-right py-2 px-3 font-medium">MTD ₴</th>
                        <th className="text-right py-2 px-3 font-medium">YTD ₴</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(properties || []).map((p: any) => (
                        <tr key={p.id} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-gray-800">{p.name}</td>
                          <td className="py-2.5 px-3 text-right text-gray-500">{p.totalUnits}</td>
                          <td className="py-2.5 px-3 text-right text-gray-500">{p.inHouse}</td>
                          <td className="py-2.5 px-3 text-right">
                            <span className={`font-bold ${p.occupancy > 60 ? "text-emerald-600" : p.occupancy > 30 ? "text-amber-600" : "text-red-400"}`}>{p.occupancy}%</span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-gray-600">{fmt(p.adr)} ₴</td>
                          <td className="py-2.5 px-3 text-right text-gray-600">{fmt(p.revpar)} ₴</td>
                          <td className="py-2.5 px-3 text-right font-bold text-indigo-600">{fmtK(p.revMTD)} ₴</td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-600">{fmtK(p.revYTD)} ₴</td>
                        </tr>
                      ))}
                      {(!properties || properties.length === 0) && (
                        <tr><td colSpan={8} className="py-8 text-center text-gray-300">Немає даних по об'єктах</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: REVENUE                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "revenue" && (
          <div className="space-y-5">

            {/* MTD / YTD Hero */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border bg-gradient-to-br from-indigo-50 via-white to-purple-50 border-indigo-200 p-6">
                <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-1">Month to Date</p>
                <p className="text-4xl font-black text-indigo-700 font-space tracking-tight">{fmt(kpi?.totalRevenueMTD)} ₴</p>
                <div className="flex items-center gap-3 mt-2">
                  <TrendBadge pct={kpi?.mtdPct} />
                  <span className="text-xs text-gray-400">vs минулого місяця ({fmt(kpi?.revenueLM)} ₴)</span>
                </div>
                <div className="mt-4 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                  <div className="h-1.5 bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.min(100, kpi?.totalRevenueMTD / Math.max(kpi?.revenueLM || 1, 1) * 100)}%` }} />
                </div>
              </div>
              <div className="rounded-2xl border bg-gradient-to-br from-emerald-50 via-white to-teal-50 border-emerald-200 p-6">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-1">Year to Date</p>
                <p className="text-4xl font-black text-emerald-700 font-space tracking-tight">{fmt(kpi?.revenueYTD)} ₴</p>
                <div className="flex items-center gap-3 mt-2">
                  <TrendBadge pct={kpi?.ytdPct} />
                  <span className="text-xs text-gray-400">vs минулого року ({fmt(kpi?.revenueLY)} ₴)</span>
                </div>
                <div className="mt-4 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                  <div className="h-1.5 bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, kpi?.revenueYTD / Math.max(kpi?.revenueLY || 1, 1) * 100)}%` }} />
                </div>
              </div>
            </div>

            {/* Revenue by Business Unit Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {Object.entries(byUnit || {}).map(([key, v]: [string, any]) => (
                <div key={key} className="rounded-2xl border bg-white p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: UNIT_COLORS[key] || "#8B5CF6" }} />
                    <p className="text-xs font-semibold text-gray-600 truncate">{v.label}</p>
                  </div>
                  <p className="text-xl font-bold font-space" style={{ color: UNIT_COLORS[key] || "#8B5CF6" }}>{fmtK(v.revenue)} ₴</p>
                  <p className="text-xs text-gray-400 mt-0.5">MTD · {v.share}% від заг.</p>
                  {v.ytd > 0 && <p className="text-xs text-gray-300 mt-0.5">YTD: {fmtK(v.ytd)} ₴</p>}
                  <div className="mt-2.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-1.5 rounded-full" style={{ width: `${v.share}%`, backgroundColor: UNIT_COLORS[key] || "#8B5CF6" }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Source Performance */}
            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4 text-indigo-400" />Канали продажів</CardTitle>
                <p className="text-xs text-gray-400">Останні 6 місяців</p>
              </CardHeader>
              <CardContent>
                {(sources || []).length === 0 ? (
                  <p className="text-center py-8 text-gray-300 text-sm">Немає даних</p>
                ) : (
                  <div className="space-y-3">
                    {(sources as any[]).map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center text-lg shadow-sm shrink-0">{SOURCE_ICONS[s.source] || "📋"}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <p className="text-sm font-semibold text-gray-800">{s.label}</p>
                            <span className="text-xs bg-indigo-100 text-indigo-600 rounded-full px-1.5 font-medium">{s.share}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-1.5 bg-indigo-500 rounded-full" style={{ width: `${s.share}%` }} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-gray-900">{fmtK(s.revenue)} ₴</p>
                          <p className="text-xs text-gray-400">{s.bookings} брон.</p>
                          <p className="text-xs text-gray-300">Ср. {fmt(s.avgValue)} ₴</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Folio Breakdown */}
            {(folio || []).length > 0 && (
              <Card className="border-gray-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-400" />Категорії доходів (Folio MTD)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2.5">
                    {(folio as any[]).map((f: any, i: number) => {
                      const maxV = Math.max(...folio.map((x: any) => x.total));
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <p className="text-xs text-gray-500 w-36 shrink-0 truncate">{f.category || "Без категорії"}</p>
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${maxV > 0 ? (f.total / maxV) * 100 : 0}%` }} />
                          </div>
                          <p className="text-xs font-bold text-gray-700 w-24 text-right shrink-0">{fmt(f.total)} ₴</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: OPERATIONS                                                    */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "operations" && (
          <div className="space-y-5">

            {/* Accommodation Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-2xl border bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200 p-5">
                <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-1">Завантаженість</p>
                <div className="flex items-end gap-1">
                  <p className="text-4xl font-black text-indigo-700 font-space">{kpi?.occupancy || 0}</p>
                  <p className="text-xl text-indigo-500 mb-1">%</p>
                </div>
                <p className="text-xs text-gray-400 mt-1">{kpi?.occupiedUnits} з {kpi?.totalUnits} юнітів</p>
                <div className="mt-3 h-2 bg-indigo-100 rounded-full overflow-hidden">
                  <div className="h-2 bg-indigo-500 rounded-full transition-all" style={{ width: `${kpi?.occupancy || 0}%` }} />
                </div>
              </div>

              <div className="rounded-2xl border bg-gradient-to-br from-violet-50 to-purple-50 border-violet-200 p-5">
                <p className="text-xs font-semibold text-violet-500 uppercase tracking-wider mb-1">ADR</p>
                <p className="text-4xl font-black text-violet-700 font-space">{fmt(kpi?.adr)}</p>
                <p className="text-xs text-gray-400 mt-1.5">₴ · Середня добова ставка</p>
              </div>

              <div className="rounded-2xl border bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-200 p-5">
                <p className="text-xs font-semibold text-teal-500 uppercase tracking-wider mb-1">RevPAR</p>
                <p className="text-4xl font-black text-teal-700 font-space">{fmt(kpi?.revpar)}</p>
                <p className="text-xs text-gray-400 mt-1.5">₴ · Виручка на юніт</p>
              </div>

              <div className="rounded-2xl border bg-gradient-to-br from-pink-50 to-rose-50 border-pink-200 p-5">
                <p className="text-xs font-semibold text-pink-500 uppercase tracking-wider mb-1">Середній чек</p>
                <p className="text-4xl font-black text-pink-700 font-space">{fmt(kpi?.avgCheck)}</p>
                <p className="text-xs text-gray-400 mt-1.5">₴ · За бронювання</p>
              </div>
            </div>

            {/* Balances */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-gray-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><CreditCard className="w-4 h-4 text-indigo-400" />Платіжний баланс</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
                      <p className="text-xl font-bold text-emerald-700 font-space">{fmtK(balances?.paid)} ₴</p>
                      <p className="text-xs text-gray-400 mt-0.5">Оплачено</p>
                    </div>
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-center">
                      <XCircle className="w-5 h-5 text-red-400 mx-auto mb-1.5" />
                      <p className="text-xl font-bold text-red-600 font-space">{fmtK(balances?.unpaid)} ₴</p>
                      <p className="text-xs text-gray-400 mt-0.5">{balances?.unpaidCount || 0} неоплачених</p>
                    </div>
                  </div>
                  {(balances?.overdue || 0) > 0 && (
                    <div className="flex items-center gap-2.5 rounded-xl bg-orange-50 border border-orange-200 p-3">
                      <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-orange-700">Прострочено: {fmtK(balances.overdue)} ₴</p>
                        <p className="text-xs text-gray-400">Виїзд відбувся — борг не погашено</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Оплачено</span><span>Несплачено</span></div>
                    <div className="h-3 bg-red-200 rounded-full overflow-hidden">
                      <div className="h-3 bg-emerald-500 rounded-full" style={{ width: `${((balances?.paid || 0) / Math.max((balances?.paid || 0) + (balances?.unpaid || 0), 1)) * 100}%` }} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-gray-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4 text-red-400" />Топ дебітори</CardTitle>
                </CardHeader>
                <CardContent>
                  {(balances?.topDebtors || []).length === 0 ? (
                    <div className="text-center py-8 text-gray-300">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-300" />
                      <p className="text-sm">Всі баланси чисті</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(balances.topDebtors as any[]).slice(0, 7).map((d: any, i: number) => (
                        <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50">
                          <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-500 shrink-0">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{d.guest_name || "Гість"}</p>
                            <p className="text-xs text-gray-400 font-mono">{d.booking_ref}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-red-500 text-sm">{fmt(d.owed)} ₴</p>
                            {d.check_out && <p className="text-xs text-gray-300">{new Date(d.check_out).toLocaleDateString("uk-UA")}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: PIPELINE                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "pipeline" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Резервації — наступні 90 днів</h2>
                <p className="text-xs text-gray-400">{pipeRows.length} дат з підтвердженими прибуттями</p>
              </div>
              <div className="flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-500 rounded-sm inline-block" />Виручка ₴</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-sky-400 rounded-sm inline-block" />Прибуття</span>
              </div>
            </div>

            {pipeRows.length > 0 ? (
              <>
                <Card className="border-gray-200">
                  <CardContent className="pt-5">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={pipeRows} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} interval={2} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtK} />
                        <Tooltip content={<ChTip />} />
                        <Bar dataKey="revenue" name="Виручка" fill="#4F46E5" radius={[3, 3, 0, 0]} maxBarSize={18} />
                        <Bar dataKey="arrivals" name="Прибуття" fill="#38BDF8" radius={[3, 3, 0, 0]} maxBarSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="border-gray-200">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Деталі пайплайну</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[360px]">
                        <thead>
                          <tr className="border-b text-xs text-gray-400 uppercase tracking-wide">
                            <th className="text-left py-2 px-3 font-medium">Дата</th>
                            <th className="text-right py-2 px-3 font-medium">Прибуття</th>
                            <th className="text-right py-2 px-3 font-medium">Виручка ₴</th>
                            <th className="text-right py-2 px-3 font-medium">ADR ₴</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pipeRows.map((p: any, i: number) => (
                            <tr key={i} className="border-b hover:bg-gray-50">
                              <td className="py-2 px-3 font-medium text-gray-700">{p.date}</td>
                              <td className="py-2 px-3 text-right text-gray-500">{p.arrivals}</td>
                              <td className="py-2 px-3 text-right font-bold text-indigo-600">{fmt(p.revenue)}</td>
                              <td className="py-2 px-3 text-right text-gray-400">{fmt(p.revenue / Math.max(p.arrivals, 1))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-center py-20 text-gray-300">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Немає підтверджених бронювань на наступні 90 днів</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: STAFF                                                         */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "staff" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Ефективність персоналу</h2>
              <p className="text-xs text-gray-400">MTD · бронювання, виручка, HK-задачі</p>
            </div>

            {(staff || []).length === 0 ? (
              <div className="text-center py-20 text-gray-300">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Немає даних по персоналу за MTD</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {(staff as any[]).map((s: any, i: number) => {
                    const maxRev = Math.max(...staff.map((x: any) => x.revenue), 1);
                    return (
                      <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border border-gray-200 bg-white hover:shadow-sm transition-shadow">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
                          {(s.name || "?")[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                            <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{ROLE_LABELS[s.role] || s.role}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-1.5 bg-indigo-500 rounded-full transition-all" style={{ width: `${(s.revenue / maxRev) * 100}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-5 text-right shrink-0">
                          <div><p className="font-bold text-indigo-600 text-sm">{fmtK(s.revenue)} ₴</p><p className="text-xs text-gray-400">виручка</p></div>
                          <div><p className="font-semibold text-gray-700">{s.bookings}</p><p className="text-xs text-gray-400">броні</p></div>
                          {s.hkTasks > 0 && <div><p className="font-semibold text-teal-600">{s.hkTasks}</p><p className="text-xs text-gray-400">HK</p></div>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Card className="border-gray-200">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Виручка по персоналу MTD</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={staff.length * 36 + 20}>
                      <BarChart data={(staff as any[]).slice(0, 10)} layout="vertical" margin={{ top: 0, right: 10, left: 60, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                        <Tooltip formatter={(v: any) => [`${fmt(v)} ₴`, "Виручка"]} />
                        <Bar dataKey="revenue" name="Виручка" fill="#4F46E5" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: FORECAST                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "forecast" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Прогноз — наступні 30 днів</h2>
              <p className="text-xs text-gray-400">На основі підтверджених бронювань та середнього добового тарифу</p>
            </div>

            {fcRows.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border bg-indigo-50 border-indigo-200 p-4 text-center">
                    <p className="text-xs text-indigo-500 font-semibold uppercase tracking-wider mb-1">Прогноз 30д</p>
                    <p className="text-2xl font-black text-indigo-700 font-space">{fmtK(fcRows.reduce((s: number, d: any) => s + (d.projected || 0), 0))} ₴</p>
                  </div>
                  <div className="rounded-2xl border bg-teal-50 border-teal-200 p-4 text-center">
                    <p className="text-xs text-teal-500 font-semibold uppercase tracking-wider mb-1">Заїзди (брон.)</p>
                    <p className="text-2xl font-black text-teal-700 font-space">{fcRows.reduce((s: number, d: any) => s + (d.arrivals || 0), 0)}</p>
                  </div>
                  <div className="rounded-2xl border bg-violet-50 border-violet-200 p-4 text-center">
                    <p className="text-xs text-violet-500 font-semibold uppercase tracking-wider mb-1">Ср. завантаж.</p>
                    <p className="text-2xl font-black text-violet-700 font-space">
                      {Math.round(fcRows.reduce((s: number, d: any) => s + (d.occupancy || 0), 0) / Math.max(fcRows.length, 1))}%
                    </p>
                  </div>
                </div>

                <Card className="border-gray-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" />Прогнозована виручка по днях</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={fcRows} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#4F46E5" stopOpacity={0.1} />
                            <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtK} />
                        <Tooltip content={<ChTip />} />
                        <Area type="monotone" dataKey="projected" name="Прогноз ₴" stroke="#4F46E5" strokeWidth={2} strokeDasharray="6 3" fill="url(#fg)" dot={false} activeDot={{ r: 4, fill: "#4F46E5" }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="border-gray-200">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[380px]">
                        <thead>
                          <tr className="border-b bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                            <th className="text-left py-2 px-4 font-medium">Дата</th>
                            <th className="text-right py-2 px-4 font-medium">Прибуття</th>
                            <th className="text-right py-2 px-4 font-medium">Прогноз ₴</th>
                            <th className="text-right py-2 px-4 font-medium">Завантаж.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fcRows.map((d: any, i: number) => (
                            <tr key={i} className="border-b hover:bg-gray-50">
                              <td className="py-2 px-4 font-medium text-gray-700">{d.date}</td>
                              <td className="py-2 px-4 text-right text-gray-500">{d.arrivals || 0}</td>
                              <td className="py-2 px-4 text-right font-bold text-indigo-600">{fmt(d.projected)}</td>
                              <td className="py-2 px-4 text-right font-medium">
                                <span className={d.occupancy > 60 ? "text-emerald-600" : d.occupancy > 30 ? "text-amber-600" : "text-gray-400"}>
                                  {Math.round(d.occupancy)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-center py-20 text-gray-300">
                <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Немає підтверджених бронювань для прогнозу</p>
                <p className="text-xs mt-1">Прогноз будується на основі статусів confirmed/pending</p>
              </div>
            )}
          </div>
        )}

      </div>
    </AppLayout>
  );
}
