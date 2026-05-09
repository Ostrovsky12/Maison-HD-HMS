import { useState, useRef, useEffect } from "react";
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
  ArrowUp, ArrowDown, Eye, EyeOff, GripVertical,
  Layers, Package, Filter,
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
}

interface TechCardLine {
  name: string;
  quantity: number;
  unit: string;
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

// ─── Allergen options ─────────────────────────────────────────────────────────

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

const STATIONS = [
  { value: "kitchen_general", label: "Кухня (загальна)" },
  { value: "kitchen_cold", label: "Холодний цех" },
  { value: "kitchen_grill", label: "Гриль" },
  { value: "bar", label: "Бар" },
  { value: "pastry", label: "Кондитерська" },
];

const CATEGORY_EMOJIS = ["🍳","🍲","🍖","🥗","🍰","🥤","🍸","🍕","🍣","🍜","🥩","🥚","🥞","🍔","🌮","🍝","🥘","🍱","🍛","🫕"];

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

// ─── Category Dialog ──────────────────────────────────────────────────────────

function CategoryDialog({
  open, onClose, initial, onSave,
}: {
  open: boolean; onClose: () => void;
  initial?: Partial<Category>; onSave: (data: Partial<Category>) => void;
}) {
  const [form, setForm] = useState<Partial<Category>>(initial || { emoji: "🍽", name: "", isActive: true });

  useEffect(() => { if (open) setForm(initial || { emoji: "🍽", name: "", isActive: true }); }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Редагувати категорію" : "Нова категорія"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Емоджі</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {CATEGORY_EMOJIS.map(e => (
                <button key={e} onClick={() => setForm(f => ({ ...f, emoji: e }))}
                  className={`text-xl px-1 rounded hover:bg-muted ${form.emoji === e ? "bg-muted ring-1 ring-primary" : ""}`}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <Label>Назва *</Label>
            <Input value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" placeholder="Основні страви" />
          </div>
          <div>
            <Label>Опис (необов'язково)</Label>
            <Input value={form.description || ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" placeholder="Короткий опис категорії" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={!!form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
            <span className="text-sm">Активна</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => { if (form.name?.trim()) onSave(form); }} disabled={!form.name?.trim()}>Зберегти</Button>
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

// ─── Item Dialog ───────────────────────────────────────────────────────────────

function ItemDialog({
  open, onClose, initial, categories, taxGroups, onSave,
}: {
  open: boolean; onClose: () => void;
  initial?: Partial<Item>;
  categories: Category[];
  taxGroups: TaxGroup[];
  onSave: (data: Partial<Item>) => void;
}) {
  const blankItem: Partial<Item> = {
    name: "", description: "", price: "0", price_happy: undefined,
    cookMinutes: 15, isAvailable: true, isPopular: false, isVegetarian: false,
    is_alcohol: false, is_stop_list: false, allergens: [], tags: [],
    vat_rate: 20, station: "kitchen_general", tech_card: [],
    categoryId: categories[0]?.id,
  };
  const [form, setForm] = useState<Partial<Item>>(blankItem);
  const [tab, setTab] = useState<"main" | "details" | "tech">("main");

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...blankItem, ...initial } : blankItem);
      setTab("main");
    }
  }, [open, initial?.id]);

  function set(key: string, val: any) { setForm(f => ({ ...f, [key]: val })); }

  function toggleAllergen(key: string) {
    const list = form.allergens || [];
    set("allergens", list.includes(key) ? list.filter(a => a !== key) : [...list, key]);
  }

  const valid = !!form.name?.trim() && parseFloat(form.price || "0") >= 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? `Редагувати: ${initial.name}` : "Нова страва / напій"}</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b mb-4">
          {(["main", "details", "tech"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t === "main" ? "Основне" : t === "details" ? "Деталі" : "Техкарта"}
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
                <Select value={String(form.categoryId || "")} onValueChange={v => set("categoryId", parseInt(v))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Оберіть категорію" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.emoji} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Станція</Label>
                <Select value={form.station || "kitchen_general"} onValueChange={v => set("station", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
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
                    <Input value={form.excise_code || ""} onChange={e => set("excise_code", e.target.value)} className="mt-1" placeholder="Код акцизного бандерола" />
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

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => valid && onSave(form)} disabled={!valid}>
            {initial?.id ? "Зберегти зміни" : "Створити страву"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Item Card ─────────────────────────────────────────────────────────────────

function ItemCard({ item, onEdit, onDelete, onToggleAvailable, onToggleStopList }: {
  item: Item;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAvailable: () => void;
  onToggleStopList: () => void;
}) {
  const src = imgSrc(item.image_url);
  const stopList = item.is_stop_list;

  return (
    <div className={`group relative border rounded-xl overflow-hidden bg-card hover:shadow-md transition-shadow ${stopList ? "opacity-60 border-destructive/40" : ""}`}>
      {/* Photo */}
      <div className="relative h-36 bg-muted/40 flex items-center justify-center overflow-hidden">
        {src ? (
          <img src={src} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
            <Image className="w-8 h-8" />
            <span className="text-xs">Немає фото</span>
          </div>
        )}
        {/* Overlay badges */}
        <div className="absolute top-1.5 left-1.5 flex gap-1 flex-wrap">
          {stopList && <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded font-medium">СТОП</span>}
          {!item.isAvailable && !stopList && <span className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded">Прихована</span>}
          {item.isPopular && <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded">⭐ Топ</span>}
          {item.isVegetarian && <span className="bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded">🌿</span>}
          {item.is_alcohol && <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded">🍷</span>}
        </div>
        {/* Quick actions overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
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
      </div>

      {/* Info */}
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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "available" | "stop" | "popular" | "vegetarian">("all");
  const [catDialog, setCatDialog] = useState<{ open: boolean; initial?: Partial<Category> }>({ open: false });
  const [itemDialog, setItemDialog] = useState<{ open: boolean; initial?: Partial<Item> }>({ open: false });
  const [deleteCat, setDeleteCat] = useState<Category | null>(null);
  const [deleteItem, setDeleteItem] = useState<Item | null>(null);

  // Queries
  const { data: catsData } = useQuery({ queryKey: ["fb-categories"], queryFn: () => apiFetch("/api/fb/categories") });
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["fb-items", selectedCatId], queryFn: () => apiFetch("/api/fb/items" + (selectedCatId ? `?categoryId=${selectedCatId}` : "")),
  });
  const { data: taxData } = useQuery({ queryKey: ["fb-tax-groups"], queryFn: () => apiFetch("/api/fb/settings/tax-groups") });

  const categories: Category[] = catsData?.categories || [];
  const allItems: Item[] = itemsData?.items || [];
  const taxGroups: TaxGroup[] = taxData?.taxGroups || [];

  // Auto-select first category
  useEffect(() => { if (categories.length && selectedCatId === null) setSelectedCatId(categories[0].id); }, [categories]);

  // Filtered items
  const items = allItems.filter(item => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !(item.description || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "available" && !item.isAvailable) return false;
    if (filter === "stop" && !item.is_stop_list) return false;
    if (filter === "popular" && !item.isPopular) return false;
    if (filter === "vegetarian" && !item.isVegetarian) return false;
    return true;
  });

  // Mutations
  const saveCategory = useMutation({
    mutationFn: async (data: Partial<Category>) => {
      const payload = { name: data.name, emoji: data.emoji, isActive: data.isActive, description: data.description, sortOrder: data.sortOrder };
      if (data.id) return apiFetch(`/api/fb/categories/${data.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      return apiFetch("/api/fb/categories", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["fb-categories"] });
      setCatDialog({ open: false });
      toast({ title: v.id ? "Категорію оновлено" : "Категорію створено" });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/fb/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-categories"] });
      setDeleteCat(null);
      if (deleteCat?.id === selectedCatId) setSelectedCatId(null);
      toast({ title: "Категорію видалено" });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const saveItem = useMutation({
    mutationFn: async (data: Partial<Item>) => {
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
      if (data.id) return apiFetch(`/api/fb/items/${data.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      return apiFetch("/api/fb/items", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["fb-items"] });
      setItemDialog({ open: false });
      toast({ title: v.id ? "Страву оновлено" : "Страву створено" });
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

  const selectedCat = categories.find(c => c.id === selectedCatId);

  const FILTERS = [
    { value: "all", label: "Всі" },
    { value: "available", label: "Доступні" },
    { value: "stop", label: "Стоп-лист" },
    { value: "popular", label: "Топ" },
    { value: "vegetarian", label: "Веган" },
  ] as const;

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

        {/* ─── Left: Categories ─────────────────────────────── */}
        <div className="w-56 shrink-0 border-r flex flex-col bg-background">
          <div className="px-3 py-3 border-b flex items-center justify-between">
            <span className="font-semibold text-sm">Категорії</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCatDialog({ open: true })}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {/* All categories shortcut */}
            <button onClick={() => setSelectedCatId(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-none hover:bg-muted transition-colors ${selectedCatId === null ? "bg-muted font-medium" : ""}`}>
              <Layers className="w-4 h-4 text-muted-foreground" />
              <span>Усі страви</span>
              <span className="ml-auto text-xs text-muted-foreground">{allItems.length}</span>
            </button>

            {categories.map(cat => (
              <div key={cat.id} className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-muted transition-colors ${selectedCatId === cat.id ? "bg-muted font-medium" : ""} ${!cat.isActive ? "opacity-50" : ""}`}
                onClick={() => setSelectedCatId(cat.id)}>
                <span className="text-base">{cat.emoji}</span>
                <span className="flex-1 truncate">{cat.name}</span>
                <span className="text-xs text-muted-foreground">{allItems.filter(i => i.categoryId === cat.id).length}</span>
                <div className="absolute right-1 opacity-0 group-hover:opacity-100 flex gap-0.5 bg-background border rounded shadow-sm">
                  <button className="p-1 hover:bg-muted rounded" onClick={e => { e.stopPropagation(); setCatDialog({ open: true, initial: cat }); }} title="Редагувати">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button className="p-1 hover:bg-destructive/10 text-destructive rounded" onClick={e => { e.stopPropagation(); setDeleteCat(cat); }} title="Видалити">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t">
            <Button variant="ghost" className="w-full h-8 text-xs justify-start" onClick={() => setCatDialog({ open: true })}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Нова категорія
            </Button>
          </div>
        </div>

        {/* ─── Right: Items ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b bg-background shrink-0">
            <div>
              <h1 className="font-semibold text-base">
                {selectedCat ? `${selectedCat.emoji} ${selectedCat.name}` : "🍽 Усі страви"}
              </h1>
              <p className="text-xs text-muted-foreground">{items.length} позицій{search ? " (відфільтровано)" : ""}</p>
            </div>

            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук страв..." className="pl-8 h-8 text-sm" />
            </div>

            {/* Filters */}
            <div className="flex gap-1">
              {FILTERS.map(f => (
                <button key={f.value} onClick={() => setFilter(f.value as any)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${filter === f.value ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 hover:bg-muted"}`}>
                  {f.label}
                </button>
              ))}
            </div>

            <Button size="sm" onClick={() => setItemDialog({ open: true, initial: { categoryId: selectedCatId || categories[0]?.id } })}>
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
                  <Button size="sm" onClick={() => setItemDialog({ open: true, initial: { categoryId: selectedCatId || categories[0]?.id } })}>
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
        onSave={saveItem.mutate}
      />

      {/* ─── Delete Category ─────────────────────────────── */}
      <AlertDialog open={!!deleteCat} onOpenChange={v => !v && setDeleteCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити категорію «{deleteCat?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Увага: страви у цій категорії залишаться, але втратять прив'язку до категорії.
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
