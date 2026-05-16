import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API = import.meta.env.BASE_URL.replace(/\/room-concierge\/?$/, "") + "/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModifierOption {
  id: number; name: string; price_delta: number; sort_order: number; is_available: boolean;
}
interface ModifierGroup {
  id: number; item_id: number; name: string; is_required: boolean;
  min_select: number; max_select: number; sort_order: number; options: ModifierOption[];
}
interface SelectedModifier {
  groupId: number; groupName: string; optionId: number; optionName: string; priceDelta: number;
}
interface Category {
  id: number; name: string; description?: string; color?: string; emoji?: string;
  parent_id?: number | null; station?: string | null;
}
interface MenuItem {
  id: number; category_id: number; name: string; description?: string;
  price: string; is_popular?: boolean; is_vegetarian?: boolean;
  allergens?: string[]; image_url?: string; cook_minutes?: number; station?: string;
  modifier_groups?: ModifierGroup[];
}
interface CartItem { item: MenuItem; quantity: number; modifiers: SelectedModifier[]; }
interface AiMsg { role: "user" | "assistant"; content: string; }
interface PromoBanner { title: string; subtitle?: string; badge?: string; image_url?: string; color?: string; }
interface Branding {
  logo_url?: string; primary_color?: string; accent_color?: string;
  banners?: PromoBanner[]; service_card?: string;
}

// ─── Modifier Modal ────────────────────────────────────────────────────────────

