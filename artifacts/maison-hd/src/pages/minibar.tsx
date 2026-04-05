import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, X, Save, Loader2, QrCode, Wine,
  Coffee, Candy, Sparkles, Package, Eye, EyeOff, ShoppingCart,
  CheckCircle2, RefreshCw,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
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

const DEFAULT_ITEMS = [
  { name: "Пиво Stella Artois 0.5л", price: 120, category: "alcohol", emoji: "🍺" },
  { name: "Пиво Corona 0.33л", price: 130, category: "alcohol", emoji: "🍺" },
  { name: "Вино червоне 0.2л", price: 150, category: "alcohol", emoji: "🍷" },
  { name: "Шампанське Martini 0.2л", price: 180, category: "alcohol", emoji: "🥂" },
  { name: "Вода Моршинська 0.5л", price: 45, category: "drinks", emoji: "💧" },
  { name: "Coca-Cola 0.33л", price: 70, category: "drinks", emoji: "🥤" },
  { name: "Сік яблучний 0.25л", price: 65, category: "drinks", emoji: "🧃" },
  { name: "Red Bull 0.25л", price: 120, category: "drinks", emoji: "⚡" },
  { name: "Чіпси Lay's", price: 85, category: "snacks", emoji: "🥔" },
  { name: "Шоколад Milka 100г", price: 110, category: "snacks", emoji: "🍫" },
  { name: "Горішки мікс 50г", price: 95, category: "snacks", emoji: "🥜" },
  { name: "Кава розчинна", price: 50, category: "drinks", emoji: "☕" },
];

type MinibarItem = {
  id: number; name: string; price: string; category: string; emoji: string;
  isActive: boolean; sortOrder: number; description?: string; propertyId?: number | null;
};

const emptyForm = { name: "", price: "", category: "drinks", emoji: "🍺", description: "", isActive: true };

