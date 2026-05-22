import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft, Plus, CheckCircle2, Loader2, Search,
  Leaf, Star, X, ChevronRight, Trash2, Receipt, Store,
} from "lucide-react";

const ICON_MAP: Record<string, string> = {
  utensils: "🍽", coffee: "☕", waves: "🌊", sun: "🌞", beer: "🍺", pizza: "🍕",
};

const PORTION_PRESETS = [
  { label: "¼",  value: 0.25 },
  { label: "⅓",  value: 0.33 },
  { label: "½",  value: 0.5  },
  { label: "¾",  value: 0.75 },
  { label: "1",  value: 1    },
  { label: "1½", value: 1.5  },
  { label: "2",  value: 2    },
  { label: "3",  value: 3    },
];

export default function MenuPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});
  const [noteOpen, setNoteOpen] = useState<number | null>(null);

  // Portion picker state
  const [portionItem, setPortionItem] = useState<any | null>(null);
  const [portionQty, setPortionQty] = useState(1);
  const [portionCustom, setPortionCustom] = useState("");

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

  const outletId: number | null = currentOrder?.outlet_id || null;

  const { data: catsData } = useQuery({
    queryKey: ["fb-categories"],
    queryFn: () => apiFetch("/fb/categories"),
  });
  const { data: itemsData } = useQuery({
    queryKey: ["fb-items", activeCat, outletId],
    queryFn: () => {
      const params = new URLSearchParams({ available: "true" });
      if (activeCat !== "all") params.set("categoryId", String(activeCat));
      if (outletId) params.set("outletId", String(outletId));
      return apiFetch(`/fb/items?${params.toString()}`);
    },
    enabled: currentOrder !== undefined,
  });

  const { data: outletsData } = useQuery({
    queryKey: ["waiter-outlets"],
    queryFn: () => apiFetch("/fb/outlets"),
    staleTime: 300_000,
    enabled: !!outletId,
  });
  const outletInfo = outletId
    ? (outletsData?.outlets || []).find((o: any) => o.id === outletId)
    : null;

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

  function openPortionPicker(item: any) {
    setPortionItem(item);
    setPortionQty(1);
    setPortionCustom("");
    setNoteOpen(null);
  }

  function confirmPortion() {
    if (!portionItem) return;
    const qty = portionCustom !== "" ? (parseFloat(portionCustom) || 1) : portionQty;
    const notes = itemNotes[portionItem.id] || undefined;
    addItem.mutate({ itemId: portionItem.id, quantity: qty, notes });
    setPortionItem(null);
  }

  const effectivePortionQty = portionCustom !== "" ? (parseFloat(portionCustom) || 0) : portionQty;

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
            <p className="text-blue-200 text-xs leading-tight flex items-center gap-1.5">
              {outletInfo ? (
                <span className="flex items-center gap-1">
                  <Store className="w-3 h-3" />
                  {ICON_MAP[outletInfo.icon] || "🍽"} {outletInfo.name} ·{" "}
                </span>
              ) : null}
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
        <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
            <Receipt className="w-3.5 h-3.5" />
            Чек замовлення
          </div>
          {receiptItems.length > 0 && (
            <span className="text-xs text-gray-500">{receiptItems.length} позицій</span>
          )}
        </div>

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
              const qty = parseFloat(item.quantity || 1);
              const qtyLabel = qty % 1 !== 0 ? qty.toFixed(2).replace(/\.?0+$/, "") : String(qty);
              return (
                <div key={item.id} className="flex items-center gap-2 py-1">
                  <span className="w-7 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {qtyLabel}
                  </span>
                  <span className="flex-1 text-sm text-gray-800 leading-tight truncate">{item.name}</span>
                  <span className="text-sm font-bold text-gray-700 shrink-0">{price.toFixed(0)} ₴</span>
                  {canRemove && (
                    <button onClick={() => removeItem.mutate(item.id)}
                      className="p-1 text-red-300 active:text-red-600 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t bg-gray-50 flex items-center justify-between shrink-0">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Разом</span>
          <span className="text-lg font-black text-blue-700">{cartTotal.toFixed(0)} ₴</span>
        </div>
      </div>

      {/* ══ BOTTOM HALF — MENU ══════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">

        {outletInfo && (
          <div className="px-3 pt-2 shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-100">
              <Store className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="text-xs font-medium text-blue-700">
                Меню: {ICON_MAP[outletInfo.icon] || "🍽"} {outletInfo.name}
              </span>
            </div>
          </div>
        )}

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

        {!search && (
          <div className="flex gap-2 px-3 py-2 overflow-x-auto scrollbar-hide shrink-0 border-b">
            <button onClick={() => setActiveCat("all")}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeCat === "all" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
              }`}>
              Всі
            </button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setActiveCat(c.id)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeCat === c.id ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
                }`}>
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {!itemsData ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
              <Search className="w-6 h-6 opacity-30" />
              <p className="text-sm">Нічого не знайдено</p>
            </div>
          ) : visibleItems.map(item => {
            const isAdded = added[item.id];
            const isPending = addItem.isPending && addItem.variables?.itemId === item.id;
            const note = itemNotes[item.id] || "";

            return (
              <div key={item.id} className="bg-card border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2.5 px-3 py-2">
                  {item.image_url && (
                    <img src={item.image_url} alt={item.name}
                      className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-sm leading-tight truncate">{item.name}</span>
                      {item.is_popular && <Star className="w-3 h-3 text-amber-500 shrink-0" />}
                      {item.is_vegetarian && <Leaf className="w-3 h-3 text-green-600 shrink-0" />}
                    </div>
                    <span className="font-bold text-sm text-blue-700">{parseFloat(item.price).toFixed(0)} ₴</span>
                  </div>
                  <button
                    onClick={() => setNoteOpen(noteOpen === item.id ? null : item.id)}
                    className="text-[10px] text-gray-400 underline shrink-0 py-1">
                    нотатка
                  </button>
                  <button
                    onClick={() => openPortionPicker(item)}
                    disabled={isPending || isAdded}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                      isAdded
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-600 text-white active:scale-95"
                    }`}>
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
                      onKeyDown={e => { if (e.key === "Enter") openPortionPicker(item); }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ PORTION PICKER BOTTOM SHEET ══════════════════════════ */}
      {portionItem && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPortionItem(null)} />
          <div className="relative bg-white rounded-t-3xl p-5 space-y-4 shadow-2xl">
            {/* Handle */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto -mt-1 mb-1" />

            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-base leading-tight">{portionItem.name}</p>
                <p className="text-sm text-muted-foreground">{parseFloat(portionItem.price).toFixed(0)} ₴ / порція</p>
              </div>
              <button onClick={() => setPortionItem(null)} className="p-2 rounded-xl bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Кількість порцій</p>
              <div className="grid grid-cols-4 gap-2">
                {PORTION_PRESETS.map(p => (
                  <button key={p.value}
                    onClick={() => { setPortionQty(p.value); setPortionCustom(""); }}
                    className={`py-3 rounded-2xl text-base font-bold transition-all border-2 ${
                      portionCustom === "" && portionQty === p.value
                        ? "bg-blue-600 border-blue-600 text-white shadow-md"
                        : "bg-muted border-transparent text-foreground"
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">Або введіть вручну:</p>
              <input
                type="number" min={0.01} step={0.1}
                value={portionCustom}
                onChange={e => { setPortionCustom(e.target.value); setPortionQty(0); }}
                placeholder="напр. 0.3"
                className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {effectivePortionQty > 0 && (
              <div className="flex justify-between items-center bg-blue-50 rounded-2xl px-4 py-2.5">
                <span className="text-sm text-blue-700">Ціна за {effectivePortionQty} порц.:</span>
                <span className="text-lg font-black text-blue-700">
                  {(parseFloat(portionItem.price) * effectivePortionQty).toFixed(0)} ₴
                </span>
              </div>
            )}

            <button
              onClick={confirmPortion}
              disabled={effectivePortionQty <= 0 || addItem.isPending}
              className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-base active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {addItem.isPending
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Додаємо...</>
                : <><Plus className="w-5 h-5" /> Додати до замовлення</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
