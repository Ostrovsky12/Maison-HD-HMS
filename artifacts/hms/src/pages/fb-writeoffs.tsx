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
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Trash2, Plus, CheckCircle2, Clock, Loader2, Eye,
  AlertTriangle, PackageX, X,
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

const REASONS = [
  { value: "spoilage", label: "Зіпсувалося" },
  { value: "staff_meal", label: "Їжа для персоналу" },
  { value: "banquet", label: "Банкет" },
  { value: "breakage", label: "Бій/втрати" },
  { value: "other", label: "Інше" },
];

function reasonLabel(v: string) {
  return REASONS.find(r => r.value === v)?.label ?? v;
}

function statusBadge(s: string) {
  if (s === "confirmed") return (
    <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">
      <CheckCircle2 className="w-3 h-3" /> Проведено
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
      <Clock className="w-3 h-3" /> Чернетка
    </span>
  );
}

// ─── Create Dialog ─────────────────────────────────────────────────────────────
function CreateDialog({ open, onClose, ingredients }: { open: boolean; onClose: () => void; ingredients: any[] }) {
  const [reason, setReason] = useState("spoilage");
  const [notes, setNotes] = useState("");
  const [writeoff_date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([{ ingredient_id: "", quantity: "", unit: "" }]);
  const { toast } = useToast();
  const qc = useQueryClient();

  function addItem() { setItems(i => [...i, { ingredient_id: "", quantity: "", unit: "" }]); }
  function removeItem(idx: number) { setItems(i => i.filter((_, j) => j !== idx)); }
  function setItem(idx: number, k: string, v: string) {
    setItems(items => items.map((item, j) => {
      if (j !== idx) return item;
      const updated = { ...item, [k]: v };
      if (k === "ingredient_id") {
        const ing = ingredients.find(i => String(i.id) === v);
        if (ing) updated.unit = ing.unit;
      }
      return updated;
    }));
  }

  const save = useMutation({
    mutationFn: () => apiFetch("/writeoffs", {
      method: "POST",
      body: JSON.stringify({
        writeoff_date, reason, notes,
        items: items.filter(i => i.ingredient_id && i.quantity).map(i => ({
          ingredient_id: parseInt(i.ingredient_id),
          quantity: parseFloat(i.quantity),
          unit: i.unit,
        })),
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["writeoffs"] }); toast({ title: "Списання створено" }); onClose(); reset(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  function reset() { setReason("spoilage"); setNotes(""); setItems([{ ingredient_id: "", quantity: "", unit: "" }]); }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Нове списання</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Дата</Label>
              <Input type="date" value={writeoff_date} onChange={e => setDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Причина</Label>
              <select value={reason} onChange={e => setReason(e.target.value)}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background">
                {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Позиції</Label>
              <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-3 h-3 mr-1" />Додати</Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const ing = ingredients.find(i => String(i.id) === item.ingredient_id);
                return (
                  <div key={idx} className="flex gap-2 items-start">
                    <select value={item.ingredient_id} onChange={e => setItem(idx, "ingredient_id", e.target.value)}
                      className="flex-1 border rounded-md px-2 py-2 text-sm bg-background">
                      <option value="">Оберіть інгредієнт...</option>
                      {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <div className="flex items-center gap-1 w-32">
                      <Input type="number" min="0" step="0.001" value={item.quantity}
                        onChange={e => setItem(idx, "quantity", e.target.value)}
                        placeholder="К-сть" className="w-20 h-9" />
                      <span className="text-xs text-muted-foreground w-8 shrink-0">{ing?.unit || "—"}</span>
                    </div>
                    <button onClick={() => removeItem(idx)} className="mt-2 text-muted-foreground hover:text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Коментар</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Необов'язково" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Скасувати</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !items.some(i => i.ingredient_id && i.quantity)}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail Dialog ─────────────────────────────────────────────────────────────
function DetailDialog({ id, open, onClose }: { id: number | null; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["writeoff-detail", id],
    queryFn: () => apiFetch(`/writeoffs/${id}`),
    enabled: !!id,
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const confirm = useMutation({
    mutationFn: () => apiFetch(`/writeoffs/${id}/confirm`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["writeoffs"] });
      qc.invalidateQueries({ queryKey: ["writeoff-detail", id] });
      toast({ title: "Списання проведено. Залишки зменшено." });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const wo = data?.writeoff;
  const items: any[] = data?.items || [];
  const total = items.reduce((s, i) => s + parseFloat(i.total_cost || "0"), 0);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Списання #{id}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : wo ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Дата:</span> {wo.writeoff_date?.slice(0, 10)}</div>
              <div><span className="text-muted-foreground">Статус:</span> {statusBadge(wo.status)}</div>
              <div><span className="text-muted-foreground">Причина:</span> {reasonLabel(wo.reason)}</div>
              {wo.notes && <div><span className="text-muted-foreground">Коментар:</span> {wo.notes}</div>}
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/60"><tr className="text-xs text-muted-foreground">
                  <th className="text-left px-3 py-2">Інгредієнт</th>
                  <th className="text-right px-3 py-2">К-сть</th>
                  <th className="text-right px-3 py-2">Сума</th>
                </tr></thead>
                <tbody className="divide-y">
                  {items.map(i => (
                    <tr key={i.id}>
                      <td className="px-3 py-2">{i.ingredient_name}</td>
                      <td className="px-3 py-2 text-right">{parseFloat(i.quantity).toFixed(3)} {i.unit}</td>
                      <td className="px-3 py-2 text-right">{parseFloat(i.total_cost).toFixed(2)} ₴</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr><td colSpan={2} className="px-3 py-2 font-semibold">Разом</td>
                    <td className="px-3 py-2 text-right font-semibold">{total.toFixed(2)} ₴</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Закрити</Button>
          {wo?.status === "draft" && (
            <Button onClick={() => confirm.mutate()} disabled={confirm.isPending} variant="destructive">
              {confirm.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Провести (зменшити залишки)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function FbWriteoffs() {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const { data: woData, isLoading } = useQuery({
    queryKey: ["writeoffs"],
    queryFn: () => apiFetch("/writeoffs"),
  });
  const { data: ingData } = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => apiFetch("/ingredients"),
  });

  const writeoffs: any[] = (woData?.writeoffs || []).filter((w: any) =>
    !search || reasonLabel(w.reason).toLowerCase().includes(search.toLowerCase()) ||
    w.notes?.toLowerCase().includes(search.toLowerCase())
  );
  const ingredients: any[] = ingData?.ingredients || [];

  const totalDraft = writeoffs.filter(w => w.status === "draft").reduce((s, w) => s + parseFloat(w.total_amount || "0"), 0);
  const totalConfirmed = writeoffs.filter(w => w.status === "confirmed").reduce((s, w) => s + parseFloat(w.total_amount || "0"), 0);

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PackageX className="w-6 h-6 text-red-600" />
              <div>
                <h1 className="text-lg font-bold">Списання</h1>
                <p className="text-xs text-muted-foreground">{writeoffs.length} записів</p>
              </div>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Додати
            </Button>
          </div>

          <div className="flex gap-4 mt-3">
            <div className="border rounded-lg px-3 py-2 text-sm bg-amber-50 border-amber-200">
              <span className="text-amber-600 font-medium">Чернетки: {totalDraft.toFixed(2)} ₴</span>
            </div>
            <div className="border rounded-lg px-3 py-2 text-sm bg-green-50 border-green-200">
              <span className="text-green-700 font-medium">Проведено: {totalConfirmed.toFixed(2)} ₴</span>
            </div>
          </div>

          <div className="mt-3 max-w-xs">
            <Input placeholder="Пошук за причиною, коментарем..." value={search}
              onChange={e => setSearch(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : writeoffs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <PackageX className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Списань немає</p>
              <p className="text-sm text-muted-foreground mt-1">Додайте перше списання</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Дата</th>
                  <th className="text-left px-4 py-3 font-medium">Причина</th>
                  <th className="text-center px-4 py-3 font-medium">Позицій</th>
                  <th className="text-right px-4 py-3 font-medium">Сума</th>
                  <th className="text-left px-4 py-3 font-medium">Статус</th>
                  <th className="text-right px-4 py-3 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {writeoffs.map((w: any) => (
                  <tr key={w.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground">
                      {w.writeoff_date ? format(new Date(w.writeoff_date), "dd MMM yyyy", { locale: uk }) : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">{reasonLabel(w.reason)}</td>
                    <td className="px-4 py-3 text-center">{w.item_count}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {parseFloat(w.total_amount || "0").toFixed(2)} ₴
                    </td>
                    <td className="px-4 py-3">{statusBadge(w.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDetailId(w.id)}
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

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} ingredients={ingredients} />
      <DetailDialog id={detailId} open={!!detailId} onClose={() => setDetailId(null)} />
    </AppLayout>
  );
}
