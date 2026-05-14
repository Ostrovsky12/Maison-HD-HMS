import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import {
  Megaphone, Plus, Pencil, Trash2, Loader2, CheckCircle2, Clock, XCircle,
  Users, Tag, Star, Search, Filter, TrendingUp, Gift, Percent,
} from "lucide-react";
import { format, isAfter, isBefore, parseISO } from "date-fns";
import { uk } from "date-fns/locale";

// ─── API ──────────────────────────────────────────────────────────────────────
const BASE = "/api/fb/marketing";
async function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}


// ─── Status helper ────────────────────────────────────────────────────────────
function promoStatus(p: any) {
  const now = new Date();
  if (!p.is_active) return { label: "Вимкнено", cls: "bg-slate-100 text-slate-600", icon: XCircle };
  const start = p.start_date ? parseISO(p.start_date) : null;
  const end = p.end_date ? parseISO(p.end_date) : null;
  if (start && isBefore(now, start)) return { label: "Заплановано", cls: "bg-blue-100 text-blue-700", icon: Clock };
  if (end && isAfter(now, end)) return { label: "Завершено", cls: "bg-slate-100 text-slate-500", icon: XCircle };
  return { label: "Активна", cls: "bg-green-100 text-green-700", icon: CheckCircle2 };
}

