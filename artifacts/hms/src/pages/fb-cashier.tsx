import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  Bell, CheckCircle2, XCircle, Clock, ShoppingBag, RefreshCw,
  Wifi, Printer, ChefHat, Wine, ChevronDown, ChevronUp,
  Plus, CreditCard, Banknote, Search, X, UtensilsCrossed,
  FileText, Gift, Wallet, Layers, Users, Hash,
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
  tipPct?: number | null;
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

// ─── New Order Modal ───────────────────────────────────────────────────────────
function NewOrderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [tableNumber, setTableNumber] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("dine_in");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!tableNumber.trim() && orderType === "dine_in") { setError("Введіть номер столу"); return; }
    setCreating(true); setError("");
    try {
      // Fetch tables to resolve number → id
      const td = await apiFetch("/tables").catch(() => ({ tables: [] }));
      const tables: any[] = td.tables || [];
      const matched = tables.find(
        t => String(t.table_number ?? t.number ?? "").toLowerCase() === tableNumber.trim().toLowerCase()
      );
      await apiFetch("/orders", {
        method: "POST",
        body: JSON.stringify({
          tableId: matched?.id || null,
          orderType,
          guestName: orderType === "takeaway" ? "Takeaway" : `Стіл ${tableNumber.trim() || "?"}`,
          guestCount,
          notes: notes || undefined,
        }),
      });
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-base flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-blue-600" /> Нове замовлення
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Order type */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">Тип замовлення</label>
            <div className="grid grid-cols-2 gap-2">
              {([["dine_in", "В залі"], ["takeaway", "Takeaway"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setOrderType(val)}
                  className={`py-2.5 rounded-xl border-2 font-semibold text-sm transition-colors ${orderType === val ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300 text-gray-600"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Table number */}
          {orderType === "dine_in" && (
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2 flex items-center gap-1.5">
                <Hash className="w-4 h-4" /> Номер столу
              </label>
              <input
                type="text"
                value={tableNumber}
                onChange={e => setTableNumber(e.target.value)}
                placeholder="напр. 5, VIP-1, Т-2"
                autoFocus
                className="w-full px-4 py-3 text-2xl font-black text-center border-2 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          )}

          {/* Guest count */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2 flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Кількість гостей
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1,2,3,4,5,6,7,8].map(n => (
                <button key={n} onClick={() => setGuestCount(n)}
                  className={`py-2.5 rounded-xl font-bold text-base border-2 transition-colors ${guestCount === n ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300 text-gray-600"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">Примітки</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Алергії, побажання..."
              className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

          <button onClick={handleCreate} disabled={creating}
            className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors shadow-md text-base flex items-center justify-center gap-2">
            {creating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            {creating ? "Створення..." : "Відкрити замовлення"}
          </button>
        </div>
      </div>
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
      await apiFetch(`/orders/${orderId}/items`, { method: "POST", body: JSON.stringify({ itemId: selected.id, quantity: qty }) });
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
            <input value={search} onChange={e => setSearch(e.target.value)} autoFocus
              placeholder="Пошук страви..." className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
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
              {adding ? "Додаємо..." : "Додати до замовлення"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Payment Modal ─────────────────────────────────────────────────────────────
type PayMode = "cash" | "card" | "invoice" | "certificate" | "deposit" | "mixed";

const PAY_METHODS: { id: PayMode; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "cash",        label: "Готівка",      icon: <Banknote   className="w-5 h-5" />, hint: "Розрахунок готівкою" },
  { id: "card",        label: "Картка",       icon: <CreditCard className="w-5 h-5" />, hint: "Безготівковий розрахунок" },
  { id: "mixed",       label: "Змішана",      icon: <Layers     className="w-5 h-5" />, hint: "Готівка + картка" },
  { id: "invoice",     label: "Рах. рахунок", icon: <FileText   className="w-5 h-5" />, hint: "Безготівково через банк" },
  { id: "certificate", label: "Сертифікат",   icon: <Gift       className="w-5 h-5" />, hint: "Подарунковий сертифікат" },
  { id: "deposit",     label: "Депозит",      icon: <Wallet     className="w-5 h-5" />, hint: "З депозиту клієнта" },
];

function PaymentModal({ order, onClose, onDone }: { order: ActiveOrder; onClose: () => void; onDone: () => void }) {
  const orderTotal = parseFloat(order.total_amount || "0");

  const [mode, setMode] = useState<PayMode>("cash");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  // ── Discount ──
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<"pct" | "fixed">("pct");
  const [discountValue, setDiscountValue] = useState("");

  // ── Service charge (чайові / надбавка) ──
  const guestTip = order.tipPct ? Number(order.tipPct) : 0;
  const [serviceEnabled, setServiceEnabled] = useState(guestTip > 0);
  const [serviceValue, setServiceValue] = useState(guestTip > 0 ? String(guestTip) : "10");

  // ── Computed totals ──
  const discountNum = parseFloat(discountValue || "0");
  const discountAmount = discountEnabled
    ? (discountType === "pct" ? Math.round(orderTotal * discountNum) / 100 : discountNum)
    : 0;
  const servicePct = serviceEnabled ? parseFloat(serviceValue || "0") : 0;
  const serviceAmount = Math.round((orderTotal - discountAmount) * servicePct) / 100;
  const finalTotal = Math.max(0, orderTotal - discountAmount + serviceAmount);

  // ── Cash fields ──
  const [cashReceived, setCashReceived] = useState("");
  useEffect(() => { setCashReceived(finalTotal.toFixed(2)); }, [finalTotal]);
  const cashChange = Math.max(0, parseFloat(cashReceived || "0") - finalTotal);

  // ── Mixed fields ──
  const [mixedCash, setMixedCash] = useState("");
  const [mixedCard, setMixedCard] = useState("");

  function onMixedCashChange(val: string) {
    setMixedCash(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0 && n <= finalTotal) setMixedCard((finalTotal - n).toFixed(2));
    else setMixedCard("");
  }
  function onMixedCardChange(val: string) {
    setMixedCard(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0 && n <= finalTotal) setMixedCash((finalTotal - n).toFixed(2));
    else setMixedCash("");
  }

  const mixedCashNum = parseFloat(mixedCash || "0");
  const mixedCardNum = parseFloat(mixedCard || "0");
  const mixedPaidTotal = mixedCashNum + mixedCardNum;
  const mixedChange = Math.max(0, mixedCashNum - (finalTotal - mixedCardNum));

  function canPay() {
    if (paying) return false;
    if (mode === "cash") return parseFloat(cashReceived || "0") >= finalTotal - 0.01;
    if (mode === "mixed") return mixedPaidTotal >= finalTotal - 0.01 && (mixedCashNum > 0 || mixedCardNum > 0);
    return true;
  }

  async function handlePay() {
    if (!canPay()) return;
    setPaying(true); setError("");
    try {
      let body: any = {
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        discountLabel:  discountEnabled && discountAmount > 0
          ? (discountType === "pct" ? `Знижка ${discountNum}%` : `Знижка ${discountAmount.toFixed(2)} ₴`)
          : undefined,
        tipAmount: serviceAmount > 0 ? serviceAmount : undefined,
        tipPct:    servicePct > 0 ? servicePct : undefined,
      };

      if (mode === "mixed") {
        const payments = [];
        if (mixedCashNum > 0) payments.push({ method: "cash", amount: mixedCashNum });
        if (mixedCardNum > 0) payments.push({ method: "card", amount: mixedCardNum });
        body = { ...body, payments };
      } else if (mode === "cash") {
        body = { ...body, paymentMethod: "cash", paidAmount: parseFloat(cashReceived || "0") };
      } else {
        body = { ...body, paymentMethod: mode, paidAmount: finalTotal };
      }
      await apiFetch(`/orders/${order.id}/pay`, { method: "POST", body: JSON.stringify(body) });
      onDone();
    } catch (e: any) { setError(e.message); setPaying(false); }
  }

  const selectedInfo = PAY_METHODS.find(m => m.id === mode)!;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[95vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h3 className="font-bold text-base">Оплата замовлення</h3>
            <p className="text-xs text-gray-500">
              {order.tableNumber ? `Стіл ${order.tableNumber}` : "Замовлення"} · {order.guest_name}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── Price summary ── */}
          <div className="bg-gray-50 border rounded-xl p-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Сума замовлення:</span>
              <span className="font-semibold">{orderTotal.toFixed(2)} ₴</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>{discountType === "pct" ? `Знижка ${discountNum}%` : "Знижка"}:</span>
                <span className="font-semibold">− {discountAmount.toFixed(2)} ₴</span>
              </div>
            )}
            {serviceAmount > 0 && (
              <div className="flex justify-between text-blue-600">
                <span>Сервісний збір {servicePct}%:</span>
                <span className="font-semibold">+ {serviceAmount.toFixed(2)} ₴</span>
              </div>
            )}
            <div className="border-t pt-1.5 flex justify-between font-black text-base text-green-800">
              <span>До сплати:</span>
              <span>{finalTotal.toFixed(2)} ₴</span>
            </div>
          </div>

          {/* ── Discount row ── */}
          <div className="border rounded-xl overflow-hidden">
            <button
              onClick={() => setDiscountEnabled(v => !v)}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-colors ${discountEnabled ? "bg-red-50 text-red-700" : "hover:bg-gray-50 text-gray-700"}`}
            >
              <span className="flex items-center gap-2">
                <span className="text-base">🏷</span> Знижка
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${discountEnabled ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-400"}`}>
                {discountEnabled ? (discountAmount > 0 ? `− ${discountAmount.toFixed(0)} ₴` : "вкл") : "вимк"}
              </span>
            </button>
            {discountEnabled && (
              <div className="px-4 pb-3 pt-1 border-t bg-red-50/40 flex gap-2 items-center">
                <div className="flex border rounded-lg overflow-hidden shrink-0">
                  {(["pct", "fixed"] as const).map(t => (
                    <button key={t} onClick={() => { setDiscountType(t); setDiscountValue(""); }}
                      className={`px-3 py-1.5 text-xs font-bold transition-colors ${discountType === t ? "bg-red-500 text-white" : "hover:bg-gray-100 text-gray-600"}`}>
                      {t === "pct" ? "%" : "₴"}
                    </button>
                  ))}
                </div>
                <input
                  type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                  placeholder={discountType === "pct" ? "напр. 10" : "напр. 50"}
                  min={0} max={discountType === "pct" ? 100 : orderTotal} step="0.01" autoFocus
                  className="flex-1 px-3 py-1.5 text-sm font-bold border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 text-right"
                />
                <span className="text-sm text-gray-500 shrink-0">{discountType === "pct" ? "%" : "₴"}</span>
              </div>
            )}
          </div>

          {/* ── Service charge row ── */}
          <div className="border rounded-xl overflow-hidden">
            <button
              onClick={() => setServiceEnabled(v => !v)}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-colors ${serviceEnabled ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-700"}`}
            >
              <span className="flex items-center gap-2">
                <span className="text-base">⭐</span> Сервісний збір
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${serviceEnabled ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"}`}>
                {serviceEnabled ? `+ ${serviceAmount.toFixed(0)} ₴` : "вимк"}
              </span>
            </button>
            {serviceEnabled && (
              <div className="px-4 pb-3 pt-1 border-t bg-blue-50/40 flex gap-2 items-center">
                <span className="text-xs text-gray-500 shrink-0">Відсоток:</span>
                <div className="flex gap-1.5">
                  {[5, 10, 15].map(pct => (
                    <button key={pct} onClick={() => setServiceValue(String(pct))}
                      className={`px-3 py-1.5 text-xs font-bold border-2 rounded-lg transition-colors ${serviceValue === String(pct) && serviceEnabled ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300"}`}>
                      {pct}%
                    </button>
                  ))}
                </div>
                <input
                  type="number" value={serviceValue} onChange={e => setServiceValue(e.target.value)}
                  min={0} max={50} step="1"
                  className="w-16 px-2 py-1.5 text-sm font-bold border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-right"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            )}
          </div>

          {/* ── Payment method grid ── */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Спосіб оплати</p>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map(m => (
                <button key={m.id} onClick={() => { setMode(m.id); setError(""); }}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 font-semibold text-xs transition-all ${
                    mode === m.id
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-gray-200 hover:border-gray-300 text-gray-600"
                  }`}>
                  {m.icon}
                  <span className="text-center leading-tight">{m.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 text-center mt-1.5">{selectedInfo.hint}</p>
          </div>

          {/* ── Cash fields ── */}
          {mode === "cash" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">Отримано від гостя (₴)</label>
                <input type="number" value={cashReceived} onChange={e => setCashReceived(e.target.value)}
                  step="0.01" min={0}
                  className="w-full px-4 py-3 text-2xl font-black border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-right" />
              </div>
              <div className="flex gap-2 flex-wrap">
                {[Math.ceil(finalTotal / 50) * 50, Math.ceil(finalTotal / 100) * 100, Math.ceil(finalTotal / 200) * 200, Math.ceil(finalTotal / 500) * 500]
                  .filter((v, i, a) => v >= finalTotal && a.indexOf(v) === i)
                  .slice(0, 4)
                  .map(v => (
                    <button key={v} onClick={() => setCashReceived(v.toFixed(2))}
                      className="px-3 py-1.5 text-sm font-bold border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-colors">
                      {v} ₴
                    </button>
                  ))}
                <button onClick={() => setCashReceived(finalTotal.toFixed(2))}
                  className="px-3 py-1.5 text-sm font-bold border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-colors">
                  Точно
                </button>
              </div>
              {cashChange > 0.01 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center">
                  <span className="font-semibold text-amber-800 text-sm">Решта гостю:</span>
                  <span className="font-black text-xl text-amber-800">{cashChange.toFixed(2)} ₴</span>
                </div>
              )}
            </div>
          )}

          {/* ── Mixed fields ── */}
          {mode === "mixed" && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 text-center">Введіть суму готівкою — картка розрахується автоматично</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5 flex items-center gap-1">
                    <Banknote className="w-3.5 h-3.5" /> Готівкою (₴)
                  </label>
                  <input type="number" value={mixedCash} onChange={e => onMixedCashChange(e.target.value)}
                    placeholder="0.00" min={0} step="0.01"
                    className="w-full px-3 py-2.5 text-lg font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-right" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" /> Карткою (₴)
                  </label>
                  <input type="number" value={mixedCard} onChange={e => onMixedCardChange(e.target.value)}
                    placeholder="0.00" min={0} step="0.01"
                    className="w-full px-3 py-2.5 text-lg font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-right" />
                </div>
              </div>
              <div className="bg-gray-50 border rounded-xl p-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Готівка:</span><span className="font-bold">{mixedCashNum.toFixed(2)} ₴</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Картка:</span><span className="font-bold">{mixedCardNum.toFixed(2)} ₴</span>
                </div>
                <div className="border-t pt-1.5 flex justify-between font-bold">
                  <span>Разом:</span>
                  <span className={mixedPaidTotal >= finalTotal - 0.01 ? "text-green-700" : "text-red-600"}>
                    {mixedPaidTotal.toFixed(2)} ₴
                  </span>
                </div>
                {mixedPaidTotal < finalTotal - 0.01 && (
                  <p className="text-xs text-red-500 text-center">Не вистачає {(finalTotal - mixedPaidTotal).toFixed(2)} ₴</p>
                )}
              </div>
              {mixedChange > 0.01 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center">
                  <span className="font-semibold text-amber-800 text-sm">Решта готівкою:</span>
                  <span className="font-black text-xl text-amber-800">{mixedChange.toFixed(2)} ₴</span>
                </div>
              )}
            </div>
          )}

          {/* ── Card / Invoice / Certificate / Deposit ── */}
          {(mode === "card" || mode === "invoice" || mode === "certificate" || mode === "deposit") && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center text-sm text-blue-700">
              <p className="font-semibold">Сума до оплати: {finalTotal.toFixed(2)} ₴</p>
              <p className="text-xs opacity-80 mt-1">{selectedInfo.hint}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">{error}</div>
          )}

          <button
            onClick={handlePay}
            disabled={!canPay()}
            className="w-full py-4 bg-green-600 text-white font-bold rounded-xl text-lg hover:bg-green-700 disabled:opacity-40 transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            {paying
              ? <><RefreshCw className="w-5 h-5 animate-spin" /> Проводимо...</>
              : <><CheckCircle2 className="w-5 h-5" /> Закрити · {finalTotal.toFixed(2)} ₴</>
            }
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
            <div className="font-bold text-sm">
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
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const knownIds = useRef<Set<number>>(new Set());

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

  const fetchActive = useCallback(async () => {
    try {
      const data = await apiFetch("/orders?open=true");
      const orders: any[] = data.orders || [];
      const withItems = await Promise.all(
        orders.map(async (o) => {
          try {
            const d = await apiFetch(`/orders/${o.id}`);
            const merged = { ...o, tableNumber: d.order?.tableNumber || o.tableNumber, tipPct: d.order?.tipPct ?? o.tipPct ?? null, items: d.items || [] };
            return {
              ...merged,
              total_amount: merged.total_amount ?? merged.totalAmount ?? "0",
              guest_name:   merged.guest_name   ?? merged.guestName   ?? "",
              opened_at:    merged.opened_at    ?? merged.openedAt    ?? merged.createdAt ?? "",
              order_type:   merged.order_type   ?? merged.orderType   ?? "",
            };
          } catch { return { ...o, items: [],
            total_amount: o.total_amount ?? o.totalAmount ?? "0",
            guest_name:   o.guest_name   ?? o.guestName   ?? "",
            opened_at:    o.opened_at    ?? o.openedAt    ?? o.createdAt ?? "",
            order_type:   o.order_type   ?? o.orderType   ?? "",
          }; }
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
      {newOrderOpen && (
        <NewOrderModal
          onClose={() => setNewOrderOpen(false)}
          onDone={() => { setNewOrderOpen(false); setTimeout(fetchActive, 400); }}
        />
      )}
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
                <div className="flex items-center gap-2">
                  <button onClick={fetchActive} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setNewOrderOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Нове
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {activeOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                      <UtensilsCrossed className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">Немає активних замовлень</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Натисніть «Нове» або приймайте QR</p>
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
