import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ExternalLink, Bot, QrCode, Printer, XCircle, Shield, Cpu, Truck,
  Plus, Trash2, Loader2, AlertTriangle, RefreshCw, Search, Star,
  ChevronRight, Brain, Save, Puzzle, UtensilsCrossed, Sparkles,
} from "lucide-react";

// ─── API ──────────────────────────────────────────────────────────────────────
const API_APPS = "/api/fb/apps";
const API_FB = "/api/fb";

async function apiFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Застосунки
// ─────────────────────────────────────────────────────────────────────────────
function CatalogTab({ onTabChange }: { onTabChange: (tab: string) => void }) {
  const [, nav] = useLocation();

  const OUR_APPS = [
    {
      id: "waiter",
      title: "Мобільний офіціант",
      description: "Приймайте замовлення зі смартфона або планшета. Офіціант бачить столи, замовлення та може друкувати рахунок прямо з телефону.",
      features: ["Перегляд столів та замовлень", "Прийом і редагування замовлень", "Виклик рахунку та оплата"],
      icon: UtensilsCrossed,
      gradient: "from-violet-600 to-violet-800",
      badge: null as string | null,
      action: () => window.open("/waiter", "_blank"),
      actionLabel: "Відкрити",
      actionIcon: ExternalLink,
    },
    {
      id: "ai-reports",
      title: "ШІ-звіти",
      description: "Ставте питання про ваш бізнес — отримуйте детальні аналітичні звіти. Підтримується аналіз продажів, меню, гостей та фудкосту.",
      features: ["Аналіз продажів та виторгу", "АВС-аналіз меню", "Звіти по касових змінах"],
      icon: Sparkles,
      gradient: "from-indigo-600 to-violet-700",
      badge: "Нове" as string | null,
      action: () => nav("/fb/reports"),
      actionLabel: "Відкрити звіти",
      actionIcon: ChevronRight,
    },
    {
      id: "qr",
      title: "QR-замовлення",
      description: "Гості сканують QR-код на столі та роблять замовлення самостійно. Підтримується онлайн-оплата, чайові та відгуки.",
      features: ["QR-коди для кожного столу", "Онлайн-меню у браузері гостя", "Оплата та чайові онлайн"],
      icon: QrCode,
      gradient: "from-emerald-600 to-teal-700",
      badge: null as string | null,
      action: () => nav("/fb/qr"),
      actionLabel: "Налаштувати",
      actionIcon: ChevronRight,
    },
  ];

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl">
        {OUR_APPS.map(app => {
          const Icon = app.icon;
          const ActionIcon = app.actionIcon;
          return (
            <div key={app.id} className="flex flex-col border rounded-2xl overflow-hidden bg-card hover:shadow-lg transition-all">
              <div className={`bg-gradient-to-br ${app.gradient} p-6 flex items-start justify-between`}>
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                {app.badge && (
                  <span className="text-[10px] font-bold bg-white/20 text-white px-2 py-1 rounded-full uppercase tracking-wide">
                    {app.badge}
                  </span>
                )}
              </div>
              <div className="p-5 flex flex-col flex-1 gap-4">
                <div>
                  <h3 className="font-bold text-base mb-1.5">{app.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{app.description}</p>
                </div>
                <ul className="space-y-1.5 flex-1">
                  {app.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={app.action}
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  {app.actionLabel}
                  <ActionIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Стоп-лист
// ─────────────────────────────────────────────────────────────────────────────
function imgSrc(url?: string | null) { return url || null; }

function StopListTab() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerCat, setPickerCat] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stopData, isLoading } = useQuery({ queryKey: ["fb-stop-list"], queryFn: () => apiFetch(`${API_APPS}/stop-list`) });
  const { data: itemsData } = useQuery({ queryKey: ["fb-items-all"], queryFn: () => apiFetch(`${API_FB}/items`) });
  const { data: catsData } = useQuery({ queryKey: ["fb-categories"], queryFn: () => apiFetch(`${API_FB}/categories`) });

  const stopItems: any[] = stopData?.items || [];
  const allItems: any[] = itemsData?.items || [];
  const categories: any[] = catsData?.categories || [];
  const availableItems = allItems.filter((it: any) => !stopItems.find(s => s.id === it.id));
  const pickerItems = availableItems.filter((it: any) => {
    const matchSearch = !pickerSearch || it.name.toLowerCase().includes(pickerSearch.toLowerCase());
    const matchCat = pickerCat === null || (it.category_id ?? it.categoryId) === pickerCat;
    return matchSearch && matchCat;
  });

  const toggle = useMutation({
    mutationFn: ({ item_id, in_stop_list }: { item_id: number; in_stop_list: boolean }) =>
      apiFetch(`${API_APPS}/stop-list/toggle`, { method: "POST", body: JSON.stringify({ item_id, in_stop_list }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-stop-list"] }); qc.invalidateQueries({ queryKey: ["fb-items-all"] }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });
  const clearAll = useMutation({
    mutationFn: () => apiFetch(`${API_APPS}/stop-list/clear`, { method: "POST" }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["fb-stop-list"] }); qc.invalidateQueries({ queryKey: ["fb-items-all"] }); toast({ title: `Стоп-лист очищено (${d.cleared} позицій)` }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b bg-background shrink-0 flex items-center gap-3">
        <XCircle className="w-5 h-5 text-red-500" />
        <div className="flex-1">
          <span className="font-medium text-sm">Стоп-лист</span>
          <span className="text-xs text-muted-foreground ml-2">Страви недоступні для замовлення на касі</span>
        </div>
        {stopItems.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => clearAll.mutate()} disabled={clearAll.isPending}>
            {clearAll.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />} Очистити
          </Button>
        )}
        <Button size="sm" onClick={() => { setPickerOpen(true); setPickerSearch(""); setPickerCat(null); }}>
          <Plus className="w-4 h-4 mr-1" /> Додати
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-5 max-w-2xl">
        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-red-50 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="font-semibold text-sm text-red-800">Позиції у стоп-листі</span>
            <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{stopItems.length}</span>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : stopItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <XCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm font-medium">Стоп-лист порожній</p>
              <p className="text-xs mt-1 mb-4">Усі позиції доступні для замовлення</p>
              <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}><Plus className="w-4 h-4 mr-1" /> Додати позицію</Button>
            </div>
          ) : (
            <div className="divide-y">
              {stopItems.map((it: any) => {
                const photo = imgSrc(it.image_url);
                return (
                  <div key={it.id} className="flex items-center gap-3 px-4 py-3 hover:bg-red-50/50">
                    {photo ? <img src={photo} alt={it.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      : <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0"><span className="text-lg">🍽</span></div>}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{it.name}</div>
                      {it.category_name && <div className="text-xs text-muted-foreground">{it.category_name}</div>}
                    </div>
                    {it.price && <span className="text-xs font-mono text-muted-foreground shrink-0">{parseFloat(it.price).toFixed(0)} ₴</span>}
                    <button onClick={() => toggle.mutate({ item_id: it.id, in_stop_list: false })} disabled={toggle.isPending}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>Вибрати страву для стоп-листа</DialogTitle>
          </DialogHeader>
          <div className="px-4 py-3 border-b shrink-0 flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Пошук страви..." className="pl-8" autoFocus />
            </div>
          </div>
          {categories.length > 0 && (
            <div className="px-4 py-2 border-b shrink-0 flex gap-1.5 overflow-x-auto">
              <button onClick={() => setPickerCat(null)} className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${pickerCat === null ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}>Усі</button>
              {categories.map((c: any) => (
                <button key={c.id} onClick={() => setPickerCat(pickerCat === c.id ? null : c.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${pickerCat === c.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}>
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4">
            {pickerItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground"><p className="text-sm">Немає доступних страв</p></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {pickerItems.map((it: any) => {
                  const photo = imgSrc(it.image_url);
                  return (
                    <button key={it.id} onClick={() => { toggle.mutate({ item_id: it.id, in_stop_list: true }); }} disabled={toggle.isPending}
                      className="group text-left border rounded-xl overflow-hidden hover:border-destructive hover:shadow-md transition-all">
                      <div className="h-24 bg-muted/40 flex items-center justify-center overflow-hidden">
                        {photo ? <img src={photo} alt={it.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" /> : <span className="text-3xl">🍽</span>}
                      </div>
                      <div className="p-2">
                        <div className="text-xs font-medium leading-tight line-clamp-2">{it.name}</div>
                        {it.price && <div className="text-xs text-muted-foreground mt-0.5">{parseFloat(it.price).toFixed(0)} ₴</div>}
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-red-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          <AlertTriangle className="w-3 h-3" /> В стоп-лист
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t shrink-0 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{pickerItems.length} страв доступно</span>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Закрити</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Друк ТК та НФ
// ─────────────────────────────────────────────────────────────────────────────
function PrintCardsTab() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [printSubTab, setPrintSubTab] = useState<"print" | "settings">("print");

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ["fb-print-cards", categoryFilter],
    queryFn: () => apiFetch(`${API_APPS}/print-cards/items${categoryFilter !== "all" ? `?category_id=${categoryFilter}` : ""}`),
  });
  const { data: catData } = useQuery({ queryKey: ["fb-categories"], queryFn: () => apiFetch(`${API_FB}/categories`) });

  const items: any[] = (itemsData?.items || []).filter((it: any) => !search || it.name.toLowerCase().includes(search.toLowerCase()));
  const categories: any[] = catData?.categories || [];

  const grouped: Record<string, any[]> = {};
  for (const item of items) {
    const key = item.category_name || "Без категорії";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  function toggleItem(id: number) { setSelected(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; }); }
  function toggleAll(ids: number[]) {
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => { const s = new Set(prev); if (allSelected) ids.forEach(id => s.delete(id)); else ids.forEach(id => s.add(id)); return s; });
  }

  function handlePrint() {
    const toPrint = items.filter(it => selected.has(it.id));
    if (!toPrint.length) return;
    const printWin = window.open("", "_blank", "width=800,height=600");
    if (!printWin) return;
    const html = `<!DOCTYPE html><html><head><title>Друк ТК</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:0}.card{border:1px solid #ccc;padding:16px;margin:8px;display:inline-block;width:300px;vertical-align:top;page-break-inside:avoid}h2{font-size:14px;margin:0 0 8px}table{width:100%;border-collapse:collapse}td{padding:3px 6px;border:1px solid #eee}.label{color:#666}@media print{body{margin:0}}</style></head><body>${toPrint.map(it => `<div class="card"><h2>${it.name}</h2><table><tr><td class="label">Категорія</td><td>${it.category_name||"—"}</td></tr><tr><td class="label">Цех</td><td>${it.workshop_name||"—"}</td></tr><tr><td class="label">Штрихкод</td><td>${it.barcode||"—"}</td></tr><tr><td class="label">Вихід, кг</td><td>${it.weight_g?(it.weight_g/1000).toFixed(3):"—"}</td></tr></table></div>`).join("")}</body></html>`;
    printWin.document.write(html);
    printWin.document.close();
    printWin.print();
  }

  const allIds = items.map(it => it.id);
  const allChecked = allIds.length > 0 && allIds.every(id => selected.has(id));

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-5 bg-background shrink-0">
        <div className="flex gap-0">
          {[["print", "Друк"], ["settings", "Налаштування"]].map(([val, label]) => (
            <button key={val} onClick={() => setPrintSubTab(val as "print" | "settings")}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${printSubTab === val ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {printSubTab === "print" && (
        <>
          <div className="px-4 py-3 border-b flex gap-3 items-center bg-background shrink-0">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-2.5 top-2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук..." className="pl-8 h-8 text-sm" />
            </div>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border rounded-md px-3 py-1.5 text-sm bg-background h-8">
              <option value="all">Категорія</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="border-b bg-muted/30 px-4 py-2 flex items-center gap-3 text-xs text-muted-foreground uppercase font-medium shrink-0">
            <input type="checkbox" checked={allChecked} onChange={() => toggleAll(allIds)} className="w-4 h-4 rounded" />
            <span className="flex-1">Назва</span>
            <span className="w-32">Категорія</span>
            <span className="w-24">Штрихкод</span>
            <span className="w-20">Цех</span>
            <span className="w-16 text-right">Вихід</span>
          </div>
          <div className="flex-1 overflow-auto">
            {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
              : items.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-center"><Printer className="w-10 h-10 text-muted-foreground mb-3" /><p className="font-medium">Позицій не знайдено</p></div>
              : Object.entries(grouped).map(([catName, catItems]) => (
                <div key={catName}>
                  <div className="flex items-center gap-3 px-4 py-2 bg-muted/20 border-b sticky top-0">
                    <input type="checkbox" checked={catItems.every(it => selected.has(it.id))} onChange={() => toggleAll(catItems.map(it => it.id))} className="w-4 h-4 rounded" />
                    <span className="text-sm font-semibold">{catName}</span>
                  </div>
                  {catItems.map(it => (
                    <div key={it.id} className={`flex items-center gap-3 px-4 py-2.5 border-b hover:bg-muted/10 ${selected.has(it.id) ? "bg-primary/5" : ""}`}>
                      <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleItem(it.id)} className="w-4 h-4 rounded" />
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0"><span className="text-xs text-muted-foreground">?</span></div>
                        <span className="text-sm font-medium truncate">{it.name}</span>
                      </div>
                      <span className="w-32 text-xs text-muted-foreground truncate">{it.category_name || "—"}</span>
                      <span className="w-24 font-mono text-xs text-muted-foreground">{it.barcode || "—"}</span>
                      <span className="w-20 text-xs text-muted-foreground">{it.workshop_name || "Бар"}</span>
                      <span className="w-16 text-right text-xs text-muted-foreground">{it.weight_g ? `${(it.weight_g / 1000).toFixed(3)} кг` : "Ні"}</span>
                    </div>
                  ))}
                </div>
              ))}
          </div>
          <div className="border-t px-4 py-3 flex items-center justify-between bg-background shrink-0">
            <span className="text-sm text-muted-foreground">Всього обрано <span className="font-semibold text-foreground">{selected.size} шт</span></span>
            <Button onClick={handlePrint} disabled={selected.size === 0}><Printer className="w-4 h-4 mr-1.5" /> Друк</Button>
          </div>
        </>
      )}

      {printSubTab === "settings" && (
        <div className="flex-1 overflow-auto p-5">
          <div className="max-w-md space-y-4">
            <h2 className="font-semibold">Налаштування друку</h2>
            <p className="text-sm text-muted-foreground">Оберіть формат та параметри для друку технологічних карток.</p>
            <div>
              <label className="text-sm font-medium">Формат паперу</label>
              <select className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background">
                <option>A4</option><option>A5</option><option>Термолента 80мм</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="show_recipe" className="rounded" defaultChecked />
              <label htmlFor="show_recipe" className="text-sm">Показувати рецептуру</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="show_barcode" className="rounded" defaultChecked />
              <label htmlFor="show_barcode" className="text-sm">Показувати штрихкод</label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Postie AI
// ─────────────────────────────────────────────────────────────────────────────
const TASKS = [
  { emoji: "🥑", title: "Розпізнати накладну", desc: "Введення накладної з фотографії", free: false },
  { emoji: "🔮", title: "Проаналізувати дані", desc: "Аналіз продажів, складу та фінансів", free: true },
  { emoji: "🤠", title: "Контроль фудкосту", desc: "Аналіз фудкосту та рекомендації по цінах", free: true, featured: true },
  { emoji: "💰", title: "Імпортувати виписку з банку", desc: "Швидке створення фінансових транзакцій з файлу", free: false },
];

function PostieTab() {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4 py-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-2xl shadow-lg">🤖</div>
          <div>
            <h2 className="text-xl font-bold">Добрий день!</h2>
            <p className="text-muted-foreground">Чим Postie може бути корисною сьогодні?</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Використано</span>
            <button className="flex items-center gap-1 text-sm border rounded-lg px-3 py-1.5 hover:bg-muted/50">
              <span className="font-medium">0 з 120 дій</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {TASKS.map(task => (
            <div key={task.title} className={`relative border rounded-xl p-5 cursor-pointer transition-all hover:shadow-md hover:border-violet-300 ${"featured" in task && task.featured ? "border-violet-200 bg-violet-50" : "bg-card"}`}>
              {task.free && (
                <Badge className="absolute top-3 right-3 text-[10px] bg-green-100 text-green-800 border-green-200 font-medium">Безкоштовно</Badge>
              )}
              <div className="text-3xl mb-3">{task.emoji}</div>
              <h3 className="font-semibold text-sm mb-1">{task.title}</h3>
              <p className="text-xs text-muted-foreground mb-4">{task.desc}</p>
              <Button size="sm" variant={"featured" in task && task.featured ? "default" : "outline"} className="w-full">Розпочати</Button>
            </div>
          ))}
        </div>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800">
          <div className="flex items-center gap-2 font-medium mb-1"><Brain className="w-4 h-4" />Як це працює?</div>
          <p className="text-xs text-violet-700">Postie — AI-асистент від Poster, що допомагає автоматизувати рутинні задачі вашого ресторанного бізнесу. Кожна дія використовує 1 кредит. Базовий план включає 120 дій на місяць.</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Delivery Bot
// ─────────────────────────────────────────────────────────────────────────────
function DeliveryBotTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["fb-delivery-bot"], queryFn: () => apiFetch(`${API_APPS}/delivery-bot`) });
  const { data: catData } = useQuery({ queryKey: ["fb-categories"], queryFn: () => apiFetch(`${API_FB}/categories`) });

  const [botToken, setBotToken] = useState("");
  const [delivery, setDelivery] = useState(true);
  const [pickup, setPickup] = useState(true);
  const [dineIn, setDineIn] = useState(false);
  const [language, setLanguage] = useState("uk");
  const [contacts, setContacts] = useState("");
  const [payOnline, setPayOnline] = useState(false);
  const [payCash, setPayCash] = useState(true);
  const [payCard, setPayCard] = useState(true);
  const [activeCats, setActiveCats] = useState<number[]>([]);
  const [botSubTab, setBotSubTab] = useState<"settings" | "broadcasts" | "extra">("settings");

  useState(() => {
    if (data?.settings) {
      const s = data.settings;
      setBotToken(s.bot_token || "");
      setDelivery(s.delivery_enabled ?? true);
      setPickup(s.pickup_enabled ?? true);
      setDineIn(s.dine_in_enabled ?? false);
      setLanguage(s.language || "uk");
      setContacts(s.contacts_html || "");
      setPayOnline(s.pay_online ?? false);
      setPayCash(s.pay_cash ?? true);
      setPayCard(s.pay_card_on_delivery ?? true);
      setActiveCats(s.active_category_ids || []);
    }
  });

  const save = useMutation({
    mutationFn: () => apiFetch(`${API_APPS}/delivery-bot`, {
      method: "PUT",
      body: JSON.stringify({ bot_token: botToken || null, delivery_enabled: delivery, pickup_enabled: pickup, dine_in_enabled: dineIn, language, contacts_html: contacts || null, pay_online: payOnline, pay_cash: payCash, pay_card_on_delivery: payCard, active_category_ids: activeCats }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-delivery-bot"] }); toast({ title: "Налаштування збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const categories: any[] = catData?.categories || [];

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  const hasToken = !!botToken;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b bg-background shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="w-5 h-5 text-sky-600" />
          <span className="font-medium text-sm">Poster Delivery Bot</span>
          {!hasToken && <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Не підключено</span>}
        </div>
        <div className="flex items-center gap-2">
          <a href="https://t.me/BotFather" target="_blank" rel="noopener" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
            <ExternalLink className="w-3 h-3" /> Підтримка
          </a>
          <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />} Зберегти
          </Button>
        </div>
      </div>

      <div className="border-b px-5 bg-background shrink-0">
        <div className="flex gap-0">
          {[["settings", "Налаштування бота"], ["broadcasts", "Розсилки"], ["extra", "Додатково"]].map(([val, label]) => (
            <button key={val} onClick={() => setBotSubTab(val as "settings" | "broadcasts" | "extra")}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${botSubTab === val ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {botSubTab === "settings" && (
        <div className="flex-1 overflow-auto p-5">
          <div className="max-w-xl space-y-6">
            <div>
              <Label>API-ключ Telegram-бота</Label>
              <Input value={botToken} onChange={e => setBotToken(e.target.value)} placeholder="123456789:AABBCCDDEEFFaabbccddeeff..." className="mt-1 font-mono text-sm" />
            </div>
            <div className="space-y-3">
              {[{ label: "Доставлення", val: delivery, set: setDelivery }, { label: "Навинос", val: pickup, set: setPickup }, { label: "У закладі", val: dineIn, set: setDineIn }].map(({ label, val, set }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{label}</span>
                  <Switch checked={val} onCheckedChange={set} />
                </div>
              ))}
            </div>
            <div>
              <Label>Мова</Label>
              <div className="flex gap-2 mt-1">
                {[["uk", "Українська"], ["ru", "Російська"], ["uz", "O'zbek"]].map(([code, label]) => (
                  <button key={code} onClick={() => setLanguage(code)}
                    className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors ${language === code ? "border-primary bg-primary/5 text-primary" : "border-input hover:bg-muted/50"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Контакти</Label>
              <textarea value={contacts} onChange={e => setContacts(e.target.value)} placeholder="Ваші контактні дані для бота..."
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background h-24 resize-none" />
            </div>
            <div>
              <h3 className="font-semibold mb-3">Оплата</h3>
              <div className="space-y-3">
                {[{ label: "Онлайн-оплата", val: payOnline, set: setPayOnline }, { label: "Готівкою", val: payCash, set: setPayCash }, { label: "Карткою при отриманні", val: payCard, set: setPayCard }].map(({ label, val, set }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm">{label}</span>
                    <Switch checked={val} onCheckedChange={set} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Відображення меню в боті</h3>
              <div className="space-y-2 mt-3">
                {categories.map((cat: any) => (
                  <div key={cat.id} className="flex items-center justify-between">
                    <span className="text-sm">{cat.name}</span>
                    <Switch checked={activeCats.includes(cat.id)} onCheckedChange={() => setActiveCats(prev => prev.includes(cat.id) ? prev.filter(c => c !== cat.id) : [...prev, cat.id])} />
                  </div>
                ))}
                {categories.length === 0 && <p className="text-xs text-muted-foreground">Категорій не знайдено.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {botSubTab === "broadcasts" && (
        <div className="flex-1 overflow-auto p-5">
          <div className="max-w-xl space-y-4">
            <h2 className="font-semibold">Розсилки</h2>
            <div className="bg-muted/30 rounded-xl p-6 text-center">
              <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">Розсилки недоступні</p>
              <p className="text-sm text-muted-foreground mt-1">Спочатку налаштуйте Telegram-бота та підключіть підписку</p>
            </div>
          </div>
        </div>
      )}

      {botSubTab === "extra" && (
        <div className="flex-1 overflow-auto p-5">
          <div className="max-w-xl space-y-4">
            <h2 className="font-semibold">Додатково</h2>
            <p className="text-sm text-muted-foreground">Додаткові налаштування Telegram-бота будуть доступні після підключення.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: "catalog",     label: "Каталог" },
  { id: "stop-list",   label: "Стоп-лист" },
  { id: "print-cards", label: "Друк ТК та НФ" },
  { id: "postie",      label: "Postie AI" },
  { id: "delivery",    label: "Delivery Bot" },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FbApps() {
  const [tab, setTab] = useState<TabId>("catalog");

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center gap-3">
          <Puzzle className="w-5 h-5 text-violet-600 shrink-0" />
          <div>
            <h1 className="text-lg font-bold">Застосунки F&B</h1>
            <p className="text-xs text-muted-foreground">Додаткові функції для вашого закладу</p>
          </div>
        </div>

        <div className="border-b bg-background shrink-0 overflow-x-auto">
          <div className="flex px-4 min-w-max">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {tab === "catalog"     && <CatalogTab onTabChange={(t) => setTab(t as TabId)} />}
          {tab === "stop-list"   && <StopListTab />}
          {tab === "print-cards" && <PrintCardsTab />}
          {tab === "postie"      && <PostieTab />}
          {tab === "delivery"    && <DeliveryBotTab />}
        </div>
      </div>
    </AppLayout>
  );
}
