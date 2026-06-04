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
  ArrowRightLeft, Plus, CheckCircle2, Clock, Loader2,
  Eye, Trash2, X, ArrowRight,
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ ingredient_id: "", name: "", quantity: "", unit: "", cost_per_unit: "" }]);
  const { toast } = useToast();
  const qc = useQueryClient();

  function addItem() { setItems(i => [...i, { ingredient_id: "", name: "", quantity: "", unit: "", cost_per_unit: "" }]); }
  function removeItem(idx: number) { setItems(i => i.filter((_, j) => j !== idx)); }
  function setItem(idx: number, k: string, v: string) {
    setItems(items => items.map((item, j) => {
      if (j !== idx) return item;
      const updated = { ...item, [k]: v };
      if (k === "ingredient_id" && v) {
        const ing = ingredients.find(i => String(i.id) === v);
        if (ing) {
          updated.name = ing.name;
          updated.unit = ing.unit;
          updated.cost_per_unit = String(ing.cost_per_unit || "0");
        }
      }
      return updated;
    }));
  }

  const save = useMutation({
    mutationFn: () => apiFetch("/transfers", {
      method: "POST",
      body: JSON.stringify({
        from_location: from, to_location: to, transfer_date: date, notes,
        items: items.filter(i => i.name && i.quantity).map(i => ({
          ingredient_id: i.ingredient_id ? parseInt(i.ingredient_id) : null,
          name: i.name,
          quantity: parseFloat(i.quantity),
          unit: i.unit || "кг",
          cost_per_unit: parseFloat(i.cost_per_unit || "0"),
        })),
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfers"] });
      toast({ title: "Переміщення створено" });
      onClose();
      reset();
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  function reset() {
    setFrom(""); setTo(""); setNotes("");
    setItems([{ ingredient_id: "", name: "", quantity: "", unit: "", cost_per_unit: "" }]);
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Нове переміщення</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label>Зі складу</Label>
              <Input value={from} onChange={e => setFrom(e.target.value)} placeholder="Кухня, Бар..." className="mt-1" />
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground mt-5 shrink-0" />
            <div className="flex-1">
              <Label>На склад</Label>
              <Input value={to} onChange={e => setTo(e.target.value)} placeholder="Штат, Reception..." className="mt-1" />
            </div>
            <div className="w-32">
              <Label>Дата</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Позиції</Label>
              <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-3 h-3 mr-1" />Додати</Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <select value={item.ingredient_id} onChange={e => setItem(idx, "ingredient_id", e.target.value)}
                    className="w-44 border rounded-md px-2 py-2 text-sm bg-background">
                    <option value="">Інгредієнт (опц.)</option>
                    {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  <Input value={item.name} onChange={e => setItem(idx, "name", e.target.value)}
                    placeholder="Назва позиції" className="flex-1 h-9 text-sm" />
                  <Input type="number" min="0" step="0.001" value={item.quantity}
                    onChange={e => setItem(idx, "quantity", e.target.value)}
                    placeholder="К-сть" className="w-20 h-9 text-sm" />
                  <Input value={item.unit} onChange={e => setItem(idx, "unit", e.target.value)}
                    placeholder="Од." className="w-14 h-9 text-sm" />
                  <Input type="number" min="0" step="0.01" value={item.cost_per_unit}
                    onChange={e => setItem(idx, "cost_per_unit", e.target.value)}
                    placeholder="Ціна" className="w-20 h-9 text-sm" />
                  <button onClick={() => removeItem(idx)} className="mt-2 text-muted-foreground hover:text-destructive">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Примітка</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Необов'язково" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Скасувати</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !items.some(i => i.name && i.quantity)}>
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
    queryKey: ["transfer-detail", id],
    queryFn: () => apiFetch(`/transfers/${id}`),
    enabled: !!id,
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const confirm = useMutation({
    mutationFn: () => apiFetch(`/transfers/${id}/confirm`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["transfer-detail", id] });
      toast({ title: "Переміщення підтверджено" });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: () => apiFetch(`/transfers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfers"] });
      toast({ title: "Видалено" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const tr = data?.transfer;
  const items: any[] = data?.items || [];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Переміщення #{id}</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : tr ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg text-sm">
              <span className="font-medium">{tr.from_location || "—"}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{tr.to_location || "—"}</span>
              <span className="ml-auto text-muted-foreground">{tr.transfer_date?.slice(0, 10)}</span>
            </div>
            <div className="flex items-center gap-3">
              {statusBadge(tr.status)}
              {tr.notes && <span className="text-sm text-muted-foreground">{tr.notes}</span>}
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/60"><tr className="text-xs text-muted-foreground">
                  <th className="text-left px-3 py-2">Позиція</th>
                  <th className="text-right px-3 py-2">К-сть</th>
                  <th className="text-right px-3 py-2">Сума</th>
                </tr></thead>
                <tbody className="divide-y">
                  {items.map(i => (
                    <tr key={i.id}>
                      <td className="px-3 py-2">{i.name}</td>
                      <td className="px-3 py-2 text-right">{parseFloat(i.quantity).toFixed(3)} {i.unit}</td>
                      <td className="px-3 py-2 text-right">{parseFloat(i.total_cost || "0").toFixed(2)} ₴</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 font-semibold">Разом</td>
                    <td className="px-3 py-2 text-right font-semibold">{parseFloat(tr.total_amount || "0").toFixed(2)} ₴</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          {tr?.status === "draft" && (
            <Button variant="ghost" size="sm" className="text-destructive mr-auto"
              onClick={() => del.mutate()} disabled={del.isPending}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Видалити
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Закрити</Button>
          {tr?.status === "draft" && (
            <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
              {confirm.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Підтвердити
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function FbTransfers() {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["transfers"],
    queryFn: () => apiFetch("/transfers"),
  });
  const { data: ingData } = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => apiFetch("/ingredients"),
  });

  const transfers: any[] = data?.transfers || [];
  const ingredients: any[] = ingData?.ingredients || [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ArrowRightLeft className="w-6 h-6 text-blue-600" />
              <div>
                <h1 className="text-lg font-bold">Переміщення</h1>
                <p className="text-xs text-muted-foreground">{transfers.length} переміщень</p>
              </div>
            </div>
            <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" />Додати</Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <ArrowRightLeft className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Переміщень немає</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Дата</th>
                  <th className="text-left px-4 py-3 font-medium">Звідки</th>
                  <th className="text-left px-4 py-3 font-medium">Куди</th>
                  <th className="text-center px-4 py-3 font-medium">Позицій</th>
                  <th className="text-right px-4 py-3 font-medium">Сума</th>
                  <th className="text-left px-4 py-3 font-medium">Статус</th>
                  <th className="text-right px-4 py-3 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transfers.map((t: any) => (
                  <tr key={t.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.transfer_date ? format(new Date(t.transfer_date), "dd MMM yyyy", { locale: uk }) : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">{t.from_location || "—"}</td>
                    <td className="px-4 py-3 font-medium">{t.to_location || "—"}</td>
                    <td className="px-4 py-3 text-center">{t.item_count}</td>
                    <td className="px-4 py-3 text-right font-mono">{parseFloat(t.total_amount || "0").toFixed(2)} ₴</td>
                    <td className="px-4 py-3">{statusBadge(t.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDetailId(t.id)}
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
