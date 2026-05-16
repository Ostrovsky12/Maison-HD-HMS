import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  Bell, CheckCircle2, XCircle, Clock, ShoppingBag, RefreshCw,
  Wifi, Printer, ChefHat, Wine, ChevronDown, ChevronUp,
  Plus, CreditCard, Banknote, Search, X, UtensilsCrossed,
} from "lucide-react";

// ─── API ──────────────────────────────────────────────────────────────────────
const API = "/api/fb";
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
  return r.json();
}

// ─── Sound ────────────────────────────────────────────────────────────────────
function playAlert() {
  try {
    const ctx = new AudioContext();
    const freqs = [880, 1100, 880, 1100];
    freqs.forEach((freq, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.type = "square";
      g.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.14);
      o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.14);
    });
  } catch {}
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff} сек тому`;
  if (diff < 3600) return `${Math.floor(diff / 60)} хв тому`;
  return `${Math.floor(diff / 3600)} год тому`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderItem { id: number; name: string; quantity: number; price: string; total_price: string; notes?: string; }
interface GuestOrder {
  id: number; status: string; guest_name: string; guest_count: number;
  notes?: string; total_amount: string; opened_at: string;
  table_number?: string; table_location?: string;
  items: OrderItem[];
}
interface ActiveOrder {
  id: number; status: string; order_type: string; guest_name: string;
  total_amount: string; opened_at: string;
  tableNumber?: string | null; tableId?: number | null;
  items?: OrderItem[];
}
interface MenuItem { id: number; name: string; price: string; categoryName: string; }
interface PrintJob {
  id: number; printer_type: string; station: string; status: string;
  printer_name?: string; error_msg?: string; printed_at?: string;
}
interface AcceptedOrder extends GuestOrder { printJobs?: PrintJob[]; acceptedAt: Date; }

// ─── Print Badge ──────────────────────────────────────────────────────────────
const PTYPE: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  kitchen: { label: "Кухня", icon: <ChefHat className="w-3 h-3" />, color: "orange" },
  bar:     { label: "Бар",   icon: <Wine     className="w-3 h-3" />, color: "purple" },
  receipt: { label: "Чек",   icon: <Printer  className="w-3 h-3" />, color: "blue"   },
};
const PSTYLE: Record<string, string> = {
  queued: "bg-yellow-50 text-yellow-700 border-yellow-200",
  printing: "bg-blue-50 text-blue-700 border-blue-200",
  done: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};
function PrintJobBadge({ job }: { job: PrintJob }) {
  const info = PTYPE[job.printer_type] || { label: job.printer_type, icon: <Printer className="w-3 h-3" />, color: "gray" };
  return (
    <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${PSTYLE[job.status] || PSTYLE.queued}`}>
      {info.icon}<span>{info.label}</span><span className="opacity-60">·</span>
      <span>{{ queued: "очікує", printing: "друкує", done: "надруковано", failed: "помилка" }[job.status] || job.status}</span>
    </div>
  );
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────
function AddItemModal({ orderId, onClose, onDone }: { orderId: number; onClose: () => void; onDone: () => void }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    apiFetch("/items?available=true").then(d => setItems(d.items || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = items.filter(it =>
    !search || it.name.toLowerCase().includes(search.toLowerCase()) || it.categoryName?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleAdd() {
    if (!selected) return;
    setAdding(true);
    try {
      await apiFetch(`/orders/${orderId}/items`, {
        method: "POST",
        body: JSON.stringify({ itemId: selected.id, quantity: qty }),
      });
      onDone();
    } catch (e: any) { alert("Помилка: " + e.message); }
    finally { setAdding(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h3 className="font-bold text-base">Додати страву</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-3 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)} autoFocus
              placeholder="Пошук страви..." className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Завантаження...</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Нічого не знайдено</div>
          ) : (
            <div className="space-y-1">
              {filtered.map(it => (
                <button key={it.id} onClick={() => setSelected(prev => prev?.id === it.id ? null : it)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${selected?.id === it.id ? "bg-amber-50 border-2 border-amber-400" : "hover:bg-gray-50 border border-transparent"}`}>
                  <div>
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs text-gray-400">{it.categoryName}</div>
                  </div>
                  <span className="font-bold text-gray-700 shrink-0 ml-2">{parseFloat(it.price).toFixed(0)} ₴</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <div className="p-4 border-t shrink-0">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-sm truncate pr-2">{selected.name}</span>
              <span className="font-bold">{(parseFloat(selected.price) * qty).toFixed(0)} ₴</span>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm text-gray-500">Кількість:</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-lg border font-bold text-lg hover:bg-gray-50 flex items-center justify-center">−</button>
                <span className="w-8 text-center font-bold">{qty}</span>
                <button onClick={() => setQty(q => q + 1)}
                  className="w-8 h-8 rounded-lg border font-bold text-lg hover:bg-gray-50 flex items-center justify-center">+</button>
              </div>
            </div>
            <button onClick={handleAdd} disabled={adding}
              className="w-full py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 disabled:opacity-40 transition-colors">
              {adding ? "Додаємо..." : `Додати до замовлення`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────
function PaymentModal({ order, onClose, onDone }: { order: ActiveOrder; onClose: () => void; onDone: () => void }) {
  const total = parseFloat(order.total_amount || "0");
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const [received, setReceived] = useState(total.toFixed(2));
  const [paying, setPaying] = useState(false);
  const change = Math.max(0, parseFloat(received || "0") - total);

  async function handlePay() {
    setPaying(true);
    try {
      await apiFetch(`/orders/${order.id}/pay`, {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: method,
          paidAmount: parseFloat(received || "0"),
        }),
      });
      onDone();
    } catch (e: any) { alert("Помилка оплати: " + e.message); }
    finally { setPaying(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-base">Оплата замовлення</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <div className="flex justify-between text-gray-500 mb-1">
              <span>Стіл {order.tableNumber || "—"}</span>
              <span>{order.guest_name}</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>До сплати:</span>
              <span className="text-green-700">{total.toFixed(2)} ₴</span>
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2">Спосіб оплати</div>
            <div className="grid grid-cols-2 gap-2">
              {(["cash", "card"] as const).map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold text-sm transition-colors ${method === m ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 hover:border-gray-300"}`}>
                  {m === "cash" ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                  {m === "cash" ? "Готівка" : "Картка"}
                </button>
              ))}
            </div>
          </div>
          {method === "cash" && (
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Отримано від гостя (₴)</label>
              <input type="number" value={received} onChange={e => setReceived(e.target.value)} step="0.01" min={total}
                className="w-full px-4 py-3 text-lg font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-right" />
              {change > 0 && (
                <div className="mt-2 text-center text-sm font-semibold text-amber-700 bg-amber-50 rounded-lg py-1.5">
                  Решта: {change.toFixed(2)} ₴
                </div>
              )}
            </div>
          )}
          <button onClick={handlePay} disabled={paying || (method === "cash" && parseFloat(received || "0") < total)}
            className="w-full py-3.5 bg-green-600 text-white font-bold rounded-xl text-base hover:bg-green-700 disabled:opacity-40 transition-colors shadow-md">
            {paying ? "Проводимо..." : "✓ Закрити замовлення"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Active Order Card ────────────────────────────────────────────────────────
function ActiveOrderCard({
  order, isExpanded, onToggle, onAddItem, onPay,
}: {
  order: ActiveOrder; isExpanded: boolean;
  onToggle: () => void; onAddItem: () => void; onPay: () => void;
}) {
  const statusColor = order.status === "open" ? "border-blue-200 bg-blue-50/30" : "border-gray-200 bg-white";
  return (
    <div className={`rounded-xl border-2 overflow-hidden transition-all ${statusColor}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/80 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-4 h-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm flex items-center gap-1.5">
              {order.tableNumber ? `Стіл ${order.tableNumber}` : order.order_type === "takeaway" ? "Takeaway" : "Замовлення"}
            </div>
            <div className="text-xs text-gray-500 truncate">{order.guest_name} · {timeAgo(order.opened_at)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="font-bold text-gray-800">{parseFloat(order.total_amount || "0").toFixed(0)} ₴</span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {isExpanded && (
        <div className="border-t border-current/10 px-4 pb-4">
          <div className="py-3 space-y-1.5">
            {order.items && order.items.length > 0 ? order.items.map(it => (
              <div key={it.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">{it.quantity}</span>
                  <span className="text-gray-800">{it.name}</span>
                  {it.notes && <span className="text-gray-400 text-xs">({it.notes})</span>}
                </div>
                <span className="text-gray-600 shrink-0 ml-2">{parseFloat(it.total_price).toFixed(0)} ₴</span>
              </div>
            )) : (
              <p className="text-xs text-gray-400 text-center py-2">Позиції відсутні</p>
            )}
          </div>
          <div className="flex gap-2 mt-1">
            <button onClick={onAddItem}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold border-2 border-amber-400 text-amber-700 rounded-xl hover:bg-amber-50 transition-colors">
              <Plus className="w-4 h-4" /> Страва
            </button>
            <button onClick={onPay}
              className="flex-[2] flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors shadow-sm">
              <CreditCard className="w-4 h-4" /> Сплатити {parseFloat(order.total_amount || "0").toFixed(0)} ₴
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── QR Order Alert Card ──────────────────────────────────────────────────────
function OrderAlert({ order, onAccept, onReject, accepting }: {
  order: GuestOrder; onAccept: (id: number) => void; onReject: (id: number) => void; accepting: number | null;
}) {
  const [elapsed, setElapsed] = useState(timeAgo(order.opened_at));
  useEffect(() => {
    const t = setInterval(() => setElapsed(timeAgo(order.opened_at)), 5000);
    return () => clearInterval(t);
  }, [order.opened_at]);

  return (
    <div className="bg-white border-2 border-amber-400 rounded-2xl shadow-xl overflow-hidden animate-pulse-border">
      <div className="h-1.5 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 text-lg">Стіл {order.table_number || "—"}</span>
                {order.table_location && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{order.table_location}</span>}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                <Clock className="w-3.5 h-3.5" /><span>{elapsed}</span>
                <span>·</span><span>{order.guest_name}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">{parseFloat(order.total_amount || "0").toFixed(0)} ₴</div>
            <div className="text-xs text-gray-400">{order.items.length} поз.</div>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-2">
          {order.items.map(it => (
            <div key={it.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">{it.quantity}</span>
                <span className="text-gray-800 truncate">{it.name}</span>
                {it.notes && <span className="text-gray-400 text-xs">({it.notes})</span>}
              </div>
              <span className="text-gray-600 shrink-0 ml-2">{parseFloat(it.total_price).toFixed(0)} ₴</span>
            </div>
          ))}
          {order.notes && <div className="pt-1 border-t border-gray-200 text-xs text-gray-500 italic">Примітка: {order.notes}</div>}
        </div>
        <div className="flex gap-3">
          <button onClick={() => onReject(order.id)} disabled={accepting === order.id}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold hover:bg-red-50 disabled:opacity-40 transition-colors">
            <XCircle className="w-5 h-5" /> Відхилити
          </button>
          <button onClick={() => onAccept(order.id)} disabled={accepting === order.id}
            className="flex-2 flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-40 transition-colors shadow-md">
            {accepting === order.id ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            Прийняти до роботи
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FbCashier() {
  const [pendingOrders, setPendingOrders] = useState<GuestOrder[]>([]);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [accepting, setAccepting] = useState<number | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [connected, setConnected] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [addItemForOrderId, setAddItemForOrderId] = useState<number | null>(null);
  const [payForOrder, setPayForOrder] = useState<ActiveOrder | null>(null);
  const knownIds = useRef<Set<number>>(new Set());

  // ── fetch pending QR orders ──
  const fetchPending = useCallback(async () => {
    try {
      const data = await apiFetch("/public/pending-orders");
      const incoming: GuestOrder[] = data.orders || [];
      setPendingOrders(incoming);
      setConnected(true);
      setLastPoll(new Date());
      const newOnes = incoming.filter(o => !knownIds.current.has(o.id));
      if (newOnes.length > 0) { playAlert(); newOnes.forEach(o => knownIds.current.add(o.id)); }
    } catch { setConnected(false); }
  }, []);

  // ── fetch active orders (open/billed_pending) with items ──
  const fetchActive = useCallback(async () => {
    try {
      const data = await apiFetch("/orders?open=true");
      const orders: any[] = data.orders || [];
      const withItems = await Promise.all(
        orders.map(async (o) => {
          try {
            const d = await apiFetch(`/orders/${o.id}`);
            return { ...o, tableNumber: d.order?.tableNumber || o.tableNumber, items: d.items || [] };
          } catch { return { ...o, items: [] }; }
        })
      );
      setActiveOrders(withItems);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPending(); fetchActive();
    const t1 = setInterval(fetchPending, 3000);
    const t2 = setInterval(fetchActive, 10000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchPending, fetchActive]);

  const handleAccept = async (id: number) => {
    setAccepting(id);
    try {
      await apiFetch(`/public/guest-orders/${id}/accept`, { method: "PATCH" });
      setPendingOrders(prev => prev.filter(o => o.id !== id));
      knownIds.current.delete(id);
      setTimeout(fetchActive, 600);
    } catch (e: any) { alert("Помилка: " + e.message); }
    finally { setAccepting(null); }
  };

  const handleReject = async (id: number) => {
    if (!confirm("Відхилити замовлення? Гість отримає відмову.")) return;
    setAccepting(id);
    try {
      await apiFetch(`/public/guest-orders/${id}/reject`, { method: "PATCH" });
      setPendingOrders(prev => prev.filter(o => o.id !== id));
      knownIds.current.delete(id);
    } catch (e: any) { alert("Помилка: " + e.message); }
    finally { setAccepting(null); }
  };

  return (
    <AppLayout>
      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-color: #fbbf24; box-shadow: 0 0 0 0 rgba(251,191,36,0.4); }
          50% { border-color: #f59e0b; box-shadow: 0 0 0 8px rgba(251,191,36,0); }
        }
        .animate-pulse-border { animation: pulse-border 2s ease-in-out infinite; }
      `}</style>

      {/* Modals */}
      {addItemForOrderId !== null && (
        <AddItemModal
          orderId={addItemForOrderId}
          onClose={() => setAddItemForOrderId(null)}
          onDone={() => { setAddItemForOrderId(null); setTimeout(fetchActive, 300); }}
        />
      )}
      {payForOrder && (
        <PaymentModal
          order={payForOrder}
          onClose={() => setPayForOrder(null)}
          onDone={() => { setPayForOrder(null); fetchActive(); }}
        />
      )}

      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Bell className="w-6 h-6 text-muted-foreground" />
                {pendingOrders.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
                    {pendingOrders.length}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold">Станція касира</h1>
                <p className="text-xs text-muted-foreground">QR-замовлення та управління активними столами</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                <Wifi className="w-3 h-3" />
                {connected ? "Онлайн" : "Немає зв'язку"}
              </div>
              {lastPoll && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3" />
                  {lastPoll.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="flex h-full">
            {/* ── LEFT: Pending QR orders ── */}
            <div className="flex-1 p-5 overflow-y-auto border-r">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-amber-500" />
                  Нові QR-замовлення
                  {pendingOrders.length > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingOrders.length}</span>
                  )}
                </h2>
              </div>
              {pendingOrders.length > 0 && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shrink-0 animate-bounce">
                    <Bell className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="font-bold text-amber-800 text-sm">{pendingOrders.length === 1 ? "Нове замовлення!" : `${pendingOrders.length} нових замовлень!`}</div>
                    <div className="text-amber-600 text-xs">Прийміть — система надрукує завдання на кухонний та барний принтери</div>
                  </div>
                </div>
              )}
              {pendingOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                    <ShoppingBag className="w-7 h-7 text-muted-foreground/50" />
                  </div>
                  <p className="font-semibold text-muted-foreground text-sm">Нових QR-замовлень немає</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Оновлення кожні 3 секунди</p>
                </div>
              ) : (
                <div className="space-y-4 max-w-xl">
                  {pendingOrders.map(order => (
                    <OrderAlert key={order.id} order={order} onAccept={handleAccept} onReject={handleReject} accepting={accepting} />
                  ))}
                </div>
              )}
            </div>

            {/* ── RIGHT: Active Orders Manager ── */}
            <div className="w-96 shrink-0 flex flex-col bg-gray-50/50">
              <div className="px-4 py-3 border-b bg-background flex items-center justify-between shrink-0">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-blue-500" />
                  Активні замовлення
                  {activeOrders.length > 0 && (
                    <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeOrders.length}</span>
                  )}
                </h2>
                <button onClick={fetchActive} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {activeOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                      <UtensilsCrossed className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">Немає активних замовлень</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Приймайте QR або відкрийте через офіціанта</p>
                  </div>
                ) : (
                  activeOrders.map(order => (
                    <ActiveOrderCard
                      key={order.id}
                      order={order}
                      isExpanded={expandedOrderId === order.id}
                      onToggle={() => setExpandedOrderId(prev => prev === order.id ? null : order.id)}
                      onAddItem={() => setAddItemForOrderId(order.id)}
                      onPay={() => setPayForOrder(order)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
