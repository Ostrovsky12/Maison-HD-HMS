import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Clock, CheckCircle2, AlertCircle } from "lucide-react";

const API = "/api/fb";
async function apiFetch(path: string) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
  return r.json();
}

const fmt = (n: number) => new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtDT = (d: string) => d ? new Date(d).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
function today() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().split("T")[0]; }

const PRESETS = [
  { label: "7 днів", from: () => daysAgo(6), to: () => today() },
  { label: "30 днів", from: () => daysAgo(29), to: () => today() },
  { label: "90 днів", from: () => daysAgo(89), to: () => today() },
];

export default function FbShifts() {
  const [preset, setPreset] = useState(0);
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());

  const { data, isLoading } = useQuery({
    queryKey: ["fb-shifts", from, to],
    queryFn: () => apiFetch(`/cashbox/sessions/history?from=${from}&to=${to}`),
  });

  function applyPreset(i: number) {
    setPreset(i); setFrom(PRESETS[i].from()); setTo(PRESETS[i].to());
  }

  const sessions: any[] = data?.sessions || [];
  const totalRevenue = sessions.reduce((s, ss) => s + Number(ss.revenue || 0), 0);
  const totalChecks = sessions.reduce((s, ss) => s + (ss.checks || 0), 0);

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Касові зміни</h1>
            <p className="text-sm text-muted-foreground">Журнал відкриття та закриття каси</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Виторг за період</div>
            <div className="text-xl font-bold">{fmt(totalRevenue)} ₴</div>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Чеків за період</div>
            <div className="text-xl font-bold">{totalChecks}</div>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Змін</div>
            <div className="text-xl font-bold">{sessions.length}</div>
          </div>
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
        </div>

        {/* Table */}
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">#</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Каса</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Касир</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Відкрито</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Закрито</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Початок зміни</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Виторг</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Чеків</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Кінець зміни</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Різниця</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Статус</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">Завантаження...</td></tr>
                ) : sessions.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">Змін не знайдено</td></tr>
                ) : (
                  sessions.map((s: any) => {
                    const discrepancy = Number(s.discrepancy || 0);
                    return (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{s.id}</td>
                        <td className="px-4 py-3 font-medium">{s.cashbox_name || s.entity_name || "Каса"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{s.cashier_name || "—"}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtDT(s.opened_at)}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">{fmtDT(s.closed_at)}</td>
                        <td className="px-4 py-3 text-right">{fmt(Number(s.opening_balance || 0))}</td>
                        <td className="px-4 py-3 text-right font-semibold">{fmt(Number(s.revenue || 0))}</td>
                        <td className="px-4 py-3 text-right">{s.checks || 0}</td>
                        <td className="px-4 py-3 text-right">{s.closing_balance != null ? fmt(Number(s.closing_balance)) : "—"}</td>
                        <td className="px-4 py-3 text-right">
                          {discrepancy !== 0 ? (
                            <span className={discrepancy > 0 ? "text-emerald-600" : "text-red-500"}>
                              {discrepancy > 0 ? "+" : ""}{fmt(discrepancy)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {s.status === "open" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                              <Clock className="w-3 h-3" /> Відкрита
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                              <CheckCircle2 className="w-3 h-3" /> Закрита
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {sessions.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/40">
                    <td colSpan={6} className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Разом</td>
                    <td className="px-4 py-2.5 text-right font-bold">{fmt(totalRevenue)}</td>
                    <td className="px-4 py-2.5 text-right font-bold">{totalChecks}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
