import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft, Plus, CheckCircle2, Loader2, Search,
  Leaf, Star, X, ChevronRight, Trash2, Receipt,
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

  // ── Current order / live receipt ──
  const { data: orderData } = useQuery({
    queryKey: ["waiter-order", orderId],
    queryFn: () => apiFetch(`/fb/orders/${orderId}`),
    refetchInterval: 4000,
  });
  const currentOrder = orderData?.order;
  const allItems: any[] = orderData?.items || [];
  const receiptItems = allItems.filter((i: any) => i.status !== "cancelled");
  const cartTotal = receiptItems.reduce(
    (s: number, i: any) => s + parseFloat(i.total_price || i.totalPrice || "0"), 0
  );

  const categories: any[] = catsData?.categories || [];
  const menuItems: any[] = itemsData?.items || [];
  const visibleItems = search
    ? menuItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : menuItems;

  // ── Add item ──
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

  // ── Remove item ──
  const removeItem = useMutation({
    mutationFn: (itemId: number) =>
      apiFetch(`/fb/order-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["waiter-order", orderId] }),
  });

  function handleAdd(item: any) {
    const notes = itemNotes[item.id] || undefined;
    addItem.mutate({ itemId: item.id, quantity: 1, notes });
    setNoteOpen(null);
  }

  const tableLabel = currentOrder?.tableNumber
    ? `Стіл №${currentOrder.tableNumber}`
    : currentOrder?.guestName || "Замовлення";

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">

      {/* ══ HEADER ══════════════════════════════════════════════════ */}
      <div className="bg-blue-600 text-white px-4 pt-10 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation(`/order/${orderId}`)} className="p-2 -ml-1 rounded-xl bg-white/20">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight truncate">{tableLabel}</h1>
            <p className="text-blue-200 text-xs leading-tight">
              {receiptItems.length > 0
                ? `${receiptItems.length} поз. · ${cartTotal.toFixed(0)} ₴`
                : "Оберіть страви"}
            </p>
          </div>
          <button
            onClick={() => setLocation(`/order/${orderId}`)}
            className="flex items-center gap-1 bg-white text-blue-700 font-bold text-xs px-3 py-1.5 rounded-xl shrink-0"
          >
            Готово <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ══ TOP HALF — RECEIPT ══════════════════════════════════════ */}
      <div className="bg-white border-b shrink-0 flex flex-col" style={{ height: "36%" }}>
        {/* Receipt header */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
            <Receipt className="w-3.5 h-3.5" />
            Чек замовлення
          </div>
          {receiptItems.length > 0 && (
            <span className="text-xs text-gray-500">{receiptItems.length} позицій</span>
          )}
        </div>

        {/* Receipt items — scrollable */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {receiptItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <p className="text-sm text-gray-400">Поки нічого не додано</p>
              <p className="text-xs text-gray-300">Обирайте страви нижче ↓</p>
            </div>
          ) : (
            receiptItems.map((item: any) => {
              const canRemove = item.status === "pending" && !item.sent_at;
              const price = parseFloat(item.total_price || item.totalPrice || "0");
              return (
                <div key={item.id} className="flex items-center gap-2 py-1">
                  {/* Qty badge */}
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {item.quantity}
                  </span>
                  {/* Name */}
                  <span className="flex-1 text-sm text-gray-800 leading-tight truncate">{item.name}</span>
                  {/* Price */}
                  <span className="text-sm font-bold text-gray-700 shrink-0">{price.toFixed(0)} ₴</span>
                  {/* Remove */}
                  {canRemove && (
                    <button
                      onClick={() => removeItem.mutate(item.id)}
                      className="p-1 text-red-300 active:text-red-600 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Total bar */}
        <div className="px-4 py-2 border-t bg-gray-50 flex items-center justify-between shrink-0">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Разом</span>
          <span className="text-lg font-black text-blue-700">{cartTotal.toFixed(0)} ₴</span>
        </div>
      </div>

      {/* ══ BOTTOM HALF — MENU ══════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">

        {/* Search bar */}
        <div className="px-3 py-2 border-b bg-background shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); if (e.target.value) setActiveCat("all"); }}
              placeholder="Пошук страв..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        {!search && (
          <div className="flex gap-2 px-3 py-2 overflow-x-auto scrollbar-hide shrink-0 border-b">
            <button
              onClick={() => setActiveCat("all")}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeCat === "all" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              Всі
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeCat === c.id ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Menu items — compact rows, scrollable */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {visibleItems.map(item => {
            const isAdded = added[item.id];
            const isPending = addItem.isPending && addItem.variables?.itemId === item.id;
            const note = itemNotes[item.id] || "";

            return (
              <div key={item.id} className="bg-card border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2.5 px-3 py-2">
                  {/* Optional thumbnail */}
                  {item.image_url && (
                    <img src={item.image_url} alt={item.name}
                      className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  )}
                  {/* Name + description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-sm leading-tight truncate">{item.name}</span>
                      {item.is_popular && <Star className="w-3 h-3 text-amber-500 shrink-0" />}
                      {item.is_vegetarian && <Leaf className="w-3 h-3 text-green-600 shrink-0" />}
                    </div>
                    <span className="font-bold text-sm text-blue-700">{parseFloat(item.price).toFixed(0)} ₴</span>
                  </div>
                  {/* Note toggle */}
                  <button
                    onClick={() => setNoteOpen(noteOpen === item.id ? null : item.id)}
                    className="text-[10px] text-gray-400 underline shrink-0 py-1"
                  >
                    нотатка
                  </button>
                  {/* Add button */}
                  <button
                    onClick={() => handleAdd(item)}
                    disabled={isPending || isAdded}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                      isAdded
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-600 text-white active:scale-95"
                    }`}
                  >
                    {isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : isAdded
                        ? <><CheckCircle2 className="w-3.5 h-3.5" /> ОК</>
                        : <><Plus className="w-3.5 h-3.5" /> Додати</>
                    }
                  </button>
                </div>
                {noteOpen === item.id && (
                  <div className="px-3 pb-2 border-t pt-2">
                    <input
                      value={note}
                      onChange={e => setItemNotes(n => ({ ...n, [item.id]: e.target.value }))}
                      placeholder="Без цибулі, добре прожарити..."
                      className="w-full px-3 py-1.5 rounded-lg border bg-muted text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            );
          })}

          {visibleItems.length === 0 && (
            <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
              <Search className="w-6 h-6 opacity-30" />
              <p className="text-sm">Нічого не знайдено</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
