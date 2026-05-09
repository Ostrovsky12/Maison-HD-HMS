import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Bell, CheckCircle2, XCircle, Clock, ShoppingBag, RefreshCw, Wifi } from "lucide-react";

// ─── API ──────────────────────────────────────────────────────────────────────
const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api/fb";
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
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq;
      o.type = "square";
      g.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.14);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.14);
    });
  } catch {}
}

interface OrderItem { id: number; name: string; quantity: number; price: string; total_price: string; notes?: string; }
interface GuestOrder {
  id: number; status: string; guest_name: string; guest_count: number;
  notes?: string; total_amount: string; opened_at: string;
  table_number?: string; table_location?: string;
  items: OrderItem[];
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff} сек тому`;
  if (diff < 3600) return `${Math.floor(diff / 60)} хв тому`;
  return `${Math.floor(diff / 3600)} год тому`;
}

// ─── Single Order Card ────────────────────────────────────────────────────────
function OrderAlert({ order, onAccept, onReject, accepting }: {
  order: GuestOrder;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
  accepting: number | null;
}) {
  const [elapsed, setElapsed] = useState(timeAgo(order.opened_at));
  useEffect(() => {
    const t = setInterval(() => setElapsed(timeAgo(order.opened_at)), 5000);
    return () => clearInterval(t);
  }, [order.opened_at]);

  return (
    <div className="bg-white border-2 border-amber-400 rounded-2xl shadow-xl overflow-hidden animate-pulse-border">
      {/* Top accent */}
      <div className="h-1.5 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 text-lg">
                  Стіл {order.table_number || "—"}
                </span>
                {order.table_location && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {order.table_location}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{elapsed}</span>
                <span>·</span>
                <span>{order.guest_name}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">{parseFloat(order.total_amount || "0").toFixed(0)} ₴</div>
            <div className="text-xs text-gray-400">{order.items.length} поз.</div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-2">
          {order.items.map(it => (
            <div key={it.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {it.quantity}
                </span>
                <span className="text-gray-800 truncate">{it.name}</span>
                {it.notes && <span className="text-gray-400 text-xs">({it.notes})</span>}
              </div>
              <span className="text-gray-600 shrink-0 ml-2">{parseFloat(it.total_price).toFixed(0)} ₴</span>
            </div>
          ))}
          {order.notes && (
            <div className="pt-1 border-t border-gray-200 text-xs text-gray-500 italic">
              Примітка: {order.notes}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onReject(order.id)}
            disabled={accepting === order.id}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold hover:bg-red-50 disabled:opacity-40 transition-colors"
          >
            <XCircle className="w-5 h-5" />
            Відхилити
          </button>
          <button
            onClick={() => onAccept(order.id)}
            disabled={accepting === order.id}
            className="flex-2 flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-40 transition-colors shadow-md"
          >
            {accepting === order.id ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            Прийняти до роботи
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FbCashier() {
  const [orders, setOrders] = useState<GuestOrder[]>([]);
  const [accepted, setAccepted] = useState<GuestOrder[]>([]);
  const [accepting, setAccepting] = useState<number | null>(null);
  const [lastCount, setLastCount] = useState(0);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [connected, setConnected] = useState(true);
  const knownIds = useRef<Set<number>>(new Set());

  const fetchOrders = useCallback(async () => {
    try {
      const data = await apiFetch("/public/pending-orders");
      const incoming: GuestOrder[] = data.orders || [];
      setOrders(incoming);
      setConnected(true);
      setLastPoll(new Date());

      // Play sound for truly new orders
      const newOnes = incoming.filter(o => !knownIds.current.has(o.id));
      if (newOnes.length > 0) {
        playAlert();
        newOnes.forEach(o => knownIds.current.add(o.id));
      }
      setLastCount(incoming.length);
    } catch {
      setConnected(false);
    }
  }, []);

  // Poll every 3 seconds
  useEffect(() => {
    fetchOrders();
    const t = setInterval(fetchOrders, 3000);
    return () => clearInterval(t);
  }, [fetchOrders]);

  const handleAccept = async (id: number) => {
    setAccepting(id);
    try {
      await apiFetch(`/public/guest-orders/${id}/accept`, { method: "PATCH" });
      const acceptedOrder = orders.find(o => o.id === id);
      if (acceptedOrder) setAccepted(prev => [acceptedOrder, ...prev].slice(0, 20));
      setOrders(prev => prev.filter(o => o.id !== id));
      knownIds.current.delete(id);
    } catch (e: any) {
      alert("Помилка: " + e.message);
    } finally {
      setAccepting(null);
    }
  };

  const handleReject = async (id: number) => {
    if (!confirm("Відхилити замовлення? Гість отримає відмову.")) return;
    setAccepting(id);
    try {
      await apiFetch(`/public/guest-orders/${id}/reject`, { method: "PATCH" });
      setOrders(prev => prev.filter(o => o.id !== id));
      knownIds.current.delete(id);
    } catch (e: any) {
      alert("Помилка: " + e.message);
    } finally {
      setAccepting(null);
    }
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

      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Bell className="w-6 h-6 text-muted-foreground" />
                {orders.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
                    {orders.length}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold">Станція касира</h1>
                <p className="text-xs text-muted-foreground">Нові QR-замовлення — прийміть до початку приготування</p>
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

        <div className="flex-1 overflow-y-auto">
          <div className="flex gap-4 h-full">
            {/* Pending orders — LEFT PANEL */}
            <div className="flex-1 p-5 overflow-y-auto">
              {/* Big alert banner */}
              {orders.length > 0 && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shrink-0 animate-bounce">
                    <Bell className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="font-bold text-amber-800 text-sm">
                      {orders.length === 1 ? "Нове замовлення!" : `${orders.length} нових замовлень!`}
                    </div>
                    <div className="text-amber-600 text-xs">Прийміть замовлення — тоді кухня та бар отримають завдання</div>
                  </div>
                </div>
              )}

              {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full pb-20 text-center">
                  <div className="w-20 h-20 rounded-full bg-muted/40 flex items-center justify-center mb-4">
                    <ShoppingBag className="w-9 h-9 text-muted-foreground/50" />
                  </div>
                  <p className="font-semibold text-muted-foreground">Нових замовлень немає</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Оновлення кожні 3 секунди</p>
                </div>
              ) : (
                <div className="space-y-4 max-w-xl">
                  {orders.map(order => (
                    <OrderAlert
                      key={order.id}
                      order={order}
                      onAccept={handleAccept}
                      onReject={handleReject}
                      accepting={accepting}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Accepted orders log — RIGHT PANEL */}
            {accepted.length > 0 && (
              <div className="w-72 border-l bg-muted/20 p-4 overflow-y-auto shrink-0">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  Прийнято ({accepted.length})
                </div>
                <div className="space-y-2">
                  {accepted.map(o => (
                    <div key={o.id} className="bg-white rounded-xl p-3 border border-green-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm text-gray-800">Стіл {o.table_number}</span>
                        <span className="text-xs font-bold text-green-600">{parseFloat(o.total_amount || "0").toFixed(0)} ₴</span>
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {o.items.map(it => (
                          <div key={it.id}>{it.quantity}× {it.name}</div>
                        ))}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                        Передано на кухню/бар
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
