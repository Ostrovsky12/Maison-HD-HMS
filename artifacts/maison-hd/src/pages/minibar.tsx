import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Plus, Trash2, X, Loader2, QrCode, Wine,
  Sparkles, Package, Eye, EyeOff, Search, CheckCircle2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const API_FB = BASE.replace("/maison-hd", "") + "/api/fb";
const tok = () => localStorage.getItem("hms_token");
const authFetch = (url: string, opts?: RequestInit) =>
  fetch(url, { ...opts, headers: { ...(opts?.headers || {}), Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" } });

const CATEGORIES = [
  { value: "drinks", label: "Напої", emoji: "🥤" },
  { value: "alcohol", label: "Алкоголь", emoji: "🍷" },
  { value: "snacks", label: "Снеки", emoji: "🍫" },
  { value: "personal_care", label: "Засоби гігієни", emoji: "🧴" },
  { value: "other", label: "Інше", emoji: "📦" },
];

type MinibarItem = {
  id: number; name: string; price: string; category: string; emoji: string;
  isActive: boolean; sortOrder: number; description?: string; propertyId?: number | null;
};

type FbItem = {
  id: number; name: string; price: string; description?: string | null;
  categoryName?: string; categoryEmoji?: string; is_alcohol?: boolean;
  is_stop_list?: boolean; is_available?: boolean;
};

function guessMinibarCategory(item: FbItem): string {
  if (item.is_alcohol) return "alcohol";
  const cat = (item.categoryName || "").toLowerCase();
  if (cat.includes("бар") || cat.includes("напо") || cat.includes("напій")) return "drinks";
  if (cat.includes("снек") || cat.includes("десерт") || cat.includes("закуск")) return "snacks";
  return "other";
}

export default function MinibarPage() {
  const [items, setItems] = useState<MinibarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<Array<{ id: number; name: string; propertyName: string }>>([]);
  const [seeding, setSeeding] = useState(false);

  const [showDialog, setShowDialog] = useState(false);
  const [fbItems, setFbItems] = useState<FbItem[]>([]);
  const [fbLoading, setFbLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);

  const fetchItems = () => {
    setLoading(true);
    authFetch(`${API}/minibar/items`)
      .then(r => r.json())
      .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const fetchUnits = () => {
    authFetch(`${API}/units`)
      .then(r => r.json())
      .then(async d => {
        const list = Array.isArray(d) ? d : (d.units || []);
        const propsRes = await authFetch(`${API}/properties`);
        const props = await propsRes.json();
        const propMap: Record<number, string> = {};
        (Array.isArray(props) ? props : (props.properties || [])).forEach((p: any) => { propMap[p.id] = p.name; });
        setUnits(list.map((u: any) => ({ id: u.id, name: u.name, propertyName: propMap[u.propertyId] || "" })));
      });
  };

  const fetchFbItems = async () => {
    setFbLoading(true);
    try {
      const r = await authFetch(`${API_FB}/items`);
      const d = await r.json();
      const all: FbItem[] = Array.isArray(d) ? d : (d.items || []);
      setFbItems(all.filter(i => !i.is_stop_list));
    } catch {
      toast({ title: "Не вдалось завантажити каталог", variant: "destructive" });
    }
    setFbLoading(false);
  };

  useEffect(() => { fetchItems(); fetchUnits(); }, []);

  const openDialog = () => {
    setSearch("");
    setSelected(new Set());
    setShowDialog(true);
    if (fbItems.length === 0) fetchFbItems();
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const alreadyInMinibar = useMemo(() => {
    const names = new Set(items.map(i => i.name.toLowerCase()));
    return names;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return fbItems.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.categoryName || "").toLowerCase().includes(q)
    );
  }, [fbItems, search]);

  const grouped = useMemo(() => {
    const map: Record<string, FbItem[]> = {};
    filtered.forEach(item => {
      const key = item.categoryName || "Інше";
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return Object.entries(map);
  }, [filtered]);

  const handleAddSelected = async () => {
    if (selected.size === 0) return;
    setAdding(true);
    const toAdd = fbItems.filter(i => selected.has(i.id));
    let added = 0;
    for (const item of toAdd) {
      const r = await authFetch(`${API}/minibar/items`, {
        method: "POST",
        body: JSON.stringify({
          name: item.name,
          description: item.description || "",
          price: parseFloat(item.price),
          category: guessMinibarCategory(item),
          emoji: item.categoryEmoji || "📦",
          isActive: true,
        }),
      });
      if (r.ok) added++;
    }
    setAdding(false);
    setShowDialog(false);
    toast({ title: `✅ Додано ${added} позицій до мінібару` });
    fetchItems();
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Видалити "${name}"?`)) return;
    await authFetch(`${API}/minibar/items/${id}`, { method: "DELETE" });
    toast({ title: "Видалено", description: name });
    fetchItems();
  };

  const handleToggleActive = async (item: MinibarItem) => {
    await authFetch(`${API}/minibar/items/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...item, price: parseFloat(item.price), isActive: !item.isActive }),
    });
    fetchItems();
  };

  const DEFAULT_ITEMS = [
    { name: "Пиво Stella Artois 0.5л", price: 120, category: "alcohol", emoji: "🍺" },
    { name: "Пиво Corona 0.33л", price: 130, category: "alcohol", emoji: "🍺" },
    { name: "Вино червоне 0.2л", price: 150, category: "alcohol", emoji: "🍷" },
    { name: "Вода Моршинська 0.5л", price: 45, category: "drinks", emoji: "💧" },
    { name: "Coca-Cola 0.33л", price: 70, category: "drinks", emoji: "🥤" },
    { name: "Red Bull 0.25л", price: 120, category: "drinks", emoji: "⚡" },
    { name: "Чіпси Lay's", price: 85, category: "snacks", emoji: "🥔" },
    { name: "Шоколад Milka 100г", price: 110, category: "snacks", emoji: "🍫" },
  ];

  const handleSeedDefaults = async () => {
    setSeeding(true);
    for (const item of DEFAULT_ITEMS) {
      await authFetch(`${API}/minibar/items`, { method: "POST", body: JSON.stringify(item) });
    }
    setSeeding(false);
    toast({ title: "✅ Додано стандартний асортимент", description: `${DEFAULT_ITEMS.length} позицій` });
    fetchItems();
  };

  const grouped2 = CATEGORIES.map(cat => ({
    ...cat,
    items: items.filter(i => i.category === cat.value),
  })).filter(g => g.items.length > 0);

  const totalActive = items.filter(i => i.isActive).length;
  const qrUrl = (unitId: number) => `${window.location.origin}${BASE}/minibar-guest/${unitId}`;

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wine className="w-6 h-6 text-primary" /> Мінібар
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {totalActive} активних позицій · гості самостійно фіксують через QR-код
            </p>
          </div>
          <div className="flex items-center gap-2">
            {items.length === 0 && (
              <Button variant="outline" onClick={handleSeedDefaults} disabled={seeding} className="gap-2">
                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Стандартний асортимент
              </Button>
            )}
            <Button onClick={openDialog} className="gap-2">
              <Plus className="w-4 h-4" /> Додати позицію
            </Button>
          </div>
        </div>

        <Tabs defaultValue="catalog">
          <TabsList>
            <TabsTrigger value="catalog" className="gap-2"><Package className="w-4 h-4" /> Каталог</TabsTrigger>
            <TabsTrigger value="qr" className="gap-2"><QrCode className="w-4 h-4" /> QR-коди</TabsTrigger>
          </TabsList>

          <TabsContent value="catalog" className="space-y-4 pt-4">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : items.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="py-16 text-center">
                  <Wine className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground font-medium mb-2">Каталог порожній</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Додайте позиції з каталогу товарів або завантажте стандартний асортимент
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <Button onClick={openDialog} className="gap-2">
                      <Plus className="w-4 h-4" /> Обрати з каталогу
                    </Button>
                    <Button variant="outline" onClick={handleSeedDefaults} disabled={seeding} className="gap-2">
                      {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Стандартний асортимент
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              grouped2.map(group => (
                <Card key={group.value} className="shadow-sm">
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <span>{group.emoji}</span> {group.label}
                      <Badge variant="outline" className="text-xs">{group.items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="divide-y">
                      {group.items.map(item => (
                        <div key={item.id} className={`flex items-center justify-between py-2.5 ${!item.isActive ? "opacity-40" : ""}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-xl w-7">{item.emoji}</span>
                            <div>
                              <p className="font-medium text-sm">{item.name}</p>
                              {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold tabular-nums">₴{parseFloat(item.price).toFixed(0)}</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleToggleActive(item)}
                                className="p-1.5 rounded hover:bg-muted transition-colors"
                                title={item.isActive ? "Деактивувати" : "Активувати"}
                              >
                                {item.isActive
                                  ? <Eye className="w-3.5 h-3.5 text-emerald-500" />
                                  : <EyeOff className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => handleDelete(item.id, item.name)} className="p-1.5 rounded hover:bg-muted transition-colors">
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="qr" className="space-y-4 pt-4">
            <Card className="bg-blue-50/50 border-blue-100">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm text-blue-800">
                  <strong>Як це працює:</strong> Роздрукуйте QR-код для кожного будинку і розмістіть на мінібарі.
                  Гість сканує телефоном, бачить список позицій і відмічає що він взяв — всe автоматично потрапляє в його рахунок.
                  Жодного логіну не потрібно.
                </p>
              </CardContent>
            </Card>

            {units.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="py-10 text-center text-muted-foreground">
                  Не знайдено жодного будинку/номеру
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {units.map(unit => (
                  <Card key={unit.id} className="shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="pt-4 pb-4 text-center space-y-3">
                      <div className="w-24 h-24 mx-auto bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
                        <QrCode className="w-10 h-10 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{unit.name}</p>
                        <p className="text-xs text-muted-foreground">{unit.propertyName}</p>
                      </div>
                      <div className="space-y-1.5">
                        <a href={qrUrl(unit.id)} target="_blank" rel="noopener noreferrer" className="block w-full">
                          <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                            <Eye className="w-3 h-3" /> Переглянути
                          </Button>
                        </a>
                        <Button
                          size="sm"
                          className="w-full gap-1.5 text-xs"
                          onClick={() => {
                            navigator.clipboard.writeText(qrUrl(unit.id));
                            toast({ title: "✅ Посилання скопійовано", description: unit.name });
                          }}
                        >
                          <QrCode className="w-3 h-3" /> Скопіювати посилання
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground break-all">{qrUrl(unit.id)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Dialog: select from fb_items catalog ── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle>Обрати позиції з каталогу товарів</DialogTitle>
              <button onClick={() => setShowDialog(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Пошук по назві або категорії..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
            {fbLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : fbItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Каталог товарів порожній</p>
                <p className="text-sm mt-1">Спочатку додайте позиції у розділі F&B → Меню</p>
              </div>
            ) : grouped.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Нічого не знайдено</div>
            ) : (
              grouped.map(([catName, catItems]) => (
                <div key={catName}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{catName}</p>
                  <div className="space-y-1">
                    {catItems.map(item => {
                      const isSelected = selected.has(item.id);
                      const alreadyAdded = alreadyInMinibar.has(item.name.toLowerCase());
                      return (
                        <button
                          key={item.id}
                          disabled={alreadyAdded}
                          onClick={() => !alreadyAdded && toggleSelect(item.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all
                            ${alreadyAdded
                              ? "opacity-40 cursor-not-allowed bg-muted/30 border-transparent"
                              : isSelected
                                ? "bg-primary/10 border-primary/40 shadow-sm"
                                : "hover:bg-muted/50 border-transparent hover:border-muted"
                            }`}
                        >
                          <span className="text-lg shrink-0">{item.categoryEmoji || "📦"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{item.name}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                            )}
                          </div>
                          <span className="font-semibold text-sm tabular-nums shrink-0">
                            ₴{parseFloat(item.price).toFixed(0)}
                          </span>
                          <div className="w-5 shrink-0 flex items-center justify-center">
                            {alreadyAdded
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              : isSelected
                                ? <CheckCircle2 className="w-4 h-4 text-primary" />
                                : <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                            }
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-6 py-4 border-t shrink-0 flex items-center justify-between bg-background">
            <p className="text-sm text-muted-foreground">
              {selected.size > 0
                ? `Обрано ${selected.size} позицій`
                : "Оберіть позиції для додавання до мінібару"
              }
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Скасувати</Button>
              <Button onClick={handleAddSelected} disabled={selected.size === 0 || adding} className="gap-2">
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Додати до мінібару
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
