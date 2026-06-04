import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ClipboardList, Plus, CheckCircle2, Clock, Loader2,
  Eye, AlertTriangle, ChevronLeft, Save, Mic, MicOff,
  Sparkles, X, Check, Info,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

const API = "/api/fb/warehouse";
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

function statusBadge(s: string) {
  if (s === "completed") return (
    <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">
      <CheckCircle2 className="w-3 h-3" /> Проведена
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
      <Clock className="w-3 h-3" /> В процесі
    </span>
  );
}

// ─── Voice Mic Button ──────────────────────────────────────────────────────────
function VoiceMicButton({ onTranscript, onStop }: {
  onTranscript: (t: string) => void;
  onStop?: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const recogRef = useRef<any>(null);
  const finalRef = useRef("");

  const toggle = () => {
    if (recording) {
      recogRef.current?.stop();
      setRecording(false);
      onStop?.();
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Браузер не підтримує голосовий ввід. Спробуйте Chrome."); return; }
    finalRef.current = "";
    const r = new SR();
    r.lang = "uk-UA"; r.continuous = true; r.interimResults = true;
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalRef.current += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      onTranscript(finalRef.current + interim);
    };
    r.onerror = () => { setRecording(false); onStop?.(); };
    r.onend = () => { setRecording(false); onStop?.(); };
    recogRef.current = r;
    r.start();
    setRecording(true);
  };

  return (
    <button onClick={toggle}
      className={`rounded-full w-20 h-20 flex flex-col items-center justify-center gap-1 transition-all mx-auto
        ${recording
          ? "bg-red-500 text-white shadow-lg shadow-red-200 animate-pulse"
          : "bg-violet-100 text-violet-600 hover:bg-violet-200 hover:shadow-md"}`}>
      {recording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
      <span className="text-[10px] font-medium">{recording ? "Стоп" : "Говоріть"}</span>
    </button>
  );
}

// ─── AI Voice Panel ────────────────────────────────────────────────────────────
function AiVoicePanel({
  sessionId, onApply, onClose,
}: {
  sessionId: number;
  onApply: (items: Array<{ line_id: number; actual_qty: number }>) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [transcript, setTranscript] = useState("");
  const [step, setStep] = useState<"record" | "preview">("record");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<any[]>([]);
  const [editQty, setEditQty] = useState<Record<number, string>>({});

  const parse = async () => {
    if (!transcript.trim()) return;
    setParsing(true);
    try {
      const res = await apiFetch("/ai-voice-inventory", {
        method: "POST",
        body: JSON.stringify({ text: transcript.trim(), session_id: sessionId }),
      });
      if (!res.items?.length) {
        toast({ title: "AI не розпізнав жодної позиції", description: "Спробуйте ще раз або введіть вручну", variant: "destructive" });
        return;
      }
      const init: Record<number, string> = {};
      res.items.forEach((item: any) => { init[item.line_id] = String(item.actual_qty); });
      setEditQty(init);
      setParsed(res.items);
      setStep("preview");
    } catch (e: any) {
      toast({ title: "Помилка AI", description: e.message, variant: "destructive" });
    } finally { setParsing(false); }
  };

  const apply = () => {
    const items = parsed.map(item => ({
      line_id: item.line_id,
      actual_qty: parseFloat(editQty[item.line_id] ?? String(item.actual_qty)),
    })).filter(i => !isNaN(i.actual_qty));
    onApply(items);
    onClose();
  };

  const confidenceColor = (c: string) =>
    c === "high" ? "text-green-700 bg-green-50 border-green-200"
      : c === "medium" ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-red-700 bg-red-50 border-red-200";
  const confidenceLabel = (c: string) =>
    c === "high" ? "Точно" : c === "medium" ? "Можливо" : "Неточно";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            <div>
              <h2 className="font-bold text-sm">AI Голосова Інвентаризація</h2>
              <p className="text-xs text-muted-foreground">Диктуйте залишки вільним текстом</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {step === "record" && (
            <div className="p-5 space-y-5">
              {/* Mic */}
              <div className="text-center space-y-3">
                <VoiceMicButton
                  onTranscript={t => setTranscript(t)}
                  onStop={() => {}}
                />
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Натисніть мікрофон і диктуйте залишки. Наприклад:<br />
                  <span className="italic">"молоко п'ять кілограмів, олія три літри, яйця двадцять штук"</span>
                </p>
              </div>

              {/* Text fallback */}
              <div>
                <Label className="text-xs text-muted-foreground">або введіть вручну</Label>
                <textarea
                  value={transcript}
                  onChange={e => setTranscript(e.target.value)}
                  rows={4}
                  placeholder="Введіть залишки текстом..."
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>

              {/* Transcript preview */}
              {transcript.trim() && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide mb-1">Розпізнаний текст</p>
                  <p className="text-sm text-violet-900 italic">"{transcript.trim()}"</p>
                  <button onClick={() => setTranscript("")}
                    className="text-[10px] text-violet-400 hover:text-violet-600 mt-1">
                    Очистити
                  </button>
                </div>
              )}

              <div className="bg-muted/40 rounded-lg p-3 flex gap-2 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>AI порівнює ваш текст з назвами товарів зі складу та автоматично заповнює фактичні залишки. Ви зможете перевірити результат перед застосуванням.</span>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">AI розпізнав {parsed.length} позицій</p>
                <button onClick={() => setStep("record")}
                  className="text-xs text-muted-foreground hover:text-violet-600 underline">
                  ← Назад
                </button>
              </div>

              <div className="space-y-2">
                {parsed.map(item => (
                  <div key={item.line_id} className="border rounded-lg p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.ingredient_name}</p>
                      <p className="text-xs text-muted-foreground">
                        По системі: {item.system_qty?.toFixed(3)} {item.unit}
                      </p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-medium ${confidenceColor(item.confidence)}`}>
                      {confidenceLabel(item.confidence)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number" min="0" step="0.001"
                        value={editQty[item.line_id] ?? String(item.actual_qty)}
                        onChange={e => setEditQty(q => ({ ...q, [item.line_id]: e.target.value }))}
                        className="w-20 h-8 text-sm text-right"
                      />
                      <span className="text-xs text-muted-foreground w-6 shrink-0">{item.unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-xs text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Перевірте значення перед застосуванням. Позиції з низькою точністю ("Неточно") потребують особливої уваги.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex gap-2 shrink-0">
          {step === "record" ? (
            <>
              <Button variant="outline" onClick={onClose} className="flex-1">Скасувати</Button>
              <Button onClick={parse} disabled={!transcript.trim() || parsing}
                className="flex-1 bg-violet-600 hover:bg-violet-700 gap-2">
                {parsing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> AI обробляє...</>
                  : <><Sparkles className="w-4 h-4" /> Розпізнати</>}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("record")} className="flex-1">
                Повторити
              </Button>
              <Button onClick={apply} className="flex-1 gap-2 bg-green-600 hover:bg-green-700">
                <Check className="w-4 h-4" /> Застосувати ({parsed.length})
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detail / Counting View ────────────────────────────────────────────────────
function SessionDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["inventory-session", id],
    queryFn: () => apiFetch(`/inventory/${id}`),
  });
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const session = data?.session;
  const lines: any[] = data?.lines || [];

  async function saveLines() {
    setSaving(true);
    try {
      const toSave = lines.map(l => ({
        id: l.id,
        actual_qty: counts[l.id] !== undefined ? counts[l.id] : (l.actual_qty !== null ? String(l.actual_qty) : null),
      }));
      await apiFetch(`/inventory/${id}/lines`, { method: "PUT", body: JSON.stringify({ lines: toSave }) });
      toast({ title: "Збережено" });
      refetch();
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  const complete = useMutation({
    mutationFn: () => apiFetch(`/inventory/${id}/complete`, { method: "POST" }),
    onSuccess: (d) => {
      toast({ title: `Інвентаризацію проведено. Розбіжність: ${parseFloat(d.variance_total || 0).toFixed(2)} ₴` });
      qc.invalidateQueries({ queryKey: ["inventory-sessions"] });
      refetch();
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  function applyVoiceItems(items: Array<{ line_id: number; actual_qty: number }>) {
    setCounts(prev => {
      const next = { ...prev };
      for (const item of items) {
        next[item.line_id] = String(item.actual_qty);
      }
      return next;
    });
    toast({ title: `AI заповнив ${items.length} позицій`, description: "Перевірте значення і збережіть" });
  }

  const grouped: Record<string, any[]> = {};
  for (const l of lines) {
    const cat = l.category || "Без категорії";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(l);
  }

  const counted = lines.filter(l => l.actual_qty !== null || counts[l.id] !== undefined).length;
  const aiFilledIds = new Set<number>();

  const variance = lines.reduce((s, l) => {
    const actual = counts[l.id] !== undefined ? parseFloat(counts[l.id] || "0") : parseFloat(l.actual_qty || l.system_qty || "0");
    const system = parseFloat(l.system_qty || "0");
    const cost = parseFloat(l.cost_per_unit || "0");
    return s + (actual - system) * cost;
  }, 0);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col h-full relative">
      {/* Voice panel overlay */}
      {showVoice && session?.status !== "completed" && (
        <AiVoicePanel
          sessionId={id}
          onApply={applyVoiceItems}
          onClose={() => setShowVoice(false)}
        />
      )}

      {/* Header */}
      <div className="px-6 py-4 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{session?.name}</h1>
            <p className="text-xs text-muted-foreground">
              {session?.date} · {counted}/{lines.length} підраховано · {statusBadge(session?.status || "open")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-sm font-mono px-3 py-1 rounded-lg ${variance < 0 ? "bg-red-50 text-red-700" : variance > 0 ? "bg-green-50 text-green-700" : "bg-muted text-muted-foreground"}`}>
              {variance > 0 ? "+" : ""}{variance.toFixed(2)} ₴
            </div>
            {session?.status !== "completed" && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowVoice(true)}
                  className="h-8 gap-1.5 text-violet-600 border-violet-200 hover:bg-violet-50">
                  <Mic className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">AI Голос</span>
                </Button>
                <Button variant="outline" size="sm" onClick={saveLines} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />} Зберегти
                </Button>
                <Button size="sm" onClick={() => { saveLines().then(() => complete.mutate()); }} disabled={complete.isPending}>
                  {complete.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                  Провести
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-auto">
        {Object.entries(grouped).map(([cat, catLines]) => (
          <div key={cat}>
            <div className="px-4 py-2 bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0">
              {cat}
            </div>
            {catLines.map(l => {
              const displayVal = counts[l.id] !== undefined ? counts[l.id] : (l.actual_qty !== null ? String(l.actual_qty) : "");
              const actualNum = displayVal !== "" ? parseFloat(displayVal) : null;
              const sysNum = parseFloat(l.system_qty || "0");
              const diff = actualNum !== null ? actualNum - sysNum : null;
              const isAiFilled = aiFilledIds.has(l.id);
              return (
                <div key={l.id} className={`flex items-center px-4 py-3 border-b hover:bg-muted/10 ${actualNum !== null ? "bg-white" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">{l.ingredient_name}</span>
                      {isAiFilled && (
                        <span className="text-[10px] text-violet-600 bg-violet-50 px-1 rounded">AI</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">По системі: {sysNum.toFixed(3)} {l.unit}</div>
                  </div>
                  <div className="w-28 flex items-center gap-1">
                    {session?.status !== "completed" ? (
                      <Input
                        type="number" min="0" step="0.001"
                        value={displayVal}
                        onChange={e => setCounts(c => ({ ...c, [l.id]: e.target.value }))}
                        placeholder={sysNum.toFixed(3)}
                        className={`h-8 text-sm text-right ${counts[l.id] !== undefined ? "border-violet-300 bg-violet-50/30" : ""}`}
                      />
                    ) : (
                      <span className="text-sm font-mono">{l.actual_qty !== null ? parseFloat(l.actual_qty).toFixed(3) : "—"}</span>
                    )}
                    <span className="text-xs text-muted-foreground w-8 shrink-0">{l.unit}</span>
                  </div>
                  {diff !== null && (
                    <div className={`w-20 text-right text-xs font-mono ml-2 ${diff < 0 ? "text-red-600" : diff > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                      {diff > 0 ? "+" : ""}{diff.toFixed(3)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {lines.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardList className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="font-medium">Немає позицій</p>
            <p className="text-sm text-muted-foreground mt-1">Інвентаризація порожня</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main List ─────────────────────────────────────────────────────────────────
export default function FbInventorySessions() {
  const [detailId, setDetailId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["inventory-sessions"],
    queryFn: () => apiFetch("/inventory"),
    enabled: !detailId,
  });

  const create = useMutation({
    mutationFn: () => apiFetch("/inventory", {
      method: "POST", body: JSON.stringify({ name: newName, date: newDate }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-sessions"] });
      toast({ title: "Інвентаризацію створено. Всі інгредієнти завантажено." });
      setCreateOpen(false);
      setNewName("");
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const sessions: any[] = data?.sessions || [];

  if (detailId) return <AppLayout><SessionDetail id={detailId} onBack={() => setDetailId(null)} /></AppLayout>;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-6 h-6 text-violet-600" />
              <div>
                <h1 className="text-lg font-bold">Інвентаризації</h1>
                <p className="text-xs text-muted-foreground">{sessions.length} сесій</p>
              </div>
            </div>
            <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" />Нова інвентаризація</Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <ClipboardList className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Інвентаризацій немає</p>
              <p className="text-sm text-muted-foreground mt-1">Створіть першу інвентаризацію</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Назва</th>
                  <th className="text-left px-4 py-3 font-medium">Дата проведення</th>
                  <th className="text-center px-4 py-3 font-medium">Позицій</th>
                  <th className="text-center px-4 py-3 font-medium">Підраховано</th>
                  <th className="text-left px-4 py-3 font-medium">Статус</th>
                  <th className="text-right px-4 py-3 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessions.map((s: any) => (
                  <tr key={s.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.date ? format(new Date(s.date), "dd MMM yyyy", { locale: uk }) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">{s.line_count}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={s.counted_count === s.line_count && s.line_count > 0 ? "text-green-600 font-medium" : ""}>
                        {s.counted_count}/{s.line_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">{statusBadge(s.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDetailId(s.id)}
                        className="text-muted-foreground hover:text-primary p-1 rounded">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={v => { if (!v) setCreateOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Нова інвентаризація</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Назва / Склад</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="наприклад: БАР, Кухня..." className="mt-1" />
            </div>
            <div>
              <Label>Дата проведення</Label>
              <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="mt-1" />
            </div>
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-amber-500" />
              Система автоматично завантажить усі активні інгредієнти з поточними залишками.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Скасувати</Button>
            <Button onClick={() => create.mutate()} disabled={!newName.trim() || create.isPending}>
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Створити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
