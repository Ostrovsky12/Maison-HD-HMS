import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API = import.meta.env.BASE_URL.replace(/\/room-concierge\/?$/, "") + "/api";

interface Category { id: number; name: string; description?: string; color?: string; emoji?: string; }
interface MenuItem {
  id: number; category_id: number; name: string; description?: string;
  price: string; is_popular?: boolean; is_vegetarian?: boolean;
  allergens?: string[]; image_url?: string; cook_minutes?: number;
  station?: string;
}
interface CartItem { item: MenuItem; quantity: number; }
interface AiMsg { role: "user" | "assistant"; content: string; }
interface Branding { logo_url?: string; primary_color?: string; accent_color?: string; }

type Screen = "home" | "menu";
type StationId = "bar" | "kitchen" | "other";

const STATIONS: { id: StationId; label: string; emoji: string; desc: string; bg: string; border: string; }[] = [
  { id: "bar",     label: "Бар",             emoji: "🍷", desc: "Напої, коктейлі, алкоголь", bg: "from-[#4A1020] to-[#7A2535]", border: "border-[#7A2535]" },
  { id: "kitchen", label: "Кухня",           emoji: "🍽", desc: "Страви, закуски, десерти",   bg: "from-[#1A3A1E] to-[#2C5A30]", border: "border-[#2C5A30]" },
  { id: "other",   label: "Інші послуги",    emoji: "🛎", desc: "Room service, послуги",       bg: "from-[#1A2A4A] to-[#2A3F6A]", border: "border-[#2A3F6A]" },
];

function stationOf(item: MenuItem): StationId {
  const s = (item.station || "kitchen").toLowerCase();
  if (s.startsWith("bar")) return "bar";
  if (s.startsWith("other")) return "other";
  return "kitchen";
}

function playSuccess() {
  try {
    const ctx = new AudioContext();
    [523, 659, 784].forEach((freq, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.type = "sine";
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.25);
      o.start(ctx.currentTime + i * 0.12); o.stop(ctx.currentTime + i * 0.12 + 0.25);
    });
  } catch {}
}

