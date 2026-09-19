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
  Users, Plus, Pencil, Trash2, Loader2, Search,
  Phone, CreditCard, Star, TrendingUp, UserCheck,
} from "lucide-react";

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

// ─── Client Dialog ─────────────────────────────────────────────────────────────
function ClientDialog({ open, onClose, initial, groups }: { open: boolean; onClose: () => void; initial?: any; groups: any[] }) {
  const [name, setName] = useState(initial?.name || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [card, setCard] = useState(initial?.card_number || "");
  const [groupId, setGroupId] = useState(String(initial?.group_id || ""));
  const [notes, setNotes] = useState(initial?.notes || "");
  const [bonus, setBonus] = useState(String(initial?.bonus_balance || "0"));
  const { toast } = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => {
      const body = { name, phone: phone||null, email: email||null, card_number: card||null, group_id: groupId ? parseInt(groupId) : null, notes: notes||null, bonus_balance: parseFloat(bonus)||0 };
      if (initial?.id) return apiFetch(`/clients/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiFetch("/clients", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-clients"] }); toast({ title: initial?.id ? "Збережено" : "Клієнта додано" }); onClose(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати клієнта" : "Новий клієнт"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>ПІБ *</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Телефон</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+380..." className="mt-1" /></div>
            <div><Label>Номер карти</Label><Input value={card} onChange={e => setCard(e.target.value)} className="mt-1" /></div>
          </div>
          <div><Label>Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} type="email" className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Група</Label>
              <select value={groupId} onChange={e => setGroupId(e.target.value)}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background">
                <option value="">— без групи —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div><Label>Бонусний баланс, ₴</Label><Input type="number" step="0.01" value={bonus} onChange={e => setBonus(e.target.value)} className="mt-1" /></div>
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

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function FbClients() {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [page, setPage] = useState(0);
  const { toast } = useToast();
  const qc = useQueryClient();
  const LIMIT = 50;

  const params = new URLSearchParams({ limit: String(LIMIT), offset: String(page * LIMIT) });
  if (search) params.set("search", search);
  if (groupFilter !== "all") params.set("group_id", groupFilter);

  const { data, isLoading } = useQuery({
    queryKey: ["fb-clients", search, groupFilter, page],
    queryFn: () => apiFetch(`/clients?${params}`),
  });
  const { data: groupsData } = useQuery({
    queryKey: ["fb-client-groups"],
    queryFn: () => apiFetch("/client-groups"),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/clients/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-clients"] }); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const clients: any[] = data?.clients || [];
  const total: number = data?.total || 0;
  const groups: any[] = groupsData?.groups || [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-violet-600" />
              <div>
                <h1 className="text-lg font-bold">Клієнти</h1>
                <p className="text-xs text-muted-foreground">{total} клієнтів</p>
              </div>
            </div>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Додати
            </Button>
          </div>

          <div className="flex gap-2 mt-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Пошук за ПІБ, телефоном, картою..."
                value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="pl-8 h-8 text-sm" />
            </div>
            <select value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setPage(0); }}
              className="border rounded-md px-3 py-1.5 text-sm bg-background h-8">
              <option value="all">Всі групи</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Users className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Клієнтів не знайдено</p>
              <p className="text-sm text-muted-foreground mt-1">Додайте першого клієнта або змініть фільтр</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">ПІБ</th>
                  <th className="text-left px-4 py-3 font-medium">Номер карти</th>
                  <th className="text-left px-4 py-3 font-medium">Телефон</th>
                  <th className="text-left px-4 py-3 font-medium">Група</th>
                  <th className="text-right px-4 py-3 font-medium">Бонуси</th>
                  <th className="text-right px-4 py-3 font-medium">Сума покупок</th>
                  <th className="text-right px-4 py-3 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clients.map((c: any) => (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.card_number || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.phone || "—"}</td>
                    <td className="px-4 py-3">
                      {c.group_name ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full font-medium">
                          {c.group_name}
                          {c.bonus_pct > 0 && <span className="opacity-70">{c.bonus_pct}%</span>}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {parseFloat(c.bonus_balance || "0") > 0 ? (
                        <span className="font-mono text-amber-600 font-medium">{parseFloat(c.bonus_balance).toFixed(2)} ₴</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      {parseFloat(c.total_purchases || "0").toFixed(2)} ₴
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(c); setDialogOpen(true); }}
                          className="p-1.5 text-muted-foreground hover:text-primary rounded">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => del.mutate(c.id)}
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

        {total > LIMIT && (
          <div className="border-t px-6 py-3 flex items-center justify-between shrink-0">
            <span className="text-xs text-muted-foreground">{page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} з {total}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>←</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * LIMIT >= total}>→</Button>
            </div>
          </div>
        )}
      </div>

      <ClientDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} initial={editing} groups={groups} />
    </AppLayout>
  );
}
