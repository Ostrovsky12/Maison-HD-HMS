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
  ChevronRight, ChevronDown, FolderPlus, Settings2, Sliders,
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
  name: string;
  quantity: number;
  unit: string;
}

interface ModifierOption {
  id?: number;
  name: string;
  price_delta: number;
  sort_order: number;
  is_available: boolean;
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
    ? (isSubcat ? "Редагувати підкатегорію" : "Редагувати станцію")
    : (isSubcat ? "Нова підкатегорія" : "Нова станція");

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

// ─── Tech Card Editor ──────────────────────────────────────────────────────────

function TechCardEditor({ value, onChange }: { value: TechCardLine[]; onChange: (v: TechCardLine[]) => void }) {
  function add() { onChange([...value, { name: "", quantity: 1, unit: "г" }]); }
  function remove(i: number) { onChange(value.filter((_, idx) => idx !== i)); }
  function update(i: number, key: keyof TechCardLine, val: string | number) {
    onChange(value.map((l, idx) => idx === i ? { ...l, [key]: val } : l));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Техкарта (інгредієнти)</Label>
        <Button variant="ghost" size="sm" onClick={add} className="h-6 px-2 text-xs">
          <Plus className="w-3 h-3 mr-1" /> Додати
        </Button>
      </div>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground border border-dashed rounded p-2 text-center">
          Натисніть «Додати» щоб вказати інгредієнти
        </p>
      )}
      {value.map((line, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input placeholder="Назва інгредієнта" value={line.name}
            onChange={e => update(i, "name", e.target.value)} className="flex-1 h-8 text-sm" />
          <Input type="number" min="0" step="0.01" value={line.quantity}
            onChange={e => update(i, "quantity", parseFloat(e.target.value) || 0)}
            className="w-20 h-8 text-sm" />
          <Select value={line.unit} onValueChange={v => update(i, "unit", v)}>
            <SelectTrigger className="w-16 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["г","кг","мл","л","шт","ст.л","ч.л"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <button onClick={() => remove(i)} className="text-destructive hover:text-destructive/80">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
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
  function addOption(gi: number) {
    const g = groups[gi];
    updateGroup(gi, "options", [...g.options, { name: "", price_delta: 0, sort_order: g.options.length, is_available: true }]);
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
          <div className="space-y-1.5 pl-1">
            {g.options.map((o, oi) => (
              <div key={oi} className="flex items-center gap-2">
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
                <button onClick={() => removeOption(gi, oi)} className="text-destructive hover:text-destructive/80">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
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
    categoryId: leafCats[0]?.id ?? categories[0]?.id,
  };
  const [form, setForm] = useState<Partial<Item>>(blankItem);
  const [tab, setTab] = useState<"main" | "details" | "tech" | "modifiers">("main");
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [loadingMods, setLoadingMods] = useState(false);

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
          {(["main", "details", "tech", "modifiers"] as const).map(t => (
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Група ПДВ</Label>
                <Select value={String(form.tax_group_id || "")} onValueChange={v => set("tax_group_id", v ? parseInt(v) : undefined)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Оберіть групу" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— без прив'язки —</SelectItem>
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
            value={form.tech_card || []}
            onChange={v => set("tech_card", v)}
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

function ItemCard({ item, onEdit, onDelete, onToggleAvailable, onToggleStopList, onTogglePopular, onToggleVegetarian }: {
  item: Item;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAvailable: () => void;
  onToggleStopList: () => void;
  onTogglePopular: () => void;
  onToggleVegetarian: () => void;
}) {
  const src = imgSrc(item.image_url);
  const stopList = item.is_stop_list;

  return (
    <div className={`group relative border rounded-xl overflow-hidden bg-card hover:shadow-md transition-shadow ${stopList ? "opacity-60 border-destructive/40" : ""}`}>
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
        </div>
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <button onClick={onEdit} className="bg-white text-gray-900 rounded-lg p-2 hover:bg-gray-100" title="Редагувати">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onToggleAvailable} className="bg-white text-gray-900 rounded-lg p-2 hover:bg-gray-100" title={item.isAvailable ? "Приховати" : "Показати"}>
              {item.isAvailable ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button onClick={onToggleStopList} className={`rounded-lg p-2 ${stopList ? "bg-green-500 text-white hover:bg-green-600" : "bg-red-500 text-white hover:bg-red-600"}`} title={stopList ? "Прибрати зі стоп-листа" : "В стоп-лист"}>
              <AlertTriangle className="w-4 h-4" />
            </button>
            <button onClick={onDelete} className="bg-red-600 text-white rounded-lg p-2 hover:bg-red-700" title="Видалити">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={onTogglePopular} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 ${(item as any).is_popular ?? item.isPopular ? "bg-amber-400 text-white hover:bg-amber-500" : "bg-white/90 text-gray-700 hover:bg-white"}`}>
              <Star className="w-3.5 h-3.5" /> Топ
            </button>
            <button onClick={onToggleVegetarian} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 ${(item as any).is_vegetarian ?? item.isVegetarian ? "bg-green-500 text-white hover:bg-green-600" : "bg-white/90 text-gray-700 hover:bg-white"}`}>
              <Leaf className="w-3.5 h-3.5" /> Вег
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-1">
        <div className="font-medium text-sm leading-tight line-clamp-1">{item.name}</div>
        {item.description && <div className="text-xs text-muted-foreground line-clamp-2">{item.description}</div>}
        <div className="flex items-center justify-between pt-1">
          <div>
            <span className="font-semibold text-sm">{parseFloat(item.price).toFixed(0)} ₴</span>
            {item.price_happy && <span className="text-xs text-muted-foreground ml-1 line-through">{parseFloat(item.price_happy).toFixed(0)} ₴</span>}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{item.cookMinutes} хв</span>
          </div>
        </div>
        {(item.allergens || []).length > 0 && (
          <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 truncate">
            ⚠ {(item.allergens || []).map(a => ALLERGENS.find(al => al.key === a)?.label || a).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function FbMenu() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [expandedStations, setExpandedStations] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "available" | "stop" | "popular" | "vegetarian">("all");
  const [catDialog, setCatDialog] = useState<{ open: boolean; initial?: Partial<Category>; parentId?: number | null }>({ open: false });
  const [itemDialog, setItemDialog] = useState<{ open: boolean; initial?: Partial<Item> }>({ open: false });
  const [deleteCat, setDeleteCat] = useState<Category | null>(null);
  const [deleteItem, setDeleteItem] = useState<Item | null>(null);

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
  const allItems: Item[] = itemsData?.items || [];
  const taxGroups: TaxGroup[] = taxData?.taxGroups || [];

  // Stations = top-level categories with station field
  const stations = categories.filter(c => !c.parent_id && c.station).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  // Standalone categories = top-level without station (legacy / uncategorised)
  const standaloneLeafs = categories.filter(c => !c.parent_id && !c.station).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  // Auto-expand stations and select first subcat on load
  useEffect(() => {
    if (stations.length && expandedStations.size === 0) {
      const firstStation = stations[0];
      setExpandedStations(new Set([firstStation.id]));
      if (selectedCatId === null) setSelectedCatId(firstStation.id);
    }
  }, [stations.length]);

  function toggleExpanded(stationId: number) {
    setExpandedStations(prev => {
      const next = new Set(prev);
      if (next.has(stationId)) next.delete(stationId); else next.add(stationId);
      return next;
    });
  }

  // Item filtering — handle station → all subcats
  const items = allItems.filter(item => {
    const catId = (item as any).category_id ?? item.categoryId;
    if (selectedCatId !== null) {
      const selCat = categories.find(c => c.id === selectedCatId);
      if (selCat && !selCat.parent_id) {
        // Station selected → show items in station + all subcategories
        const stationCatIds = new Set([selectedCatId, ...categories.filter(c => c.parent_id === selectedCatId).map(c => c.id)]);
        if (!stationCatIds.has(catId)) return false;
      } else {
        // Subcategory or standalone → exact match
        if (catId !== selectedCatId) return false;
      }
    }
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !(item.description || "").toLowerCase().includes(search.toLowerCase())) return false;
    const isAvail = (item as any).is_available ?? item.isAvailable;
    const isPop   = (item as any).is_popular   ?? item.isPopular;
    const isVeg   = (item as any).is_vegetarian ?? item.isVegetarian;
    if (filter === "available" && !isAvail) return false;
    if (filter === "stop" && !item.is_stop_list) return false;
    if (filter === "popular" && !isPop) return false;
    if (filter === "vegetarian" && !isVeg) return false;
    return true;
  });

  // Count items under a station (all subcats + direct)
  function stationItemCount(stationId: number) {
    const subcatIds = new Set([stationId, ...categories.filter(c => c.parent_id === stationId).map(c => c.id)]);
    return allItems.filter(i => subcatIds.has((i as any).category_id ?? i.categoryId)).length;
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

  const deleteCategory = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/fb/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-categories"] });
      setDeleteCat(null);
      if (deleteCat?.id === selectedCatId) setSelectedCatId(null);
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
        tech_card: data.tech_card || null,
        sortOrder: data.sortOrder || 0,
      };
      let saved: any;
      if (data.id) {
        saved = await apiFetch(`/api/fb/items/${data.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        saved = await apiFetch("/api/fb/items", { method: "POST", body: JSON.stringify(payload) });
      }
      // Bulk-save modifier groups if item has id
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

  const toggleAvailable = (item: Item) =>
    apiFetch(`/api/fb/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ isAvailable: !item.isAvailable }) })
      .then(() => qc.invalidateQueries({ queryKey: ["fb-items"] }))
      .catch((e: any) => toast({ title: e.message, variant: "destructive" }));

  const toggleStopList = (item: Item) =>
    apiFetch(`/api/fb/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ is_stop_list: !item.is_stop_list }) })
      .then(() => qc.invalidateQueries({ queryKey: ["fb-items"] }))
      .catch((e: any) => toast({ title: e.message, variant: "destructive" }));

  const togglePopular = (item: Item) => {
    const cur = (item as any).is_popular ?? item.isPopular;
    apiFetch(`/api/fb/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ isPopular: !cur }) })
      .then(() => qc.invalidateQueries({ queryKey: ["fb-items"] }))
      .catch((e: any) => toast({ title: e.message, variant: "destructive" }));
  };

  const toggleVegetarian = (item: Item) => {
    const cur = (item as any).is_vegetarian ?? item.isVegetarian;
    apiFetch(`/api/fb/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ isVegetarian: !cur }) })
      .then(() => qc.invalidateQueries({ queryKey: ["fb-items"] }))
      .catch((e: any) => toast({ title: e.message, variant: "destructive" }));
  };

  const selectedCat = categories.find(c => c.id === selectedCatId);
  const selectedCatLabel = selectedCat
    ? (selectedCat.parent_id
      ? `${selectedCat.emoji} ${selectedCat.name}`
      : (STATION_TYPES.find(s => s.value === selectedCat.station)?.emoji || selectedCat.emoji) + ` ${selectedCat.name}`)
    : null;

  const FILTERS = [
    { value: "all", label: "Всі" },
    { value: "available", label: "Доступні" },
    { value: "stop", label: "Стоп-лист" },
    { value: "popular", label: "Топ" },
    { value: "vegetarian", label: "Веган" },
  ] as const;

  // Default category for new items
  const defaultCatId = selectedCatId
    ? (selectedCat?.parent_id ? selectedCatId : (categories.find(c => c.parent_id === selectedCatId)?.id ?? selectedCatId))
    : (categories[0]?.id);

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

        {/* ─── Left: Category Tree ──────────────────────────── */}
        <div className="w-60 shrink-0 border-r flex flex-col bg-background">
          <div className="px-3 py-2.5 border-b flex items-center justify-between">
            <span className="font-semibold text-sm">Меню</span>
            <span className="text-xs text-muted-foreground">{allItems.length} позицій</span>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {/* All shortcut */}
            <button onClick={() => setSelectedCatId(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors ${selectedCatId === null ? "bg-muted font-medium" : ""}`}>
              <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-left">Усі страви</span>
              <span className="text-xs text-muted-foreground">{allItems.length}</span>
            </button>

            {/* Station tree */}
            {stations.map(station => {
              const subcats = categories.filter(c => c.parent_id === station.id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
              const isExpanded = expandedStations.has(station.id);
              const isSelected = selectedCatId === station.id;
              const count = stationItemCount(station.id);
              const stationEmoji = STATION_TYPES.find(s => s.value === station.station)?.emoji || station.emoji;

              return (
                <div key={station.id}>
                  {/* Station row */}
                  <div className={`group relative flex items-center gap-1.5 px-2 py-2 cursor-pointer text-sm hover:bg-muted transition-colors ${isSelected ? "bg-muted font-medium" : ""}`}
                    onClick={() => { setSelectedCatId(station.id); if (!isExpanded) toggleExpanded(station.id); }}>
                    <button
                      className="p-0.5 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={e => { e.stopPropagation(); toggleExpanded(station.id); }}>
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <span className="text-base shrink-0">{stationEmoji}</span>
                    <span className="flex-1 truncate font-medium uppercase text-xs tracking-wide text-muted-foreground">{station.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{count}</span>
                    {/* Hover actions */}
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-0.5 bg-background border rounded shadow-sm z-10">
                      <button className="p-1 hover:bg-muted rounded" title="Нова підкатегорія"
                        onClick={e => { e.stopPropagation(); setCatDialog({ open: true, parentId: station.id }); }}>
                        <FolderPlus className="w-3 h-3" />
                      </button>
                      <button className="p-1 hover:bg-muted rounded" title="Редагувати"
                        onClick={e => { e.stopPropagation(); setCatDialog({ open: true, initial: station }); }}>
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button className="p-1 hover:bg-destructive/10 text-destructive rounded" title="Видалити"
                        onClick={e => { e.stopPropagation(); setDeleteCat(station); }}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Subcategories */}
                  {isExpanded && (
                    <>
                      {subcats.map(subcat => {
                        const subCount = allItems.filter(i => ((i as any).category_id ?? i.categoryId) === subcat.id).length;
                        const isSubSelected = selectedCatId === subcat.id;
                        return (
                          <div key={subcat.id}
                            className={`group relative flex items-center gap-2 pl-8 pr-2 py-1.5 cursor-pointer text-sm hover:bg-muted transition-colors ${isSubSelected ? "bg-muted font-medium" : ""} ${!subcat.isActive ? "opacity-50" : ""}`}
                            onClick={() => setSelectedCatId(subcat.id)}>
                            <span className="text-sm shrink-0">{subcat.emoji}</span>
                            <span className="flex-1 truncate">{subcat.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{subCount}</span>
                            <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-0.5 bg-background border rounded shadow-sm z-10">
                              <button className="p-1 hover:bg-muted rounded" title="Редагувати"
                                onClick={e => { e.stopPropagation(); setCatDialog({ open: true, initial: subcat }); }}>
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button className="p-1 hover:bg-destructive/10 text-destructive rounded" title="Видалити"
                                onClick={e => { e.stopPropagation(); setDeleteCat(subcat); }}>
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {/* Add subcategory row */}
                      <button
                        className="flex items-center gap-1.5 pl-8 pr-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 w-full transition-colors"
                        onClick={() => setCatDialog({ open: true, parentId: station.id })}>
                        <Plus className="w-3 h-3" />
                        <span>Нова підкатегорія</span>
                      </button>
                    </>
                  )}
                </div>
              );
            })}

            {/* Standalone leaf categories (legacy) */}
            {standaloneLeafs.length > 0 && (
              <div className="mt-1">
                {standaloneLeafs.length > 0 && <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Без станції</div>}
                {standaloneLeafs.map(cat => {
                  const catCount = allItems.filter(i => ((i as any).category_id ?? i.categoryId) === cat.id).length;
                  const isSel = selectedCatId === cat.id;
                  return (
                    <div key={cat.id}
                      className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-muted transition-colors ${isSel ? "bg-muted font-medium" : ""} ${!cat.isActive ? "opacity-50" : ""}`}
                      onClick={() => setSelectedCatId(cat.id)}>
                      <span className="text-base">{cat.emoji}</span>
                      <span className="flex-1 truncate">{cat.name}</span>
                      <span className="text-xs text-muted-foreground">{catCount}</span>
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-0.5 bg-background border rounded shadow-sm z-10">
                        <button className="p-1 hover:bg-muted rounded" onClick={e => { e.stopPropagation(); setCatDialog({ open: true, initial: cat }); }}>
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button className="p-1 hover:bg-destructive/10 text-destructive rounded" onClick={e => { e.stopPropagation(); setDeleteCat(cat); }}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom actions */}
          <div className="p-2 border-t space-y-1">
            <Button variant="ghost" className="w-full h-8 text-xs justify-start" onClick={() => setCatDialog({ open: true })}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Нова станція
            </Button>
          </div>
        </div>

        {/* ─── Right: Items ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b bg-background shrink-0">
            <div>
              <h1 className="font-semibold text-base">
                {selectedCatLabel ? selectedCatLabel : "🍽 Усі страви"}
              </h1>
              <p className="text-xs text-muted-foreground">{items.length} позицій{search ? " (відфільтровано)" : ""}</p>
            </div>

            <div className="flex-1 relative">
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

            <Button size="sm" onClick={() => setItemDialog({ open: true, initial: { categoryId: defaultCatId } })}>
              <Plus className="w-4 h-4 mr-1" /> Додати страву
            </Button>
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {itemsLoading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">Завантаження...</div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
                <Package className="w-10 h-10 opacity-30" />
                <p className="text-sm">{search ? "Нічого не знайдено" : "В цій категорії ще немає страв"}</p>
                {!search && (
                  <Button size="sm" onClick={() => setItemDialog({ open: true, initial: { categoryId: defaultCatId } })}>
                    <Plus className="w-4 h-4 mr-1" /> Додати першу страву
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {items.map(item => (
                  <ItemCard key={item.id}
                    item={item}
                    onEdit={() => setItemDialog({ open: true, initial: item })}
                    onDelete={() => setDeleteItem(item)}
                    onToggleAvailable={() => toggleAvailable(item)}
                    onToggleStopList={() => toggleStopList(item)}
                    onTogglePopular={() => togglePopular(item)}
                    onToggleVegetarian={() => toggleVegetarian(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Category Dialog ─────────────────────────────── */}
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
              {deleteCat?.parent_id ? "Страви у цій підкатегорії залишаться, але втратять прив'язку." : "Буде видалена станція разом з усіма підкатегоріями. Страви залишаться."}
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
            <AlertDialogDescription>Цю дію неможливо скасувати. Страва буде видалена назавжди.</AlertDialogDescription>
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
