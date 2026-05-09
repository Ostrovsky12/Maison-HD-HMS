import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Plus, CheckCircle2, Loader2, Search, Leaf, Star, X } from "lucide-react";

export default function MenuPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});
  const [noteOpen, setNoteOpen] = useState<number | null>(null);

  const { data: catsData } = useQuery({
    queryKey: ["fb-categories"],
    queryFn: () => apiFetch("/fb/categories"),
  });
  const { data: itemsData } = useQuery({
    queryKey: ["fb-items", activeCat],
    queryFn: () => apiFetch(`/fb/items?available=true${activeCat !== "all" ? `&categoryId=${activeCat}` : ""}`),
  });

  const categories: any[] = catsData?.categories || [];
  const allItems: any[] = itemsData?.items || [];
  const items = search
    ? allItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : allItems;

  const addItem = useMutation({
    mutationFn: (payload: { itemId: number; quantity: number; notes?: string }) =>
      apiFetch(`/fb/orders/${orderId}/items`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, variables) => {
      setAdded(a => ({ ...a, [variables.itemId]: true }));
      setTimeout(() => setAdded(a => { const n = { ...a }; delete n[variables.itemId]; return n; }), 1500);
      qc.invalidateQueries({ queryKey: ["waiter-order", orderId] });
    },
  });

  function handleAdd(item: any) {
    const notes = itemNotes[item.id] || undefined;
    addItem.mutate({ itemId: item.id, quantity: 1, notes });
    setNoteOpen(null);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-12 pb-3 safe-top">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setLocation(`/order/${orderId}`)} className="p-2 -ml-1 rounded-xl bg-white/20">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold flex-1">Додати страви</h1>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Пошук страв..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/20 text-white placeholder:text-blue-300 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-blue-300" />
            </button>
          )}
        </div>
      </div>

      {/* Categories */}
      {!search && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
          <button onClick={() => setActiveCat("all")}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeCat === "all" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
            }`}>
            Всі
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setActiveCat(c.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCat === c.id ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
              }`}>
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-safe">
        {items.map(item => {
          const isAdded = added[item.id];
          const isPending = addItem.isPending && addItem.variables?.itemId === item.id;
          const note = itemNotes[item.id] || "";

          return (
            <div key={item.id} className="bg-card border rounded-2xl overflow-hidden">
              <div className="flex items-start gap-3 p-3.5">
                {item.image_url && (
                  <img src={item.image_url} alt={item.name}
                    className="w-14 h-14 rounded-xl object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-1 flex-wrap">
                    <span className="font-semibold text-sm leading-tight">{item.name}</span>
                    {item.is_popular && <Star className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
                    {item.is_vegetarian && <Leaf className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />}
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-base text-blue-700">{parseFloat(item.price).toFixed(0)} ₴</span>
                    <div className="flex gap-2">
                      <button onClick={() => setNoteOpen(noteOpen === item.id ? null : item.id)}
                        className="text-xs text-muted-foreground underline underline-offset-2 py-1">
                        + нотатка
                      </button>
                      <button onClick={() => handleAdd(item)} disabled={isPending || isAdded}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                          isAdded
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-600 text-white active:scale-95"
                        }`}>
                        {isPending
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : isAdded
                            ? <><CheckCircle2 className="w-4 h-4" /> Додано</>
                            : <><Plus className="w-4 h-4" /> Додати</>
                        }
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {noteOpen === item.id && (
                <div className="px-3.5 pb-3 border-t pt-2">
                  <input
                    value={note}
                    onChange={e => setItemNotes(n => ({ ...n, [item.id]: e.target.value }))}
                    placeholder="Без цибулі, добре прожарити..."
                    className="w-full px-3 py-2 rounded-xl border bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    autoFocus
                  />
                </div>
              )}
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Нічого не знайдено
          </div>
        )}
      </div>
    </div>
  );
}
