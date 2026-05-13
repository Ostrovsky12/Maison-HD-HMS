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
import { Puzzle, Plus, Trash2, Loader2, Copy, Check, Eye, EyeOff } from "lucide-react";
import { format, parseISO } from "date-fns";
import { uk } from "date-fns/locale";

const API_ACCESS = "/api/fb/access";
const API_FB_STAFF = "/api/fb/staff";
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

function AddIntegrationDialog({ open, onClose, staff }: { open: boolean; onClose: (newToken?: any) => void; staff: any[] }) {
  const [appName, setAppName] = useState("");
  const [staffId, setStaffId] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => {
      const s = staff.find(m => String(m.id) === staffId);
      return apiFetch(`${API_ACCESS}/integrations`, {
        method: "POST",
        body: JSON.stringify({ app_name: appName, staff_id: staffId ? parseInt(staffId) : null, staff_name: s?.name || null }),
      });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["fb-integrations"] });
      toast({ title: "Токен створено" });
      onClose(data.integration);
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Нова інтеграція</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Назва застосунку *</Label><Input value={appName} onChange={e => setAppName(e.target.value)} placeholder="Poster QR, Delivery Bot..." className="mt-1" /></div>
          <div>
            <Label>Працівник</Label>
            <select value={staffId} onChange={e => setStaffId(e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background">
              <option value="">— не прив'язано —</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()}>Скасувати</Button>
          <Button onClick={() => save.mutate()} disabled={!appName.trim() || save.isPending}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Створити токен
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenRevealDialog({ token, onClose }: { token: any; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(token.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Dialog open={!!token} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Токен доступу створено</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Збережіть токен — він більше не буде показаний повністю.</p>
          <div className="bg-muted/40 rounded-lg p-3 font-mono text-xs break-all select-all">{token?.token}</div>
          <Button variant="outline" className="w-full" onClick={copy}>
            {copied ? <><Check className="w-4 h-4 mr-1 text-green-600" /> Скопійовано!</> : <><Copy className="w-4 h-4 mr-1" /> Копіювати</>}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Закрити</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FbIntegrations() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newToken, setNewToken] = useState<any>(null);
  const [showFull, setShowFull] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["fb-integrations"],
    queryFn: () => apiFetch(`${API_ACCESS}/integrations`),
  });
  const { data: staffData } = useQuery({
    queryKey: ["fb-staff-access"],
    queryFn: () => apiFetch(`${API_FB_STAFF}/`),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`${API_ACCESS}/integrations/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-integrations"] }); toast({ title: "Токен видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const integrations: any[] = data?.integrations || [];
  const staff: any[] = staffData?.staff || [];

  function maskToken(t: string) {
    return t.slice(0, 6) + "•".repeat(Math.max(0, t.length - 12)) + t.slice(-6);
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Puzzle className="w-6 h-6 text-slate-600" />
              <div>
                <h1 className="text-lg font-bold">Інтеграція сторонніх застосунків</h1>
                <p className="text-xs text-muted-foreground">
                  Токен доступу — це ключ, за допомогою якого сторонні застосунки працюють з вашим акаунтом через API.
                </p>
              </div>
            </div>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Новий токен
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : integrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Puzzle className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Інтеграцій немає</p>
              <p className="text-sm text-muted-foreground mt-1">Створіть токен для підключення стороннього застосунку</p>
              <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Новий токен
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Працівник</th>
                  <th className="text-left px-4 py-3 font-medium">Застосунок</th>
                  <th className="text-left px-4 py-3 font-medium">Токен доступу</th>
                  <th className="text-right px-4 py-3 font-medium">Дата створення</th>
                  <th className="text-right px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {integrations.map((it: any) => {
                  const dt = it.created_at ? parseISO(it.created_at) : null;
                  const isShown = showFull === it.id;
                  return (
                    <tr key={it.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{it.staff_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{it.app_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {isShown ? it.token : maskToken(it.token)}
                          </span>
                          <button onClick={() => setShowFull(isShown ? null : it.id)}
                            className="text-muted-foreground hover:text-primary p-0.5">
                            {isShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                        {dt ? format(dt, "d MMM yyyy, HH:mm", { locale: uk }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => del.mutate(it.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AddIntegrationDialog open={dialogOpen} onClose={(t) => { setDialogOpen(false); if (t) setNewToken(t); }} staff={staff} />
      {newToken && <TokenRevealDialog token={newToken} onClose={() => setNewToken(null)} />}
    </AppLayout>
  );
}
