import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Search } from "lucide-react";

const API = "/api/fb";
async function apiFetch(path: string) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
  return r.json();
}

const fmt = (n: number) => new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
function today() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().split("T")[0]; }

const PRESETS = [
  { label: "7 днів", from: () => daysAgo(6), to: () => today() },
  { label: "30 днів", from: () => daysAgo(29), to: () => today() },
  { label: "90 днів", from: () => daysAgo(89), to: () => today() },
];

const CLASS_STYLE: Record<string, { bg: string; text: string; label: string; desc: string }> = {
  A: { bg: "bg-emerald-100 text-emerald-700", text: "text-emerald-700", label: "A", desc: "Топ продажі — до 70% виторгу" },
  B: { bg: "bg-amber-100 text-amber-700", text: "text-amber-700", label: "B", desc: "Середні — 70–90% виторгу" },
  C: { bg: "bg-red-100 text-red-600", text: "text-red-600", label: "C", desc: "Слабкі — решта 10%" },
};

export default function FbReportAbc() {
  const [preset, setPreset] = useState(1);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["fb-analytics-abc", from, to],
    queryFn: () => apiFetch(`/analytics/abc?from=${from}&to=${to}`),
  });

  function applyPreset(i: number) {
    setPreset(i); setFrom(PRESETS[i].from()); setTo(PRESETS[i].to());
  }

  const items: any[] = data?.items || [];
  const allCats = [...new Set(items.map((i: any) => i.category_name))].sort();

  const filtered = items.filter((i: any) =>
    (!search || i.name.toLowerCase().includes(search.toLowerCase())) &&
    (classFilter === "all" || i.class === classFilter) &&
    (categoryFilter === "all" || i.category_name === categoryFilter)
  );

  const counts = { A: items.filter(i => i.class === "A").length, B: items.filter(i => i.class === "B").length, C: items.filter(i => i.class === "C").length };

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold">АВС-аналіз</h1>
          <p className="text-sm text-muted-foreground">Ранжування страв за внеском у виторг</p>
        </div>

        {/* ABC Legend */}
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(CLASS_STYLE).map(([cls, s]) => (
            <div key={cls} className={`rounded-xl border p-4 cursor-pointer transition-all ${classFilter === cls ? "ring-2 ring-primary" : ""}`}
              onClick={() => setClassFilter(classFilter === cls ? "all" : cls)}>
              <div className="flex items-start justify-between mb-1">
                <span className={`text-2xl font-black ${s.text}`}>{cls}</span>
                <span className="text-lg font-bold text-foreground">{counts[cls as keyof typeof counts]}</span>
              </div>
              <div className="text-xs text-muted-foreground">{s.desc}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-card border rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg border overflow-hidden text-xs">
            {PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => applyPreset(i)}
                className={`px-3 py-1.5 transition-colors ${preset === i ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); }}
            className="border rounded px-2 py-1.5 bg-background text-xs" />
          <span className="text-muted-foreground text-xs">—</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); }}
            className="border rounded px-2 py-1.5 bg-background text-xs" />

          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="border rounded px-2 py-1.5 bg-background text-xs">
            <option value="all">Всі категорії</option>
            {allCats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="flex items-center gap-1.5 border rounded px-2 py-1.5 bg-background text-xs ml-auto">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none w-32" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs w-10">#</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Страва</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Категорія</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">К-сть</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">К-сть %</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Виторг ₴</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Виторг %</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Клас</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Завантаження...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Немає даних за цей період</td></tr>
                ) : (
                  filtered.map((item: any) => {
                    const s = CLASS_STYLE[item.class] || CLASS_STYLE.C;
                    return (
                      <tr key={item.item_id || item.name} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.rank}</td>
                        <td className="px-4 py-2.5 font-medium">{item.name}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.category_name}</td>
                        <td className="px-4 py-2.5 text-right">{item.qty.toFixed(0)} шт.</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">{item.qty_pct.toFixed(2)}%</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{fmt(item.revenue)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-xs text-muted-foreground">{item.revenue_pct.toFixed(2)}%</span>
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${item.class === "A" ? "bg-emerald-500" : item.class === "B" ? "bg-amber-500" : "bg-red-400"}`}
                                style={{ width: `${Math.min(item.revenue_pct * 5, 100)}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold text-xs ${s.bg}`}>
                            {item.class}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
