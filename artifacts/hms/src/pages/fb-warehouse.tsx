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
import {
  Plus, Pencil, Trash2, Search, AlertTriangle, Package,
  TruckIcon, Users, ClipboardList, ChevronDown, ChevronRight,
  ArrowDownToLine, ArrowUpFromLine, BarChart3, Boxes,
  Scan, FileText, CheckCircle2, XCircle, Clock, Filter,
  ShoppingCart, Warehouse, RefreshCw,
  Mic, Upload, ImageIcon, ArrowLeft, Sparkles, Info, Loader2,
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
const WRITEOFF_REASONS: Record<string, string> = {
  production: "Виробниче", staff_meal: "Харчування штату",
  tasting: "Дегустація", spoilage: "Псування", expired: "Прострочення",
  damage: "Пошкодження", other: "Інше",
};
const RECEIPT_STATUSES: Record<string, { label: string; color: string }> = {
  draft: { label: "Чернетка", color: "bg-muted text-muted-foreground" },
  confirmed: { label: "Проведено", color: "bg-green-100 text-green-800" },
  cancelled: { label: "Скасовано", color: "bg-red-100 text-red-800" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

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
            <div>
              <Label>Контактна особа</Label>
              <Input value={form.contact_name || ""} onChange={e => set("contact_name", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Телефон</Label>
              <Input value={form.phone || ""} onChange={e => set("phone", e.target.value)} className="mt-1" placeholder="+38067..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email || ""} onChange={e => set("email", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>ЄДРПОУ</Label>
              <Input value={form.edrpou || ""} onChange={e => set("edrpou", e.target.value)} className="mt-1" placeholder="12345678" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Умови оплати</Label>
              <Select value={form.payment_terms || "cash"} onValueChange={v => set("payment_terms", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_TERMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Строк доставки (дні)</Label>
              <Input type="number" min="0" value={form.delivery_days || 1} onChange={e => set("delivery_days", parseInt(e.target.value))} className="mt-1" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={!!form.is_vat_payer} onCheckedChange={v => set("is_vat_payer", v)} />
            <span className="text-sm">Платник ПДВ</span>
          </div>
          <div>
            <Label>Адреса / Примітки</Label>
            <Textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} className="mt-1 resize-none h-16" />
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
    if (!textToScan && !imageBase64) return toast({ title: "Вставте текст, завантажте фото або продиктуйте накладну", variant: "destructive" });
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
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {([{ key: "text", icon: FileText, label: "Фото або текст" }, { key: "voice", icon: Mic, label: "Голосовий ввід" }] as const).map(tab => (
            <button key={tab.key} onClick={() => setInputMode(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${inputMode === tab.key ? "bg-background shadow-sm text-violet-700" : "text-muted-foreground hover:text-foreground"}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {inputMode === "text" ? (
          <>
            <div className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-colors"
              onClick={() => fileRef.current?.click()}>
              {imageFile ? (
                <div className="flex items-center justify-center gap-2">
                  <ImageIcon className="w-5 h-5 text-violet-500" />
                  <span className="text-sm font-medium">{imageFile.name}</span>
                  <button className="text-muted-foreground hover:text-destructive ml-1" onClick={e => { e.stopPropagation(); setImageFile(null); setImageBase64(null); }}><XCircle className="w-4 h-4" /></button>
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground">Завантажити фото накладної</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">JPG, PNG, HEIC (до 10 МБ)</p>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleImageSelect(e.target.files[0]); }} />
            </div>
            {!imageFile && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-medium">АБО вставте текст</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <Textarea value={inputText} onChange={e => setInputText(e.target.value)} rows={6}
                  className="font-mono text-xs"
                  placeholder={"Видаткова накладна №123 від 10.04.2026\nПостачальник: ТОВ Агро-Плюс\n\n1. Куряча грудка 10 кг × 120 грн = 1200 грн\n2. Масло вершкове 5 кг × 180 грн = 900 грн"} />
              </>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="border rounded-xl p-6 text-center bg-violet-50/50">
              <VoiceMicButton onTranscript={t => setVoiceTranscript(t)} />
              <p className="text-xs text-violet-600 font-medium mt-3 mb-1">Натисніть мікрофон та продиктуйте накладну</p>
              <p className="text-xs text-muted-foreground">Приклад: "Накладна від Агро-Плюс, 10 квітня. Куряча грудка 10 кг по 120 гривень"</p>
            </div>
            {voiceTranscript && (
              <div className="bg-muted/50 border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground">Розпізнаний текст:</p>
                  <button className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setVoiceTranscript("")}>Очистити</button>
                </div>
                <p className="text-sm italic">"{voiceTranscript}"</p>
              </div>
            )}
          </div>
        )}

        <Button onClick={scan} disabled={scanning || (inputMode === "text" ? !inputText && !imageBase64 : !voiceTranscript)} className="w-full bg-violet-600 hover:bg-violet-700 gap-2">
          {scanning ? <><Loader2 className="w-4 h-4 animate-spin" /> AI обробляє...</> : <><Sparkles className="w-4 h-4" /> Розпізнати накладну</>}
        </Button>
      </div>

      <div className="border rounded-xl p-4 bg-blue-50/50 border-blue-100">
        <div className="flex gap-3 items-start">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-1">Як працює AI-розпізнавання:</p>
            <ul className="space-y-0.5 text-xs text-blue-600">
              <li>• Витягує номер, дату, постачальника і всі позиції</li>
              <li>• Зіставляє товари з базою інгредієнтів складу</li>
              <li>• Нові товари додаються автоматично</li>
              <li>• Ви перевіряєте результат перед підтвердженням</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  if ((step === "reviewing" || step === "saving") && parsed) return (
    <div className="max-w-3xl mx-auto space-y-4 p-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setStep("input")} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h2 className="font-bold">Перевірте результат AI</h2>
          <p className="text-xs text-muted-foreground">Відредагуйте якщо потрібно, потім збережіть</p>
        </div>
        {newCount > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">{newCount} нових інгредієнтів</Badge>}
      </div>

      <div className="border rounded-xl p-4 bg-card space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label className="text-xs">Номер накладної</Label>
            <Input value={parsed.receipt_no || ""} onChange={e => setParsed((p: any) => ({ ...p, receipt_no: e.target.value }))} className="h-8 text-sm mt-1" />
          </div>
          <div><Label className="text-xs">Дата</Label>
            <Input type="date" value={parsed.receipt_date || ""} onChange={e => setParsed((p: any) => ({ ...p, receipt_date: e.target.value }))} className="h-8 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Постачальник</Label>
            <Select value={supplierId || "_none"} onValueChange={v => setSupplierId(v === "_none" ? "" : v)}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Без постачальника" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">{parsed.supplier_name ? `⚡ ${parsed.supplier_name} (новий)` : "— Без постачальника —"}</SelectItem>
                {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Розрахунок</Label>
            <Select value={paymentType} onValueChange={setPaymentType}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr className="text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Назва в накладній</th>
              <th className="text-right px-3 py-2 font-medium w-16">К-сть</th>
              <th className="text-left px-3 py-2 font-medium w-16">Од.</th>
              <th className="text-right px-3 py-2 font-medium w-24">Ціна/од.</th>
              <th className="text-right px-3 py-2 font-medium w-24">Сума</th>
              <th className="px-3 py-2 font-medium">Прив'язка до складу</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(parsed.items || []).map((item: any, idx: number) => (
              <tr key={idx} className={item.is_new_ingredient ? "bg-amber-50/50" : ""}>
                <td className="px-3 py-2">
                  <Input value={item.name || ""} onChange={e => updateItem(idx, "name", e.target.value)} className="h-7 text-sm w-full" />
                </td>
                <td className="px-3 py-2">
                  <Input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)} className="h-7 text-sm w-16" />
                </td>
                <td className="px-3 py-2">
                  <Select value={item.unit || "кг"} onValueChange={v => updateItem(idx, "unit", v)}>
                    <SelectTrigger className="h-7 text-xs w-16"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Input type="number" value={item.price_per_unit} onChange={e => updateItem(idx, "price_per_unit", parseFloat(e.target.value) || 0)} className="h-7 text-sm w-24" />
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm font-medium">{((item.quantity || 0) * (item.price_per_unit || 0)).toFixed(0)} ₴</td>
                <td className="px-3 py-2">
                  <IngredientPicker value={item.ingredient_id || null} isNew={!!item.is_new_ingredient}
                    suggestions={item.suggestions || []} allIngredients={allIngredients}
                    onChange={ing => { if (ing) updateItem(idx, "__link", ing); else updateItem(idx, "__unlink", null); }} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 border-t">
              <td colSpan={4} className="px-3 py-2 text-sm font-semibold text-right text-muted-foreground">Загальна сума:</td>
              <td className="px-3 py-2 text-right font-bold">{(parsed.items || []).reduce((s: number, i: any) => s + (i.quantity || 0) * (i.price_per_unit || 0), 0).toFixed(0)} ₴</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep("input")} disabled={step === "saving"}>← Назад до вводу</Button>
        <Button onClick={saveReceipt} disabled={step === "saving"} className="bg-green-600 hover:bg-green-700 gap-2">
          {step === "saving" ? <><Loader2 className="w-4 h-4 animate-spin" /> Зберігаємо...</> : <><CheckCircle2 className="w-4 h-4" /> Зберегти накладну</>}
        </Button>
      </div>
    </div>
  );

  return null;
}

// ─── Receipt Dialog ────────────────────────────────────────────────────────────
function ReceiptDialog({ open, onClose, suppliers, onSave }: {
  open: boolean; onClose: () => void; suppliers: Supplier[];
  onSave: (header: any, items: ReceiptItem[]) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [header, setHeader] = useState({ supplier_id: "_none", receipt_no: "", receipt_date: today, payment_type: "unpaid", notes: "" });
  const [items, setItems] = useState<ReceiptItem[]>([{ name: "", quantity: 1, unit: "кг", price_per_unit: 0, vat_rate: 20 }]);
  const setH = (k: string, v: any) => setHeader(h => ({ ...h, [k]: v }));

  function addItem() { setItems(i => [...i, { name: "", quantity: 1, unit: "кг", price_per_unit: 0, vat_rate: 20 }]); }
  function removeItem(idx: number) { setItems(i => i.filter((_, j) => j !== idx)); }
  function setItem(idx: number, k: string, v: any) { setItems(i => i.map((item, j) => j === idx ? { ...item, [k]: v } : item)); }

  const total = items.reduce((s, i) => s + (i.quantity || 0) * (i.price_per_unit || 0), 0);
  const valid = items.some(i => i.name.trim() && i.quantity > 0);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Нова накладна (прихід)</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Постачальник</Label>
              <Select value={header.supplier_id} onValueChange={v => setH("supplier_id", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="— без постачальника —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— без постачальника —</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Дата надходження</Label>
              <Input type="date" value={header.receipt_date} onChange={e => setH("receipt_date", e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Номер накладної</Label>
              <Input value={header.receipt_no} onChange={e => setH("receipt_no", e.target.value)} className="mt-1" placeholder="№ 12345" />
            </div>
            <div>
              <Label>Оплата</Label>
              <Select value={header.payment_type} onValueChange={v => setH("payment_type", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_TERMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground grid grid-cols-[1fr_60px_60px_80px_30px] gap-2">
              <span>Товар / Інгредієнт</span><span>Кіл.</span><span>Од.</span><span>Ціна, ₴</span><span></span>
            </div>
            <div className="divide-y">
              {items.map((item, idx) => (
                <div key={idx} className="px-3 py-2 grid grid-cols-[1fr_60px_60px_80px_30px] gap-2 items-center">
                  <Input value={item.name} onChange={e => setItem(idx, "name", e.target.value)} className="h-7 text-sm" placeholder="Назва" />
                  <Input type="number" min="0" step="0.001" value={item.quantity} onChange={e => setItem(idx, "quantity", parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                  <Select value={item.unit} onValueChange={v => setItem(idx, "unit", v)}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" min="0" step="0.01" value={item.price_per_unit} onChange={e => setItem(idx, "price_per_unit", parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                  <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive"><XCircle className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={addItem} className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Додати рядок
              </Button>
              <div className="text-sm font-semibold">Разом: {total.toLocaleString("uk", { minimumFractionDigits: 2 })} ₴</div>
            </div>
          </div>

          <div>
            <Label>Примітки</Label>
            <Input value={header.notes} onChange={e => setH("notes", e.target.value)} className="mt-1" placeholder="Примітки до накладної" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => valid && onSave({ ...header, supplier_id: header.supplier_id === "_none" ? "" : header.supplier_id }, items)} disabled={!valid}>Зберегти накладну</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: Залишки ─────────────────────────────────────────────────────────────
function StockTab({ ingredients, suppliers, isLoading, onRefetch }: {
  ingredients: Ingredient[]; suppliers: Supplier[];
  isLoading: boolean; onRefetch: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [ingDialog, setIngDialog] = useState<{ open: boolean; initial?: Partial<Ingredient> }>({ open: false });
  const [deleteIng, setDeleteIng] = useState<Ingredient | null>(null);

  const saveIng = useMutation({
    mutationFn: (d: any) => d.id ? api(`/ingredients/${d.id}`, { method: "PATCH", body: JSON.stringify(d) }) : api("/ingredients", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["wh-ingredients"] }); setIngDialog({ open: false }); toast({ title: v.id ? "Оновлено" : "Додано" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });
  const deleteIng_ = useMutation({
    mutationFn: (id: number) => api(`/ingredients/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-ingredients"] }); setDeleteIng(null); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const allCats = Array.from(new Set(ingredients.map(i => i.category).filter(Boolean)));
  const lowCount = ingredients.filter(i => parseFloat(i.current_stock) <= parseFloat(i.min_stock)).length;
  const totalValue = ingredients.reduce((s, i) => s + parseFloat(i.current_stock) * parseFloat(i.cost_per_unit), 0);

  const filtered = ingredients.filter(i => {
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (catFilter !== "all" && i.category !== catFilter) return false;
    if (lowOnly && parseFloat(i.current_stock) > parseFloat(i.min_stock)) return false;
    return true;
  });

  return (
    <div className="space-y-4 p-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Boxes} label="Позицій на складі" value={ingredients.length} sub="активних інгредієнтів" />
        <StatCard icon={AlertTriangle} label="Низький залишок" value={lowCount} sub="потребують поповнення" alert={lowCount > 0} />
        <StatCard icon={BarChart3} label="Загальна вартість" value={`${totalValue.toLocaleString("uk", { minimumFractionDigits: 0 })} ₴`} sub="за собівартістю" />
      </div>

      {/* Controls */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук..." className="pl-8 h-8 text-sm" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі категорії</SelectItem>
            {allCats.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <button onClick={() => setLowOnly(v => !v)}
          className={`flex items-center gap-1.5 px-3 h-8 rounded-md border text-sm transition-colors ${lowOnly ? "bg-amber-100 border-amber-400 text-amber-800" : "hover:bg-muted"}`}>
          <AlertTriangle className="w-3.5 h-3.5" /> Лише низький
        </button>
        <Button size="sm" onClick={() => setIngDialog({ open: true })}>
          <Plus className="w-4 h-4 mr-1" /> Додати
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Назва</th>
              <th className="text-left px-3 py-2 font-medium">Категорія</th>
              <th className="text-right px-3 py-2 font-medium">Залишок</th>
              <th className="text-right px-3 py-2 font-medium">Мінімум</th>
              <th className="text-right px-3 py-2 font-medium">Соб/од, ₴</th>
              <th className="text-right px-3 py-2 font-medium">Сума, ₴</th>
              <th className="text-left px-3 py-2 font-medium">Постачальник</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Завантаження...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Нічого не знайдено</td></tr>
            ) : filtered.map(ing => {
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
                      <button onClick={() => setIngDialog({ open: true, initial: ing })} className="p-1 hover:bg-muted rounded" title="Редагувати">
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => setDeleteIng(ing)} className="p-1 hover:bg-destructive/10 rounded text-destructive" title="Видалити">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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

// ─── Tab: Накладні ────────────────────────────────────────────────────────────
function ReceiptsTab({ receipts, suppliers, summary, isLoading }: {
  receipts: Receipt[]; suppliers: Supplier[];
  summary: any; isLoading: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [showAiScan, setShowAiScan] = useState(false);

  if (showAiScan) {
    return <AiScanView suppliers={suppliers} onBack={() => { setShowAiScan(false); qc.invalidateQueries({ queryKey: ["wh-receipts"] }); }} />;
  }

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

  return (
    <div className="space-y-4 p-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={TruckIcon} label="Загальний борг" value={`${parseFloat(summary?.total_unpaid || 0).toLocaleString("uk")} ₴`} sub={`${summary?.count_unpaid || 0} накладних`} alert={parseFloat(summary?.total_unpaid || 0) > 0} />
        <StatCard icon={ArrowDownToLine} label="Готівка (всього)" value={`${parseFloat(summary?.total_cash || 0).toLocaleString("uk")} ₴`} sub="оплачено готівкою" />
        <StatCard icon={FileText} label="Безготівково" value={`${parseFloat(summary?.total_bank || 0).toLocaleString("uk")} ₴`} sub="банківський переказ" />
      </div>

      <div className="flex justify-between items-center">
        <h2 className="font-semibold">Накладні ({receipts.length})</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAiScan(true)} className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50">
            <Sparkles className="w-4 h-4" /> AI Скан накладної
          </Button>
          <Button size="sm" onClick={() => setDialog(true)}><Plus className="w-4 h-4 mr-1" /> Нова накладна</Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Дата</th>
              <th className="text-left px-3 py-2 font-medium">Номер</th>
              <th className="text-left px-3 py-2 font-medium">Постачальник</th>
              <th className="text-right px-3 py-2 font-medium">Позицій</th>
              <th className="text-right px-3 py-2 font-medium">Сума, ₴</th>
              <th className="text-left px-3 py-2 font-medium">Оплата</th>
              <th className="text-left px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Завантаження...</td></tr>
            ) : receipts.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Накладних ще немає</td></tr>
            ) : receipts.map(r => {
              const st = RECEIPT_STATUSES[r.status] || RECEIPT_STATUSES.draft;
              const payLabel = PAYMENT_TERMS.find(p => p.value === r.payment_type)?.label || r.payment_type;
              return (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-sm">{new Date(r.receipt_date).toLocaleDateString("uk")}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.receipt_no || `#${r.id}`}</td>
                  <td className="px-3 py-2 max-w-[160px] truncate">{r.supplier_name || "—"}</td>
                  <td className="px-3 py-2 text-right">{r.item_count || 0}</td>
                  <td className="px-3 py-2 text-right font-mono font-medium">{parseFloat(r.total_amount || "0").toLocaleString("uk", { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${r.payment_type === "unpaid" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>
                      {payLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${st.color}`}>{st.label}</span>
                  </td>
                  <td className="px-3 py-2">
                    {r.status === "draft" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-green-700 hover:bg-green-50"
                        onClick={() => setConfirmId(r.id)}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Провести
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ReceiptDialog open={dialog} onClose={() => setDialog(false)} suppliers={suppliers}
        onSave={(header, items) => createReceipt.mutate({ header, items })} />

      <AlertDialog open={!!confirmId} onOpenChange={v => !v && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Провести накладну?</AlertDialogTitle>
            <AlertDialogDescription>Залишки інгредієнтів на складі будуть збільшені. Дія незворотна.</AlertDialogDescription>
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

// ─── Tab: Постачальники ───────────────────────────────────────────────────────
function SuppliersTab({ suppliers, isLoading }: { suppliers: Supplier[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; initial?: Partial<Supplier> }>({ open: false });
  const [deleteS, setDeleteS] = useState<Supplier | null>(null);

  const save = useMutation({
    mutationFn: (d: any) => d.id ? api(`/suppliers/${d.id}`, { method: "PATCH", body: JSON.stringify(d) }) : api("/suppliers", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["wh-suppliers"] }); setDialog({ open: false }); toast({ title: v.id ? "Оновлено" : "Додано" }); },
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
        <div>
          <h2 className="font-semibold">Постачальники</h2>
          <p className="text-xs text-muted-foreground">{suppliers.length} активних</p>
        </div>
        <Button size="sm" onClick={() => setDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Додати</Button>
      </div>

      <div className="grid gap-3">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Завантаження...</div>
        ) : suppliers.length === 0 ? (
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
                <button onClick={() => setDialog({ open: true, initial: s })} className="p-1.5 hover:bg-muted rounded" title="Редагувати">
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </button>
                <button onClick={() => setDeleteS(s)} className="p-1.5 hover:bg-destructive/10 rounded text-destructive" title="Видалити">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <SupplierDialog open={dialog.open} initial={dialog.initial}
        onClose={() => setDialog({ open: false })} onSave={save.mutate} />
      <AlertDialog open={!!deleteS} onOpenChange={v => !v && setDeleteS(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити «{deleteS?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Постачальника буде деактивовано. Пов'язані накладні залишаться.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteS && del.mutate(deleteS.id)}>Видалити</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function FbWarehouse() {
  const [location] = useLocation();
  const initialTab: "stock" | "receipts" | "suppliers" =
    location.includes("/receipts") ? "receipts" :
    location.includes("/suppliers") ? "suppliers" : "stock";
  const [tab, setTab] = useState<"stock" | "receipts" | "suppliers">(initialTab);

  const { data: ingData, isLoading: ingLoading, refetch: refetchIng } = useQuery({
    queryKey: ["wh-ingredients"], queryFn: () => api("/ingredients"),
  });
  const { data: suppData, isLoading: suppLoading } = useQuery({
    queryKey: ["wh-suppliers"], queryFn: () => api("/suppliers"),
  });
  const { data: receiptData, isLoading: receiptLoading } = useQuery({
    queryKey: ["wh-receipts"], queryFn: () => api("/receipts"),
  });

  const ingredients: Ingredient[] = ingData?.ingredients || [];
  const suppliers: Supplier[] = suppData?.suppliers || [];
  const receipts: Receipt[] = receiptData?.receipts || [];
  const summary = receiptData?.summary || {};

  const lowCount = ingredients.filter(i => parseFloat(i.current_stock) <= parseFloat(i.min_stock)).length;
  const debtAmount = parseFloat(summary.total_unpaid || 0);

  const TABS = [
    { id: "stock" as const, label: "Залишки", icon: Boxes, badge: lowCount > 0 ? lowCount : null },
    { id: "receipts" as const, label: "Прихід товару", icon: TruckIcon, badge: debtAmount > 0 ? `${debtAmount.toLocaleString("uk")} ₴` : null },
    { id: "suppliers" as const, label: "Постачальники", icon: Users, badge: null },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <Warehouse className="w-6 h-6 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-bold">Склад</h1>
              <p className="text-xs text-muted-foreground">Залишки, прихід товарів, постачальники</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-background shrink-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.badge !== null && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tab === t.id ? "bg-primary/10 text-primary" : "bg-muted"}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "stock" && <StockTab ingredients={ingredients} suppliers={suppliers} isLoading={ingLoading} onRefetch={refetchIng} />}
          {tab === "receipts" && <ReceiptsTab receipts={receipts} suppliers={suppliers} summary={summary} isLoading={receiptLoading} />}
          {tab === "suppliers" && <SuppliersTab suppliers={suppliers} isLoading={suppLoading} />}
        </div>
      </div>
    </AppLayout>
  );
}
