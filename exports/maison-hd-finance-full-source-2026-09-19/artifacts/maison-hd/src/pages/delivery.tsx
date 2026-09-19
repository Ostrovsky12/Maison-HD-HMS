import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Truck, Plus, Minus, X, Phone, MapPin, Clock, RefreshCw,
  Loader2, ChevronRight, Package, CheckCircle2, UtensilsCrossed,
  Search, CreditCard, Banknote, ShoppingBag,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = BASE.replace(/\/maison-hd$/, "") + "/api";
const tok  = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(API + "/fb" + path, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts?.headers || {}) } });

const fmtMoney = (n: any) => parseFloat(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2 }) + " ₴";
const elapsed = (d: string) => {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${mins} хв`;
  return `${Math.floor(mins / 60)} год ${mins % 60} хв`;
};

type Order = {
  id: number; guestName?: string; notes?: string; status: string;
  totalAmount: string; openedAt: string; createdAt: string;
  items?: OrderItem[];
};
type OrderItem = { id: number; name: string; quantity: number; price: string; total_price: string; notes?: string };
type MenuItem = { id: number; name: string; price: string; categoryId?: number; imageUrl?: string; image_url?: string };
type Category = { id: number; name: string; emoji: string };

type CartLine = { itemId: number; name: string; price: string; quantity: number; notes: string };

const STATUS_COLS: { key: string; label: string; color: string; icon: any; next?: string; nextLabel?: string }[] = [
  { key: "open",       label: "Нові",       color: "border-amber-400 bg-amber-50",   icon: ShoppingBag,   next: "in_kitchen", nextLabel: "Передати на кухню" },
  { key: "in_kitchen", label: "Готується",  color: "border-blue-400 bg-blue-50",     icon: UtensilsCrossed, next: "ready",    nextLabel: "Готово" },
  { key: "ready",      label: "Готово",     color: "border-emerald-400 bg-emerald-50", icon: Package,       next: "served",   nextLabel: "Видано кур'єру" },
  { key: "served",     label: "В доставці", color: "border-purple-400 bg-purple-50", icon: Truck,         next: "billed",   nextLabel: "Закрити / Оплачено" },
];
const DONE_STATUSES = ["billed", "cancelled"];

function parseNotes(notes?: string) {
  if (!notes) return { address: "", phone: "", comment: "" };
  const address = notes.match(/📍\s*(.+)/)?.[1] || "";
  const phone   = notes.match(/📞\s*(.+)/)?.[1] || "";
  const comment = notes.replace(/📍.+(\n|$)?/g, "").replace(/📞.+(\n|$)?/g, "").trim();
  return { address, phone, comment };
}
function buildNotes(address: string, phone: string, comment: string) {
  const parts: string[] = [];
  if (address) parts.push(`📍 ${address}`);
  if (phone)   parts.push(`📞 ${phone}`);
  if (comment) parts.push(comment);
  return parts.join("\n");
}

// ── Order Card ────────────────────────────────────────────────────────────────
function OrderCard({ order, onAdvance, onCancel, onLoadItems }: {
  order: Order;
  onAdvance: (id: number, status: string) => void;
  onCancel: (id: number) => void;
  onLoadItems: (id: number) => void;
}) {
  const { address, phone, comment } = parseNotes(order.notes || "");
  const col = STATUS_COLS.find(c => c.key === order.status);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-white rounded-2xl border-2 ${col?.color || "border-stone-200 bg-white"} shadow-sm p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-stone-900 text-sm">#{order.id}</span>
            {order.guestName && <span className="text-stone-700 text-sm">{order.guestName}</span>}
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-stone-400">
            <Clock className="w-3 h-3" />
            {elapsed(order.openedAt || order.createdAt)} тому
          </div>
        </div>
        <span className="font-bold text-stone-900 text-sm shrink-0">{fmtMoney(order.totalAmount)}</span>
      </div>

      {/* Contact info */}
      {(address || phone) && (
        <div className="space-y-1">
          {address && (
            <div className="flex items-start gap-1.5 text-xs text-stone-600">
              <MapPin className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              <span>{address}</span>
            </div>
          )}
          {phone && (
            <div className="flex items-center gap-1.5 text-xs text-stone-600">
              <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <a href={`tel:${phone}`} className="hover:text-emerald-600 transition-colors">{phone}</a>
            </div>
          )}
          {comment && (
            <p className="text-xs text-stone-500 italic">{comment}</p>
          )}
        </div>
      )}

      {/* Items toggle */}
      <button
        onClick={() => { setExpanded(!expanded); if (!expanded) onLoadItems(order.id); }}
        className="text-[11px] text-stone-400 hover:text-stone-600 flex items-center gap-1 transition-colors"
      >
        <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
        {expanded ? "Сховати позиції" : "Показати позиції"}
      </button>
      {expanded && order.items && (
        <div className="space-y-1 bg-stone-50 rounded-xl p-2">
          {order.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between text-xs text-stone-700">
              <span>{it.quantity}× {it.name}</span>
              <span className="font-medium">{fmtMoney(it.total_price)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {col?.next && (
          <button
            onClick={() => onAdvance(order.id, col.next!)}
            className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            {col.nextLabel}
          </button>
        )}
        <button
          onClick={() => onCancel(order.id)}
          className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-red-50 text-stone-400 hover:text-red-500 text-xs font-medium transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── New Order Dialog ──────────────────────────────────────────────────────────
function NewOrderDialog({ open, onClose, categories, menuItems, onCreated }: {
  open: boolean; onClose: () => void;
  categories: Category[]; menuItems: MenuItem[];
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeCat, setActiveCat] = useState<number | null>(null);

  const reset = () => { setName(""); setPhone(""); setAddress(""); setComment(""); setCart([]); setSearch(""); setActiveCat(null); };

  const filteredItems = menuItems.filter(it => {
    const matchCat = !activeCat || it.categoryId === activeCat;
    const matchQ = !search || it.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  const addItem = (item: MenuItem) => {
    setCart(prev => {
      const ex = prev.find(c => c.itemId === item.id);
      if (ex) return prev.map(c => c.itemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { itemId: item.id, name: item.name, price: item.price, quantity: 1, notes: "" }];
    });
  };
  const removeItem = (itemId: number) => setCart(prev => {
    const ex = prev.find(c => c.itemId === itemId);
    if (ex && ex.quantity > 1) return prev.map(c => c.itemId === itemId ? { ...c, quantity: c.quantity - 1 } : c);
    return prev.filter(c => c.itemId !== itemId);
  });
  const cartQty = (id: number) => cart.find(c => c.itemId === id)?.quantity || 0;
  const total = cart.reduce((s, c) => s + parseFloat(c.price) * c.quantity, 0);

  const handleCreate = async () => {
    if (!cart.length) { toast({ title: "Додайте хоча б одну позицію", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const notes = buildNotes(address, phone, comment);
      const orderRes = await apiFetch("/orders", {
        method: "POST",
        body: JSON.stringify({ orderType: "takeaway", guestName: name || "Клієнт", guestCount: 1, notes }),
      });
      if (!orderRes.ok) throw new Error("Помилка створення замовлення");
      const { order } = await orderRes.json();
      for (const line of cart) {
        await apiFetch(`/orders/${order.id}/items`, {
          method: "POST",
          body: JSON.stringify({ itemId: line.itemId, quantity: line.quantity, notes: line.notes || undefined }),
        });
      }
      toast({ title: `✅ Замовлення #${order.id} створено` });
      onCreated();
      reset();
      onClose();
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-500" /> Нове замовлення доставки
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: customer + menu */}
          <div className="flex-1 flex flex-col overflow-hidden border-r">
            {/* Customer info */}
            <div className="px-5 py-3 border-b space-y-2 shrink-0">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Ім'я клієнта" value={name} onChange={e => setName(e.target.value)} className="text-sm" />
                <Input placeholder="📞 Телефон" value={phone} onChange={e => setPhone(e.target.value)} type="tel" className="text-sm" />
              </div>
              <Input placeholder="📍 Адреса доставки" value={address} onChange={e => setAddress(e.target.value)} className="text-sm" />
              <Input placeholder="Коментар (без соусу, до під'їзду 3...)" value={comment} onChange={e => setComment(e.target.value)} className="text-sm" />
            </div>

            {/* Category tabs */}
            <div className="flex gap-1.5 px-4 py-2 overflow-x-auto shrink-0 border-b">
              <button
                onClick={() => setActiveCat(null)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${!activeCat ? "bg-indigo-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
              >Всі</button>
              {categories.map(cat => (
                <button key={cat.id}
                  onClick={() => setActiveCat(cat.id)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeCat === cat.id ? "bg-indigo-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
                >
                  {cat.emoji} {cat.name}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="px-4 py-2 border-b shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук страв..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-stone-100 rounded-lg border-0 outline-none focus:ring-1 focus:ring-indigo-400" />
              </div>
            </div>

            {/* Menu items grid */}
            <div className="flex-1 overflow-y-auto px-4 py-3 grid grid-cols-2 gap-2 content-start">
              {filteredItems.map(item => {
                const qty = cartQty(item.id);
                return (
                  <div key={item.id}
                    className={`bg-stone-50 rounded-xl p-2.5 flex flex-col gap-1.5 border transition-all ${qty > 0 ? "border-indigo-300 bg-indigo-50" : "border-transparent"}`}>
                    {(item.imageUrl || item.image_url) && (
                      <div className="w-full aspect-video rounded-lg overflow-hidden bg-stone-200">
                        <img src={item.imageUrl || item.image_url} alt={item.name}
                          className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      </div>
                    )}
                    <p className="text-xs font-medium text-stone-800 leading-snug line-clamp-2">{item.name}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-600">{fmtMoney(item.price)}</span>
                      {qty === 0 ? (
                        <button onClick={() => addItem(item)}
                          className="w-6 h-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center justify-center transition-colors">
                          <Plus className="w-3 h-3" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={() => removeItem(item.id)}
                            className="w-5 h-5 bg-stone-200 rounded flex items-center justify-center text-stone-600">
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="w-4 text-center text-xs font-bold text-stone-800">{qty}</span>
                          <button onClick={() => addItem(item)}
                            className="w-5 h-5 bg-indigo-600 rounded flex items-center justify-center text-white">
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: cart */}
          <div className="w-56 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Кошик</p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {cart.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingBag className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                  <p className="text-xs text-stone-400">Оберіть страви</p>
                </div>
              ) : cart.map(line => (
                <div key={line.itemId} className="flex items-start gap-1.5">
                  <div className="flex items-center gap-1">
                    <button onClick={() => removeItem(line.itemId)}
                      className="w-5 h-5 bg-stone-100 rounded flex items-center justify-center text-stone-500 hover:bg-red-100 hover:text-red-500">
                      <Minus className="w-2.5 h-2.5" />
                    </button>
                    <span className="w-4 text-center text-xs font-bold text-stone-700">{line.quantity}</span>
                    <button onClick={() => addItem({ id: line.itemId, name: line.name, price: line.price })}
                      className="w-5 h-5 bg-stone-100 rounded flex items-center justify-center text-stone-500 hover:bg-indigo-100 hover:text-indigo-600">
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-stone-800 leading-snug line-clamp-2">{line.name}</p>
                    <p className="text-xs text-stone-500">{fmtMoney(parseFloat(line.price) * line.quantity)}</p>
                  </div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="px-4 py-3 border-t">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-stone-500">Всього</span>
                  <span className="text-sm font-bold text-stone-900">{fmtMoney(total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Скасувати</Button>
          <Button onClick={handleCreate} disabled={saving || !cart.length}
            className="bg-indigo-600 hover:bg-indigo-500 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Truck className="w-4 h-4 mr-2" />}
            Створити замовлення
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DeliveryPage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ordRes, catRes, itemRes] = await Promise.all([
        apiFetch("/orders?type=takeaway&open=true").then(r => r.json()),
        apiFetch("/categories").then(r => r.json()),
        apiFetch("/items").then(r => r.json()),
      ]);
      setOrders(ordRes.orders || []);
      setCategories(catRes.categories || []);
      setMenuItems(itemRes.items || []);
    } catch { /**/ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(() => {
      apiFetch("/orders?type=takeaway&open=true").then(r => r.json()).then(d => setOrders(d.orders || [])).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const loadItems = async (orderId: number) => {
    try {
      const r = await apiFetch(`/orders/${orderId}`).then(r => r.json());
      if (r.order) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: r.order.items || [] } : o));
      }
    } catch { /**/ }
  };

  const advance = async (id: number, status: string) => {
    try {
      const r = await apiFetch(`/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!r.ok) throw new Error();
      if (DONE_STATUSES.includes(status)) {
        setOrders(prev => prev.filter(o => o.id !== id));
        toast({ title: `✅ Замовлення #${id} закрито` });
      } else {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
        const col = STATUS_COLS.find(c => c.key === status);
        toast({ title: `Замовлення #${id} → ${col?.label}` });
      }
    } catch {
      toast({ title: "Помилка", variant: "destructive" });
    }
  };

  const cancel = async (id: number) => {
    if (!confirm(`Скасувати замовлення #${id}?`)) return;
    await advance(id, "cancelled");
  };

  const activeOrders = orders.filter(o => !DONE_STATUSES.includes(o.status));
  const statsByCol = STATUS_COLS.map(col => ({
    ...col,
    orders: activeOrders.filter(o => o.status === col.key),
  }));

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-[#f8f9fc]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-white shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-500" />
            <span className="font-semibold text-stone-800">Доставка</span>
            {activeOrders.length > 0 && (
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
                {activeOrders.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
            <button onClick={() => load()}
              className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors">
              <RefreshCw className="w-3.5 h-3.5 text-stone-500" />
            </button>
            <button
              onClick={() => setNewOrderOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Нове замовлення
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          </div>
        ) : (
          /* Kanban columns */
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-4 h-full p-4 min-w-max">
              {statsByCol.map(col => {
                const Icon = col.icon;
                return (
                  <div key={col.key} className="w-72 flex flex-col shrink-0">
                    {/* Column header */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border-2 border-b-0 ${col.color}`}>
                      <Icon className="w-4 h-4 text-stone-600" />
                      <span className="text-sm font-semibold text-stone-700">{col.label}</span>
                      <span className="ml-auto bg-white/70 text-stone-600 text-xs font-bold px-2 py-0.5 rounded-full">
                        {col.orders.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className={`flex-1 overflow-y-auto border-2 border-t-0 ${col.color} rounded-b-xl p-2 space-y-2`}>
                      {col.orders.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-stone-300">
                          <p className="text-xs">Порожньо</p>
                        </div>
                      ) : col.orders.map(order => (
                        <OrderCard key={order.id} order={order}
                          onAdvance={advance} onCancel={cancel} onLoadItems={loadItems} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <NewOrderDialog
        open={newOrderOpen}
        onClose={() => setNewOrderOpen(false)}
        categories={categories}
        menuItems={menuItems}
        onCreated={load}
      />
    </AppLayout>
  );
}
