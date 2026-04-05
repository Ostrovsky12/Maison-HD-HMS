import { useState, useEffect, useCallback, useRef } from "react";
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
  const [stats, setStats] = useState<any>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
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
  const loadOrderDetail = async (id: number) => { const r = await apiFetch(`/orders/${id}`); if (r.ok) { const d = await r.json(); setOrderDetail(d); } };
  const loadKitchen = useCallback(async () => {
    setKitchenLoading(true);
    const r = await apiFetch("/kitchen");
    if (r.ok) { const d = await r.json(); setKitchenOrders(d.orders || []); }
    setKitchenLoading(false);
  }, []);

  useEffect(() => { loadStats(); loadTables(); loadCategories(); loadItems(); }, []);
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
          <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => { setNewOrderTable(null); setShowNewOrder(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Нове замовлення
          </Button>
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
          <div className="space-y-6">
            {Object.entries(groupedTables).map(([location, tbls]) => (
              <div key={location}>
                <h3 className="font-semibold text-gray-700 mb-3 text-sm">{location}</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {tbls.map((tbl: any) => (
                    <button key={tbl.id} onClick={() => handleTableClick(tbl)}
                      className={`relative p-3 rounded-xl border-2 text-center transition-all hover:shadow-md ${TABLE_STATUS_COLORS[tbl.status]} ${tbl.status === "free" ? "hover:border-green-500" : "hover:border-current"}`}>
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
                  ))}
                </div>
              </div>
            ))}
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
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input className="pl-9" placeholder="Пошук по меню…" value={menuSearch} onChange={e => setMenuSearch(e.target.value)} />
              </div>
              <Select value={menuCatFilter} onValueChange={setMenuCatFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Категорія" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі категорії</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.emoji} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => setShowNewItem(true)}><Plus className="h-4 w-4 mr-1" />Страва</Button>
            </div>

            {Object.entries(groupedItems).map(([cat, catItems]) => (
              <div key={cat}>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">{cat}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(catItems as any[]).map((it: any) => (
                    <div key={it.id} className={`flex items-center gap-3 p-3 rounded-xl border ${it.isAvailable ? "bg-white border-gray-100" : "bg-gray-50 border-gray-200 opacity-60"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm">{it.name}</span>
                          {it.isPopular && <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />}
                          {it.isVegetarian && <span className="text-xs">🌿</span>}
                          {!it.isAvailable && <Badge variant="outline" className="text-xs text-gray-400">Немає</Badge>}
                        </div>
                        {it.description && <p className="text-xs text-gray-500 truncate">{it.description}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-bold text-orange-600">{parseFloat(it.price).toLocaleString()} ₴</span>
                          {it.cookMinutes && <span className="text-xs text-gray-400 flex items-center gap-0.5"><Clock className="h-3 w-3" />{it.cookMinutes} хв</span>}
                        </div>
                      </div>
                      <button className="text-xs px-2 py-1 rounded-lg border transition hover:border-orange-300"
                        onClick={async () => {
                          await apiFetch(`/items/${it.id}`, { method: "PATCH", body: JSON.stringify({ isAvailable: !it.isAvailable }) });
                          loadItems();
                        }}>
                        {it.isAvailable ? "✓ Є" : "○ Немає"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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

      <NewMenuItemDialog open={showNewItem} categories={categories} onClose={() => setShowNewItem(false)}
        onSave={async (data: any) => {
          const r = await apiFetch("/items", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Страву додано" }); setShowNewItem(false); loadItems(); }
        }} />
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
function NewMenuItemDialog({ open, onClose, categories, onSave }: any) {
  const [form, setForm] = useState({ name: "", description: "", categoryId: "", price: "", cookMinutes: 15, isVegetarian: false, isPopular: false, tags: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.name || !form.price) return;
    setLoading(true);
    await onSave({
      ...form,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      cookMinutes: parseInt(String(form.cookMinutes)),
      tags: form.tags.split(",").map((s: string) => s.trim()).filter(Boolean),
    });
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Нова страва / позиція меню</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Назва *</Label><Input placeholder="Борщ із пампушками" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><Label>Опис</Label><Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Категорія</Label>
              <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                <SelectTrigger><SelectValue placeholder="Оберіть" /></SelectTrigger>
                <SelectContent>{categories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.emoji} {c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Ціна (₴) *</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
          </div>
          <div><Label>Час приготування (хв)</Label><Input type="number" value={form.cookMinutes} onChange={e => setForm(f => ({ ...f, cookMinutes: parseInt(e.target.value) }))} /></div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.isVegetarian} onChange={e => setForm(f => ({ ...f, isVegetarian: e.target.checked }))} />🌿 Вегетаріанське</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.isPopular} onChange={e => setForm(f => ({ ...f, isPopular: e.target.checked }))} />⭐ Популярне</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-orange-600 hover:bg-orange-700">{loading ? "…" : "Додати"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
