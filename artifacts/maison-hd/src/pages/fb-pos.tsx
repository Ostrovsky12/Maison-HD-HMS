import { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingCart, CreditCard, Banknote, Smartphone, X, Plus, Minus,
  Clock, Users, CheckCircle2, LogIn, LogOut, Loader2, RefreshCw,
  Receipt, TrendingUp, Table2, UtensilsCrossed, Percent, Hash,
  ChevronRight, AlertCircle, Heart, Building2, Tag, UserCircle, Phone, Search,
  Scissors, PlusCircle, Layers, ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace(/\/maison-hd$/, "") + "/api";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });

// ── Types ────────────────────────────────────────────────────────────────────
type Session = { id: number; cashbox_name: string; opening_balance: number; expected_balance: number; cash_in: number; opened_at: string; cashier_name?: string; legal_entity_id?: number | null; entity_name?: string; entity_short_name?: string; entity_type?: string };
type Table   = { id: number; table_number: string; section: string; capacity: number; status: string; current_order_id?: number };
type Category = { id: number; name: string; icon?: string; sort_order: number };
type MenuItem = { id: number; name: string; price: number; category_id: number; is_available: boolean; description?: string; is_alcohol?: boolean; excise_per_unit?: number; image_url?: string };
type OrderItem = { id?: number; item_id: number; name: string; price: number; quantity: number; total_price: number; notes?: string; is_alcohol?: boolean; excise_per_unit?: number };
type Order = { id: number; table_id?: number; order_type: string; guest_name?: string; status: string; total_amount: number; items?: OrderItem[] };
type LegalEntity = { id: number; name: string; short_name?: string; type: string; is_default?: boolean; handles_alcohol?: boolean };

const TIP_OPTIONS = [
  { label: "Без чайових", pct: 0 },
  { label: "5%",  pct: 5  },
  { label: "7%",  pct: 7  },
  { label: "10%", pct: 10 },
  { label: "15%", pct: 15 },
];

const PAYMENT_METHODS = [
  { key: "cash",      label: "Готівка",      icon: Banknote,   color: "text-emerald-600" },
  { key: "card",      label: "Картка",       icon: CreditCard, color: "text-blue-600"    },
  { key: "liqpay",    label: "LiqPay",       icon: Smartphone, color: "text-amber-600"   },
];

const TABLE_STATUS: Record<string, { label: string; bg: string; border: string; text: string }> = {
  free:     { label: "Вільний",    bg: "bg-emerald-500/15", border: "border-emerald-400/40", text: "text-emerald-300" },
  occupied: { label: "Зайнятий",   bg: "bg-red-500/15",     border: "border-red-400/40",     text: "text-red-300"    },
  reserved: { label: "Резерв",     bg: "bg-amber-500/15",   border: "border-amber-400/40",   text: "text-amber-300"  },
};

function fmt(n: number | string | undefined | null) {
  return `₴${Number(n || 0).toFixed(2)}`;
}

function getMyRole(): string {
  try {
    const t = localStorage.getItem("hms_token") || "";
    if (!t) return "reception";
    const payload = t.split(".")[1];
    return JSON.parse(atob(payload)).role || "reception";
  } catch { return "reception"; }
}

const CASHIER_ROLES_POS = ["cashier", "manager", "owner", "super_admin"];

type PaymentEntry = { method: string; amount: string };

// ── Session Banner ────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  super_admin: { label: "Супер-адмін", color: "text-purple-300 bg-purple-500/15" },
  owner:       { label: "Власник",     color: "text-indigo-300 bg-indigo-500/15" },
  manager:     { label: "Менеджер",    color: "text-blue-300 bg-blue-500/15"     },
  cashier:     { label: "Касир",       color: "text-emerald-300 bg-emerald-500/15" },
  waiter:      { label: "Офіціант",    color: "text-amber-300 bg-amber-500/15"   },
  reception:   { label: "Рецепція",    color: "text-sky-300 bg-sky-500/15"       },
  housekeeping:{ label: "Покоївка",    color: "text-rose-300 bg-rose-500/15"     },
};

