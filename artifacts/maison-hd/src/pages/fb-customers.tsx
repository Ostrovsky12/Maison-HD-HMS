import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Users, Plus, Search, Pencil, Trash2, Loader2, X, Check,
  Phone, Mail, Calendar, ShoppingBag, TrendingUp, Star, ChevronRight,
  UserCircle, Clock,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_FB = BASE.replace("/maison-hd", "") + "/api/fb";
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(`${API_FB}${path}`, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const fmt = (n: number) => `₴${Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const EMPTY_FORM = { name: "", phone: "", email: "", birthday: "", notes: "" };

type Customer = {
  id: number; name: string; phone?: string; email?: string;
  birthday?: string; notes?: string; visits_count: number;
  total_spent: number; last_visit_at?: string; created_at: string;
};

type Order = {
  id: number; created_at: string; total_amount: number;
  discount_amount?: number; tip_amount?: number;
  payment_method?: string; status: string; order_type: string;
  receipt_number?: string;
};

function CustomerDetail({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["fb-customer", customerId],
    queryFn: async () => {
      const r = await apiFetch(`/customers/${customerId}`);
      return r.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  const customer: Customer = data?.customer;
  const orders: Order[] = data?.orders || [];

  if (!customer) return null;

  const methodBadge = (m?: string) => {
    if (!m) return null;
    const map: Record<string, string> = { cash: "Готівка", card: "Картка", liqpay: "LiqPay" };
    return map[m] || m;
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
          <ShoppingBag className="w-5 h-5 mx-auto text-indigo-500 mb-1" />
          <p className="text-xl font-bold text-indigo-700">{customer.visits_count}</p>
          <p className="text-xs text-indigo-500">Візитів</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
          <TrendingUp className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
          <p className="text-lg font-bold text-emerald-700">{fmt(Number(customer.total_spent))}</p>
          <p className="text-xs text-emerald-500">Витрачено</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
          <Clock className="w-5 h-5 mx-auto text-amber-500 mb-1" />
          <p className="text-sm font-bold text-amber-700">
            {customer.last_visit_at ? format(new Date(customer.last_visit_at), "d MMM", { locale: uk }) : "—"}
          </p>
          <p className="text-xs text-amber-500">Останній візит</p>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
        {customer.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-4 h-4 text-gray-400" />
            <a href={`tel:${customer.phone}`} className="text-indigo-600 hover:underline">{customer.phone}</a>
          </div>
        )}
        {customer.email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="w-4 h-4 text-gray-400" />
            <a href={`mailto:${customer.email}`} className="text-indigo-600 hover:underline">{customer.email}</a>
          </div>
        )}
        {customer.birthday && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-gray-700">{format(new Date(customer.birthday), "d MMMM", { locale: uk })}</span>
            <Badge variant="outline" className="text-xs">🎂 День народження</Badge>
          </div>
        )}
        {customer.notes && (
          <div className="text-sm text-gray-600 italic border-t border-gray-200 pt-2 mt-2">"{customer.notes}"</div>
        )}
      </div>

      {/* Order history */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Останні замовлення</h3>
        {orders.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-6">Замовлень ще немає</p>
        ) : (
          <div className="space-y-2">
            {orders.map((o: Order) => (
              <div key={o.id} className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-2.5 bg-white">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">#{o.id}</span>
                    {o.receipt_number && <span className="text-xs text-gray-400">{o.receipt_number}</span>}
                    <Badge variant="outline" className="text-[10px]">{methodBadge(o.payment_method)}</Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {format(new Date(o.created_at), "d MMM yyyy, HH:mm", { locale: uk })}
                  </p>
                </div>
                <span className="text-sm font-bold text-gray-900">{fmt(Number(o.total_amount))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FbCustomersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [viewId, setViewId] = useState<number | null>(null);
  const fv = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ["fb-customers", search],
    queryFn: async () => {
      const r = await apiFetch(`/customers?search=${encodeURIComponent(search)}&limit=100`);
      const d = await r.json();
      return (d.customers || []) as Customer[];
    },
  });
  const customers = data || [];

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name, phone: form.phone || null, email: form.email || null,
        birthday: form.birthday || null, notes: form.notes || null,
      };
      const r = editId
        ? await apiFetch(`/customers/${editId}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiFetch("/customers", { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Помилка"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editId ? "Клієнта оновлено" : "Клієнта додано" });
      qc.invalidateQueries({ queryKey: ["fb-customers"] });
      setShowForm(false); setEditId(null); setForm(EMPTY_FORM);
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await apiFetch(`/customers/${id}`, { method: "DELETE" }); },
    onSuccess: () => { toast({ title: "Клієнта видалено" }); qc.invalidateQueries({ queryKey: ["fb-customers"] }); },
  });

  const openEdit = (c: Customer) => {
    setEditId(c.id);
    setForm({
      name: c.name, phone: c.phone || "", email: c.email || "",
      birthday: c.birthday ? c.birthday.split("T")[0] : "",
      notes: c.notes || "",
    });
    setShowForm(true);
  };

  const totalSpent = customers.reduce((s, c) => s + Number(c.total_spent || 0), 0);
  const totalVisits = customers.reduce((s, c) => s + (c.visits_count || 0), 0);

  return (
    <AppLayout title="CRM — Клієнти">
      <div className="max-w-4xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-indigo-600" /> CRM — Клієнти
            </h1>
            <p className="text-gray-500 text-sm mt-1">База гостей ресторану</p>
          </div>
          <Button onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM); }} className="bg-indigo-600 hover:bg-indigo-700 gap-1.5">
            <Plus className="w-4 h-4" /> Новий клієнт
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{customers.length}</p>
            <p className="text-sm text-gray-500 mt-0.5">Клієнтів у базі</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{fmt(totalSpent)}</p>
            <p className="text-sm text-gray-500 mt-0.5">Загальний оборот</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-indigo-600">{totalVisits}</p>
            <p className="text-sm text-gray-500 mt-0.5">Всього візитів</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Пошук за ім'ям або телефоном…"
            className="pl-9"
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
        ) : customers.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
            <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">{search ? "Нічого не знайдено" : "Клієнтів ще немає"}</p>
            {!search && <p className="text-gray-400 text-sm mt-1">Клієнти додаються автоматично при прив'язці замовлення в POS</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {customers.map((c: Customer) => (
              <div key={c.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-indigo-200 transition-all flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <span className="text-indigo-700 font-bold text-sm">{c.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewId(c.id)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{c.name}</span>
                    {c.phone && <span className="text-xs text-gray-500 flex items-center gap-0.5"><Phone className="w-3 h-3" />{c.phone}</span>}
                    {c.visits_count > 4 && <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">⭐ Постійний</Badge>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400">
                    <span>{c.visits_count} візитів</span>
                    <span>{fmt(Number(c.total_spent))}</span>
                    {c.last_visit_at && <span>Ост. візит: {format(new Date(c.last_visit_at), "d MMM", { locale: uk })}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setViewId(c.id)}>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(c)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                    onClick={() => { if (confirm("Видалити клієнта?")) deleteMut.mutate(c.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customer detail dialog */}
      <Dialog open={viewId !== null} onOpenChange={v => { if (!v) setViewId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-indigo-600" />
              {customers.find(c => c.id === viewId)?.name || "Клієнт"}
            </DialogTitle>
          </DialogHeader>
          {viewId && <CustomerDetail customerId={viewId} onClose={() => setViewId(null)} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewId(null)}>Закрити</Button>
            {viewId && (
              <Button onClick={() => { const c = customers.find(x => x.id === viewId); if (c) { openEdit(c); setViewId(null); } }} className="bg-indigo-600 hover:bg-indigo-700">
                <Pencil className="w-4 h-4 mr-1" /> Редагувати
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit dialog */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Редагувати клієнта" : "Новий клієнт"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Ім'я *</Label><Input placeholder="Іван Петренко" value={form.name} onChange={e => fv("name", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Телефон</Label>
              <Input placeholder="+38 (050) 123-45-67" value={form.phone} onChange={e => fv("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="client@example.com" value={form.email} onChange={e => fv("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>День народження</Label>
              <Input type="date" value={form.birthday} onChange={e => fv("birthday", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Примітки</Label>
              <Input placeholder="Вегетаріанець, алергія на горіхи…" value={form.notes} onChange={e => fv("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); }}><X className="w-4 h-4 mr-1" /> Скасувати</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.name || saveMut.isPending} className="bg-indigo-600 hover:bg-indigo-700">
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
              {editId ? "Зберегти" : "Додати"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
