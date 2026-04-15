import { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Minus, X, Search, RefreshCw, Users, Clock, Receipt,
  CreditCard, Banknote, ChevronRight, UtensilsCrossed, Loader2,
  Table2, FileText, Smartphone, AlertCircle, StickyNote, CheckCircle2,
  Layers, ShoppingBag, ArrowLeft, Edit3, Phone, UserCircle, Percent,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

// ── API ───────────────────────────────────────────────────────────────────────
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = BASE.replace(/\/maison-hd$/, "") + "/api";
const tok  = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });

// ── Types ─────────────────────────────────────────────────────────────────────
type Table    = { id: number; table_number: string; section: string; capacity: number; status: string; current_order_id?: number };
type Category = { id: number; name: string; icon?: string; sort_order: number };
type MenuItem = { id: number; name: string; price: number; category_id: number; is_available: boolean; description?: string; is_alcohol?: boolean; image_url?: string };
type OrderItem= { id?: number; item_id: number; name: string; price: number; quantity: number; total_price: number; notes?: string; is_alcohol?: boolean };
type Order    = { id: number; table_id?: number; order_type: string; guest_name?: string; guest_count?: number; status: string; total_amount: number; items?: OrderItem[]; opened_at?: string };
type LegalEntity = { id: number; name: string; short_name?: string; type: string; is_default?: boolean; handles_alcohol?: boolean };

function fmt(n: number | string | undefined | null) { return `₴${Number(n || 0).toFixed(0)}`; }
function fmtDec(n: number | string | undefined | null) { return `₴${Number(n || 0).toFixed(2)}`; }

function elapsed(iso?: string) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 60) return `${diff}хв`;
  return `${Math.floor(diff / 60)}год ${diff % 60}хв`;
}

const STATUS_STYLE: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  free:     { bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-400", label: "Вільний"  },
  occupied: { bg: "bg-rose-500/10",    border: "border-rose-500/30",    dot: "bg-rose-400",    label: "Зайнятий" },
  reserved: { bg: "bg-amber-500/10",   border: "border-amber-500/30",   dot: "bg-amber-400",   label: "Резерв"   },
};

