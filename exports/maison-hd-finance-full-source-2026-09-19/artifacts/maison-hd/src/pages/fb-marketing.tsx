import { useState, useEffect } from "react";
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
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Megaphone, Plus, Pencil, Trash2, Loader2, CheckCircle2, Clock, XCircle,
  Users, Tag, Star, Search, TrendingUp, Gift, Percent,
  Users2, Crown, Ban, FolderX, PackageX, Save, X, ArrowRight,
  Phone, CreditCard,
} from "lucide-react";
import { format, isAfter, isBefore, parseISO } from "date-fns";
import { uk } from "date-fns/locale";

// ─── API ──────────────────────────────────────────────────────────────────────
const API_MKT = "/api/fb/marketing";
const API_FB = "/api/fb";

async function apiMkt(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API_MKT}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

async function apiFb(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API_FB}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// ─── Group colors ─────────────────────────────────────────────────────────────
const GROUP_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#64748b"];

// ─── Promo status ─────────────────────────────────────────────────────────────
function promoStatus(p: any) {
  const now = new Date();
  if (!p.is_active) return { label: "Вимкнено", cls: "bg-slate-100 text-slate-600", icon: XCircle };
  const start = p.start_date ? parseISO(p.start_date) : null;
  const end = p.end_date ? parseISO(p.end_date) : null;
  if (start && isBefore(now, start)) return { label: "Заплановано", cls: "bg-blue-100 text-blue-700", icon: Clock };
  if (end && isAfter(now, end)) return { label: "Завершено", cls: "bg-slate-100 text-slate-500", icon: XCircle };
  return { label: "Активна", cls: "bg-green-100 text-green-700", icon: CheckCircle2 };
}

