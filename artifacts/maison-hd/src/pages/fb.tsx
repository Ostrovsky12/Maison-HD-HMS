import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
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
  UtensilsCrossed, Users, ChefHat, ReceiptText, Plus, ArrowLeft,
  Clock, CheckCircle2, Loader2, Star, ShoppingBag, Wine, Home,
  ChevronRight, RefreshCw, SquarePlus, Minus, Search, Flame,
  Sunrise, PartyPopper, Building2, AlarmClock, Truck,
  Edit2, Trash2, Settings, X, Warehouse, Sparkles,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/fb";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { "Authorization": `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const TABLE_STATUS_UA: Record<string, string> = { free: "Вільний", occupied: "Зайнятий", reserved: "Заброньований", cleaning: "Прибирання" };
const TABLE_STATUS_COLORS: Record<string, string> = {
  free: "bg-green-100 border-green-300 text-green-800",
  occupied: "bg-red-100 border-red-300 text-red-800",
  reserved: "bg-yellow-100 border-yellow-300 text-yellow-800",
  cleaning: "bg-blue-100 border-blue-300 text-blue-800",
};
const ORDER_STATUS_UA: Record<string, string> = {
  open: "Відкрито", in_kitchen: "На кухні", ready: "Готово",
  served: "Подано", billed: "Закрито", cancelled: "Скасовано",
};
const ORDER_STATUS_COLORS: Record<string, string> = {
  open: "bg-gray-100 text-gray-700 border-gray-200",
  in_kitchen: "bg-orange-100 text-orange-700 border-orange-200",
  ready: "bg-green-100 text-green-700 border-green-200",
  served: "bg-blue-100 text-blue-700 border-blue-200",
  billed: "bg-purple-100 text-purple-700 border-purple-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};
const ORDER_TYPE_UA: Record<string, string> = {
  dine_in: "В залі", room_service: "Рум-сервіс", takeaway: "З собою",
  bar: "Бар", breakfast: "Сніданок", banquet: "Банкет", corporate: "Корпоратив",
};
const ORDER_TYPE_ICON: Record<string, any> = {
  dine_in: UtensilsCrossed, room_service: Home, takeaway: ShoppingBag,
  bar: Wine, breakfast: Sunrise, banquet: PartyPopper, corporate: Building2,
};
const ITEM_STATUS_UA: Record<string, string> = {
  pending: "Очікує", cooking: "Готується", ready: "Готово", served: "Подано", cancelled: "Скасовано",
};
const ITEM_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600", cooking: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700", served: "bg-blue-100 text-blue-600",
  cancelled: "bg-red-100 text-red-600",
};

function minutesAgo(ts: string) {
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
}
function waitColor(mins: number) {
  if (mins < 10) return "border-green-300 bg-green-50";
  if (mins < 20) return "border-yellow-300 bg-yellow-50";
  return "border-red-300 bg-red-50";
}
function waitLabel(mins: number) {
  if (mins < 1) return "щойно";
  return `${mins} хв`;
}

const TABS = [
  { id: "hall",   label: "Зал",         icon: UtensilsCrossed },
  { id: "orders", label: "Замовлення",  icon: ReceiptText },
  { id: "kitchen",label: "Кухня",       icon: ChefHat },
  { id: "menu",   label: "Меню",        icon: SquarePlus },
];

