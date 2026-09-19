import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles, Send, Clock, TrendingUp, BarChart2, Users, ShoppingBag, Loader2,
  ChevronDown, ChevronUp, Trash2, Search, ArrowUpDown, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── API ──────────────────────────────────────────────────────────────────────
const API = "/api/fb";
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || r.statusText);
  return j;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
const fmtDT = (d: string) => d ? new Date(d).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
function today() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().split("T")[0]; }

// ─────────────────────────────────────────────────────────────────────────────
// TAB: ШІ-звіти
// ─────────────────────────────────────────────────────────────────────────────
const AI_SUGGESTED = [
  { icon: TrendingUp, text: "Щомісячна динаміка виторгу" },
  { icon: ShoppingBag, text: "Зроби АВС-аналіз мого меню" },
  { icon: Users, text: "Які страви часто замовляють разом?" },
  { icon: BarChart2, text: "Що найкраще продається в пікові години?" },
  { icon: TrendingUp, text: "Проаналізуй ефективність за місяць" },
  { icon: ShoppingBag, text: "Хто з постійних гостей перестав ходити?" },
];
const AI_PRESETS = [
  { label: "Сьогодні", days: 0 },
  { label: "7 днів", days: 6 },
  { label: "30 днів", days: 29 },
  { label: "90 днів", days: 89 },
];
interface AiReport {
  id: string; question: string; report: string; from: string; to: string;
  kpi: { revenue: number; checks: number; avg_check: number; guests: number };
  created_at: string;
}
const AI_STORAGE_KEY = "fb_ai_reports_v2";
function loadReports(): AiReport[] { try { return JSON.parse(localStorage.getItem(AI_STORAGE_KEY) || "[]"); } catch { return []; } }
function saveReports(reports: AiReport[]) { localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(reports.slice(0, 20))); }

function MarkdownReport({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.startsWith("## ")) return <h2 key={i} className="font-bold text-base mt-4 mb-1">{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} className="font-semibold mt-3 mb-0.5">{line.slice(4)}</h3>;
        if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-semibold">{line.slice(2, -2)}</p>;
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-primary mt-0.5 shrink-0">•</span>
              <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
            </div>
          );
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />;
      })}
    </div>
  );
}