// ─── PromoDialog ──────────────────────────────────────────────────────────────
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
      if (initial?.id) return apiMkt(`/promotions/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiMkt("/promotions", { method: "POST", body: JSON.stringify(body) });
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

// ─── ClientDialog ─────────────────────────────────────────────────────────────
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
      const body = { name, phone: phone || null, email: email || null, card_number: card || null, group_id: groupId ? parseInt(groupId) : null, notes: notes || null, bonus_balance: parseFloat(bonus) || 0 };
      if (initial?.id) return apiMkt(`/clients/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiMkt("/clients", { method: "POST", body: JSON.stringify(body) });
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

// ─── ClientGroupDialog ────────────────────────────────────────────────────────
function ClientGroupDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: any }) {
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
      const body = { name, bonus_pct: parseFloat(bonusPct) || 0, discount_pct: parseFloat(discountPct) || 0, min_purchase: parseFloat(minPurchase) || 0, color, is_default: isDefault };
      if (initial?.id) return apiMkt(`/client-groups/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiMkt("/client-groups", { method: "POST", body: JSON.stringify(body) });
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
            <input type="checkbox" id="grp_is_default" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="rounded" />
            <Label htmlFor="grp_is_default">Група за замовчуванням для нових клієнтів</Label>
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

// ─── Tab: Акції ────────────────────────────────────────────────────────────────
function PromotionsTab() {
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["fb-promotions"], queryFn: () => apiMkt("/promotions") });
  const promotions: any[] = (data?.promotions || []).filter((p: any) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );
  const active = promotions.filter(p => promoStatus(p).label === "Активна").length;
  const planned = promotions.filter(p => promoStatus(p).label === "Заплановано").length;

  const del = useMutation({
    mutationFn: (id: number) => apiMkt(`/promotions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-promotions"] }); setDeletingId(null); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, val }: { id: number; val: boolean }) => apiMkt(`/promotions/${id}`, { method: "PATCH", body: JSON.stringify({ is_active: val }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-promotions"] }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-3 gap-4 p-5 border-b bg-muted/20">
        <div className="bg-background border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0"><Megaphone className="w-5 h-5 text-orange-600" /></div>
          <div><div className="text-xs text-muted-foreground">Всього акцій</div><div className="text-xl font-bold">{promotions.length}</div></div>
        </div>
        <div className="bg-background border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
          <div><div className="text-xs text-muted-foreground">Активних</div><div className="text-xl font-bold text-green-600">{active}</div></div>
        </div>
        <div className="bg-background border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0"><Clock className="w-5 h-5 text-blue-600" /></div>
          <div><div className="text-xs text-muted-foreground">Заплановано</div><div className="text-xl font-bold text-blue-600">{planned}</div></div>
        </div>
      </div>
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-background">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук акцій..." className="pl-8 h-8 text-sm" />
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setDialog(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Нова акція
        </Button>
      </div>
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
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${parseFloat(p.bonus_multiplier) > 1 ? "bg-amber-100 text-amber-800" : "text-muted-foreground"}`}>{parseFloat(p.bonus_multiplier)}×</span>
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
                        <button onClick={() => { setEditing(p); setDialog(true); }} className="p-1.5 text-muted-foreground hover:text-primary rounded"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDeletingId(p.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 className="w-4 h-4" /></button>
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
    queryFn: () => apiMkt(`/clients?${params}`),
  });
  const { data: groupsData } = useQuery({
    queryKey: ["fb-client-groups"],
    queryFn: () => apiMkt("/client-groups"),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiMkt(`/clients/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-clients"] }); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const clients: any[] = data?.clients || [];
  const total: number = data?.total || 0;
  const groups: any[] = groupsData?.groups || [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b bg-background shrink-0 flex items-center gap-3">
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
        <span className="text-xs text-muted-foreground ml-auto">{total} клієнтів</span>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Додати
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Users className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="font-medium">Клієнтів не знайдено</p>
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
                        {c.group_name}{c.bonus_pct > 0 && <span className="opacity-70"> {c.bonus_pct}%</span>}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {parseFloat(c.bonus_balance || "0") > 0
                      ? <span className="font-mono text-amber-600 font-medium">{parseFloat(c.bonus_balance).toFixed(2)} ₴</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium">{parseFloat(c.total_purchases || "0").toFixed(2)} ₴</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setEditing(c); setDialogOpen(true); }} className="p-1.5 text-muted-foreground hover:text-primary rounded"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => del.mutate(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {total > LIMIT && (
        <div className="border-t px-5 py-3 flex items-center justify-between shrink-0 bg-background">
          <span className="text-xs text-muted-foreground">{page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} з {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>←</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * LIMIT >= total}>→</Button>
          </div>
        </div>
      )}
      <ClientDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} initial={editing} groups={groups} />
    </div>
  );
}