export default function MinibarPage() {
  const [items, setItems] = useState<MinibarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [units, setUnits] = useState<Array<{ id: number; name: string; propertyName: string }>>([]);
  const [qrUnit, setQrUnit] = useState<{ id: number; name: string } | null>(null);
  const [seeding, setSeeding] = useState(false);

  const fetchItems = () => {
    setLoading(true);
    authFetch(`${API}/minibar/items`)
      .then(r => r.json())
      .then(d => { setItems(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const fetchUnits = () => {
    authFetch(`${API}/units`)
      .then(r => r.json())
      .then(async d => {
        const list = Array.isArray(d) ? d : (d.units || []);
        // Fetch properties to get names
        const propsRes = await authFetch(`${API}/properties`);
        const props = await propsRes.json();
        const propMap: Record<number, string> = {};
        (Array.isArray(props) ? props : (props.properties || [])).forEach((p: any) => { propMap[p.id] = p.name; });
        setUnits(list.map((u: any) => ({ id: u.id, name: u.name, propertyName: propMap[u.propertyId] || "" })));
      });
  };

  useEffect(() => { fetchItems(); fetchUnits(); }, []);

  const handleSave = async () => {
    if (!form.name || !form.price) { toast({ title: "Вкажіть назву та ціну", variant: "destructive" }); return; }
    setSaving(true);
    const url = editId ? `${API}/minibar/items/${editId}` : `${API}/minibar/items`;
    const method = editId ? "PUT" : "POST";
    const r = await authFetch(url, { method, body: JSON.stringify({ ...form, price: parseFloat(form.price) }) });
    setSaving(false);
    if (r.ok) {
      toast({ title: editId ? "✅ Збережено" : "✅ Додано", description: form.name });
      setForm(emptyForm); setEditId(null); setShowForm(false);
      fetchItems();
    } else {
      toast({ title: "Помилка", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Видалити "${name}"?`)) return;
    await authFetch(`${API}/minibar/items/${id}`, { method: "DELETE" });
    toast({ title: "Видалено", description: name });
    fetchItems();
  };

  const handleEdit = (item: MinibarItem) => {
    setForm({ name: item.name, price: item.price, category: item.category, emoji: item.emoji, description: item.description || "", isActive: item.isActive });
    setEditId(item.id);
    setShowForm(true);
  };

  const handleToggleActive = async (item: MinibarItem) => {
    await authFetch(`${API}/minibar/items/${item.id}`, { method: "PUT", body: JSON.stringify({ ...item, price: parseFloat(item.price), isActive: !item.isActive }) });
    fetchItems();
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    for (const item of DEFAULT_ITEMS) {
      await authFetch(`${API}/minibar/items`, { method: "POST", body: JSON.stringify(item) });
    }
    setSeeding(false);
    toast({ title: "✅ Додано стандартний асортимент", description: `${DEFAULT_ITEMS.length} позицій` });
    fetchItems();
  };

  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    items: items.filter(i => i.category === cat.value),
  })).filter(g => g.items.length > 0);

  const totalActive = items.filter(i => i.isActive).length;
  const qrUrl = (unitId: number) => {
    const origin = window.location.origin;
    return `${origin}${BASE}/minibar-guest/${unitId}`;
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
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
            <Button onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> Додати позицію
            </Button>
          </div>
        </div>

        <Tabs defaultValue="catalog">
          <TabsList>
            <TabsTrigger value="catalog" className="gap-2"><Package className="w-4 h-4" /> Каталог</TabsTrigger>
            <TabsTrigger value="qr" className="gap-2"><QrCode className="w-4 h-4" /> QR-коди</TabsTrigger>
          </TabsList>

          {/* ── CATALOG TAB ── */}
          <TabsContent value="catalog" className="space-y-4 pt-4">
            {/* Add/Edit form */}
            {showForm && (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{editId ? "Редагувати позицію" : "Нова позиція"}</CardTitle>
                    <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }}>
                      <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-1">
                      <Label className="text-xs text-muted-foreground">Емодзі</Label>
                      <Input className="mt-1 text-center text-xl" value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} maxLength={2} />
                    </div>
                    <div className="col-span-6">
                      <Label className="text-xs text-muted-foreground">Назва *</Label>
                      <Input className="mt-1" placeholder="Пиво Stella Artois 0.5л" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Ціна (₴) *</Label>
                      <Input className="mt-1" type="number" placeholder="120" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs text-muted-foreground">Категорія</Label>
                      <select
                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                        value={form.category}
                        onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      >
                        {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Опис (необов'язково)</Label>
                    <Input className="mt-1" placeholder="0.5л, охолоджене..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {editId ? "Зберегти" : "Додати"}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }}>Скасувати</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : items.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="py-16 text-center">
                  <Wine className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground font-medium mb-2">Каталог порожній</p>
                  <p className="text-sm text-muted-foreground mb-4">Додайте позиції вручну або завантажте стандартний асортимент</p>
                  <Button onClick={handleSeedDefaults} disabled={seeding} className="gap-2">
                    {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Завантажити стандартний асортимент
                  </Button>
                </CardContent>
              </Card>
            ) : (
              grouped.map(group => (
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
                                {item.isActive ? <Eye className="w-3.5 h-3.5 text-emerald-500" /> : <EyeOff className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => handleEdit(item)} className="p-1.5 rounded hover:bg-muted transition-colors">
                                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
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

          {/* ── QR CODES TAB ── */}
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
                      {/* Simple QR visual placeholder — real QR via link */}
                      <div className="w-24 h-24 mx-auto bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
                        <QrCode className="w-10 h-10 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{unit.name}</p>
                        <p className="text-xs text-muted-foreground">{unit.propertyName}</p>
                      </div>
                      <div className="space-y-1.5">
                        <a
                          href={qrUrl(unit.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full"
                        >
                          <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                            <Eye className="w-3 h-3" /> Переглянути
                          </Button>
                        </a>
                        <Button
                          size="sm"
                          className="w-full gap-1.5 text-xs"
                          onClick={() => {
                            const url = qrUrl(unit.id);
                            navigator.clipboard.writeText(url);
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
    </AppLayout>
  );
}
