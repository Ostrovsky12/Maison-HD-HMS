import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { Drawer } from "vaul";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, Minus, X, Check, Search, Sparkles, Mic, Send, 
  Loader2, Info, Star, Leaf, Clock
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_BASE = BASE.replace("/maison-hd", "") + "/api/public";

const fmtMoney = (n: any) => parseFloat(n || 0).toLocaleString("uk-UA") + " ₴";

const cleanString = (str: string) => 
  str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2B50}\u{231A}\u{231B}\u{25AA}\u{25AB}\u{25FB}-\u{25FE}\u{2600}-\u{2604}\u{260E}\u{2611}\u{2614}\u{2615}\u{2618}\u{261D}\u{2620}\u{2622}\u{2623}\u{2626}\u{262A}\u{262E}\u{262F}\u{2638}-\u{263A}\u{2640}\u{2642}\u{2648}-\u{2653}\u{2660}-\u{2668}\u{267B}\u{267F}\u{2692}-\u{269C}\u{26A0}\u{26A1}\u{26AA}\u{26AB}\u{26B0}\u{26B1}\u{26BD}\u{26BE}\u{26C4}\u{26C5}\u{26CE}\u{26CF}\u{26D1}\u{26D3}\u{26D4}\u{26E9}\u{26EA}\u{26F0}-\u{26F5}\u{26F7}-\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}\u{2935}\u{2B05}-\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]/gu, '')
     .trim();

type ModifierOption = {
  id: number;
  name: string;
  price_delta?: string | number;
};

type ModifierGroup = {
  id: number;
  name: string;
  is_required?: boolean;
  min_select?: number;
  max_select?: number;
  options: ModifierOption[];
};

type Item = {
  id: number; name: string; description?: string; price: string;
  cookMinutes?: number; isVegetarian?: boolean; isPopular?: boolean;
  allergens?: string[]; tags?: string[]; imageUrl?: string;
  modifier_groups?: ModifierGroup[];
  modifierGroups?: ModifierGroup[]; // For fallback
};

type Category = { id: number; name: string; emoji: string; items: Item[] };

type SelectedModifier = {
  groupId: number;
  optionId: number;
  name: string;
  price: number;
};

type CartItem = {
  cartItemId: string;
  item: Item;
  quantity: number;
  notes: string;
  modifiers: SelectedModifier[];
};

type ChatMsg = { role: "user" | "assistant"; content: string; isAction?: boolean };

const QUICK_REPLIES = [
  { label: "Рекомендує шеф", text: "Що ви рекомендуєте скуштувати сьогодні?" },
  { label: "Вегетаріанські страви", text: "Які у вас є вегетаріанські страви?" },
  { label: "Підібрати вино", text: "Порадьте вино до мого замовлення" },
  { label: "Алергії та дієта", text: "У мене є алергія. Що можна безпечно замовити?" },
  { label: "Перевірити замовлення", text: "Перевірте моє замовлення — можливо, чогось бракує?" },
];

const generateCartItemId = (itemId: number, modifiers: SelectedModifier[], notes: string) => {
  const modString = [...modifiers]
    .sort((a, b) => a.groupId === b.groupId ? a.optionId - b.optionId : a.groupId - b.groupId)
    .map(m => `${m.groupId}:${m.optionId}`)
    .join('|');
  return `${itemId}-${modString}-${notes}`;
};