// ─── Promo Dialog ─────────────────────────────────────────────────────────────
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
      const body = { name, start_date: startDate || null, end_date: endDate || null, bonus_multiplier: parseFloat(bonusMult) || 1, discount_pct: parseFloat(discountPct) || 0, notes: notes || null };
      if (initial?.id) return api(`/promotions/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return api("/promotions", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-promotions"] }); toast({ title: "Збережено" }); onClose(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати акцію" : "Нова акція"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div>
            <Label>Назва *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Наприклад: Літній розпродаж -20%" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Початок</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1" /></div>
            <div><Label>Кінець</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Множник бонусів</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" min="1" step="0.5" value={bonusMult} onChange={e => setBonusMult(e.target.value)} className="w-24" />
                <span className="text-sm text-muted-foreground">×</span>
              </div>
            </div>
            <div>
              <Label>Знижка, %</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" min="0" max="100" step="0.5" value={discountPct} onChange={e => setDiscountPct(e.target.value)} className="w-24" />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <div><Label>Примітка</Label><Input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" placeholder="Необов'язково" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: Акції ────────────────────────────────────────────────────────────────
function PromotionsTab() {
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["fb-promotions"], queryFn: () => api("/promotions") });
  const promotions: any[] = (data?.promotions || []).filter((p: any) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const active = promotions.filter(p => promoStatus(p).label === "Активна").length;
  const planned = promotions.filter(p => promoStatus(p).label === "Заплановано").length;

  const del = useMutation({
    mutationFn: (id: number) => api(`/promotions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-promotions"] }); setDeletingId(null); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, val }: { id: number; val: boolean }) => api(`/promotions/${id}`, { method: "PATCH", body: JSON.stringify({ is_active: val }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-promotions"] }),
  });

  return (
    <div className="flex flex-col h-full">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 p-5 border-b bg-muted/20">
        <div className="bg-background border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Всього акцій</div>
            <div className="text-xl font-bold">{promotions.length}</div>
          </div>
        </div>
        <div className="bg-background border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Активних</div>
            <div className="text-xl font-bold text-green-600">{active}</div>
          </div>
        </div>
        <div className="bg-background border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Заплановано</div>
            <div className="text-xl font-bold text-blue-600">{planned}</div>
          </div>
        </div>
      </div>

      {/* Search + Add */}
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-background">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук акцій..." className="pl-8 h-8 text-sm" />
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setDialog(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Нова акція
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>
        ) : promotions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
            <Megaphone className="w-12 h-12 opacity-20 mb-3" />
            <p className="font-medium">{search ? "Нічого не знайдено" : "Акцій ще немає"}</p>
            {!search && <Button className="mt-4" size="sm" onClick={() => { setEditing(null); setDialog(true); }}><Plus className="w-4 h-4 mr-1" /> Створити першу акцію</Button>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b sticky top-0">
              <tr className="text-[11px] text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-medium">Назва</th>
                <th className="text-left px-4 py-3 font-medium">Початок</th>
                <th className="text-left px-4 py-3 font-medium">Кінець</th>
                <th className="text-center px-4 py-3 font-medium">Бонуси</th>
                <th className="text-center px-4 py-3 font-medium">Знижка</th>
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-right px-4 py-3 font-medium w-32">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {promotions.map((p: any) => {
                const s = promoStatus(p);
                const SIcon = s.icon;
                return (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.start_date ? format(parseISO(p.start_date), "dd MMM yyyy", { locale: uk }) : "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.end_date ? format(parseISO(p.end_date), "dd MMM yyyy", { locale: uk }) : "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${parseFloat(p.bonus_multiplier) > 1 ? "bg-amber-100 text-amber-800" : "text-muted-foreground"}`}>
                        {parseFloat(p.bonus_multiplier)}×
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {parseFloat(p.discount_pct) > 0
                        ? <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded">{parseFloat(p.discount_pct)}%</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${s.cls}`}>
                        <SIcon className="w-3 h-3" /> {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end items-center gap-1">
                        <Switch checked={!!p.is_active} onCheckedChange={val => toggle.mutate({ id: p.id, val })} />
                        <button onClick={() => { setEditing(p); setDialog(true); }} className="p-1.5 text-muted-foreground hover:text-primary rounded">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeletingId(p.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded">
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

      <PromoDialog open={dialog} onClose={() => { setDialog(false); setEditing(null); }} initial={editing} />
      <AlertDialog open={!!deletingId} onOpenChange={v => !v && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити акцію?</AlertDialogTitle>
            <AlertDialogDescription>Цю дію неможливо скасувати.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deletingId && del.mutate(deletingId)}>Видалити</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Tab: Клієнти ─────────────────────────────────────────────────────────────
function ClientsTab() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["fb-clients-mkt"], queryFn: () => api("/clients") });
  const clients: any[] = (data?.clients || []).filter((c: any) =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-3 gap-4 p-5 border-b bg-muted/20">
        <div className="bg-background border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center shrink-0"><Users className="w-5 h-5 text-violet-600" /></div>
          <div><div className="text-xs text-muted-foreground">Всього клієнтів</div><div className="text-xl font-bold">{clients.length}</div></div>
        </div>
        <div className="bg-background border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0"><Star className="w-5 h-5 text-amber-600" /></div>
          <div><div className="text-xs text-muted-foreground">З бонусами</div><div className="text-xl font-bold">{clients.filter((c: any) => parseFloat(c.bonus_balance || 0) > 0).length}</div></div>
        </div>
        <div className="bg-background border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0"><TrendingUp className="w-5 h-5 text-green-600" /></div>
          <div><div className="text-xs text-muted-foreground">Заг. бонуси</div><div className="text-xl font-bold">{clients.reduce((s: number, c: any) => s + parseFloat(c.bonus_balance || 0), 0).toFixed(0)}</div></div>
        </div>
      </div>
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-background">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук по імені або телефону..." className="pl-8 h-8 text-sm" />
        </div>
        <a href="/fb/clients" className="text-sm text-primary hover:underline">Відкрити повну сторінку →</a>
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
            <Users className="w-12 h-12 opacity-20 mb-3" />
            <p className="font-medium">{search ? "Нічого не знайдено" : "Клієнтів ще немає"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b sticky top-0">
              <tr className="text-[11px] text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-medium">Клієнт</th>
                <th className="text-left px-4 py-3 font-medium">Телефон</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-right px-4 py-3 font-medium">Бонуси</th>
                <th className="text-right px-4 py-3 font-medium">Продажі</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {clients.slice(0, 50).map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3">
                    <div className="font-medium">{c.name || "—"}</div>
                    {c.group_name && <div className="text-[10px] text-muted-foreground">{c.group_name}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{c.phone || "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {parseFloat(c.bonus_balance || 0) > 0
                      ? <span className="text-amber-700 font-semibold">{parseFloat(c.bonus_balance).toFixed(0)} б</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm">{parseFloat(c.total_spent || 0).toFixed(0)} ₴</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Лояльність ──────────────────────────────────────────────────────────
function LoyaltyTab() {
  const loyaltyQ = useQuery({ queryKey: ["fb-loyalty-settings-mkt"], queryFn: () => api("/loyalty-settings") });
  const groupsQ = useQuery({ queryKey: ["fb-client-groups-mkt"], queryFn: () => api("/client-groups") });
  const isLoading = loyaltyQ.isLoading || groupsQ.isLoading;
  const programs: any[] = loyaltyQ.data ? [loyaltyQ.data] : [];
  const groups: any[] = groupsQ.data?.groups || [];

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-2 gap-4 p-5 border-b bg-muted/20">
        <div className="bg-background border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0"><Star className="w-5 h-5 text-amber-600" /></div>
          <div><div className="text-xs text-muted-foreground">Програм лояльності</div><div className="text-xl font-bold">{programs.length}</div></div>
        </div>
        <div className="bg-background border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center shrink-0"><Tag className="w-5 h-5 text-violet-600" /></div>
          <div><div className="text-xs text-muted-foreground">Груп клієнтів</div><div className="text-xl font-bold">{groups.length}</div></div>
        </div>
      </div>
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-background">
        <a href="/fb/loyalty" className="text-sm text-primary hover:underline">Налаштувати програми лояльності →</a>
        <a href="/fb/client-groups" className="text-sm text-primary hover:underline ml-4">Групи клієнтів →</a>
      </div>
      <div className="flex-1 overflow-auto p-5 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {programs.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Gift className="w-4 h-4 text-amber-500" /> Програми нарахування бонусів</h3>
                <div className="space-y-2">
                  {programs.map((p: any) => (
                    <div key={p.id} className="border rounded-xl p-4 flex items-center justify-between bg-background hover:shadow-sm transition-shadow">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{p.description || "Без опису"}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        {p.bonus_pct > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{p.bonus_pct}% бонусів</Badge>}
                        {p.discount_pct > 0 && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">−{p.discount_pct}%</Badge>}
                        <Badge className={p.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}>{p.is_active ? "Активна" : "Вимкнена"}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {groups.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Tag className="w-4 h-4 text-violet-500" /> Групи клієнтів</h3>
                <div className="grid grid-cols-2 gap-3">
                  {groups.map((g: any) => (
                    <div key={g.id} className="border rounded-xl p-4 bg-background">
                      <div className="font-medium">{g.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{g.client_count || 0} клієнтів</div>
                      {g.discount_pct > 0 && <div className="text-xs text-green-700 mt-1">Знижка −{g.discount_pct}%</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {programs.length === 0 && groups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                <Star className="w-12 h-12 opacity-20 mb-3" />
                <p className="font-medium">Програм лояльності ще немає</p>
                <a href="/fb/loyalty" className="text-sm text-primary hover:underline mt-2">Налаштувати →</a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "promotions", label: "Акції", icon: Megaphone },
  { id: "clients", label: "Клієнти", icon: Users },
  { id: "loyalty", label: "Лояльність і групи", icon: Star },
] as const;

export default function FbMarketing() {
  const [tab, setTab] = useState<"promotions" | "clients" | "loyalty">("promotions");

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Маркетинг</h1>
              <p className="text-xs text-muted-foreground">Акції, клієнти, програми лояльності та бонуси</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 border-b -mb-[17px]">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {tab === "promotions" && <PromotionsTab />}
          {tab === "clients" && <ClientsTab />}
          {tab === "loyalty" && <LoyaltyTab />}
        </div>
      </div>
    </AppLayout>
  );
}
