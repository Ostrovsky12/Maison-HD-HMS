import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { TrendingUp, ShoppingBag, Users, Receipt, CreditCard, Banknote, QrCode, ArrowUpRight } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── API ──────────────────────────────────────────────────────────────────────
const API = "/api/fb";
async function apiFetch(path: string) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
  return r.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Готівка", card: "Картка", qr: "QR / Онлайн", invoice: "Рахунок", mixed: "Змішана",
};
const PAYMENT_COLORS: Record<string, string> = {
  cash: "bg-emerald-500", card: "bg-blue-500", qr: "bg-violet-500", invoice: "bg-amber-500", mixed: "bg-slate-400",
};

function today() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().split("T")[0]; }

const PRESETS = [
  { label: "Сьогодні", from: () => today(), to: () => today() },
  { label: "7 днів", from: () => daysAgo(6), to: () => today() },
  { label: "30 днів", from: () => daysAgo(29), to: () => today() },
  { label: "Цей місяць", from: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0], to: () => today() },
];

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-card border rounded-xl p-4 flex gap-3 items-start">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4.5 h-4.5 text-white w-[18px] h-[18px]" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        <div className="text-xl font-bold tracking-tight">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border rounded-lg px-3 py-2 text-xs shadow-lg">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex gap-2 justify-between">
          <span className="text-muted-foreground">{p.name === "revenue" ? "Виторг" : "Чеки"}</span>
          <span className="font-semibold">{p.name === "revenue" ? `${fmt(p.value)} ₴` : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FbReportSales() {
  const [preset, setPreset] = useState(2);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());

  const { data, isLoading } = useQuery({
    queryKey: ["fb-analytics-overview", from, to],
    queryFn: () => apiFetch(`/analytics/overview?from=${from}&to=${to}`),
  });

  function applyPreset(i: number) {
    setPreset(i);
    setFrom(PRESETS[i].from());
    setTo(PRESETS[i].to());
  }

  const kpi = data?.kpi || {};
  const chart = data?.chart || [];
  const payments = data?.by_payment || [];
  const maxPayment = Math.max(...payments.map((p: any) => Number(p.amount)), 1);

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Статистика продажів</h1>
            <p className="text-sm text-muted-foreground">Виторг, чеки та методи оплати</p>
          </div>
          {/* Date controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden text-xs">
              {PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(i)}
                  className={`px-3 py-1.5 transition-colors ${preset === i ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 text-xs">
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); }}
                className="border rounded px-2 py-1.5 bg-background text-xs" />
              <span className="text-muted-foreground">—</span>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); }}
                className="border rounded px-2 py-1.5 bg-background text-xs" />
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard icon={TrendingUp} label="Виторг" value={`${fmt(kpi.revenue || 0)} ₴`} color="bg-primary" />
          <KpiCard icon={Receipt} label="Чеки" value={String(kpi.checks || 0)} color="bg-blue-500" />
          <KpiCard icon={ShoppingBag} label="Середній чек" value={`${fmt(kpi.avg_check || 0)} ₴`} color="bg-violet-500" />
          <KpiCard icon={Users} label="Гостей" value={String(kpi.guests || 0)} color="bg-emerald-500" />
          <KpiCard icon={ArrowUpRight} label="Чайові" value={`${fmt(kpi.tips || 0)} ₴`} sub={`Знижки: ${fmt(kpi.discounts || 0)} ₴`} color="bg-amber-500" />
        </div>

        {/* Chart */}
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Динаміка виторгу</h2>
            <span className="text-xs text-muted-foreground">{chart.length} днів</span>
          </div>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Завантаження...</div>
          ) : chart.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Немає даних за цей період</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revGrad)" name="revenue" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Payment methods */}
        <div className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold mb-4">Методи оплати</h2>
          {payments.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Немає даних</div>
          ) : (
            <div className="space-y-3">
              {payments.map((p: any) => {
                const pct = Math.round(Number(p.amount) / maxPayment * 100);
                return (
                  <div key={p.method}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium">{PAYMENT_LABELS[p.method] || p.method}</span>
                      <div className="flex gap-3 text-right">
                        <span className="text-muted-foreground text-xs">{p.cnt} чеків</span>
                        <span className="font-semibold w-28 text-right">{fmt(Number(p.amount))} ₴</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${PAYMENT_COLORS[p.method] || "bg-slate-400"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