const getCartItemPrice = (c: CartItem) => {
  let base = parseFloat(c.item.price || "0");
  let mods = 0;
  for (const m of c.modifiers) {
    mods += m.price;
  }
  return (base + mods) * c.quantity;
};

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
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [search, setSearch] = useState("");
  
  const [guestName, setGuestName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  
  // Post-order state
  const [submitted, setSubmitted] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  
  const [tipPct, setTipPct] = useState(0);

  // Item Detail State
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemSelections, setItemSelections] = useState<Record<number, ModifierOption[]>>({});
  const [itemQty, setItemQty] = useState(1);
  const [itemNotes, setItemNotes] = useState("");

  // Guest Phone
  const [guestPhone, setGuestPhone] = useState<string>(() => {
    try { return localStorage.getItem(`qr_phone_${orgSlug}`) || ""; } catch { return ""; }
  });
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);
  const [guestGreeting, setGuestGreeting] = useState<string | null>(null);

  // AI Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(() => {
    try {
      const saved = sessionStorage.getItem(`qr_chat_${orgSlug}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [userHasSentMsg, setUserHasSentMsg] = useState(chatMessages.some(m => m.role === "user"));
  
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

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

  useEffect(() => {
    try { sessionStorage.setItem(`qr_chat_${orgSlug}`, JSON.stringify(chatMessages)); } catch {}
  }, [chatMessages, orgSlug]);

  useEffect(() => {
    if (!guestPhone) return;
    fetch(`${API_BASE}/ai-waiter/guest/${orgSlug}/${encodeURIComponent(guestPhone)}`)
      .then(r => r.json())
      .then(d => { if (d.guest?.name) setGuestGreeting(d.guest.name); })
      .catch(() => {});
  }, [guestPhone, orgSlug]);

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const filteredCategories = useMemo(() => {
    if (!menu) return [];
    if (!search) return menu.categories;
    const q = search.toLowerCase();
    return menu.categories.map(cat => ({
      ...cat,
      items: cat.items.filter(i => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)),
    })).filter(cat => cat.items.length > 0);
  }, [menu, search]);

  const popularItems = useMemo(() => {
    if (!menu) return [];
    return menu.categories.flatMap(c => c.items).filter(i => i.isPopular);
  }, [menu]);

  useEffect(() => {
    if (isSearchActive || !filteredCategories.length) return;
    const handleScroll = () => {
      const scrollY = window.scrollY + 140;
      for (let i = filteredCategories.length - 1; i >= 0; i--) {
        const el = document.getElementById(`category-${filteredCategories[i].id}`);
        if (el && el.offsetTop <= scrollY) {
          setActiveCategory(filteredCategories[i].id);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [filteredCategories, isSearchActive]);

  const scrollToCategory = (id: number) => {
    setActiveCategory(id);
    const el = document.getElementById(`category-${id}`);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const getModifierGroups = (item: Item): ModifierGroup[] => {
    return item.modifier_groups || item.modifierGroups || [];
  };

  const hasRequiredModifiers = (item: Item): boolean => {
    const groups = getModifierGroups(item);
    return groups.some(g => (g.min_select || 0) > 0 || g.is_required);
  };

  // Chat Actions
  const applyActions = useCallback((actions: any[]) => {
    for (const a of actions) {
      if (a.type === "add_to_cart") {
        const allItems = menu?.categories.flatMap(c => c.items) || [];
        const item = allItems.find(i => i.id === a.item_id);
        if (!item) continue;
        if (hasRequiredModifiers(item)) {
          setSelectedItem(item);
        } else {
          const mods: SelectedModifier[] = [];
          const notes = a.notes || "";
          const cartItemId = generateCartItemId(item.id, mods, notes);
          setCart(prev => {
            const ex = prev.find(c => c.cartItemId === cartItemId);
            if (ex) return prev.map(c => c.cartItemId === cartItemId ? { ...c, quantity: c.quantity + (a.quantity || 1) } : c);
            return [...prev, { cartItemId, item, quantity: a.quantity || 1, notes, modifiers: mods }];
          });
        }
      }
      if (a.type === "remove_from_cart") {
        setCart(prev => prev.filter(c => c.item.id !== a.item_id));
      }
    }
  }, [menu]);

  const sendToAI = useCallback(async (msgs: ChatMsg[]) => {
    setChatLoading(true);
    try {
      const r = await fetch(`${API_BASE}/ai-waiter/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgSlug,
          messages: msgs.map(m => ({ role: m.role, content: m.content })),
          cart: cart.map(c => ({ 
            id: c.item.id, 
            name: c.item.name, 
            price: c.item.price, 
            quantity: c.quantity,
            modifiers: c.modifiers.map(m => m.name).join(', ')
          })),
          guestPhone: guestPhone || undefined,
        }),
      });
      const data = await r.json();
      if (data.actions?.length) applyActions(data.actions);
      if (data.reply) {
        setChatMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Не вдалося підключитися. Спробуйте ще раз." }]);
    }
    setChatLoading(false);
  }, [orgSlug, cart, applyActions, guestPhone]);

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride || chatInput).trim();
    if (!text || chatLoading) return;
    if (!userHasSentMsg && !guestPhone) {
      setPendingMsg(text);
      setShowPhoneModal(true);
      setChatInput("");
      return;
    }
    setUserHasSentMsg(true);
    const newMsgs: ChatMsg[] = [...chatMessages, { role: "user", content: text }];
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
      const newMsgs: ChatMsg[] = [...chatMessages, { role: "user", content: text }];
      setChatMessages(newMsgs);
      await sendToAI(newMsgs);
    }
  };

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

  const totalItems = cart.reduce((s, c) => s + c.quantity, 0);
  const totalAmount = cart.reduce((s, c) => s + getCartItemPrice(c), 0);
  const tipAmount = Math.round(totalAmount * tipPct) / 100;
  const grandTotal = totalAmount + tipAmount;

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
          items: cart.map(c => ({ 
            id: c.item.id, 
            quantity: c.quantity, 
            notes: c.notes || null,
            modifiers: c.modifiers.map(m => ({ groupId: m.groupId, optionId: m.optionId }))
          })),
          guestPhone: guestPhone || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: "Не вдалося оформити замовлення", description: d.error || `HTTP ${r.status}`, variant: "destructive" });
        return;
      }
      if (d.orderId) {
        setOrderId(d.orderId);
        setOrderNumber(d.orderNumber || null);
        setServerTotal(d.total || grandTotal);
        setSubmitted(true);
        setCart([]);
        setShowCart(false);
        try {
          const aiR = await fetch(`${API_BASE}/ai-waiter/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orgSlug,
              messages: [...chatMessages.map(m => ({ role: m.role, content: m.content })), { role: "user", content: "Я щойно оформив замовлення!" }],
              cart: [],
              guestPhone: guestPhone || undefined,
            }),
          });
          const aiD = await aiR.json();
          if (aiD.reply) {
            setChatMessages(prev => [
              ...prev,
              { role: "user", content: "Я щойно оформив замовлення!" },
              { role: "assistant", content: aiD.reply },
            ]);
          }
        } catch {}
      } else {
        toast({ title: "Помилка замовлення", description: d.error || "Невідома помилка", variant: "destructive" });
      }
    } catch { 
      toast({ title: "Помилка з’єднання", description: "Не вдалося зв’язатися із сервером.", variant: "destructive" });
    }
    setSubmitting(false);
  };

  // Item Drawer Logic
  useEffect(() => {
    if (selectedItem) {
      setItemSelections({});
      setItemQty(1);
      setItemNotes("");
    }
  }, [selectedItem]);

  const toggleModifier = (group: ModifierGroup, option: ModifierOption) => {
    setItemSelections(prev => {
      const current = prev[group.id] || [];
      const exists = current.find(o => o.id === option.id);
      if (exists) {
        return { ...prev, [group.id]: current.filter(o => o.id !== option.id) };
      } else {
        const max = group.max_select || Infinity;
        if (current.length >= max) {
          if (max === 1) return { ...prev, [group.id]: [option] };
          return prev; 
        }
        return { ...prev, [group.id]: [...current, option] };
      }
    });
  };

  const isItemValid = useMemo(() => {
    if (!selectedItem) return false;
    const groups = getModifierGroups(selectedItem);
    for (const g of groups) {
      const count = itemSelections[g.id]?.length || 0;
      const min = g.min_select !== undefined ? g.min_select : (g.is_required ? 1 : 0);
      if (count < min) return false;
    }
    return true;
  }, [selectedItem, itemSelections]);

  const estimatedItemPrice = useMemo(() => {
    if (!selectedItem) return 0;
    let base = parseFloat(selectedItem.price || "0");
    let mods = 0;
    Object.values(itemSelections).flat().forEach(opt => {
      if (opt.price_delta) mods += parseFloat(String(opt.price_delta));
    });
    return (base + mods) * itemQty;
  }, [selectedItem, itemSelections, itemQty]);

  const commitItemToCart = () => {
    if (!selectedItem || !isItemValid) return;
    const mods: SelectedModifier[] = [];
    Object.entries(itemSelections).forEach(([gId, opts]) => {
      opts.forEach(opt => {
        mods.push({
          groupId: Number(gId),
          optionId: opt.id,
          name: opt.name,
          price: parseFloat(String(opt.price_delta || "0")) 
        });
      });
    });
    const cartItemId = generateCartItemId(selectedItem.id, mods, itemNotes);
    setCart(prev => {
      const ex = prev.find(c => c.cartItemId === cartItemId);
      if (ex) return prev.map(c => c.cartItemId === cartItemId ? { ...c, quantity: c.quantity + itemQty } : c);
      return [...prev, { cartItemId, item: selectedItem, quantity: itemQty, notes: itemNotes, modifiers: mods }];
    });
    setSelectedItem(null);
  };

  if (loading) return (
    <div className="min-h-[100dvh] bg-[#F9F8F6] flex flex-col items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[#A37346] mb-4" />
      <p className="text-[#7A756D] font-medium text-sm tracking-wide uppercase">Готуємо меню</p>
    </div>
  );

  if (error) return (
    <div className="min-h-[100dvh] bg-[#F9F8F6] flex items-center justify-center p-6 text-center">
      <div>
        <div className="w-16 h-16 bg-white shadow-sm rounded-full flex items-center justify-center mx-auto mb-6">
          <X className="w-6 h-6 text-red-400" />
        </div>
        <h2 className="text-xl font-serif text-[#2D2A26] mb-2">Меню недоступне</h2>
        <p className="text-[#7A756D] text-sm">{error}</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-[100dvh] bg-[#F9F8F6] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />
      <div className="w-20 h-20 bg-[#2D2A26] rounded-full flex items-center justify-center mb-8 shadow-xl relative z-10">
        <Check className="w-10 h-10 text-[#A37346]" />
      </div>
      <h1 className="text-3xl font-serif text-[#2D2A26] mb-3 relative z-10">Замовлення прийнято</h1>
      <p className="text-[#7A756D] mb-2 text-lg relative z-10 font-medium">Order #{orderNumber || orderId}</p>
      {tableInfo && <p className="text-[#7A756D] mb-4 relative z-10">Table {tableInfo.number} {tableInfo.location ? `· ${tableInfo.location}` : ''}</p>}
      
      {serverTotal !== null && (
        <div className="text-2xl font-serif text-[#A37346] mb-8 relative z-10">{fmtMoney(serverTotal)}</div>
      )}
      
      <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-sm mb-8 relative z-10 border border-stone-100">
         <p className="text-[#2D2A26] font-medium text-sm leading-relaxed">
           Замовлення передано офіціанту на підтвердження.<br/>Після перевірки його передадуть на приготування.
         </p>
      </div>

      <button
        onClick={() => { setSubmitted(false); setOrderId(null); setOrderNumber(null); setCart([]); }}
        className="w-full max-w-sm h-14 bg-white border border-stone-200 text-[#2D2A26] rounded-full font-medium relative z-10 shadow-sm hover:bg-stone-50 transition-colors"
      >
        Order More
      </button>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-[#F9F8F6] relative">
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />
      
      <header className="px-5 pt-8 pb-4 flex justify-between items-start sticky top-0 z-30 bg-[#F9F8F6]/95 backdrop-blur-md transition-all">
        {!isSearchActive ? (
          <>
            <div>
              <h1 className="text-2xl font-serif text-[#2D2A26] leading-tight">{menu?.org.name || 'Menu'}</h1>
              {tableInfo && <p className="text-sm text-[#7A756D] mt-1 font-medium">Table {tableInfo.number} {tableInfo.location ? `· ${tableInfo.location}` : ''}</p>}
            </div>
            <button 
              onClick={() => setIsSearchActive(true)}
              className="p-3 bg-white shadow-sm border border-stone-100 rounded-full text-[#2D2A26] hover:bg-stone-50 transition-colors"
              data-testid="button-search"
            >
              <Search className="w-5 h-5" />
            </button>
          </>
        ) : (
          <div className="w-full flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input 
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Пошук у меню..."
                className="w-full pl-10 pr-4 h-12 bg-white border border-stone-100 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-[#A37346]/30 text-[#2D2A26]"
                data-testid="input-search"
              />
            </div>
            <button 
              onClick={() => { setIsSearchActive(false); setSearch(""); }}
              className="p-3 bg-white shadow-sm border border-stone-100 rounded-full text-[#2D2A26] hover:bg-stone-50 transition-colors"
              data-testid="button-close-search"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </header>

      {!isSearchActive && popularItems.length > 0 && (
        <section className="py-4 relative z-20">
          <h2 className="px-5 text-lg font-serif mb-4 text-[#2D2A26]">Рекомендує шеф</h2>
          <div className="flex overflow-x-auto px-5 gap-4 snap-x pb-4 hide-scrollbar">
            {popularItems.map(item => (
              <div 
                key={item.id} 
                className="snap-start shrink-0 w-64 bg-white rounded-[1.25rem] p-2 shadow-sm border border-stone-100 flex flex-col cursor-pointer transition-transform active:scale-[0.98]" 
                onClick={() => setSelectedItem(item)}
              >
                <div className="w-full aspect-[4/3] rounded-xl bg-stone-100 overflow-hidden relative">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} className="w-full h-full object-cover" alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#F9F8F6]">
                      <span className="text-3xl font-serif text-stone-300 uppercase">{cleanString(item.name).charAt(0)}</span>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span className="bg-white/90 backdrop-blur px-2 py-1 rounded-md text-[10px] font-bold tracking-wider text-[#2D2A26] uppercase flex items-center gap-1">
                      <Star className="w-3 h-3 fill-[#A37346] text-[#A37346]" /> Вибір шефа
                    </span>
                  </div>
                </div>
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <h3 className="font-serif text-[#2D2A26] text-base leading-tight mb-2 line-clamp-2">{cleanString(item.name)}</h3>
                  <p className="text-[#A37346] font-medium text-sm">{fmtMoney(item.price)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isSearchActive && (
        <div className="sticky top-[88px] z-30 bg-[#F9F8F6]/95 backdrop-blur-md pb-3 pt-2">
          <div className="flex px-5 overflow-x-auto gap-2 hide-scrollbar">
            {filteredCategories.map(cat => (
              <button 
                key={cat.id} 
                onClick={() => scrollToCategory(cat.id)}
                className={`px-5 py-2.5 rounded-full whitespace-nowrap text-sm font-medium transition-all ${
                  activeCategory === cat.id 
                    ? 'bg-[#2D2A26] text-white shadow-md' 
                    : 'bg-white text-[#7A756D] border border-stone-200 hover:bg-stone-50'
                }`}
              >
                {cleanString(cat.name)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-5 pb-32 space-y-10 relative z-20 mt-4">
        {filteredCategories.map(cat => (
          <div key={cat.id} id={`category-${cat.id}`} className="scroll-mt-[150px]">
            <h2 className="text-2xl font-serif text-[#2D2A26] mb-5 pl-1">
              {cleanString(cat.name)}
            </h2>
            <div className="space-y-4">
              {cat.items.map(item => {
                const requiredMods = hasRequiredModifiers(item);
                const hasMods = getModifierGroups(item).length > 0;
                
                return (
                  <div 
                    key={item.id} 
                    className="flex gap-4 bg-white p-3.5 rounded-[1.25rem] shadow-sm border border-stone-100 cursor-pointer transition-transform active:scale-[0.98]"
                    onClick={() => setSelectedItem(item)}
                    data-testid={`card-product-${item.id}`}
                  >
                    <div className="flex-1 min-w-0 py-1 flex flex-col justify-center">
                      <h3 className="font-serif text-[#2D2A26] text-base mb-1.5 pr-2 leading-tight">{cleanString(item.name)}</h3>
                      {item.description && (
                        <p className="text-sm text-[#7A756D] line-clamp-2 mb-3 pr-2 leading-relaxed">{item.description}</p>
                      )}
                      
                      <div className="flex items-center justify-between mt-auto">
                        <div className="font-medium text-[#A37346] text-sm">{fmtMoney(item.price)}</div>
                        <div className="flex gap-1.5">
                           {item.isVegetarian && <Leaf className="w-3.5 h-3.5 text-green-600" />}
                           {item.cookMinutes && <div className="flex items-center text-[10px] text-stone-400 gap-0.5"><Clock className="w-3 h-3"/> {item.cookMinutes}m</div>}
                        </div>
                      </div>
                    </div>
                    <div className="w-[104px] h-[104px] shrink-0 rounded-xl bg-stone-50 relative overflow-hidden">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#F9F8F6]">
                          <span className="text-2xl font-serif text-stone-300 uppercase">{cleanString(item.name).charAt(0)}</span>
                        </div>
                      )}
                      <button 
                        className="absolute bottom-1.5 right-1.5 w-8 h-8 bg-white/95 backdrop-blur rounded-full flex items-center justify-center shadow-sm text-[#2D2A26]"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (requiredMods || hasMods) {
                             setSelectedItem(item);
                          } else {
                             const cartItemId = generateCartItemId(item.id, [], "");
                             setCart(prev => {
                               const ex = prev.find(c => c.cartItemId === cartItemId);
                               if (ex) return prev.map(c => c.cartItemId === cartItemId ? { ...c, quantity: c.quantity + 1 } : c);
                               return [...prev, { cartItemId, item, quantity: 1, notes: "", modifiers: [] }];
                             });
                             toast({ description: "Додано до замовлення", duration: 1500 });
                          }
                        }}
                        data-testid={`button-add-cart-${item.id}`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {filteredCategories.length === 0 && (
          <div className="py-20 text-center">
            <Search className="w-10 h-10 text-stone-300 mx-auto mb-4" />
            <p className="text-[#7A756D] font-medium">Нічого не знайдено</p>
          </div>
        )}
      </div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-6 left-5 right-5 z-40 flex items-center justify-between gap-3 pointer-events-none">
        <button 
          onClick={() => setChatOpen(true)}
          className="h-[52px] px-6 bg-white/95 backdrop-blur-md border border-stone-200 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex items-center gap-2 text-[#2D2A26] font-medium pointer-events-auto hover:bg-stone-50 transition-colors"
          data-testid="button-chat"
        >
          <Sparkles className="w-5 h-5 text-[#A37346]" />
          {totalItems === 0 && <span className="text-sm">AI-консьєрж</span>}
        </button>
        
        <AnimatePresence>
          {totalItems > 0 && (
            <motion.button 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              onClick={() => setShowCart(true)}
              className="flex-1 h-[52px] bg-[#2D2A26] rounded-full shadow-[0_8px_30px_rgb(45,42,38,0.25)] flex items-center justify-between px-5 text-white pointer-events-auto hover:bg-[#1A1815] transition-colors"
              data-testid="button-cart"
            >
              <div className="flex items-center gap-3">
                <div className="w-[26px] h-[26px] rounded-full bg-[#A37346] flex items-center justify-center text-xs font-bold shadow-inner">
                  {totalItems}
                </div>
                <span className="font-medium text-sm">Переглянути замовлення</span>
              </div>
              <span className="font-medium text-sm">{fmtMoney(totalAmount)}</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Item Detail Drawer */}
      <Drawer.Root open={!!selectedItem} onOpenChange={(o) => { if (!o) setSelectedItem(null); }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 max-h-[92vh] h-full flex flex-col rounded-t-[2rem] bg-white z-50 focus:outline-none shadow-2xl" data-testid="drawer-item-detail">
            <div className="shrink-0 w-full flex justify-center py-3 bg-white rounded-t-[2rem] absolute top-0 left-0 right-0 z-10">
              <div className="w-12 h-1.5 rounded-full bg-stone-200" />
            </div>
            
            <button onClick={() => setSelectedItem(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white/90 backdrop-blur rounded-full text-stone-500 z-20 shadow-sm border border-stone-100">
              <X className="w-4 h-4" />
            </button>
            
            <div className="flex-1 overflow-y-auto pb-28 pt-8">
              {selectedItem?.imageUrl && (
                <div className="w-full aspect-[4/3] bg-stone-100 mb-6">
                  <img src={selectedItem.imageUrl} className="w-full h-full object-cover" alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
                </div>
              )}
              
              <div className="px-5 mb-8 mt-4">
                <h2 className="text-2xl font-serif text-[#2D2A26] mb-2 leading-tight">{selectedItem ? cleanString(selectedItem.name) : ""}</h2>
                <p className="text-lg text-[#A37346] font-medium mb-4">{fmtMoney(selectedItem?.price)}</p>
                {selectedItem?.description && (
                  <p className="text-[#7A756D] leading-relaxed text-sm">{selectedItem.description}</p>
                )}
              </div>

              {selectedItem && getModifierGroups(selectedItem).length > 0 && (
                <div className="space-y-6 px-5 mb-8">
                  {getModifierGroups(selectedItem).map(group => (
                    <div key={group.id} className="pt-2">
                      <div className="flex justify-between items-baseline mb-4">
                        <h4 className="font-medium text-[#2D2A26]">{group.name}</h4>
                        <span className="text-xs font-medium text-[#7A756D] bg-stone-100 px-2 py-1 rounded">
                          {group.is_required ? "Обов’язково" : "За бажанням"} 
                          {group.max_select && group.max_select > 1 ? ` (до ${group.max_select})` : ""}
                        </span>
                      </div>
                      <div className="space-y-4">
                        {group.options.map(opt => {
                          const isSelected = itemSelections[group.id]?.some(o => o.id === opt.id);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => toggleModifier(group, opt)}
                              className="flex w-full items-center justify-between cursor-pointer group text-left"
                              data-testid={`button-modifier-${group.id}-${opt.id}`}
                              aria-pressed={isSelected}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 flex items-center justify-center rounded-full border transition-colors ${isSelected ? 'border-[#A37346] bg-[#A37346]' : 'border-stone-300 group-hover:border-stone-400'}`}>
                                  {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <span className="text-[#2D2A26] text-sm">{opt.name}</span>
                              </div>
                              {opt.price_delta && parseFloat(String(opt.price_delta)) > 0 && (
                                <span className="text-sm text-[#7A756D] font-medium">+{fmtMoney(opt.price_delta)}</span>
                              )}
                              {opt.price_delta && parseFloat(String(opt.price_delta)) < 0 && (
                                <span className="text-sm text-[#7A756D] font-medium">{fmtMoney(opt.price_delta)}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-5 py-6 border-t border-stone-100 flex items-center justify-between">
                <span className="font-medium text-[#2D2A26]">Кількість</span>
                <div className="flex items-center gap-4">
                  <button onClick={() => setItemQty(Math.max(1, itemQty - 1))} className="w-10 h-10 rounded-full border border-stone-200 flex items-center justify-center text-[#2D2A26] active:bg-stone-50 transition-colors">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-medium text-lg w-6 text-center text-[#2D2A26]">{itemQty}</span>
                  <button onClick={() => setItemQty(Math.min(100, itemQty + 1))} disabled={itemQty >= 100} className="w-10 h-10 rounded-full border border-stone-200 flex items-center justify-center text-[#2D2A26] active:bg-stone-50 transition-colors disabled:opacity-40">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-stone-100">
                <label className="block font-medium text-[#2D2A26] mb-3">Побажання до страви</label>
                <textarea 
                  value={itemNotes}
                  onChange={e => setItemNotes(e.target.value)}
                  placeholder="Алергії, склад або інші побажання"
                  className="w-full p-4 bg-stone-50 border border-stone-100 rounded-xl resize-none h-24 text-sm focus:ring-2 focus:ring-[#A37346]/20 focus:outline-none placeholder:text-stone-400 text-[#2D2A26]"
                />
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-5 bg-white border-t border-stone-100 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              <button 
                disabled={!isItemValid}
                onClick={commitItemToCart}
                className="w-full h-14 bg-[#2D2A26] text-white rounded-full font-medium flex items-center justify-between px-6 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                <span>Додати до замовлення</span>
                <span>{fmtMoney(estimatedItemPrice)}</span>
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Cart Drawer */}
      <Drawer.Root open={showCart} onOpenChange={setShowCart}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 max-h-[92vh] h-full flex flex-col rounded-t-[2rem] bg-[#F9F8F6] z-50 focus:outline-none shadow-2xl" data-testid="drawer-cart">
            <div className="shrink-0 pt-5 pb-4 px-6 bg-white rounded-t-[2rem] flex items-center justify-between border-b border-stone-100">
              <h2 className="text-2xl font-serif text-[#2D2A26]">Ваше замовлення</h2>
              <button onClick={() => setShowCart(false)} className="w-8 h-8 flex items-center justify-center bg-stone-100 rounded-full text-stone-500 hover:bg-stone-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {cart.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Info className="w-8 h-8 text-stone-300" />
                  </div>
                  <p className="text-[#7A756D] font-medium">Замовлення порожнє</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {cart.map(c => (
                    <div key={c.cartItemId} className="flex gap-4">
                      <div className="flex flex-col items-center justify-between py-1 bg-white border border-stone-100 rounded-full w-10">
                        <button 
                          onClick={() => setCart(prev => prev.map(p => p.cartItemId === c.cartItemId ? { ...p, quantity: Math.min(100, p.quantity + 1) } : p))}
                          disabled={c.quantity >= 100}
                          className="w-full h-8 flex items-center justify-center text-[#2D2A26]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-medium text-sm text-[#2D2A26]">{c.quantity}</span>
                        <button 
                          onClick={() => setCart(prev => prev.map(p => {
                            if (p.cartItemId === c.cartItemId) {
                              if (p.quantity > 1) return { ...p, quantity: p.quantity - 1 };
                              return null;
                            }
                            return p;
                          }).filter(Boolean) as CartItem[])}
                          className="w-full h-8 flex items-center justify-center text-[#2D2A26]"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0 py-1">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-medium text-[#2D2A26] pr-4 leading-tight">{cleanString(c.item.name)}</h4>
                          <span className="font-medium text-[#A37346] whitespace-nowrap">{fmtMoney(getCartItemPrice(c))}</span>
                        </div>
                        {c.modifiers.length > 0 && (
                          <div className="text-[13px] text-[#7A756D] space-y-0.5 mb-1.5 font-medium">
                            {c.modifiers.map(m => (
                              <div key={`${m.groupId}-${m.optionId}`}>+ {m.name}</div>
                            ))}
                          </div>
                        )}
                        {c.notes && (
                          <div className="text-[13px] text-[#A37346] italic line-clamp-2">Note: {c.notes}</div>
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="space-y-5 pt-8 border-t border-stone-200">
                    <div>
                       <label className="block text-sm font-medium text-[#2D2A26] mb-2">Ім’я гостя</label>
                       <input value={guestName} onChange={e => setGuestName(e.target.value)} className="w-full p-3.5 bg-white border border-stone-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A37346]/20 text-[#2D2A26] placeholder:text-stone-400 text-sm" placeholder="За бажанням" />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-[#2D2A26] mb-2">Додати чайові</label>
                      <div className="grid grid-cols-4 gap-2">
                        {[0, 10, 15, 20].map(pct => (
                          <button 
                            key={pct}
                            onClick={() => setTipPct(pct)}
                            className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                              tipPct === pct 
                                ? 'bg-[#2D2A26] text-white shadow-sm' 
                                : 'bg-white border border-stone-100 text-[#7A756D] hover:bg-stone-50'
                            }`}
                          >
                            {pct === 0 ? 'Без чайових' : `${pct}%`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-8 border-t border-stone-200 space-y-3 pb-8">
                    <div className="flex justify-between text-[#7A756D] text-sm">
                      <span>Сума страв</span>
                      <span>{fmtMoney(totalAmount)}</span>
                    </div>
                    {tipAmount > 0 && (
                      <div className="flex justify-between text-[#7A756D] text-sm">
                        <span>Чайові</span>
                        <span>{fmtMoney(tipAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xl font-serif text-[#2D2A26] pt-3">
                      <span>Разом</span>
                      <span>{fmtMoney(grandTotal)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {cart.length > 0 && (
              <div className="p-6 bg-white border-t border-stone-100 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                <button 
                  onClick={placeOrder}
                  disabled={submitting}
                  className="w-full h-[56px] bg-[#A37346] text-white rounded-full font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-[0.98]"
                  data-testid="button-checkout"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Order'}
                </button>
              </div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Chat Drawer */}
      <Drawer.Root open={chatOpen} onOpenChange={setChatOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 h-[85vh] flex flex-col rounded-t-[2rem] bg-white z-50 focus:outline-none shadow-2xl">
            <div className="shrink-0 pt-5 pb-4 px-6 border-b border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F9F8F6] flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-[#A37346]" />
                </div>
                <div>
                  <h2 className="font-serif text-[#2D2A26] text-lg leading-none mb-1">AI-консьєрж</h2>
                  <p className="text-[11px] text-[#7A756D] uppercase tracking-wide font-medium">Розумний помічник</p>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="w-8 h-8 flex items-center justify-center bg-stone-100 rounded-full text-stone-500 hover:bg-stone-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4 bg-[#F9F8F6]" ref={chatScrollRef}>
              {chatMessages.length === 0 && (
                 <div className="flex flex-col gap-2 mt-2 mb-8">
                   {QUICK_REPLIES.map(qr => (
                     <button 
                       key={qr.label} 
                       onClick={() => sendMessage(qr.text)}
                       className="self-start text-left px-5 py-3 rounded-2xl bg-white border border-stone-100 text-[#2D2A26] text-sm font-medium hover:bg-stone-50 transition-colors shadow-sm"
                     >
                       {qr.label}
                     </button>
                   ))}
                 </div>
              )}
              
              {chatMessages.map((msg, i) => (
                <div key={i} className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-[#2D2A26] text-white self-end ml-auto rounded-tr-sm' 
                    : 'bg-white border border-stone-100 text-[#2D2A26] self-start rounded-tl-sm'
                }`}>
                  {msg.content}
                </div>
              ))}
              {chatLoading && (
                <div className="self-start bg-white border border-stone-100 shadow-sm rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-stone-300 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-stone-300 animate-bounce delay-100" />
                  <div className="w-2 h-2 rounded-full bg-stone-300 animate-bounce delay-200" />
                </div>
              )}
            </div>

            <div className="p-4 border-t border-stone-100 bg-white pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="relative flex items-center bg-[#F9F8F6] rounded-full p-1.5 border border-stone-200 focus-within:border-[#A37346] focus-within:ring-1 focus-within:ring-[#A37346]/20 transition-all">
                <input 
                   ref={chatInputRef}
                   value={chatInput}
                   onChange={e => setChatInput(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && sendMessage()}
                   placeholder="Запитайте рекомендацію..."
                   className="flex-1 bg-transparent border-0 px-4 py-2.5 text-[15px] focus:outline-none text-[#2D2A26] placeholder:text-stone-400"
                />
                <button 
                  onClick={toggleVoice}
                  className={`w-[42px] h-[42px] shrink-0 rounded-full flex items-center justify-center transition-colors ${voiceActive ? 'bg-red-500 text-white' : 'text-stone-400 hover:text-[#2D2A26]'}`}
                >
                   <Mic className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => sendMessage()}
                  disabled={!chatInput.trim() || chatLoading}
                  className="w-[42px] h-[42px] shrink-0 ml-1 rounded-full bg-[#A37346] text-white flex items-center justify-center disabled:opacity-50 transition-opacity"
                >
                   <Send className="w-4 h-4 ml-0.5" />
                </button>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Phone Modal */}
      <Drawer.Root open={showPhoneModal} onOpenChange={setShowPhoneModal}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[70] backdrop-blur-sm" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 p-6 rounded-t-[2rem] bg-white z-[70] shadow-2xl flex flex-col pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <div className="shrink-0 w-full flex justify-center mb-8">
              <div className="w-12 h-1.5 rounded-full bg-stone-200" />
            </div>
            <h3 className="text-2xl font-serif text-[#2D2A26] mb-3 leading-tight">Перед початком</h3>
            <p className="text-[#7A756D] mb-6 text-sm leading-relaxed">Вкажіть номер телефону, щоб ми могли персоналізувати сервіс і повідомляти про замовлення.</p>
            <input 
              type="tel"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
              placeholder="+380..."
              className="w-full p-4 bg-[#F9F8F6] border border-stone-100 rounded-xl mb-6 focus:outline-none focus:ring-2 focus:ring-[#A37346]/20 text-[#2D2A26] text-lg"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowPhoneModal(false)} className="flex-1 py-4 text-[#7A756D] font-medium rounded-xl hover:bg-stone-50 transition-colors">
                Пропустити
              </button>
              <button onClick={submitPhone} className="flex-[2] py-4 bg-[#2D2A26] text-white rounded-xl font-medium shadow-sm active:scale-[0.98] transition-transform">
                Продовжити
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

    </div>
  );
}