function ModifierModal({ item, primary, accent, onConfirm, onCancel }: {
  item: MenuItem; primary: string; accent: string;
  onConfirm: (m: SelectedModifier[]) => void; onCancel: () => void;
}) {
  const groups = item.modifier_groups || [];
  const [selected, setSelected] = useState<Record<number, Set<number>>>({});

  function toggle(group: ModifierGroup, option: ModifierOption) {
    setSelected(prev => {
      const cur = new Set(prev[group.id] || []);
      if (cur.has(option.id)) { cur.delete(option.id); }
      else {
        if (group.max_select === 1) cur.clear();
        if (cur.size < group.max_select) cur.add(option.id);
      }
      return { ...prev, [group.id]: cur };
    });
  }

  const valid = groups.every(g => !g.is_required || (selected[g.id]?.size || 0) >= Math.max(g.min_select, 1));
  const delta = groups.reduce((s, g) => {
    for (const id of (selected[g.id] || [])) {
      const o = g.options.find(o => o.id === id);
      if (o) s += parseFloat(String(o.price_delta)) || 0;
    }
    return s;
  }, 0);

  function confirm() {
    const mods: SelectedModifier[] = [];
    for (const g of groups) {
      for (const id of (selected[g.id] || [])) {
        const o = g.options.find(o => o.id === id);
        if (o) mods.push({ groupId: g.id, groupName: g.name, optionId: o.id, optionName: o.name, priceDelta: parseFloat(String(o.price_delta)) || 0 });
      }
    }
    onConfirm(mods);
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
      <div className="flex-1 bg-black/50" onClick={onCancel} />
      <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col max-w-lg mx-auto w-full">
        <div className="px-5 pt-5 pb-3 border-b border-stone-100 shrink-0">
          <div className="flex items-start justify-between">
            <div><h2 className="text-lg font-serif text-stone-900">{item.name}</h2>
              <p className="text-sm text-stone-400 mt-0.5">від {parseFloat(item.price).toFixed(0)} ₴</p></div>
            <button onClick={onCancel} className="text-stone-400 mt-0.5"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {groups.map(g => {
            const sel = selected[g.id] || new Set();
            return (
              <div key={g.id}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-sm text-stone-800">{g.name}</span>
                  {g.is_required ? <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full">Обов'язково</span>
                    : <span className="text-[10px] text-stone-400">Необов'язково</span>}
                  {g.max_select > 1 && <span className="text-[10px] text-stone-400">до {g.max_select}</span>}
                </div>
                <div className="space-y-2">
                  {g.options.filter(o => o.is_available !== false).map(o => {
                    const on = sel.has(o.id);
                    const isRadio = g.max_select === 1;
                    return (
                      <button key={o.id} onClick={() => toggle(g, o)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${on ? "border-amber-400 bg-amber-50" : "border-stone-200 hover:border-stone-300"}`}>
                        <div className={`w-5 h-5 rounded-${isRadio ? "full" : "md"} border-2 flex items-center justify-center shrink-0 transition-all ${on ? "border-amber-400" : "border-stone-300"}`}
                          style={on ? { background: accent } : {}}>
                          {on && (isRadio
                            ? <div className="w-2 h-2 rounded-full bg-white" />
                            : <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          )}
                        </div>
                        <span className="flex-1 text-sm text-stone-800">{o.name}</span>
                        {parseFloat(String(o.price_delta)) > 0 && <span className="text-sm font-medium text-stone-500 shrink-0">+{parseFloat(String(o.price_delta)).toFixed(0)} ₴</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-4 border-t border-stone-100 shrink-0">
          <button onClick={confirm} disabled={!valid}
            className="w-full text-white rounded-2xl py-4 font-semibold text-base disabled:opacity-40 flex items-center justify-between px-5"
            style={{ background: primary }}>
            <span>Додати до кошика</span>
            <span>{(parseFloat(item.price) + delta).toFixed(0)} ₴</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Promo Carousel ─────────────────────────────────────────────────────────────

function PromoCarousel({ banners, popular, accent, primary }: {
  banners: PromoBanner[]; popular: MenuItem[]; accent: string; primary: string;
}) {
  const [active, setActive] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-advance
  const total = banners.length + (popular.length > 0 ? 1 : 0);
  useEffect(() => {
    if (total <= 1) return;
    timerRef.current = setInterval(() => setActive(a => (a + 1) % total), 4000);
    return () => clearInterval(timerRef.current);
  }, [total]);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.children[active] as HTMLElement;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [active]);

  const defaultGradients = [
    "from-amber-900 to-amber-700",
    "from-stone-800 to-stone-600",
    "from-emerald-900 to-emerald-700",
    "from-rose-900 to-rose-700",
  ];

  const allSlides: Array<{ title: string; subtitle?: string; badge?: string; image?: string; gradient: string }> = [];

  // Popular items slide
  if (popular.length > 0) {
    allSlides.push({
      title: "Нове та популярне",
      subtitle: "Хіти від наших шефів",
      badge: "🔥 Топ",
      image: popular[0]?.image_url || undefined,
      gradient: defaultGradients[0],
    });
  }

  // Custom banners
  banners.forEach((b, i) => allSlides.push({
    title: b.title,
    subtitle: b.subtitle,
    badge: b.badge,
    image: b.image_url,
    gradient: b.color ? "" : defaultGradients[(i + 1) % defaultGradients.length],
  }));

  if (allSlides.length === 0) return null;

  return (
    <div className="relative">
      <div ref={scrollRef} className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth"
        onScroll={e => {
          const el = e.currentTarget;
          const idx = Math.round(el.scrollLeft / el.clientWidth);
          setActive(idx);
        }}>
        {allSlides.map((slide, i) => (
          <div key={i} className="shrink-0 w-full snap-center relative overflow-hidden" style={{ height: 190 }}>
            {slide.image ? (
              <img src={slide.image} alt={slide.title} className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full bg-gradient-to-br ${slide.gradient}`} />
            )}
            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              {slide.badge && (
                <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full mb-2" style={{ background: accent, color: "#fff" }}>
                  {slide.badge}
                </span>
              )}
              <h3 className="text-white font-serif text-xl leading-tight">{slide.title}</h3>
              {slide.subtitle && <p className="text-white/70 text-sm mt-0.5">{slide.subtitle}</p>}
            </div>
          </div>
        ))}
      </div>
      {/* Dots */}
      {allSlides.length > 1 && (
        <div className="absolute bottom-3 right-4 flex gap-1">
          {allSlides.map((_, i) => (
            <button key={i} onClick={() => setActive(i)}
              className={`rounded-full transition-all ${i === active ? "w-5 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/50"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function GuestMenu() {
  const params = new URLSearchParams(window.location.search);
  const tid = params.get("tid");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("Maison HD");
  const [tableNumber, setTableNumber] = useState("");
  const [tableLocation, setTableLocation] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [branding, setBranding] = useState<Branding>({});

  const [activeCat, setActiveCat] = useState<number | "all" | "popular">("all");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [tipPct, setTipPct] = useState<0 | 5 | 10 | 15>(0);

  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);

  const [showAI, setShowAI] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMsg[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiEndRef = useRef<HTMLDivElement>(null);

  const catTabsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
        setBranding(d.branding || {});
      })
      .catch(() => setError("Помилка завантаження меню."))
      .finally(() => setLoading(false));
  }, [tid]);

  useEffect(() => {
    if (showAI) aiEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, showAI]);

  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
  }, [showSearch]);

  const accent = branding.accent_color || "#C9A96E";
  const primary = branding.primary_color || "#2C2416";

  // Build leaf categories (subcategories with parent, or standalone categories without station)
  const leafCats = categories.filter(c => c.parent_id != null || (!c.parent_id && !c.station));
  const popular = items.filter(i => i.is_popular);

  // Filter items
  const filtered = items.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || (item.description || "").toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (activeCat === "all") return true;
    if (activeCat === "popular") return !!item.is_popular;
    return item.category_id === activeCat;
  });

  // Cart
  const cartKey = (item: MenuItem, mods: SelectedModifier[]) =>
    `${item.id}__${mods.map(m => `${m.groupId}:${m.optionId}`).sort().join(",")}`;
  const cartTotal = cart.reduce((s, c) => s + (parseFloat(c.item.price) + c.modifiers.reduce((d, m) => d + m.priceDelta, 0)) * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const addToCartWith = (item: MenuItem, mods: SelectedModifier[]) => {
    setCart(prev => {
      const k = cartKey(item, mods);
      const idx = prev.findIndex(c => cartKey(c.item, c.modifiers) === k);
      if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], quantity: n[idx].quantity + 1 }; return n; }
      return [...prev, { item, quantity: 1, modifiers: mods }];
    });
  };

  const handleAdd = (item: MenuItem) => {
    if ((item.modifier_groups || []).length > 0) setModifierItem(item);
    else addToCartWith(item, []);
  };

  const changeQty = (k: string, d: number) =>
    setCart(prev => prev.map(c => cartKey(c.item, c.modifiers) === k ? { ...c, quantity: c.quantity + d } : c).filter(c => c.quantity > 0));

  const submitOrder = async () => {
    if (!cart.length || !tid) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/fb/public/guest-orders`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: parseInt(tid), tipPct: tipPct || undefined, items: cart.map(c => ({ itemId: c.item.id, quantity: c.quantity, modifiers: c.modifiers })) }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setOrdered(true); setShowCart(false);
      try {
        const ctx = new AudioContext();
        [523, 659, 784].forEach((f, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination); o.frequency.value = f; o.type = "sine";
          g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.25);
          o.start(ctx.currentTime + i * 0.12); o.stop(ctx.currentTime + i * 0.12 + 0.25);
        });
      } catch {}
    } catch (e: any) { alert("Помилка: " + e.message); }
    finally { setSubmitting(false); }
  };

  const sendAI = async () => {
    const text = aiInput.trim();
    if (!text || aiLoading) return;
    const msg: AiMsg = { role: "user", content: text };
    const next = [...aiMessages, msg];
    setAiMessages(next); setAiInput(""); setAiLoading(true);
    try {
      const r = await fetch(`${API}/fb/public/ai-chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tid: parseInt(tid || "0"), messages: next }) });
      const d = await r.json();
      setAiMessages(m => [...m, { role: "assistant", content: d.reply || d.error || "Помилка." }]);
    } catch { setAiMessages(m => [...m, { role: "assistant", content: "Помилка з'єднання." }]); }
    finally { setAiLoading(false); }
  };

  function scrollCatIntoView(idx: number) {
    if (catTabsRef.current) {
      const el = catTabsRef.current.children[idx] as HTMLElement;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }

  // ── States ──
  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: accent, borderTopColor: "transparent" }} />
        <p className="text-stone-400 text-sm">Завантаження меню...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-5xl mb-4">🍽️</div>
        <p className="text-stone-500">{error}</p>
      </div>
    </div>
  );

  if (ordered) return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-center">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring" }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: `${accent}20` }}>
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke={accent} strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-serif text-stone-900 mb-2">Замовлення прийнято!</h2>
        <p className="text-stone-500 mb-1">Стіл {tableNumber}{tableLocation ? ` · ${tableLocation}` : ""}</p>
        <p className="text-stone-400 text-sm mb-8">Офіціант підтвердить замовлення</p>
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-4 text-left mb-6 max-w-xs mx-auto">
          {cart.map((c, i) => {
            const delta = c.modifiers.reduce((s, m) => s + m.priceDelta, 0);
            const up = parseFloat(c.item.price) + delta;
            return (
              <div key={i} className="py-1.5 border-b border-stone-100 last:border-0">
                <div className="flex justify-between text-sm"><span className="text-stone-800">{c.item.name} × {c.quantity}</span><span className="text-stone-500">{(up * c.quantity).toFixed(0)} ₴</span></div>
                {c.modifiers.length > 0 && <p className="text-xs text-stone-400 mt-0.5">{c.modifiers.map(m => m.optionName).join(" · ")}</p>}
              </div>
            );
          })}
          <div className="flex justify-between font-semibold text-stone-900 pt-2 mt-1"><span>Разом</span><span>{cartTotal.toFixed(0)} ₴</span></div>
        </div>
        <button onClick={() => { setOrdered(false); setCart([]); }} className="text-sm underline underline-offset-2" style={{ color: accent }}>
          Зробити ще одне замовлення
        </button>
      </motion.div>
    </div>
  );

  // Banners from branding or auto-generated
  const promoBanners: PromoBanner[] = branding.banners || [];

  return (
    <div className="min-h-screen bg-stone-50 max-w-lg mx-auto relative flex flex-col">

      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white border-b border-stone-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Logo or icon */}
          {branding.logo_url ? (
            <img src={branding.logo_url} alt={orgName} className="h-9 w-auto object-contain rounded-lg shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: `${primary}15` }}>🍽</div>
          )}

          {/* Name + table */}
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-stone-900 text-sm leading-tight truncate">{orgName}</h1>
            <p className="text-xs text-stone-400 leading-tight">
              {tableLocation ? tableLocation : `Стіл ${tableNumber}`}
              {tableLocation && tableNumber ? ` · №${tableNumber}` : ""}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => { setShowSearch(s => !s); setSearch(""); }}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${showSearch ? "text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
              style={showSearch ? { background: primary } : {}}>
              <svg className="w-4.5 h-4.5" style={{width:18,height:18}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* AI waiter button */}
            <button onClick={() => { setShowAI(true); if (!aiMessages.length) setAiMessages([{ role: "assistant", content: "Привіт! Я ваш AI-офіціант 👨‍🍳\n\nЗ задоволенням розповім про меню або порекомендую страви. Що вас цікавить?" }]); }}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
              style={{ background: `linear-gradient(135deg, ${accent}, #e8b87a)` }}>
              ✨
            </button>

            {/* Cart */}
            {cartCount > 0 && (
              <button onClick={() => setShowCart(true)}
                className="relative flex items-center gap-1.5 text-white text-sm font-medium rounded-xl px-3 py-2 shadow"
                style={{ background: primary }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>{cartCount}</span>
              </button>
            )}
          </div>
        </div>

        {/* Search bar (collapsible) */}
        <AnimatePresence>
          {showSearch && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4 pb-3">
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Пошук у меню..."
                className="w-full px-4 py-2.5 text-sm bg-stone-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Promo carousel ─────────────────────────────────────────── */}
      {!search && (popular.length > 0 || promoBanners.length > 0) && (
        <PromoCarousel banners={promoBanners} popular={popular} accent={accent} primary={primary} />
      )}

      {/* ── Popular horizontal strip ───────────────────────────────── */}
      {!search && popular.length > 0 && (
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-stone-900 text-lg">Нове та популярне</h2>
            <button onClick={() => { setActiveCat("popular"); scrollCatIntoView(1); }}
              className="text-xs font-medium" style={{ color: accent }}>Всі →</button>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
            {popular.slice(0, 6).map(item => {
              const inCart = cart.filter(c => c.item.id === item.id).reduce((s, c) => s + c.quantity, 0);
              return (
                <div key={item.id} className="shrink-0 w-36 bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
                  <div className="relative h-28 bg-stone-100">
                    {item.image_url
                      ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-3xl">🍽</div>}
                    <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: accent }}>🔥 Хіт</span>
                  </div>
                  <div className="p-2.5">
                    <p className="font-medium text-xs text-stone-900 leading-tight line-clamp-2 mb-1.5">{item.name}</p>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-stone-900">{parseFloat(item.price).toFixed(0)} ₴</span>
                      <button onClick={() => handleAdd(item)}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ background: inCart > 0 ? accent : primary }}>
                        {inCart > 0 ? inCart : "+"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Category tabs ──────────────────────────────────────────── */}
      {!search && (
        <div className="sticky top-[57px] z-30 bg-stone-50 border-b border-stone-100 px-4 py-2.5">
          <div ref={catTabsRef} className="flex gap-2 overflow-x-auto scrollbar-none">
            {/* All tab */}
            <button onClick={() => setActiveCat("all")}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${activeCat === "all" ? "text-white shadow-sm" : "bg-white text-stone-600 border border-stone-200 hover:border-stone-300"}`}
              style={activeCat === "all" ? { background: primary } : {}}>
              Всі
            </button>
            {/* Popular tab */}
            {popular.length > 0 && (
              <button onClick={() => setActiveCat("popular")}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${activeCat === "popular" ? "text-white shadow-sm" : "bg-white text-stone-600 border border-stone-200 hover:border-stone-300"}`}
                style={activeCat === "popular" ? { background: accent } : {}}>
                🔥 Популярне
              </button>
            )}
            {/* Leaf categories */}
            {leafCats.map(cat => {
              const count = items.filter(i => i.category_id === cat.id).length;
              if (count === 0) return null;
              const isActive = activeCat === cat.id;
              return (
                <button key={cat.id} onClick={() => setActiveCat(cat.id)}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${isActive ? "text-white shadow-sm" : "bg-white text-stone-600 border border-stone-200 hover:border-stone-300"}`}
                  style={isActive ? { background: primary } : {}}>
                  {cat.emoji && <span className="mr-1">{cat.emoji}</span>}{cat.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Items list ─────────────────────────────────────────────── */}
      <div className="flex-1 px-4 py-3 pb-32 space-y-2.5">
        {search && (
          <p className="text-xs text-stone-400 mb-2">Результати для «{search}» — {filtered.length} позицій</p>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-400">
            <div className="text-4xl mb-3">🍽️</div>
            <p className="text-sm">{search ? "Нічого не знайдено" : "В цьому розділі ще немає позицій"}</p>
          </div>
        ) : filtered.map(item => {
          const cartEntries = cart.filter(c => c.item.id === item.id);
          const inCartTotal = cartEntries.reduce((s, c) => s + c.quantity, 0);
          const hasModifiers = (item.modifier_groups || []).length > 0;

          return (
            <div key={item.id} className="bg-white rounded-2xl border border-stone-200 flex gap-3 p-3 shadow-sm hover:shadow-md transition-shadow">
              {/* Image */}
              <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-stone-100 flex items-center justify-center">
                {item.image_url
                  ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  : <span className="text-2xl">🍽</span>}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-start gap-1 flex-wrap">
                    <span className="font-semibold text-stone-900 text-sm leading-tight">{item.name}</span>
                    {item.is_popular && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0" style={{ background: `${accent}20`, color: accent }}>Хіт</span>}
                    {item.is_vegetarian && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">🌿</span>}
                  </div>
                  {item.description && <p className="text-xs text-stone-400 mt-0.5 line-clamp-2">{item.description}</p>}
                  {item.cook_minutes && <p className="text-[11px] text-stone-400 mt-1">⏱ ~{item.cook_minutes} хв</p>}
                  {hasModifiers && <p className="text-[10px] mt-0.5 font-medium" style={{ color: accent }}>✦ Є варіанти</p>}
                </div>

                <div className="flex items-center justify-between mt-1.5">
                  <div>
                    <span className="font-bold text-stone-900">{parseFloat(item.price).toFixed(0)} ₴</span>
                  </div>

                  {/* Cart control */}
                  {inCartTotal > 0 && !hasModifiers ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => { const e = cart.find(c => c.item.id === item.id); if (e) changeQty(cartKey(e.item, e.modifiers), -1); }}
                        className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-700">−</button>
                      <span className="w-4 text-center text-sm font-semibold">{inCartTotal}</span>
                      <button onClick={() => handleAdd(item)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ background: primary }}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => handleAdd(item)}
                      className="flex items-center gap-1.5 text-white text-sm font-medium rounded-full px-3.5 py-1.5"
                      style={{ background: hasModifiers ? accent : primary }}>
                      {hasModifiers ? "Обрати" : inCartTotal > 0 ? `+ ще` : "+"}
                      {inCartTotal > 0 && <span className="bg-white/30 rounded-full px-1.5 text-xs">{inCartTotal}</span>}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Sticky cart bar ────────────────────────────────────────── */}
      <AnimatePresence>
        {cartCount > 0 && !showCart && (
          <motion.div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto px-4 pb-6 z-40"
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}>
            <button onClick={() => setShowCart(true)}
              className="w-full text-white rounded-2xl py-4 font-semibold flex items-center justify-between px-5 shadow-xl"
              style={{ background: primary }}>
              <span className="bg-white/20 rounded-full px-2.5 py-0.5 text-sm">{cartCount}</span>
              <span>Переглянути замовлення</span>
              <span>{cartTotal.toFixed(0)} ₴</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cart modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCart && (
          <motion.div className="fixed inset-0 z-50 flex flex-col" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
            <div className="flex-1 bg-black/30" onClick={() => setShowCart(false)} />
            <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col max-w-lg mx-auto w-full">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-stone-100">
                <h2 className="text-lg font-serif text-stone-900">Ваше замовлення</h2>
                <button onClick={() => setShowCart(false)} className="text-stone-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
                {cart.map((c, i) => {
                  const k = cartKey(c.item, c.modifiers);
                  const delta = c.modifiers.reduce((s, m) => s + m.priceDelta, 0);
                  const up = parseFloat(c.item.price) + delta;
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="font-medium text-sm text-stone-900">{c.item.name}</div>
                        {c.modifiers.length > 0 && <div className="text-xs text-stone-400 mt-0.5">{c.modifiers.map(m => m.optionName).join(" · ")}</div>}
                        <div className="text-xs text-stone-400 mt-0.5">{up.toFixed(0)} ₴ × {c.quantity}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <button onClick={() => changeQty(k, -1)} className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-700">−</button>
                        <span className="w-4 text-center text-sm font-semibold">{c.quantity}</span>
                        <button onClick={() => changeQty(k, 1)} className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white" style={{ background: primary }}>+</button>
                      </div>
                      <div className="w-16 text-right font-semibold text-sm text-stone-900 mt-1">{(up * c.quantity).toFixed(0)} ₴</div>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-4 border-t border-stone-100 space-y-3">
                {/* ── Tip / Service section ── */}
                <div className="bg-stone-50 rounded-2xl p-3.5">
                  <p className="text-xs text-stone-500 text-center mb-2.5 leading-snug">
                    Винагорода офіціанту залишається на ваш розсуд
                  </p>
                  <div className="flex gap-2">
                    {([0, 5, 10, 15] as const).map(pct => (
                      <button
                        key={pct}
                        onClick={() => setTipPct(pct)}
                        className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                          tipPct === pct
                            ? "border-transparent text-white"
                            : "border-stone-200 text-stone-600 bg-white"
                        }`}
                        style={tipPct === pct ? { background: accent } : {}}>
                        {pct === 0 ? "—" : `+${pct}%`}
                      </button>
                    ))}
                  </div>
                  {tipPct > 0 && branding.service_card && (
                    <p className="text-[11px] text-stone-400 text-center mt-2 leading-snug">
                      Картка для чайових: <span className="font-mono text-stone-600">{branding.service_card}</span>
                    </p>
                  )}
                </div>

                {/* ── Totals ── */}
                <div>
                  {tipPct > 0 ? (
                    <>
                      <div className="flex justify-between text-sm text-stone-500 mb-1">
                        <span>Замовлення</span><span>{cartTotal.toFixed(0)} ₴</span>
                      </div>
                      <div className="flex justify-between text-sm mb-2" style={{ color: accent }}>
                        <span>Сервіс {tipPct}%</span>
                        <span>+ {(cartTotal * tipPct / 100).toFixed(0)} ₴</span>
                      </div>
                    </>
                  ) : null}
                  <div className="flex justify-between font-bold text-stone-900">
                    <span>Разом</span>
                    <span>{(cartTotal * (1 + tipPct / 100)).toFixed(0)} ₴</span>
                  </div>
                </div>

                <p className="text-xs text-stone-400 text-center">
                  {tableLocation ? tableLocation : `Стіл ${tableNumber}`}{tableLocation && tableNumber ? ` · №${tableNumber}` : ""} · Офіціант підтвердить замовлення
                </p>
                <button onClick={submitOrder} disabled={submitting}
                  className="w-full text-white rounded-2xl py-4 font-semibold text-base disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: primary }}>
                  {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {submitting ? "Відправляємо..." : "Замовити"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modifier modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {modifierItem && (
          <ModifierModal key={modifierItem.id} item={modifierItem} primary={primary} accent={accent}
            onConfirm={mods => { addToCartWith(modifierItem, mods); setModifierItem(null); }}
            onCancel={() => setModifierItem(null)} />
        )}
      </AnimatePresence>

      {/* ── AI chat ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAI && (
          <motion.div className="fixed inset-0 z-50 flex flex-col" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
            <div className="flex-1 bg-black/40" onClick={() => setShowAI(false)} />
            <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col max-w-lg mx-auto w-full">
              <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-stone-100 shrink-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: `linear-gradient(135deg, ${accent}, #e8b87a)` }}>✨</div>
                <div className="flex-1">
                  <div className="font-semibold text-stone-900 text-sm">AI-Офіціант</div>
                  <div className="text-xs text-stone-400">Знає все про меню · {orgName}</div>
                </div>
                <button onClick={() => setShowAI(false)} className="text-stone-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {aiMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user" ? "text-white rounded-br-sm" : "bg-stone-50 text-stone-800 rounded-bl-sm border border-stone-200"
                    }`} style={m.role === "user" ? { background: primary } : {}}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-stone-50 border border-stone-200 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                      {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: accent, animationDelay: `${i * 0.15}s` }} />)}
                    </div>
                  </div>
                )}
                <div ref={aiEndRef} />
              </div>
              {aiMessages.filter(m => m.role === "user").length === 0 && (
                <div className="px-4 pb-2 flex flex-wrap gap-2">
                  {["Що порекомендуєш?", "Є вегетаріанські?", "Які напої є?", "Що до вина?"].map(q => (
                    <button key={q} onClick={() => { setAiInput(q); setTimeout(sendAI, 50); }}
                      className="text-xs px-3 py-1.5 rounded-full border font-medium bg-white hover:bg-stone-50 transition-colors"
                      style={{ borderColor: accent, color: accent }}>{q}</button>
                  ))}
                </div>
              )}
              <div className="px-4 py-3 border-t border-stone-100 shrink-0 flex gap-2">
                <input value={aiInput} onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAI(); } }}
                  placeholder="Запитайте про меню..."
                  className="flex-1 px-4 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-400" />
                <button onClick={sendAI} disabled={!aiInput.trim() || aiLoading}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40 shrink-0"
                  style={{ background: aiInput.trim() && !aiLoading ? accent : "#ccc" }}>
                  <svg className="w-5 h-5 rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
