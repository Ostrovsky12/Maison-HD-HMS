import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ClipboardList, Plus, CheckCircle2, Clock, Loader2,
  Eye, AlertTriangle, ChevronLeft, Save,
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

// ─── Detail / Counting View ────────────────────────────────────────────────────
function SessionDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["inventory-session", id],
    queryFn: () => apiFetch(`/inventory/${id}`),
  });
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const session = data?.session;
  const lines: any[] = data?.lines || [];

  function getValue(lineId: number, systemQty: string) {
    if (counts[lineId] !== undefined) return counts[lineId];
    return "";
  }

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

  const grouped: Record<string, any[]> = {};
  for (const l of lines) {
    const cat = l.category || "Без категорії";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(l);
  }

  const counted = lines.filter(l => l.actual_qty !== null || counts[l.id] !== undefined).length;
  const variance = lines.reduce((s, l) => {
    const actual = counts[l.id] !== undefined ? parseFloat(counts[l.id] || "0") : parseFloat(l.actual_qty || l.system_qty || "0");
    const system = parseFloat(l.system_qty || "0");
    const cost = parseFloat(l.cost_per_unit || "0");
    return s + (actual - system) * cost;
  }, 0);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{session?.name}</h1>
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
              return (
                <div key={l.id} className={`flex items-center px-4 py-3 border-b hover:bg-muted/10 ${actualNum !== null ? "bg-white" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{l.ingredient_name}</div>
                    <div className="text-xs text-muted-foreground">По системі: {sysNum.toFixed(3)} {l.unit}</div>
                  </div>
                  <div className="w-28 flex items-center gap-1">
                    {session?.status !== "completed" ? (
                      <Input
                        type="number" min="0" step="0.001"
                        value={displayVal}
                        onChange={e => setCounts(c => ({ ...c, [l.id]: e.target.value }))}
                        placeholder={sysNum.toFixed(3)}
                        className="h-8 text-sm text-right"
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
