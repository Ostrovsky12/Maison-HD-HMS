import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Sparkles, Send, Clock, TrendingUp, BarChart2, Users, ShoppingBag, Loader2, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const SUGGESTED = [
  { icon: TrendingUp,  text: "Щомісячна динаміка виторгу" },
  { icon: ShoppingBag, text: "Зроби АВС-аналіз мого меню" },
  { icon: Users,       text: "Які страви часто замовляють разом?" },
  { icon: BarChart2,   text: "Що найкраще продається в пікові години?" },
  { icon: TrendingUp,  text: "Проаналізуй ефективність за місяць" },
  { icon: ShoppingBag, text: "Хто з постійних гостей перестав ходити?" },
];

const PRESETS = [
  { label: "Сьогодні", days: 0 },
  { label: "7 днів",   days: 6 },
  { label: "30 днів",  days: 29 },
  { label: "90 днів",  days: 89 },
];

interface AiReport {
  id: string;
  question: string;
  report: string;
  from: string;
  to: string;
  kpi: { revenue: number; checks: number; avg_check: number; guests: number };
  created_at: string;
}

function today() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().split("T")[0]; }

function MarkdownReport({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.startsWith("## "))  return <h2 key={i} className="font-bold text-base mt-4 mb-1 text-gray-900">{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} className="font-semibold mt-3 mb-0.5 text-gray-800">{line.slice(4)}</h3>;
        if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-semibold text-gray-800">{line.slice(2, -2)}</p>;
        if (line.startsWith("- ") || line.startsWith("• ")) {
          const content = line.slice(2);
          return (
            <div key={i} className="flex gap-2">
              <span className="text-primary mt-0.5 shrink-0">•</span>
              <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
            </div>
          );
        }
        if (/^\d+\./.test(line)) {
          return <div key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} className="pl-2" />;
        }
        return (
          <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
        );
      })}
    </div>
  );
}

function ReportCard({ report, onDelete }: { report: AiReport; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const fmt = (n: number) => new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
      <div
        className="px-5 py-4 flex items-start justify-between gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
            <span className="font-semibold text-sm truncate">{report.question}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(report.created_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            <span>{report.from} — {report.to}</span>
            {report.kpi.revenue > 0 && <span className="text-emerald-600 font-medium">{fmt(report.kpi.revenue)} ₴ виторг</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors text-muted-foreground"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t bg-muted/10">
          {report.kpi.checks > 0 && (
            <div className="flex flex-wrap gap-4 py-3 border-b mb-4">
              {[
                { label: "Виторг", value: `${fmt(report.kpi.revenue)} ₴` },
                { label: "Чеків", value: String(report.kpi.checks) },
                { label: "Сер. чек", value: `${fmt(report.kpi.avg_check)} ₴` },
                { label: "Гостей", value: String(report.kpi.guests) },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className="text-base font-bold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          )}
          <div className="pt-1">
            <MarkdownReport text={report.report} />
          </div>
        </div>
      )}
    </div>
  );
}

const STORAGE_KEY = "fb_ai_reports_v2";

function loadReports(): AiReport[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveReports(reports: AiReport[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports.slice(0, 20)));
}

export default function FbReportAi() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<AiReport[]>(loadReports);
  const [preset, setPreset] = useState(2);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => { saveReports(reports); }, [reports]);

  function applyPreset(i: number) {
    setPreset(i);
    setFrom(daysAgo(PRESETS[i].days));
    setTo(today());
  }

  async function submit(q?: string) {
    const text = (q || question).trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch("/analytics/ai-report", {
        method: "POST",
        body: JSON.stringify({ question: text, from, to }),
      });
      const newReport: AiReport = {
        id: Date.now().toString(),
        question: text,
        report: result.report,
        from: result.from,
        to: result.to,
        kpi: result.kpi,
        created_at: new Date().toISOString(),
      };
      setReports(prev => [newReport, ...prev]);
      setQuestion("");
      setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function deleteReport(id: string) {
    setReports(prev => prev.filter(r => r.id !== id));
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">ШІ-звіти</h1>
              <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Нове</span>
            </div>
            <p className="text-xs text-muted-foreground">Запитайте про свій бізнес — ШІ проаналізує реальні дані</p>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">

            {/* Question input */}
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl p-6 mb-8">
              <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
                Поставте питання про ваш бізнес
              </h2>

              {/* Date range */}
              <div className="flex flex-wrap items-center gap-2 justify-center mb-4">
                <div className="flex rounded-lg border border-violet-200 overflow-hidden bg-white text-xs">
                  {PRESETS.map((p, i) => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(i)}
                      className={`px-3 py-1.5 transition-colors ${preset === i ? "bg-violet-600 text-white font-medium" : "hover:bg-violet-50 text-gray-700"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); }}
                    className="border border-violet-200 rounded px-2 py-1.5 bg-white text-xs text-gray-700" />
                  <span className="text-muted-foreground">—</span>
                  <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); }}
                    className="border border-violet-200 rounded px-2 py-1.5 bg-white text-xs text-gray-700" />
                </div>
              </div>

              {/* Input */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                  placeholder="Наприклад: які страви найбільше продаються у вихідні?"
                  rows={3}
                  disabled={loading}
                  className="w-full border border-violet-200 rounded-xl px-4 py-3 pr-14 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white shadow-sm disabled:opacity-60"
                />
                <button
                  onClick={() => submit()}
                  disabled={!question.trim() || loading}
                  className="absolute right-3 bottom-3 w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>

              {error && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              {/* Suggested */}
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Приклади запитів</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED.map(({ icon: Icon, text }) => (
                    <button
                      key={text}
                      onClick={() => submit(text)}
                      disabled={loading}
                      className="flex items-center gap-1.5 text-xs border border-violet-200 rounded-full px-3 py-1.5 hover:bg-violet-50 hover:border-violet-400 transition-colors bg-white disabled:opacity-50 text-gray-700"
                    >
                      <Icon className="w-3 h-3 text-violet-500" />
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-6 h-6 text-white animate-pulse" />
                </div>
                <p className="text-sm font-medium text-gray-700">Аналізую дані...</p>
                <p className="text-xs text-muted-foreground">ШІ вивчає ваш бізнес за {from} — {to}</p>
              </div>
            )}

            {/* Previous reports */}
            {reports.length > 0 && !loading && (
              <div ref={topRef}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    Попередні звіти
                    <span className="text-xs text-muted-foreground font-normal">({reports.length})</span>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => { if (confirm("Очистити всі звіти?")) setReports([]); }}
                    className="text-xs text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Очистити
                  </Button>
                </div>
                <div className="space-y-4">
                  {reports.map(r => (
                    <ReportCard key={r.id} report={r} onDelete={() => deleteReport(r.id)} />
                  ))}
                </div>
              </div>
            )}

            {reports.length === 0 && !loading && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-sm text-muted-foreground">Ще немає звітів. Поставте перше питання про ваш бізнес!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
