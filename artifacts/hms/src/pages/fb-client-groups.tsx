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
import { Users2, Plus, Pencil, Trash2, Loader2, Star, Tag, Crown } from "lucide-react";

const API = "/api/fb/marketing";
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

const GROUP_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#64748b"];

function GroupDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: any }) {
  const [name, setName] = useState(initial?.name || "");
  const [bonusPct, setBonusPct] = useState(String(initial?.bonus_pct || "0"));
  const [discountPct, setDiscountPct] = useState(String(initial?.discount_pct || "0"));
  const [minPurchase, setMinPurchase] = useState(String(initial?.min_purchase || "0"));
  const [color, setColor] = useState(initial?.color || GROUP_COLORS[0]);
  const [isDefault, setIsDefault] = useState(initial?.is_default || false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name, bonus_pct: parseFloat(bonusPct) || 0, discount_pct: parseFloat(discountPct) || 0,
        min_purchase: parseFloat(minPurchase) || 0, color, is_default: isDefault,
      };
      if (initial?.id) return apiFetch(`/client-groups/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiFetch("/client-groups", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-client-groups"] }); toast({ title: "Збережено" }); onClose(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати групу" : "Нова група"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Назва *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="VIP, Нові клієнти..." className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Бонус, %</Label><Input type="number" min="0" max="100" step="0.1" value={bonusPct} onChange={e => setBonusPct(e.target.value)} className="mt-1" /></div>
            <div><Label>Знижка, %</Label><Input type="number" min="0" max="100" step="0.1" value={discountPct} onChange={e => setDiscountPct(e.target.value)} className="mt-1" /></div>
          </div>
          <div><Label>Мін. сума покупок для переходу, ₴</Label><Input type="number" min="0" value={minPurchase} onChange={e => setMinPurchase(e.target.value)} className="mt-1" /></div>
          <div>
            <Label>Колір</Label>
            <div className="flex gap-2 mt-1.5">
              {GROUP_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : ""}`} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_default" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="rounded" />
            <Label htmlFor="is_default">Група за замовчуванням для нових клієнтів</Label>
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

export default function FbClientGroups() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["fb-client-groups"],
    queryFn: () => apiFetch("/client-groups"),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/client-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-client-groups"] }); toast({ title: "Групу видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const groups: any[] = (data?.groups || []).sort((a: any, b: any) => a.min_purchase - b.min_purchase);

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users2 className="w-6 h-6 text-violet-600" />
              <div>
                <h1 className="text-lg font-bold">Групи клієнтів</h1>
                <p className="text-xs text-muted-foreground">{groups.length} груп</p>
              </div>
            </div>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Додати
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Users2 className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Групи не налаштовано</p>
              <p className="text-sm text-muted-foreground mt-1">Додайте першу групу клієнтів</p>
              <Button className="mt-4" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Додати групу
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {groups.map((g: any) => (
                <div key={g.id} className="border rounded-xl p-4 bg-card flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full shrink-0" style={{ backgroundColor: g.color || "#6366f1" }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{g.name}</span>
                      {g.is_default && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">за замовч.</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      {g.bonus_pct > 0 && <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" /> Бонус {g.bonus_pct}%</span>}
                      {g.discount_pct > 0 && <span className="flex items-center gap-1"><Tag className="w-3 h-3 text-green-600" /> Знижка {g.discount_pct}%</span>}
                      {g.min_purchase > 0 && <span>Від {parseFloat(g.min_purchase).toFixed(0)} ₴</span>}
                      <span className="ml-auto flex items-center gap-1"><Users2 className="w-3 h-3" />{g.client_count} клієнтів</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditing(g); setDialogOpen(true); }}
                      className="p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-muted">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => del.mutate(g.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <GroupDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} initial={editing} />
    </AppLayout>
  );
}
