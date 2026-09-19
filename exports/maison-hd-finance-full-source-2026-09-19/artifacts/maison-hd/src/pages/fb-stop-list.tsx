import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { XCircle, Search, Plus, Trash2, Loader2, AlertTriangle, RefreshCw, ChevronRight } from "lucide-react";

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

function imgSrc(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return url;
}

export default function FbStopList() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerCat, setPickerCat] = useState<number | null>(null);
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

  const { data: catsData } = useQuery({
    queryKey: ["fb-categories"],
    queryFn: () => apiFetch(`${API_FB}/categories`),
  });

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-stop-list"] });
      qc.invalidateQueries({ queryKey: ["fb-items-all"] });
    },
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

  const addToStop = (item: any) => {
    toggle.mutate({ item_id: item.id, in_stop_list: true });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <XCircle className="w-6 h-6 text-red-500" />
            <div>
              <h1 className="text-lg font-bold">Стоп-лист</h1>
              <p className="text-xs text-muted-foreground">Страви, недоступні для замовлення на касі та у гостьовому меню</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stopItems.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => clearAll.mutate()} disabled={clearAll.isPending}>
                {clearAll.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Очистити список
              </Button>
            )}
            <Button size="sm" onClick={() => { setPickerOpen(true); setPickerSearch(""); setPickerCat(null); }}>
              <Plus className="w-4 h-4 mr-1" /> Додати позицію
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-2xl space-y-4">
          {/* Stop list */}
          <div className="border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-red-50 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="font-semibold text-sm text-red-800">Позиції у стоп-листі</span>
              <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{stopItems.length}</span>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : stopItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <XCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm font-medium">Стоп-лист порожній</p>
                <p className="text-xs mt-1 mb-4">Усі позиції доступні для замовлення</p>
                <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Додати позицію
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {stopItems.map((it: any) => {
                  const photo = imgSrc(it.image_url);
                  return (
                    <div key={it.id} className="flex items-center gap-3 px-4 py-3 hover:bg-red-50/50">
                      {photo ? (
                        <img src={photo} alt={it.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <span className="text-lg">🍽</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{it.name}</div>
                        {it.category_name && (
                          <div className="text-xs text-muted-foreground">{it.category_name}</div>
                        )}
                      </div>
                      {it.price && (
                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                          {parseFloat(it.price).toFixed(0)} ₴
                        </span>
                      )}
                      <button
                        onClick={() => toggle.mutate({ item_id: it.id, in_stop_list: false })}
                        disabled={toggle.isPending}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0"
                        title="Прибрати зі стоп-листа"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Visual Item Picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>Вибрати страву для стоп-листа</DialogTitle>
          </DialogHeader>

          {/* Search + category filter */}
          <div className="px-4 py-3 border-b shrink-0 flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="Пошук страви..."
                className="pl-8"
                autoFocus
              />
            </div>
          </div>

          {/* Category tabs */}
          {categories.length > 0 && (
            <div className="px-4 py-2 border-b shrink-0 flex gap-1.5 overflow-x-auto">
              <button
                onClick={() => setPickerCat(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${pickerCat === null ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
              >
                Усі
              </button>
              {categories.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setPickerCat(pickerCat === c.id ? null : c.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${pickerCat === c.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
                >
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {pickerItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">Немає доступних страв</p>
                {pickerSearch && <p className="text-xs mt-1">Спробуйте змінити пошуковий запит</p>}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {pickerItems.map((it: any) => {
                  const photo = imgSrc(it.image_url);
                  return (
                    <button
                      key={it.id}
                      onClick={() => addToStop(it)}
                      disabled={toggle.isPending}
                      className="group text-left border rounded-xl overflow-hidden hover:border-destructive hover:shadow-md transition-all"
                    >
                      {/* Photo */}
                      <div className="h-24 bg-muted/40 flex items-center justify-center overflow-hidden">
                        {photo ? (
                          <img src={photo} alt={it.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <span className="text-3xl">🍽</span>
                        )}
                      </div>
                      {/* Info */}
                      <div className="p-2">
                        <div className="text-xs font-medium leading-tight line-clamp-2">{it.name}</div>
                        {it.price && (
                          <div className="text-xs text-muted-foreground mt-0.5">{parseFloat(it.price).toFixed(0)} ₴</div>
                        )}
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
            <span className="text-xs text-muted-foreground">
              {pickerItems.length} страв доступно для вибору
            </span>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Закрити
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
