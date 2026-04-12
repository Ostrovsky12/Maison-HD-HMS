import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "wouter";
import {
  ShoppingCart, Plus, Minus, X, ChevronLeft, CheckCircle2,
  Leaf, Flame, Star, Clock, Search, ArrowRight, Loader2,
  Bot, Send, Mic, MicOff, Sparkles, MessageCircle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_BASE = BASE.replace("/maison-hd", "") + "/api/public";

const fmtMoney = (n: any) => parseFloat(n || 0).toLocaleString("uk-UA") + " ₴";

type Item = {
  id: number; name: string; description?: string; price: string;
  cookMinutes?: number; isVegetarian?: boolean; isPopular?: boolean;
  allergens?: string[]; tags?: string[]; image_url?: string;
};

type Category = { id: number; name: string; emoji: string; items: Item[] };
type CartItem = Item & { quantity: number; notes?: string };
type ChatMsg = { role: "user" | "assistant"; content: string; isAction?: boolean };

// ─── Quick reply suggestions shown before first user message ──────────────────
const QUICK_REPLIES = [
  { label: "⭐ Що рекомендуєте?", text: "Що порадите спробувати? Ваші хіти?" },
  { label: "🌿 Вегетаріанське", text: "Які у вас вегетаріанські страви?" },
  { label: "🍷 Рекомендуй вино", text: "Порадь вино до мого замовлення" },
  { label: "⚠️ Є алергія", text: "У мене алергія на горіхи. Що можна замовити?" },
  { label: "🛒 Перевір кошик", text: "Перевір мій кошик — чого не вистачає?" },
];

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
  const [tipPct, setTipPct] = useState(0);

  // ── Guest phone state ──────────────────────────────────────────────────────
  const [guestPhone, setGuestPhone] = useState<string>(() => {
    try { return localStorage.getItem(`qr_phone_${orgSlug}`) || ""; } catch { return ""; }
  });
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);
  const [guestGreeting, setGuestGreeting] = useState<string | null>(null);

  // ── AI Chat state ──────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(() => {
    try {
      const saved = sessionStorage.getItem(`qr_chat_${orgSlug}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHint, setChatHint] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [userHasSentMsg, setUserHasSentMsg] = useState(chatMessages.some(m => m.role === "user"));
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const prevCartLen = useRef(0);

  // ── Menu load ──────────────────────────────────────────────────────────────
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
        if (tableRes?.ok) { const td = await tableRes.json(); setTableInfo(td.table); }
      } catch { setError("Не вдалося завантажити меню"); }
      setLoading(false);
    };
    load();
  }, [orgSlug, tableId]);

  // ── Persist chat messages in sessionStorage ────────────────────────────────
  useEffect(() => {
    try { sessionStorage.setItem(`qr_chat_${orgSlug}`, JSON.stringify(chatMessages)); } catch {}
  }, [chatMessages, orgSlug]);

  // ── Load guest info if phone known ─────────────────────────────────────────
  useEffect(() => {
    if (!guestPhone) return;
    fetch(`${API_BASE}/ai-waiter/guest/${orgSlug}/${encodeURIComponent(guestPhone)}`)
      .then(r => r.json())
      .then(d => {
        if (d.guest?.name) setGuestGreeting(d.guest.name);
      })
      .catch(() => {});
  }, [guestPhone, orgSlug]);

  // ── Proactive chat hint when first item added ──────────────────────────────
  useEffect(() => {
    if (cart.length > 0 && prevCartLen.current === 0 && !chatOpen) {
      setChatHint(true);
      const t = setTimeout(() => setChatHint(false), 6000);
      return () => clearTimeout(t);
    }
    prevCartLen.current = cart.length;
  }, [cart.length]);

  // ── Auto-scroll chat to bottom ─────────────────────────────────────────────
  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  // ── Cart helpers ───────────────────────────────────────────────────────────
  const addToCart = (item: Item) => {
    setCart(prev => {
      const ex = prev.find(c => c.id === item.id);
      if (ex) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const addToCartById = useCallback((itemId: number, qty: number = 1, notes?: string) => {
    const allItems = menu?.categories.flatMap(c => c.items) || [];
    const item = allItems.find(i => i.id === itemId);
    if (!item) return false;
    setCart(prev => {
      const ex = prev.find(c => c.id === item.id);
      if (ex) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + qty, notes: notes || c.notes } : c);
      return [...prev, { ...item, quantity: qty, notes }];
    });
    return true;
  }, [menu]);

  const removeFromCart = (id: number) => {
    setCart(prev => {
      const ex = prev.find(c => c.id === id);
      if (ex && ex.quantity > 1) return prev.map(c => c.id === id ? { ...c, quantity: c.quantity - 1 } : c);
      return prev.filter(c => c.id !== id);
    });
  };

  const removeFromCartById = useCallback((itemId: number) => {
    setCart(prev => prev.filter(c => c.id !== itemId));
  }, []);

  // ── AI Chat helpers ────────────────────────────────────────────────────────
  const applyActions = useCallback((actions: any[]) => {
    for (const a of actions) {
      if (a.type === "add_to_cart") addToCartById(a.item_id, a.quantity || 1, a.notes);
      if (a.type === "remove_from_cart") removeFromCartById(a.item_id);
    }
  }, [addToCartById, removeFromCartById]);

  const sendToAI = useCallback(async (msgs: ChatMsg[], _showUserMsg: boolean = true) => {
    setChatLoading(true);
    try {
      const r = await fetch(`${API_BASE}/ai-waiter/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgSlug,
          messages: msgs.map(m => ({ role: m.role, content: m.content })),
          cart: cart.map(c => ({ id: c.id, name: c.name, price: c.price, quantity: c.quantity })),
          guestPhone: guestPhone || undefined,
        }),
      });
      const data = await r.json();
      if (data.actions?.length) applyActions(data.actions);
      if (data.reply) {
        setChatMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Вибачте, не вдалося підключитися. Спробуйте ще раз 🙏" }]);
    }
    setChatLoading(false);
  }, [orgSlug, cart, applyActions, guestPhone]);

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride || chatInput).trim();
    if (!text || chatLoading) return;
    // On first user message, if no phone stored yet — show phone capture modal
    if (!userHasSentMsg && !guestPhone) {
      setPendingMsg(text);
      setShowPhoneModal(true);
      setChatInput("");
      return;
    }
    setUserHasSentMsg(true);
    const userMsg: ChatMsg = { role: "user", content: text };
    const newMsgs = [...chatMessages, userMsg];
    setChatMessages(newMsgs);
    setChatInput("");
    await sendToAI(newMsgs);
  };

  const submitPhone = async () => {
    const ph = phoneInput.trim();
    if (ph) {
      try { localStorage.setItem(`qr_phone_${orgSlug}`, ph); } catch {}
      setGuestPhone(ph);
    }
    setShowPhoneModal(false);
    setPhoneInput("");
    const text = pendingMsg;
    setPendingMsg(null);
    if (text) {
      setUserHasSentMsg(true);
      const userMsg: ChatMsg = { role: "user", content: text };
      const newMsgs = [...chatMessages, userMsg];
      setChatMessages(newMsgs);
      await sendToAI(newMsgs);
    }
  };

  const openChat = async () => {
    setChatOpen(true);
    setChatHint(false);
    setTimeout(() => chatInputRef.current?.focus(), 300);
    if (chatMessages.length === 0) {
      setChatLoading(true);
      try {
        const r = await fetch(`${API_BASE}/ai-waiter/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgSlug,
            messages: [{ role: "user", content: "__greet__" }],
            cart: cart.map(c => ({ id: c.id, name: c.name, price: c.price, quantity: c.quantity })),
            guestPhone: guestPhone || undefined,
          }),
        });
        const data = await r.json();
        if (data.reply) setChatMessages([{ role: "assistant", content: data.reply }]);
      } catch {
        const defaultGreet = guestGreeting
          ? `З поверненням, ${guestGreeting}! 👋 Раді бачити вас знову. Чим можу допомогти?`
          : "Вітаємо! Я AI-офіціант, радий допомогти вам обрати страви. Що вас цікавить? 😊";
        setChatMessages([{ role: "assistant", content: defaultGreet }]);
      }
      setChatLoading(false);
    }
  };

  // ── Voice input ────────────────────────────────────────────────────────────
  const toggleVoice = () => {
    if (voiceActive) {
      recognitionRef.current?.stop();
      setVoiceActive(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "uk-UA";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const t = e.results[0]?.[0]?.transcript;
      if (t) { setChatInput(t); setVoiceActive(false); }
    };
    rec.onend = () => setVoiceActive(false);
    rec.onerror = () => setVoiceActive(false);
    recognitionRef.current = rec;
    rec.start();
    setVoiceActive(true);
  };

  // ── Cart math ─────────────────────────────────────────────────────────────
  const cartQty = (id: number) => cart.find(c => c.id === id)?.quantity || 0;
  const totalItems = cart.reduce((s, c) => s + c.quantity, 0);
  const totalAmount = cart.reduce((s, c) => s + parseFloat(c.price) * c.quantity, 0);
  const tipAmount = Math.round(totalAmount * tipPct) / 100;
  const grandTotal = totalAmount + tipAmount;

  const filteredCategories = useMemo(() => {
    if (!menu) return [];
    if (!search) return menu.categories.filter(c => !activeCategory || c.id === activeCategory || search);
    const q = search.toLowerCase();
    return menu.categories.map(cat => ({
      ...cat,
      items: cat.items.filter(i => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)),
    })).filter(cat => cat.items.length > 0);
  }, [menu, search, activeCategory]);

  const displayCategories = search
    ? filteredCategories
    : (menu?.categories.filter(c => !activeCategory || c.id === activeCategory) || []);

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
          guestName: guestName || (guestGreeting ? guestGreeting : "Гість"),
          guestCount: 1,
          notes: orderNotes || null,
          tipPct: tipPct || null,
          tipAmount: tipAmount > 0 ? tipAmount : null,
          items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, quantity: c.quantity, notes: c.notes })),
          guestPhone: guestPhone || undefined,
        }),
      });
      const d = await r.json();
      if (d.orderId) {
        setOrderId(d.orderId);
        setSubmitted(true);
        setCart([]);
        setShowCart(false);
        // Post-order AI message in chat
        try {
          const postMsg = "Моє замовлення щойно оформлено!";
          const aiR = await fetch(`${API_BASE}/ai-waiter/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orgSlug,
              messages: [...chatMessages.map(m => ({ role: m.role, content: m.content })), { role: "user", content: postMsg }],
              cart: [],
              guestPhone: guestPhone || undefined,
            }),
          });
          const aiD = await aiR.json();
          if (aiD.reply) {
            setChatMessages(prev => [
              ...prev,
              { role: "user", content: postMsg },
              { role: "assistant", content: aiD.reply },
            ]);
          }
        } catch {}
      } else {
        alert(d.error || "Помилка при оформленні замовлення");
      }
    } catch { alert("Помилка з'єднання"); }
    setSubmitting(false);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin text-amber-500 mx-auto mb-3" />
        <p className="text-stone-500 text-sm">Завантаження меню...</p>
      </div>
    </div>
  );

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

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-50 pb-32">

      {/* Header */}
      <div className="bg-white border-b border-stone-100 sticky top-0 z-40">
        <div className="px-4 pt-4 pb-2 max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-bold text-stone-900">{menu?.org.name}</h1>
              {tableInfo && <p className="text-xs text-stone-500">Стіл {tableInfo.number} · {tableInfo.location}</p>}
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

      {/* Menu Items */}
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
                  <div key={item.id} className={`bg-white rounded-2xl border transition-all overflow-hidden ${qty > 0 ? "border-amber-300 shadow-sm" : "border-stone-100"}`}>
                    {/* Item image — full width banner if present */}
                    {item.image_url && (
                      <div className="w-full h-36 bg-stone-100 overflow-hidden">
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      </div>
                    )}
                    <div className="p-4">
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

      {/* Sticky Cart Button */}
      {totalItems > 0 && !showCart && !chatOpen && (
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

      {/* Cart Sheet */}
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
                    {item.notes && <p className="text-xs text-stone-400">{item.notes}</p>}
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
              <div className="flex items-center justify-between mb-3">
                <span className="text-stone-500 text-sm">Сума ({totalItems} поз.)</span>
                <span className="font-semibold text-stone-800">{fmtMoney(totalAmount)}</span>
              </div>
              <div className="mb-3">
                <p className="text-xs font-medium text-stone-500 mb-1.5">Чайові для персоналу</p>
                <div className="flex gap-2">
                  {[0, 5, 7, 10, 15].map(pct => (
                    <button
                      key={pct}
                      onClick={() => setTipPct(pct)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all ${tipPct === pct ? "bg-amber-500 text-white border-amber-500" : "bg-white text-stone-600 border-stone-200 hover:border-amber-300"}`}
                    >
                      {pct === 0 ? "Без" : `${pct}%`}
                    </button>
                  ))}
                </div>
                {tipAmount > 0 && <p className="text-xs text-stone-400 mt-1">Чайові: {fmtMoney(tipAmount)}</p>}
              </div>
              <div className="flex items-center justify-between mb-4 pt-2 border-t border-stone-100">
                <span className="font-semibold text-stone-700">До сплати</span>
                <span className="font-bold text-xl text-stone-900">{fmtMoney(grandTotal)}</span>
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

      {/* ─── Phone Capture Modal ─────────────────────────────────────────────── */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowPhoneModal(false); setPendingMsg(null); }} />
          <div className="relative bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <h2 className="font-bold text-stone-900 text-lg">AI-офіціант запам'ятає вас</h2>
              <p className="text-stone-500 text-sm mt-1">Введіть номер телефону, щоб AI знав ваші смаки та вітав вас по-особливому при наступному візиті.</p>
            </div>
            <input
              type="tel"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitPhone(); }}
              placeholder="+380 XX XXX XX XX"
              autoFocus
              className="w-full border-2 border-stone-200 focus:border-amber-400 rounded-2xl px-4 py-3 text-center text-lg font-medium outline-none mb-3"
            />
            <button
              onClick={submitPhone}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3.5 rounded-2xl font-bold text-sm mb-2"
            >
              Продовжити
            </button>
            <button
              onClick={() => { setShowPhoneModal(false); setPendingMsg(null); }}
              className="w-full text-stone-400 text-sm py-1"
            >
              Пропустити
            </button>
          </div>
        </div>
      )}

      {/* ─── AI Chat Floating Button ─────────────────────────────────────────── */}
      {!submitted && menu && (
        <div className="fixed bottom-6 right-4 z-40 flex flex-col items-end gap-2">
          {/* Proactive hint bubble */}
          {chatHint && !chatOpen && (
            <div className="bg-stone-900 text-white text-xs px-4 py-2.5 rounded-2xl shadow-xl max-w-[200px] text-center leading-snug animate-bounce-in">
              <Sparkles className="w-3 h-3 inline mr-1 text-amber-400" />
              Запитайте AI-офіціанта про доповнення!
              <div className="absolute -bottom-1.5 right-6 w-3 h-3 bg-stone-900 rotate-45" />
            </div>
          )}
          <button
            onClick={chatOpen ? () => setChatOpen(false) : openChat}
            className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-95 relative ${chatOpen ? "bg-stone-700" : "bg-gradient-to-br from-amber-400 to-orange-500 hover:scale-105"}`}
          >
            {chatOpen ? (
              <X className="w-5 h-5 text-white" />
            ) : (
              <>
                <Bot className="w-6 h-6 text-white" />
                {chatHint && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white" />
                )}
              </>
            )}
          </button>
        </div>
      )}

      {/* ─── AI Chat Drawer ───────────────────────────────────────────────────── */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setChatOpen(false)} />

          {/* Chat panel */}
          <div className="relative bg-white rounded-t-3xl flex flex-col shadow-2xl" style={{ maxHeight: "88vh", minHeight: "60vh" }}>

            {/* Header */}
            <div className="bg-gradient-to-r from-amber-400 via-orange-400 to-orange-500 rounded-t-3xl px-5 py-4 flex items-center gap-3 flex-shrink-0">
              <div className="relative">
                <div className="w-11 h-11 bg-white/25 rounded-2xl flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-white text-sm leading-tight">AI Офіціант</p>
                <p className="text-amber-100 text-xs">Знає меню, склад, вина · Відповідає миттєво</p>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">

              {chatMessages.length === 0 && chatLoading && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-stone-100 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
                    {[0, 150, 300].map(d => (
                      <div key={d} className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                    msg.role === "user"
                      ? "bg-amber-500 text-white rounded-tr-sm"
                      : "bg-stone-100 text-stone-800 rounded-tl-sm"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {chatLoading && chatMessages.length > 0 && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-stone-100 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
                    {[0, 150, 300].map(d => (
                      <div key={d} className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Quick reply chips — show only before first user message */}
              {!userHasSentMsg && chatMessages.length > 0 && !chatLoading && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {QUICK_REPLIES.map(qr => (
                    <button
                      key={qr.label}
                      onClick={() => sendMessage(qr.text)}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
                    >
                      {qr.label}
                    </button>
                  ))}
                </div>
              )}

              <div ref={chatScrollRef} />
            </div>

            {/* Input bar */}
            <div className="px-4 pb-safe pb-4 pt-2 border-t border-stone-100 bg-white flex-shrink-0">
              <div className="flex gap-2 items-center">
                <div className="flex-1 bg-stone-100 rounded-2xl flex items-center px-4 py-2.5 gap-2 min-h-[46px]">
                  <input
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Запитайте про страви, алергени, вина..."
                    className="flex-1 bg-transparent text-sm text-stone-800 placeholder-stone-400 outline-none"
                  />
                  <button
                    onClick={toggleVoice}
                    title="Голосовий ввід"
                    className={`flex-shrink-0 transition-colors ${voiceActive ? "text-red-500 animate-pulse" : "text-stone-400 hover:text-amber-500"}`}
                  >
                    {voiceActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={() => sendMessage()}
                  disabled={!chatInput.trim() || chatLoading}
                  className="w-11 h-11 bg-amber-500 hover:bg-amber-600 disabled:bg-stone-200 disabled:text-stone-400 text-white rounded-2xl flex items-center justify-center transition-all flex-shrink-0 shadow-sm"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-center text-xs text-stone-400 mt-2">
                AI може помилятися · Уточнюйте алергени у персоналу
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