export default function FbPage() {
  const [tab, setTab] = useState("hall");
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<any>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [legalEntities, setLegalEntities] = useState<any[]>([]);
  const [fbIngredients, setFbIngredients] = useState<any[]>([]);
  const [exciseRates, setExciseRates] = useState<any[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderDetail, setOrderDetail] = useState<any>(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrderTable, setNewOrderTable] = useState<any>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [statusFilter, setStatusFilter] = useState("open");
  const [typeFilter, setTypeFilter] = useState("all");
  const [menuSearch, setMenuSearch] = useState("");
  const [menuCatFilter, setMenuCatFilter] = useState("all");
  const [kitchenLoading, setKitchenLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  // Table CRUD
  const [showTableModal, setShowTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState<any>(null);
  const [tableForm, setTableForm] = useState({ number: "", location: "Основний зал", capacity: "4" });
  // Menu item CRUD
  const [showEditItem, setShowEditItem] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  // Category CRUD
  const [showCatManager, setShowCatManager] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [catForm, setCatForm] = useState({ name: "", emoji: "🍽️" });
  const kitchenInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  // Tick every minute for wait time display
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const loadStats = async () => { const r = await apiFetch("/stats"); if (r.ok) setStats(await r.json()); };
  const loadTables = async () => { const r = await apiFetch("/tables"); if (r.ok) { const d = await r.json(); setTables(d.tables || []); } };
  const loadOrders = async (s?: string, t?: string) => {
    const params = new URLSearchParams();
    const sv = s ?? statusFilter; const tv = t ?? typeFilter;
    if (sv === "open") params.set("open", "true");
    else if (sv !== "all") params.set("status", sv);
    if (tv !== "all") params.set("type", tv);
    const r = await apiFetch(`/orders?${params}`);
    if (r.ok) { const d = await r.json(); setOrders(d.orders || []); }
  };
  const loadItems = async () => { const r = await apiFetch("/items"); if (r.ok) { const d = await r.json(); setItems(d.items || []); } };
  const loadCategories = async () => { const r = await apiFetch("/categories"); if (r.ok) { const d = await r.json(); setCategories(d.categories || []); } };
  const loadLegalEntities = async () => {
    const apiBase = API.replace("/fb", "");
    const r = await fetch(`${apiBase}/legal-entities`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { const d = await r.json(); setLegalEntities(d.legalEntities || []); }
  };
  const loadFbIngredients = async () => {
    const whBase = API.replace("/fb", "/fb/warehouse");
    const r = await fetch(`${whBase}/ingredients`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { const d = await r.json(); setFbIngredients((d.ingredients || []).filter((i: any) => i.is_active !== false)); }
  };
  const loadExciseRates = async () => {
    const r = await apiFetch("/excise-rates");
    if (r.ok) { const d = await r.json(); setExciseRates(d.rates || []); }
  };
  const loadOrderDetail = async (id: number) => { const r = await apiFetch(`/orders/${id}`); if (r.ok) { const d = await r.json(); setOrderDetail(d); } };
  const loadKitchen = useCallback(async () => {
    setKitchenLoading(true);
    const r = await apiFetch("/kitchen");
    if (r.ok) { const d = await r.json(); setKitchenOrders(d.orders || []); }
    setKitchenLoading(false);
  }, []);

  useEffect(() => { loadStats(); loadTables(); loadCategories(); loadItems(); loadLegalEntities(); loadFbIngredients(); loadExciseRates(); }, []);
  useEffect(() => { if (tab === "orders") loadOrders(); }, [tab, statusFilter, typeFilter]);
  useEffect(() => {
    if (tab === "kitchen") {
      loadKitchen();
      kitchenInterval.current = setInterval(loadKitchen, 20000);
    } else {
      if (kitchenInterval.current) clearInterval(kitchenInterval.current);
    }
    return () => { if (kitchenInterval.current) clearInterval(kitchenInterval.current); };
  }, [tab, loadKitchen]);

  const handleTableClick = async (table: any) => {
    if (table.status === "occupied" && table.currentOrderId) {
      setSelectedOrder({ id: table.currentOrderId });
      await loadOrderDetail(table.currentOrderId);
    } else if (table.status === "free") {
      setNewOrderTable(table);
      setShowNewOrder(true);
    }
  };

  const handleOrderClick = async (order: any) => {
    setSelectedOrder(order);
    await loadOrderDetail(order.id);
  };

  const handleOrderStatus = async (id: number, status: string) => {
    const r = await apiFetch(`/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (r.ok) {
      toast({ title: `Статус: ${ORDER_STATUS_UA[status]}` });
      loadTables(); loadStats(); loadOrders();
      if (orderDetail?.order?.id === id) await loadOrderDetail(id);
      if (["billed", "cancelled"].includes(status)) { setSelectedOrder(null); setOrderDetail(null); }
    }
  };

  const handleItemStatus = async (itemId: number, status: string, orderId: number) => {
    const r = await apiFetch(`/order-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (r.ok) {
      await loadOrderDetail(orderId);
      if (tab === "kitchen") loadKitchen();
    }
  };

  const handleKitchenItemStatus = async (itemId: number, status: string) => {
    const r = await apiFetch(`/order-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (r.ok) { toast({ title: status === "cooking" ? "🔥 Готується" : "✓ Готово" }); loadKitchen(); loadStats(); }
  };

  // ── Table CRUD ──────────────────────────────────────────────────────────────
  const openNewTable = () => { setEditingTable(null); setTableForm({ number: "", location: "Основний зал", capacity: "4" }); setShowTableModal(true); };
  const openEditTable = (t: any) => { setEditingTable(t); setTableForm({ number: t.number, location: t.location || "Основний зал", capacity: String(t.capacity) }); setShowTableModal(true); };
  const saveTable = async () => {
    if (!tableForm.number) return;
    const body = { number: tableForm.number, location: tableForm.location || "Основний зал", capacity: parseInt(tableForm.capacity) || 4 };
    const r = editingTable
      ? await apiFetch(`/tables/${editingTable.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await apiFetch("/tables", { method: "POST", body: JSON.stringify(body) });
    if (r.ok) { toast({ title: editingTable ? "Стіл оновлено" : "Стіл додано" }); setShowTableModal(false); loadTables(); }
  };
  const deleteTable = async (t: any) => {
    if (!confirm(`Видалити стіл ${t.number}?`)) return;
    const r = await apiFetch(`/tables/${t.id}`, { method: "DELETE" });
    if (r.ok) { toast({ title: `Стіл ${t.number} видалено` }); loadTables(); }
  };

  // ── Menu item CRUD ──────────────────────────────────────────────────────────
  const openEditItem = (it: any) => { setEditingItem(it); setShowEditItem(true); };
  const deleteMenuItem = async (it: any) => {
    if (!confirm(`Видалити «${it.name}»?`)) return;
    const r = await apiFetch(`/items/${it.id}`, { method: "DELETE" });
    if (r.ok) { toast({ title: `«${it.name}» видалено` }); loadItems(); }
  };

  // ── Category CRUD ───────────────────────────────────────────────────────────
  const openNewCat = () => { setEditingCat(null); setCatForm({ name: "", emoji: "🍽️" }); setShowCatModal(true); };
  const openEditCat = (c: any) => { setEditingCat(c); setCatForm({ name: c.name, emoji: c.emoji || "🍽️" }); setShowCatModal(true); };
  const saveCat = async () => {
    if (!catForm.name) return;
    const r = editingCat
      ? await apiFetch(`/categories/${editingCat.id}`, { method: "PATCH", body: JSON.stringify(catForm) })
      : await apiFetch("/categories", { method: "POST", body: JSON.stringify(catForm) });
    if (r.ok) { toast({ title: editingCat ? "Категорію оновлено" : "Категорію додано" }); setShowCatModal(false); loadCategories(); loadItems(); }
  };
  const deleteCat = async (c: any) => {
    if (!confirm(`Видалити категорію «${c.name}»?`)) return;
    const r = await apiFetch(`/categories/${c.id}`, { method: "DELETE" });
    if (r.ok) { toast({ title: `Категорію «${c.name}» видалено` }); loadCategories(); loadItems(); }
  };

  // ── Full-screen order detail ────────────────────────────────────────────────
  if (selectedOrder && orderDetail) {
    const ord = orderDetail.order;
    const orderItems = orderDetail.items || [];
    const TypeIcon = ORDER_TYPE_ICON[ord.orderType] || UtensilsCrossed;

    return (
      <AppLayout>
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setSelectedOrder(null); setOrderDetail(null); loadTables(); loadStats(); }}>
              <ArrowLeft className="h-4 w-4 mr-1" />Назад
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <TypeIcon className="h-5 w-5 text-orange-600" />
                <h2 className="font-bold text-lg">
                  {ord.tableNumber ? `Стіл ${ord.tableNumber}` : ord.roomNumber ? `Кімната ${ord.roomNumber}` : ord.guestName}
                </h2>
                <Badge className={`text-xs border ${ORDER_STATUS_COLORS[ord.status]}`}>{ORDER_STATUS_UA[ord.status]}</Badge>
                <Badge variant="outline" className="text-xs">{ORDER_TYPE_UA[ord.orderType]}</Badge>
              </div>
              {ord.guestName && <p className="text-sm text-gray-500">{ord.guestName} · {ord.guestCount} ос.</p>}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-orange-600">{parseFloat(ord.totalAmount || 0).toLocaleString()} ₴</p>
            </div>
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base">Позиції замовлення</CardTitle>
                {!["billed", "cancelled"].includes(ord.status) && (
                  <Button size="sm" variant="outline" onClick={() => setShowAddItem(true)} className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" />Додати</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {orderItems.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Позицій немає</p>}
              {orderItems.map((it: any) => (
                <div key={it.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{it.name}</span>
                      <Badge className={`text-xs ${ITEM_STATUS_COLORS[it.status]}`}>{ITEM_STATUS_UA[it.status]}</Badge>
                    </div>
                    {it.notes && <p className="text-xs text-gray-400">{it.notes}</p>}
                    <p className="text-xs text-gray-500">{it.quantity} × {parseFloat(it.price).toLocaleString()} ₴ = <span className="font-medium">{parseFloat(it.totalPrice).toLocaleString()} ₴</span></p>
                  </div>
                  {!["billed", "cancelled", "served"].includes(ord.status) && (
                    <div className="flex gap-1 flex-shrink-0">
                      {it.status === "pending" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleItemStatus(it.id, "cooking", ord.id)}>🔥</Button>}
                      {it.status === "cooking" && <Button size="sm" variant="outline" className="h-7 text-xs text-green-700" onClick={() => handleItemStatus(it.id, "ready", ord.id)}>✓</Button>}
                      {it.status === "ready" && <Button size="sm" variant="outline" className="h-7 text-xs text-blue-700" onClick={() => handleItemStatus(it.id, "served", ord.id)}>🍽</Button>}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {!["billed", "cancelled"].includes(ord.status) && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Дії:</p>
                <div className="flex flex-wrap gap-2">
                  {ord.status === "open" && <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={() => handleOrderStatus(ord.id, "in_kitchen")}>Відправити на кухню</Button>}
                  {ord.status === "in_kitchen" && <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleOrderStatus(ord.id, "ready")}>Готово до подачі</Button>}
                  {ord.status === "ready" && <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => handleOrderStatus(ord.id, "served")}>Подано гостям</Button>}
                  {["open", "in_kitchen", "ready", "served"].includes(ord.status) && (
                    <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => handleOrderStatus(ord.id, "billed")}>
                      <ReceiptText className="h-3.5 w-3.5 mr-1.5" />Закрити рахунок ({parseFloat(ord.totalAmount || 0).toLocaleString()} ₴)
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleOrderStatus(ord.id, "cancelled")}>Скасувати</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {ord.status === "billed" && (
            <Card className="border-0 shadow-sm bg-green-50"><CardContent className="p-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-800">Рахунок закрито · {parseFloat(ord.totalAmount || 0).toLocaleString()} ₴</p>
            </CardContent></Card>
          )}
        </div>

        <AddItemDialog open={showAddItem} onClose={() => setShowAddItem(false)} items={items} categories={categories}
          onAdd={async (itemId: number, qty: number, notes: string) => {
            const r = await apiFetch(`/orders/${ord.id}/items`, { method: "POST", body: JSON.stringify({ itemId, quantity: qty, notes }) });
            if (r.ok) { toast({ title: "Позицію додано" }); setShowAddItem(false); await loadOrderDetail(ord.id); }
          }} />
      </AppLayout>
    );
  }

  // ── Main page ─────────────────────────────────────────────────────────────
  const groupedTables = tables.reduce((acc: Record<string, any[]>, t) => {
    const loc = t.location || "Зал";
    if (!acc[loc]) acc[loc] = [];
    acc[loc].push(t);
    return acc;
  }, {});

  const filteredItems = items.filter(it => {
    if (menuSearch && !it.name.toLowerCase().includes(menuSearch.toLowerCase())) return false;
    if (menuCatFilter !== "all" && String(it.categoryId) !== menuCatFilter) return false;
    return true;
  });

  const groupedItems = filteredItems.reduce((acc: Record<string, any[]>, it) => {
    const cat = it.categoryEmoji ? `${it.categoryEmoji} ${it.categoryName}` : (it.categoryName || "Інше");
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(it);
    return acc;
  }, {});

  const totalKitchenItems = kitchenOrders.reduce((s, o) => s + o.items.length, 0);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UtensilsCrossed className="h-7 w-7 text-orange-600" /> Ресторан & F&B
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">Столи, замовлення, кухня, меню</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/fb-warehouse")} className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50">
              <Warehouse className="h-4 w-4" /> Склад
            </Button>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => { setNewOrderTable(null); setShowNewOrder(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Нове замовлення
            </Button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Відкритих замовлень</p>
              <p className="text-2xl font-bold text-orange-600">{stats.openOrders}</p>
              <p className="text-xs text-gray-400">Сьогодні: {stats.today.orders}</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Столів зайнято</p>
              <p className="text-2xl font-bold text-red-600">{stats.tables.occupied}</p>
              <p className="text-xs text-gray-400">Вільних: {stats.tables.free}/{stats.tables.total}</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Виручка сьогодні</p>
              <p className="text-2xl font-bold text-green-600">{stats.today.revenue.toLocaleString()} ₴</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Топ страва</p>
              <p className="text-sm font-bold text-gray-700 truncate">{stats.topItems?.[0]?.name || "—"}</p>
              <p className="text-xs text-gray-400">{stats.topItems?.[0]?.total || 0} замовлень</p>
            </CardContent></Card>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-orange-600 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <t.icon className="h-4 w-4" />{t.label}
              {t.id === "kitchen" && totalKitchenItems > 0 && tab !== "kitchen" && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">{totalKitchenItems}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── HALL ── */}
        {tab === "hall" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{tables.length} столів · клікніть для замовлення</p>
              <Button variant="outline" size="sm" onClick={openNewTable} className="h-8 gap-1.5">
                <Plus className="h-3.5 w-3.5" />Новий стіл
              </Button>
            </div>
            {Object.entries(groupedTables).map(([location, tbls]) => (
              <div key={location}>
                <h3 className="font-semibold text-gray-700 mb-3 text-sm">{location}</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {(tbls as any[]).map((tbl: any) => (
                    <div key={tbl.id} className="relative group">
                      <button onClick={() => handleTableClick(tbl)}
                        className={`relative w-full p-3 rounded-xl border-2 text-center transition-all hover:shadow-md ${TABLE_STATUS_COLORS[tbl.status]} ${tbl.status === "free" ? "hover:border-green-500" : "hover:border-current"}`}>
                        <div className="text-xs font-medium text-gray-500 mb-1">{tbl.location === "Бар" ? "🍸" : "🪑"}</div>
                        <div className="font-bold text-lg leading-none">{tbl.number}</div>
                        <div className="text-xs mt-1 opacity-70">{tbl.capacity} ос.</div>
                        {tbl.status === "occupied" && tbl.orderTotal && (
                          <div className="text-xs font-medium mt-0.5">{parseFloat(tbl.orderTotal).toLocaleString()} ₴</div>
                        )}
                        {tbl.status !== "free" && (
                          <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${tbl.status === "occupied" ? "bg-red-500" : tbl.status === "reserved" ? "bg-yellow-500" : "bg-blue-500"}`} />
                        )}
                      </button>
                      {/* Edit / Delete on hover */}
                      <div className="absolute -top-1.5 -right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button onClick={e => { e.stopPropagation(); openEditTable(tbl); }} className="p-1 bg-white border border-gray-200 rounded-md shadow-sm text-indigo-600 hover:bg-indigo-50"><Edit2 className="h-2.5 w-2.5" /></button>
                        <button onClick={e => { e.stopPropagation(); deleteTable(tbl); }} className="p-1 bg-white border border-gray-200 rounded-md shadow-sm text-red-500 hover:bg-red-50"><Trash2 className="h-2.5 w-2.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {tables.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                <UtensilsCrossed className="h-10 w-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Немає столів. Натисніть «Новий стіл» щоб додати.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              {Object.entries(TABLE_STATUS_UA).map(([s, l]) => (
                <span key={s} className="flex items-center gap-1">
                  <span className={`w-3 h-3 rounded-sm border ${TABLE_STATUS_COLORS[s].split(" ")[0]}`} />{l}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── ORDERS ── */}
        {tab === "orders" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); loadOrders(v, typeFilter); }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Відкриті</SelectItem>
                  <SelectItem value="all">Всі статуси</SelectItem>
                  {Object.entries(ORDER_STATUS_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); loadOrders(statusFilter, v); }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі типи</SelectItem>
                  {Object.entries(ORDER_TYPE_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => loadOrders()} className="h-9"><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>
            {orders.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-10 text-center text-gray-400">Замовлень не знайдено</CardContent></Card>
            ) : orders.map(ord => {
              const TypeIcon = ORDER_TYPE_ICON[ord.orderType] || UtensilsCrossed;
              return (
                <Card key={ord.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => handleOrderClick(ord)}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <TypeIcon className="h-5 w-5 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">
                          {ord.tableNumber ? `Стіл ${ord.tableNumber}` : ord.roomNumber ? `Кімната ${ord.roomNumber}` : (ord.guestName || "Замовлення")}
                        </span>
                        <Badge className={`text-xs border ${ORDER_STATUS_COLORS[ord.status]}`}>{ORDER_STATUS_UA[ord.status]}</Badge>
                        <Badge variant="outline" className="text-xs">{ORDER_TYPE_UA[ord.orderType]}</Badge>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{ord.guestName}{ord.guestCount ? ` · ${ord.guestCount} ос.` : ""}</p>
                      <p className="text-xs text-gray-400">{new Date(ord.openedAt).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-lg text-orange-600">{parseFloat(ord.totalAmount || 0).toLocaleString()} ₴</p>
                      <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── KITCHEN DISPLAY ── */}
        {tab === "kitchen" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-500">
                  {kitchenOrders.length === 0 ? "Нових замовлень немає" : `${kitchenOrders.length} замовлень · ${totalKitchenItems} позицій`}
                </p>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <AlarmClock className="h-3 w-3" /> оновлення кожні 20 сек
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={loadKitchen} disabled={kitchenLoading} className="h-8">
                {kitchenLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {/* Legend */}
            <div className="flex gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-green-300 bg-green-50" /> &lt;10 хв</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-yellow-300 bg-yellow-50" /> 10–20 хв</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-red-300 bg-red-50" /> &gt;20 хв</span>
            </div>

            {kitchenOrders.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-16 text-center">
                <ChefHat className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Кухня вільна</p>
                <p className="text-gray-300 text-sm">Нових замовлень немає</p>
              </CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {kitchenOrders.map((ko: any) => {
                  const TypeIcon = ORDER_TYPE_ICON[ko.orderType] || UtensilsCrossed;
                  const oldest = ko.items.reduce((min: any, i: any) => (!min || new Date(i.createdAt) < new Date(min.createdAt)) ? i : min, null);
                  const waitMins = oldest ? minutesAgo(oldest.createdAt) : 0;
                  return (
                    <Card key={ko.orderId} className={`border-2 shadow-sm ${waitColor(waitMins)}`}>
                      <CardHeader className="pb-2 pt-3 px-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TypeIcon className="h-4 w-4 text-gray-600" />
                            <span className="font-bold text-sm">
                              {ko.tableNumber ? `Стіл ${ko.tableNumber}` : ko.roomNumber ? `Кімната ${ko.roomNumber}` : ko.guestName || `#${ko.orderId}`}
                            </span>
                          </div>
                          <Badge variant="outline" className={`text-xs font-bold ${waitMins >= 20 ? "border-red-400 text-red-600" : waitMins >= 10 ? "border-yellow-500 text-yellow-700" : "border-green-400 text-green-700"}`}>
                            <Clock className="h-3 w-3 mr-1" />{waitLabel(waitMins)}
                          </Badge>
                        </div>
                        {ko.guestName && <p className="text-xs text-gray-500 mt-0.5">{ko.guestName}</p>}
                      </CardHeader>
                      <CardContent className="px-3 pb-3 space-y-2">
                        {ko.items.map((it: any) => {
                          const isCooking = it.itemStatus === "cooking";
                          return (
                            <div key={it.itemId} className={`flex items-center gap-2 p-2 rounded-lg ${isCooking ? "bg-orange-50 border border-orange-200" : "bg-white border border-gray-100"}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {isCooking && <Flame className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />}
                                  <span className="text-sm font-medium truncate">{it.itemName}</span>
                                  <span className="text-xs text-gray-500 flex-shrink-0">× {it.quantity}</span>
                                </div>
                                {it.itemNotes && <p className="text-xs text-orange-700 mt-0.5">⚠ {it.itemNotes}</p>}
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                {it.itemStatus === "pending" && (
                                  <Button size="sm" className="h-7 w-7 p-0 bg-orange-500 hover:bg-orange-600" onClick={() => handleKitchenItemStatus(it.itemId, "cooking")}>
                                    <Flame className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {it.itemStatus === "cooking" && (
                                  <Button size="sm" className="h-7 w-7 p-0 bg-green-600 hover:bg-green-700" onClick={() => handleKitchenItemStatus(it.itemId, "ready")}>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── MENU ── */}
        {tab === "menu" && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input className="pl-9" placeholder="Пошук по меню…" value={menuSearch} onChange={e => setMenuSearch(e.target.value)} />
              </div>
              <Select value={menuCatFilter} onValueChange={setMenuCatFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Категорія" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі категорії</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.emoji} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setShowCatManager(v => !v)} className={`h-10 gap-1.5 ${showCatManager ? "bg-orange-50 border-orange-300" : ""}`}>
                <Settings className="h-3.5 w-3.5" />Категорії
              </Button>
              <Button className="bg-orange-600 hover:bg-orange-700 h-10" onClick={() => setShowNewItem(true)}><Plus className="h-4 w-4 mr-1" />Нова позиція</Button>
            </div>

            {/* Category Manager Panel */}
            {showCatManager && (
              <div className="border border-orange-200 rounded-xl bg-orange-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Управління категоріями</span>
                  <Button variant="ghost" size="sm" onClick={openNewCat} className="h-6 text-xs gap-1 text-orange-700 hover:bg-orange-100">
                    <Plus className="h-3 w-3" />Нова
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map(c => (
                    <div key={c.id} className="flex items-center gap-1 bg-white border border-orange-200 rounded-lg px-2 py-1">
                      <span className="text-sm">{c.emoji} {c.name}</span>
                      <button onClick={() => openEditCat(c)} className="text-gray-400 hover:text-indigo-600 ml-1"><Edit2 className="h-3 w-3" /></button>
                      <button onClick={() => deleteCat(c)} className="text-gray-400 hover:text-red-500"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.entries(groupedItems).map(([cat, catItems]) => (
              <div key={cat}>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">{cat}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(catItems as any[]).map((it: any) => (
                    <div key={it.id} className={`relative group flex items-center gap-3 p-3 rounded-xl border ${it.isAvailable ? "bg-white border-gray-100" : "bg-gray-50 border-gray-200 opacity-60"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm">{it.name}</span>
                          {it.isPopular && <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />}
                          {it.isVegetarian && <span className="text-xs">🌿</span>}
                          {it.ingredient_id && <span className="text-xs" title={`Склад: ${it.ingredient_name || "прив'язано"}`}>📦</span>}
                          {!it.isAvailable && <Badge variant="outline" className="text-xs text-gray-400">Немає</Badge>}
                        </div>
                        {it.description && <p className="text-xs text-gray-500 truncate">{it.description}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-bold text-orange-600">{parseFloat(it.price).toLocaleString()} ₴</span>
                          {it.cookMinutes && <span className="text-xs text-gray-400 flex items-center gap-0.5"><Clock className="h-3 w-3" />{it.cookMinutes} хв</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button className="text-xs px-2 py-1 rounded-lg border transition hover:border-orange-300"
                          onClick={async () => {
                            await apiFetch(`/items/${it.id}`, { method: "PATCH", body: JSON.stringify({ isAvailable: !it.isAvailable }) });
                            loadItems();
                          }}>
                          {it.isAvailable ? "✓ Є" : "○ Немає"}
                        </button>
                        <button onClick={() => openEditItem(it)} title="Редагувати" className="opacity-30 group-hover:opacity-100 transition-opacity p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg border border-transparent hover:border-indigo-200"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteMenuItem(it)} title="Видалити" className="opacity-30 group-hover:opacity-100 transition-opacity p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <Card className="border-dashed"><CardContent className="py-10 text-center text-gray-400">Меню порожнє. Додайте першу страву.</CardContent></Card>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <NewOrderDialog open={showNewOrder} defaultTable={newOrderTable} tables={tables}
        onClose={() => { setShowNewOrder(false); setNewOrderTable(null); }}
        onSave={async (data: any) => {
          const r = await apiFetch("/orders", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) {
            toast({ title: "Замовлення відкрито" });
            setShowNewOrder(false); setNewOrderTable(null);
            const d = await r.json();
            loadTables(); loadStats(); loadOrders();
            setSelectedOrder(d.order); await loadOrderDetail(d.order.id);
          } else {
            const e = await r.json();
            toast({ title: "Помилка", description: e.error, variant: "destructive" });
          }
        }} />

      <NewMenuItemDialog open={showNewItem} categories={categories} legalEntities={legalEntities} ingredients={fbIngredients} exciseRates={exciseRates} onClose={() => setShowNewItem(false)}
        onSave={async (data: any) => {
          const r = await apiFetch("/items", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Страву додано" }); setShowNewItem(false); loadItems(); }
        }} />

      {/* Table create/edit modal */}
      <Dialog open={showTableModal} onOpenChange={setShowTableModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingTable ? `Редагувати стіл ${editingTable.number}` : "Новий стіл"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Номер столу *</Label>
                <Input placeholder="1, 2A, VIP-1…" value={tableForm.number} onChange={e => setTableForm(f => ({ ...f, number: e.target.value }))} />
              </div>
              <div><Label className="text-xs">Місць</Label>
                <Input type="number" min={1} value={tableForm.capacity} onChange={e => setTableForm(f => ({ ...f, capacity: e.target.value }))} />
              </div>
            </div>
            <div><Label className="text-xs">Зона / локація</Label>
              <Input placeholder="Основний зал, Тераса, VIP…" value={tableForm.location} onChange={e => setTableForm(f => ({ ...f, location: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTableModal(false)}>Скасувати</Button>
            <Button disabled={!tableForm.number} onClick={saveTable} className="bg-orange-600 hover:bg-orange-700">
              {editingTable ? "Зберегти" : "Додати стіл"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit menu item dialog */}
      {editingItem && (
        <EditMenuItemDialog open={showEditItem} item={editingItem} categories={categories} legalEntities={legalEntities} ingredients={fbIngredients} exciseRates={exciseRates}
          onClose={() => { setShowEditItem(false); setEditingItem(null); }}
          onSave={async (data: any) => {
            const r = await apiFetch(`/items/${editingItem.id}`, { method: "PATCH", body: JSON.stringify(data) });
            if (r.ok) { toast({ title: "Страву оновлено" }); setShowEditItem(false); setEditingItem(null); loadItems(); }
          }} />
      )}

      {/* Category create/edit modal */}
      <Dialog open={showCatModal} onOpenChange={setShowCatModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingCat ? `Редагувати: ${editingCat.name}` : "Нова категорія"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Емодзі</Label>
                <Input value={catForm.emoji} onChange={e => setCatForm(f => ({ ...f, emoji: e.target.value }))} className="text-center text-xl" maxLength={4} />
              </div>
              <div className="col-span-2"><Label className="text-xs">Назва *</Label>
                <Input placeholder="Основні страви" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCatModal(false)}>Скасувати</Button>
            <Button disabled={!catForm.name} onClick={saveCat} className="bg-orange-600 hover:bg-orange-700">
              {editingCat ? "Зберегти" : "Додати категорію"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ── Add item to order dialog ──────────────────────────────────────────────────
function AddItemDialog({ open, onClose, items, categories, onAdd }: any) {
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState("");

  const filtered = items.filter((it: any) => {
    if (!it.isAvailable) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (catFilter !== "all" && String(it.categoryId) !== catFilter) return false;
    return true;
  });

  const setQty = (id: number, qty: number) => setQuantities(q => ({ ...q, [id]: Math.max(0, qty) }));
  const total = Object.entries(quantities).reduce((s, [id, qty]) => {
    const item = items.find((it: any) => it.id === parseInt(id));
    return s + (item ? parseFloat(item.price) * qty : 0);
  }, 0);
  const selectedItems = Object.entries(quantities).filter(([, qty]) => qty > 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>Додати позиції</DialogTitle></DialogHeader>
        <div className="flex gap-2 flex-shrink-0">
          <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><Input className="pl-9 h-9" placeholder="Пошук…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Всі</SelectItem>{categories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.emoji} {c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="overflow-y-auto flex-1 space-y-1 py-1">
          {filtered.map((it: any) => (
            <div key={it.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium">{it.name}</span>
                  {it.isPopular && <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />}
                </div>
                <span className="text-xs font-bold text-orange-600">{parseFloat(it.price).toLocaleString()} ₴</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setQty(it.id, (quantities[it.id] || 0) - 1)} className="w-7 h-7 rounded-full border flex items-center justify-center text-gray-600 hover:bg-gray-100"><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-6 text-center text-sm font-medium">{quantities[it.id] || 0}</span>
                <button onClick={() => setQty(it.id, (quantities[it.id] || 0) + 1)} className="w-7 h-7 rounded-full border flex items-center justify-center bg-orange-600 text-white hover:bg-orange-700"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
        {selectedItems.length > 0 && (
          <div className="border-t pt-2 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">{selectedItems.length} позицій · {total.toLocaleString()} ₴</span>
            </div>
            <div><Label className="text-xs">Примітки до позицій</Label><Input className="h-8 text-sm" placeholder="Без цибулі…" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          </div>
        )}
        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button className="bg-orange-600 hover:bg-orange-700" disabled={selectedItems.length === 0}
            onClick={async () => {
              for (const [id, qty] of selectedItems) if (qty > 0) await onAdd(parseInt(id), qty, notes);
              setQuantities({}); setNotes(""); onClose();
            }}>Додати ({selectedItems.length})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── New order dialog ──────────────────────────────────────────────────────────
function NewOrderDialog({ open, onClose, tables, defaultTable, onSave }: any) {
  const [form, setForm] = useState({ orderType: "dine_in", tableId: "", guestName: "", roomNumber: "", guestCount: 2, notes: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && defaultTable) setForm(f => ({ ...f, tableId: String(defaultTable.id), orderType: "dine_in" }));
  }, [open, defaultTable]);

  const handleSubmit = async () => {
    setLoading(true);
    await onSave({ ...form, tableId: form.tableId ? parseInt(form.tableId) : null, guestCount: parseInt(String(form.guestCount)) });
    setLoading(false);
  };

  const freeTables = tables.filter((t: any) => t.status === "free");
  const needsTable = form.orderType === "dine_in" || form.orderType === "bar";
  const needsRoom = form.orderType === "room_service";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Нове замовлення</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Тип замовлення</Label>
            <Select value={form.orderType} onValueChange={v => setForm(f => ({ ...f, orderType: v, tableId: "", roomNumber: "" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ORDER_TYPE_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {needsTable && (
            <div><Label>Стіл</Label>
              <Select value={form.tableId} onValueChange={v => setForm(f => ({ ...f, tableId: v }))}>
                <SelectTrigger><SelectValue placeholder="Оберіть вільний стіл" /></SelectTrigger>
                <SelectContent>{freeTables.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>Стіл {t.number} — {t.location} ({t.capacity} ос.)</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {needsRoom && (
            <div><Label>Номер кімнати</Label><Input placeholder="205" value={form.roomNumber} onChange={e => setForm(f => ({ ...f, roomNumber: e.target.value }))} /></div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Гість</Label><Input placeholder="Ім'я або прізвище" value={form.guestName} onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))} /></div>
            <div><Label>Кількість осіб</Label><Input type="number" min={1} value={form.guestCount} onChange={e => setForm(f => ({ ...f, guestCount: parseInt(e.target.value) }))} /></div>
          </div>
          <div><Label>Примітки</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-orange-600 hover:bg-orange-700">{loading ? "…" : "Відкрити замовлення"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── New menu item dialog ──────────────────────────────────────────────────────
const BASE_WH = (import.meta.env.BASE_URL?.replace(/\/$/, "") || "").replace("/maison-hd", "") + "/api/fb/warehouse";
const whFetch = (path: string, opts: RequestInit = {}) =>
  fetch(BASE_WH + path, { ...opts, headers: { "Authorization": `Bearer ${localStorage.getItem("hms_token") || ""}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const VAT_OPTIONS = [
  { value: "0", label: "0% — без ПДВ" },
  { value: "7", label: "7% — пільговий" },
  { value: "20", label: "20% — стандартний" },
];

const STATION_OPTIONS = [
  { value: "kitchen_general",      label: "🍳 Кухня (загальна)" },
  { value: "kitchen_hot",          label: "🔥 Кухня (гаряча)" },
  { value: "kitchen_cold",         label: "🥗 Кухня (холодна)" },
  { value: "kitchen_confectionery",label: "🎂 Кондитерська" },
  { value: "bar",                  label: "🍸 Бар" },
];

const EXCISE_GROUP_LABELS: Record<string, string> = {
  soft_alc: "Слабоалкогольні напої (<8.5%)",
  beer_low:  "Пиво (до 8.5%)",
  beer_high: "Пиво (понад 8.5%)",
  wine:      "Вина, вермути (<22%)",
  spirits:   "Міцний алкоголь (>22%)",
};

function inferExciseGroup(abv: number): string {
  if (abv <= 0) return "";
  if (abv < 8.5)  return "beer_low";
  if (abv < 22)   return "wine";
  return "spirits";
}

function MenuItemForm({ form, setForm, categories, legalEntities = [], ingredients = [], exciseRates = [] }: any) {
  const [classifying, setClassifying] = useState(false);
  const { toast } = useToast();

  const selectedRate = exciseRates.find((r: any) => r.group_key === form.excise_group);
  const excisePreview = (form.volume_l && selectedRate)
    ? (parseFloat(form.volume_l) * parseFloat(selectedRate.rate_per_liter)).toFixed(2)
    : null;

  const classifyAlcohol = async () => {
    if (!form.name) return;
    setClassifying(true);
    try {
      const r = await whFetch("/ai/classify-alcohol", {
        method: "POST",
        body: JSON.stringify({
          product_name: form.name,
          description: form.description || "",
          alcohol_pct: parseFloat(form.alcohol_volume_pct) || null,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const inferredGroup = d.excise_group || (d.excise_rate_uah != null
          ? inferExciseGroup(parseFloat(form.alcohol_volume_pct) || 0)
          : form.excise_group);
        setForm((f: any) => ({
          ...f,
          uktzed_code: d.uktzed_code || f.uktzed_code,
          excise_group: inferredGroup || f.excise_group,
        }));
        toast({ title: "AI класифікація", description: `УКТЗЕД: ${d.uktzed_code || "—"}  Група: ${EXCISE_GROUP_LABELS[inferredGroup] || inferredGroup || "—"}` });
      }
    } finally {
      setClassifying(false);
    }
  };

  const [uploading, setUploading] = useState(false);
  const STORAGE_API = BASE.replace("/maison-hd", "") + "/api";

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast({ title: "Файл занадто великий", description: "Максимум 8 МБ", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const metaRes = await fetch(STORAGE_API + "/storage/uploads/request-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!metaRes.ok) throw new Error("Помилка отримання URL");
      const meta = await metaRes.json();
      await fetch(meta.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      const imageUrl = STORAGE_API + meta.objectPath;
      setForm((f: any) => ({ ...f, image_url: imageUrl }));
      toast({ title: "✅ Фото завантажено" });
    } catch {
      toast({ title: "Помилка завантаження фото", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <div><Label>Назва *</Label><Input placeholder="Борщ із пампушками" value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} /></div>
      <div><Label>Опис</Label><Textarea rows={2} value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} /></div>

      {/* Image upload */}
      <div className="border rounded-lg p-3 space-y-2 bg-sky-50/60">
        <Label className="text-sm font-medium text-sky-800">📸 Фото страви</Label>
        <div className="flex gap-3 items-start">
          {/* Preview */}
          <div className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-sky-200 bg-sky-100 flex items-center justify-center">
            {form.image_url && !form.image_url.startsWith("data:") ? (
              <>
                <img src={form.image_url} alt="preview" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setForm((f: any) => ({ ...f, image_url: "" }))}
                  className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow">×</button>
              </>
            ) : uploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
            ) : (
              <span className="text-2xl">🍽️</span>
            )}
          </div>
          <div className="flex-1 space-y-1.5">
            <Input
              placeholder="https://... або завантаж файл"
              value={form.image_url?.startsWith("data:") ? "" : (form.image_url || "")}
              onChange={e => setForm((f: any) => ({ ...f, image_url: e.target.value }))}
              className="text-xs h-8"
            />
            <label className={`cursor-pointer inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${uploading ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed" : "bg-white border-sky-300 text-sky-700 hover:bg-sky-50"}`}>
              {uploading ? <><Loader2 className="w-3 h-3 animate-spin" /> Завантаження...</> : "📁 Завантажити файл"}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageFile} disabled={uploading} />
            </label>
            <p className="text-[10px] text-sky-600/70">Підтримує JPG, PNG, WebP · до 8 МБ</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Категорія</Label>
          <Select value={String(form.categoryId || "")} onValueChange={v => setForm((f: any) => ({ ...f, categoryId: v }))}>
            <SelectTrigger><SelectValue placeholder="Оберіть" /></SelectTrigger>
            <SelectContent>{categories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.emoji} {c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Ціна (₴) *</Label><Input type="number" value={form.price} onChange={e => setForm((f: any) => ({ ...f, price: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Час приготування (хв)</Label><Input type="number" value={form.cookMinutes} onChange={e => setForm((f: any) => ({ ...f, cookMinutes: parseInt(e.target.value) || 15 }))} /></div>
        <div><Label>Ставка ПДВ</Label>
          <Select value={String(form.vat_rate ?? "20")} onValueChange={v => setForm((f: any) => ({ ...f, vat_rate: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{VAT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Station + Legal entity */}
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Станція приготування</Label>
          <Select value={form.station || "kitchen_general"} onValueChange={v => setForm((f: any) => ({ ...f, station: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Юридична особа</Label>
          <Select value={form.legal_entity_id ? String(form.legal_entity_id) : "none"} onValueChange={v => setForm((f: any) => ({ ...f, legal_entity_id: v === "none" ? null : parseInt(v) }))}>
            <SelectTrigger><SelectValue placeholder="Авто" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Авто / не вказано</SelectItem>
              {legalEntities.map((le: any) => (
                <SelectItem key={le.id} value={String(le.id)}>
                  {le.short_name || le.name} ({le.type?.toUpperCase()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stock deduction: пряме списання штучного товару */}
      <div className="border rounded-lg p-3 space-y-1.5 bg-green-50/60">
        <div className="flex items-center gap-2 text-sm font-medium text-green-800">
          <span>📦</span> Списання зі складу (штучний товар)
        </div>
        <p className="text-xs text-green-700 leading-snug">
          Якщо ця позиція є готовим товаром (Кока-кола, вода, пиво тощо) — оберіть інгредієнт на складі.
          При продажу буде автоматично списано 1 одиницю × кількість замовлення.
          Якщо страва має тех. картку — це поле не потрібне.
        </p>
        <Select
          value={form.ingredient_id ? String(form.ingredient_id) : "none"}
          onValueChange={v => setForm((f: any) => ({ ...f, ingredient_id: v === "none" ? null : parseInt(v) }))}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="— Не прив'язано (є тех. картка або послуга)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Не прив'язано</SelectItem>
            {ingredients.map((ing: any) => (
              <SelectItem key={ing.id} value={String(ing.id)}>
                {ing.name} ({ing.current_stock} {ing.unit})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Alcohol section */}
      <div className="border rounded-lg p-3 space-y-2 bg-amber-50/60">
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input type="checkbox" className="accent-amber-600" checked={!!form.is_alcohol} onChange={e => setForm((f: any) => ({ ...f, is_alcohol: e.target.checked }))} />
          🍺 Алкогольний напій (підакцизний товар)
        </label>
        {form.is_alcohol && (
          <div className="space-y-2 pt-1">
            {/* Row 1: excise group */}
            <div>
              <Label className="text-xs">Група акцизу *</Label>
              <Select value={form.excise_group || ""} onValueChange={v => setForm((f: any) => ({ ...f, excise_group: v }))}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="Оберіть групу…" /></SelectTrigger>
                <SelectContent>
                  {exciseRates.map((r: any) => (
                    <SelectItem key={r.group_key} value={r.group_key}>
                      {EXCISE_GROUP_LABELS[r.group_key] || r.group_name}
                      <span className="ml-2 text-muted-foreground">{r.rate_per_liter} грн/л</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Row 2: volume + ABV */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Об'єм пляшки/порції (л)</Label>
                <Input type="number" min="0" step="0.001" placeholder="0.500" value={form.volume_l || ""}
                  onChange={e => setForm((f: any) => ({ ...f, volume_l: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Міцність (% об.)</Label>
                <Input type="number" min="0" max="100" step="0.1" placeholder="5.0" value={form.alcohol_volume_pct || ""}
                  onChange={e => setForm((f: any) => ({ ...f, alcohol_volume_pct: e.target.value }))} />
              </div>
            </div>
            {/* Row 3: UKTZED + excise preview */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">УКТЗЕД код</Label>
                <Input placeholder="2203001000" value={form.uktzed_code || ""} onChange={e => setForm((f: any) => ({ ...f, uktzed_code: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Акциз на порцію</Label>
                <div className={`flex items-center h-9 px-3 rounded-md border text-sm font-mono ${excisePreview ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-white border-input text-muted-foreground"}`}>
                  {excisePreview ? `≈ ${excisePreview} грн` : "—"}
                </div>
              </div>
            </div>
            {/* Requires stamp badge */}
            {selectedRate?.requires_stamp && (
              <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                🏷️ <strong>Обов'язкова акцизна марка</strong> (МРЦ діє)
              </div>
            )}
            <Button type="button" variant="outline" size="sm" disabled={classifying || !form.name} onClick={classifyAlcohol} className="w-full text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
              {classifying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
              AI: Визначити УКТЗЕД та групу автоматично
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!form.isVegetarian} onChange={e => setForm((f: any) => ({ ...f, isVegetarian: e.target.checked }))} />🌿 Вегетаріанське</label>
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!form.isPopular} onChange={e => setForm((f: any) => ({ ...f, isPopular: e.target.checked }))} />⭐ Популярне</label>
      </div>
    </div>
  );
}

const EMPTY_ITEM_FORM = { name: "", description: "", categoryId: "", price: "", cookMinutes: 15, isVegetarian: false, isPopular: false, vat_rate: "20", is_alcohol: false, alcohol_volume_pct: "", uktzed_code: "", excise_code: "", excise_group: "", volume_l: "", station: "kitchen_general", legal_entity_id: null, ingredient_id: null, image_url: "" };

function NewMenuItemDialog({ open, onClose, categories, legalEntities, ingredients, exciseRates, onSave }: any) {
  const [form, setForm] = useState<any>(EMPTY_ITEM_FORM);
  const [loading, setLoading] = useState(false);
  const handleSubmit = async () => {
    if (!form.name || !form.price) return;
    setLoading(true);
    await onSave({
      ...form,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      cookMinutes: parseInt(String(form.cookMinutes)) || 15,
      vat_rate: parseInt(form.vat_rate) || 20,
      alcohol_volume_pct: form.alcohol_volume_pct ? parseFloat(form.alcohol_volume_pct) : null,
      volume_l: form.volume_l ? parseFloat(form.volume_l) : null,
      excise_group: form.excise_group || null,
      ingredient_id: form.ingredient_id ?? null,
      imageUrl: form.image_url || null,
    });
    setLoading(false);
    setForm(EMPTY_ITEM_FORM);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Нова страва / позиція меню</DialogTitle></DialogHeader>
        <MenuItemForm form={form} setForm={setForm} categories={categories} legalEntities={legalEntities} ingredients={ingredients} exciseRates={exciseRates} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading || !form.name || !form.price} className="bg-orange-600 hover:bg-orange-700">{loading ? "…" : "Додати"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit menu item dialog ─────────────────────────────────────────────────────
function EditMenuItemDialog({ open, item, onClose, categories, legalEntities, ingredients, exciseRates, onSave }: any) {
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item) setForm({
      name: item.name || "",
      description: item.description || "",
      categoryId: item.categoryId ? String(item.categoryId) : "",
      price: item.price || "",
      cookMinutes: item.cookMinutes || 15,
      isVegetarian: !!item.isVegetarian,
      isPopular: !!item.isPopular,
      vat_rate: String(item.vat_rate ?? "20"),
      is_alcohol: !!item.is_alcohol,
      alcohol_volume_pct: item.alcohol_volume_pct != null ? String(item.alcohol_volume_pct) : "",
      uktzed_code: item.uktzed_code || "",
      excise_code: item.excise_code || "",
      excise_group: item.excise_group || "",
      volume_l: item.volume_l != null ? String(item.volume_l) : "",
      station: item.station || "kitchen_general",
      legal_entity_id: item.legal_entity_id || null,
      ingredient_id: item.ingredient_id ?? null,
      image_url: item.image_url || "",
    });
  }, [item]);

  const handleSubmit = async () => {
    if (!form.name || !form.price) return;
    setLoading(true);
    await onSave({
      ...form,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      cookMinutes: parseInt(String(form.cookMinutes)) || 15,
      vat_rate: parseInt(form.vat_rate) || 20,
      alcohol_volume_pct: form.alcohol_volume_pct ? parseFloat(form.alcohol_volume_pct) : null,
      volume_l: form.volume_l ? parseFloat(form.volume_l) : null,
      excise_group: form.excise_group || null,
      ingredient_id: form.ingredient_id ?? null,
      imageUrl: form.image_url || null,
    });
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Редагувати: {item?.name}</DialogTitle></DialogHeader>
        <MenuItemForm form={form} setForm={setForm} categories={categories} legalEntities={legalEntities} ingredients={ingredients} exciseRates={exciseRates} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading || !form.name || !form.price} className="bg-orange-600 hover:bg-orange-700">{loading ? "…" : "Зберегти зміни"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
