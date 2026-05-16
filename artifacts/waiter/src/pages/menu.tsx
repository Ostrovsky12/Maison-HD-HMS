import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft, Plus, CheckCircle2, Loader2, Search,
  Leaf, Star, X, ShoppingCart, ChevronRight,
} from "lucide-react";

export default function MenuPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});
  const [noteOpen, setNoteOpen] = useState<number | null>(null);

  // ── Menu data ──
  const { data: catsData } = useQuery({
    queryKey: ["fb-categories"],
    queryFn: () => apiFetch("/fb/categories"),
  });
  const { data: itemsData } = useQuery({
    queryKey: ["fb-items", activeCat],
    queryFn: () => apiFetch(`/fb/items?available=true${activeCat !== "all" ? `&categoryId=${activeCat}` : ""}`),
  });

  // ── Current order (live cart) ──
  const { data: orderData } = useQuery({
    queryKey: ["waiter-order", orderId],
    queryFn: () => apiFetch(`/fb/orders/${orderId}`),
    refetchInterval: 4000,
  });
  const currentOrder = orderData?.order;
  const currentItems: any[] = (orderData?.items || []).filter((i: any) => i.status !== "cancelled");
  const cartTotal = currentItems.reduce((s: number, i: any) => s + parseFloat(i.total_price || i.totalPrice || "0"), 0);
  const cartCount = currentItems.reduce((s: number, i: any) => s + (i.quantity || 1), 0);

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

  const tableLabel = currentOrder?.tableNumber ? `Стіл №${currentOrder.tableNumber}` : "Замовлення";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-12 pb-3 safe-top shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setLocation(`/order/${orderId}`)} className="p-2 -ml-1 rounded-xl bg-white/20">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold leading-tight">Додати страви</h1>
            <p className="text-blue-200 text-sm leading-tight">{tableLabel}</p>
          </div>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); if (e.target.value) setActiveCat("all"); }}
            placeholder="Пошук страв..."
            className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white/20 text-white placeholder:text-blue-300 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-blue-300" />
            </button>
          )}
        </div>
      </div>

      {/* Categories tabs */}
      {!search && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide shrink-0 border-b bg-background">
          <button
            onClick={() => setActiveCat("all")}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeCat === "all" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            Всі
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCat === c.id ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Items list — bottom padding reserves space for the cart bar */}
      <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-2 ${cartCount > 0 ? "pb-28" : "pb-4"}`}>
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setNoteOpen(noteOpen === item.id ? null : item.id)}
                        className="text-xs text-muted-foreground underline underline-offset-2 py-1"
                      >
                        + нотатка
                      </button>
                      <button
                        onClick={() => handleAdd(item)}
                        disabled={isPending || isAdded}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
                          isAdded
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-600 text-white active:scale-95 shadow-sm"
                        }`}
                      >
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
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <Search className="w-8 h-8 opacity-30" />
            <p className="text-sm">Нічого не знайдено</p>
          </div>
        )}
      </div>

      {/* ── LIVE CART BAR ── */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-2 bg-gradient-to-t from-background via-background/95 to-transparent">
          <button
            onClick={() => setLocation(`/order/${orderId}`)}
            className="w-full bg-blue-600 text-white rounded-2xl px-4 py-3.5 flex items-center justify-between shadow-2xl active:scale-[0.98] transition-transform"
          >
            {/* Left: cart icon + count badge */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <ShoppingCart className="w-5 h-5" />
                <span className="absolute -top-2 -right-2 bg-white text-blue-700 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              </div>
              <span className="font-semibold text-sm">
                {cartCount} {cartCount === 1 ? "позиція" : cartCount < 5 ? "позиції" : "позицій"}
              </span>
            </div>

            {/* Center: item names preview */}
            <div className="flex-1 px-3 min-w-0">
              <p className="text-xs text-blue-200 truncate text-center">
                {currentItems.slice(-2).map(i => i.name).join(", ")}
              </p>
            </div>

            {/* Right: total + arrow */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-black text-lg">{cartTotal.toFixed(0)} ₴</span>
              <div className="bg-white rounded-xl px-2.5 py-1 flex items-center gap-1">
                <span className="text-blue-700 text-xs font-bold">Готово</span>
                <ChevronRight className="w-3.5 h-3.5 text-blue-700" />
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