// ─── Tab: Групи клієнтів ──────────────────────────────────────────────────────
function GroupsTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["fb-client-groups"],
    queryFn: () => apiMkt("/client-groups"),
  });
  const del = useMutation({
    mutationFn: (id: number) => apiMkt(`/client-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-client-groups"] }); toast({ title: "Групу видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const groups: any[] = (data?.groups || []).sort((a: any, b: any) => a.min_purchase - b.min_purchase);

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b bg-background shrink-0 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{groups.length} груп</span>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Додати
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Users2 className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="font-medium">Групи не налаштовано</p>
            <p className="text-sm text-muted-foreground mt-1">Додайте першу групу клієнтів</p>
            <Button className="mt-4" size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Додати групу
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 max-w-2xl">
            {groups.map((g: any) => (
              <div key={g.id} className="border rounded-xl p-4 bg-card flex items-center gap-4">
                <div className="w-10 h-10 rounded-full shrink-0" style={{ backgroundColor: g.color || "#6366f1" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{g.name}</span>
                    {g.is_default && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">за замовч.</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    {g.bonus_pct > 0 && <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" /> Бонус {g.bonus_pct}%</span>}
                    {g.discount_pct > 0 && <span className="flex items-center gap-1"><Tag className="w-3 h-3 text-green-600" /> Знижка {g.discount_pct}%</span>}
                    {g.min_purchase > 0 && <span>Від {parseFloat(g.min_purchase).toFixed(0)} ₴</span>}
                    <span className="ml-auto flex items-center gap-1"><Users2 className="w-3 h-3" />{g.client_count} клієнтів</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditing(g); setDialogOpen(true); }} className="p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-muted"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => del.mutate(g.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ClientGroupDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} initial={editing} />
    </div>
  );
}

// ─── Tab: Лояльність ──────────────────────────────────────────────────────────
interface Transition { from_amount: number; group_id: number; }

function LoyaltyTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ["fb-loyalty-settings"],
    queryFn: () => apiMkt("/loyalty-settings"),
  });
  const { data: groupsData } = useQuery({
    queryKey: ["fb-client-groups"],
    queryFn: () => apiMkt("/client-groups"),
  });

  const [bonusEnabled, setBonusEnabled] = useState(true);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [maxBonusPct, setMaxBonusPct] = useState("50");
  const [welcomeBonus, setWelcomeBonus] = useState("0");
  const [smsOnOrder, setSmsOnOrder] = useState(false);
  const [bonusTransitions, setBonusTransitions] = useState<Transition[]>([]);
  const [discountTransitions, setDiscountTransitions] = useState<Transition[]>([]);

  useEffect(() => {
    if (settingsData?.settings) {
      const s = settingsData.settings;
      setBonusEnabled(s.bonus_enabled ?? true);
      setDiscountEnabled(s.discount_enabled ?? false);
      setMaxBonusPct(String(s.max_bonus_pct ?? "50"));
      setWelcomeBonus(String(s.welcome_bonus ?? "0"));
      setSmsOnOrder(s.sms_on_order ?? false);
      setBonusTransitions(s.bonus_transitions || []);
      setDiscountTransitions(s.discount_transitions || []);
    }
  }, [settingsData]);

  const groups: any[] = groupsData?.groups || [];

  const save = useMutation({
    mutationFn: () => apiMkt("/loyalty-settings", {
      method: "PUT",
      body: JSON.stringify({ bonus_enabled: bonusEnabled, discount_enabled: discountEnabled, max_bonus_pct: parseFloat(maxBonusPct) || 50, welcome_bonus: parseFloat(welcomeBonus) || 0, sms_on_order: smsOnOrder, bonus_transitions: bonusTransitions, discount_transitions: discountTransitions }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-loyalty-settings"] }); toast({ title: "Налаштування збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b bg-background shrink-0 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />} Зберегти
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-5 space-y-6 max-w-2xl">
        <div className="border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b bg-muted/30 flex items-center gap-3">
            <Switch checked={bonusEnabled} onCheckedChange={setBonusEnabled} />
            <div>
              <h2 className="font-semibold flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" /> Бонусна система</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Клієнти накопичують бонуси та оплачують ними замовлення</p>
            </div>
          </div>
          {bonusEnabled && (
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Максимальний % оплати бонусами</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input type="number" min="0" max="100" value={maxBonusPct} onChange={e => setMaxBonusPct(e.target.value)} className="w-24" />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
                <div>
                  <Label>Привітальний бонус, ₴</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input type="number" min="0" step="0.01" value={welcomeBonus} onChange={e => setWelcomeBonus(e.target.value)} className="w-24" />
                    <span className="text-sm text-muted-foreground">₴</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Label>Переходи між групами</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">При досягненні суми покупок клієнт переходить у вищу групу</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setBonusTransitions(t => [...t, { from_amount: 0, group_id: groups[0]?.id || 0 }])} disabled={groups.length === 0}>
                    <Plus className="w-3 h-3 mr-1" /> Додати
                  </Button>
                </div>
                {groups.length === 0 ? (
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">Спочатку додайте групи клієнтів</p>
                ) : bonusTransitions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Переходи не налаштовано</p>
                ) : (
                  <div className="space-y-2">
                    {bonusTransitions.map((t, i) => (
                      <div key={i} className="flex items-center gap-2 bg-muted/20 rounded-lg p-2">
                        <span className="text-xs text-muted-foreground shrink-0">Від</span>
                        <Input type="number" min="0" value={t.from_amount}
                          onChange={e => setBonusTransitions(tr => tr.map((item, j) => j === i ? { ...item, from_amount: parseFloat(e.target.value) || 0 } : item))}
                          className="h-8 w-24 text-sm" />
                        <span className="text-xs text-muted-foreground shrink-0">₴ → група</span>
                        <select value={t.group_id} onChange={e => setBonusTransitions(tr => tr.map((item, j) => j === i ? { ...item, group_id: parseInt(e.target.value) } : item))}
                          className="flex-1 h-8 border rounded-md px-2 text-sm bg-background">
                          {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.bonus_pct}%)</option>)}
                        </select>
                        <button onClick={() => setBonusTransitions(t => t.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-start gap-3 pt-2 border-t">
                <Switch checked={smsOnOrder} onCheckedChange={setSmsOnOrder} className="mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium">Надсилати SMS після оплати замовлення</div>
                  <div className="text-xs text-muted-foreground">SMS оплачуються окремо, 1.26 грн. за кожні 70 символів</div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b bg-muted/30 flex items-center gap-3">
            <Switch checked={discountEnabled} onCheckedChange={setDiscountEnabled} />
            <div>
              <h2 className="font-semibold flex items-center gap-2"><Tag className="w-4 h-4 text-green-600" /> Знижкова система</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Клієнти отримують знижку від суми чека</p>
            </div>
          </div>
          {discountEnabled && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Label>Переходи між групами</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">При досягненні суми клієнт отримує вищу знижку</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setDiscountTransitions(t => [...t, { from_amount: 0, group_id: groups[0]?.id || 0 }])} disabled={groups.length === 0}>
                  <Plus className="w-3 h-3 mr-1" /> Додати
                </Button>
              </div>
              {groups.length === 0 ? (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">Спочатку додайте групи клієнтів</p>
              ) : discountTransitions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Переходи не налаштовано</p>
              ) : (
                <div className="space-y-2">
                  {discountTransitions.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 bg-muted/20 rounded-lg p-2">
                      <span className="text-xs text-muted-foreground shrink-0">Від</span>
                      <Input type="number" min="0" value={t.from_amount}
                        onChange={e => setDiscountTransitions(tr => tr.map((item, j) => j === i ? { ...item, from_amount: parseFloat(e.target.value) || 0 } : item))}
                        className="h-8 w-24 text-sm" />
                      <span className="text-xs text-muted-foreground shrink-0">₴ → група</span>
                      <select value={t.group_id} onChange={e => setDiscountTransitions(tr => tr.map((item, j) => j === i ? { ...item, group_id: parseInt(e.target.value) } : item))}
                        className="flex-1 h-8 border rounded-md px-2 text-sm bg-background">
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.discount_pct}%)</option>)}
                      </select>
                      <button onClick={() => setDiscountTransitions(t => t.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Винятки ─────────────────────────────────────────────────────────────
function ExceptionsTab() {
  const [selCat, setSelCat] = useState("");
  const [selItem, setSelItem] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: exData, isLoading } = useQuery({
    queryKey: ["fb-exceptions"],
    queryFn: () => apiMkt("/loyalty-exceptions"),
  });
  const { data: catData } = useQuery({
    queryKey: ["fb-categories"],
    queryFn: () => apiFb("/categories"),
  });
  const { data: itemData } = useQuery({
    queryKey: ["fb-items-all"],
    queryFn: () => apiFb("/items"),
  });

  const exceptions: any[] = exData?.exceptions || [];
  const catExceptions = exceptions.filter(e => e.exception_type === "category");
  const itemExceptions = exceptions.filter(e => e.exception_type === "item");
  const categories: any[] = catData?.categories || [];
  const items: any[] = itemData?.items || [];

  const addCat = useMutation({
    mutationFn: () => {
      const cat = categories.find(c => String(c.id) === selCat);
      if (!cat) throw new Error("Оберіть категорію");
      return apiMkt("/loyalty-exceptions", { method: "POST", body: JSON.stringify({ exception_type: "category", ref_id: cat.id, name: cat.name }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-exceptions"] }); setSelCat(""); toast({ title: "Категорію додано до винятків" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const addItem = useMutation({
    mutationFn: () => {
      const item = items.find(i => String(i.id) === selItem);
      if (!item) throw new Error("Оберіть товар");
      return apiMkt("/loyalty-exceptions", { method: "POST", body: JSON.stringify({ exception_type: "item", ref_id: item.id, name: item.name, category_name: item.category_name }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-exceptions"] }); setSelItem(""); toast({ title: "Товар додано до винятків" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiMkt(`/loyalty-exceptions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-exceptions"] }); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex-1 overflow-auto p-5 space-y-6 max-w-2xl">
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/30 flex items-center gap-3">
              <FolderX className="w-5 h-5 text-muted-foreground" />
              <div>
                <h2 className="font-semibold">Категорії-винятки <span className="text-muted-foreground font-normal ml-1">{catExceptions.length}</span></h2>
                <p className="text-xs text-muted-foreground mt-0.5">Категорії товарів, на які не поширюються бонуси та знижки</p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <select value={selCat} onChange={e => setSelCat(e.target.value)}
                  className="flex-1 border rounded-md px-3 py-2 text-sm bg-background">
                  <option value="">Оберіть категорію...</option>
                  {categories.filter((c: any) => !catExceptions.find(e => e.ref_id === c.id))
                    .map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Button variant="outline" onClick={() => addCat.mutate()} disabled={!selCat || addCat.isPending}>
                  {addCat.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span className="ml-1">Додати</span>
                </Button>
              </div>
              {catExceptions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Категорій-винятків немає</p>
              ) : (
                <div className="divide-y border rounded-lg overflow-hidden">
                  {catExceptions.map(e => (
                    <div key={e.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/20">
                      <span className="text-sm font-medium">{e.name}</span>
                      <button onClick={() => del.mutate(e.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/30 flex items-center gap-3">
              <PackageX className="w-5 h-5 text-muted-foreground" />
              <div>
                <h2 className="font-semibold">Товари-винятки <span className="text-muted-foreground font-normal ml-1">{itemExceptions.length}</span></h2>
                <p className="text-xs text-muted-foreground mt-0.5">Товари та тех. картки, на які не поширюються бонуси та знижки</p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <select value={selItem} onChange={e => setSelItem(e.target.value)}
                  className="flex-1 border rounded-md px-3 py-2 text-sm bg-background">
                  <option value="">Оберіть товар...</option>
                  {items.filter((i: any) => !itemExceptions.find(e => e.ref_id === i.id))
                    .map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <Button variant="outline" onClick={() => addItem.mutate()} disabled={!selItem || addItem.isPending}>
                  {addItem.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span className="ml-1">Додати</span>
                </Button>
              </div>
              {itemExceptions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Товарів-винятків немає</p>
              ) : (
                <div className="divide-y border rounded-lg overflow-hidden">
                  {itemExceptions.map(e => (
                    <div key={e.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/20">
                      <div>
                        <span className="text-sm font-medium">{e.name}</span>
                        {e.category_name && <span className="text-xs text-muted-foreground ml-2">{e.category_name}</span>}
                      </div>
                      <button onClick={() => del.mutate(e.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: "promotions", label: "Акції" },
  { id: "clients",    label: "Клієнти" },
  { id: "groups",     label: "Групи клієнтів" },
  { id: "loyalty",    label: "Лояльність" },
  { id: "exceptions", label: "Винятки" },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FbMarketing() {
  const [tab, setTab] = useState<TabId>("promotions");

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center gap-3">
          <Megaphone className="w-5 h-5 text-orange-600 shrink-0" />
          <div>
            <h1 className="text-lg font-bold">Маркетинг</h1>
            <p className="text-xs text-muted-foreground">Акції, клієнти, лояльність та винятки</p>
          </div>
        </div>

        <div className="border-b bg-background shrink-0 overflow-x-auto">
          <div className="flex px-4 min-w-max">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {tab === "promotions"  && <PromotionsTab />}
          {tab === "clients"     && <ClientsTab />}
          {tab === "groups"      && <GroupsTab />}
          {tab === "loyalty"     && <LoyaltyTab />}
          {tab === "exceptions"  && <ExceptionsTab />}
        </div>
      </div>
    </AppLayout>
  );
}
