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
import { Warehouse, Plus, Pencil, Trash2, Loader2, MapPin } from "lucide-react";

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

function WarehouseDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: any }) {
  const [name, setName] = useState(initial?.name || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const { toast } = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => {
      if (initial?.id) {
        return apiFetch(`/warehouses-list/${initial.id}`, { method: "PATCH", body: JSON.stringify({ name, address, notes }) });
      }
      return apiFetch("/warehouses-list", { method: "POST", body: JSON.stringify({ name, address, notes }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses-list"] });
      toast({ title: initial?.id ? "Збережено" : "Склад додано" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати склад" : "Новий склад"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Назва *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Кухня, Бар, Штат..." className="mt-1" />
          </div>
          <div>
            <Label>Адреса</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Необов'язково" className="mt-1" />
          </div>
          <div>
            <Label>Примітка</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Необов'язково" className="mt-1" />
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

export default function FbWarehousesList() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["warehouses-list"],
    queryFn: () => apiFetch("/warehouses-list"),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/warehouses-list/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["warehouses-list"] }); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const warehouses: any[] = data?.warehouses || [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Warehouse className="w-6 h-6 text-slate-600" />
              <div>
                <h1 className="text-lg font-bold">Склади</h1>
                <p className="text-xs text-muted-foreground">{warehouses.length} складів</p>
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
          ) : warehouses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Warehouse className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Складів немає</p>
              <p className="text-sm text-muted-foreground mt-1">Додайте перший склад</p>
              <Button className="mt-4" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Додати склад
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {warehouses.map((w: any) => (
                <div key={w.id} className="border rounded-xl p-4 bg-card hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                        <Warehouse className="w-4.5 h-4.5 text-slate-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{w.name}</div>
                        {w.address && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {w.address}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setEditing(w); setDialogOpen(true); }}
                        className="p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-muted">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => del.mutate(w.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {w.notes && <p className="text-xs text-muted-foreground mt-3 pl-[46px]">{w.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <WarehouseDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        initial={editing}
      />
    </AppLayout>
  );
}
