import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart2, Loader2, TrendingDown, TrendingUp, Package2 } from "lucide-react";
import { subDays, format } from "date-fns";

const API = "/api/fb/warehouse";
async function apiFetch(path: string) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

const PRESETS = [
  { label: "7 днів", days: 7 },
  { label: "14 днів", days: 14 },
  { label: "30 днів", days: 30 },
  { label: "90 днів", days: 90 },
];

export default function FbMovementReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(subDays(new Date(), 7).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [applied, setApplied] = useState({ from: subDays(new Date(), 7).toISOString().slice(0, 10), to: today });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["movement-report", applied.from, applied.to],
    queryFn: () => apiFetch(`/movement-report?from=${applied.from}&to=${applied.to}`),
  });

  const rows: any[] = (data?.rows || [])
    .filter((r: any) => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (category !== "all" && r.category !== category) return false;
      return true;
    });

  const categories = Array.from(new Set((data?.rows || []).map((r: any) => r.category))).sort() as string[];

  const totals = rows.reduce((acc, r) => ({
    received: acc.received + r.received_amt,
    writeoff: acc.writeoff + r.writeoff_amt,
    closing: acc.closing + r.closing_amt,
  }), { received: 0, writeoff: 0, closing: 0 });

  function applyDays(days: number) {
    const f = subDays(new Date(), days).toISOString().slice(0, 10);
    setFrom(f);
    setTo(today);
    setApplied({ from: f, to: today });
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <BarChart2 className="w-6 h-6 text-indigo-600" />
              <div>
                <h1 className="text-lg font-bold">Звіт за рухом</h1>
                <p className="text-xs text-muted-foreground">
                  {data ? `${data.total} позицій · ${applied.from} — ${applied.to}` : "Рух запасів"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex gap-1">
              {PRESETS.map(p => (
                <button key={p.days} onClick={() => applyDays(p.days)}
                  className={`px-3 py-1.5 rounded-md text-xs border font-medium transition-colors ${
                    applied.from === subDays(new Date(), p.days).toISOString().slice(0, 10) && applied.to === today
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-input hover:bg-muted"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 w-36 text-sm" />
              <span className="text-muted-foreground">—</span>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 w-36 text-sm" />
              <Button size="sm" className="h-8" onClick={() => setApplied({ from, to })}>Застосувати</Button>
            </div>
            <Input placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-36 text-sm" />
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="h-8 border rounded-md px-2 text-sm bg-background">
              <option value="all">Всі категорії</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {data && (
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="border rounded-lg px-4 py-2.5 flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <div>
                  <div className="text-xs text-muted-foreground">Надходження</div>
                  <div className="font-bold text-green-700">{totals.received.toFixed(2)} ₴</div>
                </div>
              </div>
              <div className="border rounded-lg px-4 py-2.5 flex items-center gap-3">
                <TrendingDown className="w-5 h-5 text-red-600" />
                <div>
                  <div className="text-xs text-muted-foreground">Списання</div>
                  <div className="font-bold text-red-700">{totals.writeoff.toFixed(2)} ₴</div>
                </div>
              </div>
              <div className="border rounded-lg px-4 py-2.5 flex items-center gap-3">
                <Package2 className="w-5 h-5 text-indigo-600" />
                <div>
                  <div className="text-xs text-muted-foreground">Залишок на кінець</div>
                  <div className="font-bold text-indigo-700">{totals.closing.toFixed(2)} ₴</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <BarChart2 className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Рухів немає за вказаний період</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-3 py-2.5 font-medium">Назва</th>
                  <th className="text-left px-3 py-2.5 font-medium">Категорія</th>
                  <th className="text-right px-3 py-2.5 font-medium">Поч. залишок</th>
                  <th className="text-right px-3 py-2.5 font-medium">Поч. сума</th>
                  <th className="text-right px-3 py-2.5 font-medium text-green-700">Надходж.</th>
                  <th className="text-right px-3 py-2.5 font-medium text-red-600">Витрати</th>
                  <th className="text-right px-3 py-2.5 font-medium">Кін. залишок</th>
                  <th className="text-right px-3 py-2.5 font-medium">Кін. сума</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium max-w-[160px] truncate">{r.name}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[100px]">{r.category}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span className={r.opening_qty < 0 ? "text-red-600" : ""}>{r.opening_qty.toFixed(3)}</span>
                      <span className="text-muted-foreground ml-0.5">{r.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">{r.opening_amt.toFixed(2)} ₴</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.received_qty > 0 ? (
                        <span className="text-green-700">
                          {r.received_qty.toFixed(3)} {r.unit}
                          <span className="block text-[10px] text-green-600">{r.received_amt.toFixed(2)} ₴</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.writeoff_qty > 0 ? (
                        <span className="text-red-600">
                          {r.writeoff_qty.toFixed(3)} {r.unit}
                          <span className="block text-[10px] text-red-500">{r.writeoff_amt.toFixed(2)} ₴</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      <span className={r.closing_qty < 0 ? "text-red-600" : ""}>{r.closing_qty.toFixed(3)}</span>
                      <span className="text-muted-foreground ml-0.5">{r.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{r.closing_amt.toFixed(2)} ₴</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t font-semibold sticky bottom-0">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-xs">Разом ({rows.length} позицій)</td>
                  <td className="px-3 py-2 text-right text-green-700 font-mono text-xs">{totals.received.toFixed(2)} ₴</td>
                  <td className="px-3 py-2 text-right text-red-600 font-mono text-xs">{totals.writeoff.toFixed(2)} ₴</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right font-mono text-xs">{totals.closing.toFixed(2)} ₴</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