function ReportCard({ report, onDelete }: { report: AiReport; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const f = (n: number) => new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  return (
    <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-3 cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
            <span className="font-semibold text-sm truncate">{report.question}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(report.created_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            <span>{report.from} — {report.to}</span>
            {report.kpi.revenue > 0 && <span className="text-emerald-600 font-medium">{f(report.kpi.revenue)} ₴ виторг</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={e => { e.stopPropagation(); onDelete(); }} className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors text-muted-foreground"><Trash2 className="w-3.5 h-3.5" /></button>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-5 border-t bg-muted/10">
          {report.kpi.checks > 0 && (
            <div className="flex flex-wrap gap-4 py-3 border-b mb-4">
              {[{ label: "Виторг", value: `${f(report.kpi.revenue)} ₴` }, { label: "Чеків", value: String(report.kpi.checks) }, { label: "Сер. чек", value: `${f(report.kpi.avg_check)} ₴` }, { label: "Гостей", value: String(report.kpi.guests) }].map(s => (
                <div key={s.label} className="text-center">
                  <div className="text-base font-bold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          )}
          <div className="pt-1"><MarkdownReport text={report.report} /></div>
        </div>
      )}
    </div>
  );
}

function AiTab() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<AiReport[]>(loadReports);
  const [preset, setPreset] = useState(2);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => { saveReports(reports); }, [reports]);

  function applyPreset(i: number) { setPreset(i); setFrom(daysAgo(AI_PRESETS[i].days)); setTo(today()); }

  async function submit(q?: string) {
    const text = (q || question).trim();
    if (!text || loading) return;
    setLoading(true); setError(null);
    try {
      const result = await apiFetch("/analytics/ai-report", { method: "POST", body: JSON.stringify({ question: text, from, to }) });
      setReports(prev => [{ id: Date.now().toString(), question: text, report: result.report, from: result.from, to: result.to, kpi: result.kpi, created_at: new Date().toISOString() }, ...prev]);
      setQuestion("");
      setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl p-6 mb-8">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Поставте питання про ваш бізнес</h2>
          <div className="flex flex-wrap items-center gap-2 justify-center mb-4">
            <div className="flex rounded-lg border border-violet-200 overflow-hidden bg-white text-xs">
              {AI_PRESETS.map((p, i) => (
                <button key={p.label} onClick={() => applyPreset(i)}
                  className={`px-3 py-1.5 transition-colors ${preset === i ? "bg-violet-600 text-white font-medium" : "hover:bg-violet-50 text-gray-700"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 text-xs">
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); }} className="border border-violet-200 rounded px-2 py-1.5 bg-white text-xs text-gray-700" />
              <span className="text-muted-foreground">—</span>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); }} className="border border-violet-200 rounded px-2 py-1.5 bg-white text-xs text-gray-700" />
            </div>
          </div>
          <div className="relative">
            <textarea value={question} onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="Наприклад: які страви найбільше продаються у вихідні?" rows={3} disabled={loading}
              className="w-full border border-violet-200 rounded-xl px-4 py-3 pr-14 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white shadow-sm disabled:opacity-60" />
            <button onClick={() => submit()} disabled={!question.trim() || loading}
              className="absolute right-3 bottom-3 w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          {error && <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Приклади запитів</p>
            <div className="flex flex-wrap gap-2">
              {AI_SUGGESTED.map(({ icon: Icon, text }) => (
                <button key={text} onClick={() => submit(text)} disabled={loading}
                  className="flex items-center gap-1.5 text-xs border border-violet-200 rounded-full px-3 py-1.5 hover:bg-violet-50 hover:border-violet-400 transition-colors bg-white disabled:opacity-50 text-gray-700">
                  <Icon className="w-3 h-3 text-violet-500" />{text}
                </button>
              ))}
            </div>
          </div>
        </div>
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-white animate-pulse" />
            </div>
            <p className="text-sm font-medium text-gray-700">Аналізую дані...</p>
          </div>
        )}
        {reports.length > 0 && !loading && (
          <div ref={topRef}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Попередні звіти <span className="text-xs text-muted-foreground font-normal">({reports.length})</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { if (confirm("Очистити всі звіти?")) setReports([]); }} className="text-xs text-muted-foreground hover:text-red-500">
                <Trash2 className="w-3 h-3 mr-1" /> Очистити
              </Button>
            </div>
            <div className="space-y-4">
              {reports.map(r => <ReportCard key={r.id} report={r} onDelete={() => setReports(prev => prev.filter(x => x.id !== r.id))} />)}
            </div>
          </div>
        )}
        {reports.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm text-muted-foreground">Ще немає звітів. Поставте перше питання!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Продажі
// ─────────────────────────────────────────────────────────────────────────────
const PAYMENT_LABELS: Record<string, string> = { cash: "Готівка", card: "Картка", qr: "QR / Онлайн", invoice: "Рахунок", mixed: "Змішана" };
const PAYMENT_COLORS: Record<string, string> = { cash: "bg-emerald-500", card: "bg-blue-500", qr: "bg-violet-500", invoice: "bg-amber-500", mixed: "bg-slate-400" };
const SALES_PRESETS = [
  { label: "Сьогодні", from: () => today(), to: () => today() },
  { label: "7 днів", from: () => daysAgo(6), to: () => today() },
  { label: "30 днів", from: () => daysAgo(29), to: () => today() },
  { label: "Цей місяць", from: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0], to: () => today() },
];

function KpiCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-card border rounded-xl p-4 flex gap-3 items-start">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}><Icon className="w-[18px] h-[18px] text-white" /></div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        <div className="text-xl font-bold tracking-tight">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

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

function SalesTab() {
  const [preset, setPreset] = useState(2);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());

  const { data, isLoading } = useQuery({
    queryKey: ["fb-analytics-overview", from, to],
    queryFn: () => apiFetch(`/analytics/overview?from=${from}&to=${to}`),
  });

  function applyPreset(i: number) { setPreset(i); setFrom(SALES_PRESETS[i].from()); setTo(SALES_PRESETS[i].to()); }

  const kpi = data?.kpi || {};
  const chart = data?.chart || [];
  const payments = data?.by_payment || [];
  const maxPayment = Math.max(...payments.map((p: any) => Number(p.amount)), 1);

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Статистика продажів</h2>
            <p className="text-sm text-muted-foreground">Виторг, чеки та методи оплати</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden text-xs">
              {SALES_PRESETS.map((p, i) => (
                <button key={p.label} onClick={() => applyPreset(i)}
                  className={`px-3 py-1.5 transition-colors ${preset === i ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}>{p.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-1 text-xs">
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); }} className="border rounded px-2 py-1.5 bg-background text-xs" />
              <span className="text-muted-foreground">—</span>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); }} className="border rounded px-2 py-1.5 bg-background text-xs" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard icon={TrendingUp} label="Виторг" value={`${fmt(kpi.revenue || 0)} ₴`} color="bg-primary" />
          <KpiCard icon={ShoppingBag} label="Чеки" value={String(kpi.checks || 0)} color="bg-blue-500" />
          <KpiCard icon={BarChart2} label="Середній чек" value={`${fmt(kpi.avg_check || 0)} ₴`} color="bg-violet-500" />
          <KpiCard icon={Users} label="Гостей" value={String(kpi.guests || 0)} color="bg-emerald-500" />
          <KpiCard icon={TrendingUp} label="Чайові" value={`${fmt(kpi.tips || 0)} ₴`} sub={`Знижки: ${fmt(kpi.discounts || 0)} ₴`} color="bg-amber-500" />
        </div>
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Динаміка виторгу</h3>
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
        <div className="bg-card border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Методи оплати</h3>
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
                      <div className={`h-full rounded-full transition-all ${PAYMENT_COLORS[p.method] || "bg-slate-400"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Чеки
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = { open: "Відкрито", cooking: "Готується", billed: "Оплачено", closed: "Закрито", cancelled: "Скасовано" };
const STATUS_COLOR: Record<string, string> = { open: "text-blue-600 bg-blue-50", cooking: "text-amber-600 bg-amber-50", billed: "text-emerald-600 bg-emerald-50", closed: "text-emerald-700 bg-emerald-50", cancelled: "text-red-500 bg-red-50" };
const PAY_LABEL: Record<string, string> = { cash: "Готівка", card: "Картка", qr: "QR", invoice: "Рахунок", mixed: "Змішана" };
const ORDERS_PRESETS = [
  { label: "Сьогодні", from: () => today(), to: () => today() },
  { label: "7 днів", from: () => daysAgo(6), to: () => today() },
  { label: "30 днів", from: () => daysAgo(29), to: () => today() },
];

function OrdersTab() {
  const [preset, setPreset] = useState(0);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["fb-analytics-orders", from, to, status, payment, page],
    queryFn: () => apiFetch(`/analytics/orders?from=${from}&to=${to}&status=${status}&payment=${payment}&page=${page}&limit=${limit}`),
  });

  function applyPreset(i: number) { setPreset(i); setFrom(ORDERS_PRESETS[i].from()); setTo(ORDERS_PRESETS[i].to()); setPage(1); }

  const orders: any[] = data?.orders || [];
  const total: number = data?.total || 0;
  const totalPages = Math.ceil(total / limit);
  const filtered = search ? orders.filter(o => o.receipt_number?.includes(search) || o.guest_name?.toLowerCase().includes(search.toLowerCase()) || o.waiter_name?.toLowerCase().includes(search.toLowerCase())) : orders;
  const totalRevenue = filtered.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">Чеки</h2>
          <span className="text-sm text-muted-foreground">{total} замовлень за період</span>
        </div>
        <div className="bg-card border rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg border overflow-hidden text-xs">
            {ORDERS_PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => applyPreset(i)}
                className={`px-3 py-1.5 transition-colors ${preset === i ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}>{p.label}</button>
            ))}
          </div>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); setPage(1); }} className="border rounded px-2 py-1.5 bg-background text-xs" />
          <span className="text-muted-foreground text-xs">—</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); setPage(1); }} className="border rounded px-2 py-1.5 bg-background text-xs" />
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="border rounded px-2 py-1.5 bg-background text-xs">
            <option value="all">Всі статуси</option>
            <option value="billed">Оплачено</option>
            <option value="closed">Закрито</option>
            <option value="open">Відкрито</option>
            <option value="cancelled">Скасовано</option>
          </select>
          <select value={payment} onChange={e => { setPayment(e.target.value); setPage(1); }} className="border rounded px-2 py-1.5 bg-background text-xs">
            <option value="all">Всі оплати</option>
            <option value="cash">Готівка</option>
            <option value="card">Картка</option>
            <option value="qr">QR</option>
            <option value="invoice">Рахунок</option>
          </select>
          <div className="flex items-center gap-1.5 border rounded px-2 py-1.5 bg-background text-xs ml-auto">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent outline-none w-32" />
          </div>
        </div>
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {["#", "Стіл", "Гість", "Офіціант", "Відкрито", "Закрито", "Знижка", "Сума", "Оплата", "Статус"].map((h, idx) => (
                    <th key={h} className={`px-4 py-2.5 font-medium text-muted-foreground text-xs ${idx >= 6 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">Завантаження...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">Замовлень не знайдено</td></tr>
                ) : (
                  filtered.map((o: any) => (
                    <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{o.receipt_number || `#${o.id}`}</td>
                      <td className="px-4 py-2.5">{o.table_number ? `Стіл ${o.table_number}` : "—"}</td>
                      <td className="px-4 py-2.5 max-w-[120px] truncate">{o.guest_name || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{o.waiter_name || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{o.created_at ? new Date(o.created_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{o.closed_at ? new Date(o.closed_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      <td className="px-4 py-2.5 text-right text-xs">{Number(o.discount_amount) > 0 ? <span className="text-red-500">-{fmt(Number(o.discount_amount))}</span> : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{fmt(Number(o.total_amount || 0))}</td>
                      <td className="px-4 py-2.5 text-xs">{PAY_LABEL[o.payment_method] || o.payment_method || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[o.status] || ""}`}>{STATUS_LABEL[o.status] || o.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/40">
                    <td colSpan={7} className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Разом: {filtered.length} чеків</td>
                    <td className="px-4 py-2.5 text-right font-bold">{fmt(totalRevenue)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground text-xs">{(page - 1) * limit + 1}–{Math.min(page * limit, total)} з {total}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 border rounded hover:bg-muted disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-3 py-1.5 border rounded bg-primary text-primary-foreground text-xs font-medium">{page}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 border rounded hover:bg-muted disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Товари та категорії
// ─────────────────────────────────────────────────────────────────────────────
const PRODUCTS_PRESETS = [
  { label: "7 днів", from: () => daysAgo(6), to: () => today() },
  { label: "30 днів", from: () => daysAgo(29), to: () => today() },
  { label: "Цей місяць", from: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0], to: () => today() },
];

function ProductsTab() {
  const [subTab, setSubTab] = useState<"products" | "categories">("products");
  const [preset, setPreset] = useState(1);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [sort, setSort] = useState<"revenue" | "qty">("revenue");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const productsQ = useQuery({ queryKey: ["fb-analytics-products", from, to], queryFn: () => apiFetch(`/analytics/products?from=${from}&to=${to}`), enabled: subTab === "products" });
  const catsQ = useQuery({ queryKey: ["fb-analytics-categories", from, to], queryFn: () => apiFetch(`/analytics/categories?from=${from}&to=${to}`), enabled: subTab === "categories" });

  function applyPreset(i: number) { setPreset(i); setFrom(PRODUCTS_PRESETS[i].from()); setTo(PRODUCTS_PRESETS[i].to()); }

  const products: any[] = productsQ.data?.products || [];
  const categories: any[] = catsQ.data?.categories || [];
  const allCats = [...new Set(products.map((p: any) => p.category_name))].sort();
  const filteredProducts = products
    .filter(p => (!search || p.name.toLowerCase().includes(search.toLowerCase())) && (categoryFilter === "all" || p.category_name === categoryFilter))
    .sort((a, b) => Number(b[sort]) - Number(a[sort]));
  const totalRevProducts = filteredProducts.reduce((s, p) => s + Number(p.revenue), 0);
  const totalQtyProducts = filteredProducts.reduce((s, p) => s + Number(p.qty), 0);
  const totalRevCats = categories.reduce((s, c) => s + Number(c.revenue), 0);
  const totalQtyCats = categories.reduce((s, c) => s + Number(c.qty), 0);
  const isLoading = subTab === "products" ? productsQ.isLoading : catsQ.isLoading;

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Товари та категорії</h2>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
          <button onClick={() => setSubTab("products")} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${subTab === "products" ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}>Товари ({products.length})</button>
          <button onClick={() => setSubTab("categories")} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${subTab === "categories" ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}>Категорії ({categories.length})</button>
        </div>
        <div className="bg-card border rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg border overflow-hidden text-xs">
            {PRODUCTS_PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => applyPreset(i)} className={`px-3 py-1.5 transition-colors ${preset === i ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}>{p.label}</button>
            ))}
          </div>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); }} className="border rounded px-2 py-1.5 bg-background text-xs" />
          <span className="text-muted-foreground text-xs">—</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); }} className="border rounded px-2 py-1.5 bg-background text-xs" />
          {subTab === "products" && (
            <>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border rounded px-2 py-1.5 bg-background text-xs">
                <option value="all">Всі категорії</option>
                {allCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex items-center gap-1.5 border rounded px-2 py-1.5 bg-background text-xs ml-auto">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <input placeholder="Пошук страви..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent outline-none w-32" />
              </div>
            </>
          )}
        </div>
        {subTab === "products" && (
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs w-8">#</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Страва</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Категорія</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">
                      <button onClick={() => setSort("qty")} className={`flex items-center gap-1 ml-auto ${sort === "qty" ? "text-primary" : ""}`}>К-сть <ArrowUpDown className="w-3 h-3" /></button>
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs w-32">Виторг, %</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">
                      <button onClick={() => setSort("revenue")} className={`flex items-center gap-1 ml-auto ${sort === "revenue" ? "text-primary" : ""}`}>Виторг ₴ <ArrowUpDown className="w-3 h-3" /></button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Завантаження...</td></tr>
                    : filteredProducts.length === 0 ? <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Немає даних</td></tr>
                    : filteredProducts.map((p: any, i: number) => {
                      const revPct = totalRevProducts > 0 ? Number(p.revenue) / totalRevProducts * 100 : 0;
                      return (
                        <tr key={p.item_id || p.name} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-2.5 font-medium">{p.name}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.category_name}</td>
                          <td className="px-4 py-2.5 text-right">{Number(p.qty).toFixed(0)} шт.</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 justify-end">
                              <span className="text-xs text-muted-foreground w-10 text-right">{revPct.toFixed(1)}%</span>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${revPct}%` }} /></div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmt(Number(p.revenue))}</td>
                        </tr>
                      );
                    })}
                </tbody>
                {filteredProducts.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-muted/40">
                      <td colSpan={3} className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Разом</td>
                      <td className="px-4 py-2.5 text-right font-bold text-xs">{totalQtyProducts.toFixed(0)} шт.</td>
                      <td className="px-4 py-2.5 text-right font-bold text-xs">100%</td>
                      <td className="px-4 py-2.5 text-right font-bold">{fmt(totalRevProducts)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
        {subTab === "categories" && (
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Категорія</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">К-сть</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Виторг, %</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Виторг ₴</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">Завантаження...</td></tr>
                    : categories.length === 0 ? <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">Немає даних</td></tr>
                    : categories.map((c: any) => {
                      const revPct = totalRevCats > 0 ? Number(c.revenue) / totalRevCats * 100 : 0;
                      return (
                        <tr key={c.category_id || c.name} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{c.name}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{Number(c.qty).toFixed(0)} шт.</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 justify-end">
                              <span className="text-xs text-muted-foreground w-10 text-right">{revPct.toFixed(1)}%</span>
                              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${revPct}%` }} /></div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{fmt(Number(c.revenue))}</td>
                        </tr>
                      );
                    })}
                </tbody>
                {categories.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-muted/40">
                      <td className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Разом</td>
                      <td className="px-4 py-2.5 text-right font-bold text-xs">{totalQtyCats.toFixed(0)} шт.</td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold">100%</td>
                      <td className="px-4 py-2.5 text-right font-bold">{fmt(totalRevCats)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: АВС-аналіз
// ─────────────────────────────────────────────────────────────────────────────
const CLASS_STYLE: Record<string, { bg: string; text: string; desc: string }> = {
  A: { bg: "bg-emerald-100 text-emerald-700", text: "text-emerald-700", desc: "Топ продажі — до 70% виторгу" },
  B: { bg: "bg-amber-100 text-amber-700", text: "text-amber-700", desc: "Середні — 70–90% виторгу" },
  C: { bg: "bg-red-100 text-red-600", text: "text-red-600", desc: "Слабкі — решта 10%" },
};
const ABC_PRESETS = [
  { label: "7 днів", from: () => daysAgo(6), to: () => today() },
  { label: "30 днів", from: () => daysAgo(29), to: () => today() },
  { label: "90 днів", from: () => daysAgo(89), to: () => today() },
];

function AbcTab() {
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

  function applyPreset(i: number) { setPreset(i); setFrom(ABC_PRESETS[i].from()); setTo(ABC_PRESETS[i].to()); }

  const items: any[] = data?.items || [];
  const allCats = [...new Set(items.map((i: any) => i.category_name))].sort();
  const filtered = items.filter((i: any) =>
    (!search || i.name.toLowerCase().includes(search.toLowerCase())) &&
    (classFilter === "all" || i.class === classFilter) &&
    (categoryFilter === "all" || i.category_name === categoryFilter)
  );
  const counts = { A: items.filter(i => i.class === "A").length, B: items.filter(i => i.class === "B").length, C: items.filter(i => i.class === "C").length };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <h2 className="text-lg font-bold">АВС-аналіз</h2>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(CLASS_STYLE).map(([cls, s]) => (
            <div key={cls} className={`rounded-xl border p-4 cursor-pointer transition-all ${classFilter === cls ? "ring-2 ring-primary" : ""}`}
              onClick={() => setClassFilter(classFilter === cls ? "all" : cls)}>
              <div className="flex items-start justify-between mb-1">
                <span className={`text-2xl font-black ${s.text}`}>{cls}</span>
                <span className="text-lg font-bold">{counts[cls as keyof typeof counts]}</span>
              </div>
              <div className="text-xs text-muted-foreground">{s.desc}</div>
            </div>
          ))}
        </div>
        <div className="bg-card border rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg border overflow-hidden text-xs">
            {ABC_PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => applyPreset(i)} className={`px-3 py-1.5 transition-colors ${preset === i ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}>{p.label}</button>
            ))}
          </div>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); }} className="border rounded px-2 py-1.5 bg-background text-xs" />
          <span className="text-muted-foreground text-xs">—</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); }} className="border rounded px-2 py-1.5 bg-background text-xs" />
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border rounded px-2 py-1.5 bg-background text-xs">
            <option value="all">Всі категорії</option>
            {allCats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-1.5 border rounded px-2 py-1.5 bg-background text-xs ml-auto">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent outline-none w-32" />
          </div>
        </div>
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {["#", "Страва", "Категорія", "К-сть", "К-сть %", "Виторг ₴", "Виторг %", "Клас"].map((h, idx) => (
                    <th key={h} className={`px-4 py-2.5 font-medium text-muted-foreground text-xs ${idx < 3 ? "text-left" : idx === 7 ? "text-center" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Завантаження...</td></tr>
                  : filtered.length === 0 ? <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Немає даних за цей період</td></tr>
                  : filtered.map((item: any) => {
                    const s = CLASS_STYLE[item.class] || CLASS_STYLE.C;
                    return (
                      <tr key={item.item_id || item.name} className="border-b last:border-0 hover:bg-muted/30">
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
                              <div className={`h-full rounded-full ${item.class === "A" ? "bg-emerald-500" : item.class === "B" ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${Math.min(item.revenue_pct * 5, 100)}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold text-xs ${s.bg}`}>{item.class}</span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Касові зміни
// ─────────────────────────────────────────────────────────────────────────────
const SHIFTS_PRESETS = [
  { label: "7 днів", from: () => daysAgo(6), to: () => today() },
  { label: "30 днів", from: () => daysAgo(29), to: () => today() },
  { label: "90 днів", from: () => daysAgo(89), to: () => today() },
];

function ShiftsTab() {
  const [preset, setPreset] = useState(0);
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());

  const { data, isLoading } = useQuery({
    queryKey: ["fb-shifts", from, to],
    queryFn: () => apiFetch(`/cashbox/sessions/history?from=${from}&to=${to}`),
  });

  function applyPreset(i: number) { setPreset(i); setFrom(SHIFTS_PRESETS[i].from()); setTo(SHIFTS_PRESETS[i].to()); }

  const sessions: any[] = data?.sessions || [];
  const totalRevenue = sessions.reduce((s, ss) => s + Number(ss.revenue || 0), 0);
  const totalChecks = sessions.reduce((s, ss) => s + (ss.checks || 0), 0);

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <h2 className="text-lg font-bold">Касові зміни</h2>
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
        <div className="bg-card border rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg border overflow-hidden text-xs">
            {SHIFTS_PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => applyPreset(i)} className={`px-3 py-1.5 transition-colors ${preset === i ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}>{p.label}</button>
            ))}
          </div>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); }} className="border rounded px-2 py-1.5 bg-background text-xs" />
          <span className="text-muted-foreground text-xs">—</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); }} className="border rounded px-2 py-1.5 bg-background text-xs" />
        </div>
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {["#", "Каса", "Касир", "Відкрито", "Закрито", "Поч. зміни", "Виторг", "Чеків", "Кін. зміни", "Різниця", "Статус"].map((h, idx) => (
                    <th key={h} className={`px-4 py-2.5 font-medium text-muted-foreground text-xs ${idx < 5 ? "text-left" : idx === 10 ? "text-center" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">Завантаження...</td></tr>
                  : sessions.length === 0 ? <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">Змін не знайдено</td></tr>
                  : sessions.map((s: any) => {
                    const discrepancy = Number(s.discrepancy || 0);
                    return (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{s.id}</td>
                        <td className="px-4 py-3 font-medium">{s.cashbox_name || s.entity_name || "Каса"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{s.cashier_name || "—"}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtDT(s.opened_at)}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">{fmtDT(s.closed_at)}</td>
                        <td className="px-4 py-3 text-right">{fmt(Number(s.opening_balance || 0))}</td>
                        <td className="px-4 py-3 text-right font-semibold">{fmt(Number(s.revenue || 0))}</td>
                        <td className="px-4 py-3 text-right">{s.checks || 0}</td>
                        <td className="px-4 py-3 text-right">{s.closing_balance != null ? fmt(Number(s.closing_balance)) : "—"}</td>
                        <td className="px-4 py-3 text-right">{discrepancy !== 0 ? <span className={discrepancy > 0 ? "text-emerald-600" : "text-red-500"}>{discrepancy > 0 ? "+" : ""}{fmt(discrepancy)}</span> : "—"}</td>
                        <td className="px-4 py-3 text-center">
                          {s.status === "open"
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700"><Clock className="w-3 h-3" /> Відкрита</span>
                            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> Закрита</span>}
                        </td>
                      </tr>
                    );
                  })}
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
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: "ai",       label: "ШІ-звіти",          badge: "Нове" },
  { id: "sales",    label: "Продажі" },
  { id: "orders",   label: "Чеки" },
  { id: "products", label: "Товари та категорії" },
  { id: "abc",      label: "АВС-аналіз" },
  { id: "shifts",   label: "Касові зміни" },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FbReports() {
  const [tab, setTab] = useState<TabId>("ai");

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center gap-3">
          <BarChart2 className="w-5 h-5 text-primary shrink-0" />
          <div>
            <h1 className="text-lg font-bold">Звітність F&B</h1>
            <p className="text-xs text-muted-foreground">Продажі, чеки, аналітика та касові зміни</p>
          </div>
        </div>

        <div className="border-b bg-background shrink-0 overflow-x-auto">
          <div className="flex px-4 min-w-max">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`relative px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}>
                {t.label}
                {"badge" in t && t.badge && (
                  <span className="ml-1.5 text-[9px] font-bold bg-violet-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">{t.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {tab === "ai"       && <AiTab />}
          {tab === "sales"    && <SalesTab />}
          {tab === "orders"   && <OrdersTab />}
          {tab === "products" && <ProductsTab />}
          {tab === "abc"      && <AbcTab />}
          {tab === "shifts"   && <ShiftsTab />}
        </div>
      </div>
    </AppLayout>
  );
}
