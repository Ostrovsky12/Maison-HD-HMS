import { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Minus, X, Search, RefreshCw, Users, Clock, Receipt,
  CreditCard, Banknote, ChevronRight, UtensilsCrossed, Loader2,
  Table2, FileText, Smartphone, StickyNote, CheckCircle2,
  ArrowLeft, ChevronLeft, ScanBarcode, Camera, Keyboard,
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
type Table       = { id: number; table_number: string; section: string; capacity: number; status: string; current_order_id?: number };
type Category    = { id: number; name: string; icon?: string; sort_order: number };
type MenuItem    = { id: number; name: string; price: number; category_id: number; is_available: boolean; description?: string; is_alcohol?: boolean; image_url?: string; imageUrl?: string };
type OrderItem   = { id?: number; item_id: number; name: string; price: number; quantity: number; total_price: number; notes?: string; is_alcohol?: boolean };
type Order       = { id: number; table_id?: number; order_type: string; guest_name?: string; guest_count?: number; status: string; total_amount: number; items?: OrderItem[]; opened_at?: string };
type LegalEntity = { id: number; name: string; short_name?: string; type: string; is_default?: boolean; handles_alcohol?: boolean };

function fmt(n: number | string | undefined | null) { return `₴${Number(n || 0).toFixed(0)}`; }
function fmtDec(n: number | string | undefined | null) { return `₴${Number(n || 0).toFixed(2)}`; }
function itemImg(item: MenuItem): string | undefined { return item.imageUrl || item.image_url; }

function elapsed(iso?: string) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 60) return `${diff} хв`;
  return `${Math.floor(diff / 60)}год ${diff % 60}хв`;
}

