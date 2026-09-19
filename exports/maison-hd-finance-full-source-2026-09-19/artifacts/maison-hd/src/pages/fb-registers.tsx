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
import { Monitor, Smartphone, Plus, Pencil, Trash2, Loader2, Eye, EyeOff, LogOut } from "lucide-react";

const API_ACCESS = "/api/fb/access";
const API_FB = "/api/fb";
async function apiFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

const TYPE_MAP = {
  standard: { label: "Стандартна", icon: Monitor, cls: "bg-blue-100 text-blue-700" },
  mobile: { label: "Мобільна", icon: Smartphone, cls: "bg-green-100 text-green-700" },
};

function RegisterDialog({ open, onClose, initial, outlets }: {
  open: boolean; onClose: () => void; initial?: any; outlets: any[];
}) {
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState(initial?.register_type || "standard");
  const [outletId, setOutletId] = useState(String(initial?.outlet_id || ""));
  const [login, setLogin] = useState(initial?.login || "");
  const [password, setPassword] = useState(initial?.password || "");
  const [showPass, setShowPass] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => {
      const body = { name, register_type: type, outlet_id: outletId ? parseInt(outletId) : null, login: login || null, password: password || null };
      if (initial?.id) return apiFetch(`${API_ACCESS}/registers/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiFetch(`${API_ACCESS}/registers`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-registers"] }); toast({ title: "Збережено" }); onClose(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати касу" : "Нова каса"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Назва *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder='Каса у "Ресторан"' className="mt-1" /></div>
          <div>
            <Label>Тип</Label>
            <div className="flex gap-2 mt-1">
              {Object.entries(TYPE_MAP).map(([k, v]) => {
                const Icon = v.icon;
                return (
                  <button key={k} onClick={() => setType(k)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${type === k ? "border-primary bg-primary/5 text-primary" : "border-input hover:bg-muted/50"}`}>
                    <Icon className="w-4 h-4" /> {v.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Заклад</Label>
            <select value={outletId} onChange={e => setOutletId(e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background">
              <option value="">— виберіть заклад —</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Логін</Label><Input value={login} onChange={e => setLogin(e.target.value)} className="mt-1" /></div>
            <div>
              <Label>Пароль</Label>
              <div className="relative mt-1">
                <Input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} className="pr-8" />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
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

export default function FbRegisters() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [showPassFor, setShowPassFor] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["fb-registers"],
    queryFn: () => apiFetch(`${API_ACCESS}/registers`),
  });
  const { data: outletsData } = useQuery({
    queryKey: ["fb-outlets"],
    queryFn: () => apiFetch(`${API_FB}/outlets`),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`${API_ACCESS}/registers/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-registers"] }); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const registers: any[] = data?.registers || [];
  const outlets: any[] = outletsData?.outlets || [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Monitor className="w-6 h-6 text-slate-600" />
            <div>
              <h1 className="text-lg font-bold">Каси</h1>
              <p className="text-xs text-muted-foreground">{registers.length} кас</p>
            </div>
          </div>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Додати
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : registers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Monitor className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Кас немає</p>
              <p className="text-sm text-muted-foreground mt-1">Додайте першу касу для точки продажу</p>
              <Button className="mt-4" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Нова каса
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 font-medium">Назва</th>
                  <th className="text-left px-4 py-3 font-medium">Тип</th>
                  <th className="text-left px-4 py-3 font-medium">Заклад</th>
                  <th className="text-left px-4 py-3 font-medium">Логін</th>
                  <th className="text-left px-4 py-3 font-medium">Пароль</th>
                  <th className="text-right px-4 py-3 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {registers.map((r: any) => {
                  const typeInfo = TYPE_MAP[r.register_type as keyof typeof TYPE_MAP] || TYPE_MAP.standard;
                  const TypeIcon = typeInfo.icon;
                  return (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground">{r.id}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${r.is_active ? "bg-green-500" : "bg-slate-300"}`} />
                          <span className="font-medium">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md font-medium ${typeInfo.cls}`}>
                          <TypeIcon className="w-3 h-3" /> {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.outlet_name || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.login || "—"}</td>
                      <td className="px-4 py-3">
                        {r.password ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs">{showPassFor === r.id ? r.password : "__REDACTED_FROM_AUDIT_ARCHIVE__"}</span>
                            <button onClick={() => setShowPassFor(showPassFor === r.id ? null : r.id)}
                              className="text-muted-foreground hover:text-primary p-0.5">
                              {showPassFor === r.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button className="text-xs text-muted-foreground hover:text-red-600 px-2 py-1 border rounded">
                            <LogOut className="w-3 h-3 inline mr-0.5" /> Вийти
                          </button>
                          <button onClick={() => { setEditing(r); setDialogOpen(true); }}
                            className="p-1.5 text-muted-foreground hover:text-primary rounded">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => del.mutate(r.id)}
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

      <RegisterDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} initial={editing} outlets={outlets} />
    </AppLayout>
  );
}
