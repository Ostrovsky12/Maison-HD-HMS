import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingDown, TrendingUp, RefreshCw, Loader2, ChefHat,
  AlertTriangle, CheckCircle2, DollarSign, BarChart3,
  ArrowUpDown, ArrowUp, ArrowDown, Flame, Star,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = BASE.replace(/\/maison-hd$/, "") + "/api";
const tok  = () => localStorage.getItem("hms_token") || "";
const apiFetch = (p: string) =>
  fetch(API + p, { headers: { Authorization: `Bearer ${tok()}` } });

// ── Types ────────────────────────────────────────────────────────────────────
type Item = {
  item_id: number; name: string; category_name: string | null;
  selling_price: number; cost_price: number;
  food_cost_pct: number | null; margin_pct: number | null;
  qty_sold: number; revenue: number; theoretical_cost: number;
};
type CategoryRow = {
  category_name: string; item_count: number; qty_sold: number;
  revenue: number; theoretical_cost: number;
  food_cost_pct: number | null; avg_margin_pct: number | null;
};
type Totals = {
  total_revenue: number; total_theoretical_cost: number;
  overall_food_cost_pct: number | null; actual_waste_cost: number;
};

const PERIODS = [
  { label: "7 днів",  days: 7  },
  { label: "14 днів", days: 14 },
  { label: "30 днів", days: 30 },
  { label: "90 днів", days: 90 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | string | null | undefined) {
  return `₴${Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `${Number(n).toFixed(1)}%`;
}

function foodCostColor(pct: number | null | undefined): { bg: string; text: string; label: string } {
  if (pct === null || pct === undefined) return { bg: "bg-white/5",            text: "text-white/30",   label: "—"         };
  if (pct <= 25)  return { bg: "bg-emerald-500/15", text: "text-emerald-300", label: "Відмінно" };
  if (pct <= 35)  return { bg: "bg-green-500/10",   text: "text-green-300",   label: "Добре"    };
  if (pct <= 45)  return { bg: "bg-amber-500/15",   text: "text-amber-300",   label: "Норма"    };
  return             { bg: "bg-red-500/15",      text: "text-red-300",     label: "Висока"   };
}

// ABC classification by revenue contribution
function abcClass(item: Item, allItems: Item[]): "A" | "B" | "C" {
  const sorted = [...allItems].sort((a, b) => b.revenue - a.revenue);
  const total  = sorted.reduce((s, i) => s + i.revenue, 0);
  let cum = 0;
  for (const it of sorted) {
    cum += it.revenue;
    if (it.item_id === item.item_id) {
      const pct = total > 0 ? cum / total : 1;
      if (pct <= 0.7) return "A";
      if (pct <= 0.9) return "B";
      return "C";
    }
  }
  return "C";
}

type SortKey = "name" | "selling_price" | "cost_price" | "food_cost_pct" | "margin_pct" | "qty_sold" | "revenue";
type SortDir = "asc" | "desc";

// ── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, icon: Icon, colorClass }: {
  label: string; value: string; sub?: string; icon: any; colorClass: string;
}) {
  return (
    <Card className="bg-white/4 border-white/8">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/40 mb-1">{label}</p>
            <p className={`text-xl font-bold ${colorClass}`}>{value}</p>
            {sub && <p className="text-xs text-white/30 mt-0.5">{sub}</p>}
          </div>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colorClass.replace("text-", "bg-").replace("300", "500/15").replace("400", "500/15")}`}>
            <Icon className={`w-4 h-4 ${colorClass}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FbCostingPage() {
  const { toast } = useToast();
  const [days, setDays]           = useState(30);
  const [loading, setLoading]     = useState(false);
  const [items, setItems]         = useState<Item[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [totals, setTotals]       = useState<Totals | null>(null);
  const [sortKey, setSortKey]     = useState<SortKey>("revenue");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [filter, setFilter]       = useState<"all" | "high_cost" | "no_cost">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/fb/warehouse/costing-report?days=${days}`);
      const d = await r.json();
      if (!r.ok) { toast({ title: "Помилка", description: d.error, variant: "destructive" }); return; }
      setItems(d.items || []);
      setCategories(d.byCategory || []);
      setTotals(d.totals || null);
    } finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // ── Sorting ──────────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortedItems = [...items]
    .filter(i => {
      if (filter === "high_cost") return (i.food_cost_pct ?? 0) > 45;
      if (filter === "no_cost")   return !i.cost_price;
      return true;
    })
    .sort((a, b) => {
      const va = (a as any)[sortKey] ?? -Infinity;
      const vb = (b as any)[sortKey] ?? -Infinity;
      const cmp = typeof va === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });

  // ── Derived metrics ───────────────────────────────────────────────────────
  const avgMarginPct = items.length > 0
    ? items.filter(i => i.margin_pct !== null).reduce((s, i) => s + (i.margin_pct ?? 0), 0) /
      items.filter(i => i.margin_pct !== null).length
    : null;
  const highCostCount = items.filter(i => (i.food_cost_pct ?? 0) > 45).length;
  const noCostCount   = items.filter(i => !i.cost_price).length;

  // ── Chart data ────────────────────────────────────────────────────────────
  const catChartData = categories.map(c => ({
    name:         c.category_name,
    "FC %":       Number(c.food_cost_pct ?? 0),
    "Маржа %":    Number(c.avg_margin_pct ?? 0),
    Виторг:       Number(c.revenue),
  }));

  const pieData = categories.filter(c => c.revenue > 0).map(c => ({
    name:  c.category_name,
    value: Number(c.revenue),
  }));
  const PIE_COLORS = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#84cc16"];

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-indigo-300" /> : <ArrowDown className="w-3 h-3 text-indigo-300" />;
  };

  const ThHead = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th
      className={`px-3 py-2.5 text-left text-xs font-medium text-white/40 cursor-pointer hover:text-white/70 transition-colors whitespace-nowrap ${className}`}
      onClick={() => toggleSort(k)}
    >
      <div className="flex items-center gap-1">{children}<SortIcon k={k} /></div>
    </th>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="min-h-full bg-[#12141f] p-5 space-y-5">
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <ChefHat className="w-5 h-5 text-indigo-300" /> F&B Costing Report
            </h1>
            <p className="text-xs text-white/35 mt-0.5">Собівартість, маржинальність, харчові витрати</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Period selector */}
            <div className="flex rounded-xl overflow-hidden border border-white/8">
              {PERIODS.map(p => (
                <button
                  key={p.days}
                  onClick={() => setDays(p.days)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    days === p.days ? "bg-indigo-600 text-white" : "bg-white/4 text-white/40 hover:bg-white/8"
                  }`}
                >{p.label}</button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}
              className="border-white/10 text-white/60 hover:bg-white/5 h-8">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <SummaryCard
            label="Виторг F&B" icon={DollarSign}
            value={fmt(totals?.total_revenue)}
            colorClass="text-indigo-300"
          />
          <SummaryCard
            label="Теор. собівартість" icon={TrendingDown}
            value={fmt(totals?.total_theoretical_cost)}
            sub={totals?.total_revenue ? `${fmtPct(totals.overall_food_cost_pct)} від виторгу` : undefined}
            colorClass={foodCostColor(totals?.overall_food_cost_pct).text}
          />
          <SummaryCard
            label="Food Cost %" icon={BarChart3}
            value={fmtPct(totals?.overall_food_cost_pct)}
            sub="теоретичний"
            colorClass={foodCostColor(totals?.overall_food_cost_pct).text}
          />
          <SummaryCard
            label="Середня маржа" icon={TrendingUp}
            value={fmtPct(avgMarginPct)}
            sub={`${items.filter(i => i.margin_pct !== null).length} позицій з ціною собів.`}
            colorClass="text-emerald-300"
          />
          <SummaryCard
            label="Витрати на списання" icon={Flame}
            value={fmt(totals?.actual_waste_cost)}
            sub="фактичні"
            colorClass="text-amber-300"
          />
        </div>

        {/* ── Alerts ── */}
        {(highCostCount > 0 || noCostCount > 0) && (
          <div className="flex flex-wrap gap-2">
            {highCostCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {highCostCount} позицій з food cost &gt;45%
              </div>
            )}
            {noCostCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {noCostCount} позицій без собівартості
              </div>
            )}
          </div>
        )}

        {/* ── Tabs ── */}
        <Tabs defaultValue="items" className="space-y-4">
          <TabsList className="bg-white/5 border border-white/8">
            <TabsTrigger value="items" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              Позиції меню ({items.length})
            </TabsTrigger>
            <TabsTrigger value="categories" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              Категорії
            </TabsTrigger>
            <TabsTrigger value="charts" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              Графіки
            </TabsTrigger>
          </TabsList>

          {/* ── Items Tab ── */}
          <TabsContent value="items">
            {/* Filter bar */}
            <div className="flex gap-2 mb-3">
              {[
                { key: "all",       label: `Всі (${items.length})` },
                { key: "high_cost", label: `Висока FC% (${highCostCount})` },
                { key: "no_cost",   label: `Без собів. (${noCostCount})` },
              ].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filter === f.key ? "bg-indigo-600 text-white" : "bg-white/5 text-white/40 hover:bg-white/8"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-white/8 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/4 border-b border-white/8">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-white/40 w-6">#</th>
                      <ThHead k="name">Страва</ThHead>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-white/40">Категорія</th>
                      <ThHead k="selling_price" className="text-right">Ціна продажу</ThHead>
                      <ThHead k="cost_price" className="text-right">Собівартість</ThHead>
                      <ThHead k="food_cost_pct" className="text-right">Food Cost %</ThHead>
                      <ThHead k="margin_pct" className="text-right">Маржа %</ThHead>
                      <ThHead k="qty_sold" className="text-right">Продано</ThHead>
                      <ThHead k="revenue" className="text-right">Виторг</ThHead>
                      <th className="px-3 py-2.5 text-center text-xs font-medium text-white/40">ABC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {loading ? (
                      <tr><td colSpan={10} className="py-12 text-center text-white/25 text-sm">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Завантаження...
                      </td></tr>
                    ) : sortedItems.length === 0 ? (
                      <tr><td colSpan={10} className="py-12 text-center text-white/25 text-sm">
                        Даних за вибраний період немає
                      </td></tr>
                    ) : sortedItems.map((item, idx) => {
                      const fcColor = foodCostColor(item.food_cost_pct);
                      const abc     = abcClass(item, items);
                      return (
                        <tr key={item.item_id} className="hover:bg-white/3 transition-colors">
                          <td className="px-3 py-2.5 text-white/20 text-xs">{idx + 1}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white/85">{item.name}</span>
                              {item.qty_sold > 20 && <Star className="w-3 h-3 text-amber-400 shrink-0" />}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs text-white/40">{item.category_name || "—"}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-white/70">{fmt(item.selling_price)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-white/60">
                            {item.cost_price ? fmt(item.cost_price) : <span className="text-white/20 text-xs">не вказано</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {item.food_cost_pct !== null ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${fcColor.bg} ${fcColor.text}`}>
                                {fmtPct(item.food_cost_pct)}
                              </span>
                            ) : <span className="text-white/20 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {item.margin_pct !== null ? (
                              <span className={`text-sm font-semibold ${Number(item.margin_pct) >= 50 ? "text-emerald-300" : Number(item.margin_pct) >= 30 ? "text-white/70" : "text-red-300"}`}>
                                {fmtPct(item.margin_pct)}
                              </span>
                            ) : <span className="text-white/20 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right text-white/60 font-mono">{item.qty_sold}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-indigo-300">{fmt(item.revenue)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-bold ${
                              abc === "A" ? "bg-emerald-500/20 text-emerald-300" :
                              abc === "B" ? "bg-indigo-500/20 text-indigo-300" :
                                            "bg-white/8 text-white/30"
                            }`}>{abc}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {sortedItems.length > 0 && (
                <div className="px-3 py-2 bg-white/3 border-t border-white/8 flex justify-between text-xs text-white/40">
                  <span>{sortedItems.length} позицій</span>
                  <span>
                    Теор. собів.: <span className="text-indigo-300 font-medium">{fmt(sortedItems.reduce((s, i) => s + i.theoretical_cost, 0))}</span>
                    {" · "}Виторг: <span className="text-indigo-300 font-medium">{fmt(sortedItems.reduce((s, i) => s + i.revenue, 0))}</span>
                  </span>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Categories Tab ── */}
          <TabsContent value="categories">
            <div className="rounded-xl border border-white/8 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white/4 border-b border-white/8">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-white/40">Категорія</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-white/40">Позицій</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-white/40">Продано</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-white/40">Виторг</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-white/40">Теор. собів.</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-white/40">Food Cost %</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-white/40">Ср. маржа %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr><td colSpan={7} className="py-8 text-center text-white/25 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    </td></tr>
                  ) : categories.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-white/25 text-sm">Немає даних</td></tr>
                  ) : categories.map((cat, i) => {
                    const fc = foodCostColor(cat.food_cost_pct);
                    return (
                      <tr key={i} className="hover:bg-white/3">
                        <td className="px-3 py-2.5 font-medium text-white/85">{cat.category_name}</td>
                        <td className="px-3 py-2.5 text-right text-white/50">{cat.item_count}</td>
                        <td className="px-3 py-2.5 text-right text-white/50">{cat.qty_sold}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-indigo-300">{fmt(cat.revenue)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-white/60">{fmt(cat.theoretical_cost)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {cat.food_cost_pct !== null
                            ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${fc.bg} ${fc.text}`}>{fmtPct(cat.food_cost_pct)}</span>
                            : <span className="text-white/20 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`text-sm font-semibold ${Number(cat.avg_margin_pct ?? 0) >= 50 ? "text-emerald-300" : Number(cat.avg_margin_pct ?? 0) >= 30 ? "text-white/60" : "text-red-300"}`}>
                            {fmtPct(cat.avg_margin_pct)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ── Charts Tab ── */}
          <TabsContent value="charts" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Food Cost % by category */}
              <Card className="bg-white/4 border-white/8">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-white/70">Food Cost % по категоріях</CardTitle>
                </CardHeader>
                <CardContent>
                  {catChartData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-white/25 text-sm">Немає даних</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={catChartData} margin={{ top: 4, right: 8, left: -20, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} angle={-25} textAnchor="end" />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} unit="%" />
                        <Tooltip contentStyle={{ background: "#1e2235", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                          formatter={(v: any) => [`${v}%`]} />
                        <Bar dataKey="FC %" radius={[4, 4, 0, 0]}>
                          {catChartData.map((_, i) => (
                            <Cell key={i} fill={
                              Number(catChartData[i]["FC %"]) <= 25 ? "#10b981" :
                              Number(catChartData[i]["FC %"]) <= 35 ? "#22c55e" :
                              Number(catChartData[i]["FC %"]) <= 45 ? "#f59e0b" : "#ef4444"
                            } />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Revenue by category pie */}
              <Card className="bg-white/4 border-white/8">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-white/70">Виторг по категоріях</CardTitle>
                </CardHeader>
                <CardContent>
                  {pieData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-white/25 text-sm">Немає продажів</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}>
                          {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "#1e2235", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                          formatter={(v: any) => [fmt(v)]} />
                        <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ABC Legend */}
            <Card className="bg-white/4 border-white/8">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">ABC-аналіз (за виторгом)</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { cls: "A", bg: "bg-emerald-500/15 border-emerald-500/20", text: "text-emerald-300", desc: "Топ 70% виторгу", hint: "Ключові позиції — не знижуйте якість" },
                    { cls: "B", bg: "bg-indigo-500/15 border-indigo-500/20",   text: "text-indigo-300",  desc: "70–90% виторгу",  hint: "Розвинути або переглянути ціну" },
                    { cls: "C", bg: "bg-white/5 border-white/10",              text: "text-white/40",    desc: "Нижні 10%",       hint: "Розглянути виключення з меню" },
                  ].map(r => (
                    <div key={r.cls} className={`p-3 rounded-xl border ${r.bg}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-lg font-black ${r.text}`}>{r.cls}</span>
                        <span className={`text-xs ${r.text}`}>{r.desc}</span>
                      </div>
                      <p className="text-xs text-white/35">{r.hint}</p>
                      <p className={`text-sm font-bold mt-1.5 ${r.text}`}>
                        {items.filter(i => abcClass(i, items) === r.cls).length} позицій
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
