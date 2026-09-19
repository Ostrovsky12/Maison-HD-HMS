import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Printer, Search, Star } from "lucide-react";

const API = "/api/fb";
const API_APPS = "/api/fb/apps";
async function apiFetch(url: string) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

export default function FbPrintCards() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showFavorites, setShowFavorites] = useState(false);

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ["fb-print-cards", categoryFilter],
    queryFn: () => apiFetch(`${API_APPS}/print-cards/items${categoryFilter !== "all" ? `?category_id=${categoryFilter}` : ""}`),
  });
  const { data: catData } = useQuery({
    queryKey: ["fb-categories"],
    queryFn: () => apiFetch(`${API}/categories`),
  });

  const items: any[] = (itemsData?.items || []).filter((it: any) =>
    !search || it.name.toLowerCase().includes(search.toLowerCase())
  );
  const categories: any[] = catData?.categories || [];

  // Group by category
  const grouped: Record<string, any[]> = {};
  for (const item of items) {
    const key = item.category_name || "Без категорії";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  function toggleItem(id: number) {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function toggleAll(ids: number[]) {
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const s = new Set(prev);
      if (allSelected) ids.forEach(id => s.delete(id));
      else ids.forEach(id => s.add(id));
      return s;
    });
  }

  function handlePrint() {
    const toPrint = items.filter(it => selected.has(it.id));
    if (!toPrint.length) return;
    const printWin = window.open("", "_blank", "width=800,height=600");
    if (!printWin) return;
    const html = `<!DOCTYPE html><html><head><title>Друк ТК</title><style>
      body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; }
      .card { border: 1px solid #ccc; padding: 16px; margin: 8px; display: inline-block; width: 300px; vertical-align: top; page-break-inside: avoid; }
      h2 { font-size: 14px; margin: 0 0 8px; } table { width: 100%; border-collapse: collapse; }
      td { padding: 3px 6px; border: 1px solid #eee; } .label { color: #666; }
      @media print { body { margin: 0; } }
    </style></head><body>
      ${toPrint.map(it => `
        <div class="card">
          <h2>${it.name}</h2>
          <table>
            <tr><td class="label">Категорія</td><td>${it.category_name || "—"}</td></tr>
            <tr><td class="label">Цех</td><td>${it.workshop_name || "—"}</td></tr>
            <tr><td class="label">Штрихкод</td><td>${it.barcode || "—"}</td></tr>
            <tr><td class="label">Вихід, кг</td><td>${it.weight_g ? (it.weight_g / 1000).toFixed(3) : "—"}</td></tr>
          </table>
        </div>`).join("")}
    </body></html>`;
    printWin.document.write(html);
    printWin.document.close();
    printWin.print();
  }

  const allIds = items.map(it => it.id);
  const allChecked = allIds.length > 0 && allIds.every(id => selected.has(id));

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Printer className="w-6 h-6 text-slate-600" />
            <div>
              <h1 className="text-lg font-bold">Друк ТК та НФ</h1>
            </div>
          </div>
        </div>

        <Tabs defaultValue="print" className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b px-6 bg-background">
            <TabsList className="h-9 gap-1 bg-transparent p-0">
              <TabsTrigger value="print" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-3 h-9 text-sm">Друк</TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-3 h-9 text-sm">Налаштування</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="print" className="flex-1 flex flex-col overflow-hidden m-0">
            {/* Toolbar */}
            <div className="px-4 py-3 border-b flex gap-3 items-center bg-background">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-2.5 top-2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Пошук..." className="pl-8 h-8 text-sm" />
              </div>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm bg-background h-8">
                <option value="all">Категорія</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={showFavorites} onChange={e => setShowFavorites(e.target.checked)} />
                <Star className="w-3.5 h-3.5 text-amber-400" /> Обрані
              </label>
            </div>

            {/* Table header */}
            <div className="border-b bg-muted/30 px-4 py-2 flex items-center gap-3 text-xs text-muted-foreground uppercase font-medium shrink-0">
              <input type="checkbox" checked={allChecked}
                onChange={() => toggleAll(allIds)}
                className="w-4 h-4 rounded" />
              <span className="flex-1">Назва</span>
              <span className="w-32">Категорія</span>
              <span className="w-24">Штрихкод</span>
              <span className="w-20">Цех</span>
              <span className="w-16 text-right">Вихід</span>
              <span className="w-24 text-right">Дії</span>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-auto">
              {isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Printer className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="font-medium">Позицій не знайдено</p>
                </div>
              ) : (
                Object.entries(grouped).map(([catName, catItems]) => (
                  <div key={catName}>
                    <div className="flex items-center gap-3 px-4 py-2 bg-muted/20 border-b sticky top-0">
                      <input type="checkbox"
                        checked={catItems.every(it => selected.has(it.id))}
                        onChange={() => toggleAll(catItems.map(it => it.id))}
                        className="w-4 h-4 rounded" />
                      <span className="text-sm font-semibold">{catName}</span>
                    </div>
                    {catItems.map(it => (
                      <div key={it.id} className={`flex items-center gap-3 px-4 py-2.5 border-b hover:bg-muted/10 ${selected.has(it.id) ? "bg-primary/5" : ""}`}>
                        <input type="checkbox" checked={selected.has(it.id)}
                          onChange={() => toggleItem(it.id)} className="w-4 h-4 rounded" />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0">
                            <span className="text-xs text-muted-foreground">?</span>
                          </div>
                          <span className="text-sm font-medium truncate">{it.name}</span>
                        </div>
                        <span className="w-32 text-xs text-muted-foreground truncate">{it.category_name || "—"}</span>
                        <span className="w-24 font-mono text-xs text-muted-foreground">{it.barcode || "—"}</span>
                        <span className="w-20 text-xs text-muted-foreground">{it.workshop_name || "Бар"}</span>
                        <span className="w-16 text-right text-xs text-muted-foreground">
                          {it.weight_g ? `${(it.weight_g / 1000).toFixed(3)} кг` : "Ні"}
                        </span>
                        <div className="w-24 flex justify-end gap-2 text-xs">
                          <button className="text-primary hover:underline">Ред.</button>
                          <button className="text-muted-foreground hover:text-primary hover:underline">Перегляд</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Bottom bar */}
            <div className="border-t px-4 py-3 flex items-center justify-between bg-background shrink-0">
              <span className="text-sm text-muted-foreground">
                Всього обрано <span className="font-semibold text-foreground">{selected.size} шт</span>
              </span>
              <Button onClick={handlePrint} disabled={selected.size === 0}>
                <Printer className="w-4 h-4 mr-1.5" /> Друк
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="flex-1 overflow-auto m-0 p-6">
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
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
