import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { XCircle, Search, Plus, Trash2, Loader2, AlertTriangle, RefreshCw } from "lucide-react";

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

export default function FbStopList() {
  const [search, setSearch] = useState("");
  const [selItemId, setSelItemId] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stopData, isLoading } = useQuery({
    queryKey: ["fb-stop-list"],
    queryFn: () => apiFetch(`${API_APPS}/stop-list`),
  });
  const { data: itemsData } = useQuery({
    queryKey: ["fb-items-all"],
    queryFn: () => apiFetch(`${API_FB}/items`),
  });

  const stopItems: any[] = stopData?.items || [];
  const allItems: any[] = (itemsData?.items || []).filter((it: any) =>
    !stopItems.find(s => s.id === it.id) &&
    (!search || it.name.toLowerCase().includes(search.toLowerCase()))
  );

  const toggle = useMutation({
    mutationFn: ({ item_id, in_stop_list }: { item_id: number; in_stop_list: boolean }) =>
      apiFetch(`${API_APPS}/stop-list/toggle`, { method: "POST", body: JSON.stringify({ item_id, in_stop_list }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-stop-list"] }); qc.invalidateQueries({ queryKey: ["fb-items-all"] }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const clearAll = useMutation({
    mutationFn: () => apiFetch(`${API_APPS}/stop-list/clear`, { method: "POST" }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["fb-stop-list"] });
      qc.invalidateQueries({ queryKey: ["fb-items-all"] });
      toast({ title: `Стоп-лист очищено (${d.cleared} позицій)` });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const addItem = () => {
    if (!selItemId) return;
    toggle.mutate({ item_id: parseInt(selItemId), in_stop_list: true });
    setSelItemId("");
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <XCircle className="w-6 h-6 text-red-500" />
            <div>
              <h1 className="text-lg font-bold">Стоп-лист</h1>
              <p className="text-xs text-muted-foreground">Страви, недоступні для замовлення на касі та у гостьовому меню</p>
            </div>
          </div>
          {stopItems.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => clearAll.mutate()} disabled={clearAll.isPending}>
              {clearAll.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Очистити список
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6 max-w-2xl">
          {/* Add to stop list */}
          <div className="border rounded-xl p-4 space-y-3">
            <h2 className="font-semibold text-sm">Додати до стоп-листа</h2>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Пошук страв..." className="pl-8 h-9" />
              </div>
              <select value={selItemId} onChange={e => setSelItemId(e.target.value)}
                className="flex-1 border rounded-md px-3 py-2 text-sm bg-background">
                <option value="">Оберіть страву...</option>
                {allItems.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
              <Button onClick={addItem} disabled={!selItemId || toggle.isPending} size="sm">
                <Plus className="w-4 h-4 mr-1" /> Додати
              </Button>
            </div>
          </div>

          {/* Stop list */}
          <div className="border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-red-50 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="font-semibold text-sm text-red-800">Позиції у стоп-листі</span>
              <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{stopItems.length}</span>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : stopItems.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <XCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm">Стоп-лист порожній</p>
                <p className="text-xs mt-1">Усі позиції доступні для замовлення</p>
              </div>
            ) : (
              <div className="divide-y">
                {stopItems.map((it: any) => (
                  <div key={it.id} className="flex items-center justify-between px-4 py-3 hover:bg-red-50/50">
                    <div>
                      <span className="font-medium text-sm">{it.name}</span>
                      {it.category_name && <span className="text-xs text-muted-foreground ml-2">{it.category_name}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {it.price && <span className="text-xs font-mono text-muted-foreground">{parseFloat(it.price).toFixed(2)} ₴</span>}
                      <button onClick={() => toggle.mutate({ item_id: it.id, in_stop_list: false })}
                        className="p-1.5 text-red-400 hover:text-red-600 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Integrations promo */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Наші інші інтеграції</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { name: "Poster ↔ WordPress", desc: "Синхронізація меню з Poster на WordPress-сайт. Замовлення з сайту автоматично синхронізуються у Poster.", color: "bg-blue-50 border-blue-200 text-blue-800", abbr: "WP" },
                { name: "Сповіщення про залишки", desc: "Автоматичні сповіщення коли товар закінчується на складі. Список залишків одразу на касі.", color: "bg-amber-50 border-amber-200 text-amber-800", abbr: "SL" },
                { name: "FoodChain: листи закупок", desc: "Замовляйте товар у постачальників в один клік та автоматично ставте його на облік.", color: "bg-green-50 border-green-200 text-green-800", abbr: "FC" },
              ].map(app => (
                <div key={app.name} className={`border rounded-xl p-3 cursor-pointer hover:shadow-sm transition-shadow ${app.color.split(" ").slice(0, 2).join(" ")} border`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${app.color}`}>{app.abbr}</div>
                    <span className="font-medium text-sm">{app.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{app.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