const STATUS_STYLE: Record<string, { bg: string; border: string; dot: string; label: string; text: string }> = {
  free:     { bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-400", label: "Вільний",  text: "text-emerald-300" },
  occupied: { bg: "bg-rose-500/10",    border: "border-rose-500/30",    dot: "bg-rose-400",    label: "Зайнятий", text: "text-rose-300"    },
  reserved: { bg: "bg-amber-500/10",   border: "border-amber-500/30",   dot: "bg-amber-400",   label: "Резерв",   text: "text-amber-300"   },
};

const PAYMENT_METHODS = [
  { key: "cash",   label: "Готівка", icon: Banknote,   color: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" },
  { key: "card",   label: "Картка",  icon: CreditCard, color: "bg-blue-500/15 border-blue-500/30 text-blue-300"          },
  { key: "liqpay", label: "LiqPay",  icon: Smartphone, color: "bg-amber-500/15 border-amber-500/30 text-amber-300"       },
];

const TIP_OPTIONS = [0, 5, 7, 10, 15];

// ── CAT EMOJI MAP ──────────────────────────────────────────────────────────────
const CAT_EMOJI: Record<string, string> = {
  "сніданки": "🍳", "супи": "🍲", "салати": "🥗", "закуски": "🍢",
  "основні": "🍖", "десерти": "🍰", "напої": "☕", "бар": "🍷",
  "піца": "🍕", "паста": "🍝", "бургери": "🍔", "морепродукти": "🦐",
};
function catEmoji(name: string): string {
  const key = name.toLowerCase();
  for (const k of Object.keys(CAT_EMOJI)) {
    if (key.includes(k)) return CAT_EMOJI[k];
  }
  return "🍽️";
}

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
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2">{"Ім'я гостя (опційно)"}</p>
            <input
              value={name} onChange={e => setName(e.target.value)}
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

// ── Item Note Dialog ──────────────────────────────────────────────────────────
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
          value={note} onChange={e => setNote(e.target.value)}
          placeholder="Без цибулі, добре прожарити, алергени..."
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
  const [method,   setMethod]   = useState("cash");
  const [given,    setGiven]    = useState("");
  const [tipPct,   setTipPct]   = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [entityId, setEntityId] = useState<number | null>(
    legalEntities.find(e => e.is_default)?.id ?? legalEntities[0]?.id ?? null
  );

  const hasAlcohol = items.some(i => i.is_alcohol);
  const total    = items.reduce((s, i) => s + i.total_price, 0);
  const tipAmt   = Math.round(total * tipPct) / 100;
  const finalAmt = total + tipAmt;
  const change   = method === "cash" && Number(given) > finalAmt ? Number(given) - finalAmt : 0;
  const canPay   = method !== "cash" || !given || Number(given) >= finalAmt;

  useEffect(() => {
    if (!legalEntities.length) return;
    const alcoholEntity = legalEntities.find(e => e.handles_alcohol);
    const defaultEntity = legalEntities.find(e => e.is_default) || legalEntities[0];
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
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(pm => {
              const Icon = pm.icon;
              return (
                <button key={pm.key} onClick={() => setMethod(pm.key)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition-all text-xs font-medium ${
                    method === pm.key ? pm.color : "bg-white/5 border-white/10 text-white/40 hover:bg-white/8"
                  }`}>
                  <Icon className="w-5 h-5" />{pm.label}
                </button>
              );
            })}
          </div>
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
            {tipPct > 0 && <p className="text-xs text-white/40 mt-1 text-right">+{fmtDec(tipAmt)} чайових</p>}
          </div>
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

// ── Barcode Scanner Dialog ────────────────────────────────────────────────────
function BarcodeScanDialog({ onFound, onClose }: {
  onFound: (item: MenuItem) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>(0);

  const [mode,      setMode]      = useState<"camera" | "manual">("camera");
  const [manualCode, setManualCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [camError,  setCamError]  = useState<string | null>(null);
  const [lastCode,  setLastCode]  = useState<string | null>(null);
  const [foundItem, setFoundItem] = useState<MenuItem | null>(null);

  const hasBarcodeDetector = typeof window !== "undefined" && "BarcodeDetector" in window;

  // ── Lookup by code ──────────────────────────────────────────────────────────
  const lookupCode = useCallback(async (code: string) => {
    const clean = code.trim();
    if (!clean || clean === lastCode) return;
    setLastCode(clean);
    setSearching(true);
    try {
      const r = await apiFetch(`/fb/items/lookup?code=${encodeURIComponent(clean)}`);
      const d = await r.json();
      if (!r.ok) {
        toast({ title: "Товар не знайдено", description: `Код: ${clean}`, variant: "destructive" });
        setTimeout(() => setLastCode(null), 2000);
        return;
      }
      setFoundItem(d.item);
    } catch {
      toast({ title: "Помилка пошуку", variant: "destructive" });
    } finally { setSearching(false); }
  }, [lastCode]);

  // ── Camera scanning ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "camera" || !hasBarcodeDetector) return;

    let stopped = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new (window as any).BarcodeDetector({
          formats: ["ean_13", "ean_8", "code_128", "code_39", "itf", "upc_a", "upc_e", "qr_code"],
        });

        const detect = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              lookupCode(code);
            }
          } catch { /* frame not ready */ }
          rafRef.current = requestAnimationFrame(detect);
        };
        rafRef.current = requestAnimationFrame(detect);
      } catch (e: any) {
        if (!stopped) setCamError(e.message || "Немає доступу до камери");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [mode, hasBarcodeDetector, lookupCode]);

  // ── Confirm found item ──────────────────────────────────────────────────────
  const confirmItem = () => {
    if (!foundItem) return;
    onFound(foundItem);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1d2e] border-white/10 text-white max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle className="text-white flex items-center gap-2">
            <ScanBarcode className="w-4 h-4 text-indigo-400" />
            Сканування УКЗЕД / штрих-коду
          </DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-1 px-4 pt-3">
          <button onClick={() => { setMode("camera"); setLastCode(null); setFoundItem(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === "camera" ? "bg-indigo-600 text-white" : "bg-white/6 text-white/40 hover:bg-white/10"}`}>
            <Camera className="w-3.5 h-3.5" /> Камера
          </button>
          <button onClick={() => { setMode("manual"); setLastCode(null); setFoundItem(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === "manual" ? "bg-indigo-600 text-white" : "bg-white/6 text-white/40 hover:bg-white/10"}`}>
            <Keyboard className="w-3.5 h-3.5" /> Ввести вручну
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Camera view */}
          {mode === "camera" && (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
              {!hasBarcodeDetector ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 text-sm text-center px-4">
                  <ScanBarcode className="w-8 h-8 mb-2 opacity-30" />
                  <p>BarcodeDetector недоступний у цьому браузері</p>
                  <p className="text-xs mt-1 text-white/25">Використайте Chrome або перейдіть до ручного введення</p>
                </div>
              ) : camError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 text-sm text-center px-4">
                  <Camera className="w-8 h-8 mb-2 opacity-30" />
                  <p>{camError}</p>
                  <button onClick={() => { setCamError(null); setMode("camera"); }}
                    className="mt-2 px-3 py-1 bg-white/8 rounded-lg text-xs">Спробувати знову</button>
                </div>
              ) : (
                <>
                  <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
                  {/* Scan zone overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-3/4 h-20 relative">
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-indigo-400 rounded-tl" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-indigo-400 rounded-tr" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-indigo-400 rounded-bl" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-indigo-400 rounded-br" />
                      <div className="absolute inset-x-0 top-1/2 h-0.5 bg-indigo-400/60 animate-pulse" />
                    </div>
                  </div>
                  {searching && (
                    <div className="absolute bottom-2 inset-x-0 flex justify-center">
                      <div className="bg-black/60 rounded-full px-3 py-1 flex items-center gap-2 text-xs text-white">
                        <Loader2 className="w-3 h-3 animate-spin" /> Пошук...
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Manual input */}
          {mode === "manual" && (
            <div className="space-y-2">
              <p className="text-xs text-white/40">Введіть код УКЗЕД або акцизний марки:</p>
              <div className="flex gap-2">
                <input
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") lookupCode(manualCode); }}
                  placeholder="напр. 2203001000"
                  autoFocus
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-indigo-500/50 font-mono tracking-wider"
                />
                <button onClick={() => lookupCode(manualCode)} disabled={searching || !manualCode}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl transition-colors">
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-white/20">
                Код УКЗЕД прив'язується до товару в меню F{"&"}B → Меню → картка товару
              </p>
            </div>
          )}

          {/* Found item preview */}
          {foundItem && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-3">
              {(foundItem.imageUrl || foundItem.image_url) ? (
                <img src={foundItem.imageUrl || foundItem.image_url} alt={foundItem.name}
                  className="w-14 h-14 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-white/8 flex items-center justify-center text-2xl shrink-0">🍷</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{foundItem.name}</p>
                <p className="text-xs text-emerald-300 font-bold">₴{Number(foundItem.price).toFixed(0)}</p>
                {foundItem.uktzed_code && (
                  <p className="text-[10px] text-white/30 font-mono mt-0.5">УКЗЕД: {foundItem.uktzed_code}</p>
                )}
              </div>
              <button onClick={confirmItem}
                className="shrink-0 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-semibold text-white flex items-center gap-1 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Додати
              </button>
            </div>
          )}
        </div>

        <DialogFooter className="px-4 pb-4">
          <Button variant="ghost" onClick={onClose} className="text-white/50">Закрити</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tables Full-Screen View ────────────────────────────────────────────────────
function TablesView({ tables, orders, loading, onSelect }: {
  tables: Table[]; orders: Order[]; loading: boolean;
  onSelect: (t: Table) => void;
}) {
  const sections = [...new Set(tables.map(t => t.section))].sort();
  const [activeSection, setActiveSection] = useState<string>("all");
  const visible  = activeSection === "all" ? tables : tables.filter(t => t.section === activeSection);
  const orderMap = Object.fromEntries(orders.map(o => [o.table_id, o]));

  return (
    <div className="flex flex-col h-full bg-[#12141f]">
      {/* Stats bar */}
      <div className="flex gap-3 px-4 py-3 border-b border-white/6 shrink-0">
        {[
          { label: "Вільних",  count: tables.filter(t => t.status === "free").length,     color: "text-emerald-400" },
          { label: "Зайнятих", count: tables.filter(t => t.status === "occupied").length,  color: "text-rose-400"    },
          { label: "Резервів", count: tables.filter(t => t.status === "reserved").length,  color: "text-amber-400"   },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`text-lg font-bold ${s.color}`}>{s.count}</span>
            <span className="text-xs text-white/30">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Section tabs */}
      {sections.length > 1 && (
        <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-none shrink-0 border-b border-white/5">
          <button onClick={() => setActiveSection("all")}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${activeSection === "all" ? "bg-indigo-600 text-white" : "bg-white/6 text-white/35 hover:bg-white/10"}`}>
            Всі зали
          </button>
          {sections.map(s => (
            <button key={s} onClick={() => setActiveSection(s)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${activeSection === s ? "bg-indigo-600 text-white" : "bg-white/6 text-white/35 hover:bg-white/10"}`}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Tables grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-white/20" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20 text-white/20">
            <Table2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Столи не налаштовані</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {visible.map(table => {
              const st  = STATUS_STYLE[table.status] || STATUS_STYLE.free;
              const ord = orderMap[table.id];
              return (
                <button key={table.id} onClick={() => onSelect(table)}
                  className={`relative text-left rounded-2xl border p-4 transition-all hover:brightness-110 active:scale-95 ${st.bg} ${st.border}`}>
                  <div className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${st.dot}`} />
                  <p className="text-lg font-bold text-white mb-0.5">#{table.table_number}</p>
                  <p className="text-[10px] text-white/35 mb-2">{table.section}</p>
                  {table.status === "occupied" && ord ? (
                    <>
                      <div className="flex items-center gap-1 mb-1">
                        <Users className="w-3 h-3 text-white/30" />
                        <span className="text-xs text-white/45">{ord.guest_count || "?"} гостей</span>
                      </div>
                      <p className={`text-base font-bold ${st.text}`}>{fmt(ord.total_amount)}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="w-2.5 h-2.5 text-white/20" />
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

// ── Check Panel (Left) ────────────────────────────────────────────────────────
function CheckPanel({ table, order, items, onChangeQty, onNoteItem, onPrecheck, onPay, onSend, sending, onBack }: {
  table: Table; order: Order | null; items: OrderItem[];
  onChangeQty: (itemId: number, delta: number) => void;
  onNoteItem: (item: OrderItem) => void;
  onPrecheck: () => void; onPay: () => void;
  onSend: () => void; sending: boolean;
  onBack: () => void;
}) {
  const total   = items.reduce((s, i) => s + i.total_price, 0);
  const unsaved = items.some(i => !i.id);
  const qty     = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="flex flex-col h-full bg-[#1a1d2e] border-r border-white/6">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-white/8 shrink-0">
        <button onClick={onBack}
          className="w-8 h-8 rounded-xl bg-white/6 hover:bg-white/12 flex items-center justify-center transition-colors shrink-0">
          <ChevronLeft className="w-4 h-4 text-white/50" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">Стіл #{table.table_number}</span>
            <span className="text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{table.section}</span>
          </div>
          {order && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-white/30">Чек #{order.id}</span>
              {order.guest_count && (
                <span className="text-[10px] text-white/25">· {order.guest_count} гостей</span>
              )}
              {order.opened_at && (
                <span className="text-[10px] text-white/20">· {elapsed(order.opened_at)}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Column headers */}
      {items.length > 0 && (
        <div className="grid grid-cols-[1fr_28px_52px_52px] gap-1 px-3 py-2 border-b border-white/5 shrink-0">
          <span className="text-[10px] text-white/25 uppercase tracking-wide">Найменування</span>
          <span className="text-[10px] text-white/25 uppercase tracking-wide text-center">К-ть</span>
          <span className="text-[10px] text-white/25 uppercase tracking-wide text-right">Ціна</span>
          <span className="text-[10px] text-white/25 uppercase tracking-wide text-right">Всього</span>
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/15 px-4">
            <UtensilsCrossed className="w-10 h-10" />
            <p className="text-sm text-center">Додайте страви з меню праворуч</p>
          </div>
        ) : (
          <div className="divide-y divide-white/4">
            {items.map((item, idx) => (
              <div key={idx} className={`grid grid-cols-[1fr_28px_52px_52px] gap-1 items-center px-3 py-2.5 group ${!item.id ? "opacity-60" : ""}`}>
                {/* Name */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-white/85 leading-tight truncate">{item.name}</p>
                    <button onClick={() => onNoteItem(item)}
                      className={`shrink-0 w-4 h-4 rounded flex items-center justify-center transition-all ${
                        item.notes
                          ? "text-amber-400 opacity-100"
                          : "text-white/20 opacity-0 group-hover:opacity-100"
                      }`}>
                      <StickyNote className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  {item.notes && (
                    <p className="text-[9px] text-amber-400/60 truncate mt-0.5">{item.notes}</p>
                  )}
                </div>

                {/* Qty with inline controls */}
                <div className="flex items-center justify-center">
                  <div className="relative group/qty">
                    <span className="text-sm font-bold text-white group-hover/qty:opacity-0 transition-opacity">{item.quantity}</span>
                    <div className="absolute inset-0 flex items-center justify-center gap-0.5 opacity-0 group-hover/qty:opacity-100 transition-opacity">
                      <button onClick={() => onChangeQty(item.item_id, -1)}
                        className="w-3 h-5 bg-red-500/20 hover:bg-red-500/40 rounded flex items-center justify-center">
                        <Minus className="w-2 h-2 text-red-300" />
                      </button>
                      <button onClick={() => onChangeQty(item.item_id, 1)}
                        className="w-3 h-5 bg-indigo-500/20 hover:bg-indigo-500/40 rounded flex items-center justify-center">
                        <Plus className="w-2 h-2 text-indigo-300" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Price */}
                <p className="text-xs text-white/40 text-right">{fmt(item.price)}</p>

                {/* Total */}
                <p className="text-xs font-semibold text-white/85 text-right">{fmt(item.total_price)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-white/8 px-3 pt-3 pb-3 space-y-2.5">
        {/* Send to kitchen */}
        {unsaved && (
          <button onClick={onSend} disabled={sending}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
            {sending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <ChevronRight className="w-4 h-4" />}
            Відправити на кухню
          </button>
        )}

        {/* Totals */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/35">{qty} позицій</div>
          <div className="text-right">
            <div className="text-[10px] text-white/30">Всього</div>
            <div className="text-lg font-bold text-white leading-tight">{fmtDec(total)}</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onPrecheck}
            className="py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors">
            <FileText className="w-3.5 h-3.5" /> Предчек
          </button>
          <button onClick={onPay}
            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors">
            <CreditCard className="w-3.5 h-3.5" /> Оплатити
          </button>
        </div>
      </div>
    </div>
  );
}

// ── POS Menu Panel (Right) ────────────────────────────────────────────────────
function PosMenuPanel({ categories, items, onAddItem, onScan }: {
  categories: Category[]; items: MenuItem[]; onAddItem: (item: MenuItem) => void;
  onScan: () => void;
}) {
  const [catId,  setCatId]  = useState<number | null>(null);
  const [search, setSearch] = useState("");

  // Build category → first item image map
  const catImageMap: Record<number, string | undefined> = {};
  for (const item of items) {
    if (!catImageMap[item.category_id]) {
      const img = itemImg(item);
      if (img) catImageMap[item.category_id] = img;
    }
  }

  const filteredItems = items.filter(i =>
    i.is_available &&
    (catId === null || i.category_id === catId) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()))
  );

  const showCategoryGrid = catId === null && !search;
  const selectedCat = categories.find(c => c.id === catId);

  return (
    <div className="flex flex-col h-full bg-[#12141f]">
      {/* Top bar: search + scan button */}
      <div className="px-3 pt-3 pb-2 shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 h-9">
            <Search className="w-3.5 h-3.5 text-white/25 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Пошук страви або напою..."
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")}>
                <X className="w-3.5 h-3.5 text-white/30" />
              </button>
            )}
          </div>
          <button onClick={onScan}
            title="Сканувати УКЗЕД / штрих-код"
            className="h-9 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 flex items-center gap-1.5 text-indigo-300 transition-colors shrink-0">
            <ScanBarcode className="w-4 h-4" />
            <span className="text-xs font-medium hidden lg:inline">УКЗЕД</span>
          </button>
        </div>

        {/* Category pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          <button onClick={() => { setCatId(null); setSearch(""); }}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${catId === null && !search ? "bg-indigo-500 text-white" : "bg-white/6 text-white/40 hover:bg-white/10"}`}>
            Всі товари
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => { setCatId(c.id); setSearch(""); }}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${catId === c.id ? "bg-indigo-500 text-white" : "bg-white/6 text-white/40 hover:bg-white/10"}`}>
              {c.icon && <span className="mr-1">{c.icon}</span>}{c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {/* Category photo grid (main view) */}
        {showCategoryGrid ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
            {categories.map(cat => {
              const img = catImageMap[cat.id];
              const emoji = cat.icon || catEmoji(cat.name);
              const catItems = items.filter(i => i.is_available && i.category_id === cat.id);
              return (
                <button key={cat.id} onClick={() => setCatId(cat.id)}
                  className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-white/5 border border-white/8 hover:border-indigo-500/40 transition-all group active:scale-95">
                  {img ? (
                    <img src={img} alt={cat.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-4xl">{emoji}</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2.5">
                    <p className="text-sm font-semibold text-white leading-tight">{cat.name}</p>
                    {catItems.length > 0 && (
                      <p className="text-[10px] text-white/50 mt-0.5">{catItems.length} позицій</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Items below categories or when category selected / search active */}
        {!showCategoryGrid || true ? (
          <>
            {/* Category header when drilled into */}
            {catId !== null && !search && selectedCat && (
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setCatId(null)}
                  className="w-7 h-7 rounded-lg bg-white/6 hover:bg-white/12 flex items-center justify-center transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5 text-white/50" />
                </button>
                <span className="text-sm font-semibold text-white/80">{selectedCat.name}</span>
                <span className="text-xs text-white/30">({filteredItems.length})</span>
              </div>
            )}

            {filteredItems.length === 0 && !showCategoryGrid ? (
              <div className="text-center py-12 text-white/20 text-sm">Нічого не знайдено</div>
            ) : (
              <div className={`grid gap-2 ${showCategoryGrid ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
                {(showCategoryGrid ? [] : filteredItems).map(item => {
                  const img = itemImg(item);
                  return (
                    <button key={item.id} onClick={() => onAddItem(item)}
                      className="text-left rounded-2xl bg-white/4 hover:bg-white/8 border border-white/6 hover:border-indigo-500/30 overflow-hidden transition-all group active:scale-95">
                      {img ? (
                        <div className="w-full aspect-[4/3] overflow-hidden bg-white/5">
                          <img src={img} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        </div>
                      ) : (
                        <div className="w-full aspect-[4/3] bg-white/5 flex items-center justify-center text-3xl">🍽️</div>
                      )}
                      <div className="p-2">
                        <p className="text-xs font-medium text-white/85 leading-tight mb-1 line-clamp-2">{item.name}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-indigo-300">{fmt(item.price)}</span>
                          <div className="w-5 h-5 rounded-full bg-indigo-500/20 group-hover:bg-indigo-500/50 flex items-center justify-center transition-colors">
                            <Plus className="w-3 h-3 text-indigo-300" />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Mobile: Menu Panel (standard, used in tab) ─────────────────────────────────
function MobileMenuPanel({ categories, items, onAddItem, disabled, onScan }: {
  categories: Category[]; items: MenuItem[]; onAddItem: (item: MenuItem) => void;
  disabled?: boolean; onScan?: () => void;
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
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 h-9">
            <Search className="w-3.5 h-3.5 text-white/25 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Пошук..." className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none" />
            {search && <button onClick={() => setSearch("")}><X className="w-3 h-3 text-white/30" /></button>}
          </div>
          {onScan && (
            <button onClick={onScan}
              className="h-9 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 flex items-center justify-center text-indigo-300 transition-colors shrink-0">
              <ScanBarcode className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
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
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-white/25 text-sm">Нічого не знайдено</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map(item => {
              const img = itemImg(item);
              return (
                <button key={item.id} onClick={() => !disabled && onAddItem(item)} disabled={disabled}
                  className={`text-left rounded-2xl bg-white/4 hover:bg-white/8 border border-white/6 overflow-hidden transition-all group ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
                  {img ? (
                    <div className="w-full aspect-[4/3] overflow-hidden bg-white/5">
                      <img src={img} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  ) : (
                    <div className="w-full aspect-[4/3] bg-white/5 flex items-center justify-center text-3xl">🍽️</div>
                  )}
                  <div className="p-2.5">
                    <p className="text-xs font-medium text-white/85 leading-tight mb-1">{item.name}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-indigo-300">{fmt(item.price)}</span>
                      <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center">
                        <Plus className="w-3 h-3 text-indigo-300" />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mobile Order Panel ────────────────────────────────────────────────────────
function MobileOrderPanel({ table, order, items, onChangeQty, onNoteItem, onPrecheck, onPay, onSend, sending }: {
  table: Table | null; order: Order | null; items: OrderItem[];
  onChangeQty: (itemId: number, delta: number) => void;
  onNoteItem: (item: OrderItem) => void;
  onPrecheck: () => void; onPay: () => void;
  onSend: () => void; sending: boolean;
}) {
  const total   = items.reduce((s, i) => s + i.total_price, 0);
  const unsaved = items.some(i => !i.id);
  if (!table) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20">
        <Table2 className="w-12 h-12" />
        <p className="text-sm">Оберіть стіл</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-white/6 shrink-0">
        <p className="text-sm font-bold text-white">Стіл #{table.table_number}</p>
        {order && <p className="text-[10px] text-white/30">Чек #{order.id}</p>}
      </div>
      {items.length > 0 && (
        <div className="grid grid-cols-[1fr_28px_52px_52px] gap-1 px-3 py-1.5 border-b border-white/5 shrink-0">
          <span className="text-[9px] text-white/25 uppercase">Найменування</span>
          <span className="text-[9px] text-white/25 uppercase text-center">К-ть</span>
          <span className="text-[9px] text-white/25 uppercase text-right">Ціна</span>
          <span className="text-[9px] text-white/25 uppercase text-right">Всього</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/20">
            <UtensilsCrossed className="w-8 h-8 mb-2" />
            <p className="text-sm">Додайте страви з меню</p>
          </div>
        ) : (
          <div className="divide-y divide-white/4">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_28px_52px_52px] gap-1 items-center px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs text-white/85 truncate">{item.name}</p>
                  {item.notes && <p className="text-[9px] text-amber-400/60">{item.notes}</p>}
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <button onClick={() => onChangeQty(item.item_id, 1)}
                    className="w-4 h-4 bg-indigo-500/20 hover:bg-indigo-500/40 rounded flex items-center justify-center">
                    <Plus className="w-2 h-2 text-indigo-300" />
                  </button>
                  <span className="text-xs font-bold text-white">{item.quantity}</span>
                  <button onClick={() => onChangeQty(item.item_id, -1)}
                    className="w-4 h-4 bg-red-500/20 hover:bg-red-500/40 rounded flex items-center justify-center">
                    <Minus className="w-2 h-2 text-red-300" />
                  </button>
                </div>
                <p className="text-xs text-white/40 text-right">{fmt(item.price)}</p>
                <p className="text-xs font-semibold text-white/85 text-right">{fmt(item.total_price)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {items.length > 0 && (
        <div className="px-4 py-3 border-t border-white/8 shrink-0 space-y-2">
          {unsaved && (
            <button onClick={onSend} disabled={sending}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              Відправити на кухню
            </button>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/35">{items.reduce((s, i) => s + i.quantity, 0)} позицій</span>
            <span className="text-lg font-bold text-white">{fmtDec(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onPrecheck}
              className="py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 text-xs flex items-center justify-center gap-1.5 transition-colors">
              <FileText className="w-3.5 h-3.5" /> Предчек
            </button>
            <button onClick={onPay}
              className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors">
              <CreditCard className="w-3.5 h-3.5" /> Оплатити
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type MobileTab = "tables" | "menu" | "order";

export default function WaiterStationPage() {
  const { toast } = useToast();

  const [tables,        setTables]        = useState<Table[]>([]);
  const [categories,    setCategories]    = useState<Category[]>([]);
  const [menuItems,     setMenuItems]     = useState<MenuItem[]>([]);
  const [orders,        setOrders]        = useState<Order[]>([]);
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([]);
  const [loading,       setLoading]       = useState(true);

  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [currentOrder,  setCurrentOrder]  = useState<Order | null>(null);
  const [orderItems,    setOrderItems]    = useState<OrderItem[]>([]);
  const [sending,       setSending]       = useState(false);

  const [openTableFor, setOpenTableFor] = useState<Table | null>(null);
  const [noteItem,     setNoteItem]     = useState<OrderItem | null>(null);
  const [showPrecheck, setShowPrecheck] = useState(false);
  const [showPayment,  setShowPayment]  = useState(false);
  const [showScanner,  setShowScanner]  = useState(false);

  const [mobileTab, setMobileTab] = useState<MobileTab>("tables");

  // ── Load ──────────────────────────────────────────────────────────────────
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
      setOrders(o.orders || []);
      setLegalEntities(le.legalEntities || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh tables+orders every 30s
  useEffect(() => {
    const iv = setInterval(() => {
      apiFetch("/fb/tables").then(r => r.json()).then(d => setTables(d.tables || [])).catch(() => {});
      apiFetch("/fb/orders?status=open").then(r => r.json()).then(d => setOrders(d.orders || [])).catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  // Auto-refresh menu every 5 min
  useEffect(() => {
    const iv = setInterval(() => {
      Promise.all([
        apiFetch("/fb/categories").then(r => r.json()),
        apiFetch("/fb/items").then(r => r.json()),
      ]).then(([c, m]) => {
        setCategories(c.categories || []);
        setMenuItems(m.items || []);
      }).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Select table ──────────────────────────────────────────────────────────
  const handleSelectTable = async (table: Table) => {
    if (table.status === "free") {
      setOpenTableFor(table);
      return;
    }
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
            total_price: Number(i.total_price), notes: i.notes, is_alcohol: !!i.is_alcohol,
          })));
        }
      } catch { toast({ title: "Помилка завантаження замовлення", variant: "destructive" }); }
    }
  };

  // ── Open table ────────────────────────────────────────────────────────────
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

  // ── Add item ──────────────────────────────────────────────────────────────
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

  // ── Change qty ────────────────────────────────────────────────────────────
  const changeQty = (itemId: number, delta: number) => {
    setOrderItems(prev => prev
      .map(i => i.item_id === itemId ? { ...i, quantity: Math.max(0, i.quantity + delta), total_price: Math.max(0, i.quantity + delta) * i.price } : i)
      .filter(i => i.quantity > 0));
  };

  // ── Save note ─────────────────────────────────────────────────────────────
  const saveNote = (note: string) => {
    if (!noteItem) return;
    setOrderItems(prev => prev.map(i => i.item_id === noteItem.item_id ? { ...i, notes: note || undefined } : i));
  };

  // ── Send to kitchen ───────────────────────────────────────────────────────
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
      const r = await apiFetch(`/fb/orders/${currentOrder.id}`).then(r => r.json());
      if (r.order) {
        setCurrentOrder(r.order);
        setOrderItems((r.order.items || []).map((i: any) => ({
          id: i.id, item_id: i.item_id, name: i.name,
          price: Number(i.price), quantity: i.quantity,
          total_price: Number(i.total_price), notes: i.notes, is_alcohol: !!i.is_alcohol,
        })));
      }
      await load();
      toast({ title: `✅ ${unsaved.length} поз. відправлено на кухню / бар` });
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  // ── After payment ─────────────────────────────────────────────────────────
  const afterPayment = () => {
    setShowPayment(false);
    setSelectedTable(null);
    setCurrentOrder(null);
    setOrderItems([]);
    setMobileTab("tables");
    load();
    toast({ title: "✅ Стіл закрито, замовлення завершено" });
  };

  const handleBack = () => {
    setSelectedTable(null);
    setCurrentOrder(null);
    setOrderItems([]);
    setMobileTab("tables");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-[#12141f] text-white overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/6 shrink-0 bg-[#1a1d2e]">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white">Станція офіціанта</span>
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/30" />}
            <button onClick={() => load()}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
              <RefreshCw className="w-3.5 h-3.5 text-white/40" />
            </button>
          </div>
        </div>

        {/* ── DESKTOP ─────────────────────────────────────────────────────── */}
        <div className="hidden md:flex flex-1 overflow-hidden">
          {selectedTable ? (
            // POS view: Check (left) + Menu (right)
            <>
              <div className="w-[38%] shrink-0 overflow-hidden flex flex-col">
                <CheckPanel
                  table={selectedTable} order={currentOrder} items={orderItems}
                  onChangeQty={changeQty} onNoteItem={item => setNoteItem(item)}
                  onPrecheck={() => setShowPrecheck(true)} onPay={() => setShowPayment(true)}
                  onSend={sendOrder} sending={sending} onBack={handleBack}
                />
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">
                <PosMenuPanel categories={categories} items={menuItems} onAddItem={addItem} onScan={() => setShowScanner(true)} />
              </div>
            </>
          ) : (
            // Tables view: full screen
            <div className="flex-1 overflow-hidden">
              <TablesView tables={tables} orders={orders} loading={loading} onSelect={handleSelectTable} />
            </div>
          )}
        </div>

        {/* ── MOBILE ──────────────────────────────────────────────────────── */}
        <div className="md:hidden flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden">
            {mobileTab === "tables" && (
              <TablesView tables={tables} orders={orders} loading={loading} onSelect={handleSelectTable} />
            )}
            {mobileTab === "menu" && (
              <MobileMenuPanel categories={categories} items={menuItems} onAddItem={addItem}
                disabled={!selectedTable} onScan={() => setShowScanner(true)} />
            )}
            {mobileTab === "order" && (
              <MobileOrderPanel
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
              { key: "tables", icon: Table2,          label: "Столи"      },
              { key: "menu",   icon: UtensilsCrossed,  label: "Меню"       },
              { key: "order",  icon: Receipt,           label: "Замовлення" },
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

      {/* Dialogs */}
      {openTableFor && (
        <OpenTableDialog table={openTableFor} onConfirm={handleOpenTable} onClose={() => setOpenTableFor(null)} />
      )}
      {noteItem && (
        <ItemNoteDialog item={noteItem} onSave={saveNote} onClose={() => setNoteItem(null)} />
      )}
      {showPrecheck && currentOrder && (
        <PrecheckDialog order={currentOrder} items={orderItems}
          onClose={() => setShowPrecheck(false)}
          onPay={() => { setShowPrecheck(false); setShowPayment(true); }} />
      )}
      {showPayment && currentOrder && (
        <PaymentDialog order={currentOrder} items={orderItems} legalEntities={legalEntities}
          onPaid={afterPayment} onClose={() => setShowPayment(false)} />
      )}
      {showScanner && (
        <BarcodeScanDialog
          onFound={item => { addItem(item); }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </AppLayout>
  );
}
