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
import { Package, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

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

const UNITS = ["шт", "л", "кг", "мл", "г", "уп"];

function PackagingDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: any }) {
  const [name, setName] = useState(initial?.name || "");
  const [unit, setUnit] = useState(initial?.unit || "шт");
  const [quantity, setQuantity] = useState(String(initial?.quantity || ""));
  const { toast } = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => {
      const body = { name, unit, quantity: parseFloat(quantity) || 0 };
      if (initial?.id) return apiFetch(`/packaging/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiFetch("/packaging", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packaging"] });
      toast({ title: initial?.id ? "Збережено" : "Фасування додано" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати фасування" : "Нове фасування"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Назва *</Label>
            <Input value={name} onChange={e => setName(e.target.value)}
              placeholder="уп. с/п-120/25, Пляшка 0.75..." className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Одиниця виміру</Label>
              <select value={unit} onChange={e => setUnit(e.target.value)}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <Label>Кількість</Label>
              <Input type="number" min="0" step="0.001" value={quantity}
                onChange={e => setQuantity(e.target.value)} className="mt-1" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FbPackaging() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["packaging"],
    queryFn: () => apiFetch("/packaging"),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/packaging/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["packaging"] }); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const items: any[] = data?.packaging || [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="w-6 h-6 text-teal-600" />
              <div>
                <h1 className="text-lg font-bold">Фасування</h1>
                <p className="text-xs text-muted-foreground">{items.length} позицій</p>
              </div>
            </div>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Додати
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Package className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Фасування не визначено</p>
              <p className="text-sm text-muted-foreground mt-1">Додайте перше фасування</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Назва</th>
                  <th className="text-center px-4 py-3 font-medium">Одиниця</th>
                  <th className="text-right px-4 py-3 font-medium">Кількість</th>
                  <th className="text-right px-4 py-3 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{p.unit}</td>
                    <td className="px-4 py-3 text-right font-mono">{parseFloat(p.quantity).toFixed(3)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(p); setDialogOpen(true); }}
                          className="p-1.5 text-muted-foreground hover:text-primary rounded">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => del.mutate(p.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <PackagingDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        initial={editing}
      />
    </AppLayout>
  );
}
