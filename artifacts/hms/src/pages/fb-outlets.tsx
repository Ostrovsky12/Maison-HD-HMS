import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Store, Plus, Pencil, Trash2, Utensils, Coffee, Waves, Sun,
  Beer, Pizza, Check, AlertCircle, Table2, BookOpen, ChevronRight,
  ToggleLeft, ToggleRight, DollarSign, X, Settings2,
} from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";
function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  }).then(r => r.json());
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Outlet = {
  id: number; name: string; slug: string; description?: string;
  color: string; icon: string; is_active: boolean; is_seasonal: boolean;
  season_from?: string; season_until?: string; address?: string;
  sort_order: number; item_count: string; table_count: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const COLORS = [
  { value: "blue",   label: "Синій",   cls: "bg-blue-500" },
  { value: "green",  label: "Зелений", cls: "bg-green-500" },
  { value: "amber",  label: "Бурштин", cls: "bg-amber-500" },
  { value: "purple", label: "Фіолет",  cls: "bg-purple-500" },
  { value: "rose",   label: "Рожевий", cls: "bg-rose-500" },
  { value: "teal",   label: "Бірюз.",  cls: "bg-teal-500" },
  { value: "orange", label: "Помарач", cls: "bg-orange-500" },
  { value: "slate",  label: "Сірий",   cls: "bg-slate-500" },
];

const ICONS = [
  { value: "utensils", label: "Ресторан", Icon: Utensils },
  { value: "coffee",   label: "Кав'ярня", Icon: Coffee },
  { value: "waves",    label: "Басейн",   Icon: Waves },
  { value: "sun",      label: "Тераса",   Icon: Sun },
  { value: "beer",     label: "Бар",      Icon: Beer },
  { value: "pizza",    label: "Піца",     Icon: Pizza },
];

function getIconComponent(name: string) {
  return ICONS.find(i => i.value === name)?.Icon || Utensils;
}

function getColorClass(c: string) {
  return COLORS.find(x => x.value === c)?.cls || "bg-blue-500";
}

// ── Outlet form ───────────────────────────────────────────────────────────────
function OutletForm({ outlet, onClose }: { outlet?: Outlet; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!outlet;

  const [name, setName] = useState(outlet?.name || "");
  const [description, setDescription] = useState(outlet?.description || "");
  const [color, setColor] = useState(outlet?.color || "blue");
  const [icon, setIcon] = useState(outlet?.icon || "utensils");
  const [isActive, setIsActive] = useState(outlet?.is_active !== false);
  const [isSeasonal, setIsSeasonal] = useState(outlet?.is_seasonal || false);
  const [seasonFrom, setSeasonFrom] = useState(outlet?.season_from?.slice(0, 10) || "");
  const [seasonUntil, setSeasonUntil] = useState(outlet?.season_until?.slice(0, 10) || "");
  const [address, setAddress] = useState(outlet?.address || "");
  const [sortOrder, setSortOrder] = useState(String(outlet?.sort_order || 0));

  const save = useMutation({
    mutationFn: () => apiFetch(`/fb/outlets${isEdit ? `/${outlet!.id}` : ""}`, {
      method: isEdit ? "PATCH" : "POST",
      body: JSON.stringify({
        name, description, color, icon, is_active: isActive,
        is_seasonal: isSeasonal, season_from: seasonFrom || undefined,
        season_until: seasonUntil || undefined, address, sort_order: parseInt(sortOrder) || 0,
      }),
    }),
    onSuccess: (d) => {
      if (d.error) { toast({ title: "Помилка", description: d.error, variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["fb-outlets"] });
      toast({ title: isEdit ? "Збережено" : "Додано", description: name });
      onClose();
    },
  });

  const IconComp = getIconComponent(icon);

  return (
    <div className="space-y-5">
      {/* Preview */}
      <div className={`flex items-center gap-3 p-4 rounded-xl text-white ${getColorClass(color)}`}>
        <IconComp className="w-7 h-7" />
        <div>
          <div className="font-bold text-lg">{name || "Назва точки"}</div>
          {description && <div className="text-sm opacity-80">{description}</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Назва *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Літня тераса" className="mt-1" />
        </div>
        <div className="col-span-2">
          <Label>Опис</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Меню та ціни для літньої тераси (травень–вересень)" rows={2} className="mt-1 resize-none" />
        </div>
      </div>

      {/* Icon */}
      <div>
        <Label>Іконка</Label>
        <div className="flex gap-2 mt-2 flex-wrap">
          {ICONS.map(ic => (
            <button key={ic.value} onClick={() => setIcon(ic.value)}
              className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
                icon === ic.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}>
              <ic.Icon className="w-5 h-5" />
              {ic.label}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div>
        <Label>Колір</Label>
        <div className="flex gap-2 mt-2 flex-wrap">
          {COLORS.map(c => (
            <button key={c.value} onClick={() => setColor(c.value)}
              className={`w-8 h-8 rounded-full ${c.cls} transition-all ${color === c.value ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"}`}
              title={c.label} />
          ))}
        </div>
      </div>

      {/* Seasonal */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm flex items-center gap-2"><Sun className="w-4 h-4 text-amber-500" /> Сезонна точка</div>
            <div className="text-xs text-muted-foreground mt-0.5">Автоматичне вмикання / вимикання за датою</div>
          </div>
          <Switch checked={isSeasonal} onCheckedChange={setIsSeasonal} />
        </div>
        {isSeasonal && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <Label className="text-xs">Відкривається</Label>
              <Input type="date" value={seasonFrom} onChange={e => setSeasonFrom(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Закривається</Label>
              <Input type="date" value={seasonUntil} onChange={e => setSeasonUntil(e.target.value)} className="mt-1" />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Локація / адреса</Label>
          <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="2-й поверх, тераса..." className="mt-1" />
        </div>
        <div>
          <Label>Порядок відображення</Label>
          <Input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="mt-1" />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-sm">Активна</div>
          <div className="text-xs text-muted-foreground">Неактивні точки не відображаються в POS</div>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Скасувати</Button>
        <Button onClick={() => save.mutate()} disabled={!name || save.isPending}>
          {save.isPending ? "Збереження..." : isEdit ? "Зберегти" : "Створити точку"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Outlet Items panel ────────────────────────────────────────────────────────
function OutletItemsPanel({ outlet }: { outlet: Outlet }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [priceEdit, setPriceEdit] = useState<Record<number, string>>({});

  const { data } = useQuery({
    queryKey: ["fb-outlet-items", outlet.id],
    queryFn: () => apiFetch(`/fb/outlets/${outlet.id}/items`),
  });

  const toggle = useMutation({
    mutationFn: ({ itemId, is_available, price_override }: { itemId: number; is_available: boolean; price_override?: number | null }) =>
      apiFetch(`/fb/outlets/${outlet.id}/items`, {
        method: "POST",
        body: JSON.stringify({ item_id: itemId, is_available, price_override }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-outlet-items", outlet.id] }); },
  });

  const items: any[] = data?.items || [];
  const byCategory: Record<string, any[]> = {};
  for (const item of items) {
    const cat = item.category_name || "Без категорії";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  function effectiveAvailability(item: any): boolean {
    return item.is_available !== null ? item.is_available : item.globally_available;
  }

  function handlePriceSave(item: any) {
    const raw = priceEdit[item.id];
    if (!raw) return;
    const val = parseFloat(raw);
    toggle.mutate({ itemId: item.id, is_available: effectiveAvailability(item), price_override: isNaN(val) ? null : val });
    setPriceEdit(p => { const n = { ...p }; delete n[item.id]; return n; });
    toast({ title: "Ціну оновлено" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="w-4 h-4" />
        Вимкніть позиції, яких немає на цій точці, або встановіть іншу ціну (залиште порожнім для базової)
      </div>
      {Object.entries(byCategory).map(([cat, catItems]) => (
        <div key={cat}>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">{cat}</div>
          <div className="border rounded-xl divide-y overflow-hidden">
            {catItems.map(item => {
              const available = effectiveAvailability(item);
              const hasOverride = item.price_override !== null && item.price_override !== undefined;
              const isEditingPrice = priceEdit[item.id] !== undefined;

              return (
                <div key={item.id} className={`flex items-center gap-3 px-3 py-2.5 ${!available ? "opacity-50 bg-muted/30" : ""}`}>
                  <Switch
                    checked={available}
                    onCheckedChange={(v) => toggle.mutate({ itemId: item.id, is_available: v, price_override: item.price_override })}
                    className="shrink-0"
                  />
                  <span className="flex-1 text-sm font-medium">{item.name}</span>

                  {/* Price */}
                  {isEditingPrice ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={priceEdit[item.id]}
                        onChange={e => setPriceEdit(p => ({ ...p, [item.id]: e.target.value }))}
                        className="w-24 h-7 text-sm"
                        placeholder={String(item.base_price)}
                        autoFocus
                        onKeyDown={e => { if (e.key === "Enter") handlePriceSave(item); if (e.key === "Escape") setPriceEdit(p => { const n={...p}; delete n[item.id]; return n; }); }}
                      />
                      <button onClick={() => handlePriceSave(item)} className="text-green-600 hover:text-green-700">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setPriceEdit(p => { const n={...p}; delete n[item.id]; return n; })} className="text-muted-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPriceEdit(p => ({ ...p, [item.id]: String(hasOverride ? item.price_override : item.base_price) }))}
                      className={`flex items-center gap-1 text-sm px-2 py-0.5 rounded hover:bg-muted ${hasOverride ? "font-bold text-amber-600" : "text-muted-foreground"}`}>
                      {hasOverride && <DollarSign className="w-3.5 h-3.5" />}
                      {hasOverride ? item.price_override : item.base_price} ₴
                      {hasOverride && (
                        <span className="text-xs line-through ml-1 opacity-50">{item.base_price}</span>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Outlet Tables panel ───────────────────────────────────────────────────────
function OutletTablesPanel({ outlet }: { outlet: Outlet }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data } = useQuery({
    queryKey: ["fb-outlet-tables", outlet.id],
    queryFn: () => apiFetch(`/fb/outlets/${outlet.id}/tables`),
  });

  const [selected, setSelected] = useState<Set<number> | null>(null);
  const tables: any[] = data?.tables || [];

  const current = selected ?? new Set(tables.filter(t => t.assigned).map(t => t.id));

  const save = useMutation({
    mutationFn: () => apiFetch(`/fb/outlets/${outlet.id}/tables`, {
      method: "POST",
      body: JSON.stringify({ table_ids: [...current] }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-outlet-tables", outlet.id] });
      qc.invalidateQueries({ queryKey: ["fb-outlets"] });
      setSelected(null);
      toast({ title: "Столи збережено" });
    },
  });

  function toggle(id: number) {
    setSelected(prev => {
      const s = new Set(prev ?? tables.filter(t => t.assigned).map(t => t.id));
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Виберіть столи які належать до цієї точки продажу. Якщо жодного не вибрано — всі столи.
        </div>
        {selected !== null && (
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Збереження..." : "Зберегти"}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-6 gap-2">
        {tables.map(t => (
          <button key={t.id} onClick={() => toggle(t.id)}
            className={`aspect-square rounded-xl border-2 font-bold text-sm transition-all flex flex-col items-center justify-center gap-0.5 ${
              current.has(t.id)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:border-primary/40"
            }`}>
            <span>{t.number}</span>
            <span className="text-[10px] font-normal opacity-70">{t.location || ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function FbOutlets() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [formOutlet, setFormOutlet] = useState<null | "add" | Outlet>(null);
  const [detailOutlet, setDetailOutlet] = useState<Outlet | null>(null);
  const [detailTab, setDetailTab] = useState("items");

  const { data, isLoading } = useQuery({
    queryKey: ["fb-outlets"],
    queryFn: () => apiFetch("/fb/outlets"),
  });

  const deleteOutlet = useMutation({
    mutationFn: (id: number) => apiFetch(`/fb/outlets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-outlets"] });
      toast({ title: "Видалено" });
      setDetailOutlet(null);
    },
  });

  const outlets: Outlet[] = data?.outlets || [];

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Store className="w-6 h-6 text-primary" /> Точки продажу
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Ресторан, бар, тераса, зона басейну — кожна зі своїм меню та цінами
            </p>
          </div>
          <Button onClick={() => setFormOutlet("add")} className="gap-2">
            <Plus className="w-4 h-4" /> Додати точку
          </Button>
        </div>

        {/* Info banner */}
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <strong>Як це працює:</strong> Кожна точка продажу має власний набір страв з можливістю окремих цін. При відкритті замовлення офіціант обирає точку — і бачить лише її меню. Столи можна прив'язати до конкретної точки.
          </div>
        </div>

        {/* Outlets grid */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Завантаження...</div>
        ) : outlets.length === 0 ? (
          <div className="text-center py-16 border rounded-2xl">
            <Store className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-1">Немає точок продажу</h3>
            <p className="text-muted-foreground text-sm mb-4">Створіть першу точку — наприклад, "Ресторан" або "Літня тераса"</p>
            <Button onClick={() => setFormOutlet("add")}><Plus className="w-4 h-4 mr-2" />Додати точку</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {outlets.map(o => {
              const IconComp = getIconComponent(o.icon);
              const colorCls = getColorClass(o.color);

              return (
                <div key={o.id} className="border rounded-2xl overflow-hidden hover:border-primary/40 transition-colors">
                  {/* Color header */}
                  <div className={`${colorCls} px-5 py-4 flex items-center gap-3`}>
                    <div className="w-10 h-10 rounded-xl bg-white/25 flex items-center justify-center">
                      <IconComp className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-lg leading-tight">{o.name}</div>
                      {o.description && <div className="text-white/80 text-xs truncate">{o.description}</div>}
                    </div>
                    <div className="flex gap-1">
                      <Badge className={`text-xs ${o.is_active ? "bg-white/25 text-white" : "bg-black/30 text-white/70"} border-0`}>
                        {o.is_active ? "Активна" : "Неактивна"}
                      </Badge>
                      {o.is_seasonal && <Badge className="text-xs bg-amber-400/80 text-amber-900 border-0">Сезонна</Badge>}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="px-5 py-4">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-muted/50 rounded-xl p-3 text-center">
                        <div className="text-xl font-bold">{o.item_count}</div>
                        <div className="text-xs text-muted-foreground">страв у меню</div>
                      </div>
                      <div className="bg-muted/50 rounded-xl p-3 text-center">
                        <div className="text-xl font-bold">{o.table_count}</div>
                        <div className="text-xs text-muted-foreground">{parseInt(o.table_count) === 0 ? "всі столи" : "столів"}</div>
                      </div>
                    </div>

                    {o.address && (
                      <div className="text-xs text-muted-foreground mb-3">📍 {o.address}</div>
                    )}
                    {o.is_seasonal && o.season_from && o.season_until && (
                      <div className="text-xs text-amber-600 mb-3">
                        🌞 Сезон: {new Date(o.season_from).toLocaleDateString("uk-UA", { day: "numeric", month: "long" })} — {new Date(o.season_until).toLocaleDateString("uk-UA", { day: "numeric", month: "long" })}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => { setDetailOutlet(o); setDetailTab("items"); }}>
                        <BookOpen className="w-3.5 h-3.5" /> Меню
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => { setDetailOutlet(o); setDetailTab("tables"); }}>
                        <Table2 className="w-3.5 h-3.5" /> Столи
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setFormOutlet(o)}>
                        <Settings2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon"
                        onClick={() => { if (confirm(`Видалити точку "${o.name}"? Це скасує всі прив'язки меню і столів.`)) deleteOutlet.mutate(o.id); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit form dialog */}
      <Dialog open={formOutlet !== null} onOpenChange={o => !o && setFormOutlet(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formOutlet === "add" ? "Нова точка продажу" : `Редагувати: ${(formOutlet as Outlet)?.name}`}</DialogTitle>
          </DialogHeader>
          {formOutlet !== null && (
            <OutletForm outlet={formOutlet === "add" ? undefined : formOutlet as Outlet} onClose={() => setFormOutlet(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Detail dialog: menu + tables */}
      <Dialog open={detailOutlet !== null} onOpenChange={o => !o && setDetailOutlet(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailOutlet && (() => { const Icon = getIconComponent(detailOutlet.icon); return <Icon className="w-5 h-5" />; })()}
              {detailOutlet?.name}
            </DialogTitle>
          </DialogHeader>
          {detailOutlet && (
            <Tabs value={detailTab} onValueChange={setDetailTab}>
              <TabsList className="w-full">
                <TabsTrigger value="items" className="flex-1 gap-2"><BookOpen className="w-4 h-4" />Меню та ціни</TabsTrigger>
                <TabsTrigger value="tables" className="flex-1 gap-2"><Table2 className="w-4 h-4" />Столи</TabsTrigger>
              </TabsList>
              <TabsContent value="items" className="mt-4">
                <OutletItemsPanel outlet={detailOutlet} />
              </TabsContent>
              <TabsContent value="tables" className="mt-4">
                <OutletTablesPanel outlet={detailOutlet} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
