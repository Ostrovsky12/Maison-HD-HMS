import { useState, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import {
  ShoppingCart, Plus, Minus, X, ChevronLeft, CheckCircle2,
  Leaf, Flame, Star, Clock, Search, ArrowRight, Loader2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_BASE = BASE.replace("/maison-hd", "") + "/api/public";

const fmtMoney = (n: any) => parseFloat(n || 0).toLocaleString("uk-UA") + " ₴";

type Item = {
  id: number; name: string; description?: string; price: string;
  cookMinutes?: number; isVegetarian?: boolean; isPopular?: boolean;
  allergens?: string[]; tags?: string[];
};

type Category = {
  id: number; name: string; emoji: string; items: Item[];
};

type CartItem = Item & { quantity: number; notes?: string };

export default function QrMenuPage() {
  const params = useParams<{ orgSlug: string; tableId: string }>();
  const { orgSlug, tableId } = params;

  const [menu, setMenu] = useState<{ org: any; categories: Category[] } | null>(null);
  const [tableInfo, setTableInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [guestName, setGuestName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [menuRes, tableRes] = await Promise.all([
          fetch(`${API_BASE}/menu/${orgSlug}`),
          tableId ? fetch(`${API_BASE}/table/${orgSlug}/${tableId}`) : Promise.resolve(null),
        ]);
        const menuData = await menuRes.json();
        if (menuData.error) { setError(menuData.error); setLoading(false); return; }
        setMenu(menuData);
        if (menuData.categories.length > 0) setActiveCategory(menuData.categories[0].id);

        if (tableRes?.ok) {
          const td = await tableRes.json();
          setTableInfo(td.table);
        }
      } catch (e) {
        setError("Не вдалося завантажити меню");
      }
      setLoading(false);
    };
    load();
  }, [orgSlug, tableId]);

  const addToCart = (item: Item) => {
    setCart(prev => {
      const ex = prev.find(c => c.id === item.id);
      if (ex) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (id: number) => {
    setCart(prev => {
      const ex = prev.find(c => c.id === id);
      if (ex && ex.quantity > 1) return prev.map(c => c.id === id ? { ...c, quantity: c.quantity - 1 } : c);
      return prev.filter(c => c.id !== id);
    });
  };

  const cartQty = (id: number) => cart.find(c => c.id === id)?.quantity || 0;
  const totalItems = cart.reduce((s, c) => s + c.quantity, 0);
  const totalAmount = cart.reduce((s, c) => s + parseFloat(c.price) * c.quantity, 0);

  const filteredCategories = useMemo(() => {
    if (!menu) return [];
    if (!search) return menu.categories.filter(c => !activeCategory || c.id === activeCategory || search);
    const q = search.toLowerCase();
    return menu.categories.map(cat => ({
      ...cat,
      items: cat.items.filter(i => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)),
    })).filter(cat => cat.items.length > 0);
  }, [menu, search, activeCategory]);

  const displayCategories = search ? filteredCategories : (menu?.categories.filter(c => !activeCategory || c.id === activeCategory) || []);

  const placeOrder = async () => {
    if (!cart.length) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/menu-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgSlug,
          tableId: tableId ? parseInt(tableId) : undefined,
          guestName: guestName || "Гість",
          guestCount: 1,
          notes: orderNotes || null,
          items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, quantity: c.quantity, notes: c.notes })),
        }),
      });
      const d = await r.json();
      if (d.orderId) {
        setOrderId(d.orderId);
        setSubmitted(true);
        setCart([]);
        setShowCart(false);
      } else {
        alert(d.error || "Помилка при оформленні замовлення");
      }
    } catch { alert("Помилка з'єднання"); }
    setSubmitting(false);
  };

  // ── Loading ──
  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin text-amber-500 mx-auto mb-3" />
        <p className="text-stone-500 text-sm">Завантаження меню...</p>
      </div>
    </div>
  );

  // ── Error ──
  if (error) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <X className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-stone-800 mb-2">Меню не знайдено</h2>
        <p className="text-stone-500 text-sm">{error}</p>
      </div>
    </div>
  );

  // ── Submitted ──
  if (submitted) return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-stone-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-stone-900 mb-2">Замовлення прийнято!</h1>
        <p className="text-stone-500 text-sm mb-2">Номер замовлення: <span className="font-bold text-stone-800">#{orderId}</span></p>
        {tableInfo && <p className="text-stone-500 text-sm mb-6">Стіл {tableInfo.number} · {tableInfo.location}</p>}
        <p className="text-stone-400 text-xs mb-8">Ваше замовлення вже передано на кухню. Очікуйте, будь ласка 🙏</p>
        <button
          onClick={() => { setSubmitted(false); setOrderId(null); }}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-2xl font-semibold text-sm"
        >
          Замовити ще
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 pb-32">
      {/* ── Header ── */}
      <div className="bg-white border-b border-stone-100 sticky top-0 z-40">
        <div className="px-4 pt-4 pb-2 max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-bold text-stone-900">{menu?.org.name}</h1>
              {tableInfo && (
                <p className="text-xs text-stone-500">Стіл {tableInfo.number} · {tableInfo.location}</p>
              )}
            </div>
            <button
              onClick={() => setShowCart(true)}
              className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${totalItems > 0 ? "bg-amber-500 text-white shadow-md" : "bg-stone-100 text-stone-500"}`}
            >
              <ShoppingCart className="w-4 h-4" />
              {totalItems > 0 && <span>{totalItems}</span>}
              {totalItems > 0 && <span className="hidden sm:inline">{fmtMoney(totalAmount)}</span>}
            </button>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); if (e.target.value) setActiveCategory(null); }}
              placeholder="Пошук страв..."
              className="w-full pl-9 pr-3 py-2 bg-stone-100 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {search && (
              <button onClick={() => { setSearch(""); setActiveCategory(menu?.categories[0]?.id || null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        {!search && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide max-w-lg mx-auto">
            {menu?.categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${activeCategory === cat.id ? "bg-amber-500 text-white shadow-sm" : "bg-stone-100 text-stone-600"}`}
              >
                <span>{cat.emoji}</span><span>{cat.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Menu Items ── */}
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-6">
        {displayCategories.map(cat => (
          <div key={cat.id}>
            {(search || !activeCategory || displayCategories.length > 1) && (
              <h2 className="font-bold text-stone-800 mb-3 flex items-center gap-2">
                <span>{cat.emoji}</span>{cat.name}
              </h2>
            )}
            <div className="space-y-2">
              {cat.items.map(item => {
                const qty = cartQty(item.id);
                return (
                  <div key={item.id} className={`bg-white rounded-2xl p-4 border transition-all ${qty > 0 ? "border-amber-300 shadow-sm" : "border-stone-100"}`}>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <div className="flex items-start gap-2 mb-1">
                          <h3 className="font-semibold text-stone-900 text-sm leading-tight">{item.name}</h3>
                          <div className="flex gap-1 flex-wrap">
                            {item.isVegetarian && <span title="Вегетаріанське"><Leaf className="w-3.5 h-3.5 text-emerald-500" /></span>}
                            {item.isPopular && <span title="Популярне"><Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" /></span>}
                          </div>
                        </div>
                        {item.description && <p className="text-xs text-stone-500 mb-2 leading-relaxed">{item.description}</p>}
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-amber-600">{fmtMoney(item.price)}</span>
                          {item.cookMinutes && (
                            <span className="flex items-center gap-1 text-xs text-stone-400">
                              <Clock className="w-3 h-3" />{item.cookMinutes} хв
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {qty === 0 ? (
                          <button
                            onClick={() => addToCart(item)}
                            className="w-9 h-9 bg-amber-500 hover:bg-amber-600 text-white rounded-xl flex items-center justify-center shadow-sm"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button onClick={() => removeFromCart(item.id)} className="w-8 h-8 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl flex items-center justify-center">
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-5 text-center font-bold text-stone-800 text-sm">{qty}</span>
                            <button onClick={() => addToCart(item)} className="w-8 h-8 bg-amber-500 hover:bg-amber-600 text-white rounded-xl flex items-center justify-center">
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {displayCategories.length === 0 && (
          <div className="text-center py-16">
            <Search className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">Нічого не знайдено за запитом «{search}»</p>
          </div>
        )}
      </div>

      {/* ── Sticky Cart Button ── */}
      {totalItems > 0 && !showCart && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-full max-w-sm px-4">
          <button
            onClick={() => setShowCart(true)}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-2xl font-bold text-sm shadow-xl flex items-center justify-between px-5"
          >
            <span className="bg-amber-600 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold">{totalItems}</span>
            <span>Переглянути замовлення</span>
            <span>{fmtMoney(totalAmount)}</span>
          </button>
        </div>
      )}

      {/* ── Cart Sheet ── */}
      {showCart && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCart(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h2 className="font-bold text-stone-900">Ваше замовлення</h2>
              <button onClick={() => setShowCart(false)} className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-stone-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 bg-stone-100 rounded-lg flex items-center justify-center text-stone-600">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-5 text-center font-bold text-stone-800 text-sm">{item.quantity}</span>
                    <button onClick={() => addToCart(item)} className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center text-white">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-stone-800">{item.name}</p>
                  </div>
                  <p className="font-semibold text-stone-800 text-sm">{fmtMoney(parseFloat(item.price) * item.quantity)}</p>
                </div>
              ))}

              <div className="pt-3 border-t border-stone-100 space-y-3">
                <div>
                  <label className="text-xs font-medium text-stone-600 mb-1 block">Ваше ім'я (необов'язково)</label>
                  <input
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    placeholder="Олексій"
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-600 mb-1 block">Побажання до замовлення</label>
                  <textarea
                    value={orderNotes}
                    onChange={e => setOrderNotes(e.target.value)}
                    placeholder="Без гострого, алергія на горіхи..."
                    rows={2}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-stone-100 bg-white">
              <div className="flex items-center justify-between mb-4">
                <span className="text-stone-600 text-sm">Разом ({totalItems} поз.)</span>
                <span className="font-bold text-xl text-stone-900">{fmtMoney(totalAmount)}</span>
              </div>
              <button
                onClick={placeOrder}
                disabled={submitting}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {submitting ? "Оформлення..." : "Замовити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