const PAYMENT_METHODS = [
  { key: "cash",   label: "Готівка", icon: Banknote,    color: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" },
  { key: "card",   label: "Картка",  icon: CreditCard,  color: "bg-blue-500/15 border-blue-500/30 text-blue-300"          },
  { key: "liqpay", label: "LiqPay",  icon: Smartphone,  color: "bg-amber-500/15 border-amber-500/30 text-amber-300"       },
];

const TIP_OPTIONS = [0, 5, 7, 10, 15];

// ── Open Table Dialog ─────────────────────────────────────────────────────────
function OpenTableDialog({ table, onConfirm, onClose }: {
  table: Table; onConfirm: (guestCount: number, guestName: string) => void; onClose: () => void;
}) {
  const [count, setCount] = useState(table.capacity || 2);
  const [name,  setName]  = useState("");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1d2e] border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Table2 className="w-4 h-4 text-indigo-400" />
            Стіл #{table.table_number}
            <span className="text-white/40 text-xs font-normal ml-1">· {table.section}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* Guest count stepper */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-3">Кількість гостей</p>
            <div className="flex items-center justify-center gap-6">
              <button onClick={() => setCount(c => Math.max(1, c - 1))}
                className="w-12 h-12 rounded-xl bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors text-white/70">
                <Minus className="w-5 h-5" />
              </button>
              <span className="text-4xl font-bold text-white w-12 text-center">{count}</span>
              <button onClick={() => setCount(c => Math.min(20, c + 1))}
                className="w-12 h-12 rounded-xl bg-indigo-600/60 hover:bg-indigo-600 flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
          {/* Guest name (optional) */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Ім'я гостя (опційно)</p>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Прізвище або нік..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/50 hover:text-white">Скасувати</Button>
          <Button onClick={() => onConfirm(count, name)} className="bg-indigo-600 hover:bg-indigo-500 text-white">
            Відкрити стіл
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Item Notes Dialog ─────────────────────────────────────────────────────────
function ItemNoteDialog({ item, onSave, onClose }: {
  item: OrderItem; onSave: (notes: string) => void; onClose: () => void;
}) {
  const [note, setNote] = useState(item.notes || "");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1d2e] border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white text-sm flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-amber-400" /> Нотатка до позиції
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-white/50">{item.name}</p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Без цибулі, добре прожарити, alergeny..."
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-indigo-500/50 resize-none"
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => { onSave(""); onClose(); }} className="text-white/40">Очистити</Button>
          <Button onClick={() => { onSave(note); onClose(); }} className="bg-amber-600 hover:bg-amber-500">
            Зберегти нотатку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Pre-check Dialog ──────────────────────────────────────────────────────────
function PrecheckDialog({ order, items, onClose, onPay }: {
  order: Order; items: OrderItem[]; onClose: () => void; onPay: () => void;
}) {
  const total = items.reduce((s, i) => s + i.total_price, 0);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1d2e] border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Receipt className="w-4 h-4 text-indigo-400" /> Предчек
            <span className="text-white/40 text-xs font-normal ml-1">Стіл #{order.table_id}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-white/6">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/85 truncate">{item.name}</p>
                {item.notes && <p className="text-[10px] text-amber-400/70 truncate">{item.notes}</p>}
              </div>
              <div className="shrink-0 text-right ml-3">
                <p className="text-xs text-white/40">{item.quantity} × {fmt(item.price)}</p>
                <p className="text-sm font-medium text-white">{fmt(item.total_price)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 pt-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/60">Разом</span>
            <span className="text-2xl font-bold text-indigo-300">{fmtDec(total)}</span>
          </div>
          <p className="text-[10px] text-white/30 mt-1 text-center">
            {format(new Date(), "dd MMMM yyyy · HH:mm", { locale: uk })}
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="text-white/50">Закрити</Button>
          <Button onClick={onPay} className="bg-emerald-600 hover:bg-emerald-500 flex-1">
            <CreditCard className="w-4 h-4 mr-2" /> Перейти до оплати
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Payment Dialog ─────────────────────────────────────────────────────────────
function PaymentDialog({ order, items, legalEntities, onPaid, onClose }: {
  order: Order; items: OrderItem[]; legalEntities: LegalEntity[];
  onPaid: () => void; onClose: () => void;
}) {
  const { toast } = useToast();
  const [method, setMethod]           = useState("cash");
  const [given,  setGiven]            = useState("");
  const [tipPct, setTipPct]           = useState(0);
  const [loading, setLoading]         = useState(false);
  const [entityId, setEntityId]       = useState<number | null>(
    legalEntities.find(e => e.is_default)?.id ?? legalEntities[0]?.id ?? null
  );

  const hasAlcohol = items.some(i => i.is_alcohol);
  const total   = items.reduce((s, i) => s + i.total_price, 0);
  const tipAmt  = Math.round(total * tipPct) / 100;
  const finalAmt = total + tipAmt;
  const change  = method === "cash" && Number(given) > finalAmt ? Number(given) - finalAmt : 0;
  const canPay  = method !== "cash" || !given || Number(given) >= finalAmt;

  // Auto-select entity based on alcohol
  useEffect(() => {
    if (!legalEntities.length) return;
    const alcoholEntity  = legalEntities.find(e => e.handles_alcohol);
    const defaultEntity  = legalEntities.find(e => e.is_default) || legalEntities[0];
    setEntityId((hasAlcohol && alcoholEntity ? alcoholEntity : defaultEntity)?.id ?? null);
  }, [hasAlcohol, legalEntities]);

  const pay = async () => {
    setLoading(true);
    try {
      const body: any = {
        paymentMethod: method,
        paidAmount: Number(given) || finalAmt,
        tipPct: tipPct || undefined,
        tip: tipAmt || undefined,
        legalEntityId: entityId,
      };
      const r = await apiFetch(`/fb/orders/${order.id}/pay`, { method: "POST", body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Помилка оплати");
      toast({ title: "✅ Оплата прийнята", description: `${fmtDec(finalAmt)} · ${method === "cash" ? "Готівка" : method === "card" ? "Картка" : "LiqPay"}` });
      onPaid();
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1d2e] border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-400" /> Оплата · {fmtDec(total)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Payment method */}
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(pm => {
              const Icon = pm.icon;
              return (
                <button key={pm.key} onClick={() => setMethod(pm.key)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition-all text-xs font-medium ${
                    method === pm.key ? pm.color : "bg-white/5 border-white/10 text-white/40 hover:bg-white/8"
                  }`}>
                  <Icon className="w-5 h-5" />
                  {pm.label}
                </button>
              );
            })}
          </div>

          {/* Cash: given amount + change */}
          {method === "cash" && (
            <div className="space-y-2">
              <p className="text-xs text-white/40 uppercase tracking-wide">Отримано від гостя</p>
              <input
                type="number" value={given} onChange={e => setGiven(e.target.value)}
                placeholder={fmtDec(finalAmt)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-lg text-white placeholder:text-white/25 outline-none focus:border-emerald-500/50 font-mono"
              />
              {change > 0 && (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                  <span className="text-sm text-emerald-300/70">Решта</span>
                  <span className="text-lg font-bold text-emerald-300">{fmtDec(change)}</span>
                </div>
              )}
            </div>
          )}

          {/* Tips */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Чайові</p>
            <div className="flex gap-1.5">
              {TIP_OPTIONS.map(pct => (
                <button key={pct} onClick={() => setTipPct(pct)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    tipPct === pct ? "bg-indigo-600 text-white" : "bg-white/6 text-white/40 hover:bg-white/10"
                  }`}>
                  {pct === 0 ? "Немає" : `${pct}%`}
                </button>
              ))}
            </div>
            {tipPct > 0 && (
              <p className="text-xs text-white/40 mt-1 text-right">+{fmtDec(tipAmt)} чайових</p>
            )}
          </div>

          {/* Legal entity selector */}
          {legalEntities.length > 1 && (
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Юридична особа</p>
              <div className="flex gap-2">
                {legalEntities.map(e => (
                  <button key={e.id} onClick={() => setEntityId(e.id)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                      entityId === e.id
                        ? "bg-indigo-600/30 border-indigo-500/50 text-indigo-300"
                        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/8"
                    }`}>
                    {e.short_name || e.name}
                    {e.handles_alcohol && <span className="ml-1 text-[9px] opacity-60">🍷</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Total */}
          <div className="bg-white/4 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-white/60">До оплати</span>
            <span className="text-2xl font-bold text-white">{fmtDec(finalAmt)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="text-white/50" disabled={loading}>Скасувати</Button>
          <Button onClick={pay} disabled={!canPay || loading} className="bg-emerald-600 hover:bg-emerald-500 flex-1">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Провести оплату
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tables Panel ──────────────────────────────────────────────────────────────
function TablesPanel({ tables, orders, selectedTableId, onSelect, loading }: {
  tables: Table[]; orders: Order[]; selectedTableId: number | null;
  onSelect: (t: Table) => void; loading: boolean;
}) {
  const sections = [...new Set(tables.map(t => t.section))].sort();
  const [activeSection, setActiveSection] = useState<string>("all");

  const visible = activeSection === "all" ? tables : tables.filter(t => t.section === activeSection);
  const orderMap = Object.fromEntries(orders.map(o => [o.table_id, o]));

  return (
    <div className="flex flex-col h-full">
      {/* Section filter */}
      {sections.length > 1 && (
        <div className="px-3 pt-3 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
          <button onClick={() => setActiveSection("all")}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeSection === "all" ? "bg-indigo-600 text-white" : "bg-white/6 text-white/40 hover:bg-white/10"}`}>
            Всі
          </button>
          {sections.map(s => (
            <button key={s} onClick={() => setActiveSection(s)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeSection === s ? "bg-indigo-600 text-white" : "bg-white/6 text-white/40 hover:bg-white/10"}`}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="px-3 pb-2 flex gap-2 shrink-0">
        {[
          { label: "Вільних",  count: tables.filter(t => t.status === "free").length,     color: "text-emerald-400" },
          { label: "Зайнятих", count: tables.filter(t => t.status === "occupied").length,  color: "text-rose-400"    },
          { label: "Резервів", count: tables.filter(t => t.status === "reserved").length,  color: "text-amber-400"   },
        ].map(s => (
          <div key={s.label} className="flex-1 bg-white/4 rounded-lg px-2 py-1.5 text-center">
            <p className={`text-sm font-bold ${s.color}`}>{s.count}</p>
            <p className="text-[10px] text-white/30">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tables grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-white/30" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-12 text-white/25 text-sm">Столи не налаштовані</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visible.map(table => {
              const st   = STATUS_STYLE[table.status] || STATUS_STYLE.free;
              const ord  = orderMap[table.id];
              const isSelected = selectedTableId === table.id;
              return (
                <button key={table.id} onClick={() => onSelect(table)}
                  className={`relative text-left rounded-2xl border p-3 transition-all ${st.bg} ${st.border} ${
                    isSelected ? "ring-2 ring-indigo-500 ring-offset-1 ring-offset-[#12141f]" : "hover:brightness-110"
                  }`}>
                  {/* Status dot */}
                  <div className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full ${st.dot}`} />

                  <p className="text-base font-bold text-white">#{table.table_number}</p>
                  <p className="text-[10px] text-white/40 mb-1">{table.section}</p>

                  {table.status === "occupied" && ord ? (
                    <>
                      <div className="flex items-center gap-1 mb-1">
                        <Users className="w-3 h-3 text-white/30" />
                        <span className="text-xs text-white/50">{ord.guest_count || "?"} гостей</span>
                      </div>
                      <p className="text-sm font-bold text-rose-300">{fmt(ord.total_amount)}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="w-2.5 h-2.5 text-white/25" />
                        <span className="text-[10px] text-white/30">{elapsed(ord.opened_at)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-white/20" />
                      <span className="text-xs text-white/30">{table.capacity} місць</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Menu Panel ────────────────────────────────────────────────────────────────
function MenuPanel({ categories, items, onAddItem, disabled }: {
  categories: Category[]; items: MenuItem[]; onAddItem: (item: MenuItem) => void; disabled?: boolean;
}) {
  const [catId,  setCatId]  = useState<number | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = items.filter(i =>
    i.is_available &&
    (catId === "all" || i.category_id === catId) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 h-9">
          <Search className="w-3.5 h-3.5 text-white/25 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Пошук страви або напою..." autoComplete="off"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none" />
          {search && <button onClick={() => setSearch("")}><X className="w-3 h-3 text-white/30" /></button>}
        </div>
      </div>

      {/* Categories */}
      <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
        <button onClick={() => setCatId("all")}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${catId === "all" ? "bg-indigo-500 text-white" : "bg-white/6 text-white/40 hover:bg-white/10"}`}>
          Всі
        </button>
        {categories.map(c => (
          <button key={c.id} onClick={() => setCatId(c.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${catId === c.id ? "bg-indigo-500 text-white" : "bg-white/6 text-white/40 hover:bg-white/10"}`}>
            {c.icon && <span className="mr-1">{c.icon}</span>}{c.name}
          </button>
        ))}
      </div>

      {/* Items grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-white/25 text-sm">Нічого не знайдено</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map(item => (
              <button key={item.id} onClick={() => !disabled && onAddItem(item)}
                disabled={disabled}
                className={`text-left rounded-2xl bg-white/4 hover:bg-white/8 border border-white/6 hover:border-white/12 overflow-hidden transition-all group ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
                {/* Photo */}
                {item.image_url ? (
                  <div className="w-full aspect-[4/3] overflow-hidden bg-white/5">
                    <img src={item.image_url} alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                ) : (
                  <div className="w-full aspect-[4/3] bg-white/5 flex items-center justify-center text-3xl">
                    🍽️
                  </div>
                )}
                {/* Info */}
                <div className="p-2.5">
                  <div className="flex items-start justify-between gap-1 mb-0.5">
                    <p className="text-xs font-medium text-white/85 leading-tight flex-1">{item.name}</p>
                    <div className="w-5 h-5 rounded-full bg-indigo-500/20 group-hover:bg-indigo-500/40 flex items-center justify-center shrink-0 transition-colors mt-0.5">
                      <Plus className="w-3 h-3 text-indigo-300" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-indigo-300">{fmt(item.price)}</span>
                    {item.is_alcohol && <span className="text-[9px] text-rose-400/60">🍷</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Order Panel ───────────────────────────────────────────────────────────────
function OrderPanel({ table, order, items, onChangeQty, onNoteItem, onPrecheck, onPay, onSend, sending }: {
  table: Table | null; order: Order | null; items: OrderItem[];
  onChangeQty: (itemId: number, delta: number) => void;
  onNoteItem: (item: OrderItem) => void;
  onPrecheck: () => void; onPay: () => void;
  onSend: () => void; sending: boolean;
}) {
  const total = items.reduce((s, i) => s + i.total_price, 0);
  const unsaved = items.some(i => !i.id);

  if (!table) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20">
        <Table2 className="w-12 h-12" />
        <p className="text-sm">Оберіть стіл</p>
        <p className="text-xs text-white/15">або відкрийте нове замовлення</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Table header */}
      <div className="px-4 py-3 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base font-bold text-white">Стіл #{table.table_number}</span>
          <Badge variant="outline" className="text-[10px] border-white/15 text-white/40">{table.section}</Badge>
          {order?.guest_count && (
            <div className="flex items-center gap-1 ml-auto">
              <Users className="w-3 h-3 text-white/30" />
              <span className="text-xs text-white/40">{order.guest_count} гостей</span>
            </div>
          )}
        </div>
        {order?.opened_at && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-white/20" />
            <span className="text-[10px] text-white/30">Відкрито {elapsed(order.opened_at)} тому</span>
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/20">
            <UtensilsCrossed className="w-8 h-8 mb-2" />
            <p className="text-sm">Додайте страви з меню</p>
          </div>
        ) : (
          items.map((item, idx) => (
            <div key={idx}
              className={`flex items-center gap-2 py-2 border-b border-white/5 group ${!item.id ? "opacity-70" : ""}`}>
              {/* Qty controls */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => onChangeQty(item.item_id, -1)}
                  className="w-6 h-6 rounded-lg bg-white/8 hover:bg-red-500/20 flex items-center justify-center transition-colors">
                  <Minus className="w-3 h-3 text-white/60" />
                </button>
                <span className="w-6 text-center text-sm font-bold text-white">{item.quantity}</span>
                <button onClick={() => onChangeQty(item.item_id, 1)}
                  className="w-6 h-6 rounded-lg bg-white/8 hover:bg-indigo-500/30 flex items-center justify-center transition-colors">
                  <Plus className="w-3 h-3 text-white/60" />
                </button>
              </div>

              {/* Name + note */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/85 truncate">{item.name}</p>
                {item.notes && (
                  <p className="text-[10px] text-amber-400/70 truncate">{item.notes}</p>
                )}
              </div>

              {/* Price + note button */}
              <div className="shrink-0 flex items-center gap-1.5">
                <button onClick={() => onNoteItem(item)}
                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${item.notes ? "bg-amber-500/20 text-amber-400" : "bg-white/5 text-white/20 opacity-0 group-hover:opacity-100"}`}>
                  <StickyNote className="w-3 h-3" />
                </button>
                <span className="text-sm font-medium text-white/85 w-14 text-right">{fmt(item.total_price)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom: total + actions */}
      {items.length > 0 && (
        <div className="px-4 py-3 border-t border-white/8 shrink-0 space-y-3">
          {/* Total */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">{items.reduce((s, i) => s + i.quantity, 0)} позицій</span>
            <span className="text-xl font-bold text-white">{fmtDec(total)}</span>
          </div>

          {/* Send to kitchen button (if unsaved items) */}
          {unsaved && (
            <button onClick={onSend} disabled={sending}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              Відправити на кухню / бар
            </button>
          )}

          {/* Pre-check + Pay */}
          {!unsaved && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onPrecheck}
                className="py-3 rounded-xl bg-white/8 hover:bg-white/12 text-white/70 font-medium text-sm flex items-center justify-center gap-1.5 transition-colors">
                <FileText className="w-4 h-4" /> Предчек
              </button>
              <button onClick={onPay}
                className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm flex items-center justify-center gap-1.5 transition-colors">
                <CreditCard className="w-4 h-4" /> Оплата
              </button>
            </div>
          )}

          {unsaved && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onPrecheck}
                className="py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-white/50 text-xs flex items-center justify-center gap-1 transition-colors">
                <FileText className="w-3.5 h-3.5" /> Предчек
              </button>
              <button onClick={onPay}
                className="py-2.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 text-xs flex items-center justify-center gap-1 transition-colors">
                <CreditCard className="w-3.5 h-3.5" /> Оплата
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type MobileTab = "tables" | "menu" | "order";

export default function WaiterStationPage() {
  const { toast } = useToast();

  // Data
  const [tables,       setTables]       = useState<Table[]>([]);
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [menuItems,    setMenuItems]    = useState<MenuItem[]>([]);
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [legalEntities,setLegalEntities]= useState<LegalEntity[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [menuUpdatedAt,setMenuUpdatedAt]= useState<Date | null>(null);

  // Order state
  const [selectedTable, setSelectedTable]   = useState<Table | null>(null);
  const [currentOrder,  setCurrentOrder]    = useState<Order | null>(null);
  const [orderItems,    setOrderItems]      = useState<OrderItem[]>([]);
  const [sending,       setSending]         = useState(false);

  // Dialogs
  const [openTableFor,  setOpenTableFor]  = useState<Table | null>(null);
  const [noteItem,      setNoteItem]      = useState<OrderItem | null>(null);
  const [showPrecheck,  setShowPrecheck]  = useState(false);
  const [showPayment,   setShowPayment]   = useState(false);

  // Mobile tab
  const [mobileTab, setMobileTab] = useState<MobileTab>("tables");

  // ── Load data ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [t, c, m, o, le] = await Promise.all([
        apiFetch("/fb/tables").then(r => r.json()),
        apiFetch("/fb/categories").then(r => r.json()),
        apiFetch("/fb/items").then(r => r.json()),
        apiFetch("/fb/orders?status=open").then(r => r.json()),
        apiFetch("/legal-entities").then(r => r.json()),
      ]);
      setTables(t.tables || []);
      setCategories(c.categories || []);
      setMenuItems(m.items || []);
      setMenuUpdatedAt(new Date());
      setOrders(o.orders || []);
      setLegalEntities(le.legalEntities || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh tables+orders every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      apiFetch("/fb/tables").then(r => r.json()).then(d => setTables(d.tables || [])).catch(() => {});
      apiFetch("/fb/orders?status=open").then(r => r.json()).then(d => setOrders(d.orders || [])).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh menu (categories + items) every 5 min — picks up name/photo edits from F&B mgmt
  useEffect(() => {
    const interval = setInterval(() => {
      Promise.all([
        apiFetch("/fb/categories").then(r => r.json()),
        apiFetch("/fb/items").then(r => r.json()),
      ]).then(([c, m]) => {
        setCategories(c.categories || []);
        setMenuItems(m.items || []);
        setMenuUpdatedAt(new Date());
      }).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Select table ─────────────────────────────────────────────────────────────
  const handleSelectTable = async (table: Table) => {
    if (table.status === "free") {
      // Open new order dialog
      setOpenTableFor(table);
      return;
    }
    // Load existing order
    setSelectedTable(table);
    setMobileTab("order");
    if (table.current_order_id) {
      try {
        const r = await apiFetch(`/fb/orders/${table.current_order_id}`).then(r => r.json());
        if (r.order) {
          setCurrentOrder(r.order);
          setOrderItems((r.order.items || []).map((i: any) => ({
            id: i.id, item_id: i.item_id, name: i.name,
            price: Number(i.price), quantity: i.quantity,
            total_price: Number(i.total_price), notes: i.notes,
            is_alcohol: !!i.is_alcohol,
          })));
        }
      } catch { toast({ title: "Помилка завантаження замовлення", variant: "destructive" }); }
    }
  };

  // ── Open table ───────────────────────────────────────────────────────────────
  const handleOpenTable = async (guestCount: number, guestName: string) => {
    if (!openTableFor) return;
    try {
      const r = await apiFetch("/fb/orders", {
        method: "POST",
        body: JSON.stringify({ tableId: openTableFor.id, orderType: "dine_in", guestCount, guestName }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setCurrentOrder(d.order);
      setOrderItems([]);
      setSelectedTable({ ...openTableFor, status: "occupied", current_order_id: d.order.id });
      setTables(prev => prev.map(t => t.id === openTableFor.id
        ? { ...t, status: "occupied", current_order_id: d.order.id } : t));
      setOpenTableFor(null);
      setMobileTab("menu");
      toast({ title: `Стіл #${openTableFor.table_number} відкрито · ${guestCount} гостей` });
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    }
  };

  // ── Add item (local only until Send) ─────────────────────────────────────────
  const addItem = (item: MenuItem) => {
    if (!selectedTable) { toast({ title: "Спочатку оберіть стіл", variant: "destructive" }); return; }
    setOrderItems(prev => {
      const ex = prev.find(i => i.item_id === item.id);
      if (ex) return prev.map(i => i.item_id === item.id
        ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * i.price } : i);
      return [...prev, {
        item_id: item.id, name: item.name, price: Number(item.price),
        quantity: 1, total_price: Number(item.price), is_alcohol: !!item.is_alcohol,
      }];
    });
    setMobileTab("order");
  };

  // ── Change qty ───────────────────────────────────────────────────────────────
  const changeQty = (itemId: number, delta: number) => {
    setOrderItems(prev => prev
      .map(i => i.item_id === itemId ? { ...i, quantity: Math.max(0, i.quantity + delta), total_price: Math.max(0, i.quantity + delta) * i.price } : i)
      .filter(i => i.quantity > 0));
  };

  // ── Add note to item ─────────────────────────────────────────────────────────
  const saveNote = (note: string) => {
    if (!noteItem) return;
    setOrderItems(prev => prev.map(i => i.item_id === noteItem.item_id ? { ...i, notes: note || undefined } : i));
  };

  // ── Send to kitchen/bar ───────────────────────────────────────────────────────
  const sendOrder = async () => {
    if (!currentOrder || !selectedTable) return;
    const unsaved = orderItems.filter(i => !i.id);
    if (unsaved.length === 0) return;
    setSending(true);
    try {
      await Promise.all(unsaved.map(item =>
        apiFetch(`/fb/orders/${currentOrder.id}/items`, {
          method: "POST",
          body: JSON.stringify({ itemId: item.item_id, quantity: item.quantity, notes: item.notes }),
        })
      ));
      // Reload order to get saved item IDs
      const r = await apiFetch(`/fb/orders/${currentOrder.id}`).then(r => r.json());
      if (r.order) {
        setCurrentOrder(r.order);
        setOrderItems((r.order.items || []).map((i: any) => ({
          id: i.id, item_id: i.item_id, name: i.name,
          price: Number(i.price), quantity: i.quantity,
          total_price: Number(i.total_price), notes: i.notes, is_alcohol: !!i.is_alcohol,
        })));
      }
      // Update table total in list
      setTables(prev => prev.map(t => t.id === selectedTable.id ? t : t));
      await load();
      toast({ title: `✅ ${unsaved.length} поз. відправлено на кухню / бар` });
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  // ── After payment ─────────────────────────────────────────────────────────────
  const afterPayment = () => {
    setShowPayment(false);
    setSelectedTable(null);
    setCurrentOrder(null);
    setOrderItems([]);
    setMobileTab("tables");
    load();
    toast({ title: "✅ Стіл закрито, замовлення завершено" });
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-[#12141f] text-white overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/6 shrink-0 bg-[#1a1d2e]">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white">Станція офіціанта</span>
            {selectedTable && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-white/25" />
                <span className="text-sm text-indigo-300 font-medium">Стіл #{selectedTable.table_number}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/30" />}
            <button onClick={() => load()}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
              <RefreshCw className="w-3.5 h-3.5 text-white/40" />
            </button>
            {selectedTable && (
              <button onClick={() => { setSelectedTable(null); setCurrentOrder(null); setOrderItems([]); setMobileTab("tables"); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 text-xs transition-colors">
                <X className="w-3 h-3" /> Закрити стіл
              </button>
            )}
          </div>
        </div>

        {/* Desktop: 3 columns */}
        <div className="hidden md:flex flex-1 overflow-hidden">
          {/* Col 1: Tables */}
          <div className="w-56 shrink-0 border-r border-white/6 overflow-hidden flex flex-col bg-[#1a1d2e]">
            <p className="px-3 pt-3 pb-1 text-[10px] text-white/25 uppercase tracking-widest shrink-0">Столи</p>
            <TablesPanel tables={tables} orders={orders} selectedTableId={selectedTable?.id || null}
              onSelect={handleSelectTable} loading={loading} />
          </div>

          {/* Col 2: Menu */}
          <div className="flex-1 border-r border-white/6 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 pt-3 pb-1 shrink-0">
              <p className="text-[10px] text-white/25 uppercase tracking-widest">Меню</p>
              {menuUpdatedAt && (
                <span className="text-[9px] text-white/20">
                  Оновлено {menuUpdatedAt.getHours().toString().padStart(2,"0")}:{menuUpdatedAt.getMinutes().toString().padStart(2,"0")}
                </span>
              )}
            </div>
            <MenuPanel categories={categories} items={menuItems} onAddItem={addItem}
              disabled={!selectedTable} />
          </div>

          {/* Col 3: Order */}
          <div className="w-72 shrink-0 overflow-hidden flex flex-col bg-[#1a1d2e]">
            <p className="px-4 pt-3 pb-1 text-[10px] text-white/25 uppercase tracking-widest shrink-0">Замовлення</p>
            <OrderPanel
              table={selectedTable} order={currentOrder} items={orderItems}
              onChangeQty={changeQty} onNoteItem={item => setNoteItem(item)}
              onPrecheck={() => setShowPrecheck(true)} onPay={() => setShowPayment(true)}
              onSend={sendOrder} sending={sending}
            />
          </div>
        </div>

        {/* Mobile: single panel + bottom tabs */}
        <div className="md:hidden flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden">
            {mobileTab === "tables" && (
              <TablesPanel tables={tables} orders={orders} selectedTableId={selectedTable?.id || null}
                onSelect={handleSelectTable} loading={loading} />
            )}
            {mobileTab === "menu" && (
              <MenuPanel categories={categories} items={menuItems} onAddItem={addItem}
                disabled={!selectedTable} />
            )}
            {mobileTab === "order" && (
              <OrderPanel
                table={selectedTable} order={currentOrder} items={orderItems}
                onChangeQty={changeQty} onNoteItem={item => setNoteItem(item)}
                onPrecheck={() => setShowPrecheck(true)} onPay={() => setShowPayment(true)}
                onSend={sendOrder} sending={sending}
              />
            )}
          </div>

          {/* Bottom tab bar */}
          <div className="border-t border-white/6 bg-[#1a1d2e] flex shrink-0">
            {([
              { key: "tables", icon: Table2,         label: "Столи" },
              { key: "menu",   icon: UtensilsCrossed, label: "Меню"  },
              { key: "order",  icon: Receipt,         label: "Замовлення" },
            ] as { key: MobileTab; icon: any; label: string }[]).map(tab => {
              const Icon = tab.icon;
              const isActive = mobileTab === tab.key;
              const badge = tab.key === "order" ? orderItems.reduce((s, i) => s + i.quantity, 0) : 0;
              return (
                <button key={tab.key} onClick={() => setMobileTab(tab.key)}
                  className={`flex-1 py-3 flex flex-col items-center gap-1 transition-colors relative ${isActive ? "text-indigo-400" : "text-white/30"}`}>
                  <div className="relative">
                    <Icon className="w-5 h-5" />
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 bg-rose-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium">{tab.label}</span>
                  {isActive && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-indigo-500 rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Dialogs ── */}
      {openTableFor && (
        <OpenTableDialog table={openTableFor}
          onConfirm={handleOpenTable} onClose={() => setOpenTableFor(null)} />
      )}
      {noteItem && (
        <ItemNoteDialog item={noteItem}
          onSave={saveNote} onClose={() => setNoteItem(null)} />
      )}
      {showPrecheck && currentOrder && (
        <PrecheckDialog order={currentOrder} items={orderItems}
          onClose={() => setShowPrecheck(false)} onPay={() => { setShowPrecheck(false); setShowPayment(true); }} />
      )}
      {showPayment && currentOrder && (
        <PaymentDialog order={currentOrder} items={orderItems} legalEntities={legalEntities}
          onPaid={afterPayment} onClose={() => setShowPayment(false)} />
      )}
    </AppLayout>
  );
}
