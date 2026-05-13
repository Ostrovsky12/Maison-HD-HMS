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
import { Megaphone, Plus, Pencil, Trash2, Loader2, CheckCircle2, Clock, XCircle } from "lucide-react";
import { format, isAfter, isBefore, isToday, parseISO } from "date-fns";
import { uk } from "date-fns/locale";

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

function promoStatus(p: any) {
  const now = new Date();
  if (!p.is_active) return { label: "Вимкнено", class: "bg-slate-100 text-slate-700", icon: XCircle };
  const start = p.start_date ? parseISO(p.start_date) : null;
  const end = p.end_date ? parseISO(p.end_date) : null;
  if (start && isBefore(now, start)) return { label: "Заплановано", class: "bg-blue-100 text-blue-700", icon: Clock };
  if (end && isAfter(now, end)) return { label: "Завершено", class: "bg-slate-100 text-slate-600", icon: XCircle };
  return { label: "Активна", class: "bg-green-100 text-green-700", icon: CheckCircle2 };
}

function PromoDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: any }) {
  const [name, setName] = useState(initial?.name || "");
  const [startDate, setStartDate] = useState(initial?.start_date?.slice(0, 10) || "");
  const [endDate, setEndDate] = useState(initial?.end_date?.slice(0, 10) || "");
  const [bonusMult, setBonusMult] = useState(String(initial?.bonus_multiplier || "1"));
  const [discountPct, setDiscountPct] = useState(String(initial?.discount_pct || "0"));
  const [notes, setNotes] = useState(initial?.notes || "");
  const { toast } = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name, start_date: startDate || null, end_date: endDate || null,
        bonus_multiplier: parseFloat(bonusMult) || 1,
        discount_pct: parseFloat(discountPct) || 0,
        notes: notes || null,
      };
      if (initial?.id) return apiFetch(`/promotions/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiFetch("/promotions", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-promotions"] }); toast({ title: "Збережено" }); onClose(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати акцію" : "Нова акція"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Назва *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="50%, Літній розпродаж..." className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Дата початку</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1" /></div>
            <div><Label>Дата закінчення</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Множник нарахування бонусів</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" min="1" step="0.5" value={bonusMult} onChange={e => setBonusMult(e.target.value)} className="w-20" />
                <span className="text-xs text-muted-foreground">×</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">1 = звичайне нарахування, 2 = подвійні бонуси</p>
            </div>
            <div>
              <Label>Додаткова знижка, %</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" min="0" max="100" step="0.5" value={discountPct} onChange={e => setDiscountPct(e.target.value)} className="w-20" />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <div><Label>Примітка</Label><Input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" /></div>
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

export default function FbPromotions() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["fb-promotions"],
    queryFn: () => apiFetch("/promotions"),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/promotions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-promotions"] }); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, val }: { id: number; val: boolean }) =>
      apiFetch(`/promotions/${id}`, { method: "PATCH", body: JSON.stringify({ is_active: val }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-promotions"] }),
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const promotions: any[] = data?.promotions || [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Megaphone className="w-6 h-6 text-orange-500" />
              <div>
                <h1 className="text-lg font-bold">Акції</h1>
                <p className="text-xs text-muted-foreground">{promotions.length} акцій</p>
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
          ) : promotions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Megaphone className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Акцій немає</p>
              <p className="text-sm text-muted-foreground mt-1">Додайте першу маркетингову акцію</p>
              <Button className="mt-4" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Нова акція
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 font-medium">Назва</th>
                  <th className="text-left px-4 py-3 font-medium">Дата початку</th>
                  <th className="text-left px-4 py-3 font-medium">Дата закінчення</th>
                  <th className="text-center px-4 py-3 font-medium">Множник бонусів</th>
                  <th className="text-center px-4 py-3 font-medium">Знижка</th>
                  <th className="text-left px-4 py-3 font-medium">Статус</th>
                  <th className="text-right px-4 py-3 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {promotions.map((p: any, idx: number) => {
                  const s = promoStatus(p);
                  const StatusIcon = s.icon;
                  return (
                    <tr key={p.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {p.start_date ? format(parseISO(p.start_date), "dd MMM yyyy", { locale: uk }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {p.end_date ? format(parseISO(p.end_date), "dd MMM yyyy", { locale: uk }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${parseFloat(p.bonus_multiplier) > 1 ? "bg-amber-100 text-amber-800" : "text-muted-foreground"}`}>
                          {parseFloat(p.bonus_multiplier)}×
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {parseFloat(p.discount_pct) > 0
                          ? <span className="text-xs font-medium text-green-700">{parseFloat(p.discount_pct)}%</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${s.class}`}>
                          <StatusIcon className="w-3 h-3" /> {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => toggle.mutate({ id: p.id, val: !p.is_active })}
                            className={`text-xs px-2 py-1 rounded border ${p.is_active ? "text-muted-foreground hover:text-red-600" : "text-green-600 hover:text-green-700"}`}>
                            {p.is_active ? "Вимк." : "Увімк."}
                          </button>
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
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <PromoDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} initial={editing} />
    </AppLayout>
  );
}
