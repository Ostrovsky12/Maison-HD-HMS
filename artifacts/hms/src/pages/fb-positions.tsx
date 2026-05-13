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
import { Shield, Plus, Pencil, Trash2, Loader2, Check } from "lucide-react";

const API = "/api/fb/access";
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

const POS_COLORS = ["blue", "violet", "green", "amber", "red", "orange", "slate"];
const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800",
  green: "bg-green-100 text-green-800", amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800", orange: "bg-orange-100 text-orange-800",
  slate: "bg-slate-100 text-slate-700",
};
const DOT_MAP: Record<string, string> = {
  blue: "bg-blue-500", violet: "bg-violet-500", green: "bg-green-500",
  amber: "bg-amber-500", red: "bg-red-500", orange: "bg-orange-500", slate: "bg-slate-400",
};

function permLabel(key: string): string {
  const map: Record<string, string> = {
    full_access: "Повний доступ", statistics: "Статистика", finances: "Фінанси",
    menu: "Меню", warehouse: "Склад", marketing: "Маркетинг", access: "Доступ",
    settings: "Налаштування", cashier: "Робота з касою",
    cashier_admin: "Адміністрування залу", courier: "Кур'єр",
  };
  return map[key] || key;
}

const ALL_PERMS = ["full_access", "statistics", "finances", "menu", "warehouse", "marketing", "access", "settings", "cashier", "cashier_admin", "courier"];

function PositionDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: any }) {
  const [name, setName] = useState(initial?.name || "");
  const [color, setColor] = useState(initial?.color || "blue");
  const [perms, setPerms] = useState<Record<string, boolean>>(
    initial?.permissions || Object.fromEntries(ALL_PERMS.map(k => [k, false]))
  );
  const { toast } = useToast();
  const qc = useQueryClient();

  function togglePerm(k: string) {
    if (k === "full_access") {
      const newVal = !perms.full_access;
      setPerms(Object.fromEntries(ALL_PERMS.map(p => [p, newVal])));
    } else {
      setPerms(prev => ({ ...prev, [k]: !prev[k], full_access: false }));
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { name, color, permissions: perms };
      if (initial?.id) return apiFetch(`/positions/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiFetch("/positions", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-positions"] }); toast({ title: "Збережено" }); onClose(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const activePerms = ALL_PERMS.filter(k => k !== "full_access" && perms[k]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати посаду" : "Нова посада"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Назва *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Керівник, Офіціант..." className="mt-1" /></div>
          <div>
            <Label>Колір</Label>
            <div className="flex gap-2 mt-1.5">
              {POS_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full ${DOT_MAP[c]} ${color === c ? "ring-2 ring-offset-1 ring-primary" : ""}`} />
              ))}
            </div>
          </div>
          <div>
            <Label>Права доступу</Label>
            <div className="mt-2 grid grid-cols-1 gap-1">
              {ALL_PERMS.map(k => (
                <label key={k} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${perms[k] ? "bg-primary/8 border border-primary/20" : "hover:bg-muted/50"}`}>
                  <div onClick={() => togglePerm(k)}
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${perms[k] ? "bg-primary border-primary" : "border-input"}`}>
                    {perms[k] && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <span className="text-sm">{permLabel(k)}</span>
                </label>
              ))}
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

export default function FbPositions() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["fb-positions"],
    queryFn: () => apiFetch("/positions"),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/positions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-positions"] }); toast({ title: "Посаду видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const positions: any[] = data?.positions || [];

  function describePerms(p: any): string {
    const perms: Record<string, boolean> = p.permissions || {};
    if (perms.full_access) return "Повний доступ";
    const active = ALL_PERMS.filter(k => k !== "full_access" && perms[k]).map(permLabel);
    return active.length ? active.join(", ") : "Без прав";
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-slate-600" />
            <div>
              <h1 className="text-lg font-bold">Посади</h1>
              <p className="text-xs text-muted-foreground">{positions.length} посад</p>
            </div>
          </div>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Додати
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Shield className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Посад немає</p>
              <p className="text-sm text-muted-foreground mt-1">Додайте першу посаду для працівників</p>
              <Button className="mt-4" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Нова посада
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Назва посади</th>
                  <th className="text-left px-4 py-3 font-medium">Права доступу</th>
                  <th className="text-right px-4 py-3 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {positions.map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-md text-sm ${COLOR_MAP[p.color] || COLOR_MAP.blue}`}>
                        <span className={`w-2 h-2 rounded-full ${DOT_MAP[p.color] || DOT_MAP.blue}`} />
                        {p.name}
                      </span>
                      {p.staff_count > 0 && <span className="ml-2 text-xs text-muted-foreground">{p.staff_count} прац.</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-sm truncate">{describePerms(p)}</td>
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

      <PositionDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} initial={editing} />
    </AppLayout>
  );
}
