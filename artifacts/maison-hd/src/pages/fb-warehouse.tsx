import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Package, Truck, FileText, BookOpen, Trash2, Plus, Edit2, Search,
  AlertTriangle, CheckCircle2, XCircle, Loader2, ChevronRight,
  BarChart3, Sparkles, Upload, Eye, Check, X, ArrowLeft, RefreshCw,
  Building2, Phone, Mail, MapPin, Calculator, Beef, Wine, Info,
  ShoppingCart, ClipboardList, Warehouse, TrendingUp, TrendingDown,
  DollarSign, PieChart as PieChartIcon, Activity,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_BASE = BASE.replace("/maison-hd", "") + "/api";
const API = API_BASE + "/fb/warehouse";
const API_FB = API_BASE + "/fb";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });
const apiFbFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API_FB + path, { ...opts, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const UNIT_OPTIONS = ["кг", "г", "л", "мл", "шт", "пляш", "упак", "пор", "пач"];
const CATEGORY_OPTIONS = ["М'ясо та риба", "Овочі та фрукти", "Молочні продукти", "Бакалія", "Напої", "Алкоголь", "Спеції та соуси", "Хліб та випічка", "Заморожені", "Інше"];
const WRITEOFF_REASONS: Record<string, string> = {
  spoilage: "Псування/прострочення",
  production: "Виробнича втрата",
  damage: "Пошкодження",
  inventory: "Інвентаризація",
  other: "Інше",
};
const VAT_RATES = [
  { value: "20", label: "20% — стандартна" },
  { value: "7", label: "7% — пільгова" },
  { value: "0", label: "0% — звільнено від ПДВ" },
];

const STOCK_STATUS: Record<string, { label: string; color: string; icon: any }> = {
  critical: { label: "Відсутній", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
  low: { label: "Мало", color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertTriangle },
  warning: { label: "Запас малий", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: AlertTriangle },
  ok: { label: "Норма", color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 },
};

type Tab = "stock" | "ingredients" | "suppliers" | "receipts" | "recipes" | "writeoffs" | "analytics";

export default function FbWarehousePage() {
  const [tab, setTab] = useState<Tab>("stock");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b bg-white">
          <button onClick={() => navigate("/fb")} className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <Warehouse size={22} className="text-violet-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">F&B Склад</h1>
            <p className="text-xs text-gray-500">Інгредієнти · Постачальники · Накладні · Тех. Карти · Списання</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 border-b bg-gray-50 overflow-x-auto">
          {([
            { key: "stock", label: "Залишки", icon: BarChart3 },
            { key: "ingredients", label: "Інгредієнти", icon: Package },
            { key: "suppliers", label: "Постачальники", icon: Truck },
            { key: "receipts", label: "Накладні", icon: FileText },
            { key: "recipes", label: "Тех. Карти", icon: BookOpen },
            { key: "writeoffs", label: "Списання", icon: Trash2 },
            { key: "analytics", label: "Аналітика", icon: TrendingUp },
          ] as { key: Tab; label: string; icon: any }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? "border-violet-600 text-violet-700 bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-white"
              }`}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto bg-gray-50 p-6">
          {tab === "stock" && <StockTab toast={toast} />}
          {tab === "ingredients" && <IngredientsTab toast={toast} />}
          {tab === "suppliers" && <SuppliersTab toast={toast} />}
          {tab === "receipts" && <ReceiptsTab toast={toast} />}
          {tab === "recipes" && <RecipesTab toast={toast} />}
          {tab === "writeoffs" && <WriteoffsTab toast={toast} />}
          {tab === "analytics" && <AnalyticsTab toast={toast} />}
        </div>
      </div>
    </AppLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: STOCK LEVELS
// ═══════════════════════════════════════════════════════════════════

function StockTab({ toast }: { toast: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/stock-levels");
      const j = await r.json();
      setData(j);
    } catch { toast({ title: "Помилка завантаження", variant: "destructive" }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = (data?.ingredients || []).filter((i: any) => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || i.stock_status === filter;
    return matchSearch && matchFilter;
  });

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Всього позицій", value: summary?.total || 0, icon: Package, color: "text-blue-600" },
          { label: "Відсутні", value: summary?.critical || 0, icon: XCircle, color: "text-red-600" },
          { label: "Мало запасу", value: summary?.low || 0, icon: AlertTriangle, color: "text-orange-600" },
          { label: "Вартість складу", value: `${parseFloat(summary?.total_value || "0").toLocaleString("uk-UA")} ₴`, icon: BarChart3, color: "text-green-600" },
        ].map(card => (
          <Card key={card.label} className="shadow-none border">
            <CardContent className="p-4 flex items-center gap-3">
              <card.icon size={22} className={card.color} />
              <div>
                <div className="text-xs text-gray-500">{card.label}</div>
                <div className="font-bold text-gray-900">{card.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <Input placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-48 h-9 text-sm" />
        </div>
        {["all", "critical", "low", "warning", "ok"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filter === f ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
            }`}
          >
            {f === "all" ? "Всі" : STOCK_STATUS[f]?.label}
          </button>
        ))}
        <button onClick={load} className="ml-auto p-1.5 text-gray-400 hover:text-gray-600">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Table */}
      <Card className="shadow-none border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Інгредієнт</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Залишок</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Мінімум</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Ціна/од.</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Вартість</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Постачальник</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">Статус</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400"><Loader2 className="animate-spin inline" size={20} /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Немає позицій</td></tr>
              ) : filtered.map((ing: any) => {
                const st = STOCK_STATUS[ing.stock_status] || STOCK_STATUS.ok;
                const Icon = st.icon;
                return (
                  <tr key={ing.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{ing.name}</div>
                      {ing.category && <div className="text-xs text-gray-400">{ing.category}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      <span className={ing.stock_status === "critical" ? "text-red-600" : ing.stock_status === "low" ? "text-orange-600" : "text-gray-900"}>
                        {parseFloat(ing.current_stock || 0).toLocaleString("uk-UA", { maximumFractionDigits: 3 })} {ing.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{parseFloat(ing.min_stock || 0).toLocaleString("uk-UA", { maximumFractionDigits: 3 })} {ing.unit}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{parseFloat(ing.cost_per_unit || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{parseFloat(ing.stock_value || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{ing.supplier_name || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${st.color}`}>
                        <Icon size={11} /> {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: INGREDIENTS
// ═══════════════════════════════════════════════════════════════════

function IngredientsTab({ toast }: { toast: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [ir, sr] = await Promise.all([apiFetch("/ingredients"), apiFetch("/suppliers")]);
    const [ij, sj] = await Promise.all([ir.json(), sr.json()]);
    setItems(ij.ingredients || []);
    setSuppliers(sj.suppliers || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => setModal({ name: "", unit: "кг", category: "", current_stock: 0, min_stock: 0, cost_per_unit: 0, supplier_id: "" });
  const openEdit = (i: any) => setModal({ ...i, supplier_id: i.supplier_id?.toString() || "" });

  const save = async () => {
    if (!modal?.name) return toast({ title: "Вкажіть назву", variant: "destructive" });
    setSaving(true);
    try {
      const body = { ...modal, supplier_id: modal.supplier_id ? parseInt(modal.supplier_id) : null };
      const r = modal.id
        ? await apiFetch(`/ingredients/${modal.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiFetch("/ingredients", { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).error);
      toast({ title: modal.id ? "Збережено" : "Додано" });
      setModal(null);
      load();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    await apiFetch(`/ingredients/${id}`, { method: "DELETE" });
    load();
    toast({ title: "Видалено" });
  };

  const filtered = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <Input placeholder="Пошук інгредієнтів..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <Button onClick={openNew} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
          <Plus size={15} /> Додати
        </Button>
      </div>

      <Card className="shadow-none border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Назва</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Категорія</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Залишок</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Мінімум</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Ціна/од.</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Постачальник</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400"><Loader2 className="animate-spin inline" size={20} /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Немає інгредієнтів. Додайте перший!</td></tr>
              ) : filtered.map(ing => (
                <tr key={ing.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{ing.name}</td>
                  <td className="px-4 py-3 text-gray-500">{ing.category || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={parseFloat(ing.current_stock) <= parseFloat(ing.min_stock) && parseFloat(ing.current_stock) > 0 ? "text-orange-600 font-medium" : parseFloat(ing.current_stock) === 0 ? "text-red-600 font-medium" : "text-gray-900"}>
                      {parseFloat(ing.current_stock || 0).toLocaleString("uk-UA", { maximumFractionDigits: 3 })} {ing.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{parseFloat(ing.min_stock || 0).toLocaleString("uk-UA", { maximumFractionDigits: 3 })} {ing.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{parseFloat(ing.cost_per_unit || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{ing.supplier_name || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(ing)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 size={14} /></button>
                      <button onClick={() => remove(ing.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!modal} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{modal?.id ? "Редагувати інгредієнт" : "Новий інгредієнт"}</DialogTitle>
          </DialogHeader>
          {modal && (
            <div className="space-y-3">
              <div><Label>Назва *</Label><Input value={modal.name} onChange={e => setModal((m: any) => ({ ...m, name: e.target.value }))} placeholder="Напр. Куряча грудка" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Одиниця виміру</Label>
                  <Select value={modal.unit} onValueChange={v => setModal((m: any) => ({ ...m, unit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Категорія</Label>
                  <Select value={modal.category || "_none"} onValueChange={v => setModal((m: any) => ({ ...m, category: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Виберіть..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Без категорії</SelectItem>
                      {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Залишок</Label><Input type="number" min="0" step="0.001" value={modal.current_stock} onChange={e => setModal((m: any) => ({ ...m, current_stock: e.target.value }))} /></div>
                <div><Label>Мінімум</Label><Input type="number" min="0" step="0.001" value={modal.min_stock} onChange={e => setModal((m: any) => ({ ...m, min_stock: e.target.value }))} /></div>
                <div><Label>Ціна/од. ₴</Label><Input type="number" min="0" step="0.0001" value={modal.cost_per_unit} onChange={e => setModal((m: any) => ({ ...m, cost_per_unit: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Постачальник</Label>
                <Select value={modal.supplier_id || "_none"} onValueChange={v => setModal((m: any) => ({ ...m, supplier_id: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Виберіть постачальника..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Без постачальника</SelectItem>
                    {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Штрих-код</Label><Input value={modal.barcode || ""} onChange={e => setModal((m: any) => ({ ...m, barcode: e.target.value }))} placeholder="Необов'язково" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>Скасувати</Button>
            <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">
              {saving ? <Loader2 size={16} className="animate-spin" /> : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: SUPPLIERS
// ═══════════════════════════════════════════════════════════════════

function SuppliersTab({ toast }: { toast: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/suppliers");
    const j = await r.json();
    setItems(j.suppliers || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => setModal({ name: "", contact_name: "", phone: "", email: "", address: "", edrpou: "", ipn: "", is_vat_payer: false, payment_terms: "готівка", delivery_days: 1, notes: "" });
  const openEdit = (s: any) => setModal({ ...s });

  const save = async () => {
    if (!modal?.name) return toast({ title: "Вкажіть назву", variant: "destructive" });
    setSaving(true);
    try {
      const r = modal.id
        ? await apiFetch(`/suppliers/${modal.id}`, { method: "PATCH", body: JSON.stringify(modal) })
        : await apiFetch("/suppliers", { method: "POST", body: JSON.stringify(modal) });
      if (!r.ok) throw new Error((await r.json()).error);
      toast({ title: modal.id ? "Збережено" : "Додано" });
      setModal(null);
      load();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    await apiFetch(`/suppliers/${id}`, { method: "DELETE" });
    load();
    toast({ title: "Видалено" });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
          <Plus size={15} /> Додати постачальника
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400"><Loader2 className="animate-spin inline" size={22} /></div>
      ) : items.length === 0 ? (
        <Card className="shadow-none border">
          <CardContent className="py-12 text-center text-gray-400">
            <Truck size={32} className="mx-auto mb-3 opacity-30" />
            <p>Немає постачальників. Додайте першого!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map(s => (
            <Card key={s.id} className="shadow-none border hover:border-violet-200 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{s.name}</h3>
                      {s.is_vat_payer && <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">Платник ПДВ</Badge>}
                      {s.edrpou && <span className="text-xs text-gray-400">ЄДРПОУ: {s.edrpou}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-sm text-gray-500">
                      {s.contact_name && <span className="flex items-center gap-1"><Building2 size={12} />{s.contact_name}</span>}
                      {s.phone && <span className="flex items-center gap-1"><Phone size={12} />{s.phone}</span>}
                      {s.email && <span className="flex items-center gap-1"><Mail size={12} />{s.email}</span>}
                      {s.address && <span className="flex items-center gap-1"><MapPin size={12} />{s.address}</span>}
                    </div>
                    <div className="mt-1 flex gap-3 text-xs text-gray-400">
                      <span>Оплата: {s.payment_terms}</span>
                      <span>Доставка: {s.delivery_days} дн.</span>
                      {s.ingredient_count > 0 && <span>{s.ingredient_count} інгредієнтів</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 size={14} /></button>
                    <button onClick={() => remove(s.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!modal} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{modal?.id ? "Редагувати постачальника" : "Новий постачальник"}</DialogTitle>
          </DialogHeader>
          {modal && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div><Label>Назва *</Label><Input value={modal.name} onChange={e => setModal((m: any) => ({ ...m, name: e.target.value }))} placeholder="ТОВ Продукти Плюс" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>ЄДРПОУ</Label><Input value={modal.edrpou || ""} onChange={e => setModal((m: any) => ({ ...m, edrpou: e.target.value }))} placeholder="12345678" /></div>
                <div><Label>ІПН</Label><Input value={modal.ipn || ""} onChange={e => setModal((m: any) => ({ ...m, ipn: e.target.value }))} placeholder="123456789012" /></div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="vat" checked={modal.is_vat_payer} onChange={e => setModal((m: any) => ({ ...m, is_vat_payer: e.target.checked }))} className="w-4 h-4 accent-violet-600" />
                <Label htmlFor="vat" className="cursor-pointer">Платник ПДВ</Label>
              </div>
              <div><Label>Контактна особа</Label><Input value={modal.contact_name || ""} onChange={e => setModal((m: any) => ({ ...m, contact_name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Телефон</Label><Input value={modal.phone || ""} onChange={e => setModal((m: any) => ({ ...m, phone: e.target.value }))} placeholder="+380..." /></div>
                <div><Label>Email</Label><Input value={modal.email || ""} onChange={e => setModal((m: any) => ({ ...m, email: e.target.value }))} /></div>
              </div>
              <div><Label>Адреса</Label><Input value={modal.address || ""} onChange={e => setModal((m: any) => ({ ...m, address: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Умови оплати</Label>
                  <Select value={modal.payment_terms || "готівка"} onValueChange={v => setModal((m: any) => ({ ...m, payment_terms: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["готівка", "безготівка", "відстрочка 7 дн", "відстрочка 14 дн", "відстрочка 30 дн"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Доставка (дні)</Label><Input type="number" min="0" value={modal.delivery_days} onChange={e => setModal((m: any) => ({ ...m, delivery_days: parseInt(e.target.value) || 1 }))} /></div>
              </div>
              <div><Label>Примітки</Label><Textarea value={modal.notes || ""} onChange={e => setModal((m: any) => ({ ...m, notes: e.target.value }))} rows={2} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>Скасувати</Button>
            <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">
              {saving ? <Loader2 size={16} className="animate-spin" /> : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: RECEIPTS (Накладні)
// ═══════════════════════════════════════════════════════════════════

type ReceiptView = "list" | "new" | "detail" | "ai";

function ReceiptsTab({ toast }: { toast: any }) {
  const [view, setView] = useState<ReceiptView>("list");
  const [receipts, setReceipts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rr, sr] = await Promise.all([apiFetch("/receipts"), apiFetch("/suppliers")]);
    const [rj, sj] = await Promise.all([rr.json(), sr.json()]);
    setReceipts(rj.receipts || []);
    setSuppliers(sj.suppliers || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openReceipt = async (id: number) => {
    const r = await apiFetch(`/receipts/${id}`);
    const j = await r.json();
    setSelected(j);
    setView("detail");
  };

  const confirm = async (id: number) => {
    const r = await apiFetch(`/receipts/${id}/confirm`, { method: "POST" });
    if (r.ok) { toast({ title: "Накладну підтверджено. Залишки оновлено." }); load(); setView("list"); }
    else toast({ title: (await r.json()).error, variant: "destructive" });
  };

  const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600 border-gray-200",
    confirmed: "bg-green-100 text-green-700 border-green-200",
    cancelled: "bg-red-100 text-red-600 border-red-200",
  };
  const STATUS_UA: Record<string, string> = { draft: "Чернетка", confirmed: "Підтверджено", cancelled: "Скасовано" };

  if (view === "ai") return <AiScanView suppliers={suppliers} onBack={() => { setView("list"); load(); }} toast={toast} />;
  if (view === "new") return <NewReceiptView suppliers={suppliers} onBack={() => { setView("list"); load(); }} toast={toast} />;

  if (view === "detail" && selected) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setView("list")} className="text-gray-400 hover:text-gray-600"><ArrowLeft size={18} /></button>
        <div>
          <h2 className="font-bold text-gray-900">Накладна {selected.receipt?.receipt_no || `#${selected.receipt?.id}`}</h2>
          <div className="text-xs text-gray-500">{selected.receipt?.receipt_date} · {selected.receipt?.supplier_name || "Без постачальника"}</div>
        </div>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[selected.receipt?.status]}`}>{STATUS_UA[selected.receipt?.status]}</span>
      </div>

      <Card className="shadow-none border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Позиція</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">К-сть</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Од.</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Ціна</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Сума</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">ПДВ %</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Інгредієнт</th>
              </tr>
            </thead>
            <tbody>
              {(selected.items || []).map((item: any) => (
                <tr key={item.id} className="border-b">
                  <td className="px-4 py-2.5">
                    {item.name}
                    {item.is_new_ingredient && <Badge className="ml-2 text-[10px] bg-amber-100 text-amber-700 border-amber-200" variant="outline">новий</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-right">{parseFloat(item.quantity).toLocaleString("uk-UA", { maximumFractionDigits: 3 })}</td>
                  <td className="px-4 py-2.5">{item.unit}</td>
                  <td className="px-4 py-2.5 text-right">{parseFloat(item.price_per_unit).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴</td>
                  <td className="px-4 py-2.5 text-right font-medium">{parseFloat(item.total_price).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{item.vat_rate}%</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{item.ingredient_name || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t">
              <tr>
                <td colSpan={4} className="px-4 py-2.5 font-medium text-right">Разом:</td>
                <td className="px-4 py-2.5 font-bold">{parseFloat(selected.receipt?.total_amount || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴</td>
                <td colSpan={2} className="px-4 py-2.5 text-gray-500 text-xs">ПДВ: {parseFloat(selected.receipt?.vat_amount || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {selected.receipt?.notes && (
        <Card className="shadow-none border"><CardContent className="p-3 text-sm text-gray-600">{selected.receipt.notes}</CardContent></Card>
      )}

      {selected.receipt?.status === "draft" && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setView("list")}>Назад</Button>
          <Button onClick={() => confirm(selected.receipt.id)} className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
            <Check size={15} /> Підтвердити та оновити залишки
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => setView("ai")} size="sm" className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50">
          <Sparkles size={15} /> AI-сканування накладної
        </Button>
        <Button onClick={() => setView("new")} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
          <Plus size={15} /> Нова накладна
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400"><Loader2 className="animate-spin inline" size={22} /></div>
      ) : receipts.length === 0 ? (
        <Card className="shadow-none border">
          <CardContent className="py-12 text-center text-gray-400">
            <FileText size={32} className="mx-auto mb-3 opacity-30" />
            <p className="mb-4">Немає накладних. Створіть першу або використайте AI-сканування!</p>
            <Button onClick={() => setView("ai")} variant="outline" size="sm" className="gap-1.5">
              <Sparkles size={14} /> Спробувати AI-сканування
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-none border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Накладна</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Дата</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Постачальник</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Сума</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Позицій</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">Статус</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => openReceipt(r.id)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.receipt_no || `#${r.id}`}</div>
                      {r.ai_scanned && <div className="text-xs text-violet-500 flex items-center gap-0.5 mt-0.5"><Sparkles size={10} /> AI-скановано</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.receipt_date}</td>
                    <td className="px-4 py-3 text-gray-600">{r.supplier_name || "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{parseFloat(r.total_amount || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴</td>
                    <td className="px-4 py-3 text-right text-gray-500">{r.item_count}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[r.status]}`}>{STATUS_UA[r.status]}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400"><ChevronRight size={14} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── AI Scan View ──────────────────────────────────────────────────

function AiScanView({ suppliers, onBack, toast }: { suppliers: any[]; onBack: () => void; toast: any }) {
  const [step, setStep] = useState<"input" | "reviewing" | "saving">("input");
  const [inputText, setInputText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [parsed, setParsed] = useState<any>(null);
  const [newCount, setNewCount] = useState(0);
  const [supplierId, setSupplierId] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const scan = async () => {
    if (!inputText && !imageFile) return toast({ title: "Вставте текст або завантажте фото накладної", variant: "destructive" });
    setScanning(true);
    try {
      let body: any = {};
      if (imageFile) {
        const b64 = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onload = () => res((reader.result as string).split(",")[1]);
          reader.readAsDataURL(imageFile);
        });
        body = { image_base64: b64 };
      } else {
        body = { text: inputText };
      }
      const r = await apiFetch("/receipts/ai-scan", { method: "POST", body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Помилка AI");
      setParsed(j.parsed);
      setNewCount(j.new_ingredients_count || 0);
      if (j.parsed?.supplier_id) setSupplierId(j.parsed.supplier_id.toString());
      setStep("reviewing");
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally { setScanning(false); }
  };

  const saveReceipt = async () => {
    if (!parsed) return;
    setStep("saving");
    try {
      const cr = await apiFetch("/receipts", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: supplierId ? parseInt(supplierId) : null,
          receipt_no: parsed.receipt_no,
          receipt_date: parsed.receipt_date,
          notes: "Імпортовано через AI-сканування",
        })
      });
      const { receipt } = await cr.json();

      await apiFetch(`/receipts/${receipt.id}/items`, {
        method: "PUT",
        body: JSON.stringify({ items: parsed.items })
      });

      toast({ title: `Накладну збережено! ${newCount > 0 ? `${newCount} нових інгредієнтів додано автоматично.` : ""}` });
      onBack();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
      setStep("reviewing");
    }
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setParsed((p: any) => ({
      ...p,
      items: p.items.map((item: any, i: number) => i === idx ? { ...item, [field]: value } : item)
    }));
  };

  if (step === "input") return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600"><ArrowLeft size={18} /></button>
        <div>
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><Sparkles size={18} className="text-violet-500" /> AI-сканування накладної</h2>
          <p className="text-xs text-gray-500">Завантажте фото або вставте текст накладної — AI розпізнає всі позиції автоматично</p>
        </div>
      </div>

      <Card className="shadow-none border">
        <CardContent className="p-5 space-y-4">
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-violet-300 hover:bg-violet-50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium text-gray-600">{imageFile ? imageFile.name : "Завантажити фото накладної"}</p>
            <p className="text-xs text-gray-400 mt-1">JPG, PNG, HEIC (до 10 МБ)</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { setImageFile(e.target.files?.[0] || null); setInputText(""); }} />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">АБО</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div>
            <Label>Вставте текст накладної</Label>
            <Textarea
              value={inputText}
              onChange={e => { setInputText(e.target.value); setImageFile(null); }}
              placeholder="Видаткова накладна №123 від 10.04.2026&#10;Постачальник: ТОВ Агро-Плюс&#10;&#10;1. Куряча грудка охол. 10 кг × 120 грн = 1200 грн&#10;2. Масло вершкове 82.5% 5 кг × 180 грн = 900 грн&#10;..."
              rows={8}
              className="font-mono text-xs"
            />
          </div>

          <Button onClick={scan} disabled={scanning || (!inputText && !imageFile)} className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2">
            {scanning ? <><Loader2 size={16} className="animate-spin" /> AI обробляє...</> : <><Sparkles size={16} /> Розпізнати накладну</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-none border bg-blue-50 border-blue-100">
        <CardContent className="p-4">
          <div className="flex gap-3 items-start">
            <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-1">Як працює AI-розпізнавання:</p>
              <ul className="space-y-0.5 text-xs text-blue-600">
                <li>• Автоматично витягує номер, дату, постачальника та всі позиції</li>
                <li>• Зіставляє товари з вашою базою інгредієнтів</li>
                <li>• Нові товари (яких немає в базі) додаються автоматично</li>
                <li>• Ви перевіряєте результат перед підтвердженням</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (step === "reviewing" && parsed) return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setStep("input")} className="text-gray-400 hover:text-gray-600"><ArrowLeft size={18} /></button>
        <div>
          <h2 className="font-bold text-gray-900">Перевірте результат AI-розпізнавання</h2>
          <p className="text-xs text-gray-500">Відредагуйте якщо потрібно, потім збережіть</p>
        </div>
        {newCount > 0 && (
          <Badge className="ml-auto bg-amber-100 text-amber-700 border-amber-200 text-xs" variant="outline">
            {newCount} нових інгредієнтів буде додано
          </Badge>
        )}
      </div>

      <Card className="shadow-none border">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label className="text-xs">Номер накладної</Label>
              <Input value={parsed.receipt_no || ""} onChange={e => setParsed((p: any) => ({ ...p, receipt_no: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div><Label className="text-xs">Дата</Label>
              <Input type="date" value={parsed.receipt_date || ""} onChange={e => setParsed((p: any) => ({ ...p, receipt_date: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="col-span-2"><Label className="text-xs">Постачальник</Label>
              <Select value={supplierId || "_none"} onValueChange={v => setSupplierId(v === "_none" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Виберіть..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{parsed.supplier_name || "Невизначений постачальник"}</SelectItem>
                  {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Назва в накладній</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">К-сть</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Од.</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Ціна/од.</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Сума</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">ПДВ</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Статус</th>
              </tr>
            </thead>
            <tbody>
              {(parsed.items || []).map((item: any, idx: number) => (
                <tr key={idx} className={`border-b ${item.is_new_ingredient ? "bg-amber-50" : ""}`}>
                  <td className="px-3 py-2">
                    <Input value={item.name} onChange={e => updateItem(idx, "name", e.target.value)} className="h-7 text-xs border-0 bg-transparent p-0 focus:bg-white focus:border focus:px-2 transition-all" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", parseFloat(e.target.value))} className="h-7 text-xs w-20 text-right" />
                  </td>
                  <td className="px-3 py-2">
                    <Select value={item.unit || "кг"} onValueChange={v => updateItem(idx, "unit", v)}>
                      <SelectTrigger className="h-7 text-xs w-16"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input type="number" value={item.price_per_unit} onChange={e => updateItem(idx, "price_per_unit", parseFloat(e.target.value))} className="h-7 text-xs w-24 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-xs">
                    {((item.quantity || 0) * (item.price_per_unit || 0)).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500 text-xs">{item.vat_rate || 20}%</td>
                  <td className="px-3 py-2 text-center">
                    {item.is_new_ingredient
                      ? <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200" variant="outline">новий</Badge>
                      : <span className="text-[10px] text-green-600 flex items-center gap-0.5 justify-center"><Check size={10} /> знайдено ({item.match_confidence || 0}%)</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right font-medium text-sm">Разом:</td>
                <td className="px-3 py-2 text-right font-bold text-sm">
                  {(parsed.items || []).reduce((s: number, i: any) => s + (i.quantity || 0) * (i.price_per_unit || 0), 0).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {newCount > 0 && (
        <Card className="shadow-none border bg-amber-50 border-amber-100">
          <CardContent className="p-3 flex gap-2 items-center">
            <Sparkles size={15} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700">
              <strong>{newCount} нових інгредієнтів</strong> будуть автоматично додані до вашої бази складу.
              Ви зможете відредагувати їх категорію та мінімальний запас пізніше у вкладці "Інгредієнти".
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => setStep("input")}>Назад</Button>
        <Button onClick={saveReceipt} className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
          <Check size={15} /> Зберегти накладну
        </Button>
      </div>
    </div>
  );

  return (
    <div className="text-center py-12 text-gray-400">
      <Loader2 className="animate-spin inline" size={24} />
      <p className="mt-2">Зберігаємо...</p>
    </div>
  );
}

// ── New Receipt (Manual) ──────────────────────────────────────────

function NewReceiptView({ suppliers, onBack, toast }: { suppliers: any[]; onBack: () => void; toast: any }) {
  const [form, setForm] = useState({ supplier_id: "", receipt_no: "", receipt_date: new Date().toISOString().split("T")[0], notes: "" });
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([{ ingredient_id: "", name: "", quantity: 1, unit: "кг", price_per_unit: 0, vat_rate: 20 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/ingredients").then(r => r.json()).then(j => setIngredients(j.ingredients || []));
  }, []);

  const addLine = () => setLines(l => [...l, { ingredient_id: "", name: "", quantity: 1, unit: "кг", price_per_unit: 0, vat_rate: 20 }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: any) => setLines(l => l.map((line, idx) => idx === i ? { ...line, [field]: value } : line));

  const save = async () => {
    setSaving(true);
    try {
      const cr = await apiFetch("/receipts", { method: "POST", body: JSON.stringify(form) });
      const { receipt } = await cr.json();
      await apiFetch(`/receipts/${receipt.id}/items`, {
        method: "PUT",
        body: JSON.stringify({
          items: lines.map(l => ({ ...l, ingredient_id: l.ingredient_id ? parseInt(l.ingredient_id) : null }))
        })
      });
      toast({ title: "Накладну створено" });
      onBack();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const total = lines.reduce((s, l) => s + (l.quantity || 0) * (l.price_per_unit || 0), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600"><ArrowLeft size={18} /></button>
        <h2 className="font-bold text-gray-900">Нова накладна</h2>
      </div>

      <Card className="shadow-none border">
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label className="text-xs">Номер накладної</Label><Input value={form.receipt_no} onChange={e => setForm(f => ({ ...f, receipt_no: e.target.value }))} placeholder="№ 123" className="h-8 text-sm" /></div>
          <div><Label className="text-xs">Дата</Label><Input type="date" value={form.receipt_date} onChange={e => setForm(f => ({ ...f, receipt_date: e.target.value }))} className="h-8 text-sm" /></div>
          <div className="col-span-2">
            <Label className="text-xs">Постачальник</Label>
            <Select value={form.supplier_id || "_none"} onValueChange={v => setForm(f => ({ ...f, supplier_id: v === "_none" ? "" : v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Виберіть..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Без постачальника</SelectItem>
                {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Інгредієнт</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">К-сть</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20">Од.</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600 w-28">Ціна/од. ₴</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Сума ₴</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600 w-20">ПДВ %</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} className="border-b">
                  <td className="px-3 py-2">
                    <Select value={line.ingredient_id || "_none"} onValueChange={v => {
                      const ing = ingredients.find((i: any) => i.id.toString() === v);
                      updateLine(idx, "ingredient_id", v === "_none" ? "" : v);
                      if (ing) { updateLine(idx, "name", ing.name); updateLine(idx, "unit", ing.unit); }
                    }}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Виберіть або вручну..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Вільний ввід</SelectItem>
                        {ingredients.map((i: any) => <SelectItem key={i.id} value={i.id.toString()}>{i.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {!line.ingredient_id && (
                      <Input value={line.name} onChange={e => updateLine(idx, "name", e.target.value)} placeholder="Назва товару..." className="mt-1 h-7 text-xs" />
                    )}
                  </td>
                  <td className="px-3 py-2"><Input type="number" min="0" step="0.001" value={line.quantity} onChange={e => updateLine(idx, "quantity", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right" /></td>
                  <td className="px-3 py-2">
                    <Select value={line.unit} onValueChange={v => updateLine(idx, "unit", v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2"><Input type="number" min="0" step="0.01" value={line.price_per_unit} onChange={e => updateLine(idx, "price_per_unit", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right" /></td>
                  <td className="px-3 py-2 text-right text-xs font-medium">{((line.quantity || 0) * (line.price_per_unit || 0)).toLocaleString("uk-UA", { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2">
                    <Select value={line.vat_rate?.toString() || "20"} onValueChange={v => updateLine(idx, "vat_rate", parseInt(v))}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{VAT_RATES.map(v => <SelectItem key={v.value} value={v.value}>{v.value}%</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeLine(idx)} className="text-gray-300 hover:text-red-500 transition-colors"><X size={14} /></button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={7} className="px-3 py-2">
                  <button onClick={addLine} className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1 font-medium">
                    <Plus size={13} /> Додати позицію
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot className="bg-gray-50 border-t">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right font-medium">Разом:</td>
                <td className="px-3 py-2 text-right font-bold">{total.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div><Label className="text-xs">Примітки</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="text-sm" /></div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onBack}>Скасувати</Button>
        <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <><Check size={15} /> Зберегти чернетку</>}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: RECIPE CARDS (Технологічні карти)
// ═══════════════════════════════════════════════════════════════════

function RecipesTab({ toast }: { toast: any }) {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [editModal, setEditModal] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [rr, ir, ingr] = await Promise.all([apiFetch("/recipes"), apiFbFetch("/items"), apiFetch("/ingredients")]);
    const [rj, ij, ingj] = await Promise.all([rr.json(), ir.json(), ingr.json()]);
    setRecipes(rj.recipes || []);
    setItems(ij.items || []);
    setIngredients(ingj.ingredients || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openRecipe = async (id: number) => {
    const r = await apiFetch(`/recipes/${id}`);
    const j = await r.json();
    setSelected(j);
  };

  const openNew = () => setEditModal({ name: "", menu_item_id: "", yield_quantity: 1, yield_unit: "пор", prep_time_min: 15, cook_time_min: 15, technology: "", notes: "", _lines: [] });

  const save = async () => {
    if (!editModal?.name) return toast({ title: "Вкажіть назву", variant: "destructive" });
    setSaving(true);
    try {
      const body = { ...editModal, menu_item_id: editModal.menu_item_id ? parseInt(editModal.menu_item_id) : null };
      const r = editModal.id
        ? await apiFetch(`/recipes/${editModal.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiFetch("/recipes", { method: "POST", body: JSON.stringify(body) });
      const j = await r.json();
      const recipeId = j.recipe.id;

      if (editModal._lines?.length) {
        await apiFetch(`/recipes/${recipeId}/items`, {
          method: "PUT",
          body: JSON.stringify({ items: editModal._lines.map((l: any) => ({ ...l, ingredient_id: parseInt(l.ingredient_id) })) })
        });
      }

      toast({ title: editModal.id ? "Збережено" : "Тех. карту створено" });
      setEditModal(null);
      load();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const addIngredientLine = () => {
    setEditModal((m: any) => ({
      ...m,
      _lines: [...(m._lines || []), { ingredient_id: "", gross_quantity: 0, net_quantity: 0, unit: "кг", loss_pct: 0 }]
    }));
  };

  const updateIngLine = (idx: number, field: string, value: any) => {
    setEditModal((m: any) => ({
      ...m,
      _lines: m._lines.map((l: any, i: number) => {
        if (i !== idx) return l;
        const updated = { ...l, [field]: value };
        if (field === "gross_quantity" || field === "loss_pct") {
          const gross = parseFloat(field === "gross_quantity" ? value : l.gross_quantity) || 0;
          const loss = parseFloat(field === "loss_pct" ? value : l.loss_pct) || 0;
          updated.net_quantity = +(gross * (1 - loss / 100)).toFixed(4);
        }
        if (field === "ingredient_id") {
          const ing = ingredients.find((i: any) => i.id.toString() === value);
          if (ing) updated.unit = ing.unit;
        }
        return updated;
      })
    }));
  };

  if (selected) return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><ArrowLeft size={18} /></button>
        <div>
          <h2 className="font-bold text-gray-900">{selected.recipe?.name}</h2>
          {selected.recipe?.menu_item_name && <p className="text-xs text-gray-500">Страва: {selected.recipe.menu_item_name} ({parseFloat(selected.recipe.menu_item_price || 0).toLocaleString("uk-UA")} ₴)</p>}
        </div>
        {selected.recipe?.margin_pct && (
          <Badge className="ml-auto bg-green-100 text-green-700 border-green-200" variant="outline">
            Маржа: {selected.recipe.margin_pct}%
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Собівартість", value: `${parseFloat(selected.recipe?.cost_per_portion || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴` },
          { label: "Вихід", value: `${selected.recipe?.yield_quantity} ${selected.recipe?.yield_unit}` },
          { label: "Час приготування", value: `${(selected.recipe?.prep_time_min || 0) + (selected.recipe?.cook_time_min || 0)} хв` },
        ].map(card => (
          <Card key={card.label} className="shadow-none border">
            <CardContent className="p-3 text-center">
              <div className="text-xs text-gray-500">{card.label}</div>
              <div className="font-bold text-gray-900 mt-0.5">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-none border overflow-hidden">
        <CardHeader className="px-4 py-3 border-b bg-gray-50"><CardTitle className="text-sm font-medium text-gray-700">Склад (інгредієнти)</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Інгредієнт</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Брутто</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Нетто</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Од.</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">% втрат</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Вартість</th>
              </tr>
            </thead>
            <tbody>
              {(selected.items || []).map((item: any) => (
                <tr key={item.id} className="border-b">
                  <td className="px-4 py-2.5 font-medium">{item.ingredient_name}</td>
                  <td className="px-4 py-2.5 text-right">{parseFloat(item.gross_quantity).toLocaleString("uk-UA", { maximumFractionDigits: 4 })}</td>
                  <td className="px-4 py-2.5 text-right">{parseFloat(item.net_quantity).toLocaleString("uk-UA", { maximumFractionDigits: 4 })}</td>
                  <td className="px-4 py-2.5 text-gray-500">{item.unit}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{item.loss_pct}%</td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {(parseFloat(item.net_quantity) * parseFloat(item.cost_per_unit || 0)).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t">
              <tr>
                <td colSpan={5} className="px-4 py-2.5 text-right font-medium">Собівартість порції:</td>
                <td className="px-4 py-2.5 text-right font-bold">{parseFloat(selected.recipe?.cost_per_portion || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {selected.recipe?.technology && (
        <Card className="shadow-none border">
          <CardHeader className="px-4 py-2 border-b bg-gray-50"><CardTitle className="text-xs font-medium text-gray-600">Технологія приготування</CardTitle></CardHeader>
          <CardContent className="p-4 text-sm text-gray-700 whitespace-pre-wrap">{selected.recipe.technology}</CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
          <Plus size={15} /> Нова тех. карта
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="animate-spin inline text-gray-400" size={22} /></div>
      ) : recipes.length === 0 ? (
        <Card className="shadow-none border">
          <CardContent className="py-12 text-center text-gray-400">
            <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
            <p>Немає технологічних карт</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {recipes.map(r => (
            <Card key={r.id} className="shadow-none border hover:border-violet-200 cursor-pointer transition-colors" onClick={() => openRecipe(r.id)}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{r.name}</h3>
                    {r.margin_pct && (
                      <Badge variant="outline" className={`text-xs ${parseFloat(r.margin_pct) >= 60 ? "text-green-600 border-green-200" : parseFloat(r.margin_pct) >= 40 ? "text-yellow-600 border-yellow-200" : "text-red-600 border-red-200"}`}>
                        маржа {r.margin_pct}%
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex gap-3">
                    {r.menu_item_name && <span>Страва: {r.menu_item_name}</span>}
                    {r.cost_per_portion && <span>Собівартість: {parseFloat(r.cost_per_portion).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴/пор</span>}
                    <span>Вихід: {r.yield_quantity} {r.yield_unit}</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-300" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editModal} onOpenChange={() => setEditModal(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Технологічна карта</DialogTitle>
          </DialogHeader>
          {editModal && (
            <div className="space-y-3 overflow-y-auto max-h-[65vh] pr-1">
              <div><Label>Назва *</Label><Input value={editModal.name} onChange={e => setEditModal((m: any) => ({ ...m, name: e.target.value }))} /></div>
              <div>
                <Label>Страва з меню (необов'язково)</Label>
                <Select value={editModal.menu_item_id?.toString() || "_none"} onValueChange={v => setEditModal((m: any) => ({ ...m, menu_item_id: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Прив'язати до страви..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Не прив'язано</SelectItem>
                    {items.map((i: any) => <SelectItem key={i.id} value={i.id.toString()}>{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div><Label className="text-xs">Вихід</Label><Input type="number" min="0.1" step="0.1" value={editModal.yield_quantity} onChange={e => setEditModal((m: any) => ({ ...m, yield_quantity: e.target.value }))} /></div>
                <div><Label className="text-xs">Од. виходу</Label>
                  <Select value={editModal.yield_unit} onValueChange={v => setEditModal((m: any) => ({ ...m, yield_unit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["пор", "кг", "г", "л", "шт"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Підготовка (хв)</Label><Input type="number" min="0" value={editModal.prep_time_min} onChange={e => setEditModal((m: any) => ({ ...m, prep_time_min: parseInt(e.target.value) || 0 }))} /></div>
                <div><Label className="text-xs">Приготування (хв)</Label><Input type="number" min="0" value={editModal.cook_time_min} onChange={e => setEditModal((m: any) => ({ ...m, cook_time_min: parseInt(e.target.value) || 0 }))} /></div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 border-b flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Інгредієнти</span>
                  <button onClick={addIngredientLine} className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1 font-medium">
                    <Plus size={12} /> Додати
                  </button>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-2 py-1.5 text-gray-600">Інгредієнт</th>
                      <th className="text-right px-2 py-1.5 text-gray-600">Брутто</th>
                      <th className="text-right px-2 py-1.5 text-gray-600">% втрат</th>
                      <th className="text-right px-2 py-1.5 text-gray-600">Нетто</th>
                      <th className="text-left px-2 py-1.5 text-gray-600 w-16">Од.</th>
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(editModal._lines || []).map((line: any, idx: number) => (
                      <tr key={idx} className="border-b">
                        <td className="px-2 py-1.5">
                          <Select value={line.ingredient_id?.toString() || "_none"} onValueChange={v => updateIngLine(idx, "ingredient_id", v === "_none" ? "" : v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Виберіть..." /></SelectTrigger>
                            <SelectContent>{ingredients.map((i: any) => <SelectItem key={i.id} value={i.id.toString()}>{i.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5"><Input type="number" min="0" step="0.001" value={line.gross_quantity} onChange={e => updateIngLine(idx, "gross_quantity", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right w-20" /></td>
                        <td className="px-2 py-1.5"><Input type="number" min="0" max="100" value={line.loss_pct} onChange={e => updateIngLine(idx, "loss_pct", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right w-16" /></td>
                        <td className="px-2 py-1.5 text-right font-medium">{parseFloat(line.net_quantity || 0).toFixed(3)}</td>
                        <td className="px-2 py-1.5">
                          <Select value={line.unit} onValueChange={v => updateIngLine(idx, "unit", v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5"><button onClick={() => setEditModal((m: any) => ({ ...m, _lines: m._lines.filter((_: any, i: number) => i !== idx) }))} className="text-gray-300 hover:text-red-500 transition-colors"><X size={12} /></button></td>
                      </tr>
                    ))}
                    {!editModal._lines?.length && (
                      <tr><td colSpan={6} className="text-center py-3 text-gray-400 text-xs">Додайте інгредієнти</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div><Label>Технологія приготування</Label><Textarea value={editModal.technology || ""} onChange={e => setEditModal((m: any) => ({ ...m, technology: e.target.value }))} rows={3} placeholder="Опишіть технологію приготування..." /></div>
              <div><Label>Примітки</Label><Textarea value={editModal.notes || ""} onChange={e => setEditModal((m: any) => ({ ...m, notes: e.target.value }))} rows={2} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal(null)}>Скасувати</Button>
            <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">
              {saving ? <Loader2 size={16} className="animate-spin" /> : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: WRITE-OFFS (Списання)
// ═══════════════════════════════════════════════════════════════════

function WriteoffsTab({ toast }: { toast: any }) {
  const [writeoffs, setWriteoffs] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [wr, ir] = await Promise.all([apiFetch("/writeoffs"), apiFetch("/ingredients")]);
    const [wj, ij] = await Promise.all([wr.json(), ir.json()]);
    setWriteoffs(wj.writeoffs || []);
    setIngredients(ij.ingredients || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => setModal({
    writeoff_date: new Date().toISOString().split("T")[0],
    reason: "spoilage",
    notes: "",
    items: [{ ingredient_id: "", quantity: 0, unit: "кг", notes: "" }]
  });

  const addItem = () => setModal((m: any) => ({ ...m, items: [...m.items, { ingredient_id: "", quantity: 0, unit: "кг", notes: "" }] }));
  const removeItem = (idx: number) => setModal((m: any) => ({ ...m, items: m.items.filter((_: any, i: number) => i !== idx) }));
  const updateItem = (idx: number, field: string, value: any) => setModal((m: any) => ({
    ...m,
    items: m.items.map((item: any, i: number) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === "ingredient_id") {
        const ing = ingredients.find((ing: any) => ing.id.toString() === value);
        if (ing) updated.unit = ing.unit;
      }
      return updated;
    })
  }));

  const save = async () => {
    const validItems = modal.items.filter((i: any) => i.ingredient_id && i.quantity > 0);
    if (!validItems.length) return toast({ title: "Додайте позиції для списання", variant: "destructive" });
    setSaving(true);
    try {
      const r = await apiFetch("/writeoffs", {
        method: "POST",
        body: JSON.stringify({ ...modal, items: validItems.map((i: any) => ({ ...i, ingredient_id: parseInt(i.ingredient_id) })) })
      });
      if (!r.ok) throw new Error((await r.json()).error);
      toast({ title: "Списання створено" });
      setModal(null);
      load();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const confirm = async (id: number) => {
    const r = await apiFetch(`/writeoffs/${id}/confirm`, { method: "POST" });
    if (r.ok) { toast({ title: "Списання підтверджено. Залишки оновлено." }); load(); }
    else toast({ title: (await r.json()).error, variant: "destructive" });
  };

  const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600 border-gray-200",
    confirmed: "bg-green-100 text-green-700 border-green-200",
  };
  const STATUS_UA: Record<string, string> = { draft: "Чернетка", confirmed: "Підтверджено" };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
          <Plus size={15} /> Нове списання
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="animate-spin inline text-gray-400" size={22} /></div>
      ) : writeoffs.length === 0 ? (
        <Card className="shadow-none border">
          <CardContent className="py-12 text-center text-gray-400">
            <Trash2 size={32} className="mx-auto mb-3 opacity-30" />
            <p>Немає актів списання</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-none border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Дата</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Причина</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Сума</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Позицій</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">Статус</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {writeoffs.map((w: any) => (
                  <tr key={w.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700">{w.writeoff_date}</td>
                    <td className="px-4 py-3 text-gray-600">{WRITEOFF_REASONS[w.reason] || w.reason}</td>
                    <td className="px-4 py-3 text-right font-medium">{parseFloat(w.total_amount || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴</td>
                    <td className="px-4 py-3 text-right text-gray-500">{w.item_count}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[w.status]}`}>{STATUS_UA[w.status]}</span>
                    </td>
                    <td className="px-4 py-3">
                      {w.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => confirm(w.id)} className="h-7 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50">
                          <Check size={12} /> Підтвердити
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={!!modal} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Новий акт списання</DialogTitle>
          </DialogHeader>
          {modal && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Дата</Label><Input type="date" value={modal.writeoff_date} onChange={e => setModal((m: any) => ({ ...m, writeoff_date: e.target.value }))} className="h-8 text-sm" /></div>
                <div>
                  <Label className="text-xs">Причина</Label>
                  <Select value={modal.reason} onValueChange={v => setModal((m: any) => ({ ...m, reason: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(WRITEOFF_REASONS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Інгредієнт</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">К-сть</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 w-16">Од.</th>
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {modal.items.map((item: any, idx: number) => (
                      <tr key={idx} className="border-b">
                        <td className="px-3 py-1.5">
                          <Select value={item.ingredient_id?.toString() || "_none"} onValueChange={v => updateItem(idx, "ingredient_id", v === "_none" ? "" : v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Виберіть..." /></SelectTrigger>
                            <SelectContent>{ingredients.map((i: any) => <SelectItem key={i.id} value={i.id.toString()}>{i.name} ({parseFloat(i.current_stock || 0).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} {i.unit})</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-1.5"><Input type="number" min="0" step="0.001" value={item.quantity} onChange={e => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right w-20" /></td>
                        <td className="px-3 py-1.5">
                          <Select value={item.unit} onValueChange={v => updateItem(idx, "unit", v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-1.5"><button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 transition-colors"><X size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2">
                  <button onClick={addItem} className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1 font-medium">
                    <Plus size={12} /> Додати позицію
                  </button>
                </div>
              </div>

              <div><Label>Примітки</Label><Textarea value={modal.notes} onChange={e => setModal((m: any) => ({ ...m, notes: e.target.value }))} rows={2} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>Скасувати</Button>
            <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">
              {saving ? <Loader2 size={16} className="animate-spin" /> : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: ANALYTICS
// ═══════════════════════════════════════════════════════════════════

const WASTE_COLORS = ["#f97316", "#ef4444", "#eab308", "#8b5cf6", "#6b7280"];
const PIE_COLORS   = ["#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#7e22ce",
                      "#9333ea", "#a855f7", "#c084fc", "#ddd6fe", "#3b0764"];

const fmtUah = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  if (!n) return "0 ₴";
  return n.toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₴";
};
const fmtPct = (v: number | string | null | undefined) => Number(v ?? 0).toFixed(1) + "%";
const fcColor = (pct: number) =>
  pct <= 25 ? "text-green-600" : pct <= 35 ? "text-yellow-600" : pct <= 45 ? "text-orange-600" : "text-red-600";
const fcBar = (pct: number) =>
  pct <= 25 ? "bg-green-500" : pct <= 35 ? "bg-yellow-500" : pct <= 45 ? "bg-orange-500" : "bg-red-500";

function AnalyticsTab({ toast }: { toast: any }) {
  const [data, setData]      = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]  = useState("30");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/analytics?days=${period}`);
      if (!r.ok) throw new Error((await r.json()).error);
      setData(await r.json());
    } catch (e: any) {
      toast({ title: "Помилка аналітики", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin h-8 w-8 text-violet-500" />
    </div>
  );
  if (!data) return null;

  const { kpi, food_cost_by_dish, stock_movement, waste_by_reason, top_stock_value, top_usage } = data;

  const movementChart = (() => {
    const all = (stock_movement || []).map((d: any) => ({
      date: new Date(d.date).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
      "Надходження": Number(d.receipts_amount),
      "Списання": Number(d.writeoffs_amount),
    }));
    if (all.length <= 14) return all;
    const step = Math.ceil(all.length / 14);
    return all.filter((_: any, i: number) => i % step === 0 || i === all.length - 1);
  })();

  const wasteChart = (waste_by_reason || []).map((w: any) => ({
    name: ({ spoilage: "Псування", production: "Виробниче", damage: "Пошкодження", inventory: "Інвентаризація" } as any)[w.reason] || "Інше",
    value: Number(w.total_cost),
  }));

  const topStockChart = (top_stock_value || []).map((i: any) => ({
    name: i.name.length > 14 ? i.name.slice(0, 13) + "…" : i.name,
    value: Number(i.stock_value),
  }));

  const hasMovement = movementChart.some((d: any) => d["Надходження"] > 0 || d["Списання"] > 0);

  return (
    <div className="space-y-5">
      {/* Header + Period */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Activity size={20} className="text-violet-600" /> F&B Аналітика
        </h2>
        <div className="flex gap-1 bg-white border rounded-lg p-1 shadow-sm">
          {[{ v: "7", l: "7 д" }, { v: "30", l: "30 д" }, { v: "90", l: "3 міс" }, { v: "365", l: "Рік" }].map(p => (
            <button key={p.v} onClick={() => setPeriod(p.v)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${period === p.v ? "bg-violet-600 text-white shadow" : "text-gray-500 hover:text-violet-600"}`}
            >{p.l}</button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Закуплено", value: fmtUah(kpi?.total_purchased), sub: `за ${period} днів`, icon: DollarSign, col: "bg-violet-50 text-violet-600" },
          { label: "Відходи/Списання", value: fmtUah(kpi?.total_waste), sub: `за ${period} днів`, icon: Trash2, col: "bg-red-50 text-red-500" },
          { label: "Ср. Food Cost", value: kpi?.avg_food_cost_pct ? fmtPct(kpi.avg_food_cost_pct) : "—", sub: "≤25% — відмінно", icon: TrendingDown, col: "bg-amber-50 text-amber-600", vc: fcColor(Number(kpi?.avg_food_cost_pct ?? 0)) },
          { label: "Вартість залишків", value: fmtUah(kpi?.stock_total_value), sub: `${kpi?.ingredients_total || 0} інгр.`, icon: Package, col: "bg-green-50 text-green-600" },
        ].map((c, i) => (
          <Card key={i} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${c.col}`}><c.icon size={15} /></div>
                <span className="text-xs text-gray-500 font-medium leading-tight">{c.label}</span>
              </div>
              <p className={`text-xl font-bold ${(c as any).vc || "text-gray-900"}`}>{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stock Movement */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Activity size={15} className="text-violet-500" /> Рух складу — надходження та списання
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {!hasMovement ? (
            <div className="h-40 flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-lg">
              Немає підтверджених накладних або списань за цей період
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={movementChart} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <Tooltip formatter={(v: any) => fmtUah(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Надходження" stroke="#7c3aed" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="Списання" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Food Cost table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Calculator size={15} className="text-violet-500" /> Food Cost по стравах
              <span className="ml-auto text-xs font-normal text-gray-400">собівартість → ціна</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {food_cost_by_dish.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm bg-gray-50 m-3 rounded-lg">
                Немає тех. карт із собівартістю.<br />Введіть ціни у Меню та собівартість у Тех. Картах.
              </div>
            ) : (
              <div className="divide-y max-h-80 overflow-y-auto">
                {food_cost_by_dish.map((d: any, i: number) => {
                  const pct = Number(d.food_cost_pct);
                  return (
                    <div key={i} className="px-4 py-2.5 hover:bg-gray-50">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-800 truncate max-w-[50%]">{d.name}</span>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <span className="text-xs text-gray-400">{fmtUah(d.cost_per_portion)} → {fmtUah(d.selling_price)}</span>
                          <span className={`text-xs font-bold tabular-nums ${fcColor(pct)}`}>{fmtPct(pct)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${fcBar(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Waste by reason */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Trash2 size={15} className="text-red-500" /> Списання по причинах
            </CardTitle>
          </CardHeader>
          <CardContent>
            {wasteChart.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-lg">
                Немає підтверджених списань за цей період
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="45%" height={160}>
                  <PieChart>
                    <Pie data={wasteChart} dataKey="value" nameKey="name" innerRadius={38} outerRadius={68} paddingAngle={3}>
                      {wasteChart.map((_: any, i: number) => <Cell key={i} fill={WASTE_COLORS[i % WASTE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmtUah(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2 min-w-0">
                  {wasteChart.map((w: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: WASTE_COLORS[i % WASTE_COLORS.length] }} />
                        <span className="text-xs text-gray-600 truncate">{w.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-800 shrink-0">{fmtUah(w.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top stock value */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <TrendingUp size={15} className="text-green-500" /> Топ-10 залишків за вартістю
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topStockChart.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-lg">Немає залишків</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topStockChart} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: "#9ca3af" }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#6b7280" }} width={88} />
                  <Tooltip formatter={(v: any) => fmtUah(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="value" name="Вартість" radius={[0, 4, 4, 0]}>
                    {topStockChart.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top purchased */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <ShoppingCart size={15} className="text-blue-500" /> Топ-10 закупівель за сумою
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {(top_usage || []).length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm bg-gray-50 m-3 rounded-lg">
                Немає підтверджених накладних за цей період
              </div>
            ) : (
              <div className="divide-y max-h-[220px] overflow-y-auto">
                {(top_usage || []).map((u: any, i: number) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold text-gray-300 w-4 text-right shrink-0">{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{u.name}</p>
                        <p className="text-xs text-gray-400">{Number(u.total_received).toFixed(2)} {u.unit}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-violet-700 shrink-0">{fmtUah(u.total_cost)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
