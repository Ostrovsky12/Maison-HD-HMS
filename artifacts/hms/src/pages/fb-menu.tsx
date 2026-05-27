import { useState, useRef, useEffect, useCallback } from "react";
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
  Plus, Pencil, Trash2, Search, Upload, X, Image,
  Leaf, Star, Wine, AlertTriangle, ChefHat, Clock,
  Eye, EyeOff, GripVertical,
  Layers, Package, Filter,
  ChevronRight, ChevronDown, FolderPlus, Sliders,
  Printer,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: number;
  name: string;
  emoji: string;
  sortOrder: number;
  isActive: boolean;
  color?: string;
  description?: string;
  parent_id?: number | null;
  station?: string | null;
}

interface TechCardLine {
  ingredient_id?: number | null;
  name: string;
  brutto: number;
  waste_pct: number;
  unit: string;
  cost_per_unit: number;
}

interface ModifierOption {
  id?: number;
  name: string;
  price_delta: number;
  sort_order: number;
  is_available: boolean;
  tech_card?: TechCardLine[] | null;
}

interface ModifierGroup {
  id?: number;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  options: ModifierOption[];
}

interface Item {
  id: number;
  categoryId: number;
  categoryName: string;
  categoryEmoji: string;
  name: string;
  description?: string;
  price: string;
  price_happy?: string;
  cookMinutes: number;
  isAvailable: boolean;
  isPopular: boolean;
  isVegetarian: boolean;
  is_alcohol: boolean;
  is_stop_list: boolean;
  allergens?: string[];
  tags?: string[];
  image_url?: string;
  item_type: "dish" | "goods" | "service";
  ingredient_id?: number | null;
  ingredient_name?: string;
  legal_entity_id?: number | null;
  vat_rate: number;
  tax_group_id?: number;
  uktzed_code?: string;
  excise_code?: string;
  station: string;
  tech_card?: TechCardLine[];
  sortOrder: number;
}

interface TaxGroup {
  id: number;
  name: string;
  code: string;
  rate: number;
  is_excise: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLERGENS = [
  { key: "gluten", label: "Глютен" },
  { key: "dairy", label: "Молоко" },
  { key: "eggs", label: "Яйця" },
  { key: "nuts", label: "Горіхи" },
  { key: "peanuts", label: "Арахіс" },
  { key: "fish", label: "Риба" },
  { key: "shellfish", label: "Морепродукти" },
  { key: "soy", label: "Соя" },
  { key: "celery", label: "Селера" },
  { key: "mustard", label: "Гірчиця" },
  { key: "sesame", label: "Кунжут" },
  { key: "sulphites", label: "Сульфіти" },
];

const ITEM_STATIONS = [
  { value: "kitchen_general", label: "Кухня (загальна)" },
  { value: "kitchen_cold", label: "Холодний цех" },
  { value: "kitchen_grill", label: "Гриль" },
  { value: "bar", label: "Бар" },
  { value: "pastry", label: "Кондитерська" },
];

const STATION_TYPES = [
  { value: "kitchen", label: "Кухня", emoji: "🍽" },
  { value: "bar", label: "Бар", emoji: "🍷" },
  { value: "other_services", label: "Послуги", emoji: "🛎" },
];

const CATEGORY_EMOJIS = ["🍳","🍲","🍖","🥗","🍰","🥤","🍸","🍕","🍣","🍜","🥩","🥚","🥞","🍔","🌮","🍝","🥘","🍱","🍛","🫕","🍷","🍺","☕","🧁","🥐","🥙","🌯","🥗","🍤","🦞","🛎","🛏","🎯","🎪"];

// ─── API helpers ──────────────────────────────────────────────────────────────

const API = "";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
  return r.json();
}

async function apiRequest(method: string, path: string, body?: any) {
  return apiFetch(path, { method, body: body !== undefined ? JSON.stringify(body) : undefined });
}

async function uploadPhoto(file: File): Promise<string> {
  const { uploadURL, objectPath } = await apiRequest("POST", "/storage/uploads/request-url", {}) as any;
  await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  return objectPath as string;
}

function imgSrc(objectPath?: string) {
  if (!objectPath) return "";
  if (objectPath.startsWith("http")) return objectPath;
  return `${API}/storage/public-objects/${objectPath}`;
}

// Derive item station from category's parent station
function deriveItemStation(cat?: Category, allCats?: Category[]): string | null {
  if (!cat) return null;
  const parentStation = cat.station || (allCats?.find(c => c.id === cat.parent_id)?.station);
  if (!parentStation) return null;
  return parentStation === "bar" ? "bar" : "kitchen_general";
}

// ─── Category Dialog ──────────────────────────────────────────────────────────