function SessionBanner({ session, myRole, entity, showRoleBadge, onOpen, onClose }: {
  session: Session | null; myRole: string; entity?: LegalEntity | null;
  showRoleBadge?: boolean; onOpen: () => void; onClose: () => void;
}) {
  const canManageCashbox = CASHIER_ROLES_POS.includes(myRole);
  const roleInfo = ROLE_LABELS[myRole] || { label: myRole, color: "text-white/50 bg-white/5" };
  const entityLabel = entity ? (entity.short_name || entity.name) : null;
  const entityTypeBadge = entity ? (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold mr-1 ${entity.type === "tov" ? "bg-blue-500/30 text-blue-300" : "bg-emerald-500/30 text-emerald-300"}`}>
      {entity.type.toUpperCase()}
    </span>
  ) : null;

  if (!session) {
    return (
      <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-sm text-amber-300 flex-1">
          {entityLabel ? <>{entityTypeBadge}{entityLabel} — зміна не відкрита</> : "Зміна не відкрита. Щоб приймати замовлення, відкрийте зміну."}
        </span>
        {showRoleBadge && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${roleInfo.color}`}>{roleInfo.label}</span>}
        {canManageCashbox ? (
          <Button size="sm" onClick={onOpen} className="bg-amber-500 hover:bg-amber-600 text-white shrink-0">
            <LogIn className="w-3.5 h-3.5 mr-1.5" /> Відкрити
          </Button>
        ) : (
          <span className="text-xs text-amber-500/60 shrink-0">Тільки касир може відкрити зміну</span>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5">
      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
      <span className="text-sm font-medium text-emerald-300 shrink-0 flex items-center">
        {entityTypeBadge}{entityLabel || session.cashbox_name}
      </span>
      <span className="text-xs text-emerald-400/70 hidden sm:block">
        {format(new Date(session.opened_at), "HH:mm", { locale: uk })}
        {session.cashier_name && ` · ${session.cashier_name}`}
      </span>
      {showRoleBadge && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${roleInfo.color}`}>{roleInfo.label}</span>}
      <span className="text-xs text-emerald-400/70 ml-auto">
        Каса: <span className="font-semibold text-emerald-300">{fmt(session.expected_balance)}</span>
      </span>
      {canManageCashbox && (
        <Button size="sm" variant="outline" onClick={onClose} className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 h-7 shrink-0">
          <LogOut className="w-3 h-3 mr-1" /> Закрити
        </Button>
      )}
    </div>
  );
}

// ── Tables Grid ───────────────────────────────────────────────────────────────
function TablesGrid({ tables, selectedTableId, onSelect }: {
  tables: Table[]; selectedTableId: number | null; onSelect: (t: Table) => void;
}) {
  const sections = [...new Set(tables.map(t => t.section))].sort();
  return (
    <div className="space-y-4">
      {sections.map(section => (
        <div key={section}>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-2 px-1">{section}</p>
          <div className="grid grid-cols-3 gap-2">
            {tables.filter(t => t.section === section).map(table => {
              const meta = TABLE_STATUS[table.status] || TABLE_STATUS.free;
              const selected = selectedTableId === table.id;
              return (
                <button
                  key={table.id}
                  onClick={() => onSelect(table)}
                  className={`relative p-3 rounded-xl border transition-all text-left ${meta.bg} ${meta.border} ${
                    selected ? "ring-2 ring-indigo-400 ring-offset-1 ring-offset-[#1a1d2e]" : "hover:brightness-110"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-white/90">#{table.table_number}</span>
                    <Users className="w-3 h-3 text-white/30" />
                  </div>
                  <div className="text-[10px] text-white/40">{table.capacity} міс.</div>
                  <div className={`text-[9px] font-semibold mt-1 ${meta.text}`}>{meta.label}</div>
                  {table.status === "occupied" && (
                    <div className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Menu Panel ────────────────────────────────────────────────────────────────
function MenuPanel({ categories, items, onAddItem }: {
  categories: Category[]; items: MenuItem[]; onAddItem: (item: MenuItem) => void;
}) {
  const [selectedCat, setSelectedCat] = useState<number | "all">("all");
  const [search, setSearch]           = useState("");

  const filtered = items.filter(i =>
    i.is_available &&
    (selectedCat === "all" || i.category_id === selectedCat) &&
    (search === "" || i.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-1 pb-2">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Пошук страви..."
          className="h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/25"
        />
      </div>
      {/* Categories */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => setSelectedCat("all")}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selectedCat === "all" ? "bg-indigo-500 text-white" : "bg-white/6 text-white/50 hover:bg-white/10"
          }`}
        >Всі</button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCat(cat.id)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCat === cat.id ? "bg-indigo-500 text-white" : "bg-white/6 text-white/50 hover:bg-white/10"
            }`}
          >
            {cat.icon && <span className="mr-1">{cat.icon}</span>}{cat.name}
          </button>
        ))}
      </div>
      {/* Items */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-white/25 text-sm">Страв не знайдено</div>
        )}
        {filtered.map(item => (
          <button
            key={item.id}
            onClick={() => onAddItem(item)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl bg-white/4 hover:bg-white/8 border border-white/6 hover:border-white/12 transition-all group text-left"
          >
            {/* Thumbnail */}
            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white/8 flex items-center justify-center text-lg">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
              ) : "🍽️"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white/85 truncate">{item.name}</p>
              {item.description && <p className="text-xs text-white/30 truncate">{item.description}</p>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-sm font-bold text-indigo-300">{fmt(item.price)}</span>
              <div className="w-6 h-6 rounded-full bg-indigo-500/20 group-hover:bg-indigo-500/40 flex items-center justify-center transition-colors">
                <Plus className="w-3 h-3 text-indigo-300" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Payment Dialog ────────────────────────────────────────────────────────────
function PaymentDialog({ order, onPaid, onClose }: {
  order: Order; onPaid: (data: any) => void; onClose: () => void;
}) {
  const [method, setMethod]               = useState("cash");
  const [given, setGiven]                 = useState("");
  const [tipPct, setTipPct]               = useState(0);
  const [loading, setLoading]             = useState(false);
  const [fiscalResult, setFiscalResult]   = useState<any>(null);
  const [discounts, setDiscounts]         = useState<any[]>([]);
  const [selectedDiscount, setSelectedDiscount] = useState<any>(null);
  const [manualDiscount, setManualDiscount]     = useState("");
  // Mixed payment
  const [isMixed, setIsMixed]             = useState(false);
  const [mixedPayments, setMixedPayments] = useState<PaymentEntry[]>([
    { method: "cash", amount: "" },
    { method: "card", amount: "" },
  ]);
  // Legal entities
  const [legalEntities, setLegalEntities]     = useState<LegalEntity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const { toast } = useToast();

  // Detect alcohol in this order
  const hasAlcohol = (order.items || []).some((i: any) => i.is_alcohol);

  useEffect(() => {
    apiFetch("/fb/discounts").then(r => r.json()).then(d => setDiscounts(d.discounts || []));
    // Load legal entities and auto-select based on alcohol content
    apiFetch("/legal-entities").then(r => r.json()).then(d => {
      const entities: LegalEntity[] = d.legalEntities || [];
      setLegalEntities(entities);
      if (entities.length > 0) {
        // Auto-select: alcohol order → entity with handles_alcohol=true, otherwise → is_default or first
        const alcoholEntity  = entities.find(e => e.handles_alcohol);
        const defaultEntity  = entities.find(e => e.is_default) || entities[0];
        const autoSelected   = hasAlcohol && alcoholEntity ? alcoholEntity : defaultEntity;
        setSelectedEntityId(autoSelected?.id ?? null);
      }
    }).catch(() => {});
  }, []);

  const calcDiscountAmt = () => {
    if (selectedDiscount) {
      if (selectedDiscount.type === "compliment") return order.total_amount;
      if (selectedDiscount.type === "percent") return Math.round(order.total_amount * Number(selectedDiscount.value)) / 100;
      if (selectedDiscount.type === "fixed") return Math.min(Number(selectedDiscount.value), order.total_amount);
    }
    return Math.min(Number(manualDiscount) || 0, order.total_amount);
  };

  const discountAmt  = calcDiscountAmt();
  const baseTotal    = order.total_amount - discountAmt;
  const tipAmt       = tipPct > 0 ? Math.round(baseTotal * tipPct) / 100 : 0;
  const finalTotal   = baseTotal + tipAmt;
  const mixedSum     = mixedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const mixedOk      = isMixed ? Math.abs(mixedSum - finalTotal) < 0.01 : true;
  const change       = !isMixed && method === "cash" && Number(given) > finalTotal ? Number(given) - finalTotal : 0;
  const canPay       = isMixed ? mixedOk : (method !== "cash" || !given || Number(given) >= finalTotal);

  const toggleDiscount = (d: any) => {
    if (selectedDiscount?.id === d.id) setSelectedDiscount(null);
    else { setSelectedDiscount(d); setManualDiscount(""); }
  };

  const updateMixedEntry = (idx: number, field: "method" | "amount", value: string) => {
    setMixedPayments(prev => {
      const updated = prev.map((p, i) => i === idx ? { ...p, [field]: value } : p);
      // Auto-fill remaining amount into last entry
      if (field === "amount" && idx < updated.length - 1) {
        const filled = updated.slice(0, -1).reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const remaining = Math.max(0, finalTotal - filled);
        const last = updated[updated.length - 1];
        if (!last.amount || Number(last.amount) === 0) {
          updated[updated.length - 1] = { ...last, amount: remaining.toFixed(2) };
        }
      }
      return updated;
    });
  };

  const addMixedEntry = () => {
    setMixedPayments(prev => [...prev, { method: "cash", amount: "" }]);
  };

  const removeMixedEntry = (idx: number) => {
    setMixedPayments(prev => prev.filter((_, i) => i !== idx));
  };

  const pay = async () => {
    setLoading(true);
    try {
      const body: any = {
        discountAmount: discountAmt,
        tipAmount: tipAmt,
        tipPct,
        discountLabel: selectedDiscount?.name || null,
        legalEntityId: selectedEntityId || undefined,
      };
      if (isMixed) {
        body.payments = mixedPayments
          .filter(p => Number(p.amount) > 0)
          .map(p => ({ method: p.method, amount: Number(p.amount) }));
      } else {
        body.paymentMethod = method;
        body.paidAmount    = method === "cash" && given ? Number(given) : finalTotal;
      }
      const r = await apiFetch(`/fb/orders/${order.id}/pay`, { method: "POST", body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { toast({ title: "Помилка", description: d.error, variant: "destructive" }); return; }
      if (d.fiscal) setFiscalResult(d.fiscal);
      onPaid(d);
    } finally { setLoading(false); }
  };

  const discountTypeLabel = (type: string, value: number) => {
    if (type === "compliment") return "100%";
    if (type === "percent") return `${value}%`;
    return `${value} ₴`;
  };

  const exciseTotal = (order.items || []).reduce((sum, i) => sum + ((i.excise_per_unit || 0) * i.quantity), 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#1e2235] border-white/10 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Receipt className="w-4 h-4 text-indigo-300" /> Оплата замовлення
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">

          {/* ── Legal entity selector ──────────────────────── */}
          {legalEntities.length > 1 && (
            <div className="bg-white/5 rounded-xl px-3 py-2.5 space-y-1.5">
              <p className="text-xs text-white/40 flex items-center gap-1">
                <Building2 className="w-3 h-3" /> Юридична особа
                {hasAlcohol && <span className="ml-auto text-amber-400 text-[10px]">🍺 авто-вибір за алкоголем</span>}
              </p>
              <div className="flex gap-2 flex-wrap">
                {legalEntities.map(e => (
                  <button key={e.id}
                    onClick={() => setSelectedEntityId(e.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      selectedEntityId === e.id
                        ? "bg-indigo-500/25 border-indigo-400/50 text-indigo-200"
                        : "bg-white/4 border-white/10 text-white/50 hover:bg-white/8"
                    }`}>
                    <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                      e.type === "tov" ? "bg-blue-500/30 text-blue-300" : "bg-emerald-500/30 text-emerald-300"
                    }`}>{e.type.toUpperCase()}</span>
                    {e.short_name || e.name}
                    {e.handles_alcohol && <span className="text-amber-400">🍺</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Excise notice ──────────────────────────────── */}
          {exciseTotal > 0 && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-300">
              🍺 <span className="flex-1">Акцизний податок включено в ціну</span>
              <span className="font-mono font-semibold">{fmt(exciseTotal)}</span>
            </div>
          )}

          {/* ── Totals ──────────────────────────────────────── */}
          <div className="bg-white/5 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-white/60">
              <span>Сума замовлення:</span>
              <span className="text-white">{fmt(order.total_amount)}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-sm text-emerald-400">
                <span>Знижка{selectedDiscount ? ` (${selectedDiscount.name})` : ""}:</span>
                <span>-{fmt(discountAmt)}</span>
              </div>
            )}
            {tipAmt > 0 && (
              <div className="flex justify-between text-sm text-amber-300">
                <span>Чайові ({tipPct}%):</span>
                <span>+{fmt(tipAmt)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold border-t border-white/10 pt-2">
              <span className="text-white/80">До сплати:</span>
              <span className="text-indigo-300">{fmt(finalTotal)}</span>
            </div>
          </div>

          {/* ── Tips ────────────────────────────────────────── */}
          <div>
            <p className="text-xs text-white/40 mb-2 flex items-center gap-1">
              <Heart className="w-3 h-3" /> Чайові
            </p>
            <div className="flex gap-1.5">
              {TIP_OPTIONS.map(t => (
                <button key={t.pct} onClick={() => setTipPct(t.pct)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                    tipPct === t.pct
                      ? "bg-amber-500/25 border-amber-400/50 text-amber-200"
                      : "bg-white/4 border-white/8 text-white/40 hover:bg-white/8"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Discounts ──────────────────────────────────── */}
          <div>
            <p className="text-xs text-white/40 mb-2 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Знижка / Акція
            </p>
            {discounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {discounts.map((d: any) => (
                  <button key={d.id} onClick={() => toggleDiscount(d)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      selectedDiscount?.id === d.id
                        ? "bg-emerald-500/25 border-emerald-400/50 text-emerald-200"
                        : "bg-white/4 border-white/8 text-white/40 hover:bg-white/8"
                    }`}>
                    {d.name} <span className="opacity-60">({discountTypeLabel(d.type, d.value)})</span>
                  </button>
                ))}
              </div>
            )}
            {!selectedDiscount && (
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-white/30 shrink-0" />
                <Input type="number" min={0} max={order.total_amount} value={manualDiscount}
                  onChange={e => setManualDiscount(e.target.value)}
                  placeholder="Або введіть суму знижки (₴)"
                  className="h-9 bg-white/5 border-white/10 text-white text-sm" />
              </div>
            )}
          </div>

          {/* ── Payment method / Mixed toggle ────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-white/40 flex items-center gap-1">
                <Layers className="w-3 h-3" /> Спосіб оплати
              </p>
              <button onClick={() => setIsMixed(m => !m)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  isMixed
                    ? "bg-indigo-500/20 border-indigo-400/40 text-indigo-300"
                    : "bg-white/4 border-white/8 text-white/40 hover:bg-white/8"
                }`}>
                <Layers className="w-3 h-3 inline mr-1" />
                {isMixed ? "Звичайна оплата" : "Змішати оплату"}
              </button>
            </div>

            {!isMixed ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map(pm => {
                    const Icon = pm.icon;
                    return (
                      <button key={pm.key} onClick={() => setMethod(pm.key)}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all ${
                          method === pm.key
                            ? "bg-indigo-500/20 border-indigo-400/40 text-white"
                            : "bg-white/4 border-white/8 text-white/50 hover:bg-white/8"
                        }`}>
                        <Icon className={`w-5 h-5 ${method === pm.key ? pm.color : ""}`} />
                        <span className="text-xs">{pm.label}</span>
                      </button>
                    );
                  })}
                </div>
                {method === "cash" && (
                  <div className="space-y-2 mt-3">
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-white/30 shrink-0" />
                      <Input type="number" min={finalTotal} value={given}
                        onChange={e => setGiven(e.target.value)}
                        placeholder="Отримано від гостя (₴)"
                        className="h-9 bg-white/5 border-white/10 text-white text-sm" />
                    </div>
                    {change > 0 && (
                      <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                        <span className="text-sm text-emerald-300">Решта:</span>
                        <span className="text-lg font-bold text-emerald-300">{fmt(change)}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                {mixedPayments.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={p.method} onValueChange={v => updateMixedEntry(idx, "method", v)}>
                      <SelectTrigger className="w-32 h-9 bg-white/5 border-white/10 text-white text-xs shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1e2235] border-white/10">
                        {PAYMENT_METHODS.map(pm => (
                          <SelectItem key={pm.key} value={pm.key} className="text-white text-xs">{pm.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" min={0} value={p.amount}
                      onChange={e => updateMixedEntry(idx, "amount", e.target.value)}
                      placeholder="Сума (₴)"
                      className="flex-1 h-9 bg-white/5 border-white/10 text-white text-sm" />
                    {mixedPayments.length > 2 && (
                      <button onClick={() => removeMixedEntry(idx)} className="text-white/30 hover:text-red-400 shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between mt-1">
                  <button onClick={addMixedEntry}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                    <PlusCircle className="w-3.5 h-3.5" /> Ще спосіб оплати
                  </button>
                  <span className={`text-xs font-mono ${mixedOk ? "text-emerald-400" : "text-amber-400"}`}>
                    {fmt(mixedSum)} / {fmt(finalTotal)}
                    {!mixedOk && ` (не вистачає ${fmt(finalTotal - mixedSum)})`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Fiscal result ────────────────────────────────── */}
          {fiscalResult && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 space-y-1.5">
              <p className="text-xs text-blue-300 font-semibold flex items-center gap-1.5">
                🖨️ Фіскальний чек зареєстровано в Checkbox ПРРО
              </p>
              <p className="text-xs text-blue-200/60">Чек №: {fiscalResult.fiscalNumber || fiscalResult.id}</p>
              {fiscalResult.receiptUrl && (
                <a href={fiscalResult.receiptUrl} target="_blank" rel="noreferrer"
                   className="text-xs text-blue-400 underline">Переглянути чек →</a>
              )}
            </div>
          )}

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-white/60">Скасувати</Button>
          <Button onClick={pay} disabled={!canPay || loading} className="bg-indigo-600 hover:bg-indigo-500 text-white min-w-28">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Сплачено</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Split Bill Dialog ─────────────────────────────────────────────────────────
function SplitDialog({ order, orderItems, onSplit, onClose }: {
  order: Order; orderItems: OrderItem[];
  onSplit: (newOrder2: any) => void;
  onClose: () => void;
}) {
  const [assignments, setAssignments] = useState<Record<number, 1 | 2>>(
    Object.fromEntries(orderItems.map((_, i) => [i, 1]))
  );
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const bill1 = orderItems.filter((_, i) => assignments[i] === 1);
  const bill2 = orderItems.filter((_, i) => assignments[i] === 2);
  const bill1Total = bill1.reduce((s, i) => s + i.total_price, 0);
  const bill2Total = bill2.reduce((s, i) => s + i.total_price, 0);
  const canSplit   = bill1.length > 0 && bill2.length > 0;

  const toggle = (idx: number) => {
    setAssignments(prev => ({ ...prev, [idx]: prev[idx] === 1 ? 2 : 1 }));
  };

  const confirm = async () => {
    const bill2Ids = orderItems
      .filter((item, i) => assignments[i] === 2 && item.id)
      .map(item => item.id!);
    if (!bill2Ids.length) {
      toast({ title: "Оберіть позиції для рахунку 2", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      const r = await apiFetch(`/fb/orders/${order.id}/split`, {
        method: "POST",
        body: JSON.stringify({ itemIds: bill2Ids }),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: "Помилка", description: d.error, variant: "destructive" }); return; }
      toast({ title: "✅ Рахунок розділено", description: `Рахунок 2 → #${d.order2.id}` });
      onSplit(d.order2);
    } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-[#1e2235] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Scissors className="w-4 h-4 text-indigo-300" /> Розділити рахунок
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-white/40">Натисніть на позицію, щоб перемістити між рахунками</p>
        <div className="grid grid-cols-2 gap-4 mt-2">
          {/* Bill 1 */}
          <div className="bg-white/5 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" /> Рахунок 1
            </p>
            {bill1.length === 0 ? (
              <p className="text-xs text-white/20 italic">Порожньо</p>
            ) : bill1.map((item) => {
              const idx = orderItems.indexOf(item);
              return (
                <button key={idx} onClick={() => toggle(idx)}
                  className="w-full text-left px-2 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors">
                  <p className="text-xs text-white/80 truncate">{item.name}</p>
                  <p className="text-[10px] text-white/40">{Number(item.quantity) % 1 !== 0 ? item.quantity.toFixed(1) : item.quantity} × {fmt(item.price)} = {fmt(item.total_price)}</p>
                </button>
              );
            })}
            <div className="border-t border-white/10 pt-1 text-right">
              <span className="text-sm font-bold text-indigo-300">{fmt(bill1Total)}</span>
            </div>
          </div>
          {/* Bill 2 */}
          <div className="bg-white/5 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" /> Рахунок 2
            </p>
            {bill2.length === 0 ? (
              <p className="text-xs text-white/20 italic">Переміщуйте позиції сюди →</p>
            ) : bill2.map((item) => {
              const idx = orderItems.indexOf(item);
              return (
                <button key={idx} onClick={() => toggle(idx)}
                  className="w-full text-left px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
                  <p className="text-xs text-white/80 truncate">{item.name}</p>
                  <p className="text-[10px] text-white/40">{Number(item.quantity) % 1 !== 0 ? item.quantity.toFixed(1) : item.quantity} × {fmt(item.price)} = {fmt(item.total_price)}</p>
                </button>
              );
            })}
            {bill2.length > 0 && (
              <div className="border-t border-white/10 pt-1 text-right">
                <span className="text-sm font-bold text-emerald-300">{fmt(bill2Total)}</span>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} className="border-white/10 text-white/60">Скасувати</Button>
          <Button onClick={confirm} disabled={!canSplit || loading} className="bg-indigo-600 hover:bg-indigo-500 text-white">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Scissors className="w-4 h-4 mr-1.5" /> Розділити</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Open Session Dialog ───────────────────────────────────────────────────────
function OpenSessionDialog({ legalEntity, onOpened, onClose }: {
  legalEntity: LegalEntity | null; onOpened: (s: Session) => void; onClose: () => void;
}) {
  const defaultName = legalEntity
    ? (legalEntity.type === "tov" ? "Каса ТОВ" : `Каса ${legalEntity.type.toUpperCase()}`)
    : "Каса 1";
  const [balance, setBalance] = useState("0");
  const [name, setName]       = useState(defaultName);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const open = async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/fb/cashbox/session", {
        method: "POST",
        body: JSON.stringify({
          openingBalance: Number(balance),
          cashboxName: name,
          legalEntityId: legalEntity?.id ?? null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: "Помилка", description: d.error, variant: "destructive" }); return; }
      onOpened(d.session);
    } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-[#1e2235] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <LogIn className="w-4 h-4 text-emerald-300" /> Відкрити зміну
            {legalEntity && (
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${legalEntity.type === "tov" ? "bg-blue-500/30 text-blue-300" : "bg-emerald-500/30 text-emerald-300"}`}>
                {legalEntity.type.toUpperCase()} — {legalEntity.short_name || legalEntity.name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Назва каси</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="bg-white/5 border-white/10 text-white" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Готівка на початок зміни (₴)</Label>
            <Input type="number" min={0} value={balance} onChange={e => setBalance(e.target.value)} className="bg-white/5 border-white/10 text-white" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-white/60">Скасувати</Button>
          <Button onClick={open} disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Відкрити зміну"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Close Session Dialog ──────────────────────────────────────────────────────
function CloseSessionDialog({ session, onClosed, onClose }: { session: Session; onClosed: () => void; onClose: () => void }) {
  const [balance, setBalance] = useState(String(session.expected_balance));
  const [notes, setNotes]     = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const discrepancy = Number(balance) - Number(session.expected_balance);

  const close = async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/fb/cashbox/session/${session.id}/close`, {
        method: "PATCH",
        body: JSON.stringify({ closingBalance: Number(balance), notes }),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: "Помилка", description: d.error, variant: "destructive" }); return; }
      toast({ title: "Зміну закрито", description: `Каса: ${fmt(Number(balance))}` });
      onClosed();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-[#1e2235] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <LogOut className="w-4 h-4 text-red-300" /> Закрити зміну
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-white/5 rounded-xl p-3 space-y-1 text-sm">
            <div className="flex justify-between text-white/60"><span>Відкрито:</span><span className="text-white">{fmt(session.opening_balance)}</span></div>
            <div className="flex justify-between text-white/60"><span>Надходження:</span><span className="text-white">{fmt(session.cash_in)}</span></div>
            <div className="flex justify-between font-semibold border-t border-white/10 pt-1"><span className="text-white/80">Очікувано:</span><span className="text-indigo-300">{fmt(session.expected_balance)}</span></div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Фактично в касі (₴)</Label>
            <Input type="number" min={0} value={balance} onChange={e => setBalance(e.target.value)} className="bg-white/5 border-white/10 text-white" />
          </div>
          {discrepancy !== 0 && (
            <div className={`flex justify-between text-sm rounded-lg px-3 py-2 ${discrepancy >= 0 ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
              <span>Розбіжність:</span>
              <span className="font-bold">{discrepancy >= 0 ? "+" : ""}{fmt(discrepancy)}</span>
            </div>
          )}
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Примітки..."
            className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/25 resize-none h-16" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-white/60">Скасувати</Button>
          <Button onClick={close} disabled={loading} className="bg-red-600 hover:bg-red-500 text-white">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Закрити зміну"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main POS Page ─────────────────────────────────────────────────────────────
export default function FbPosPage() {
  const { toast } = useToast();

  // Data
  const [sessions, setSessions]         = useState<Session[]>([]);
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([]);
  const [tables, setTables]             = useState<Table[]>([]);
  const [categories, setCategories]     = useState<Category[]>([]);
  const [menuItems, setMenuItems]       = useState<MenuItem[]>([]);

  // UI state
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [currentOrder, setCurrentOrder]   = useState<Order | null>(null);
  const [orderItems, setOrderItems]       = useState<OrderItem[]>([]);
  const [guestName, setGuestName]         = useState("");
  const [guestCount, setGuestCount]       = useState(1);
  const [orderType, setOrderType]         = useState("dine_in");
  // Customer CRM
  const [customerPhone, setCustomerPhone]   = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const customerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Role
  const myRole = getMyRole();

  // Dialogs
  const [openForEntity, setOpenForEntity]   = useState<LegalEntity | null | undefined>(undefined); // undefined=closed
  const [closingSession, setClosingSession] = useState<Session | null>(null);
  const [showPayment, setShowPayment]       = useState(false);
  const [showSplit, setShowSplit]           = useState(false);
  const [loading, setLoading]               = useState(false);
  const [tab, setTab]                       = useState<"tables" | "menu">("tables");

  // Derived
  const canOperate = sessions.length > 0;
  // single-entity mode: keep backward-compat ref
  const session = sessions[0] || null;

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [s, le, t, c, m] = await Promise.all([
      apiFetch("/fb/cashbox/session").then(r => r.json()),
      apiFetch("/legal-entities").then(r => r.json()),
      apiFetch("/fb/tables").then(r => r.json()),
      apiFetch("/fb/categories").then(r => r.json()),
      apiFetch("/fb/items").then(r => r.json()),
    ]);
    setSessions(s.sessions || (s.session ? [s.session] : []));
    setLegalEntities(le.legalEntities || []);
    setTables(t.tables || []);
    setCategories(c.categories || []);
    setMenuItems(m.items || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh menu every 5 min — picks up name/photo edits from F&B mgmt
  useEffect(() => {
    const interval = setInterval(() => {
      Promise.all([
        apiFetch("/fb/categories").then(r => r.json()),
        apiFetch("/fb/items").then(r => r.json()),
      ]).then(([c, m]) => {
        setCategories(c.categories || []);
        setMenuItems(m.items || []);
      }).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Select table → load or init order ─────────────────────────────────────
  const selectTable = async (table: Table) => {
    setSelectedTable(table);
    setTab("menu");
    if (table.current_order_id) {
      const r = await apiFetch(`/fb/orders/${table.current_order_id}`).then(r => r.json());
      if (r.order) {
        setCurrentOrder(r.order);
        setOrderItems((r.order.items || []).map((i: any) => ({
          id: i.id, item_id: i.item_id, name: i.name,
          price: Number(i.price), quantity: i.quantity, total_price: Number(i.total_price),
          is_alcohol: !!i.is_alcohol, excise_per_unit: parseFloat(i.excise_per_unit) || 0,
        })));
        setGuestName(r.order.guest_name || "");
        setGuestCount(r.order.guest_count || 1);
      }
    } else {
      setCurrentOrder(null);
      setOrderItems([]);
      setGuestName("");
      setGuestCount(table.capacity || 1);
    }
  };

  // ── Add item to order ──────────────────────────────────────────────────────
  const addItem = (item: MenuItem) => {
    if (!canOperate) { toast({ title: "Зміна не відкрита", variant: "destructive" }); return; }
    setOrderItems(prev => {
      const existing = prev.find(i => i.item_id === item.id);
      if (existing) {
        return prev.map(i => i.item_id === item.id
          ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * i.price }
          : i
        );
      }
      return [...prev, { item_id: item.id, name: item.name, price: Number(item.price), quantity: 1, total_price: Number(item.price), is_alcohol: !!item.is_alcohol, excise_per_unit: Number(item.excise_per_unit) || 0 }];
    });
  };

  const changeQty = (itemId: number, delta: number) => {
    setOrderItems(prev => prev
      .map(i => i.item_id === itemId ? { ...i, quantity: i.quantity + delta, total_price: (i.quantity + delta) * i.price } : i)
      .filter(i => i.quantity > 0)
    );
  };

  const orderTotal = orderItems.reduce((s, i) => s + i.total_price, 0);

  // ── Place / save order ─────────────────────────────────────────────────────
  const placeOrder = async () => {
    if (!orderItems.length) { toast({ title: "Додайте страви", variant: "destructive" }); return; }
    if (!selectedTable && orderType === "dine_in") { toast({ title: "Оберіть стіл", variant: "destructive" }); return; }
    setLoading(true);
    try {
      let orderId = currentOrder?.id;
      if (!orderId) {
        const r = await apiFetch("/fb/orders", {
          method: "POST",
          body: JSON.stringify({
            tableId: selectedTable?.id || null,
            orderType, guestName, guestCount,
            status: "open",
          }),
        });
        const d = await r.json();
        if (!r.ok) { toast({ title: "Помилка", description: d.error, variant: "destructive" }); return; }
        orderId = d.order.id;
        setCurrentOrder(d.order);
      }
      // Add items
      for (const item of orderItems.filter(i => !i.id)) {
        await apiFetch(`/fb/orders/${orderId}/items`, {
          method: "POST",
          body: JSON.stringify({ itemId: item.item_id, name: item.name, price: item.price, quantity: item.quantity }),
        });
      }
      // Reload order
      const r2 = await apiFetch(`/fb/orders/${orderId}`).then(r => r.json());
      setCurrentOrder(r2.order);
      setOrderItems((r2.order?.items || []).map((i: any) => ({
        id: i.id, item_id: i.item_id, name: i.name,
        price: Number(i.price), quantity: i.quantity, total_price: Number(i.total_price),
      })));
      toast({ title: "Замовлення збережено", description: `Чек #${orderId}` });
      load();
    } finally { setLoading(false); }
  };

  // ── Customer search ────────────────────────────────────────────────────────
  const searchCustomers = (q: string) => {
    setCustomerPhone(q);
    setSelectedCustomer(null);
    if (customerSearchTimer.current) clearTimeout(customerSearchTimer.current);
    if (!q.trim()) { setCustomerResults([]); return; }
    customerSearchTimer.current = setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const r = await apiFetch(`/fb/customers/search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setCustomerResults(d.customers || []);
      } finally { setCustomerLoading(false); }
    }, 300);
  };

  const selectCustomer = (c: any) => {
    setSelectedCustomer(c);
    setCustomerPhone(c.phone || c.name);
    setCustomerResults([]);
    if (!guestName) setGuestName(c.name);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerPhone("");
    setCustomerResults([]);
  };

  // ── After payment ──────────────────────────────────────────────────────────
  const afterPayment = (data: any) => {
    toast({
      title: `✅ Оплата прийнята · ${data.receiptNumber}`,
      description: data.change > 0 ? `Решта: ₴${data.change.toFixed(2)}` : undefined,
    });
    setShowPayment(false);
    setCurrentOrder(null);
    setOrderItems([]);
    setSelectedTable(null);
    setSelectedCustomer(null);
    setCustomerPhone("");
    setTab("tables");
    load();
  };

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="h-[calc(100vh-57px)] flex flex-col bg-[#12141f]">
        {/* ── Top Bar ── */}
        <div className="px-4 py-3 border-b border-white/6 space-y-2 bg-[#15172a]">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-indigo-300" /> F&B Каса
            </h1>
            <Button size="icon" variant="ghost" onClick={load} className="text-white/30 hover:text-white/70 h-8 w-8">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          {legalEntities.length > 1 ? (
            <div className="space-y-2">
              {legalEntities.map((e, idx) => {
                const s = sessions.find(s => s.legal_entity_id === e.id) || null;
                return (
                  <SessionBanner key={e.id}
                    session={s} myRole={myRole} entity={e}
                    showRoleBadge={idx === 0}
                    onOpen={() => setOpenForEntity(e)}
                    onClose={() => setClosingSession(s)}
                  />
                );
              })}
            </div>
          ) : (
            <SessionBanner
              session={sessions[0] || null} myRole={myRole}
              entity={legalEntities[0] || null} showRoleBadge
              onOpen={() => setOpenForEntity(legalEntities[0] || null)}
              onClose={() => setClosingSession(sessions[0] || null)}
            />
          )}
        </div>

        {/* ── Main Area ── */}
        <div className="flex-1 flex overflow-hidden">
          {/* ── Left Panel — Tables + Menu ── */}
          <div className="w-72 shrink-0 flex flex-col border-r border-white/6 bg-[#1a1d2e]">
            <Tabs value={tab} onValueChange={v => setTab(v as any)} className="flex flex-col h-full">
              <div className="px-3 pt-3 pb-1">
                <TabsList className="w-full bg-white/5 border border-white/8">
                  <TabsTrigger value="tables" className="flex-1 text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                    <Table2 className="w-3 h-3 mr-1.5" /> Столи
                  </TabsTrigger>
                  <TabsTrigger value="menu" className="flex-1 text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                    <UtensilsCrossed className="w-3 h-3 mr-1.5" /> Меню
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="tables" className="flex-1 overflow-y-auto px-3 pb-3 mt-0">
                {tables.length === 0 ? (
                  <div className="text-center py-12 text-white/25 text-sm">Столи не налаштовані</div>
                ) : (
                  <TablesGrid tables={tables} selectedTableId={selectedTable?.id || null} onSelect={selectTable} />
                )}
              </TabsContent>

              <TabsContent value="menu" className="flex-1 flex flex-col overflow-hidden px-3 pb-3 mt-0">
                <MenuPanel categories={categories} items={menuItems} onAddItem={addItem} />
              </TabsContent>
            </Tabs>
          </div>

          {/* ── Right Panel — Order ── */}
          <div className="flex-1 flex flex-col bg-[#12141f]">
            {/* Order header */}
            <div className="px-4 py-3 border-b border-white/6 flex items-center gap-3">
              {selectedTable ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">Стіл #{selectedTable.table_number}</span>
                    <Badge variant="outline" className="text-[10px] border-white/10 text-white/40">{selectedTable.section}</Badge>
                  </div>
                  <button onClick={() => { setSelectedTable(null); setCurrentOrder(null); setOrderItems([]); setTab("tables"); }}
                    className="ml-auto text-white/25 hover:text-white/60 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <span className="text-sm text-white/30">Оберіть стіл або тип замовлення</span>
              )}
            </div>

            {!selectedTable && (
              <div className="px-4 pt-4 flex gap-2">
                {["dine_in", "takeaway", "room_service"].map(t => (
                  <button key={t} onClick={() => setOrderType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      orderType === t ? "bg-indigo-600 text-white" : "bg-white/5 text-white/40 hover:bg-white/8"
                    }`}>
                    {t === "dine_in" ? "В залі" : t === "takeaway" ? "Самовиніс" : "Room Service"}
                  </button>
                ))}
              </div>
            )}

            {/* Guest info + Customer lookup */}
            <div className="px-4 pt-3 pb-2 space-y-2">
              {/* Customer phone search */}
              <div className="relative">
                {selectedCustomer ? (
                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                    <UserCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-emerald-300 truncate">{selectedCustomer.name}</p>
                      <p className="text-[10px] text-emerald-400/60">{selectedCustomer.phone} · {selectedCustomer.visits_count || 0} візитів</p>
                    </div>
                    <button onClick={clearCustomer} className="text-emerald-400/50 hover:text-emerald-300">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 h-8">
                      <Phone className="w-3.5 h-3.5 text-white/25 shrink-0" />
                      <input
                        value={customerPhone}
                        onChange={e => searchCustomers(e.target.value)}
                        placeholder="Телефон або ім'я клієнта..."
                        className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none"
                      />
                      {customerLoading && <Loader2 className="w-3 h-3 animate-spin text-white/30" />}
                    </div>
                    {customerResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-[#1e2235] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                        {customerResults.map((c: any) => (
                          <button key={c.id} onClick={() => selectCustomer(c)}
                            className="w-full px-3 py-2 text-left hover:bg-white/5 flex items-center gap-2 transition-colors">
                            <UserCircle className="w-4 h-4 text-white/30 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-white/80">{c.name}</p>
                              <p className="text-[10px] text-white/40">{c.phone} · {c.visits_count || 0} візитів · {parseFloat(c.total_spent || 0).toLocaleString("uk-UA")} ₴</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex gap-2">
                <Input value={guestName} onChange={e => setGuestName(e.target.value)}
                  placeholder="Ім'я гостя (необов.)"
                  className="h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/25" />
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setGuestCount(Math.max(1, guestCount - 1))} className="w-7 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white/50 hover:bg-white/10">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-7 text-center text-sm text-white/70">{guestCount}</span>
                  <button onClick={() => setGuestCount(guestCount + 1)} className="w-7 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white/50 hover:bg-white/10">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
              {orderItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/20">
                  <ShoppingCart className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">Додайте страви з меню</p>
                </div>
              ) : orderItems.map((item, idx) => (
                <div key={`${item.item_id}-${idx}`} className="flex items-center gap-3 bg-white/4 rounded-xl px-3 py-2.5 border border-white/6">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/85 truncate">{item.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-white/30">{fmt(item.price)} / шт</p>
                      {item.is_alcohol && item.excise_per_unit && item.excise_per_unit > 0 && (
                        <span className="text-xs text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          🍺 акциз {fmt(item.excise_per_unit * item.quantity)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => changeQty(item.item_id, -1)} className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50">
                      <Minus className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => changeQty(item.item_id, -0.5)}
                      title="Зменшити на ½ порції"
                      className="w-5 h-5 rounded text-[9px] font-bold bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-400 flex items-center justify-center transition-colors">
                      ½
                    </button>
                    <span className="w-6 text-center text-sm font-medium text-white">
                      {Number(item.quantity) % 1 !== 0 ? Number(item.quantity).toFixed(1) : item.quantity}
                    </span>
                    <button onClick={() => changeQty(item.item_id, +1)} className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50">
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className="text-sm font-bold text-indigo-300 w-16 text-right shrink-0">{fmt(item.total_price)}</span>
                </div>
              ))}
            </div>

            {/* Footer — total + actions */}
            <div className="px-4 py-3 border-t border-white/6 space-y-3 bg-[#15172a]">
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/50">{orderItems.length} позицій</span>
                <div className="text-right">
                  <p className="text-xs text-white/30 mb-0.5">Сума:</p>
                  <p className="text-2xl font-bold text-white">{fmt(orderTotal)}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {currentOrder ? (
                  <>
                    <Button onClick={placeOrder} disabled={loading || !orderItems.length} variant="outline"
                      className="border-white/10 text-white/70 hover:bg-white/5 h-10 px-3">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </Button>
                    {orderItems.length >= 2 && orderItems.every(i => i.id) && (
                      <Button onClick={() => setShowSplit(true)} variant="outline"
                        className="border-white/10 text-indigo-400 hover:bg-indigo-500/10 h-10 px-3"
                        title="Розділити рахунок">
                        <Scissors className="w-4 h-4" />
                      </Button>
                    )}
                    <Button onClick={() => setShowPayment(true)} disabled={!currentOrder || orderItems.length === 0}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white h-10">
                      <CreditCard className="w-4 h-4 mr-1.5" /> Оплатити
                    </Button>
                  </>
                ) : (
                  <Button onClick={placeOrder} disabled={loading || !orderItems.length || !session}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-10">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ShoppingCart className="w-4 h-4 mr-1.5" /> Відкрити замовлення</>}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Dialogs ── */}
      {openForEntity !== undefined && (
        <OpenSessionDialog
          legalEntity={openForEntity}
          onOpened={s => {
            setSessions(prev => [...prev.filter(x => x.legal_entity_id !== s.legal_entity_id), s]);
            setOpenForEntity(undefined);
          }}
          onClose={() => setOpenForEntity(undefined)}
        />
      )}
      {closingSession && (
        <CloseSessionDialog
          session={closingSession}
          onClosed={() => { setSessions(prev => prev.filter(s => s.id !== closingSession.id)); setClosingSession(null); load(); }}
          onClose={() => setClosingSession(null)}
        />
      )}
      {showPayment && currentOrder && (
        <PaymentDialog
          order={{ ...currentOrder, total_amount: orderTotal, items: orderItems }}
          onPaid={afterPayment}
          onClose={() => setShowPayment(false)}
        />
      )}
      {showSplit && currentOrder && (
        <SplitDialog
          order={currentOrder}
          orderItems={orderItems}
          onSplit={(order2) => {
            setShowSplit(false);
            // Remove order2 items from local state and reload
            load();
            setOrderItems(prev => prev.filter(i => !order2.items?.some((o2i: any) => o2i.id === i.id)));
            toast({ title: `Рахунок 2 відкрито — #${order2.id}`, description: "Сплатіть кожен рахунок окремо" });
          }}
          onClose={() => setShowSplit(false)}
        />
      )}
    </AppLayout>
  );
}
