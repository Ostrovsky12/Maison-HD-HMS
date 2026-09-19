import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Ban, Plus, Trash2, Loader2, FolderX, PackageX } from "lucide-react";

const API_MKT = "/api/fb/marketing";
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

export default function FbExceptions() {
  const [selCat, setSelCat] = useState("");
  const [selItem, setSelItem] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: exData, isLoading } = useQuery({
    queryKey: ["fb-exceptions"],
    queryFn: () => apiFetch(`${API_MKT}/loyalty-exceptions`),
  });
  const { data: catData } = useQuery({
    queryKey: ["fb-categories"],
    queryFn: () => apiFetch(`${API_FB}/categories`),
  });
  const { data: itemData } = useQuery({
    queryKey: ["fb-items-all"],
    queryFn: () => apiFetch(`${API_FB}/items`),
  });

  const exceptions: any[] = exData?.exceptions || [];
  const catExceptions = exceptions.filter(e => e.exception_type === "category");
  const itemExceptions = exceptions.filter(e => e.exception_type === "item");
  const categories: any[] = catData?.categories || [];
  const items: any[] = itemData?.items || [];

  const addCat = useMutation({
    mutationFn: () => {
      const cat = categories.find(c => String(c.id) === selCat);
      if (!cat) throw new Error("Оберіть категорію");
      return apiFetch(`${API_MKT}/loyalty-exceptions`, {
        method: "POST",
        body: JSON.stringify({ exception_type: "category", ref_id: cat.id, name: cat.name }),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-exceptions"] }); setSelCat(""); toast({ title: "Категорію додано до винятків" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const addItem = useMutation({
    mutationFn: () => {
      const item = items.find(i => String(i.id) === selItem);
      if (!item) throw new Error("Оберіть товар");
      return apiFetch(`${API_MKT}/loyalty-exceptions`, {
        method: "POST",
        body: JSON.stringify({ exception_type: "item", ref_id: item.id, name: item.name, category_name: item.category_name }),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-exceptions"] }); setSelItem(""); toast({ title: "Товар додано до винятків" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`${API_MKT}/loyalty-exceptions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-exceptions"] }); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <Ban className="w-6 h-6 text-red-500" />
            <div>
              <h1 className="text-lg font-bold">Винятки</h1>
              <p className="text-xs text-muted-foreground">Категорії та товари, на які не поширюються бонуси та знижки</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-8 max-w-2xl">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* ─── Category exceptions ─────────────────────────────────── */}
              <div className="border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b bg-muted/30 flex items-center gap-3">
                  <FolderX className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <h2 className="font-semibold">Категорії-винятки <span className="text-muted-foreground font-normal ml-1">{catExceptions.length}</span></h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Категорії товарів та тех. карток, на які не поширюються бонуси та знижки</p>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <select value={selCat} onChange={e => setSelCat(e.target.value)}
                      className="flex-1 border rounded-md px-3 py-2 text-sm bg-background">
                      <option value="">Оберіть категорію...</option>
                      {categories
                        .filter((c: any) => !catExceptions.find(e => e.ref_id === c.id))
                        .map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <Button variant="outline" onClick={() => addCat.mutate()} disabled={!selCat || addCat.isPending}>
                      {addCat.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      <span className="ml-1">Додати</span>
                    </Button>
                  </div>
                  {catExceptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Категорій-винятків немає</p>
                  ) : (
                    <div className="divide-y border rounded-lg overflow-hidden">
                      {catExceptions.map(e => (
                        <div key={e.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/20">
                          <span className="text-sm font-medium">{e.name}</span>
                          <button onClick={() => del.mutate(e.id)} className="text-muted-foreground hover:text-destructive p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Item exceptions ─────────────────────────────────────── */}
              <div className="border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b bg-muted/30 flex items-center gap-3">
                  <PackageX className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <h2 className="font-semibold">Товари-винятки <span className="text-muted-foreground font-normal ml-1">{itemExceptions.length}</span></h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Товари та тех. картки, на які не поширюються бонуси та знижки</p>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <select value={selItem} onChange={e => setSelItem(e.target.value)}
                      className="flex-1 border rounded-md px-3 py-2 text-sm bg-background">
                      <option value="">Оберіть товар...</option>
                      {items
                        .filter((i: any) => !itemExceptions.find(e => e.ref_id === i.id))
                        .map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <Button variant="outline" onClick={() => addItem.mutate()} disabled={!selItem || addItem.isPending}>
                      {addItem.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      <span className="ml-1">Додати</span>
                    </Button>
                  </div>
                  {itemExceptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Товарів-винятків немає</p>
                  ) : (
                    <div className="divide-y border rounded-lg overflow-hidden">
                      {itemExceptions.map(e => (
                        <div key={e.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/20">
                          <div>
                            <span className="text-sm font-medium">{e.name}</span>
                            {e.category_name && <span className="text-xs text-muted-foreground ml-2">{e.category_name}</span>}
                          </div>
                          <button onClick={() => del.mutate(e.id)} className="text-muted-foreground hover:text-destructive p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
