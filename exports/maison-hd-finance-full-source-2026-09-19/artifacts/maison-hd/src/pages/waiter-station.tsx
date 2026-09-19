/**
 * Waiter Station v2 — Станція офіціанта / бармена / касира
 * Оптимізовано для швидкого введення замовлень
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Minus, X, RefreshCw, Users, Clock, Receipt, CreditCard,
  Banknote, Smartphone, UtensilsCrossed, Loader2, Table2, FileText,
  StickyNote, ArrowLeft, ScanBarcode, Camera, Keyboard, Archive,
  AlertTriangle, CheckCircle2, ChevronRight, Flame, BookOpen,
  PlusCircle, Circle, Search, KeyRound,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

// ── API ─────────────────────────────────────────────────────────────────────
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = BASE.replace(/\/maison-hd$/, "") + "/api";
const tok  = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });

// ── Types ───────────────────────────────────────────────────────────────────
type Table = {
  id: number; number: string; capacity: number; location: string;
  status: string; currentOrderId?: number;
  orderGuestName?: string; orderTotal?: string; orderStatus?: string;
};
type Category  = { id: number; name: string; emoji?: string; sortOrder: number };
type MenuItem  = {
  id: number; name: string; price: string | number; categoryId: number;
  isAvailable: boolean; description?: string; isAlcohol?: boolean;
  isVegetarian?: boolean; isPopular?: boolean;
  categoryName?: string; categoryEmoji?: string;
  excisePerUnit?: number; requiresStamp?: boolean; imageUrl?: string;
};
type Session   = { id: number; cashboxName: string; cashierName?: string; openedAt: string; entityName?: string; entityShortName?: string; entityType?: string };
type LegalEntity = { id: number; name: string; short_name?: string; type: string; is_default: boolean; session_id?: number; session_cashbox_name?: string; session_opened_at?: string };
type PaidOrder = { id: number; tableNumber?: string; tableLocation?: string; guestName?: string; guestCount?: number; status: string; totalAmount: string; paidAmount?: string; createdAt: string; openedAt: string };
type Course    = 1 | 2 | 3;
type OrderLine = {
  localId: string;
  id?: number;
  itemId: number;
  name: string;
  price: number;
  qty: number;
  totalPrice: number;
  course: Course;
  doneness?: string;
  modifiers: string[];
  notes?: string;
  isAlcohol?: boolean;
  excisePerUnit?: number;
  exciseConfirmed: boolean;
  sent: boolean;
};

// ── Constants ────────────────────────────────────────────────────────────────
const DONENESS = ["Blue", "Rare", "Medium Rare", "Medium", "Medium Well", "Well Done"];
const MEAT_KW  = ["стейк", "тел", "ялов", "ягн", "свин", "баран", "бург", "котл", "шашл", "барбек", "гриль", "риб", "форел", "лосос", "тунец", "філе"];
const PORTIONS = [{ label: "1 порц.", value: 1 }, { label: "1.5", value: 1.5 }, { label: "1.8", value: 1.8 }, { label: "0.5", value: 0.5 }];
const MODIFIERS_PRESET = ["Без цибулі", "Без часнику", "Без глютену", "Екстра сир", "Гострий соус", "Лимон окремо", "Добре просмажити"];
const PAYMENT_METHODS = [
  { key: "cash",   label: "Готівка", icon: Banknote,   color: "bg-emerald-500/15 border-emerald-400/40 text-emerald-300" },
  { key: "card",   label: "Картка",  icon: CreditCard, color: "bg-blue-500/15 border-blue-400/40 text-blue-300"         },
  { key: "liqpay", label: "LiqPay",  icon: Smartphone, color: "bg-amber-500/15 border-amber-400/40 text-amber-300"      },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2); }
function fmt(n: number | string | null | undefined) { return `₴${Number(n || 0).toFixed(0)}`; }
function fmtDec(n: number | string | null | undefined) { return `₴${Number(n || 0).toFixed(2)}`; }
function elapsed(iso?: string) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m} хв` : `${Math.floor(m / 60)}г ${m % 60}хв`;
}
function isMeat(name: string) { return MEAT_KW.some(k => name.toLowerCase().includes(k)); }
function buildNotes(line: Omit<OrderLine, "sent" | "localId" | "id">): string {
  const parts: string[] = [];
  if (line.course > 1) parts.push(`[П${line.course}]`);
  if (line.doneness)   parts.push(`[${line.doneness}]`);
  if (line.modifiers.length) parts.push(line.modifiers.join(", "));
  if (line.notes)      parts.push(line.notes);
  return parts.join(" ").trim();
}
function getUserName(): string {
  try {
    const tok = localStorage.getItem("hms_token") || "";
    if (!tok) return "Офіціант";
    const p = JSON.parse(atob(tok.split(".")[1]));
    return p.name || p.email?.split("@")[0] || "Офіціант";
  } catch { return "Офіціант"; }
}

// ── ItemOptionsDialog ────────────────────────────────────────────────────────
function ItemOptionsDialog({ item, onAdd, onClose }: {
  item: MenuItem;
  onAdd: (line: Omit<OrderLine, "localId" | "id" | "sent" | "exciseConfirmed">) => void;
  onClose: () => void;
}) {
  const [course,    setCourse]    = useState<Course>(1);
  const [doneness,  setDoneness]  = useState<string | undefined>();
  const [portion,   setPortion]   = useState(1);
  const [modifiers, setModifiers] = useState<string[]>([]);
  const [notes,     setNotes]     = useState("");
  const [customMod, setCustomMod] = useState("");
  const showDoneness = isMeat(item.name);
  const basePrice = Number(item.price);

  const toggleMod = (m: string) => setModifiers(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  const addCustomMod = () => {
    const v = customMod.trim();
    if (v && !modifiers.includes(v)) { setModifiers(p => [...p, v]); }
    setCustomMod("");
  };

  const handleAdd = () => {
    onAdd({
      itemId: item.id, name: item.name, price: basePrice,
      qty: portion, totalPrice: +(basePrice * portion).toFixed(2),
      course, doneness, modifiers, notes: notes || undefined,
      isAlcohol: !!item.isAlcohol, excisePerUnit: item.excisePerUnit,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1d2e] border-white/10 text-white max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2 text-base">
            <UtensilsCrossed className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="truncate">{item.name}</span>
            {item.isAlcohol && <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded shrink-0">🍺 Алкоголь</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Course */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2 flex items-center gap-1">
              <BookOpen className="w-3 h-3" /> Подача
            </p>
            <div className="flex gap-2">
              {([1, 2, 3] as Course[]).map(c => (
                <button key={c} onClick={() => setCourse(c)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    course === c
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Doneness (meat only) */}
          {showDoneness && (
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Flame className="w-3 h-3 text-orange-400" /> Ступінь прожарки
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {DONENESS.map(d => (
                  <button key={d} onClick={() => setDoneness(prev => prev === d ? undefined : d)}
                    className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                      doneness === d
                        ? "bg-orange-500/30 border-orange-400/60 text-orange-200"
                        : "bg-white/5 border-white/10 text-white/45 hover:bg-white/8"
                    }`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Portion */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Кількість / порція</p>
            <div className="flex gap-2">
              {PORTIONS.map(p => (
                <button key={p.value} onClick={() => setPortion(p.value)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    portion === p.value
                      ? "bg-emerald-600/40 border-emerald-400/60 text-emerald-200"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Modifiers */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Модифікатори</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {MODIFIERS_PRESET.map(m => (
                <button key={m} onClick={() => toggleMod(m)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                    modifiers.includes(m)
                      ? "bg-indigo-500/30 border-indigo-400/50 text-indigo-200"
                      : "bg-white/5 border-white/10 text-white/40 hover:bg-white/8"
                  }`}>
                  {m}
                </button>
              ))}
            </div>
            {modifiers.filter(m => !MODIFIERS_PRESET.includes(m)).map(m => (
              <span key={m} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs mr-1 mb-1">
                {m}
                <button onClick={() => setModifiers(p => p.filter(x => x !== m))}><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}
            <div className="flex gap-1.5 mt-1.5">
              <input value={customMod} onChange={e => setCustomMod(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCustomMod()}
                placeholder="Свій модифікатор..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-indigo-500/50" />
              <button onClick={addCustomMod}
                className="w-8 h-8 bg-indigo-600/40 hover:bg-indigo-600/70 rounded-xl flex items-center justify-center transition-colors">
                <Plus className="w-3.5 h-3.5 text-indigo-300" />
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2 flex items-center gap-1">
              <StickyNote className="w-3 h-3 text-amber-400" /> Нотатка
            </p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Без цибулі, алергія, побажання..."
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-indigo-500/50 resize-none" />
          </div>

          {/* Summary */}
          <div className="flex items-center justify-between bg-white/4 rounded-xl px-4 py-2.5 border border-white/6">
            <span className="text-sm text-white/60">{portion} × {fmt(basePrice)}</span>
            <span className="text-lg font-bold text-indigo-300">{fmtDec(basePrice * portion)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/40">Скасувати</Button>
          <Button onClick={handleAdd} className="bg-indigo-600 hover:bg-indigo-500 text-white flex-1">
            <Plus className="w-4 h-4 mr-1.5" /> Додати до замовлення
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── NewTableDialog ────────────────────────────────────────────────────────────
function NewTableDialog({ onConfirm, onClose }: {
  onConfirm: (number: string, guests: number, notes: string, location: string) => void;
  onClose: () => void;
}) {
  const [number,   setNumber]   = useState("");
  const [guests,   setGuests]   = useState(2);
  const [notes,    setNotes]    = useState("");
  const [location, setLocation] = useState("Основний зал");
  const LOCATIONS = ["Основний зал", "VIP-зона", "Тераса", "Бар", "Зимовий сад"];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1d2e] border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Table2 className="w-4 h-4 text-indigo-400" /> Новий стіл
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Номер столу *</p>
            <input value={number} onChange={e => setNumber(e.target.value)} placeholder="1, 2, VIP-1, Б-3..."
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-2xl font-bold text-white placeholder:text-white/20 outline-none focus:border-indigo-500/50 text-center tracking-widest" />
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-3">Кількість гостей</p>
            <div className="flex items-center justify-center gap-6">
              <button onClick={() => setGuests(g => Math.max(1, g - 1))}
                className="w-12 h-12 rounded-xl bg-white/8 hover:bg-white/14 flex items-center justify-center transition-colors">
                <Minus className="w-5 h-5 text-white/60" />
              </button>
              <span className="text-5xl font-bold text-white w-12 text-center">{guests}</span>
              <button onClick={() => setGuests(g => Math.min(40, g + 1))}
                className="w-12 h-12 rounded-xl bg-indigo-600/60 hover:bg-indigo-600 flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Зона</p>
            <div className="flex flex-wrap gap-1.5">
              {LOCATIONS.map(l => (
                <button key={l} onClick={() => setLocation(l)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    location === l
                      ? "bg-indigo-600/40 border-indigo-400/60 text-indigo-200"
                      : "bg-white/5 border-white/10 text-white/40 hover:bg-white/8"
                  }`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Примітка (опційно)</p>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="День народження, алергії, побажання..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-indigo-500/50" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/40">Скасувати</Button>
          <Button disabled={!number.trim()} onClick={() => onConfirm(number.trim(), guests, notes, location)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white flex-1">
            <Plus className="w-4 h-4 mr-1.5" /> Відкрити стіл
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── StopListDialog ───────────────────────────────────────────────────────────
function StopListDialog({ items, onToggle, onClose }: {
  items: MenuItem[]; onToggle: (id: number, available: boolean) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));
  const available   = filtered.filter(i => i.isAvailable);
  const unavailable = filtered.filter(i => !i.isAvailable);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1d2e] border-white/10 text-white max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Стоп-лист
            <span className="text-xs text-white/30 font-normal ml-auto">{unavailable.length} зупинено</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 h-9 shrink-0">
          <Search className="w-3.5 h-3.5 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Пошук страви..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none" />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {unavailable.length > 0 && (
            <div>
              <p className="text-[10px] text-amber-400/70 uppercase tracking-wider px-1 py-2 font-semibold">Зупинено ({unavailable.length})</p>
              {unavailable.map(item => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/8 border border-red-500/15 mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/70 line-through truncate">{item.name}</p>
                    <p className="text-xs text-white/30">{item.categoryName}</p>
                  </div>
                  <button onClick={() => onToggle(item.id, true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-medium hover:bg-emerald-500/30 transition-colors">
                    Розблокувати
                  </button>
                </div>
              ))}
            </div>
          )}
          {available.length > 0 && (
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-wider px-1 py-2 font-semibold">Доступні ({available.length})</p>
              {available.map(item => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/3 hover:bg-white/6 mb-1 group transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/80 truncate">{item.name}</p>
                    <p className="text-xs text-white/30">{item.categoryName}</p>
                  </div>
                  <button onClick={() => onToggle(item.id, false)}
                    className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-400/25 text-red-300 text-xs font-medium hover:bg-red-500/25 transition-colors opacity-0 group-hover:opacity-100">
                    Зупинити
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="w-full bg-white/8 hover:bg-white/14 text-white/70">Закрити</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ArchiveDialog ─────────────────────────────────────────────────────────────
function ArchiveDialog({ onClose }: { onClose: () => void }) {
  const [date,   setDate]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [orders, setOrders] = useState<PaidOrder[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/fb/orders?status=billed");
      const d = await r.json();
      const all: PaidOrder[] = d.orders || [];
      setOrders(all.filter(o => (o.openedAt || o.createdAt || "").startsWith(date)));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [date]);

  const totalRevenue = orders.reduce((s, o) => s + Number(o.paidAmount || o.totalAmount || 0), 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1d2e] border-white/10 text-white max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Archive className="w-4 h-4 text-indigo-400" /> Архів чеків
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 shrink-0">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50" />
          <button onClick={load} className="w-9 h-9 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-white/40" /> : <RefreshCw className="w-4 h-4 text-white/40" />}
          </button>
        </div>
        {orders.length > 0 && (
          <div className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-2 shrink-0">
            <span className="text-xs text-indigo-300">{orders.length} чеків за {format(new Date(date + "T12:00"), "d MMMM", { locale: uk })}</span>
            <span className="text-sm font-bold text-indigo-200">{fmtDec(totalRevenue)}</span>
          </div>
        )}
        <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
          {loading && <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-white/30 mx-auto" /></div>}
          {!loading && orders.length === 0 && (
            <div className="py-12 text-center text-white/25 text-sm">Чеків за цей день не знайдено</div>
          )}
          {orders.map(o => (
            <div key={o.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/4 border border-white/6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white/80">Чек #{o.id}</span>
                  {o.tableNumber && <span className="text-xs bg-white/8 px-1.5 py-0.5 rounded text-white/40">Стіл {o.tableNumber}</span>}
                </div>
                {o.guestName && <p className="text-xs text-white/35 truncate">{o.guestName}</p>}
                <p className="text-[10px] text-white/25">
                  {format(new Date(o.openedAt || o.createdAt), "HH:mm", { locale: uk })}
                  {o.guestCount ? ` · ${o.guestCount} гостей` : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-emerald-300">{fmtDec(o.paidAmount || o.totalAmount)}</p>
                <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-medium">Оплачено</span>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="w-full bg-white/8 hover:bg-white/14 text-white/70">Закрити</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── PrecheckDialog ───────────────────────────────────────────────────────────
// Формат передчеку відповідно до практики ресторанного документообігу в Україні.
// Передчек НЕ є фіскальним документом — це інформаційний документ для гостя.
// Фіскальний чек видається РРО/ПРРО при фактичному розрахунку.
type OrgInfo = { name?: string; address?: string; phone?: string; email?: string };

function fmtUah(n: number): string {
  return n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PrecheckDialog({ table, order, lines, waiterName, onClose, onPay }: {
  table: Table;
  order: { id: number; openedAt?: string; guestCount: number } | null;
  lines: OrderLine[];
  waiterName: string;
  onClose: () => void;
  onPay: () => void;
}) {
  const [org, setOrg] = useState<OrgInfo>({});

  useEffect(() => {
    apiFetch("/organizations/me")
      .then(r => r.json())
      .then(d => setOrg({ name: d.name, address: d.address, phone: d.phone, email: d.email }))
      .catch(() => {});
  }, []);

  const now   = new Date();
  const dateStr = format(now, "dd.MM.yyyy");
  const timeStr = format(now, "HH:mm");
  const total   = lines.reduce((s, l) => s + l.totalPrice, 0);
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1d2e] border-white/10 text-white max-w-sm p-0 overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white">Передчек — Стіл #{table.number}</span>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Receipt body — cream/paper look */}
        <div className="bg-[#fafaf7] text-[#1a1a1a] mx-4 my-3 rounded-lg overflow-hidden shadow-inner">
          <div
            className="px-5 py-4 font-mono text-[11px] leading-relaxed max-h-[65vh] overflow-y-auto"
            style={{ fontFamily: "'Courier New', 'Courier', monospace" }}
          >
            {/* ── Шапка закладу ── */}
            <div className="text-center mb-3">
              <p className="font-bold text-[13px] uppercase tracking-wider leading-tight">
                {org.name || "Заклад харчування"}
              </p>
              {org.address && <p className="text-[10px] text-[#555] mt-0.5">{org.address}</p>}
              {org.phone   && <p className="text-[10px] text-[#555]">Тел.: {org.phone}</p>}
            </div>

            {/* ── Роздільник ── */}
            <p className="border-t border-dashed border-[#aaa] my-2" />

            {/* ── Заголовок документа ── */}
            <div className="text-center mb-2">
              <p className="font-bold text-[13px] tracking-[0.2em] uppercase">П Е Р Е Д Ч Е К</p>
              <p className="text-[9px] text-[#888] mt-0.5 uppercase tracking-wide">
                Не є фіскальним документом
              </p>
            </div>

            {/* ── Роздільник ── */}
            <p className="border-t border-dashed border-[#aaa] my-2" />

            {/* ── Реквізити замовлення ── */}
            <table className="w-full text-[10px] mb-1" style={{ borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td className="text-[#666] pr-2 whitespace-nowrap">Стіл:</td>
                  <td className="font-semibold">#{table.number}</td>
                  <td className="text-[#666] pl-3 pr-2 whitespace-nowrap">Зона:</td>
                  <td className="text-right">{table.location}</td>
                </tr>
                <tr>
                  <td className="text-[#666] pr-2 whitespace-nowrap">Дата:</td>
                  <td className="font-semibold">{dateStr}</td>
                  <td className="text-[#666] pl-3 pr-2 whitespace-nowrap">Час:</td>
                  <td className="text-right font-semibold">{timeStr}</td>
                </tr>
                <tr>
                  <td className="text-[#666] pr-2 whitespace-nowrap">Гостей:</td>
                  <td>{order?.guestCount ?? "—"}</td>
                  <td className="text-[#666] pl-3 pr-2 whitespace-nowrap">Офіціант:</td>
                  <td className="text-right truncate max-w-[80px]">{waiterName}</td>
                </tr>
                {order?.id && (
                  <tr>
                    <td className="text-[#666] pr-2 whitespace-nowrap">Замовлення:</td>
                    <td colSpan={3} className="font-semibold">#{order.id}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* ── Роздільник ── */}
            <p className="border-t border-[#aaa] my-2" />

            {/* ── Шапка таблиці позицій ── */}
            <div className="flex text-[9px] text-[#888] uppercase tracking-wide font-semibold mb-1">
              <span className="w-5 shrink-0">#</span>
              <span className="flex-1">Найменування</span>
              <span className="w-8 text-center shrink-0">К-сть</span>
              <span className="w-14 text-right shrink-0">Ціна</span>
              <span className="w-16 text-right shrink-0">Сума</span>
            </div>
            <p className="border-t border-dashed border-[#bbb] mb-1" />

            {/* ── Позиції (без модифікаторів та прожарки) ── */}
            {lines.map((l, i) => (
              <div key={l.localId} className="flex items-start text-[11px] mb-1 gap-0.5">
                <span className="w-5 text-[#888] shrink-0">{i + 1}.</span>
                <span className="flex-1 leading-snug break-words pr-1">{l.name}</span>
                <span className="w-8 text-center shrink-0 text-[#555]">
                  {l.qty % 1 !== 0 ? l.qty.toFixed(1) : l.qty}
                </span>
                <span className="w-14 text-right shrink-0 text-[#555]">{fmtUah(l.price)}</span>
                <span className="w-16 text-right shrink-0 font-semibold">{fmtUah(l.totalPrice)}</span>
              </div>
            ))}

            {/* ── Роздільник ── */}
            <p className="border-t border-[#aaa] mt-2 mb-2" />

            {/* ── Підсумок ── */}
            <div className="flex justify-between items-baseline text-[11px] mb-0.5">
              <span className="text-[#666]">Кількість позицій:</span>
              <span>{lines.length} ({totalQty % 1 !== 0 ? totalQty.toFixed(1) : totalQty} одиниць)</span>
            </div>
            <div className="flex justify-between items-baseline mt-1">
              <span className="font-bold text-[13px] uppercase tracking-wide">РАЗОМ:</span>
              <span className="font-bold text-[15px]">{fmtUah(total)} грн</span>
            </div>

            {/* ── Роздільник ── */}
            <p className="border-t border-dashed border-[#aaa] my-3" />

            {/* ── Нижній колонтитул ── */}
            <div className="text-center text-[9px] text-[#888] leading-relaxed">
              <p>Дякуємо за відвідування!</p>
              <p>Фіскальний чек видається при оплаті.</p>
              <p className="mt-1 text-[8px] text-[#bbb]">
                Документ сформовано {dateStr} о {timeStr}
              </p>
            </div>
          </div>

          {/* Tear edge effect */}
          <div className="h-2 bg-[#fafaf7]"
            style={{ backgroundImage: "repeating-linear-gradient(90deg, #fafaf7 0px, #fafaf7 8px, #e8e8e2 8px, #e8e8e2 10px)" }} />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 px-4 pb-4">
          <Button variant="ghost" onClick={onClose} className="text-white/40 hover:text-white/60">
            Закрити
          </Button>
          <Button onClick={onPay} className="bg-emerald-600 hover:bg-emerald-500 text-white flex-1">
            <CreditCard className="w-4 h-4 mr-2" /> До оплати
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── PaymentDialog ─────────────────────────────────────────────────────────────
function PaymentDialog({ orderId, total, onPaid, onClose }: {
  orderId: number; total: number; onPaid: () => void; onClose: () => void;
}) {
  const { toast } = useToast();
  const [method,  setMethod]  = useState("cash");
  const [given,   setGiven]   = useState("");
  const [tipPct,  setTipPct]  = useState(0);
  const [loading, setLoading] = useState(false);
  const tipAmt   = Math.round(total * tipPct) / 100;
  const finalAmt = total + tipAmt;
  const change   = method === "cash" && Number(given) > finalAmt ? Number(given) - finalAmt : 0;
  const canPay   = method !== "cash" || !given || Number(given) >= finalAmt;

  const pay = async () => {
    setLoading(true);
    try {
      const body: any = { paymentMethod: method, paidAmount: Number(given) || finalAmt };
      if (tipPct) { body.tipPct = tipPct; body.tip = tipAmt; }
      const r = await apiFetch(`/fb/orders/${orderId}/pay`, { method: "POST", body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Помилка");
      toast({ title: "✅ Оплата прийнята", description: fmtDec(finalAmt) });
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
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(pm => {
              const Icon = pm.icon;
              return (
                <button key={pm.key} onClick={() => setMethod(pm.key)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all ${
                    method === pm.key ? pm.color : "bg-white/5 border-white/10 text-white/40 hover:bg-white/8"
                  }`}>
                  <Icon className="w-5 h-5" /> {pm.label}
                </button>
              );
            })}
          </div>
          {method === "cash" && (
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Отримано від гостя</p>
              <input type="number" value={given} onChange={e => setGiven(e.target.value)}
                placeholder={fmtDec(finalAmt)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xl text-white font-mono outline-none focus:border-emerald-500/50" />
              {change > 0 && (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 mt-2">
                  <span className="text-sm text-emerald-300/70">Решта</span>
                  <span className="text-xl font-bold text-emerald-300">{fmtDec(change)}</span>
                </div>
              )}
            </div>
          )}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Чайові</p>
            <div className="flex gap-1.5">
              {[0, 5, 7, 10, 15].map(pct => (
                <button key={pct} onClick={() => setTipPct(pct)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    tipPct === pct ? "bg-indigo-600 text-white" : "bg-white/6 text-white/40 hover:bg-white/10"
                  }`}>{pct === 0 ? "Немає" : `${pct}%`}</button>
              ))}
            </div>
            {tipPct > 0 && <p className="text-xs text-indigo-300/60 mt-1 text-right">+{fmtDec(tipAmt)} чайових</p>}
          </div>
          <div className="bg-white/4 rounded-xl px-4 py-3 flex items-center justify-between border border-white/6">
            <span className="text-sm text-white/50">До оплати</span>
            <span className="text-2xl font-bold text-white">{fmtDec(finalAmt)}</span>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="text-white/40" disabled={loading}>Скасувати</Button>
          <Button onClick={pay} disabled={!canPay || loading} className="bg-emerald-600 hover:bg-emerald-500 flex-1">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Провести оплату
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ExciseDialog ──────────────────────────────────────────────────────────────
function ExciseDialog({ lines, onConfirm, onClose }: {
  lines: OrderLine[];
  onConfirm: (confirmed: string[]) => void;
  onClose: () => void;
}) {
  const alcoholLines = lines.filter(l => l.isAlcohol);
  const [mode,       setMode]       = useState<"camera" | "manual">("manual");
  const [manualCode, setManualCode] = useState("");
  const [scanned,    setScanned]    = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const videoRef   = useRef<HTMLVideoElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number>(0);

  const markAll = () => {
    const updated: Record<string, boolean> = {};
    alcoholLines.forEach(l => { updated[l.localId] = true; });
    setScanned(updated);
  };

  const markOne = (localId: string) => setScanned(prev => ({ ...prev, [localId]: !prev[localId] }));

  const handleManual = () => {
    if (!manualCode.trim()) return;
    toast({ title: `Акциз підтверджено: ${manualCode}` });
    // mark first unconfirmed
    const unconfirmed = alcoholLines.find(l => !scanned[l.localId]);
    if (unconfirmed) setScanned(prev => ({ ...prev, [unconfirmed.localId]: true }));
    setManualCode("");
  };

  // Camera scanning
  useEffect(() => {
    if (mode !== "camera") return;
    const hasBD = typeof window !== "undefined" && "BarcodeDetector" in window;
    if (!hasBD) return;
    let stopped = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const detector = new (window as any).BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128"] });
        const detect = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length) {
              const code = codes[0].rawValue;
              toast({ title: `Акциз: ${code}` });
              const unconfirmed = alcoholLines.find(l => !scanned[l.localId]);
              if (unconfirmed) setScanned(prev => ({ ...prev, [unconfirmed.localId]: true }));
            }
          } catch { /* noop */ }
          rafRef.current = requestAnimationFrame(detect);
        };
        rafRef.current = requestAnimationFrame(detect);
      } catch { /* noop */ }
    })();
    return () => { stopped = true; cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [mode]);

  const allConfirmed = alcoholLines.every(l => scanned[l.localId]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1d2e] border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ScanBarcode className="w-4 h-4 text-amber-400" /> Акциз / УКЗЕД
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-white/40 text-center mb-2">Підтвердіть відкорковування для кожної позиції алкоголю</p>

        {/* Alcohol lines */}
        <div className="space-y-1.5 mb-3">
          {alcoholLines.map(l => (
            <div key={l.localId} onClick={() => markOne(l.localId)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                scanned[l.localId]
                  ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-200"
                  : "bg-amber-500/10 border-amber-400/20 text-white/70 hover:bg-amber-500/15"
              }`}>
              {scanned[l.localId]
                ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                : <Circle className="w-5 h-5 text-amber-400/50 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{l.name}</p>
                <p className="text-[10px] text-white/30">{l.qty} × {l.isAlcohol ? "алкоголь" : ""}</p>
              </div>
            </div>
          ))}
        </div>

        <button onClick={markAll} className="w-full py-2 text-xs text-indigo-300 hover:text-indigo-200 text-center transition-colors">
          Підтвердити всі ({alcoholLines.length})
        </button>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-2">
          {[{ key: "manual", icon: Keyboard, label: "Ввести код" }, { key: "camera", icon: Camera, label: "Камера" }].map(m => (
            <button key={m.key} onClick={() => setMode(m.key as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === m.key ? "bg-indigo-600 text-white" : "bg-white/6 text-white/40 hover:bg-white/10"
              }`}>
              <m.icon className="w-3.5 h-3.5" /> {m.label}
            </button>
          ))}
        </div>

        {mode === "manual" ? (
          <div className="flex gap-2">
            <input value={manualCode} onChange={e => setManualCode(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleManual()}
              placeholder="Введіть код акцизу..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50" />
            <button onClick={handleManual} className="w-10 h-10 bg-indigo-600/40 hover:bg-indigo-600/70 rounded-xl flex items-center justify-center transition-colors">
              <ChevronRight className="w-4 h-4 text-indigo-300" />
            </button>
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-20 border-2 border-amber-400/60 rounded-lg" />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 mt-2">
          <Button variant="ghost" onClick={onClose} className="text-white/40">Скасувати</Button>
          <Button disabled={!allConfirmed} onClick={() => onConfirm(alcoholLines.map(l => l.localId))}
            className="bg-emerald-600 hover:bg-emerald-500 flex-1 disabled:opacity-40">
            <CheckCircle2 className="w-4 h-4 mr-2" /> Підтверджено · Відправити
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── OrderScreen ────────────────────────────────────────────────────────────────
function OrderScreen({ table, order, lines, categories, menuItems, onBack, onAddLine, onRemoveLine, onChangeQty, onSend, onPay, sending }: {
  table: Table; order: { id: number; openedAt?: string; guestCount: number } | null;
  lines: OrderLine[]; categories: Category[]; menuItems: MenuItem[];
  onBack: () => void;
  onAddLine: (line: Omit<OrderLine, "localId" | "id" | "sent" | "exciseConfirmed">) => void;
  onRemoveLine: (localId: string) => void;
  onChangeQty: (localId: string, delta: number) => void;
  onSend: () => void; onPay: () => void; sending: boolean;
}) {
  const { toast } = useToast();
  const [selectedCat,    setSelectedCat]    = useState<number | "all">("all");
  const [menuSearch,     setMenuSearch]     = useState("");
  const [optionsFor,     setOptionsFor]     = useState<MenuItem | null>(null);
  const [showPrecheck,   setShowPrecheck]   = useState(false);
  const [showPayment,    setShowPayment]    = useState(false);
  const [showExcise,     setShowExcise]     = useState(false);
  const [exciseConfirmedIds, setExciseConfirmedIds] = useState<string[]>([]);

  const sentLines   = lines.filter(l => l.sent);
  const unsentLines = lines.filter(l => !l.sent);
  const total = lines.reduce((s, l) => s + l.totalPrice, 0);
  const alcoholUnsent = unsentLines.filter(l => l.isAlcohol && !exciseConfirmedIds.includes(l.localId));
  const hasAlcohol    = unsentLines.some(l => l.isAlcohol);

  const filteredItems = menuItems.filter(i =>
    i.isAvailable &&
    (selectedCat === "all" || i.categoryId === selectedCat) &&
    (!menuSearch || i.name.toLowerCase().includes(menuSearch.toLowerCase()))
  );

  const handleSendClick = () => {
    if (unsentLines.length === 0) { toast({ title: "Немає нових позицій для відправки", variant: "destructive" }); return; }
    if (alcoholUnsent.length > 0) { setShowExcise(true); return; }
    onSend();
  };

  const handleExciseConfirm = (confirmedIds: string[]) => {
    setExciseConfirmedIds(prev => [...new Set([...prev, ...confirmedIds])]);
    setShowExcise(false);
    onSend();
  };

  return (
    <div className="flex flex-col h-full bg-[#12141f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/6 bg-[#1a1d2e] shrink-0">
        <button onClick={onBack} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">Стіл #{table.number}</span>
            <span className="text-xs text-white/30 bg-white/6 px-2 py-0.5 rounded-lg">{table.location}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-white/35">
            {order?.guestCount && <span><Users className="w-2.5 h-2.5 inline mr-0.5" />{order.guestCount} гостей</span>}
            {order?.openedAt && <span><Clock className="w-2.5 h-2.5 inline mr-0.5" />{elapsed(order.openedAt)}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-white/30">Сума</p>
          <p className="text-base font-bold text-white">{fmt(total)}</p>
        </div>
      </div>

      {/* Order items (top ~40%) */}
      <div className="flex-[2] overflow-y-auto border-b border-white/6 min-h-0">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/20 gap-2">
            <UtensilsCrossed className="w-8 h-8" />
            <p className="text-sm">Оберіть страви з меню нижче</p>
          </div>
        ) : (
          <div>
            {/* Unsent items */}
            {unsentLines.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-indigo-500/5">
                  <p className="text-[10px] text-indigo-400/70 uppercase tracking-wide font-semibold">Нові позиції ({unsentLines.length})</p>
                </div>
                {unsentLines.map(line => (
                  <div key={line.localId} className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 bg-indigo-500/4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-white/90 truncate">{line.name}</p>
                        {line.course > 1 && <span className="text-[9px] bg-indigo-500/25 text-indigo-300 px-1.5 py-0.5 rounded font-bold shrink-0">П{line.course}</span>}
                        {line.doneness && <span className="text-[9px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded shrink-0">{line.doneness}</span>}
                        {line.isAlcohol && <span className="text-[9px] text-amber-400 shrink-0">🍺</span>}
                      </div>
                      {line.modifiers.length > 0 && <p className="text-[10px] text-indigo-400/60 truncate">{line.modifiers.join(" · ")}</p>}
                      {line.notes && <p className="text-[10px] text-amber-400/60 truncate">{line.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => onChangeQty(line.localId, -1)}
                        className="w-6 h-6 rounded-full bg-white/6 hover:bg-white/12 flex items-center justify-center">
                        <Minus className="w-2.5 h-2.5 text-white/50" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-white">
                        {line.qty % 1 !== 0 ? line.qty.toFixed(1) : line.qty}
                      </span>
                      <button onClick={() => onChangeQty(line.localId, 1)}
                        className="w-6 h-6 rounded-full bg-white/6 hover:bg-white/12 flex items-center justify-center">
                        <Plus className="w-2.5 h-2.5 text-white/50" />
                      </button>
                    </div>
                    <span className="text-sm font-semibold text-indigo-300 w-14 text-right shrink-0">{fmt(line.totalPrice)}</span>
                    <button onClick={() => onRemoveLine(line.localId)}
                      className="w-5 h-5 rounded-full bg-red-500/15 hover:bg-red-500/30 flex items-center justify-center shrink-0">
                      <X className="w-2.5 h-2.5 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Sent items */}
            {sentLines.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-white/3">
                  <p className="text-[10px] text-white/30 uppercase tracking-wide font-semibold">На кухні / барі ({sentLines.length})</p>
                </div>
                {sentLines.map(line => (
                  <div key={line.localId} className="flex items-center gap-2 px-3 py-2 border-b border-white/4 opacity-60">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs text-white/60 truncate">{line.name}</p>
                        {line.course > 1 && <span className="text-[8px] bg-white/10 text-white/40 px-1 py-0.5 rounded">П{line.course}</span>}
                        {line.doneness && <span className="text-[8px] text-orange-400/50">{line.doneness}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-white/40 shrink-0">{line.qty % 1 !== 0 ? line.qty.toFixed(1) : line.qty} × {fmt(line.price)}</span>
                    <span className="text-xs font-medium text-white/50 w-12 text-right shrink-0">{fmt(line.totalPrice)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Menu (bottom ~60%) */}
      <div className="flex-[3] flex flex-col overflow-hidden min-h-0">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 pt-2 pb-1 shrink-0">
          <div className="flex-1 flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2.5 h-8">
            <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <input value={menuSearch} onChange={e => setMenuSearch(e.target.value)}
              placeholder="Пошук страви..."
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none" />
          </div>
        </div>
        {/* Category pills */}
        <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 scrollbar-none shrink-0">
          <button onClick={() => setSelectedCat("all")}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              selectedCat === "all" ? "bg-indigo-600 text-white" : "bg-white/6 text-white/50 hover:bg-white/10"
            }`}>Всі</button>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                selectedCat === cat.id ? "bg-indigo-600 text-white" : "bg-white/6 text-white/50 hover:bg-white/10"
              }`}>
              {cat.emoji && <span className="mr-1">{cat.emoji}</span>}{cat.name}
            </button>
          ))}
        </div>
        {/* Items grid */}
        <div className="flex-1 overflow-y-auto px-3 pb-2 min-h-0">
          <div className="grid grid-cols-2 gap-2">
            {filteredItems.map(item => (
              <button key={item.id} onClick={() => setOptionsFor(item)}
                className="flex flex-col gap-1 p-3 rounded-xl bg-white/5 hover:bg-white/9 border border-white/8 hover:border-indigo-500/30 transition-all text-left active:scale-95">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-sm font-medium text-white/90 leading-tight flex-1">{item.name}</p>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {item.isAlcohol  && <span className="text-[8px] text-amber-400">🍺</span>}
                    {item.isVegetarian && <span className="text-[8px] text-emerald-400">🌱</span>}
                    {item.isPopular  && <span className="text-[8px] text-rose-400">🔥</span>}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-indigo-300">{fmt(item.price)}</span>
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center">
                    <Plus className="w-3 h-3 text-indigo-300" />
                  </div>
                </div>
              </button>
            ))}
            {filteredItems.length === 0 && (
              <div className="col-span-2 py-8 text-center text-white/25 text-sm">Нічого не знайдено</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-3 py-3 border-t border-white/6 bg-[#1a1d2e] shrink-0 space-y-2">
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>{lines.reduce((s, l) => s + l.qty, 0)} позицій</span>
          <span className="font-semibold text-white/70">{fmtDec(total)}</span>
        </div>
        <div className="flex gap-2">
          {hasAlcohol && (
            <button onClick={() => setShowExcise(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/25 text-amber-300 text-xs font-medium hover:bg-amber-500/25 transition-colors shrink-0">
              <ScanBarcode className="w-4 h-4" /> Акциз
            </button>
          )}
          <button onClick={() => setShowPrecheck(true)} disabled={lines.length === 0}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/8 border border-white/10 text-white/60 text-xs font-medium hover:bg-white/12 transition-colors disabled:opacity-30 shrink-0">
            <FileText className="w-4 h-4" /> Передчек
          </button>
          {unsentLines.length > 0 && (
            <button onClick={handleSendClick} disabled={sending}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              Відправити {unsentLines.length > 0 ? `(${unsentLines.length})` : ""}
            </button>
          )}
          {sentLines.length > 0 && unsentLines.length === 0 && (
            <button onClick={onPay}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors">
              <CreditCard className="w-4 h-4" /> Оплатити
            </button>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {optionsFor && <ItemOptionsDialog item={optionsFor} onAdd={onAddLine} onClose={() => setOptionsFor(null)} />}
      {showPrecheck && <PrecheckDialog table={table} order={order} lines={lines} waiterName={getUserName()} onClose={() => setShowPrecheck(false)} onPay={() => { setShowPrecheck(false); setShowPayment(true); }} />}
      {showPayment && order && <PaymentDialog orderId={order.id} total={total} onPaid={() => { setShowPayment(false); onPay(); }} onClose={() => setShowPayment(false)} />}
      {showExcise && <ExciseDialog lines={unsentLines} onConfirm={handleExciseConfirm} onClose={() => setShowExcise(false)} />}
    </div>
  );
}

// ── HomeScreen ────────────────────────────────────────────────────────────────
function HomeScreen({ tables, session, sessions, loading, onSelectTable, onCreateTable, onRefresh, menuItems, onToggleItem, onOpenShift }: {
  tables: Table[]; session: Session | null; sessions: Session[]; loading: boolean;
  onSelectTable: (t: Table) => void;
  onCreateTable: () => void;
  onRefresh: () => void;
  menuItems: MenuItem[];
  onToggleItem: (id: number, available: boolean) => void;
  onOpenShift: () => void;
}) {
  const [showArchive,   setShowArchive]   = useState(false);
  const [showStopList,  setShowStopList]  = useState(false);
  const userName = getUserName();
  const occupied = tables.filter(t => t.status === "occupied");
  const free     = tables.filter(t => t.status === "free");

  const TABLE_S: Record<string, { bg: string; border: string; dot: string; text: string; label: string }> = {
    free:     { bg: "bg-emerald-500/8",  border: "border-emerald-500/20", dot: "bg-emerald-400", text: "text-emerald-300", label: "Вільний" },
    occupied: { bg: "bg-rose-500/12",    border: "border-rose-500/25",    dot: "bg-rose-400",    text: "text-rose-300",    label: "Зайнятий" },
    reserved: { bg: "bg-amber-500/10",   border: "border-amber-500/22",   dot: "bg-amber-400",   text: "text-amber-300",   label: "Резерв" },
  };

  return (
    <div className="flex flex-col h-full bg-[#12141f]">
      {/* Header bar */}
      <div className="px-4 py-3 border-b border-white/6 bg-[#1a1d2e] shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-white capitalize">
              {format(new Date(), "EEEE, d MMMM", { locale: uk })}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-white/40">Офіціант:</span>
              <span className="text-xs font-semibold text-indigo-300">{userName}</span>
              {sessions.length > 0 ? (
                sessions.map(s => (
                  <span key={s.id} className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {s.entityShortName || s.cashboxName} · {format(new Date(s.openedAt), "HH:mm")}
                  </span>
                ))
              ) : (
                <button onClick={onOpenShift}
                  className="flex items-center gap-1 text-[10px] text-amber-400/80 hover:text-amber-300 transition-colors">
                  <KeyRound className="w-3 h-3" />
                  Відкрити зміну
                </button>
              )}
            </div>
          </div>
          <button onClick={onRefresh} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center">
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-white/40" /> : <RefreshCw className="w-4 h-4 text-white/30" />}
          </button>
        </div>
      </div>

      {/* No-session banner */}
      {sessions.length === 0 && (
        <button onClick={onOpenShift}
          className="mx-4 mt-3 shrink-0 flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/15 transition-colors text-left">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-300">Зміну не відкрито</p>
            <p className="text-[10px] text-amber-400/60">Натисніть, щоб відкрити касову зміну</p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-400/50 shrink-0" />
        </button>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Open tables */}
        {occupied.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Відкриті столи
                <span className="ml-2 bg-rose-500/25 text-rose-300 text-[9px] px-1.5 py-0.5 rounded font-bold">{occupied.length}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {occupied.map(t => {
                const s = TABLE_S[t.status] || TABLE_S.free;
                return (
                  <button key={t.id} onClick={() => onSelectTable(t)}
                    className={`relative p-4 rounded-2xl border text-left transition-all active:scale-95 hover:brightness-110 ${s.bg} ${s.border}`}>
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xl font-bold text-white">#{t.number}</span>
                      <span className={`w-2 h-2 rounded-full ${s.dot} animate-pulse`} />
                    </div>
                    <p className="text-xs text-white/40 mb-0.5">{t.location}</p>
                    {t.orderGuestName && <p className="text-xs text-white/60 truncate">{t.orderGuestName}</p>}
                    {t.orderTotal && <p className="text-base font-bold text-white/85 mt-1">{fmt(t.orderTotal)}</p>}
                    <span className={`text-[9px] font-semibold uppercase tracking-wide ${s.text}`}>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Free tables (smaller) */}
        {free.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/25 mb-2">Вільні столи</p>
            <div className="flex flex-wrap gap-2">
              {free.map(t => (
                <button key={t.id} onClick={() => onSelectTable(t)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/6 border border-emerald-500/15 hover:bg-emerald-500/12 transition-colors active:scale-95">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-200">#{t.number}</span>
                  <span className="text-xs text-white/30">{t.capacity} міс.</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tables.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-white/20 gap-3">
            <Table2 className="w-12 h-12" />
            <p className="text-sm">Столів не знайдено. Створіть перший.</p>
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="px-4 py-3 border-t border-white/6 bg-[#1a1d2e] shrink-0">
        <div className="flex gap-2">
          <button onClick={() => setShowArchive(true)}
            className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl bg-white/6 border border-white/10 hover:bg-white/10 transition-colors">
            <Archive className="w-5 h-5 text-indigo-400" />
            <span className="text-[10px] text-white/50 font-medium">Архів чеків</span>
          </button>
          <button onClick={() => setShowStopList(true)}
            className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl bg-white/6 border border-white/10 hover:bg-white/10 transition-colors">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span className="text-[10px] text-white/50 font-medium">Стоп-лист</span>
          </button>
          <button onClick={onCreateTable}
            className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-colors">
            <PlusCircle className="w-5 h-5 text-white" />
            <span className="text-sm font-semibold text-white">Новий стіл</span>
          </button>
        </div>
      </div>

      {showArchive  && <ArchiveDialog onClose={() => setShowArchive(false)} />}
      {showStopList && <StopListDialog items={menuItems} onToggle={onToggleItem} onClose={() => setShowStopList(false)} />}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WaiterStationPage() {
  const { toast } = useToast();

  const [tables,     setTables]     = useState<Table[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems,  setMenuItems]  = useState<MenuItem[]>([]);
  const [session,    setSession]    = useState<Session | null>(null);
  const [sessions,   setSessions]   = useState<Session[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showShiftOpen, setShowShiftOpen] = useState(false);

  const [screen,        setScreen]        = useState<"home" | "order">("home");
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [currentOrder,  setCurrentOrder]  = useState<{ id: number; openedAt?: string; guestCount: number } | null>(null);
  const [orderLines,    setOrderLines]    = useState<OrderLine[]>([]);
  const [sending,       setSending]       = useState(false);

  const [showNewTable,       setShowNewTable]       = useState(false);
  const [showOpenTableFor,   setShowOpenTableFor]   = useState<Table | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, c, m, s] = await Promise.all([
        apiFetch("/fb/tables").then(r => r.json()),
        apiFetch("/fb/categories").then(r => r.json()),
        apiFetch("/fb/items").then(r => r.json()),
        apiFetch("/fb/cashbox/session").then(r => r.json()).catch(() => ({ session: null })),
      ]);
      setTables(t.tables || []);
      setCategories((c.categories || []).sort((a: Category, b: Category) => a.sortOrder - b.sortOrder));
      setMenuItems(m.items || []);
      const allSessions: Session[] = (s.sessions || (s.session ? [s.session] : [])).map((x: any) => ({
        id: x.id, cashboxName: x.cashbox_name ?? x.cashboxName ?? "Каса",
        cashierName: x.cashier_name ?? x.cashierName,
        openedAt: x.opened_at ?? x.openedAt,
        entityName: x.entity_name, entityShortName: x.entity_short_name, entityType: x.entity_type,
      }));
      setSessions(allSessions);
      setSession(allSessions[0] || null);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const iv = setInterval(() => {
      apiFetch("/fb/tables").then(r => r.json()).then(d => setTables(d.tables || [])).catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  // ── Select existing table ─────────────────────────────────────────────────
  const handleSelectTable = async (table: Table) => {
    if (table.status === "free") {
      setShowOpenTableFor(table);
      return;
    }
    setSelectedTable(table);
    if (table.currentOrderId) {
      try {
        const r = await apiFetch(`/fb/orders/${table.currentOrderId}`);
        const d = await r.json();
        if (d.order) {
          setCurrentOrder({ id: d.order.id, openedAt: d.order.openedAt, guestCount: d.order.guestCount || 1 });
          setOrderLines((d.order.items || []).map((i: any) => ({
            localId: uid(), id: i.id, itemId: i.itemId || i.item_id,
            name: i.name, price: Number(i.price),
            qty: Number(i.quantity), totalPrice: Number(i.totalPrice || i.total_price),
            course: 1 as Course, modifiers: [], notes: i.notes,
            isAlcohol: !!i.isAlcohol, excisePerUnit: Number(i.excisePerUnit || 0),
            exciseConfirmed: false, sent: true,
          })));
        }
      } catch { toast({ title: "Помилка завантаження замовлення", variant: "destructive" }); }
    } else {
      setCurrentOrder(null);
      setOrderLines([]);
    }
    setScreen("order");
  };

  // ── Open free existing table ───────────────────────────────────────────────
  const handleOpenExistingTable = async (table: Table, guestCount: number, guestName: string) => {
    setShowOpenTableFor(null);
    try {
      const r = await apiFetch("/fb/orders", {
        method: "POST",
        body: JSON.stringify({ tableId: table.id, orderType: "dine_in", guestCount, guestName }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setCurrentOrder({ id: d.order.id, openedAt: d.order.openedAt, guestCount });
      setOrderLines([]);
      setSelectedTable({ ...table, status: "occupied", currentOrderId: d.order.id });
      setTables(prev => prev.map(t => t.id === table.id ? { ...t, status: "occupied", currentOrderId: d.order.id } : t));
      setScreen("order");
    } catch (e: any) { toast({ title: "Помилка", description: e.message, variant: "destructive" }); }
  };

  // ── Create new table + open order ────────────────────────────────────────
  const handleCreateTable = async (number: string, guests: number, notes: string, location: string) => {
    setShowNewTable(false);
    try {
      const tr = await apiFetch("/fb/tables", {
        method: "POST",
        body: JSON.stringify({ number, capacity: guests, location, notes, status: "free" }),
      });
      const td = await tr.json();
      if (!tr.ok) throw new Error(td.error);
      const table: Table = td.table;
      // Now open order
      const or = await apiFetch("/fb/orders", {
        method: "POST",
        body: JSON.stringify({ tableId: table.id, orderType: "dine_in", guestCount: guests, notes }),
      });
      const od = await or.json();
      if (!or.ok) throw new Error(od.error);
      setTables(prev => [...prev, { ...table, status: "occupied", currentOrderId: od.order.id }]);
      setSelectedTable({ ...table, status: "occupied", currentOrderId: od.order.id });
      setCurrentOrder({ id: od.order.id, openedAt: od.order.openedAt, guestCount: guests });
      setOrderLines([]);
      setScreen("order");
      toast({ title: `Стіл #${number} відкрито · ${guests} гостей` });
    } catch (e: any) { toast({ title: "Помилка", description: e.message, variant: "destructive" }); }
  };

  // ── Add line to order ─────────────────────────────────────────────────────
  const addLine = (line: Omit<OrderLine, "localId" | "id" | "sent" | "exciseConfirmed">) => {
    setOrderLines(prev => [...prev, { ...line, localId: uid(), sent: false, exciseConfirmed: false }]);
  };

  const removeLine = (localId: string) => setOrderLines(prev => prev.filter(l => l.localId !== localId));
  const changeQty  = (localId: string, delta: number) => setOrderLines(prev =>
    prev.map(l => l.localId === localId
      ? { ...l, qty: Math.max(0.5, l.qty + delta), totalPrice: Math.max(0.5, l.qty + delta) * l.price }
      : l
    ).filter(l => l.qty > 0)
  );

  // ── Send to kitchen/bar ───────────────────────────────────────────────────
  const sendOrder = async () => {
    if (!currentOrder) {
      // Create order first
      if (!selectedTable) return;
      try {
        const r = await apiFetch("/fb/orders", {
          method: "POST",
          body: JSON.stringify({ tableId: selectedTable.id, orderType: "dine_in", guestCount: 1 }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setCurrentOrder({ id: d.order.id, openedAt: d.order.openedAt, guestCount: 1 });
        await sendLines(d.order.id);
      } catch (e: any) { toast({ title: "Помилка", description: e.message, variant: "destructive" }); }
      return;
    }
    await sendLines(currentOrder.id);
  };

  const sendLines = async (orderId: number) => {
    const unsent = orderLines.filter(l => !l.sent);
    if (unsent.length === 0) return;
    setSending(true);
    try {
      await Promise.all(unsent.map(line => {
        const notes = buildNotes(line);
        const qty   = Math.round(line.qty * 100) / 100;
        return apiFetch(`/fb/orders/${orderId}/items`, {
          method: "POST",
          body: JSON.stringify({ itemId: line.itemId, quantity: qty, notes: notes || undefined }),
        });
      }));
      setOrderLines(prev => prev.map(l => l.sent ? l : { ...l, sent: true }));
      toast({ title: `✅ ${unsent.length} поз. відправлено на кухню / бар` });
      load();
    } catch (e: any) {
      toast({ title: "Помилка відправки", description: e.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  // ── After payment ─────────────────────────────────────────────────────────
  const afterPayment = () => {
    setScreen("home");
    setSelectedTable(null);
    setCurrentOrder(null);
    setOrderLines([]);
    load();
    toast({ title: "✅ Стіл закрито. Оплата прийнята." });
  };

  // ── Toggle stop-list item ─────────────────────────────────────────────────
  const toggleItem = async (id: number, available: boolean) => {
    try {
      await apiFetch(`/fb/items/${id}`, { method: "PATCH", body: JSON.stringify({ isAvailable: available }) });
      setMenuItems(prev => prev.map(i => i.id === id ? { ...i, isAvailable: available } : i));
    } catch { toast({ title: "Помилка оновлення", variant: "destructive" }); }
  };

  // ── Go back to home ───────────────────────────────────────────────────────
  const goBack = () => {
    setScreen("home");
    setSelectedTable(null);
    setCurrentOrder(null);
    setOrderLines([]);
  };

  return (
    <AppLayout>
      <div className="h-[calc(100vh-57px)] flex flex-col bg-[#12141f] overflow-hidden">
        {screen === "home" ? (
          <HomeScreen
            tables={tables} session={session} sessions={sessions} loading={loading}
            onSelectTable={handleSelectTable}
            onCreateTable={() => setShowNewTable(true)}
            onRefresh={load}
            menuItems={menuItems}
            onToggleItem={toggleItem}
            onOpenShift={() => setShowShiftOpen(true)}
          />
        ) : selectedTable ? (
          <OrderScreen
            table={selectedTable} order={currentOrder}
            lines={orderLines} categories={categories} menuItems={menuItems}
            onBack={goBack} onAddLine={addLine} onRemoveLine={removeLine}
            onChangeQty={changeQty} onSend={sendOrder} onPay={afterPayment} sending={sending}
          />
        ) : null}

        {/* New table dialog */}
        {showNewTable && (
          <NewTableDialog onConfirm={handleCreateTable} onClose={() => setShowNewTable(false)} />
        )}

        {/* Open existing free table dialog (reuse New table style) */}
        {showOpenTableFor && (
          <Dialog open onOpenChange={() => setShowOpenTableFor(null)}>
            <DialogContent className="bg-[#1a1d2e] border-white/10 text-white max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2">
                  <Table2 className="w-4 h-4 text-emerald-400" /> Стіл #{showOpenTableFor.number}
                  <span className="text-white/30 text-xs font-normal">· {showOpenTableFor.location}</span>
                </DialogTitle>
              </DialogHeader>
              <OpenFreeTableForm
                table={showOpenTableFor}
                onConfirm={(g, n) => handleOpenExistingTable(showOpenTableFor, g, n)}
                onClose={() => setShowOpenTableFor(null)}
              />
            </DialogContent>
          </Dialog>
        )}

        {/* Shift open dialog */}
        {showShiftOpen && (
          <ShiftOpenDialog
            onClose={() => setShowShiftOpen(false)}
            onComplete={load}
          />
        )}
      </div>
    </AppLayout>
  );
}

// ── ShiftOpenDialog — відкриття зміни по кожній юридичній особі ──────────────
function ShiftOpenDialog({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const { toast } = useToast();
  const [entities,   setEntities]   = useState<LegalEntity[]>([]);
  const [step,       setStep]       = useState<"loading" | "step" | "done">("loading");
  const [stepIdx,    setStepIdx]    = useState(0);
  const [cashName,   setCashName]   = useState("");
  const [cashBal,    setCashBal]    = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [openedCount, setOpenedCount] = useState(0);

  // Fetch legal entities that don't have open sessions yet
  useEffect(() => {
    apiFetch("/fb/cashbox/legal-entities")
      .then(r => r.json())
      .then(d => {
        const all: LegalEntity[] = d.legalEntities || [];
        // Only show entities without an already-open session
        const pending = all.filter(e => !e.session_id);
        setEntities(pending);
        if (pending.length === 0) {
          setStep("done");
        } else {
          const first = pending[0];
          setCashName(`Каса ${first.short_name || first.type || "1"}`);
          setCashBal("0");
          setStep("step");
        }
      })
      .catch(() => {
        // If no legal entities configured — open a generic session
        setEntities([]);
        setCashName("Каса 1");
        setCashBal("0");
        setStep("step");
      });
  }, []);

  const currentEntity = entities[stepIdx] ?? null;

  const handleOpenSession = async () => {
    setSubmitting(true);
    try {
      const body: any = {
        openingBalance: parseFloat(cashBal) || 0,
        cashboxName: cashName.trim() || "Каса 1",
        legalEntityId: currentEntity?.id ?? null,
      };
      const r = await apiFetch("/fb/cashbox/session", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok && r.status !== 409) {
        toast({ title: "Помилка відкриття зміни", description: d.error || "Невідома помилка", variant: "destructive" });
        setSubmitting(false);
        return;
      }
      // 409 = already open — treat as success for this entity
      setOpenedCount(c => c + 1);
      goNextStep();
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const goNextStep = () => {
    const nextIdx = stepIdx + 1;
    if (entities.length === 0 || nextIdx >= entities.length) {
      setStep("done");
    } else {
      const next = entities[nextIdx];
      setCashName(`Каса ${next.short_name || next.type || nextIdx + 1}`);
      setCashBal("0");
      setStepIdx(nextIdx);
    }
  };

  const handleSkip = () => goNextStep();

  const typeLabel: Record<string, string> = { ФОП: "ФОП", ТОВ: "ТОВ", ПП: "ПП", FOP: "ФОП", TOV: "ТОВ" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#1a1d2e] rounded-t-3xl border-t border-white/10 pb-safe">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {step === "loading" && (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-sm text-white/50">Завантаження...</p>
          </div>
        )}

        {step === "step" && (
          <div className="px-5 pb-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5 pt-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/30 mb-0.5">
                  {entities.length > 0
                    ? `Крок ${stepIdx + 1} з ${entities.length}`
                    : "Відкриття зміни"}
                </p>
                <h2 className="text-lg font-bold text-white">Відкрити зміну</h2>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/6 flex items-center justify-center">
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>

            {/* Entity card */}
            {currentEntity && (
              <div className="bg-indigo-500/10 border border-indigo-500/25 rounded-2xl px-4 py-3 mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-indigo-300">
                      {typeLabel[currentEntity.type] || currentEntity.type}
                      {currentEntity.is_default && <span className="ml-1.5 text-[9px] bg-indigo-500/30 text-indigo-400 rounded px-1 py-0.5 uppercase tracking-wide">За замовч.</span>}
                    </p>
                    <p className="text-sm font-bold text-white leading-tight">{currentEntity.short_name || currentEntity.name}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Cashbox name */}
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">Назва каси</p>
              <input
                value={cashName}
                onChange={e => setCashName(e.target.value)}
                placeholder="Каса 1"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>

            {/* Opening balance */}
            <div className="mb-6">
              <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">Залишок готівки в касі на початок зміни</p>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-sm font-semibold">₴</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashBal}
                  onChange={e => setCashBal(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-indigo-500/50 transition-colors text-right text-lg font-bold"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {entities.length > 1 && (
                <button onClick={handleSkip} disabled={submitting}
                  className="flex-1 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-sm text-white/50 hover:bg-white/10 transition-colors">
                  Пропустити
                </button>
              )}
              <button onClick={handleOpenSession} disabled={submitting}
                className="flex-[2] flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-60">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Відкрити
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="px-5 pb-8 pt-2">
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-white mb-1">
                  {openedCount > 0 ? "Зміну відкрито!" : "Зміна вже активна"}
                </p>
                <p className="text-sm text-white/40">
                  {openedCount > 0
                    ? `Відкрито ${openedCount} ${openedCount === 1 ? "касу" : "каси"}`
                    : "Всі зміни вже відкриті"}
                </p>
              </div>
              <button onClick={() => { onComplete(); onClose(); }}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors">
                Почати роботу
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── OpenFreeTableForm (inline small form) ─────────────────────────────────────
function OpenFreeTableForm({ table, onConfirm, onClose }: {
  table: Table; onConfirm: (guests: number, name: string) => void; onClose: () => void;
}) {
  const [guests, setGuests] = useState(table.capacity || 2);
  const [name,   setName]   = useState("");
  return (
    <div className="space-y-5 py-2">
      <div>
        <p className="text-xs text-white/40 uppercase tracking-wide mb-3">Кількість гостей</p>
        <div className="flex items-center justify-center gap-6">
          <button onClick={() => setGuests(g => Math.max(1, g - 1))}
            className="w-12 h-12 rounded-xl bg-white/8 hover:bg-white/14 flex items-center justify-center">
            <Minus className="w-5 h-5 text-white/60" />
          </button>
          <span className="text-5xl font-bold text-white w-12 text-center">{guests}</span>
          <button onClick={() => setGuests(g => Math.min(40, g + 1))}
            className="w-12 h-12 rounded-xl bg-indigo-600/60 hover:bg-indigo-600 flex items-center justify-center">
            <Plus className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
      <div>
        <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Ім'я гостя (опційно)</p>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Прізвище або нік..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-indigo-500/50" />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} className="text-white/40">Скасувати</Button>
        <Button onClick={() => onConfirm(guests, name)} className="bg-emerald-600 hover:bg-emerald-500 text-white flex-1">
          <CheckCircle2 className="w-4 h-4 mr-1.5" /> Відкрити стіл
        </Button>
      </DialogFooter>
    </div>
  );
}
