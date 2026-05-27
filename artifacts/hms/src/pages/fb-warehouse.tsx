import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { subDays, format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Plus, Pencil, Trash2, Search, AlertTriangle, Package,
  TruckIcon, Users, ClipboardList, ChevronDown, ChevronRight,
  ArrowDownToLine, ArrowUpFromLine, BarChart3, Boxes,
  Scan, FileText, CheckCircle2, XCircle, Clock, Filter,
  ShoppingCart, Warehouse, RefreshCw,
  Mic, Upload, ImageIcon, ArrowLeft, Sparkles, Info, Loader2,
  PackageX, ArrowRightLeft, Eye, X, ArrowRight, MapPin,
  TrendingUp, TrendingDown, Package2, BarChart2,
  MicOff, Save, ChevronLeft, Check,
} from "lucide-react";

// ─── API helper ───────────────────────────────────────────────────────────────
const BASE = "/api/fb/warehouse";

async function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
  return r.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Ingredient {
  id: number; name: string; unit: string; category: string;
  current_stock: string; min_stock: string; cost_per_unit: string;
  supplier_id?: number; supplier_name?: string; barcode?: string; is_active: boolean;
}
interface Supplier {
  id: number; name: string; contact_name?: string; phone?: string; email?: string;
  edrpou?: string; is_vat_payer: boolean; payment_terms: string; delivery_days: number;
  notes?: string; ingredient_count?: number;
}
interface Receipt {
  id: number; receipt_no?: string; receipt_date: string; status: string;
  supplier_name?: string; supplier_id?: number; total_amount: string;
  payment_type: string; item_count?: number; notes?: string;
}
interface ReceiptItem {
  id?: number; ingredient_id?: number; name: string; quantity: number;
  unit: string; price_per_unit: number; vat_rate?: number;
  is_new_ingredient?: boolean; item_type?: string;
}
interface Writeoff {
  id: number; reason: string; writeoff_date: string; status: string;
  total_amount: string; notes?: string; item_count?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const UNITS = ["кг","г","л","мл","шт","пляш","упак","ящик","л.100","кор"];
const CATEGORIES = ["Мʼясо","Риба","Молочні","Яйця","Овочі","Фрукти","Бакалія","Алкоголь","Напої","Спеції","Інше"];
const PAYMENT_TERMS = [
  { value: "cash", label: "Готівка" },
  { value: "bank", label: "Безготівково" },
  { value: "unpaid", label: "Борг" },
];
const WRITEOFF_REASONS = [
  { value: "spoilage", label: "Зіпсувалося" },
  { value: "staff_meal", label: "Їжа для персоналу" },
  { value: "banquet", label: "Банкет" },
  { value: "breakage", label: "Бій/втрати" },
  { value: "other", label: "Інше" },
];
const RECEIPT_STATUSES: Record<string, { label: string; color: string }> = {
  draft: { label: "Чернетка", color: "bg-muted text-muted-foreground" },
  confirmed: { label: "Проведено", color: "bg-green-100 text-green-800" },
  cancelled: { label: "Скасовано", color: "bg-red-100 text-red-800" },
};

function reasonLabel(v: string) { return WRITEOFF_REASONS.find(r => r.value === v)?.label ?? v; }

function StatusBadge({ s }: { s: string }) {
  if (s === "confirmed" || s === "completed") return (
    <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">
      <CheckCircle2 className="w-3 h-3" /> {s === "completed" ? "Проведена" : "Проведено"}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
      <Clock className="w-3 h-3" /> {s === "open" ? "В процесі" : "Чернетка"}
    </span>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, alert }: { icon: any; label: string; value: string | number; sub?: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 space-y-1 ${alert ? "border-amber-300 bg-amber-50" : "bg-card"}`}>
      <div className={`flex items-center gap-2 text-sm ${alert ? "text-amber-700" : "text-muted-foreground"}`}>
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className={`text-2xl font-bold ${alert ? "text-amber-800" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── Ingredient Dialog ────────────────────────────────────────────────────────
function IngredientDialog({ open, onClose, initial, suppliers, onSave }: {
  open: boolean; onClose: () => void;
  initial?: Partial<Ingredient>; suppliers: Supplier[];
  onSave: (d: any) => void;
}) {
  const blank = { name: "", unit: "кг", category: "Бакалія", current_stock: "0", min_stock: "0", cost_per_unit: "0" };
  const [form, setForm] = useState<any>(initial || blank);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  useState(() => { if (open) setForm(initial || blank); });
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати позицію" : "Нова позиція складу"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Назва *</Label>
            <Input value={form.name || ""} onChange={e => set("name", e.target.value)} className="mt-1" placeholder="Молоко 3.2%" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Одиниця</Label>
              <Select value={form.unit || "кг"} onValueChange={v => set("unit", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Категорія</Label>
              <Select value={form.category || "Бакалія"} onValueChange={v => set("category", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Поточний залишок</Label>
              <Input type="number" min="0" step="0.001" value={form.current_stock || "0"} onChange={e => set("current_stock", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Мінімум (сигнал)</Label>
              <Input type="number" min="0" step="0.001" value={form.min_stock || "0"} onChange={e => set("min_stock", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Собівартість / од.</Label>
              <Input type="number" min="0" step="0.01" value={form.cost_per_unit || "0"} onChange={e => set("cost_per_unit", e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Постачальник</Label>
            <Select value={String(form.supplier_id || "")} onValueChange={v => set("supplier_id", v ? parseInt(v) : null)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="— без постачальника —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— без постачальника —</SelectItem>
                {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Штрихкод</Label>
            <Input value={form.barcode || ""} onChange={e => set("barcode", e.target.value)} className="mt-1" placeholder="EAN / QR код" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => form.name?.trim() && onSave(form)} disabled={!form.name?.trim()}>Зберегти</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Supplier Dialog ──────────────────────────────────────────────────────────
function SupplierDialog({ open, onClose, initial, onSave }: {
  open: boolean; onClose: () => void; initial?: Partial<Supplier>; onSave: (d: any) => void;
}) {
  const blank = { name: "", payment_terms: "cash", delivery_days: 1, is_vat_payer: false };
  const [form, setForm] = useState<any>(initial || blank);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  useState(() => { if (open) setForm(initial || blank); });
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати постачальника" : "Новий постачальник"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Назва *</Label>
            <Input value={form.name || ""} onChange={e => set("name", e.target.value)} className="mt-1" placeholder='ТОВ «Агро-Фреш»' autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Контактна особа</Label><Input value={form.contact_name || ""} onChange={e => set("contact_name", e.target.value)} className="mt-1" /></div>
            <div><Label>Телефон</Label><Input value={form.phone || ""} onChange={e => set("phone", e.target.value)} className="mt-1" placeholder="+38067..." /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={form.email || ""} onChange={e => set("email", e.target.value)} className="mt-1" /></div>
            <div><Label>ЄДРПОУ</Label><Input value={form.edrpou || ""} onChange={e => set("edrpou", e.target.value)} className="mt-1" placeholder="12345678" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Умови оплати</Label>
              <Select value={form.payment_terms || "cash"} onValueChange={v => set("payment_terms", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_TERMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Строк доставки (дні)</Label><Input type="number" min="0" value={form.delivery_days || 1} onChange={e => set("delivery_days", parseInt(e.target.value))} className="mt-1" /></div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={!!form.is_vat_payer} onCheckedChange={v => set("is_vat_payer", v)} />
            <span className="text-sm">Платник ПДВ</span>
          </div>
          <div><Label>Адреса / Примітки</Label><Textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} className="mt-1 resize-none h-16" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => form.name?.trim() && onSave(form)} disabled={!form.name?.trim()}>Зберегти</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Voice Mic Button ─────────────────────────────────────────────────────────
function VoiceMicButton({ onTranscript }: { onTranscript: (t: string) => void }) {
  const [recording, setRecording] = useState(false);
  const recogRef = useRef<any>(null);
  const toggle = () => {
    if (recording) { recogRef.current?.stop(); setRecording(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Браузер не підтримує голосовий ввід. Спробуйте Chrome."); return; }
    const r = new SR();
    r.lang = "uk-UA"; r.continuous = true; r.interimResults = true;
    let final = "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      onTranscript(final + interim);
    };
    r.onerror = () => setRecording(false);
    r.onend = () => setRecording(false);
    recogRef.current = r;
    r.start();
    setRecording(true);
  };
  return (
    <button onClick={toggle} className={`rounded-full p-4 transition-colors mx-auto block ${recording ? "bg-red-500 text-white animate-pulse" : "bg-violet-100 text-violet-600 hover:bg-violet-200"}`}>
      <Mic className="w-7 h-7" />
    </button>
  );
}

// ─── Ingredient Picker ────────────────────────────────────────────────────────
function IngredientPicker({ value, isNew, suggestions, allIngredients, onChange }: {
  value: number | null; isNew: boolean; suggestions: any[];
  allIngredients: any[]; onChange: (ing: any | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  const current = value ? allIngredients.find((i: any) => i.id === value) : null;
  const displayList = search.length >= 1
    ? allIngredients.filter((i: any) => i.name.toLowerCase().includes(search.toLowerCase())).slice(0, 20)
    : suggestions.length > 0
      ? allIngredients.filter((i: any) => suggestions.some((s: any) => s.id === i.id)).slice(0, 8)
      : allIngredients.slice(0, 8);
  return (
    <div className="relative" ref={ref}>
      {isNew ? (
        <button onClick={() => { setSearch(""); setOpen(v => !v); }} className="text-left w-full">
          <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-medium flex items-center gap-1 w-full">
            ⚡ Новий <span className="text-amber-500 underline">Обрати</span>
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 max-w-[120px] truncate" title={current?.name}>✓ {current?.name || `ID:${value}`}</span>
          <button onClick={() => { setSearch(""); setOpen(v => !v); }} className="text-[10px] text-gray-400 hover:text-violet-600 underline">змінити</button>
        </div>
      )}
      {open && (
        <div className="absolute z-50 bg-white border border-gray-200 shadow-xl rounded-lg p-2 w-64 top-full left-0 mt-1">
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук інгредієнту..."
            className="w-full text-xs border rounded px-2 py-1 mb-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300" />
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            <button onClick={() => { onChange(null); setOpen(false); setSearch(""); }}
              className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 border border-dashed border-gray-200">
              — Позначити як новий інгредієнт
            </button>
            {displayList.map((ing: any) => {
              const isSuggested = suggestions.some((s: any) => s.id === ing.id);
              return (
                <button key={ing.id} onClick={() => { onChange(ing); setOpen(false); setSearch(""); }}
                  className={`w-full text-left text-[11px] px-2 py-1.5 rounded flex items-center justify-between gap-1 ${ing.id === value ? "bg-green-50 text-green-700 border border-green-200" : isSuggested ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : "hover:bg-gray-50 text-gray-700"}`}>
                  <span className="truncate">{ing.name}</span>
                  <span className="shrink-0 text-[9px] text-gray-400">{ing.unit}</span>
                </button>
              );
            })}
            {displayList.length === 0 && <div className="text-[11px] text-gray-400 px-2 py-2 text-center">Нічого не знайдено</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI Scan View ─────────────────────────────────────────────────────────────
function AiScanView({ suppliers, onBack }: { suppliers: Supplier[]; onBack: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<"input" | "reviewing" | "saving">("input");
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [inputText, setInputText] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState("image/jpeg");
  const [scanning, setScanning] = useState(false);
  const [parsed, setParsed] = useState<any>(null);
  const [supplierId, setSupplierId] = useState<string>("");
  const [paymentType, setPaymentType] = useState("unpaid");
  const [allIngredients, setAllIngredients] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api("/ingredients").then(j => setAllIngredients(j.ingredients || [])).catch(() => {});
  }, []);

  const handleImageSelect = async (file: File) => {
    setImageFile(file); setInputText(""); setImageMime(file.type || "image/jpeg");
    const b64 = await new Promise<string>(res => {
      const reader = new FileReader();
      reader.onload = () => res((reader.result as string).split(",")[1]);
      reader.readAsDataURL(file);
    });
    setImageBase64(b64);
  };

  const scan = async () => {
    const textToScan = inputMode === "voice" ? voiceTranscript : inputText;
    if (!textToScan && !imageBase64) { toast({ title: "Вставте текст, завантажте фото або продиктуйте накладну", variant: "destructive" }); return; }
    setScanning(true);
    try {
      const endpoint = imageBase64 ? "/receipts/ai-scan" : inputMode === "voice" ? "/receipts/ai-voice-receipt" : "/receipts/ai-scan";
      const body = imageBase64 ? { image_base64: imageBase64, image_mime: imageMime } : { text: textToScan };
      const j = await api(endpoint, { method: "POST", body: JSON.stringify(body) });
      const autoLinked = {
        ...j.parsed,
        items: (j.parsed?.items || []).map((item: any) => {
          if (item.is_new_ingredient && item.suggested_ingredient_id) {
            return { ...item, ingredient_id: item.suggested_ingredient_id, is_new_ingredient: false, suggestions: [] };
          }
          return item;
        }),
      };
      setParsed(autoLinked);
      if (j.parsed?.supplier_id) setSupplierId(String(j.parsed.supplier_id));
      setStep("reviewing");
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setScanning(false); }
  };

  const saveReceipt = async () => {
    if (!parsed) return;
    setStep("saving");
    try {
      let finalSupplierId: number | null = supplierId ? parseInt(supplierId) : null;
      if (!finalSupplierId && parsed.supplier_name) {
        try {
          const sr = await api("/suppliers", { method: "POST", body: JSON.stringify({ name: parsed.supplier_name, edrpou: parsed.supplier_edrpou || null }) });
          if (sr.supplier?.id) finalSupplierId = sr.supplier.id;
        } catch {}
      }
      const cr = await api("/receipts", { method: "POST", body: JSON.stringify({
        supplier_id: finalSupplierId, receipt_no: parsed.receipt_no, receipt_date: parsed.receipt_date,
        payment_type: paymentType,
        notes: inputMode === "voice" ? "Голосовий ввід (AI)" : imageBase64 ? "AI-сканування фото" : "AI-сканування тексту",
        invoice_image: imageBase64 || null,
      })});
      await api(`/receipts/${cr.receipt.id}/items`, { method: "PUT", body: JSON.stringify({ items: parsed.items.map((item: any) => ({ ...item, receipt_unit: item.receipt_unit || item.unit, conversion_factor: item.conversion_factor || 1 })) }) });
      const newCount = (parsed.items || []).filter((i: any) => i.is_new_ingredient).length;
      toast({ title: `Накладну збережено!${newCount > 0 ? ` ${newCount} нових інгредієнтів додано.` : ""}` });
      onBack();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); setStep("reviewing"); }
  };

  const updateItem = (idx: number, field: string, value: any) =>
    setParsed((p: any) => ({
      ...p,
      items: p.items.map((item: any, i: number) => {
        if (i !== idx) return item;
        if (field === "__link") return { ...item, ingredient_id: value.id, is_new_ingredient: false, suggestions: [], ...(value.unit ? { unit: value.unit } : {}) };
        if (field === "__unlink") return { ...item, ingredient_id: null, is_new_ingredient: true };
        return { ...item, [field]: value };
      }),
    }));

  const newCount = parsed ? (parsed.items || []).filter((i: any) => i.is_new_ingredient).length : 0;

  if (step === "input") return (
    <div className="max-w-2xl mx-auto space-y-4 p-5">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></button>
        <div>
          <h2 className="font-bold flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-500" /> AI-сканування накладної</h2>
          <p className="text-xs text-muted-foreground">Фото, текст або голос — AI розпізнає позиції автоматично</p>
        </div>
      </div>
      <div className="border rounded-xl p-5 space-y-4 bg-card">
        <div className="flex rounded-lg bg-muted p-1 gap-1">
          {([{ key: "text", icon: FileText, label: "Фото або текст" }, { key: "voice", icon: Mic, label: "Голосовий ввід" }] as const).map(tab => (
            <button key={tab.key} onClick={() => setInputMode(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${inputMode === tab.key ? "bg-background shadow-sm text-violet-700" : "text-muted-foreground hover:text-foreground"}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>
        {inputMode === "text" ? (
          <div className="space-y-3">
            <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-4 text-center cursor-pointer hover:border-violet-300 hover:bg-violet-50/30 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) handleImageSelect(f); }}>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }} />
              {imageFile ? (
                <div className="flex items-center justify-center gap-2 text-sm text-violet-700">
                  <ImageIcon className="w-4 h-4" />
                  <span className="font-medium">{imageFile.name}</span>
                  <button onClick={e => { e.stopPropagation(); setImageFile(null); setImageBase64(null); }} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-6 h-6 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Перетягніть фото накладної або натисніть для вибору</p>
                  <p className="text-xs text-muted-foreground/60">JPG, PNG, WebP</p>
                </div>
              )}
            </div>
            {!imageBase64 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">або вставте текст накладної:</p>
                <textarea value={inputText} onChange={e => setInputText(e.target.value)} rows={5}
                  placeholder="Молоко 3.2% — 10 л — 28 грн/л&#10;Масло вершкове — 2 кг — 180 грн/кг&#10;..."
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <VoiceMicButton onTranscript={t => setVoiceTranscript(t)} />
            {voiceTranscript && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-left">
                <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide mb-1">Розпізнаний текст</p>
                <p className="text-sm text-violet-900 italic">"{voiceTranscript}"</p>
              </div>
            )}
          </div>
        )}
        <div>
          <Label className="text-xs">Постачальник</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Визначить AI або оберіть вручну" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— без постачальника —</SelectItem>
              {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Тип оплати</Label>
          <Select value={paymentType} onValueChange={setPaymentType}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_TERMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button className="w-full gap-2 bg-violet-600 hover:bg-violet-700" onClick={scan} disabled={scanning || (!inputText && !imageBase64 && !voiceTranscript)}>
        {scanning ? <><Loader2 className="w-4 h-4 animate-spin" /> Сканую...</> : <><Sparkles className="w-4 h-4" /> Розпізнати накладну</>}
      </Button>
    </div>
  );

  if (step === "reviewing" && parsed) return (
    <div className="max-w-3xl mx-auto space-y-4 p-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setStep("input")} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></button>
        <div>
          <h2 className="font-bold">Перевірте розпізнану накладну</h2>
          <p className="text-xs text-muted-foreground">{parsed.items?.length || 0} позицій · {newCount > 0 ? `${newCount} нових інгредієнтів` : "всі прив'язані"}</p>
        </div>
        <Button className="ml-auto bg-green-600 hover:bg-green-700 gap-2" onClick={saveReceipt}>
          <CheckCircle2 className="w-4 h-4" /> Зберегти накладну
        </Button>
      </div>
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-xs text-muted-foreground uppercase tracking-wide">
              <th className="text-left px-3 py-2.5 font-medium">Позиція AI</th>
              <th className="text-left px-3 py-2.5 font-medium">Інгредієнт</th>
              <th className="text-right px-3 py-2.5 font-medium">К-сть</th>
              <th className="text-right px-3 py-2.5 font-medium">Ціна/од</th>
              <th className="text-right px-3 py-2.5 font-medium">Сума</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(parsed.items || []).map((item: any, idx: number) => (
              <tr key={idx} className={item.is_new_ingredient ? "bg-amber-50/50" : ""}>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-xs">{item.name}</div>
                  {item.original_name && item.original_name !== item.name && <div className="text-[10px] text-muted-foreground">{item.original_name}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <IngredientPicker value={item.ingredient_id || null} isNew={!!item.is_new_ingredient}
                    suggestions={item.suggestions || []} allIngredients={allIngredients}
                    onChange={ing => ing ? updateItem(idx, "__link", ing) : updateItem(idx, "__unlink", null)} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <input type="number" min="0" step="0.001" value={item.quantity || ""}
                      onChange={e => updateItem(idx, "quantity", parseFloat(e.target.value))}
                      className="w-16 border rounded px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-violet-300" />
                    <span className="text-[10px] text-muted-foreground">{item.unit}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <input type="number" min="0" step="0.01" value={item.price_per_unit || ""}
                    onChange={e => updateItem(idx, "price_per_unit", parseFloat(e.target.value))}
                    className="w-20 border rounded px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-violet-300" />
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">
                  {((item.quantity || 0) * (item.price_per_unit || 0)).toFixed(2)} ₴
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30">
            <tr>
              <td colSpan={4} className="px-3 py-2 font-semibold text-sm">Разом</td>
              <td className="px-3 py-2 text-right font-bold font-mono text-sm">
                {(parsed.items || []).reduce((s: number, i: any) => s + (i.quantity || 0) * (i.price_per_unit || 0), 0).toFixed(2)} ₴
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center h-48 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      <p className="text-sm text-muted-foreground">Зберігаємо накладну...</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Залишки
// ══════════════════════════════════════════════════════════════════════════════
function StockTab({ ingredients, suppliers, isLoading, onRefetch }: {
  ingredients: Ingredient[]; suppliers: Supplier[]; isLoading: boolean; onRefetch: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [ingDialog, setIngDialog] = useState<{ open: boolean; initial?: Partial<Ingredient> }>({ open: false });
  const [deleteIng, setDeleteIng] = useState<Ingredient | null>(null);

  const saveIng = useMutation({
    mutationFn: (data: any) => data.id ? api(`/ingredients/${data.id}`, { method: "PATCH", body: JSON.stringify(data) }) : api("/ingredients", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-ingredients"] }); setIngDialog({ open: false }); toast({ title: "Збережено" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });
  const deleteIng_ = useMutation({
    mutationFn: (id: number) => api(`/ingredients/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-ingredients"] }); setDeleteIng(null); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const allCategories = [...new Set(ingredients.map(i => i.category))].filter(Boolean).sort();
  const filtered = ingredients.filter(ing => {
    if (lowOnly && parseFloat(ing.current_stock) > parseFloat(ing.min_stock)) return false;
    if (categoryFilter !== "all" && ing.category !== categoryFilter) return false;
    if (search && !ing.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const lowCount = ingredients.filter(i => parseFloat(i.current_stock) <= parseFloat(i.min_stock)).length;
  const totalValue = ingredients.reduce((s, i) => s + parseFloat(i.current_stock) * parseFloat(i.cost_per_unit), 0);

  return (
    <div>
      <div className="px-5 py-4 border-b bg-background">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard icon={Boxes} label="Позиції на складі" value={ingredients.length} sub="активних інгредієнтів" />
          <StatCard icon={AlertTriangle} label="Низький залишок" value={lowCount} sub="потребують поповнення" alert={lowCount > 0} />
          <StatCard icon={BarChart3} label="Загальна вартість" value={`${totalValue.toLocaleString("uk", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`} sub="за собівартістю" />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="h-9 border rounded-md px-2 text-sm bg-background">
            <option value="all">Всі категорії</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button variant="outline" size="sm" className={lowOnly ? "bg-amber-50 border-amber-300 text-amber-700" : ""} onClick={() => setLowOnly(v => !v)}>
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Лише низький
          </Button>
          <Button size="sm" onClick={() => setIngDialog({ open: true })}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Додати
          </Button>
        </div>
      </div>
      <div className="overflow-auto">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="font-medium">Позицій не знайдено</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b sticky top-0">
              <tr className="text-[10px] text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-3 py-2.5 font-medium">Назва</th>
                <th className="text-left px-3 py-2.5 font-medium">Категорія</th>
                <th className="text-right px-3 py-2.5 font-medium">Залишок</th>
                <th className="text-right px-3 py-2.5 font-medium">Мінімум</th>
                <th className="text-right px-3 py-2.5 font-medium">Соб/од, ₴</th>
                <th className="text-right px-3 py-2.5 font-medium">Сума, ₴</th>
                <th className="text-left px-3 py-2.5 font-medium">Постачальник</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(ing => {
                const stock = parseFloat(ing.current_stock);
                const min = parseFloat(ing.min_stock);
                const low = stock <= min;
                const value = stock * parseFloat(ing.cost_per_unit);
                return (
                  <tr key={ing.id} className={`hover:bg-muted/30 ${low ? "bg-amber-50/50" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {low && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                        <span className="font-medium">{ing.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{ing.category}</td>
                    <td className={`px-3 py-2 text-right font-mono font-medium ${low ? "text-amber-700" : ""}`}>
                      {parseFloat(ing.current_stock).toLocaleString("uk")} {ing.unit}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {parseFloat(ing.min_stock).toLocaleString("uk")} {ing.unit}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{parseFloat(ing.cost_per_unit).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono font-medium">{value.toLocaleString("uk", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs truncate max-w-[120px]">{ing.supplier_name || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setIngDialog({ open: true, initial: ing })} className="p-1 hover:bg-muted rounded">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => setDeleteIng(ing)} className="p-1 hover:bg-destructive/10 rounded text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <IngredientDialog open={ingDialog.open} initial={ingDialog.initial} suppliers={suppliers}
        onClose={() => setIngDialog({ open: false })} onSave={saveIng.mutate} />
      <AlertDialog open={!!deleteIng} onOpenChange={v => !v && setDeleteIng(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити «{deleteIng?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Позиція буде деактивована. Прибудькові записи збережуться.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteIng && deleteIng_.mutate(deleteIng.id)}>Видалити</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Постачання (накладні)
// ══════════════════════════════════════════════════════════════════════════════
function ReceiptsTab({ receipts, suppliers, summary, isLoading }: {
  receipts: Receipt[]; suppliers: Supplier[]; summary: any; isLoading: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [showAiScan, setShowAiScan] = useState(false);

  const createReceipt = useMutation({
    mutationFn: async ({ header, items }: { header: any; items: ReceiptItem[] }) => {
      const { receipt } = await api("/receipts", { method: "POST", body: JSON.stringify({ ...header, supplier_id: header.supplier_id ? parseInt(header.supplier_id) : null }) });
      await api(`/receipts/${receipt.id}/items`, { method: "PUT", body: JSON.stringify({ items }) });
      return receipt;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-receipts"] }); setDialog(false); toast({ title: "Накладну збережено (чернетка)" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const confirmReceipt = useMutation({
    mutationFn: (id: number) => api(`/receipts/${id}/confirm`, { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["wh-receipts"] });
      qc.invalidateQueries({ queryKey: ["wh-ingredients"] });
      setConfirmId(null);
      toast({ title: `Накладну проведено. Оновлено ${data.summary?.length || 0} позицій` });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  if (showAiScan) {
    return <AiScanView suppliers={suppliers} onBack={() => { setShowAiScan(false); qc.invalidateQueries({ queryKey: ["wh-receipts"] }); }} />;
  }

  return (
    <div>
      <div className="px-5 py-4 border-b bg-background">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard icon={TruckIcon} label="Загальний борг" value={`${parseFloat(summary?.total_unpaid || 0).toLocaleString("uk")} ₴`} sub={`${summary?.count_unpaid || 0} накладних`} alert={parseFloat(summary?.total_unpaid || 0) > 0} />
          <StatCard icon={ArrowDownToLine} label="Готівка (всього)" value={`${parseFloat(summary?.total_cash || 0).toLocaleString("uk")} ₴`} sub="оплачено готівкою" />
          <StatCard icon={FileText} label="Безготівково" value={`${parseFloat(summary?.total_bank || 0).toLocaleString("uk")} ₴`} sub="банківський переказ" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowAiScan(true)} variant="outline" className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50">
            <Sparkles className="w-3.5 h-3.5" /> AI-сканування
          </Button>
          <Button size="sm" onClick={() => setDialog(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Нова накладна
          </Button>
        </div>
      </div>
      <div className="overflow-auto">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : receipts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <TruckIcon className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="font-medium">Накладних немає</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b sticky top-0">
              <tr className="text-[10px] text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-3 py-2.5 font-medium">Номер</th>
                <th className="text-left px-3 py-2.5 font-medium">Дата</th>
                <th className="text-left px-3 py-2.5 font-medium">Постачальник</th>
                <th className="text-center px-3 py-2.5 font-medium">Позицій</th>
                <th className="text-right px-3 py-2.5 font-medium">Сума</th>
                <th className="text-left px-3 py-2.5 font-medium">Оплата</th>
                <th className="text-left px-3 py-2.5 font-medium">Статус</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {receipts.map((r: Receipt) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-xs">{r.receipt_no || `#${r.id}`}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.receipt_date?.slice(0, 10)}</td>
                  <td className="px-3 py-2 font-medium truncate max-w-[140px]">{r.supplier_name || "—"}</td>
                  <td className="px-3 py-2 text-center">{r.item_count}</td>
                  <td className="px-3 py-2 text-right font-mono font-medium">{parseFloat(r.total_amount).toFixed(2)} ₴</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{PAYMENT_TERMS.find(p => p.value === r.payment_type)?.label || r.payment_type}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RECEIPT_STATUSES[r.status]?.color || "bg-muted"}`}>
                      {RECEIPT_STATUSES[r.status]?.label || r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.status === "draft" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
                        onClick={() => setConfirmId(r.id)}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Провести
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <AlertDialog open={!!confirmId} onOpenChange={v => !v && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Провести накладну?</AlertDialogTitle>
            <AlertDialogDescription>Залишки складу будуть оновлені. Цю дію не можна скасувати.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmId && confirmReceipt.mutate(confirmId)}>Провести</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Списання
// ══════════════════════════════════════════════════════════════════════════════
function WriteoffCreateDialog({ open, onClose, ingredients }: { open: boolean; onClose: () => void; ingredients: any[] }) {
  const [reason, setReason] = useState("spoilage");
  const [notes, setNotes] = useState("");
  const [writeoff_date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([{ ingredient_id: "", quantity: "", unit: "" }]);
  const { toast } = useToast();
  const qc = useQueryClient();

  function addItem() { setItems(i => [...i, { ingredient_id: "", quantity: "", unit: "" }]); }
  function removeItem(idx: number) { setItems(i => i.filter((_, j) => j !== idx)); }
  function setItem(idx: number, k: string, v: string) {
    setItems(items => items.map((item, j) => {
      if (j !== idx) return item;
      const updated = { ...item, [k]: v };
      if (k === "ingredient_id") { const ing = ingredients.find(i => String(i.id) === v); if (ing) updated.unit = ing.unit; }
      return updated;
    }));
  }
  function reset() { setReason("spoilage"); setNotes(""); setItems([{ ingredient_id: "", quantity: "", unit: "" }]); }

  const save = useMutation({
    mutationFn: () => api("/writeoffs", { method: "POST", body: JSON.stringify({
      writeoff_date, reason, notes,
      items: items.filter(i => i.ingredient_id && i.quantity).map(i => ({
        ingredient_id: parseInt(i.ingredient_id), quantity: parseFloat(i.quantity), unit: i.unit,
      })),
    })}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["writeoffs"] }); toast({ title: "Списання створено" }); onClose(); reset(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Нове списання</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Дата</Label><Input type="date" value={writeoff_date} onChange={e => setDate(e.target.value)} className="mt-1" /></div>
            <div>
              <Label>Причина</Label>
              <select value={reason} onChange={e => setReason(e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background">
                {WRITEOFF_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Позиції</Label>
              <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-3 h-3 mr-1" />Додати</Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const ing = ingredients.find(i => String(i.id) === item.ingredient_id);
                return (
                  <div key={idx} className="flex gap-2 items-start">
                    <select value={item.ingredient_id} onChange={e => setItem(idx, "ingredient_id", e.target.value)} className="flex-1 border rounded-md px-2 py-2 text-sm bg-background">
                      <option value="">Оберіть інгредієнт...</option>
                      {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <div className="flex items-center gap-1 w-32">
                      <Input type="number" min="0" step="0.001" value={item.quantity} onChange={e => setItem(idx, "quantity", e.target.value)} placeholder="К-сть" className="w-20 h-9" />
                      <span className="text-xs text-muted-foreground w-8 shrink-0">{ing?.unit || "—"}</span>
                    </div>
                    <button onClick={() => removeItem(idx)} className="mt-2 text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>
          </div>
          <div><Label>Коментар</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Необов'язково" className="mt-1" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Скасувати</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !items.some(i => i.ingredient_id && i.quantity)}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WriteoffDetailDialog({ id, open, onClose }: { id: number | null; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["writeoff-detail", id], queryFn: () => api(`/writeoffs/${id}`), enabled: !!id,
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useMutation({
    mutationFn: () => api(`/writeoffs/${id}/confirm`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["writeoffs"] }); qc.invalidateQueries({ queryKey: ["writeoff-detail", id] }); toast({ title: "Списання проведено. Залишки зменшено." }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });
  const wo = data?.writeoff;
  const items: any[] = data?.items || [];
  const total = items.reduce((s, i) => s + parseFloat(i.total_cost || "0"), 0);
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Списання #{id}</DialogTitle></DialogHeader>
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : wo ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Дата:</span> {wo.writeoff_date?.slice(0, 10)}</div>
              <div><span className="text-muted-foreground">Статус:</span> <StatusBadge s={wo.status} /></div>
              <div><span className="text-muted-foreground">Причина:</span> {reasonLabel(wo.reason)}</div>
              {wo.notes && <div><span className="text-muted-foreground">Коментар:</span> {wo.notes}</div>}
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/60"><tr className="text-xs text-muted-foreground"><th className="text-left px-3 py-2">Інгредієнт</th><th className="text-right px-3 py-2">К-сть</th><th className="text-right px-3 py-2">Сума</th></tr></thead>
                <tbody className="divide-y">{items.map(i => (<tr key={i.id}><td className="px-3 py-2">{i.ingredient_name}</td><td className="px-3 py-2 text-right">{parseFloat(i.quantity).toFixed(3)} {i.unit}</td><td className="px-3 py-2 text-right">{parseFloat(i.total_cost).toFixed(2)} ₴</td></tr>))}</tbody>
                <tfoot className="bg-muted/30"><tr><td colSpan={2} className="px-3 py-2 font-semibold">Разом</td><td className="px-3 py-2 text-right font-semibold">{total.toFixed(2)} ₴</td></tr></tfoot>
              </table>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Закрити</Button>
          {wo?.status === "draft" && (
            <Button onClick={() => confirm.mutate()} disabled={confirm.isPending} variant="destructive">
              {confirm.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />} Провести
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WriteoffsTab({ ingredients }: { ingredients: any[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["writeoffs"], queryFn: () => api("/writeoffs") });
  const writeoffs: any[] = (data?.writeoffs || []).filter((w: any) =>
    !search || reasonLabel(w.reason).toLowerCase().includes(search.toLowerCase()) || w.notes?.toLowerCase().includes(search.toLowerCase())
  );
  const totalDraft = writeoffs.filter(w => w.status === "draft").reduce((s, w) => s + parseFloat(w.total_amount || "0"), 0);
  const totalConfirmed = writeoffs.filter(w => w.status === "confirmed").reduce((s, w) => s + parseFloat(w.total_amount || "0"), 0);
  return (
    <div>
      <div className="px-5 py-4 border-b bg-background">
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-3">
            <div className="border rounded-lg px-3 py-1.5 text-sm bg-amber-50 border-amber-200"><span className="text-amber-600 font-medium">Чернетки: {totalDraft.toFixed(2)} ₴</span></div>
            <div className="border rounded-lg px-3 py-1.5 text-sm bg-green-50 border-green-200"><span className="text-green-700 font-medium">Проведено: {totalConfirmed.toFixed(2)} ₴</span></div>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Додати</Button>
        </div>
        <Input placeholder="Пошук за причиною, коментарем..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-sm max-w-xs" />
      </div>
      <div className="overflow-auto">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          : writeoffs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <PackageX className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Списань немає</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Дата</th>
                  <th className="text-left px-4 py-3 font-medium">Причина</th>
                  <th className="text-center px-4 py-3 font-medium">Позицій</th>
                  <th className="text-right px-4 py-3 font-medium">Сума</th>
                  <th className="text-left px-4 py-3 font-medium">Статус</th>
                  <th className="text-right px-4 py-3 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {writeoffs.map((w: any) => (
                  <tr key={w.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground">{w.writeoff_date ? format(new Date(w.writeoff_date), "dd MMM yyyy", { locale: uk }) : "—"}</td>
                    <td className="px-4 py-3 font-medium">{reasonLabel(w.reason)}</td>
                    <td className="px-4 py-3 text-center">{w.item_count}</td>
                    <td className="px-4 py-3 text-right font-mono">{parseFloat(w.total_amount || "0").toFixed(2)} ₴</td>
                    <td className="px-4 py-3"><StatusBadge s={w.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDetailId(w.id)} className="text-muted-foreground hover:text-primary p-1 rounded"><Eye className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      <WriteoffCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} ingredients={ingredients} />
      <WriteoffDetailDialog id={detailId} open={!!detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Переміщення
// ══════════════════════════════════════════════════════════════════════════════
function TransferCreateDialog({ open, onClose, ingredients }: { open: boolean; onClose: () => void; ingredients: any[] }) {
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ ingredient_id: "", name: "", quantity: "", unit: "", cost_per_unit: "" }]);
  const { toast } = useToast(); const qc = useQueryClient();

  function addItem() { setItems(i => [...i, { ingredient_id: "", name: "", quantity: "", unit: "", cost_per_unit: "" }]); }
  function removeItem(idx: number) { setItems(i => i.filter((_, j) => j !== idx)); }
  function setItem(idx: number, k: string, v: string) {
    setItems(items => items.map((item, j) => {
      if (j !== idx) return item;
      const updated = { ...item, [k]: v };
      if (k === "ingredient_id" && v) { const ing = ingredients.find(i => String(i.id) === v); if (ing) { updated.name = ing.name; updated.unit = ing.unit; updated.cost_per_unit = String(ing.cost_per_unit || "0"); } }
      return updated;
    }));
  }
  function reset() { setFrom(""); setTo(""); setNotes(""); setItems([{ ingredient_id: "", name: "", quantity: "", unit: "", cost_per_unit: "" }]); }

  const save = useMutation({
    mutationFn: () => api("/transfers", { method: "POST", body: JSON.stringify({
      from_location: from, to_location: to, transfer_date: date, notes,
      items: items.filter(i => i.name && i.quantity).map(i => ({ ingredient_id: i.ingredient_id ? parseInt(i.ingredient_id) : null, name: i.name, quantity: parseFloat(i.quantity), unit: i.unit || "кг", cost_per_unit: parseFloat(i.cost_per_unit || "0") })),
    })}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["transfers"] }); toast({ title: "Переміщення створено" }); onClose(); reset(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Нове переміщення</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1"><Label>Зі складу</Label><Input value={from} onChange={e => setFrom(e.target.value)} placeholder="Кухня, Бар..." className="mt-1" /></div>
            <ArrowRight className="w-5 h-5 text-muted-foreground mt-5 shrink-0" />
            <div className="flex-1"><Label>На склад</Label><Input value={to} onChange={e => setTo(e.target.value)} placeholder="Штат, Reception..." className="mt-1" /></div>
            <div className="w-32"><Label>Дата</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Позиції</Label>
              <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-3 h-3 mr-1" />Додати</Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <select value={item.ingredient_id} onChange={e => setItem(idx, "ingredient_id", e.target.value)} className="w-44 border rounded-md px-2 py-2 text-sm bg-background">
                    <option value="">Інгредієнт (опц.)</option>
                    {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  <Input value={item.name} onChange={e => setItem(idx, "name", e.target.value)} placeholder="Назва позиції" className="flex-1 h-9 text-sm" />
                  <Input type="number" min="0" step="0.001" value={item.quantity} onChange={e => setItem(idx, "quantity", e.target.value)} placeholder="К-сть" className="w-20 h-9 text-sm" />
                  <Input value={item.unit} onChange={e => setItem(idx, "unit", e.target.value)} placeholder="Од." className="w-14 h-9 text-sm" />
                  <Input type="number" min="0" step="0.01" value={item.cost_per_unit} onChange={e => setItem(idx, "cost_per_unit", e.target.value)} placeholder="Ціна" className="w-20 h-9 text-sm" />
                  <button onClick={() => removeItem(idx)} className="mt-2 text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
          <div><Label>Примітка</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Необов'язково" className="mt-1" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Скасувати</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !items.some(i => i.name && i.quantity)}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDetailDialog({ id, open, onClose }: { id: number | null; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["transfer-detail", id], queryFn: () => api(`/transfers/${id}`), enabled: !!id });
  const qc = useQueryClient(); const { toast } = useToast();
  const confirm = useMutation({
    mutationFn: () => api(`/transfers/${id}/confirm`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["transfers"] }); qc.invalidateQueries({ queryKey: ["transfer-detail", id] }); toast({ title: "Переміщення підтверджено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: () => api(`/transfers/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["transfers"] }); toast({ title: "Видалено" }); onClose(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });
  const tr = data?.transfer; const items: any[] = data?.items || [];
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Переміщення #{id}</DialogTitle></DialogHeader>
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : tr ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg text-sm">
              <span className="font-medium">{tr.from_location || "—"}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{tr.to_location || "—"}</span>
              <span className="ml-auto text-muted-foreground">{tr.transfer_date?.slice(0, 10)}</span>
            </div>
            <div className="flex items-center gap-3"><StatusBadge s={tr.status} />{tr.notes && <span className="text-sm text-muted-foreground">{tr.notes}</span>}</div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/60"><tr className="text-xs text-muted-foreground"><th className="text-left px-3 py-2">Позиція</th><th className="text-right px-3 py-2">К-сть</th><th className="text-right px-3 py-2">Сума</th></tr></thead>
                <tbody className="divide-y">{items.map(i => (<tr key={i.id}><td className="px-3 py-2">{i.name}</td><td className="px-3 py-2 text-right">{parseFloat(i.quantity).toFixed(3)} {i.unit}</td><td className="px-3 py-2 text-right">{parseFloat(i.total_cost || "0").toFixed(2)} ₴</td></tr>))}</tbody>
                <tfoot className="bg-muted/30"><tr><td colSpan={2} className="px-3 py-2 font-semibold">Разом</td><td className="px-3 py-2 text-right font-semibold">{parseFloat(tr.total_amount || "0").toFixed(2)} ₴</td></tr></tfoot>
              </table>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          {tr?.status === "draft" && <Button variant="ghost" size="sm" className="text-destructive mr-auto" onClick={() => del.mutate()} disabled={del.isPending}><Trash2 className="w-3.5 h-3.5 mr-1" /> Видалити</Button>}
          <Button variant="outline" onClick={onClose}>Закрити</Button>
          {tr?.status === "draft" && (
            <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
              {confirm.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />} Підтвердити
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransfersTab({ ingredients }: { ingredients: any[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["transfers"], queryFn: () => api("/transfers") });
  const transfers: any[] = data?.transfers || [];
  return (
    <div>
      <div className="px-5 py-4 border-b bg-background flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{transfers.length} переміщень</span>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-3.5 h-3.5 mr-1" />Додати</Button>
      </div>
      <div className="overflow-auto">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <ArrowRightLeft className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Переміщень немає</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Дата</th>
                  <th className="text-left px-4 py-3 font-medium">Звідки</th>
                  <th className="text-left px-4 py-3 font-medium">Куди</th>
                  <th className="text-center px-4 py-3 font-medium">Позицій</th>
                  <th className="text-right px-4 py-3 font-medium">Сума</th>
                  <th className="text-left px-4 py-3 font-medium">Статус</th>
                  <th className="text-right px-4 py-3 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transfers.map((t: any) => (
                  <tr key={t.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground">{t.transfer_date ? format(new Date(t.transfer_date), "dd MMM yyyy", { locale: uk }) : "—"}</td>
                    <td className="px-4 py-3 font-medium">{t.from_location || "—"}</td>
                    <td className="px-4 py-3 font-medium">{t.to_location || "—"}</td>
                    <td className="px-4 py-3 text-center">{t.item_count}</td>
                    <td className="px-4 py-3 text-right font-mono">{parseFloat(t.total_amount || "0").toFixed(2)} ₴</td>
                    <td className="px-4 py-3"><StatusBadge s={t.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDetailId(t.id)} className="text-muted-foreground hover:text-primary p-1 rounded"><Eye className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      <TransferCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} ingredients={ingredients} />
      <TransferDetailDialog id={detailId} open={!!detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Звіт за рухом
// ══════════════════════════════════════════════════════════════════════════════
const MOVEMENT_PRESETS = [
  { label: "7 днів", days: 7 }, { label: "14 днів", days: 14 },
  { label: "30 днів", days: 30 }, { label: "90 днів", days: 90 },
];

function MovementTab() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(subDays(new Date(), 7).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [applied, setApplied] = useState({ from: subDays(new Date(), 7).toISOString().slice(0, 10), to: today });
  const [search, setSearch] = useState(""); const [category, setCategory] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["movement-report", applied.from, applied.to],
    queryFn: () => api(`/movement-report?from=${applied.from}&to=${applied.to}`),
  });

  const rows: any[] = (data?.rows || []).filter((r: any) => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (category !== "all" && r.category !== category) return false;
    return true;
  });
  const categories = Array.from(new Set((data?.rows || []).map((r: any) => r.category))).sort() as string[];
  const totals = rows.reduce((acc, r) => ({ received: acc.received + r.received_amt, writeoff: acc.writeoff + r.writeoff_amt, closing: acc.closing + r.closing_amt }), { received: 0, writeoff: 0, closing: 0 });

  function applyDays(days: number) {
    const f = subDays(new Date(), days).toISOString().slice(0, 10);
    setFrom(f); setTo(today); setApplied({ from: f, to: today });
  }

  return (
    <div>
      <div className="px-5 py-4 border-b bg-background">
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <div className="flex gap-1">
            {MOVEMENT_PRESETS.map(p => (
              <button key={p.days} onClick={() => applyDays(p.days)}
                className={`px-3 py-1.5 rounded-md text-xs border font-medium transition-colors ${applied.from === subDays(new Date(), p.days).toISOString().slice(0, 10) && applied.to === today ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-muted"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 w-36 text-sm" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 w-36 text-sm" />
            <Button size="sm" className="h-8" onClick={() => setApplied({ from, to })}>Застосувати</Button>
          </div>
          <Input placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-36 text-sm" />
          <select value={category} onChange={e => setCategory(e.target.value)} className="h-8 border rounded-md px-2 text-sm bg-background">
            <option value="all">Всі категорії</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <div className="border rounded-lg px-4 py-2.5 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <div><div className="text-xs text-muted-foreground">Надходження</div><div className="font-bold text-green-700">{totals.received.toFixed(2)} ₴</div></div>
            </div>
            <div className="border rounded-lg px-4 py-2.5 flex items-center gap-3">
              <TrendingDown className="w-5 h-5 text-red-600" />
              <div><div className="text-xs text-muted-foreground">Списання</div><div className="font-bold text-red-700">{totals.writeoff.toFixed(2)} ₴</div></div>
            </div>
            <div className="border rounded-lg px-4 py-2.5 flex items-center gap-3">
              <Package2 className="w-5 h-5 text-indigo-600" />
              <div><div className="text-xs text-muted-foreground">Залишок на кінець</div><div className="font-bold text-indigo-700">{totals.closing.toFixed(2)} ₴</div></div>
            </div>
          </div>
        )}
      </div>
      <div className="overflow-auto">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BarChart2 className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Рухів немає за вказаний період</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-3 py-2.5 font-medium">Назва</th>
                  <th className="text-left px-3 py-2.5 font-medium">Категорія</th>
                  <th className="text-right px-3 py-2.5 font-medium">Поч. залишок</th>
                  <th className="text-right px-3 py-2.5 font-medium">Поч. сума</th>
                  <th className="text-right px-3 py-2.5 font-medium text-green-700">Надходж.</th>
                  <th className="text-right px-3 py-2.5 font-medium text-red-600">Витрати</th>
                  <th className="text-right px-3 py-2.5 font-medium">Кін. залишок</th>
                  <th className="text-right px-3 py-2.5 font-medium">Кін. сума</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium max-w-[160px] truncate">{r.name}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[100px]">{r.category}</td>
                    <td className="px-3 py-2 text-right font-mono"><span className={r.opening_qty < 0 ? "text-red-600" : ""}>{r.opening_qty.toFixed(3)}</span><span className="text-muted-foreground ml-0.5">{r.unit}</span></td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">{r.opening_amt.toFixed(2)} ₴</td>
                    <td className="px-3 py-2 text-right font-mono">{r.received_qty > 0 ? (<span className="text-green-700">{r.received_qty.toFixed(3)} {r.unit}<span className="block text-[10px] text-green-600">{r.received_amt.toFixed(2)} ₴</span></span>) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.writeoff_qty > 0 ? (<span className="text-red-600">{r.writeoff_qty.toFixed(3)} {r.unit}<span className="block text-[10px] text-red-500">{r.writeoff_amt.toFixed(2)} ₴</span></span>) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold"><span className={r.closing_qty < 0 ? "text-red-600" : ""}>{r.closing_qty.toFixed(3)}</span><span className="text-muted-foreground ml-0.5">{r.unit}</span></td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{r.closing_amt.toFixed(2)} ₴</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t font-semibold sticky bottom-0">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-xs">Разом ({rows.length} позицій)</td>
                  <td className="px-3 py-2 text-right text-green-700 font-mono text-xs">{totals.received.toFixed(2)} ₴</td>
                  <td className="px-3 py-2 text-right text-red-600 font-mono text-xs">{totals.writeoff.toFixed(2)} ₴</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right font-mono text-xs">{totals.closing.toFixed(2)} ₴</td>
                </tr>
              </tfoot>
            </table>
          )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Інвентаризація
// ══════════════════════════════════════════════════════════════════════════════
function InvVoiceMicButton({ onTranscript, onStop }: { onTranscript: (t: string) => void; onStop?: () => void }) {
  const [recording, setRecording] = useState(false);
  const recogRef = useRef<any>(null);
  const finalRef = useRef("");
  const toggle = () => {
    if (recording) { recogRef.current?.stop(); setRecording(false); onStop?.(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Браузер не підтримує голосовий ввід. Спробуйте Chrome."); return; }
    finalRef.current = "";
    const r = new SR();
    r.lang = "uk-UA"; r.continuous = true; r.interimResults = true;
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalRef.current += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      onTranscript(finalRef.current + interim);
    };
    r.onerror = () => { setRecording(false); onStop?.(); };
    r.onend = () => { setRecording(false); onStop?.(); };
    recogRef.current = r; r.start(); setRecording(true);
  };
  return (
    <button onClick={toggle} className={`rounded-full w-20 h-20 flex flex-col items-center justify-center gap-1 transition-all mx-auto ${recording ? "bg-red-500 text-white shadow-lg shadow-red-200 animate-pulse" : "bg-violet-100 text-violet-600 hover:bg-violet-200 hover:shadow-md"}`}>
      {recording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
      <span className="text-[10px] font-medium">{recording ? "Стоп" : "Говоріть"}</span>
    </button>
  );
}

function InvAiVoicePanel({ sessionId, onApply, onClose }: { sessionId: number; onApply: (items: Array<{ line_id: number; actual_qty: number }>) => void; onClose: () => void }) {
  const { toast } = useToast();
  const [transcript, setTranscript] = useState("");
  const [step, setStep] = useState<"record" | "preview">("record");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<any[]>([]);
  const [editQty, setEditQty] = useState<Record<number, string>>({});
  const confidenceColor = (c: string) => c === "high" ? "text-green-700 bg-green-50 border-green-200" : c === "medium" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-red-700 bg-red-50 border-red-200";
  const confidenceLabel = (c: string) => c === "high" ? "Точно" : c === "medium" ? "Можливо" : "Неточно";

  const parse = async () => {
    if (!transcript.trim()) return;
    setParsing(true);
    try {
      const res = await api("/ai-voice-inventory", { method: "POST", body: JSON.stringify({ text: transcript.trim(), session_id: sessionId }) });
      if (!res.items?.length) { toast({ title: "AI не розпізнав жодної позиції", variant: "destructive" }); return; }
      const init: Record<number, string> = {};
      res.items.forEach((item: any) => { init[item.line_id] = String(item.actual_qty); });
      setEditQty(init); setParsed(res.items); setStep("preview");
    } catch (e: any) { toast({ title: "Помилка AI", description: e.message, variant: "destructive" }); }
    finally { setParsing(false); }
  };

  const apply = () => {
    const items = parsed.map(item => ({ line_id: item.line_id, actual_qty: parseFloat(editQty[item.line_id] ?? String(item.actual_qty)) })).filter(i => !isNaN(i.actual_qty));
    onApply(items); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-500" /><div><h2 className="font-bold text-sm">AI Голосова Інвентаризація</h2><p className="text-xs text-muted-foreground">Диктуйте залишки вільним текстом</p></div></div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-auto">
          {step === "record" && (
            <div className="p-5 space-y-5">
              <div className="text-center space-y-3">
                <InvVoiceMicButton onTranscript={t => setTranscript(t)} onStop={() => {}} />
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">Натисніть мікрофон і диктуйте залишки. Наприклад:<br /><span className="italic">"молоко п'ять кілограмів, олія три літри"</span></p>
              </div>
              <div><Label className="text-xs text-muted-foreground">або введіть вручну</Label><textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={4} placeholder="Введіть залишки текстом..." className="mt-1 w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              {transcript.trim() && (<div className="bg-violet-50 border border-violet-200 rounded-lg p-3"><p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide mb-1">Розпізнаний текст</p><p className="text-sm text-violet-900 italic">"{transcript.trim()}"</p><button onClick={() => setTranscript("")} className="text-[10px] text-violet-400 hover:text-violet-600 mt-1">Очистити</button></div>)}
            </div>
          )}
          {step === "preview" && (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between"><p className="text-sm font-medium">AI розпізнав {parsed.length} позицій</p><button onClick={() => setStep("record")} className="text-xs text-muted-foreground hover:text-violet-600 underline">← Назад</button></div>
              <div className="space-y-2">
                {parsed.map(item => (
                  <div key={item.line_id} className="border rounded-lg p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{item.ingredient_name}</p><p className="text-xs text-muted-foreground">По системі: {item.system_qty?.toFixed(3)} {item.unit}</p></div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-medium ${confidenceColor(item.confidence)}`}>{confidenceLabel(item.confidence)}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Input type="number" min="0" step="0.001" value={editQty[item.line_id] ?? String(item.actual_qty)} onChange={e => setEditQty(q => ({ ...q, [item.line_id]: e.target.value }))} className="w-20 h-8 text-sm text-right" />
                      <span className="text-xs text-muted-foreground w-6 shrink-0">{item.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t flex gap-2 shrink-0">
          {step === "record" ? (
            <><Button variant="outline" onClick={onClose} className="flex-1">Скасувати</Button><Button onClick={parse} disabled={!transcript.trim() || parsing} className="flex-1 bg-violet-600 hover:bg-violet-700 gap-2">{parsing ? <><Loader2 className="w-4 h-4 animate-spin" /> AI обробляє...</> : <><Sparkles className="w-4 h-4" /> Розпізнати</>}</Button></>
          ) : (
            <><Button variant="outline" onClick={() => setStep("record")} className="flex-1">Повторити</Button><Button onClick={apply} className="flex-1 gap-2 bg-green-600 hover:bg-green-700"><Check className="w-4 h-4" /> Застосувати ({parsed.length})</Button></>
          )}
        </div>
      </div>
    </div>
  );
}

function InvSessionDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["inventory-session", id], queryFn: () => api(`/inventory/${id}`) });
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const { toast } = useToast(); const qc = useQueryClient();

  const session = data?.session; const lines: any[] = data?.lines || [];

  async function saveLines() {
    setSaving(true);
    try {
      const toSave = lines.map(l => ({ id: l.id, actual_qty: counts[l.id] !== undefined ? counts[l.id] : (l.actual_qty !== null ? String(l.actual_qty) : null) }));
      await api(`/inventory/${id}/lines`, { method: "PUT", body: JSON.stringify({ lines: toSave }) });
      toast({ title: "Збережено" }); refetch();
    } catch (e: any) { toast({ title: "Помилка", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  }

  const complete = useMutation({
    mutationFn: () => api(`/inventory/${id}/complete`, { method: "POST" }),
    onSuccess: (d) => { toast({ title: `Інвентаризацію проведено. Розбіжність: ${parseFloat(d.variance_total || 0).toFixed(2)} ₴` }); qc.invalidateQueries({ queryKey: ["inventory-sessions"] }); refetch(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  function applyVoiceItems(items: Array<{ line_id: number; actual_qty: number }>) {
    setCounts(prev => { const next = { ...prev }; for (const item of items) { next[item.line_id] = String(item.actual_qty); } return next; });
    toast({ title: `AI заповнив ${items.length} позицій`, description: "Перевірте значення і збережіть" });
  }

  const grouped: Record<string, any[]> = {};
  for (const l of lines) { const cat = l.category || "Без категорії"; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(l); }
  const counted = lines.filter(l => l.actual_qty !== null || counts[l.id] !== undefined).length;
  const variance = lines.reduce((s, l) => {
    const actual = counts[l.id] !== undefined ? parseFloat(counts[l.id] || "0") : parseFloat(l.actual_qty || l.system_qty || "0");
    return s + (actual - parseFloat(l.system_qty || "0")) * parseFloat(l.cost_per_unit || "0");
  }, 0);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col h-full relative">
      {showVoice && session?.status !== "completed" && <InvAiVoicePanel sessionId={id} onApply={applyVoiceItems} onClose={() => setShowVoice(false)} />}
      <div className="px-5 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground"><ChevronLeft className="w-5 h-5" /></button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold truncate">{session?.name}</h2>
            <p className="text-xs text-muted-foreground">{session?.date} · {counted}/{lines.length} підраховано</p>
          </div>
          <div className={`text-sm font-mono px-3 py-1 rounded-lg ${variance < 0 ? "bg-red-50 text-red-700" : variance > 0 ? "bg-green-50 text-green-700" : "bg-muted text-muted-foreground"}`}>
            {variance > 0 ? "+" : ""}{variance.toFixed(2)} ₴
          </div>
          {session?.status !== "completed" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowVoice(true)} className="h-8 gap-1.5 text-violet-600 border-violet-200 hover:bg-violet-50"><Mic className="w-3.5 h-3.5" /><span className="hidden sm:inline">AI</span></Button>
              <Button variant="outline" size="sm" onClick={saveLines} disabled={saving} className="h-8">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />} Зберегти</Button>
              <Button size="sm" onClick={() => { saveLines().then(() => complete.mutate()); }} disabled={complete.isPending} className="h-8">
                {complete.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />} Провести
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {Object.entries(grouped).map(([cat, catLines]) => (
          <div key={cat}>
            <div className="px-4 py-2 bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0">{cat}</div>
            {catLines.map(l => {
              const displayVal = counts[l.id] !== undefined ? counts[l.id] : (l.actual_qty !== null ? String(l.actual_qty) : "");
              const actualNum = displayVal !== "" ? parseFloat(displayVal) : null;
              const sysNum = parseFloat(l.system_qty || "0");
              const diff = actualNum !== null ? actualNum - sysNum : null;
              return (
                <div key={l.id} className={`flex items-center px-4 py-3 border-b hover:bg-muted/10 ${actualNum !== null ? "bg-white" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm truncate block">{l.ingredient_name}</span>
                    <div className="text-xs text-muted-foreground">По системі: {sysNum.toFixed(3)} {l.unit}</div>
                  </div>
                  <div className="w-28 flex items-center gap-1">
                    {session?.status !== "completed" ? (
                      <Input type="number" min="0" step="0.001" value={displayVal} onChange={e => setCounts(c => ({ ...c, [l.id]: e.target.value }))} placeholder={sysNum.toFixed(3)} className={`h-8 text-sm text-right ${counts[l.id] !== undefined ? "border-violet-300 bg-violet-50/30" : ""}`} />
                    ) : (
                      <span className="text-sm font-mono">{l.actual_qty !== null ? parseFloat(l.actual_qty).toFixed(3) : "—"}</span>
                    )}
                    <span className="text-xs text-muted-foreground w-8 shrink-0">{l.unit}</span>
                  </div>
                  {diff !== null && <div className={`w-20 text-right text-xs font-mono ml-2 ${diff < 0 ? "text-red-600" : diff > 0 ? "text-green-600" : "text-muted-foreground"}`}>{diff > 0 ? "+" : ""}{diff.toFixed(3)}</div>}
                </div>
              );
            })}
          </div>
        ))}
        {lines.length === 0 && <div className="flex flex-col items-center justify-center py-20 text-center"><ClipboardList className="w-10 h-10 text-muted-foreground mb-3" /><p className="font-medium">Немає позицій</p></div>}
      </div>
    </div>
  );
}

function InventoryTab() {
  const [detailId, setDetailId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const { toast } = useToast(); const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["inventory-sessions"], queryFn: () => api("/inventory"), enabled: !detailId });
  const create = useMutation({
    mutationFn: () => api("/inventory", { method: "POST", body: JSON.stringify({ name: newName, date: newDate }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory-sessions"] }); toast({ title: "Інвентаризацію створено." }); setCreateOpen(false); setNewName(""); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });
  const sessions: any[] = data?.sessions || [];

  if (detailId) return <div className="flex flex-col h-full"><InvSessionDetail id={detailId} onBack={() => setDetailId(null)} /></div>;

  return (
    <div>
      <div className="px-5 py-4 border-b bg-background flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{sessions.length} сесій</span>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-3.5 h-3.5 mr-1" />Нова інвентаризація</Button>
      </div>
      <div className="overflow-auto">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <ClipboardList className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Інвентаризацій немає</p>
              <Button className="mt-4" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" />Нова інвентаризація</Button>
            </div>
          ) : (
            <div className="divide-y">
              {sessions.map((s: any) => (
                <div key={s.id} className="flex items-center px-5 py-3 hover:bg-muted/20 cursor-pointer" onClick={() => setDetailId(s.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.date} · {s.item_count || 0} позицій</div>
                  </div>
                  <StatusBadge s={s.status} />
                  {s.variance_total !== null && s.variance_total !== undefined && (
                    <span className={`ml-3 text-sm font-mono ${parseFloat(s.variance_total) < 0 ? "text-red-600" : "text-green-600"}`}>{parseFloat(s.variance_total) > 0 ? "+" : ""}{parseFloat(s.variance_total).toFixed(2)} ₴</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />
                </div>
              ))}
            </div>
          )}
      </div>
      <Dialog open={createOpen} onOpenChange={v => { if (!v) setCreateOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Нова інвентаризація</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Назва</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Щотижнева, Місячна..." className="mt-1" autoFocus /></div>
            <div><Label>Дата</Label><Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Скасувати</Button>
            <Button onClick={() => create.mutate()} disabled={!newName.trim() || create.isPending}>
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Створити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Склади
// ══════════════════════════════════════════════════════════════════════════════
function WhlDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: any }) {
  const [name, setName] = useState(initial?.name || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const { toast } = useToast(); const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => initial?.id ? api(`/warehouses-list/${initial.id}`, { method: "PATCH", body: JSON.stringify({ name, address, notes }) }) : api("/warehouses-list", { method: "POST", body: JSON.stringify({ name, address, notes }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["warehouses-list"] }); toast({ title: initial?.id ? "Збережено" : "Склад додано" }); onClose(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати склад" : "Новий склад"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Назва *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Кухня, Бар, Штат..." className="mt-1" /></div>
          <div><Label>Адреса</Label><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Необов'язково" className="mt-1" /></div>
          <div><Label>Примітка</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Необов'язково" className="mt-1" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>{save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Зберегти</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WarehousesTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { toast } = useToast(); const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["warehouses-list"], queryFn: () => api("/warehouses-list") });
  const del = useMutation({
    mutationFn: (id: number) => api(`/warehouses-list/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["warehouses-list"] }); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });
  const warehouses: any[] = data?.warehouses || [];
  return (
    <div>
      <div className="px-5 py-4 border-b bg-background flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{warehouses.length} складів</span>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="w-3.5 h-3.5 mr-1" /> Додати</Button>
      </div>
      <div className="p-5">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          : warehouses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Warehouse className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Складів немає</p>
              <Button className="mt-4" onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Додати склад</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {warehouses.map((w: any) => (
                <div key={w.id} className="border rounded-xl p-4 bg-card hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center"><Warehouse className="w-4.5 h-4.5 text-slate-600" /></div>
                      <div>
                        <div className="font-semibold text-sm">{w.name}</div>
                        {w.address && <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {w.address}</div>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setEditing(w); setDialogOpen(true); }} className="p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => del.mutate(w.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  {w.notes && <p className="text-xs text-muted-foreground mt-3 pl-[46px]">{w.notes}</p>}
                </div>
              ))}
            </div>
          )}
      </div>
      <WhlDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} initial={editing} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Постачальники
// ══════════════════════════════════════════════════════════════════════════════
function SuppliersTab({ suppliers, isLoading }: { suppliers: Supplier[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; initial?: Supplier }>({ open: false });
  const [deleteS, setDeleteS] = useState<Supplier | null>(null);

  const save = useMutation({
    mutationFn: (data: any) => data.id ? api(`/suppliers/${data.id}`, { method: "PATCH", body: JSON.stringify(data) }) : api("/suppliers", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-suppliers"] }); setDialog({ open: false }); toast({ title: "Збережено" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api(`/suppliers/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-suppliers"] }); setDeleteS(null); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4 p-5">
      <div className="flex justify-between items-center">
        <div><h2 className="font-semibold">Постачальники</h2><p className="text-xs text-muted-foreground">{suppliers.length} активних</p></div>
        <Button size="sm" onClick={() => setDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Додати</Button>
      </div>
      <div className="grid gap-3">
        {isLoading ? <div className="text-center py-8 text-muted-foreground">Завантаження...</div>
          : suppliers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Постачальників ще немає</p>
              <Button size="sm" className="mt-2" onClick={() => setDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Додати першого</Button>
            </div>
          ) : suppliers.map(s => (
            <div key={s.id} className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{s.name}</span>
                    {s.is_vat_payer && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium shrink-0">ПДВ</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {s.contact_name && <span>👤 {s.contact_name}</span>}
                    {s.phone && <span>📞 {s.phone}</span>}
                    {s.email && <span>✉ {s.email}</span>}
                    {s.edrpou && <span>ЄДРПОУ: {s.edrpou}</span>}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>{PAYMENT_TERMS.find(p => p.value === s.payment_terms)?.label || s.payment_terms}</span>
                    <span>Доставка: {s.delivery_days} дн.</span>
                    <span>{s.ingredient_count || 0} інгредієнтів</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setDialog({ open: true, initial: s })} className="p-1.5 hover:bg-muted rounded"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                  <button onClick={() => setDeleteS(s)} className="p-1.5 hover:bg-destructive/10 rounded text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
      </div>
      <SupplierDialog open={dialog.open} initial={dialog.initial} onClose={() => setDialog({ open: false })} onSave={save.mutate} />
      <AlertDialog open={!!deleteS} onOpenChange={v => !v && setDeleteS(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити «{deleteS?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Постачальника буде деактивовано. Пов'язані накладні залишаться.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteS && del.mutate(deleteS.id)}>Видалити</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
type TabId = "stock" | "receipts" | "writeoffs" | "transfers" | "movement" | "inventory" | "warehouses" | "suppliers";

export default function FbWarehouse() {
  const [location] = useLocation();
  const initialTab: TabId =
    location.includes("/receipts") ? "receipts" :
    location.includes("/suppliers") ? "suppliers" :
    location.includes("/writeoffs") ? "writeoffs" :
    location.includes("/transfers") ? "transfers" :
    location.includes("/movement") ? "movement" :
    location.includes("/inventory") ? "inventory" :
    location.includes("/warehouses") ? "warehouses" : "stock";

  const [tab, setTab] = useState<TabId>(initialTab);

  const ingQ = useQuery({ queryKey: ["wh-ingredients"], queryFn: () => api("/ingredients") });
  const suppQ = useQuery({ queryKey: ["wh-suppliers"], queryFn: () => api("/suppliers") });
  const recQ = useQuery({ queryKey: ["wh-receipts"], queryFn: () => api("/receipts") });

  const ingredients: Ingredient[] = ingQ.data?.ingredients || [];
  const suppliers: Supplier[] = suppQ.data?.suppliers || [];
  const receipts: Receipt[] = recQ.data?.receipts || [];
  const summary = recQ.data?.summary || {};

  const lowCount = ingredients.filter(i => parseFloat(i.current_stock) <= parseFloat(i.min_stock)).length;
  const debtAmount = parseFloat(summary.total_unpaid || 0);

  const TABS: { id: TabId; label: string; icon: any; badge?: string | null }[] = [
    { id: "stock",      label: "Залишки",       icon: Boxes,         badge: lowCount > 0 ? String(lowCount) : null },
    { id: "receipts",   label: "Постачання",    icon: TruckIcon,     badge: debtAmount > 0 ? `${debtAmount.toLocaleString("uk")} ₴` : null },
    { id: "writeoffs",  label: "Списання",      icon: PackageX,      badge: null },
    { id: "transfers",  label: "Переміщення",   icon: ArrowRightLeft, badge: null },
    { id: "movement",   label: "Звіт за рухом", icon: BarChart2,     badge: null },
    { id: "inventory",  label: "Інвентаризація",icon: ClipboardList, badge: null },
    { id: "warehouses", label: "Склади",         icon: Warehouse,     badge: null },
    { id: "suppliers",  label: "Постачальники", icon: Users,         badge: null },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <Warehouse className="w-6 h-6 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-bold">Склад F&B</h1>
              <p className="text-xs text-muted-foreground">Управління запасами та постачанням</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-background shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                tab === t.id
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              <t.icon className="w-4 h-4 shrink-0" />
              {t.label}
              {t.badge != null && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tab === t.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "stock"      && <StockTab ingredients={ingredients} suppliers={suppliers} isLoading={ingQ.isLoading} onRefetch={ingQ.refetch} />}
          {tab === "receipts"   && <ReceiptsTab receipts={receipts} suppliers={suppliers} summary={summary} isLoading={recQ.isLoading} />}
          {tab === "writeoffs"  && <WriteoffsTab ingredients={ingredients} />}
          {tab === "transfers"  && <TransfersTab ingredients={ingredients} />}
          {tab === "movement"   && <MovementTab />}
          {tab === "inventory"  && <InventoryTab />}
          {tab === "warehouses" && <WarehousesTab />}
          {tab === "suppliers"  && <SuppliersTab suppliers={suppliers} isLoading={suppQ.isLoading} />}
        </div>
      </div>
    </AppLayout>
  );
}