export default function GuestMenu() {
  const params = new URLSearchParams(window.location.search);
  const tid = params.get("tid");

  // Data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("Maison HD");
  const [tableNumber, setTableNumber] = useState("");
  const [tableLocation, setTableLocation] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [branding, setBranding] = useState<Branding>({});

  // Navigation
  const [screen, setScreen] = useState<Screen>("home");
  const [activeStation, setActiveStation] = useState<StationId>("kitchen");
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [search, setSearch] = useState("");

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ordered, setOrdered] = useState(false);

  // AI Waiter
  const [showAI, setShowAI] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMsg[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiEndRef = useRef<HTMLDivElement>(null);

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

  // Scroll AI to bottom on new messages
  useEffect(() => {
    if (showAI) aiEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, showAI]);

  // Helpers
  const accent = branding.accent_color || "#C9A96E";
  const primary = branding.primary_color || "#2C2416";

  const stationItems = items.filter(i => stationOf(i) === activeStation);
  const stationCats = categories.filter(c => stationItems.some(i => i.category_id === c.id));

  const filtered = stationItems.filter(it => {
    const matchCat = activeCat === "all" || it.category_id === activeCat;
    const matchSearch = !search || it.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const cartTotal = cart.reduce((s, c) => s + parseFloat(c.item.price) * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const addToCart = useCallback((item: MenuItem) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.item.id === item.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], quantity: n[idx].quantity + 1 }; return n; }
      return [...prev, { item, quantity: 1 }];
    });
  }, []);

  const changeQty = (itemId: number, delta: number) => {
    setCart(prev => prev.map(c => c.item.id === itemId ? { ...c, quantity: c.quantity + delta } : c).filter(c => c.quantity > 0));
  };

  const goStation = (s: StationId) => {
    setActiveStation(s); setActiveCat("all"); setSearch(""); setScreen("menu");
  };

  const submitOrder = async () => {
    if (!cart.length || !tid) return;
    setSubmitting(true);
    try {
      const resp = await fetch(`${API}/fb/public/guest-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: parseInt(tid), items: cart.map(c => ({ itemId: c.item.id, quantity: c.quantity })) }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setOrdered(true); setShowCart(false); playSuccess();
    } catch (e: any) { alert("Помилка: " + e.message); }
    finally { setSubmitting(false); }
  };

  const sendAI = async () => {
    const text = aiInput.trim();
    if (!text || aiLoading) return;
    const userMsg: AiMsg = { role: "user", content: text };
    const next = [...aiMessages, userMsg];
    setAiMessages(next); setAiInput(""); setAiLoading(true);
    try {
      const r = await fetch(`${API}/fb/public/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tid: parseInt(tid || "0"), messages: next }),
      });
      const d = await r.json();
      setAiMessages(m => [...m, { role: "assistant", content: d.reply || d.error || "Помилка відповіді." }]);
    } catch { setAiMessages(m => [...m, { role: "assistant", content: "Помилка з'єднання. Спробуйте ще раз." }]); }
    finally { setAiLoading(false); }
  };

  // ── Loading ──
  if (loading) return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: accent, borderTopColor: "transparent" }} />
        <p className="text-[#8B7355] text-sm">Завантаження меню...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-5xl mb-4">🍽️</div>
        <p className="text-[#8B7355] text-base">{error}</p>
      </div>
    </div>
  );

  if (ordered) return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-6 text-center">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring" }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: `${accent}20` }}>
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke={accent} strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-serif text-[#2C2416] mb-2">Замовлення прийнято!</h2>
        <p className="text-[#8B7355] mb-1">Стіл {tableNumber}{tableLocation ? ` · ${tableLocation}` : ""}</p>
        <p className="text-[#8B7355] text-sm mb-8">Офіціант підтвердить замовлення</p>
        <div className="bg-white rounded-2xl shadow-sm border border-[#E8E0D0] p-4 text-left mb-6 max-w-xs mx-auto">
          {cart.map(c => (
            <div key={c.item.id} className="flex justify-between text-sm py-1.5 border-b border-[#F0EBE0] last:border-0">
              <span className="text-[#2C2416]">{c.item.name} × {c.quantity}</span>
              <span className="text-[#8B7355]">{(parseFloat(c.item.price) * c.quantity).toFixed(0)} ₴</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold text-[#2C2416] pt-2 mt-1">
            <span>Разом</span><span>{cartTotal.toFixed(0)} ₴</span>
          </div>
        </div>
        <button onClick={() => { setOrdered(false); setCart([]); setScreen("home"); }} className="text-sm underline underline-offset-2" style={{ color: accent }}>
          Зробити ще одне замовлення
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col max-w-lg mx-auto relative">
      <AnimatePresence mode="wait">

        {/* ══ HOME SCREEN ══════════════════════════════════════════════════ */}
        {screen === "home" && (
          <motion.div key="home" className="flex flex-col min-h-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>

            {/* Hero header */}
            <div className="relative overflow-hidden" style={{ background: `linear-gradient(160deg, ${primary} 0%, #4A3728 100%)` }}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.3'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
              <div className="relative px-6 pt-12 pb-8 text-center">
                {branding.logo_url ? (
                  <img src={branding.logo_url} alt={orgName} className="h-20 w-auto mx-auto mb-4 object-contain rounded-xl" />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-4 text-4xl">🍽</div>
                )}
                <h1 className="text-2xl font-serif text-white mb-1">{orgName}</h1>
                <p className="text-white/60 text-sm">
                  Стіл {tableNumber}{tableLocation ? ` · ${tableLocation}` : ""}
                </p>
              </div>
            </div>

            {/* Station buttons */}
            <div className="px-5 py-6 space-y-3 flex-1">
              <p className="text-xs text-[#8B7355] uppercase tracking-widest font-medium text-center mb-4">Оберіть розділ меню</p>
              {STATIONS.map(station => {
                const count = items.filter(i => stationOf(i) === station.id).length;
                if (count === 0) return null;
                return (
                  <button key={station.id} onClick={() => goStation(station.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r ${station.bg} text-white shadow-lg hover:shadow-xl active:scale-[0.98] transition-all`}>
                    <div className="w-14 h-14 rounded-xl bg-white/15 flex items-center justify-center text-3xl shrink-0">
                      {station.emoji}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-semibold text-lg leading-tight">{station.label}</div>
                      <div className="text-white/60 text-sm">{station.desc}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-white/50 text-xs">{count} позицій</span>
                      <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* AI Waiter button */}
            <div className="px-5 pb-8">
              <button onClick={() => { setShowAI(true); if (aiMessages.length === 0) setAiMessages([{ role: "assistant", content: `Привіт! Я ваш AI-офіціант 👨‍🍳\n\nЗ задоволенням розповім про меню, порекомендую страви або підберу напій. Що вас цікавить?` }]); }}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border-2 bg-white shadow-sm hover:shadow-md active:scale-[0.98] transition-all"
                style={{ borderColor: accent, color: primary }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: `${accent}20` }}>✨</div>
                <div className="text-left">
                  <div className="font-semibold text-sm" style={{ color: primary }}>AI-Офіціант</div>
                  <div className="text-xs text-[#8B7355]">Запитайте про меню або отримайте рекомендацію</div>
                </div>
              </button>
            </div>
          </motion.div>
        )}

        {/* ══ MENU SCREEN ══════════════════════════════════════════════════ */}
        {screen === "menu" && (
          <motion.div key="menu" className="flex flex-col min-h-screen" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.25 }}>

            {/* Top bar */}
            <div className="bg-white border-b border-[#E8E0D0] px-4 pt-4 pb-3 sticky top-0 z-30 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <button onClick={() => { setScreen("home"); setSearch(""); }}
                  className="w-8 h-8 rounded-full bg-[#FAF8F5] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#5C4E38]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xl">{STATIONS.find(s => s.id === activeStation)?.emoji}</span>
                  <span className="font-semibold text-[#2C2416]">{STATIONS.find(s => s.id === activeStation)?.label}</span>
                  <span className="text-xs text-[#8B7355] ml-auto">Стіл {tableNumber}</span>
                </div>
                {cartCount > 0 && (
                  <button onClick={() => setShowCart(true)}
                    className="relative flex items-center gap-1.5 text-white text-sm font-medium rounded-full px-3 py-1.5 shadow"
                    style={{ background: primary }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    {cartCount}
                  </button>
                )}
              </div>

              {/* Search */}
              <div className="relative">
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#B0A090]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук..."
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#FAF8F5] border border-[#E0D8CC] rounded-lg focus:outline-none focus:border-[#C9A96E]" />
              </div>
            </div>

            {/* Category tabs */}
            {stationCats.length > 0 && !search && (
              <div className="flex gap-2 px-4 py-2.5 overflow-x-auto scrollbar-none sticky top-[108px] z-20 bg-[#FAF8F5]">
                <button onClick={() => setActiveCat("all")}
                  className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors ${activeCat === "all" ? "text-white" : "bg-white border border-[#E0D8CC] text-[#5C4E38]"}`}
                  style={activeCat === "all" ? { background: primary } : {}}>
                  Все
                </button>
                {stationCats.map(cat => (
                  <button key={cat.id} onClick={() => setActiveCat(cat.id)}
                    className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors ${activeCat === cat.id ? "text-white" : "bg-white border border-[#E0D8CC] text-[#5C4E38]"}`}
                    style={activeCat === cat.id ? { background: primary } : {}}>
                    {cat.emoji && <span className="mr-1">{cat.emoji}</span>}{cat.name}
                  </button>
                ))}
              </div>
            )}

            {/* Items */}
            <div className="flex-1 px-4 pb-36 space-y-3 mt-1">
              {filtered.length === 0 ? (
                <div className="text-center py-16 text-[#B0A090]">Нічого не знайдено</div>
              ) : filtered.map(item => {
                const inCart = cart.find(c => c.item.id === item.id);
                return (
                  <div key={item.id} className="bg-white rounded-2xl border border-[#E8E0D0] p-3 flex gap-3 items-start shadow-sm">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-20 h-20 rounded-xl object-cover shrink-0 bg-[#F0EBE0]" />
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#F0EBE0] to-[#E0D8CC] shrink-0 flex items-center justify-center text-2xl">
                        {STATIONS.find(s => s.id === activeStation)?.emoji || "🍽️"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-1 mb-0.5">
                        <h3 className="font-semibold text-[#2C2416] text-sm leading-tight">{item.name}</h3>
                        {item.is_popular && <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium" style={{ background: `${accent}20`, color: accent }}>Хіт</span>}
                        {item.is_vegetarian && <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full shrink-0 font-medium">🌿</span>}
                      </div>
                      {item.description && <p className="text-xs text-[#8B7355] line-clamp-2 mb-1.5">{item.description}</p>}
                      {item.cook_minutes && <p className="text-[11px] text-[#B0A090] mb-1.5">⏱ ~{item.cook_minutes} хв</p>}
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#2C2416]">{parseFloat(item.price).toFixed(0)} ₴</span>
                        {inCart ? (
                          <div className="flex items-center gap-2">
                            <button onClick={() => changeQty(item.id, -1)} className="w-7 h-7 rounded-full bg-[#F0EBE0] flex items-center justify-center text-[#2C2416] font-bold text-base">−</button>
                            <span className="w-4 text-center font-semibold text-sm text-[#2C2416]">{inCart.quantity}</span>
                            <button onClick={() => changeQty(item.id, 1)} className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-base" style={{ background: primary }}>+</button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(item)} className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ background: primary }}>+</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sticky cart button */}
            {cartCount > 0 && !showCart && (
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#FAF8F5] via-[#FAF8F5] to-transparent max-w-lg mx-auto z-40">
                <button onClick={() => setShowCart(true)}
                  className="w-full text-white rounded-2xl py-4 font-semibold flex items-center justify-between px-5 shadow-lg"
                  style={{ background: primary }}>
                  <span className="bg-white/20 rounded-full px-2.5 py-0.5 text-sm">{cartCount}</span>
                  <span>Переглянути замовлення</span>
                  <span>{cartTotal.toFixed(0)} ₴</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Waiter floating button (visible on menu screen) */}
      {screen === "menu" && (
        <button onClick={() => { setShowAI(true); if (aiMessages.length === 0) setAiMessages([{ role: "assistant", content: `Привіт! Я ваш AI-офіціант 👨‍🍳\n\nЗ задоволенням розповім про меню, порекомендую страви або підберу напій. Що вас цікавить?` }]); }}
          className="fixed bottom-24 right-4 w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-2xl z-40 border-2 border-white"
          style={{ background: `linear-gradient(135deg, ${accent}, #e8b87a)` }}>
          ✨
        </button>
      )}

      {/* Cart modal */}
      <AnimatePresence>
        {showCart && (
          <motion.div className="fixed inset-0 z-50 flex flex-col" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
            <div className="flex-1 bg-black/30" onClick={() => setShowCart(false)} />
            <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col max-w-lg mx-auto w-full">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#F0EBE0]">
                <h2 className="text-lg font-serif text-[#2C2416]">Ваше замовлення</h2>
                <button onClick={() => setShowCart(false)} className="text-[#8B7355]">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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
                      <button onClick={() => changeQty(c.item.id, -1)} className="w-7 h-7 rounded-full bg-[#F0EBE0] flex items-center justify-center font-bold text-[#2C2416]">−</button>
                      <span className="w-4 text-center text-sm font-semibold">{c.quantity}</span>
                      <button onClick={() => changeQty(c.item.id, 1)} className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white" style={{ background: primary }}>+</button>
                    </div>
                    <div className="w-16 text-right font-semibold text-sm text-[#2C2416]">{(parseFloat(c.item.price) * c.quantity).toFixed(0)} ₴</div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-[#F0EBE0]">
                <div className="flex justify-between font-bold text-[#2C2416] mb-3">
                  <span>Разом</span><span>{cartTotal.toFixed(0)} ₴</span>
                </div>
                <p className="text-xs text-[#8B7355] mb-3 text-center">Стіл {tableNumber}{tableLocation ? ` · ${tableLocation}` : ""} · Офіціант підтвердить замовлення</p>
                <button onClick={submitOrder} disabled={submitting} className="w-full text-white rounded-2xl py-4 font-semibold text-base disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: primary }}>
                  {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {submitting ? "Відправляємо..." : "Замовити"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Waiter chat */}
      <AnimatePresence>
        {showAI && (
          <motion.div className="fixed inset-0 z-50 flex flex-col" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
            <div className="flex-1 bg-black/40" onClick={() => setShowAI(false)} />
            <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col max-w-lg mx-auto w-full">
              {/* AI header */}
              <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-[#F0EBE0] shrink-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: `linear-gradient(135deg, ${accent}, #e8b87a)` }}>✨</div>
                <div className="flex-1">
                  <div className="font-semibold text-[#2C2416] text-sm">AI-Офіціант</div>
                  <div className="text-xs text-[#8B7355]">Знає все про меню · {orgName}</div>
                </div>
                <button onClick={() => setShowAI(false)} className="text-[#8B7355]">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {aiMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "text-white rounded-br-sm"
                        : "bg-[#FAF8F5] text-[#2C2416] rounded-bl-sm border border-[#E8E0D0]"
                    }`} style={m.role === "user" ? { background: primary } : {}}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#FAF8F5] border border-[#E8E0D0] rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                      {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[#C9A96E] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                    </div>
                  </div>
                )}
                <div ref={aiEndRef} />
              </div>

              {/* Quick prompts (if no messages from user yet) */}
              {aiMessages.filter(m => m.role === "user").length === 0 && (
                <div className="px-4 pb-2 flex flex-wrap gap-2">
                  {["Що порекомендуєш?", "Є вегетаріанські страви?", "Які напої є?", "Що до вина?"].map(q => (
                    <button key={q} onClick={() => { setAiInput(q); setTimeout(() => sendAI(), 50); }}
                      className="text-xs px-3 py-1.5 rounded-full border font-medium bg-white hover:bg-[#FAF8F5] transition-colors"
                      style={{ borderColor: accent, color: accent }}>
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="px-4 py-3 border-t border-[#F0EBE0] shrink-0 flex gap-2">
                <input value={aiInput} onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAI(); } }}
                  placeholder="Запитайте про меню..."
                  className="flex-1 px-4 py-2.5 text-sm bg-[#FAF8F5] border border-[#E0D8CC] rounded-xl focus:outline-none focus:border-[#C9A96E]" />
                <button onClick={sendAI} disabled={!aiInput.trim() || aiLoading}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40 shrink-0"
                  style={{ background: aiInput.trim() && !aiLoading ? accent : "#C0B090" }}>
                  <svg className="w-5 h-5 rotate-90" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
