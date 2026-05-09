import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── API ──────────────────────────────────────────────────────────────────────
const API = import.meta.env.BASE_URL.replace(/\/room-concierge\/?$/, "") + "/api";

interface Category { id: number; name: string; description?: string; color?: string; }
interface MenuItem {
  id: number; category_id: number; name: string; description?: string;
  price: string; is_popular?: boolean; is_vegetarian?: boolean;
  allergens?: string; image_url?: string; cook_minutes?: number;
}
interface CartItem { item: MenuItem; quantity: number; notes: string; }

// ─── Sound ────────────────────────────────────────────────────────────────────
function playSuccess() {
  try {
    const ctx = new AudioContext();
    [523, 659, 784].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq;
      o.type = "sine";
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.25);
      o.start(ctx.currentTime + i * 0.12);
      o.stop(ctx.currentTime + i * 0.12 + 0.25);
    });
  } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function GuestMenu() {
  const params = new URLSearchParams(window.location.search);
  const tid = params.get("tid");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [tableLocation, setTableLocation] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!tid) { setError("Невірний QR-код. Зверніться до персоналу."); setLoading(false); return; }
    fetch(`${API}/fb/public/guest-menu?tid=${tid}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setOrgName(d.orgName || "Maison HD");
        setTableNumber(d.tableNumber || "");
        setTableLocation(d.tableLocation || "");
        setCategories(d.categories || []);
        setItems(d.items || []);
      })
      .catch(() => setError("Помилка завантаження меню."))
      .finally(() => setLoading(false));
  }, [tid]);

  const filtered = items.filter(it => {
    const matchCat = activeCat === "all" || it.category_id === activeCat;
    const matchSearch = !search || it.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const cartTotal = cart.reduce((s, c) => s + parseFloat(c.item.price) * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const addToCart = useCallback((item: MenuItem) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.item.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { item, quantity: 1, notes: "" }];
    });
  }, []);

  const changeQty = (itemId: number, delta: number) => {
    setCart(prev => {
      const next = prev.map(c => c.item.id === itemId ? { ...c, quantity: c.quantity + delta } : c)
        .filter(c => c.quantity > 0);
      return next;
    });
  };

  const submitOrder = async () => {
    if (!cart.length || !tid) return;
    setSubmitting(true);
    try {
      const resp = await fetch(`${API}/fb/public/guest-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: parseInt(tid),
          items: cart.map(c => ({ itemId: c.item.id, quantity: c.quantity, notes: c.notes || undefined })),
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setOrderId(data.order?.id || null);
      setOrdered(true);
      playSuccess();
    } catch (e: any) {
      alert("Помилка: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ──
  if (loading) return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[#8B7355] text-sm">Завантаження меню...</p>
      </div>
    </div>
  );

  // ── Error ──
  if (error) return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-5xl mb-4">🍽️</div>
        <p className="text-[#8B7355] text-base">{error}</p>
      </div>
    </div>
  );

  // ── Success / Confirmed ──
  if (ordered) return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-6 text-center">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring" }}>
        <div className="w-24 h-24 bg-[#C9A96E]/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-12 h-12 text-[#C9A96E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-serif text-[#2C2416] mb-2">Замовлення прийнято!</h2>
        <p className="text-[#8B7355] mb-1">Стіл {tableNumber}{tableLocation ? ` · ${tableLocation}` : ""}</p>
        <p className="text-[#8B7355] text-sm mb-8">Офіціант підтвердить замовлення та страви надійдуть до вас</p>
        <div className="bg-white rounded-2xl shadow-sm border border-[#E8E0D0] p-4 text-left mb-6 max-w-xs mx-auto">
          {cart.map(c => (
            <div key={c.item.id} className="flex justify-between text-sm py-1.5 border-b border-[#F0EBE0] last:border-0">
              <span className="text-[#2C2416]">{c.item.name} × {c.quantity}</span>
              <span className="text-[#8B7355]">{(parseFloat(c.item.price) * c.quantity).toFixed(0)} ₴</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold text-[#2C2416] pt-2 mt-1">
            <span>Разом</span>
            <span>{cartTotal.toFixed(0)} ₴</span>
          </div>
        </div>
        <button onClick={() => { setOrdered(false); setCart([]); }}
          className="text-sm text-[#C9A96E] underline underline-offset-2">
          Додати ще
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-[#E8E0D0] px-4 pt-5 pb-3 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-lg font-serif text-[#2C2416]">{orgName}</h1>
            <p className="text-xs text-[#8B7355]">
              Стіл {tableNumber}{tableLocation ? ` · ${tableLocation}` : ""}
            </p>
          </div>
          {cartCount > 0 && (
            <button onClick={() => setShowCart(true)}
              className="relative bg-[#2C2416] text-white rounded-full px-4 py-2 text-sm font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {cartCount}
              <span className="hidden sm:inline">· {cartTotal.toFixed(0)} ₴</span>
            </button>
          )}
        </div>
        {/* Search */}
        <div className="relative mt-2">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#B0A090]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук..."
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#FAF8F5] border border-[#E0D8CC] rounded-lg focus:outline-none focus:border-[#C9A96E]" />
        </div>
      </div>

      {/* Category tabs */}
      {categories.length > 0 && !search && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-none sticky top-[108px] z-20 bg-[#FAF8F5]">
          <button onClick={() => setActiveCat("all")}
            className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors ${activeCat === "all" ? "bg-[#2C2416] text-white" : "bg-white border border-[#E0D8CC] text-[#5C4E38]"}`}>
            Все
          </button>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setActiveCat(cat.id)}
              className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors ${activeCat === cat.id ? "bg-[#2C2416] text-white" : "bg-white border border-[#E0D8CC] text-[#5C4E38]"}`}>
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Items */}
      <div className="flex-1 px-4 pb-32 space-y-3 mt-1">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[#B0A090]">Нічого не знайдено</div>
        ) : filtered.map(item => {
          const inCart = cart.find(c => c.item.id === item.id);
          return (
            <div key={item.id}
              className="bg-white rounded-2xl border border-[#E8E0D0] p-4 flex gap-3 items-start shadow-sm hover:shadow-md transition-shadow">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name}
                  className="w-20 h-20 rounded-xl object-cover shrink-0 bg-[#F0EBE0]" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#F0EBE0] to-[#E0D8CC] shrink-0 flex items-center justify-center text-2xl">
                  🍽️
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-1 mb-0.5">
                  <h3 className="font-semibold text-[#2C2416] text-sm leading-tight">{item.name}</h3>
                  {item.is_popular && <span className="text-[10px] bg-[#C9A96E]/15 text-[#C9A96E] px-1.5 py-0.5 rounded-full shrink-0 font-medium">Хіт</span>}
                  {item.is_vegetarian && <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full shrink-0 font-medium">🌿</span>}
                </div>
                {item.description && <p className="text-xs text-[#8B7355] line-clamp-2 mb-2">{item.description}</p>}
                {item.cook_minutes && <p className="text-[11px] text-[#B0A090] mb-2">⏱ ~{item.cook_minutes} хв</p>}
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#2C2416]">{parseFloat(item.price).toFixed(0)} ₴</span>
                  {inCart ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeQty(item.id, -1)}
                        className="w-7 h-7 rounded-full bg-[#F0EBE0] flex items-center justify-center text-[#2C2416] font-bold text-base">−</button>
                      <span className="w-4 text-center font-semibold text-sm text-[#2C2416]">{inCart.quantity}</span>
                      <button onClick={() => changeQty(item.id, 1)}
                        className="w-7 h-7 rounded-full bg-[#2C2416] flex items-center justify-center text-white font-bold text-base">+</button>
                    </div>
                  ) : (
                    <button onClick={() => addToCart(item)}
                      className="w-7 h-7 rounded-full bg-[#2C2416] flex items-center justify-center text-white font-bold text-lg">+</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky order button */}
      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#FAF8F5] via-[#FAF8F5] to-transparent max-w-lg mx-auto">
          <button onClick={() => setShowCart(true)}
            className="w-full bg-[#2C2416] text-white rounded-2xl py-4 font-semibold flex items-center justify-between px-5 shadow-lg">
            <span className="bg-white/20 rounded-full px-2.5 py-0.5 text-sm">{cartCount}</span>
            <span>Переглянути замовлення</span>
            <span>{cartTotal.toFixed(0)} ₴</span>
          </button>
        </div>
      )}

      {/* Cart modal */}
      <AnimatePresence>
        {showCart && (
          <motion.div className="fixed inset-0 z-50 flex flex-col" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
            <div className="flex-1 bg-black/30" onClick={() => setShowCart(false)} />
            <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col max-w-lg mx-auto w-full">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#F0EBE0]">
                <h2 className="text-lg font-serif text-[#2C2416]">Ваше замовлення</h2>
                <button onClick={() => setShowCart(false)} className="text-[#8B7355] hover:text-[#2C2416]">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
                {cart.map(c => (
                  <div key={c.item.id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-[#2C2416]">{c.item.name}</div>
                      <div className="text-xs text-[#8B7355]">{parseFloat(c.item.price).toFixed(0)} ₴ × {c.quantity}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeQty(c.item.id, -1)}
                        className="w-7 h-7 rounded-full bg-[#F0EBE0] flex items-center justify-center font-bold text-[#2C2416]">−</button>
                      <span className="w-4 text-center text-sm font-semibold">{c.quantity}</span>
                      <button onClick={() => changeQty(c.item.id, 1)}
                        className="w-7 h-7 rounded-full bg-[#2C2416] flex items-center justify-center font-bold text-white">+</button>
                    </div>
                    <div className="w-16 text-right font-semibold text-sm text-[#2C2416]">
                      {(parseFloat(c.item.price) * c.quantity).toFixed(0)} ₴
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-[#F0EBE0]">
                <div className="flex justify-between font-bold text-[#2C2416] mb-4">
                  <span>Разом</span>
                  <span>{cartTotal.toFixed(0)} ₴</span>
                </div>
                <p className="text-xs text-[#8B7355] mb-3 text-center">
                  Стіл {tableNumber}{tableLocation ? ` · ${tableLocation}` : ""} · Офіціант підтвердить замовлення
                </p>
                <button onClick={submitOrder} disabled={submitting}
                  className="w-full bg-[#2C2416] text-white rounded-2xl py-4 font-semibold text-base disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {submitting ? "Відправляємо..." : "Замовити"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