function CategoryDialog({
  open, onClose, initial, parentId, onSave,
}: {
  open: boolean; onClose: () => void;
  initial?: Partial<Category>;
  parentId?: number | null;
  onSave: (data: Partial<Category>) => void;
}) {
  const isSubcat = parentId != null || (initial?.parent_id != null);
  const defaultEmoji = isSubcat ? "🍽" : (STATION_TYPES[0].emoji);
  const [form, setForm] = useState<Partial<Category>>(initial || { emoji: defaultEmoji, name: "", isActive: true });

  useEffect(() => {
    if (open) {
      if (initial) setForm(initial);
      else setForm({ emoji: defaultEmoji, name: "", isActive: true, parent_id: parentId ?? null, station: isSubcat ? undefined : "kitchen" });
    }
  }, [open, initial?.id, parentId]);

  const title = initial?.id
    ? (isSubcat ? "Редагувати групу" : "Редагувати категорію")
    : (isSubcat ? "Нова група" : "Нова категорія");

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Емоджі</Label>
            <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
              {CATEGORY_EMOJIS.map(e => (
                <button key={e} onClick={() => setForm(f => ({ ...f, emoji: e }))}
                  className={`text-xl px-1 rounded hover:bg-muted ${form.emoji === e ? "bg-muted ring-1 ring-primary" : ""}`}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <Label>Назва *</Label>
            <Input value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1"
              placeholder={isSubcat ? "Салати, Перші страви..." : "Кухня, Бар..."} autoFocus />
          </div>
          {!isSubcat && (
            <div>
              <Label>Тип станції</Label>
              <Select value={form.station || "kitchen"} onValueChange={v => setForm(f => ({ ...f, station: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATION_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.emoji} {s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Визначає до якого принтера надходять замовлення</p>
            </div>
          )}
          {!isSubcat && (
            <div>
              <Label>Опис (необов'язково)</Label>
              <Input value={form.description || ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={!!form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
            <span className="text-sm">Активна</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => { if (form.name?.trim()) onSave({ ...form, parent_id: parentId ?? form.parent_id ?? null }); }} disabled={!form.name?.trim()}>Зберегти</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Photo Uploader ────────────────────────────────────────────────────────────

function PhotoUploader({ value, onChange }: { value?: string; onChange: (path: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: "Файл задто великий (макс 10 МБ)", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const path = await uploadPhoto(file);
      onChange(path);
      toast({ title: "Фото завантажено" });
    } catch {
      toast({ title: "Помилка завантаження фото", variant: "destructive" });
    } finally { setUploading(false); if (ref.current) ref.current.value = ""; }
  }

  const src = imgSrc(value);

  return (
    <div className="space-y-2">
      <Label>Фото страви</Label>
      <div className="relative border-2 border-dashed border-muted-foreground/25 rounded-lg overflow-hidden bg-muted/10 hover:bg-muted/20 transition-colors">
        {src ? (
          <div className="relative">
            <img src={src} alt="Фото страви" className="w-full h-40 object-cover rounded-lg" />
            <button onClick={() => onChange(null)}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button onClick={() => ref.current?.click()} disabled={uploading}
            className="flex flex-col items-center justify-center w-full h-32 gap-2 text-muted-foreground">
            {uploading ? (
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            ) : (
              <>
                <Upload className="w-6 h-6" />
                <span className="text-sm">Натисніть щоб завантажити фото</span>
                <span className="text-xs">JPG, PNG, WebP — до 10 МБ</span>
              </>
            )}
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
      {!src && (
        <Button variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={uploading} className="w-full">
          <Upload className="w-3.5 h-3.5 mr-1" /> {uploading ? "Завантаження..." : "Обрати фото"}
        </Button>
      )}
    </div>
  );
}

// ─── Cost helpers ──────────────────────────────────────────────────────────────

function warehouseIngToTechUnit(ing: any): { unit: string; cost_per_unit: number } {
  const warehouseUnit = (ing.unit || "кг").trim();
  const costPerWH = parseFloat(ing.cost_per_unit || "0");
  const map: Record<string, [string, number]> = {
    "кг": ["г",  costPerWH / 1000],
    "г":  ["г",  costPerWH],
    "л":  ["мл", costPerWH / 1000],
    "мл": ["мл", costPerWH],
    "шт": ["шт", costPerWH],
  };
  const [unit, cost] = map[warehouseUnit] || ["г", costPerWH / 1000];
  return { unit, cost_per_unit: cost };
}

function computeTechCardCost(techCard?: TechCardLine[]): number {
  return (techCard || []).reduce((sum, l) => {
    const netto = (l.brutto || 0) * (1 - (l.waste_pct || 0) / 100);
    return sum + netto * (l.cost_per_unit || 0);
  }, 0);
}

// ─── Ingredient search input ───────────────────────────────────────────────────

function IngSearchInput({ name, onSelect, allIngredients }: {
  name: string;
  allIngredients: any[];
  onSelect: (name: string, ing: any | null) => void;
}) {
  const [search, setSearch] = useState(name);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setSearch(name); }, [name]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = search.trim().length >= 1
    ? allIngredients.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10)
    : [];

  return (
    <div className="relative flex-1" ref={ref}>
      <Input
        value={search}
        onChange={e => { setSearch(e.target.value); onSelect(e.target.value, null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Назва або пошук зі складу..."
        className="h-8 text-sm"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 bg-background border rounded-lg shadow-xl top-full mt-0.5 left-0 w-80 max-h-52 overflow-y-auto">
          {filtered.map(ing => {
            const { unit, cost_per_unit } = warehouseIngToTechUnit(ing);
            return (
              <button key={ing.id}
                className="w-full text-left text-xs px-3 py-2 hover:bg-muted flex items-center justify-between gap-2 border-b last:border-b-0"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onSelect(ing.name, ing); setSearch(ing.name); setOpen(false); }}>
                <span className="font-medium">{ing.name}</span>
                <span className="text-muted-foreground shrink-0 text-[10px]">
                  {unit} · {cost_per_unit > 0 ? `${cost_per_unit.toFixed(4)} ₴/${unit}` : "ціна невідома"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Calculation card printer ──────────────────────────────────────────────────

function printCalcCard(itemName: string, categoryName: string, price: number, lines: TechCardLine[]) {
  const totalCost = computeTechCardCost(lines);
  const foodcost = price > 0 ? (totalCost / price) * 100 : 0;
  const margin = price > 0 ? price - totalCost : 0;
  const date = new Date().toLocaleDateString("uk-UA");

  const rows = lines.map(l => {
    const netto = (l.brutto || 0) * (1 - (l.waste_pct || 0) / 100);
    const cost = netto * (l.cost_per_unit || 0);
    return `<tr>
      <td>${l.name || "—"}</td>
      <td class="num">${(l.brutto || 0).toFixed(1)}</td>
      <td class="num">${l.unit}</td>
      <td class="num">${(l.waste_pct || 0).toFixed(1)}</td>
      <td class="num">${netto.toFixed(1)}</td>
      <td class="num">${l.cost_per_unit > 0 ? l.cost_per_unit.toFixed(4) : "—"}</td>
      <td class="num">${cost > 0 ? cost.toFixed(2) : "—"}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8">
  <title>Калькуляційна карта — ${itemName}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;margin:20mm;color:#000}
    h1{font-size:16px;text-align:center;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
    .subtitle{text-align:center;font-size:11px;color:#555;margin-bottom:16px}
    .meta{display:flex;justify-content:space-between;margin-bottom:12px;font-size:11px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#f0f0f0;border:1px solid #aaa;padding:5px 6px;font-size:10px;text-transform:uppercase}
    td{border:1px solid #bbb;padding:4px 6px}
    .num{text-align:right}
    .totals{margin-top:12px;border-top:2px solid #000;padding-top:10px}
    .totals table{width:320px;margin-left:auto}
    .totals td{border:none;padding:3px 8px;font-size:12px}
    .totals .lbl{font-weight:600;color:#333}
    .totals .val{text-align:right;font-weight:700}
    .fc-ok{color:#16a34a} .fc-warn{color:#d97706} .fc-bad{color:#dc2626}
    .sigs{margin-top:24px;display:flex;justify-content:space-between;font-size:11px}
    .sig-line{border-top:1px solid #000;margin-top:20px;width:160px;text-align:center;padding-top:3px}
    @media print{body{margin:10mm}}
  </style></head><body>
  <h1>Калькуляційна карта</h1>
  <div class="subtitle">Технологічна собівартість страви</div>
  <div class="meta">
    <span><b>Страва:</b> ${itemName}</span>
    <span><b>Категорія:</b> ${categoryName || "—"}</span>
    <span><b>Дата:</b> ${date}</span>
  </div>
  <table>
    <thead><tr>
      <th>Найменування інгредієнта</th>
      <th>Брутто</th>
      <th>Од.</th>
      <th>Відх,%</th>
      <th>Нетто</th>
      <th>Ціна грн/од</th>
      <th>Сума, грн</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <table>
      <tr><td class="lbl">Собівартість (1 порція):</td><td class="val">${totalCost.toFixed(2)} грн</td></tr>
      <tr><td class="lbl">Ціна продажу:</td><td class="val">${price > 0 ? price.toFixed(2) + " грн" : "—"}</td></tr>
      <tr><td class="lbl">Маржа:</td><td class="val">${price > 0 ? margin.toFixed(2) + " грн" : "—"}</td></tr>
      <tr><td class="lbl">Фудкост:</td>
        <td class="val ${foodcost > 35 ? "fc-bad" : foodcost > 25 ? "fc-warn" : "fc-ok"}">${price > 0 ? foodcost.toFixed(1) + "%" : "—"}</td></tr>
    </table>
  </div>
  <div class="sigs">
    <div><div class="sig-line">Калькулятор</div></div>
    <div><div class="sig-line">Завідувач виробництва</div></div>
    <div><div class="sig-line">Бухгалтер</div></div>
  </div>
  <script>window.onload=()=>{window.print();}</script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── Tech Card Editor ──────────────────────────────────────────────────────────

function TechCardEditor({ value, onChange, itemPrice, itemName, categoryName }: {
  value: TechCardLine[];
  onChange: (v: TechCardLine[]) => void;
  itemPrice?: string;
  itemName?: string;
  categoryName?: string;
}) {
  const { data } = useQuery({
    queryKey: ["wh-ingredients-tc"],
    queryFn: () => apiFetch("/api/fb/warehouse/ingredients"),
  });
  const allIngredients: any[] = (data as any)?.ingredients || [];

  function add() {
    onChange([...value, { ingredient_id: null, name: "", brutto: 100, waste_pct: 0, unit: "г", cost_per_unit: 0 }]);
  }
  function remove(i: number) { onChange(value.filter((_, idx) => idx !== i)); }
  function update(i: number, patch: Partial<TechCardLine>) {
    onChange(value.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }

  const totalCost = computeTechCardCost(value);
  const price = parseFloat(itemPrice || "0");
  const foodcost = price > 0 ? (totalCost / price) * 100 : 0;
  const margin = price > 0 ? price - totalCost : 0;

  return (
    <div className="space-y-3">
      {/* Cost summary */}
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="border rounded-lg p-3 bg-muted/30">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Собівартість</div>
            <div className="font-bold text-lg mt-0.5">{totalCost.toFixed(2)} ₴</div>
          </div>
          <div className={`border rounded-lg p-3 ${foodcost > 35 ? "bg-red-50 border-red-200" : foodcost > 25 ? "bg-amber-50 border-amber-200" : foodcost > 0 ? "bg-green-50 border-green-200" : "bg-muted/30"}`}>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Фудкост</div>
            <div className={`font-bold text-lg mt-0.5 ${foodcost > 35 ? "text-red-600" : foodcost > 25 ? "text-amber-600" : foodcost > 0 ? "text-green-600" : "text-muted-foreground"}`}>
              {price > 0 ? `${foodcost.toFixed(1)}%` : "—"}
            </div>
          </div>
          <div className="border rounded-lg p-3 bg-muted/30">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Маржа</div>
            <div className="font-bold text-lg mt-0.5">{price > 0 ? `${margin.toFixed(2)} ₴` : "—"}</div>
          </div>
        </div>
      )}

      {/* Table header */}
      {value.length > 0 && (
        <div className="grid grid-cols-[1fr_68px_56px_56px_72px_24px] gap-1.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide px-1">
          <span>Інгредієнт (зі складу)</span>
          <span>Брутто</span>
          <span>Відх, %</span>
          <span>Нетто</span>
          <span>Вартість</span>
          <span />
        </div>
      )}

      {/* Lines */}
      {value.map((line, i) => {
        const netto = (line.brutto || 0) * (1 - (line.waste_pct || 0) / 100);
        const lineCost = netto * (line.cost_per_unit || 0);
        return (
          <div key={i} className="grid grid-cols-[1fr_68px_56px_56px_72px_24px] gap-1.5 items-center">
            <IngSearchInput
              name={line.name}
              allIngredients={allIngredients}
              onSelect={(name, ing) => {
                if (ing) {
                  const { unit, cost_per_unit } = warehouseIngToTechUnit(ing);
                  update(i, { name, ingredient_id: ing.id, unit, cost_per_unit });
                } else {
                  update(i, { name, ingredient_id: null });
                }
              }}
            />
            <div className="flex items-center gap-0.5">
              <Input type="number" min="0" step="1" value={line.brutto}
                onChange={e => update(i, { brutto: parseFloat(e.target.value) || 0 })}
                className="h-8 text-sm w-12" />
              <span className="text-[10px] text-muted-foreground shrink-0">{line.unit}</span>
            </div>
            <Input type="number" min="0" max="99" step="1" value={line.waste_pct}
              onChange={e => update(i, { waste_pct: parseFloat(e.target.value) || 0 })}
              className="h-8 text-sm" />
            <div className="h-8 flex items-center text-sm px-2 bg-muted/40 rounded border font-mono text-center justify-center">
              {netto.toFixed(0)}<span className="text-[9px] text-muted-foreground ml-0.5">{line.unit}</span>
            </div>
            <div className={`h-8 flex items-center text-xs px-1.5 rounded border font-mono justify-center ${lineCost > 0 ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-muted/40"}`}>
              {lineCost > 0 ? `${lineCost.toFixed(2)} ₴` : "—"}
            </div>
            <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={add} className="flex-1 h-8 border-dashed">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Додати інгредієнт зі складу
        </Button>
        {value.length > 0 && (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0"
            onClick={() => printCalcCard(itemName || "Страва", categoryName || "", parseFloat(itemPrice || "0"), value)}>
            <Printer className="w-3.5 h-3.5" /> Калькуляційна карта
          </Button>
        )}
      </div>

      {value.length === 0 && (
        <div className="text-center py-8 text-muted-foreground border border-dashed rounded-xl">
          <ChefHat className="w-9 h-9 mx-auto mb-2 opacity-25" />
          <p className="text-sm font-medium">Тех карта порожня</p>
          <p className="text-xs mt-1">Додайте інгредієнти зі складу — собівартість і фудкост розрахуються автоматично</p>
        </div>
      )}
    </div>
  );
}

// ─── Modifier Editor ───────────────────────────────────────────────────────────

function ModifierEditor({ groups, onChange }: { groups: ModifierGroup[]; onChange: (g: ModifierGroup[]) => void }) {
  function addGroup() {
    onChange([...groups, { name: "", is_required: false, min_select: 0, max_select: 1, sort_order: groups.length, options: [] }]);
  }
  function removeGroup(gi: number) { onChange(groups.filter((_, i) => i !== gi)); }
  function updateGroup(gi: number, key: keyof ModifierGroup, val: any) {
    onChange(groups.map((g, i) => i === gi ? { ...g, [key]: val } : g));
  }
  const { data: modIngData } = useQuery({
    queryKey: ["wh-ingredients-mod"],
    queryFn: () => apiFetch("/api/fb/warehouse/ingredients"),
    staleTime: 60_000,
  });
  const modIngredients: any[] = (modIngData as any)?.ingredients || [];

  const [expandedOpt, setExpandedOpt] = useState<string | null>(null); // "gi-oi"

  function addOption(gi: number) {
    const g = groups[gi];
    updateGroup(gi, "options", [...g.options, { name: "", price_delta: 0, sort_order: g.options.length, is_available: true, tech_card: [] }]);
  }
  function removeOption(gi: number, oi: number) {
    updateGroup(gi, "options", groups[gi].options.filter((_, i) => i !== oi));
  }
  function updateOption(gi: number, oi: number, key: keyof ModifierOption, val: any) {
    const opts = groups[gi].options.map((o, i) => i === oi ? { ...o, [key]: val } : o);
    updateGroup(gi, "options", opts);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label>Групи модифікаторів</Label>
          <p className="text-xs text-muted-foreground">Гість обирає перед замовленням (розмір, доповнення тощо)</p>
        </div>
        <Button variant="outline" size="sm" onClick={addGroup} className="h-7 text-xs">
          <Plus className="w-3 h-3 mr-1" /> Нова група
        </Button>
      </div>

      {groups.length === 0 && (
        <div className="border border-dashed rounded-lg p-6 text-center text-muted-foreground">
          <Sliders className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Немає груп модифікаторів</p>
          <p className="text-xs mt-1">Наприклад: «Розмір», «Доповнення», «Ступінь прожарки»</p>
        </div>
      )}

      {groups.map((g, gi) => (
        <div key={gi} className="border rounded-lg p-3 space-y-2 bg-muted/20">
          {/* Group header */}
          <div className="flex items-center gap-2">
            <Input value={g.name} onChange={e => updateGroup(gi, "name", e.target.value)}
              placeholder="Назва групи (напр. Розмір порції)" className="flex-1 h-8 text-sm font-medium" />
            <button onClick={() => removeGroup(gi)} className="text-destructive hover:text-destructive/80 p-1">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Group settings */}
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <Switch checked={g.is_required} onCheckedChange={v => updateGroup(gi, "is_required", v)} />
              <span>Обов'язково</span>
            </label>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Мін:</span>
              <Input type="number" min="0" max="10" value={g.min_select}
                onChange={e => updateGroup(gi, "min_select", parseInt(e.target.value) || 0)}
                className="w-12 h-6 text-xs px-1" />
              <span className="text-muted-foreground">Макс:</span>
              <Input type="number" min="1" max="10" value={g.max_select}
                onChange={e => updateGroup(gi, "max_select", parseInt(e.target.value) || 1)}
                className="w-12 h-6 text-xs px-1" />
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2 pl-1">
            {g.options.map((o, oi) => {
              const key = `${gi}-${oi}`;
              const isExpanded = expandedOpt === key;
              const tc = o.tech_card || [];
              const hasTc = tc.length > 0;

              function addTcLine() {
                const newTc = [...tc, { ingredient_id: null, name: "", brutto: 100, waste_pct: 0, unit: "г", cost_per_unit: 0 }];
                updateOption(gi, oi, "tech_card", newTc);
              }
              function removeTcLine(li: number) {
                updateOption(gi, oi, "tech_card", tc.filter((_, i) => i !== li));
              }
              function updateTcLine(li: number, patch: Partial<TechCardLine>) {
                updateOption(gi, oi, "tech_card", tc.map((l, i) => i === li ? { ...l, ...patch } : l));
              }

              return (
                <div key={oi} className="border rounded-md bg-background">
                  <div className="flex items-center gap-2 p-1.5">
                    <Switch checked={o.is_available !== false} onCheckedChange={v => updateOption(gi, oi, "is_available", v)} />
                    <Input value={o.name} onChange={e => updateOption(gi, oi, "name", e.target.value)}
                      placeholder="Назва опції" className="flex-1 h-7 text-xs" />
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground">+</span>
                      <Input type="number" min="0" step="0.5" value={o.price_delta}
                        onChange={e => updateOption(gi, oi, "price_delta", parseFloat(e.target.value) || 0)}
                        className="w-16 h-7 text-xs" />
                      <span className="text-xs text-muted-foreground">₴</span>
                    </div>
                    <button title="Прив'язати до складу" onClick={() => setExpandedOpt(isExpanded ? null : key)}
                      className={`p-1 rounded text-xs transition-colors ${hasTc ? "text-blue-600 bg-blue-50" : "text-muted-foreground hover:text-foreground"}`}>
                      <Package className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeOption(gi, oi)} className="text-destructive hover:text-destructive/80">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-2 pb-2 pt-1.5 space-y-1.5 bg-blue-50/40">
                      <p className="text-[10px] text-blue-700 font-semibold uppercase tracking-wide">Склад цього модифікатора</p>
                      {tc.length > 0 && (
                        <div className="grid grid-cols-[1fr_60px_44px_20px] gap-1 text-[10px] text-muted-foreground px-0.5 font-semibold uppercase">
                          <span>Інгредієнт</span><span>Брутто</span><span>Від,%</span><span />
                        </div>
                      )}
                      {tc.map((line, li) => (
                        <div key={li} className="grid grid-cols-[1fr_60px_44px_20px] gap-1 items-center">
                          <IngSearchInput
                            name={line.name}
                            allIngredients={modIngredients}
                            onSelect={(name, ing) => {
                              if (ing) {
                                const { unit, cost_per_unit } = warehouseIngToTechUnit(ing);
                                updateTcLine(li, { name, ingredient_id: ing.id, unit, cost_per_unit });
                              } else {
                                updateTcLine(li, { name, ingredient_id: null });
                              }
                            }}
                          />
                          <div className="flex items-center gap-0.5">
                            <Input type="number" min="0" step="1" value={line.brutto}
                              onChange={e => updateTcLine(li, { brutto: parseFloat(e.target.value) || 0 })}
                              className="h-7 text-xs w-10" />
                            <span className="text-[9px] text-muted-foreground">{line.unit}</span>
                          </div>
                          <Input type="number" min="0" max="99" step="1" value={line.waste_pct}
                            onChange={e => updateTcLine(li, { waste_pct: parseFloat(e.target.value) || 0 })}
                            className="h-7 text-xs" />
                          <button onClick={() => removeTcLine(li)} className="text-muted-foreground hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={addTcLine} className="h-6 text-[10px] w-full border-dashed">
                        <Plus className="w-3 h-3 mr-1" /> Додати інгредієнт
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            <Button variant="ghost" size="sm" onClick={() => addOption(gi)} className="h-6 text-xs w-full mt-1">
              <Plus className="w-3 h-3 mr-1" /> Додати опцію
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Item Dialog ───────────────────────────────────────────────────────────────

function ItemDialog({
  open, onClose, initial, categories, taxGroups, onSave,
}: {
  open: boolean; onClose: () => void;
  initial?: Partial<Item>;
  categories: Category[];
  taxGroups: TaxGroup[];
  onSave: (data: Partial<Item>, modifierGroups: ModifierGroup[]) => void;
}) {
  // Only show subcategories (those with parent_id) and legacy categories (no parent but have items)
  const leafCats = categories.filter(c => c.parent_id != null || (!c.parent_id && !c.station));
  const allCats = categories; // for station derivation

  const blankItem: Partial<Item> = {
    name: "", description: "", price: "0", price_happy: undefined,
    cookMinutes: 15, isAvailable: true, isPopular: false, isVegetarian: false,
    is_alcohol: false, is_stop_list: false, allergens: [], tags: [],
    vat_rate: 20, station: "kitchen_general", tech_card: [],
    item_type: "dish", ingredient_id: null, legal_entity_id: null,
    categoryId: leafCats[0]?.id ?? categories[0]?.id,
  };
  const [form, setForm] = useState<Partial<Item>>(blankItem);
  const [tab, setTab] = useState<"main" | "details" | "tech" | "modifiers">("main");
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [loadingMods, setLoadingMods] = useState(false);

  // Ingredients for "goods" type link
  const { data: ingData } = useQuery({
    queryKey: ["fb-ingredients-simple"],
    queryFn: () => apiFetch("/api/fb/warehouse/ingredients"),
    staleTime: 60_000,
  });
  const ingredients: any[] = (ingData as any)?.ingredients ?? [];

  // Legal entities for ФОП/ТОВ assignment
  const { data: leData } = useQuery({
    queryKey: ["fb-legal-entities-simple"],
    queryFn: () => apiFetch("/api/accounting/legal-entities"),
    staleTime: 60_000,
  });
  const legalEntities: any[] = (leData as any)?.entities ?? [];

  useEffect(() => {
    if (open) {
      if (initial) {
        const api = initial as any;
        setForm({
          ...blankItem,
          ...initial,
          categoryId: api.category_id ?? api.categoryId ?? leafCats[0]?.id,
          cookMinutes: api.cook_minutes ?? api.cookMinutes ?? 15,
          isAvailable: api.is_available ?? api.isAvailable ?? true,
          isPopular: api.is_popular ?? api.isPopular ?? false,
          isVegetarian: api.is_vegetarian ?? api.isVegetarian ?? false,
          is_alcohol: api.is_alcohol ?? false,
          is_stop_list: api.is_stop_list ?? false,
          sortOrder: api.sort_order ?? api.sortOrder ?? 0,
          allergens: Array.isArray(api.allergens) ? api.allergens : [],
          tags: Array.isArray(api.tags) ? api.tags : [],
          tech_card: Array.isArray(api.tech_card) ? api.tech_card : [],
          vat_rate: api.vat_rate ?? 20,
          tax_group_id: api.tax_group_id ?? undefined,
          item_type: (api.item_type as any) ?? "dish",
          ingredient_id: api.ingredient_id ?? null,
          legal_entity_id: api.legal_entity_id ?? null,
        });
      } else {
        setForm({ ...blankItem, categoryId: leafCats[0]?.id ?? categories[0]?.id });
      }
      setTab("main");
      setModifierGroups([]);
    }
  }, [open, initial?.id]);

  // Load modifiers for existing items
  useEffect(() => {
    if (open && initial?.id) {
      setLoadingMods(true);
      apiFetch(`/api/fb/modifier-groups?itemId=${initial.id}`)
        .then(d => setModifierGroups(d.groups || []))
        .catch(() => {})
        .finally(() => setLoadingMods(false));
    }
  }, [open, initial?.id]);

  function set(key: string, val: any) { setForm(f => ({ ...f, [key]: val })); }

  function handleCategoryChange(catId: number) {
    set("categoryId", catId);
    const cat = categories.find(c => c.id === catId);
    const derived = deriveItemStation(cat, allCats);
    if (derived) set("station", derived);
  }

  function toggleAllergen(key: string) {
    const list = form.allergens || [];
    set("allergens", list.includes(key) ? list.filter(a => a !== key) : [...list, key]);
  }

  const valid = !!form.name?.trim() && parseFloat(form.price || "0") >= 0;

  // Flatten categories for display: station > subcats, then standalone cats
  const stations = categories.filter(c => !c.parent_id && c.station);
  const standaloneLeafs = categories.filter(c => !c.parent_id && !c.station);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? `Редагувати: ${initial.name}` : "Нова страва / напій"}</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b mb-4">
          {(["main", "details", ...(form.item_type === "dish" ? ["tech"] : []), "modifiers"] as const).map((t: any) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t === "main" ? "Основне" : t === "details" ? "Деталі" : t === "tech" ? "Техкарта" : "Модифікатори"}
              {t === "modifiers" && modifierGroups.length > 0 && (
                <span className="ml-1.5 bg-primary text-primary-foreground text-[10px] rounded-full px-1.5">{modifierGroups.length}</span>
              )}
            </button>
          ))}
        </div>

        {tab === "main" && (
          <div className="space-y-4">
            {/* Item type selector */}
            <div>
              <Label className="block mb-2">Тип позиції</Label>
              <div className="flex gap-2">
                {([
                  { value: "dish", label: "🍽 Страва / Напій", desc: "Списання по техкарті" },
                  { value: "goods", label: "📦 Товар", desc: "Списання цілою одиницею" },
                  { value: "service", label: "🛎 Послуга", desc: "Без списання" },
                ] as const).map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => { set("item_type", opt.value); if (opt.value !== "dish") setTab(prev => prev === "tech" ? "main" : prev); }}
                    className={`flex-1 rounded-lg border-2 p-2.5 text-left transition-colors ${form.item_type === opt.value ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/40"}`}>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Goods: ingredient link */}
            {form.item_type === "goods" && (
              <div>
                <Label>Складський інгредієнт (товар)</Label>
                <select value={form.ingredient_id ? String(form.ingredient_id) : ""}
                  onChange={e => set("ingredient_id", e.target.value ? parseInt(e.target.value) : null)}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background">
                  <option value="">— не прив'язано —</option>
                  {ingredients.map((ing: any) => (
                    <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit}) — залишок: {parseFloat(ing.current_stock || "0").toFixed(2)}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">При продажу 1 одиниця буде списана зі складу автоматично</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Назва *</Label>
                <Input value={form.name || ""} onChange={e => set("name", e.target.value)} className="mt-1" placeholder="Борщ із пампушками" autoFocus />
              </div>
              <div className="col-span-2">
                <Label>Опис</Label>
                <Textarea value={form.description || ""} onChange={e => set("description", e.target.value)} className="mt-1 resize-none h-20" placeholder="Традиційний червоний борщ, сметана, пампушки з часником" />
              </div>
              <div>
                <Label>Категорія</Label>
                <Select value={String(form.categoryId || "")} onValueChange={v => handleCategoryChange(parseInt(v))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Оберіть категорію" /></SelectTrigger>
                  <SelectContent>
                    {stations.map(st => (
                      <div key={st.id}>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{st.emoji} {st.name}</div>
                        {categories.filter(c => c.parent_id === st.id).map(c => (
                          <SelectItem key={c.id} value={String(c.id)} className="pl-4">{c.emoji} {c.name}</SelectItem>
                        ))}
                      </div>
                    ))}
                    {standaloneLeafs.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.emoji} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Станція (принтер)</Label>
                <Select value={form.station || "kitchen_general"} onValueChange={v => set("station", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ITEM_STATIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Ціна (грн) *</Label>
                <Input type="number" min="0" step="0.01" value={form.price || "0"}
                  onChange={e => set("price", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Happy Hour (грн)</Label>
                <Input type="number" min="0" step="0.01" value={form.price_happy || ""}
                  onChange={e => set("price_happy", e.target.value || undefined)} className="mt-1" placeholder="—" />
              </div>
              <div>
                <Label className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Готування (хв)</Label>
                <Input type="number" min="0" value={form.cookMinutes || 15}
                  onChange={e => set("cookMinutes", parseInt(e.target.value))} className="mt-1" />
              </div>
            </div>

            <PhotoUploader value={form.image_url} onChange={v => set("image_url", v)} />

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between border rounded p-3">
                <div className="flex items-center gap-2"><Eye className="w-4 h-4 text-muted-foreground" /><span className="text-sm">Доступна</span></div>
                <Switch checked={!!form.isAvailable} onCheckedChange={v => set("isAvailable", v)} />
              </div>
              <div className="flex items-center justify-between border rounded p-3">
                <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /><span className="text-sm">Стоп-лист</span></div>
                <Switch checked={!!form.is_stop_list} onCheckedChange={v => set("is_stop_list", v)} />
              </div>
              <div className="flex items-center justify-between border rounded p-3">
                <div className="flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" /><span className="text-sm">Популярне</span></div>
                <Switch checked={!!form.isPopular} onCheckedChange={v => set("isPopular", v)} />
              </div>
              <div className="flex items-center justify-between border rounded p-3">
                <div className="flex items-center gap-2"><Leaf className="w-4 h-4 text-green-600" /><span className="text-sm">Вегетаріанське</span></div>
                <Switch checked={!!form.isVegetarian} onCheckedChange={v => set("isVegetarian", v)} />
              </div>
            </div>
          </div>
        )}

        {tab === "details" && (
          <div className="space-y-4">
            {/* Legal entity (ФОП / ТОВ) */}
            <div>
              <Label>Юридична особа (ФОП / ТОВ)</Label>
              <Select value={form.legal_entity_id ? String(form.legal_entity_id) : "_none"}
                onValueChange={v => set("legal_entity_id", v === "_none" ? null : parseInt(v))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Оберіть юрособу" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— не визначено —</SelectItem>
                  {legalEntities.map((le: any) => (
                    <SelectItem key={le.id} value={String(le.id)}>
                      {le.type?.toUpperCase()} — {le.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Визначає як розділяти виручку між ФОП і ТОВ при продажу</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Група ПДВ</Label>
                <Select value={form.tax_group_id ? String(form.tax_group_id) : "_none"} onValueChange={v => set("tax_group_id", v === "_none" ? undefined : parseInt(v))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Оберіть групу" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— без прив'язки —</SelectItem>
                    {taxGroups.map(g => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.code} — {g.name} ({g.rate}%)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ставка ПДВ (пряма)</Label>
                <Select value={String(form.vat_rate ?? 20)} onValueChange={v => set("vat_rate", parseInt(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20% (стандарт)</SelectItem>
                    <SelectItem value="7">7% (медикаменти)</SelectItem>
                    <SelectItem value="0">0% (звільнено)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border rounded p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Switch checked={!!form.is_alcohol} onCheckedChange={v => set("is_alcohol", v)} />
                <div className="flex items-center gap-1.5"><Wine className="w-4 h-4 text-purple-600" /><span className="text-sm font-medium">Алкоголь</span></div>
              </div>
              {form.is_alcohol && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div>
                    <Label>Код УКЗЕД</Label>
                    <Input value={form.uktzed_code || ""} onChange={e => set("uktzed_code", e.target.value)} className="mt-1" placeholder="2208909900" />
                  </div>
                  <div>
                    <Label>Акцизний код</Label>
                    <Input value={form.excise_code || ""} onChange={e => set("excise_code", e.target.value)} className="mt-1" />
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label className="block mb-2">Алергени</Label>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map(a => {
                  const active = (form.allergens || []).includes(a.key);
                  return (
                    <button key={a.key} onClick={() => toggleAllergen(a.key)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? "bg-amber-100 border-amber-400 text-amber-800" : "border-muted-foreground/30 hover:bg-muted"}`}>
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Теги (через кому)</Label>
              <Input value={(form.tags || []).join(", ")} className="mt-1"
                onChange={e => set("tags", e.target.value.split(",").map(t => t.trim()).filter(Boolean))}
                placeholder="популярне, сезонне, дня" />
            </div>
          </div>
        )}

        {tab === "tech" && (
          <TechCardEditor
            value={(form.tech_card || []).map((l: any) => ({
              ingredient_id: l.ingredient_id ?? null,
              name: l.name || "",
              brutto: l.brutto ?? l.quantity ?? 100,
              waste_pct: l.waste_pct ?? 0,
              unit: l.unit || "г",
              cost_per_unit: l.cost_per_unit ?? 0,
            }))}
            onChange={v => set("tech_card", v)}
            itemPrice={form.price}
            itemName={form.name}
            categoryName={categories.find(c => c.id === form.categoryId)?.name}
          />
        )}

        {tab === "modifiers" && (
          <div>
            {loadingMods ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : !initial?.id ? (
              <div className="text-center py-10 text-muted-foreground">
                <Sliders className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Спочатку збережіть страву</p>
                <p className="text-xs mt-1">Після збереження ви зможете додати модифікатори</p>
              </div>
            ) : (
              <ModifierEditor groups={modifierGroups} onChange={setModifierGroups} />
            )}
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => valid && onSave(form, modifierGroups)} disabled={!valid}>
            {initial?.id ? "Зберегти зміни" : "Створити страву"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Item Card ─────────────────────────────────────────────────────────────────

function ItemCard({ item, onEdit, onDelete, onToggleAvailable, onToggleStopList, onTogglePopular, onToggleVegetarian, onDragStart, onDragEnd, isDragging }: {
  item: Item;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAvailable: () => void;
  onToggleStopList: () => void;
  onTogglePopular: () => void;
  onToggleVegetarian: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const src = imgSrc(item.image_url);
  const stopList = item.is_stop_list;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group relative border rounded-xl overflow-hidden bg-card hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none
        ${stopList ? "opacity-60 border-destructive/40" : ""}
        ${isDragging ? "opacity-40 scale-95 shadow-lg ring-2 ring-primary/30" : ""}
      `}
    >
      {/* Drag handle hint */}
      <div className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none">
        <GripVertical className="w-4 h-4 text-white drop-shadow" />
      </div>

      <div className="relative h-36 bg-muted/40 flex items-center justify-center overflow-hidden">
        {src ? (
          <img src={src} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
            <Image className="w-8 h-8" />
            <span className="text-xs">Немає фото</span>
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 flex gap-1 flex-wrap">
          {stopList && <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded font-medium">СТОП</span>}
          {!((item as any).is_available ?? item.isAvailable) && !stopList && <span className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded">Прихована</span>}
          {((item as any).is_popular ?? item.isPopular) && <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded">⭐ Топ</span>}
          {((item as any).is_vegetarian ?? item.isVegetarian) && <span className="bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded">🌿</span>}
          {item.is_alcohol && <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded">🍷</span>}
          {item.item_type === "goods" && <span className="bg-sky-600 text-white text-[10px] px-1.5 py-0.5 rounded">📦 Товар</span>}
          {item.item_type === "service" && <span className="bg-slate-500 text-white text-[10px] px-1.5 py-0.5 rounded">🛎 Послуга</span>}
        </div>
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <button onClick={e => { e.stopPropagation(); onEdit(); }} className="bg-white text-gray-900 rounded-lg p-2 hover:bg-gray-100" title="Редагувати">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={e => { e.stopPropagation(); onToggleAvailable(); }} className="bg-white text-gray-900 rounded-lg p-2 hover:bg-gray-100" title={item.isAvailable ? "Приховати" : "Показати"}>
              {item.isAvailable ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button onClick={e => { e.stopPropagation(); onToggleStopList(); }} className={`rounded-lg p-2 ${stopList ? "bg-green-500 text-white hover:bg-green-600" : "bg-red-500 text-white hover:bg-red-600"}`} title={stopList ? "Прибрати зі стоп-листа" : "В стоп-лист"}>
              <AlertTriangle className="w-4 h-4" />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(); }} className="bg-red-600 text-white rounded-lg p-2 hover:bg-red-700" title="Видалити">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={e => { e.stopPropagation(); onTogglePopular(); }} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 ${(item as any).is_popular ?? item.isPopular ? "bg-amber-400 text-white hover:bg-amber-500" : "bg-white/90 text-gray-700 hover:bg-white"}`}>
              <Star className="w-3.5 h-3.5" /> Топ
            </button>
            <button onClick={e => { e.stopPropagation(); onToggleVegetarian(); }} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 ${(item as any).is_vegetarian ?? item.isVegetarian ? "bg-green-500 text-white hover:bg-green-600" : "bg-white/90 text-gray-700 hover:bg-white"}`}>
              <Leaf className="w-3.5 h-3.5" /> Вег
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-1">
        <div className="font-medium text-sm leading-tight line-clamp-1">{item.name}</div>
        {item.description && <div className="text-xs text-muted-foreground line-clamp-1">{item.description}</div>}
        <div className="flex items-center justify-between pt-0.5">
          <div>
            <span className="font-semibold text-sm">{parseFloat(item.price).toFixed(0)} ₴</span>
            {item.price_happy && <span className="text-xs text-muted-foreground ml-1 line-through">{parseFloat(item.price_happy).toFixed(0)} ₴</span>}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{item.cookMinutes} хв</span>
          </div>
        </div>
        {(() => {
          const cost = computeTechCardCost((item.tech_card || []).map((l: any) => ({
            ingredient_id: null,
            name: l.name || "",
            brutto: l.brutto ?? l.quantity ?? 0,
            waste_pct: l.waste_pct ?? 0,
            unit: l.unit || "г",
            cost_per_unit: l.cost_per_unit ?? 0,
          })));
          const price = parseFloat(item.price);
          const fc = cost > 0 && price > 0 ? (cost / price) * 100 : 0;
          if (cost <= 0) return null;
          return (
            <div className="flex items-center justify-between text-[10px] pt-0.5">
              <span className="text-muted-foreground">С/В: {cost.toFixed(2)} ₴</span>
              {fc > 0 && (
                <span className={`px-1.5 py-0.5 rounded font-medium ${fc > 35 ? "bg-red-100 text-red-700" : fc > 25 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                  FC {fc.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })()}
        {(item.allergens || []).length > 0 && (
          <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 truncate">
            ⚠ {(item.allergens || []).map(a => ALLERGENS.find(al => al.key === a)?.label || a).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDescendantIds(catId: number, allCats: Category[]): number[] {
  const direct = allCats.filter(c => c.parent_id === catId);
  return [catId, ...direct.flatMap(c => getDescendantIds(c.id, allCats))];
}

// ─── Dish Row (Level 3 — inline in tree) ──────────────────────────────────────

function DishRow({
  item, onEdit, onToggleAvailable, onTogglePopular, isDragging, onDragStart, onDragEnd,
}: {
  item: Item;
  onEdit: () => void;
  onToggleAvailable: () => void;
  onTogglePopular: () => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const isAvail = (item as any).is_available ?? item.isAvailable;
  const isPop   = (item as any).is_popular   ?? item.isPopular;
  const src = imgSrc(item.image_url);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`relative flex items-center gap-3 border-b border-muted/50 hover:bg-muted/20 transition-colors group select-none
        ${isDragging ? "opacity-40" : ""}
        ${!isAvail ? "opacity-60" : ""}
        ${item.is_stop_list ? "bg-red-50/30" : ""}`}
      style={{ paddingLeft: 72, paddingRight: 16, paddingTop: 8, paddingBottom: 8 }}
    >
      {/* Left tree indent line */}
      <div className="absolute left-[44px] top-0 bottom-0 w-px bg-border/40 pointer-events-none" />

      {/* Drag handle */}
      <GripVertical className="w-4 h-4 text-muted-foreground/0 group-hover:text-muted-foreground/50 cursor-grab shrink-0 -ml-3" />

      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-full overflow-hidden bg-muted/60 shrink-0 border border-border/60 flex items-center justify-center">
        {src
          ? <img src={src} alt={item.name} className="w-full h-full object-cover" />
          : <span className="text-xl">🍽</span>}
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm leading-tight flex items-center gap-1.5 flex-wrap">
          <span>{item.name}</span>
          {item.is_stop_list && (
            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">СТОП</span>
          )}
          {item.item_type === "goods" && (
            <span className="text-[10px] bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded">товар</span>
          )}
          {item.item_type === "service" && (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">послуга</span>
          )}
          {((item as any).is_popular ?? item.isPopular) && (
            <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">⭐ Топ</span>
          )}
        </div>
        {item.description && (
          <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">{item.description}</div>
        )}
      </div>

      {/* Price */}
      <div className="text-sm font-semibold shrink-0 min-w-[80px] text-right tabular-nums">
        {parseFloat(item.price).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
      </div>

      {/* Available toggle */}
      <div className="flex flex-col items-center shrink-0 gap-0.5" onClick={e => e.stopPropagation()}>
        <Switch
          checked={isAvail}
          onCheckedChange={onToggleAvailable}
          className="h-[18px] w-8 data-[state=checked]:bg-green-500"
        />
        <span className="text-[9px] text-muted-foreground">доступна</span>
      </div>

      {/* Popular toggle */}
      <div className="flex flex-col items-center shrink-0 gap-0.5" onClick={e => e.stopPropagation()}>
        <Switch
          checked={isPop}
          onCheckedChange={onTogglePopular}
          className="h-[18px] w-8 data-[state=checked]:bg-amber-500"
        />
        <span className="text-[9px] text-muted-foreground">топ</span>
      </div>

      {/* Edit */}
      <button
        onClick={e => { e.stopPropagation(); onEdit(); }}
        className="text-xs text-primary hover:underline font-medium shrink-0 ml-1"
      >
        Ред.
      </button>
    </div>
  );
}

// ─── Category Tree Row (Level 2) ──────────────────────────────────────────────

function CategoryTreeRow({
  cat, isExpanded, itemCount, onToggle, onEdit, onToggleActive, onAddItem,
}: {
  cat: Category;
  isExpanded: boolean;
  itemCount: number;
  onToggle: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onAddItem: () => void;
}) {
  return (
    <div
      className={`relative flex items-center gap-2 border-b border-muted/50 hover:bg-muted/30 transition-colors group cursor-pointer
        ${!cat.isActive ? "opacity-60" : ""}`}
      style={{ paddingLeft: 36, paddingRight: 16, paddingTop: 9, paddingBottom: 9 }}
      onClick={onToggle}
    >
      {/* Left tree line */}
      <div className="absolute left-[44px] top-0 bottom-0 w-px bg-border/40 pointer-events-none" />
      {/* Horizontal dash connector */}
      <div className="absolute left-[28px] top-1/2 w-4 h-px bg-border/60 pointer-events-none" />

      {/* Expand arrow */}
      <button
        className="p-0.5 text-muted-foreground hover:text-foreground shrink-0 z-10"
        onClick={e => { e.stopPropagation(); onToggle(); }}
      >
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5" />
          : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      <span className="shrink-0 text-base">{cat.emoji}</span>

      <span className="flex-1 font-medium text-sm">{cat.name}</span>

      {itemCount > 0 && (
        <span className="text-xs text-muted-foreground">{itemCount}</span>
      )}

      {/* Hover: add item button */}
      <button
        className="hidden group-hover:flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted mr-1"
        onClick={e => { e.stopPropagation(); onAddItem(); }}
      >
        <Plus className="w-3 h-3" /> Страва
      </button>

      {/* Active toggle */}
      <div onClick={e => e.stopPropagation()}>
        <Switch checked={cat.isActive} onCheckedChange={onToggleActive} className="h-[18px] w-8" />
      </div>

      {/* Edit */}
      <button
        onClick={e => { e.stopPropagation(); onEdit(); }}
        className="text-xs text-primary hover:underline font-medium shrink-0"
      >
        Ред.
      </button>
    </div>
  );
}

// ─── Group Tree Row (Level 1) ─────────────────────────────────────────────────

function GroupTreeRow({
  group, isExpanded, totalItems, onToggle, onEdit, onToggleActive, onAddCategory,
}: {
  group: Category;
  isExpanded: boolean;
  totalItems: number;
  onToggle: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onAddCategory: () => void;
}) {
  const stationEmoji = STATION_TYPES.find(s => s.value === group.station)?.emoji || group.emoji;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-3 bg-muted/25 border-b hover:bg-muted/45 transition-colors group cursor-pointer
        ${!group.isActive ? "opacity-60" : ""}`}
      onClick={onToggle}
    >
      {/* Expand arrow */}
      <button
        className="p-0.5 text-muted-foreground hover:text-foreground shrink-0"
        onClick={e => { e.stopPropagation(); onToggle(); }}
      >
        {isExpanded
          ? <ChevronDown className="w-4 h-4" />
          : <ChevronRight className="w-4 h-4" />}
      </button>

      <span className="shrink-0 text-base">{stationEmoji}</span>

      <span className="flex-1 font-semibold text-sm">{group.name}</span>

      {totalItems > 0 && (
        <span className="text-xs text-muted-foreground mr-1">{totalItems} позицій</span>
      )}

      {/* Hover: add category button */}
      <button
        className="hidden group-hover:flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-background/60 mr-1"
        onClick={e => { e.stopPropagation(); onAddCategory(); }}
      >
        <Plus className="w-3 h-3" /> Категорія
      </button>

      {/* Active toggle */}
      <div onClick={e => e.stopPropagation()}>
        <Switch checked={group.isActive} onCheckedChange={onToggleActive} className="h-[18px] w-8" />
      </div>

      {/* Edit */}
      <button
        onClick={e => { e.stopPropagation(); onEdit(); }}
        className="text-xs text-primary hover:underline font-medium shrink-0"
      >
        Ред.
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function FbMenu() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "available" | "stop" | "popular" | "vegetarian">("all");
  const [catDialog, setCatDialog] = useState<{ open: boolean; initial?: Partial<Category>; parentId?: number | null }>({ open: false });
  const [itemDialog, setItemDialog] = useState<{ open: boolean; initial?: Partial<Item> }>({ open: false });
  const [deleteCat, setDeleteCat] = useState<Category | null>(null);
  const [deleteItem, setDeleteItem] = useState<Item | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<number | null>(null);

  const { data: catsData } = useQuery({ queryKey: ["fb-categories"], queryFn: () => apiFetch("/api/fb/categories") });
  const { data: itemsData, isLoading: itemsLoading } = useQuery({ queryKey: ["fb-items"], queryFn: () => apiFetch("/api/fb/items") });
  const { data: taxData } = useQuery({ queryKey: ["fb-tax-groups"], queryFn: () => apiFetch("/api/fb/settings/tax-groups") });

  const categories: Category[] = (catsData?.categories || []).map((c: any) => ({
    ...c,
    isActive: c.is_active ?? c.isActive ?? true,
    sortOrder: c.sort_order ?? c.sortOrder ?? 0,
    parent_id: c.parent_id ?? null,
    station: c.station ?? null,
  }));
  const allItems: Item[] = (itemsData?.items || []);
  const taxGroups: TaxGroup[] = taxData?.taxGroups || [];

  const groups = categories.filter(c => !c.parent_id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  // Auto-expand first group + its first category on load
  useEffect(() => {
    if (groups.length && expandedGroups.size === 0) {
      const firstGroup = groups[0];
      setExpandedGroups(new Set([firstGroup.id]));
      const firstSubCat = categories.find(c => c.parent_id === firstGroup.id);
      if (firstSubCat) setExpandedCats(new Set([firstSubCat.id]));
    }
  }, [groups.length]);

  function toggleGroup(id: number) {
    setExpandedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleCat(id: number) {
    setExpandedCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // Filtered items helper
  function filterItem(item: Item): boolean {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !(item.description || "").toLowerCase().includes(search.toLowerCase())) return false;
    const isAvail = (item as any).is_available ?? item.isAvailable;
    const isPop   = (item as any).is_popular   ?? item.isPopular;
    const isVeg   = (item as any).is_vegetarian ?? item.isVegetarian;
    if (filter === "available" && !isAvail) return false;
    if (filter === "stop" && !item.is_stop_list) return false;
    if (filter === "popular" && !isPop) return false;
    if (filter === "vegetarian" && !isVeg) return false;
    return true;
  }

  // Mutations
  const saveCategory = useMutation({
    mutationFn: async (data: Partial<Category>) => {
      const payload = {
        name: data.name, emoji: data.emoji, isActive: data.isActive,
        description: data.description, sortOrder: data.sortOrder,
        parent_id: data.parent_id ?? null,
        station: data.parent_id ? null : (data.station ?? null),
      };
      if (data.id) return apiFetch(`/api/fb/categories/${data.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      return apiFetch("/api/fb/categories", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["fb-categories"] });
      setCatDialog({ open: false });
      toast({ title: v.id ? "Оновлено" : "Категорію створено" });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const toggleCategoryActive = (cat: Category) =>
    apiFetch(`/api/fb/categories/${cat.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !cat.isActive }) })
      .then(() => qc.invalidateQueries({ queryKey: ["fb-categories"] }))
      .catch((e: any) => toast({ title: e.message, variant: "destructive" }));

  const deleteCategory = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/fb/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-categories"] });
      setDeleteCat(null);
      toast({ title: "Видалено" });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const saveItem = useMutation({
    mutationFn: async ({ data, modifierGroups }: { data: Partial<Item>; modifierGroups: ModifierGroup[] }) => {
      const payload = {
        name: data.name, description: data.description, price: data.price,
        price_happy: data.price_happy || null,
        categoryId: data.categoryId, cookMinutes: data.cookMinutes,
        isAvailable: data.isAvailable, isPopular: data.isPopular, isVegetarian: data.isVegetarian,
        allergens: data.allergens || [], tags: data.tags || [],
        imageUrl: data.image_url || null,
        vat_rate: data.vat_rate, tax_group_id: data.tax_group_id || null,
        is_alcohol: data.is_alcohol, uktzed_code: data.uktzed_code || null, excise_code: data.excise_code || null,
        is_stop_list: data.is_stop_list, station: data.station,
        tech_card: data.item_type === "dish" ? (data.tech_card || null) : null,
        item_type: data.item_type || "dish",
        ingredient_id: data.item_type === "goods" ? (data.ingredient_id ?? null) : null,
        legal_entity_id: data.legal_entity_id ?? null,
        sortOrder: data.sortOrder || 0,
      };
      let saved: any;
      if (data.id) {
        saved = await apiFetch(`/api/fb/items/${data.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        saved = await apiFetch("/api/fb/items", { method: "POST", body: JSON.stringify(payload) });
      }
      const itemId = saved.item?.id ?? data.id;
      if (itemId) {
        try {
          await apiFetch(`/api/fb/modifier-groups/bulk/${itemId}`, {
            method: "PUT",
            body: JSON.stringify({ groups: modifierGroups }),
          });
        } catch (e) {
          console.warn("Failed to save modifiers:", e);
        }
      }
      return saved;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["fb-items"] });
      setItemDialog({ open: false });
      toast({ title: v.data.id ? "Страву оновлено" : "Страву створено" });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteItemMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/fb/items/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-items"] }); setDeleteItem(null); toast({ title: "Страву видалено" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const toggleAvailable = (item: Item) => {
    const cur = (item as any).is_available ?? item.isAvailable;
    apiFetch(`/api/fb/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ isAvailable: !cur }) })
      .then(() => qc.invalidateQueries({ queryKey: ["fb-items"] }))
      .catch((e: any) => toast({ title: e.message, variant: "destructive" }));
  };

  const togglePopular = (item: Item) => {
    const cur = (item as any).is_popular ?? item.isPopular;
    apiFetch(`/api/fb/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ isPopular: !cur }) })
      .then(() => qc.invalidateQueries({ queryKey: ["fb-items"] }))
      .catch((e: any) => toast({ title: e.message, variant: "destructive" }));
  };

  // Drag handlers for item rows
  const handleDragStart = (e: React.DragEvent, itemId: number) => {
    e.dataTransfer.setData("itemId", String(itemId));
    setDraggingItemId(itemId);
  };
  const handleDragEnd = () => setDraggingItemId(null);

  const FILTERS = [
    { value: "all", label: "Всі" },
    { value: "available", label: "Доступні" },
    { value: "stop", label: "Стоп-лист" },
    { value: "popular", label: "Топ" },
    { value: "vegetarian", label: "Веган" },
  ] as const;

  const totalItems = allItems.length;
  const firstSubCat = groups.length ? categories.find(c => c.parent_id === groups[0]?.id) : undefined;
  const defaultCatIdForNew = firstSubCat?.id ?? categories[0]?.id;

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">

        {/* ─── Header ──────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-3 border-b bg-background shrink-0">
          <div>
            <h1 className="font-semibold text-base">Меню</h1>
            <p className="text-xs text-muted-foreground">{totalItems} позицій</p>
          </div>

          <div className="flex-1 relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук страв..." className="pl-8 h-8 text-sm" />
          </div>

          <div className="flex gap-1">
            {FILTERS.map(f => (
              <button key={f.value} onClick={() => setFilter(f.value as any)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${filter === f.value ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 hover:bg-muted"}`}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => setCatDialog({ open: true })}>
              <FolderPlus className="w-4 h-4 mr-1" /> Нова група
            </Button>
            <Button size="sm" onClick={() => setItemDialog({ open: true, initial: { categoryId: defaultCatIdForNew } })}>
              <Plus className="w-4 h-4 mr-1" /> Додати страву
            </Button>
          </div>
        </div>

        {/* ─── Tree ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {itemsLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Завантаження...</div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 gap-3 text-muted-foreground">
              <Layers className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">Меню порожнє</p>
              <p className="text-xs">Створіть першу групу (Кухня, Бар тощо)</p>
              <Button size="sm" onClick={() => setCatDialog({ open: true })}>
                <Plus className="w-4 h-4 mr-1" /> Нова група
              </Button>
            </div>
          ) : (
            groups.map(group => {
              const groupExpanded = expandedGroups.has(group.id);
              const subCats = categories
                .filter(c => c.parent_id === group.id)
                .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
              const groupItemCount = subCats.length > 0
                ? allItems.filter(i => {
                    const catId = (i as any).category_id ?? i.categoryId;
                    return subCats.some(sc => sc.id === catId);
                  }).length
                : allItems.filter(i => {
                    const catId = (i as any).category_id ?? i.categoryId;
                    return catId === group.id;
                  }).length;

              return (
                <div key={group.id}>
                  {/* ── Level 1: Group ─────────────────────── */}
                  <GroupTreeRow
                    group={group}
                    isExpanded={groupExpanded}
                    totalItems={groupItemCount}
                    onToggle={() => toggleGroup(group.id)}
                    onEdit={() => setCatDialog({ open: true, initial: group })}
                    onToggleActive={() => toggleCategoryActive(group)}
                    onAddCategory={() => { setCatDialog({ open: true, parentId: group.id }); if (!groupExpanded) toggleGroup(group.id); }}
                  />

                  {groupExpanded && (
                    <div>
                      {subCats.length === 0 ? (() => {
                        const directItems = allItems
                          .filter(i => {
                            const cId = (i as any).category_id ?? i.categoryId;
                            return cId === group.id && filterItem(i);
                          })
                          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                        return (
                          <div>
                            {directItems.length === 0 ? (
                              <div className="flex items-center gap-2 border-b border-muted/40 text-muted-foreground text-xs"
                                style={{ paddingLeft: 52, paddingTop: 8, paddingBottom: 8 }}>
                                {search || filter !== "all"
                                  ? <span>Нічого не знайдено</span>
                                  : <><span>Немає страв</span><button className="text-primary hover:underline" onClick={() => setItemDialog({ open: true, initial: { categoryId: group.id } })}>+ Додати</button></>}
                              </div>
                            ) : (
                              directItems.map(item => (
                                <DishRow
                                  key={item.id}
                                  item={item}
                                  onEdit={() => setItemDialog({ open: true, initial: item })}
                                  onToggleAvailable={() => toggleAvailable(item)}
                                  onTogglePopular={() => togglePopular(item)}
                                  isDragging={draggingItemId === item.id}
                                  onDragStart={e => handleDragStart(e, item.id)}
                                  onDragEnd={handleDragEnd}
                                />
                              ))
                            )}
                            <button
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-muted/30 w-full border-b border-muted/40 transition-colors"
                              style={{ paddingLeft: 52, paddingTop: 6, paddingBottom: 6 }}
                              onClick={() => setItemDialog({ open: true, initial: { categoryId: group.id } })}
                            >
                              <Plus className="w-3 h-3" /><span>Додати страву</span>
                            </button>
                          </div>
                        );
                      })() : (
                        subCats.map(cat => {
                          const catExpanded = expandedCats.has(cat.id);
                          const catItems = allItems
                            .filter(i => {
                              const cId = (i as any).category_id ?? i.categoryId;
                              return cId === cat.id && filterItem(i);
                            })
                            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                          const catItemsTotal = allItems.filter(i => {
                            const cId = (i as any).category_id ?? i.categoryId;
                            return cId === cat.id;
                          }).length;

                          return (
                            <div key={cat.id}>
                              {/* ── Level 2: Category ─────────── */}
                              <CategoryTreeRow
                                cat={cat}
                                isExpanded={catExpanded}
                                itemCount={catItemsTotal}
                                onToggle={() => toggleCat(cat.id)}
                                onEdit={() => setCatDialog({ open: true, initial: cat })}
                                onToggleActive={() => toggleCategoryActive(cat)}
                                onAddItem={() => {
                                  setItemDialog({ open: true, initial: { categoryId: cat.id } });
                                  if (!catExpanded) toggleCat(cat.id);
                                }}
                              />

                              {catExpanded && (
                                <div>
                                  {catItems.length === 0 ? (
                                    <div className="flex items-center gap-2 border-b border-muted/40 text-muted-foreground text-xs"
                                      style={{ paddingLeft: 88, paddingTop: 8, paddingBottom: 8 }}>
                                      {search || filter !== "all"
                                        ? <span>Нічого не знайдено</span>
                                        : <>
                                          <span>Немає страв</span>
                                          <button className="text-primary hover:underline"
                                            onClick={() => setItemDialog({ open: true, initial: { categoryId: cat.id } })}>
                                            + Додати
                                          </button>
                                        </>
                                      }
                                    </div>
                                  ) : (
                                    catItems.map(item => (
                                      <DishRow
                                        key={item.id}
                                        item={item}
                                        onEdit={() => setItemDialog({ open: true, initial: item })}
                                        onToggleAvailable={() => toggleAvailable(item)}
                                        onTogglePopular={() => togglePopular(item)}
                                        isDragging={draggingItemId === item.id}
                                        onDragStart={e => handleDragStart(e, item.id)}
                                        onDragEnd={handleDragEnd}
                                      />
                                    ))
                                  )}

                                  {/* Add item shortcut at bottom of category */}
                                  <button
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-muted/30 w-full border-b border-muted/40 transition-colors"
                                    style={{ paddingLeft: 88, paddingTop: 6, paddingBottom: 6 }}
                                    onClick={() => setItemDialog({ open: true, initial: { categoryId: cat.id } })}
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Додати страву</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}

                      {/* Add category shortcut at bottom of group */}
                      <button
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-muted/20 w-full border-b border-muted/40 transition-colors"
                        style={{ paddingLeft: 52, paddingTop: 6, paddingBottom: 6 }}
                        onClick={() => setCatDialog({ open: true, parentId: group.id })}
                      >
                        <Plus className="w-3 h-3" />
                        <span>Додати категорію</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Category / Group Dialog ──────────────────────── */}
      <CategoryDialog
        open={catDialog.open}
        initial={catDialog.initial}
        parentId={catDialog.parentId}
        onClose={() => setCatDialog({ open: false })}
        onSave={saveCategory.mutate}
      />

      {/* ─── Item Dialog ──────────────────────────────────── */}
      <ItemDialog
        open={itemDialog.open}
        initial={itemDialog.initial}
        categories={categories}
        taxGroups={taxGroups}
        onClose={() => setItemDialog({ open: false })}
        onSave={(data, modifierGroups) => saveItem.mutate({ data, modifierGroups })}
      />

      {/* ─── Delete Category ─────────────────────────────── */}
      <AlertDialog open={!!deleteCat} onOpenChange={v => !v && setDeleteCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити «{deleteCat?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCat?.parent_id
                ? "Страви у цій категорії залишаться без прив'язки."
                : "Буде видалено групу разом з усіма категоріями. Страви залишаться."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteCat && deleteCategory.mutate(deleteCat.id)}>Видалити</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Item ──────────────────────────────────── */}
      <AlertDialog open={!!deleteItem} onOpenChange={v => !v && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити «{deleteItem?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Цю дію неможливо скасувати.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteItem && deleteItemMut.mutate(deleteItem.id)}>Видалити</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
