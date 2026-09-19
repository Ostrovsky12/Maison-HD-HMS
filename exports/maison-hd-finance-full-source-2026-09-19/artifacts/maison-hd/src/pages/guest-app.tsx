import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  QrCode, BedDouble, Waves, UtensilsCrossed, PartyPopper, MessageSquare,
  MapPin, Phone, Wifi, Car, Coffee, Star, Clock, CheckCircle2, ChevronRight,
  Sun, Moon, ArrowLeft, Send, Hotel,
} from "lucide-react";

// Public guest app — uses booking ref to authenticate
// All requests go to /api/guest-app/* (no auth needed, uses guestAccessCode)

type Screen = "lookup" | "home" | "services" | "food" | "chat" | "info";

interface GuestBooking {
  id: number; firstName: string; lastName: string;
  checkIn: string; checkOut: string; unitName: string; propertyName: string;
  guestAccessCode: string; status: string;
}

const HOTEL_INFO = {
  wifi: { ssid: "Dogoda_Guest", password: "__REDACTED_FROM_AUDIT_ARCHIVE__" },
  checkIn: "14:00", checkOut: "12:00",
  phone: "+380 44 123 4567",
  address: "вул. Гірська 12, Яремче",
  email: "info@dogoda.com",
};

const SERVICES = [
  { icon: Waves, label: "SPA & Wellness", desc: "Масаж, сауна, басейн", screen: "services", color: "bg-teal-100 text-teal-700" },
  { icon: UtensilsCrossed, label: "Ресторан / Рум-сервіс", desc: "Замовлення їжі та напоїв", screen: "food", color: "bg-orange-100 text-orange-700" },
  { icon: MessageSquare, label: "Зв'язок з ресепшн", desc: "Запитання та побажання", screen: "chat", color: "bg-blue-100 text-blue-700" },
  { icon: PartyPopper, label: "Заходи та дозвілля", desc: "Розклад подій", screen: "services", color: "bg-pink-100 text-pink-700" },
];

const FOOD_ITEMS = [
  { id: 1, name: "Яєчня з беконом", desc: "3 яйця, бекон, тост, кава", price: 220, category: "🍳 Сніданок" },
  { id: 2, name: "Панкейки з ягодами", desc: "5 шт., ягідний соус, сметана", price: 185, category: "🍳 Сніданок" },
  { id: 3, name: "Борщ із пампушками", desc: "Традиційний з пампушками та сметаною", price: 165, category: "🍲 Обід/Вечеря" },
  { id: 4, name: "Стейк з картоплею", desc: "Яловичина 200г + картопля + салат", price: 485, category: "🍲 Обід/Вечеря" },
  { id: 5, name: "Піца Маргарита", desc: "30 см, томат, моцарела, базилік", price: 245, category: "🍕 Піца" },
  { id: 6, name: "Чай / Кава", desc: "Великий вибір гарячих напоїв", price: 65, category: "☕ Напої" },
  { id: 7, name: "Ягідний смузі", desc: "Полуниця, чорниця, банан, йогурт", price: 120, category: "☕ Напої" },
];

export default function GuestAppPage() {
  const [screen, setScreen] = useState<Screen>("lookup");
  const [booking, setBooking] = useState<GuestBooking | null>(null);
  const [lookupCode, setLookupCode] = useState("");
  const [lookupAccessCode, setLookupAccessCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [chatMsg, setChatMsg] = useState("");
  const [chatHistory, setChatHistory] = useState([
    { from: "hotel", text: "Ласкаво просимо до Dogoda Resort! Чим можемо допомогти? 🏨", time: "14:32" },
  ]);
  const { toast } = useToast();

  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
  const apiFetch = (path: string, opts: RequestInit = {}) =>
    fetch(BASE.replace("/maison-hd", "") + path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });

  const lookup = async () => {
    if (!lookupCode.trim() || !lookupAccessCode.trim()) return;
    setLooking(true);
    try {
      const ref = encodeURIComponent(lookupCode.trim().toUpperCase());
      const accessCode = encodeURIComponent(lookupAccessCode.trim().toUpperCase());
      const r = await apiFetch(`/api/public/bookings/${ref}?guestAccessCode=${accessCode}`);
      const d = await r.json();
      if (r.ok && d.booking) {
        setBooking({
          id: d.booking.id, firstName: d.booking.firstName, lastName: d.booking.lastName,
          checkIn: d.booking.checkIn, checkOut: d.booking.checkOut,
          unitName: d.booking.unitName || "Номер", propertyName: d.booking.propertyName || "Dogoda Resort",
          guestAccessCode: lookupAccessCode.trim().toUpperCase(), status: d.booking.status,
        });
        setScreen("home");
      } else { toast({ title: "Бронювання не знайдено", description: "Перевірте номер бронювання", variant: "destructive" }); }
    } catch { toast({ title: "Помилка з'єднання", variant: "destructive" }); }
    finally { setLooking(false); }
  };

  const totalCartItems = Object.values(cart).reduce((s, n) => s + n, 0);
  const totalCartPrice = FOOD_ITEMS.reduce((s, i) => s + (cart[i.id] || 0) * i.price, 0);
  const addToCart = (id: number) => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const removeFromCart = (id: number) => setCart(c => { const n = { ...c }; if (n[id] > 1) n[id]--; else delete n[id]; return n; });

  const sendOrder = () => {
    if (totalCartItems === 0) return;
    toast({ title: "✅ Замовлення прийнято!", description: `Доставка в номер ~ 25 хвилин · Сума: ₴${totalCartPrice}` });
    setCart({});
    setScreen("home");
  };

  const sendChat = () => {
    if (!chatMsg.trim()) return;
    const time = new Date().toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" });
    setChatHistory(h => [...h, { from: "guest", text: chatMsg, time }]);
    setChatMsg("");
    setTimeout(() => setChatHistory(h => [...h, { from: "hotel", text: "Дякуємо за повідомлення! Ми відповімо найближчим часом. 🙏", time: new Date().toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" }) }]), 1500);
  };

  const bg = isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900";
  const cardBg = isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100";

  if (screen === "lookup") return (
    <div className={`min-h-screen ${bg} flex flex-col items-center justify-center p-6`}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Hotel className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Dogoda Resort</h1>
          <p className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Гостьовий портал</p>
        </div>
        <Card className={`${cardBg} border shadow-sm`}>
          <CardContent className="p-5 space-y-4">
            <div>
              <Label className="text-sm font-medium">Номер бронювання</Label>
              <Input className="mt-1.5 text-center text-lg font-mono tracking-wider uppercase"
                placeholder="DOG-123456"
                value={lookupCode}
                onChange={e => setLookupCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && lookup()} />
              <p className={`text-xs mt-1.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Знайдіть номер у підтвердженні бронювання</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Код доступу</Label>
              <Input className="mt-1.5 text-center text-lg font-mono tracking-wider uppercase"
                placeholder="A1B2C3D4E5"
                value={lookupAccessCode}
                onChange={e => setLookupAccessCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && lookup()} />
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={lookup} disabled={looking || !lookupCode.trim() || !lookupAccessCode.trim()}>
              {looking ? "Пошук…" : "Увійти до порталу"}
            </Button>
          </CardContent>
        </Card>
        <p className={`text-center text-xs mt-4 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
          Проблеми? Зверніться до ресепшн або зателефонуйте {HOTEL_INFO.phone}
        </p>
      </div>
    </div>
  );

  const nightsLeft = booking ? Math.max(0, Math.ceil((new Date(booking.checkOut).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className={`min-h-screen ${bg} max-w-sm mx-auto`}>
      {/* Status bar */}
      <div className={`${isDark ? "bg-blue-900" : "bg-blue-600"} text-white px-4 py-3 flex items-center justify-between`}>
        {screen !== "home" ? (
          <button onClick={() => setScreen("home")} className="flex items-center gap-1 text-sm opacity-80">
            <ArrowLeft className="h-4 w-4" />Назад
          </button>
        ) : (
          <span className="text-sm font-medium">🏨 Dogoda Resort</span>
        )}
        <button onClick={() => setIsDark(!isDark)} className="opacity-70">
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {/* ── HOME ── */}
      {screen === "home" && booking && (
        <div className="p-4 space-y-4">
          {/* Welcome */}
          <Card className={`${cardBg} border-0 shadow-sm`}>
            <CardContent className="p-4">
              <p className="text-sm font-medium text-blue-600">Ласкаво просимо!</p>
              <h2 className="text-xl font-bold mt-0.5">{booking.firstName} {booking.lastName}</h2>
              <div className={`flex items-center gap-2 mt-2 text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                <BedDouble className="h-4 w-4" />
                <span>{booking.unitName}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                <div className={`p-2 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                  <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Заїзд</p>
                  <p className="font-semibold">{booking.checkIn}</p>
                </div>
                <div className={`p-2 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                  <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Виїзд</p>
                  <p className="font-semibold">{booking.checkOut}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 bg-blue-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: nightsLeft > 0 ? "60%" : "100%" }} />
                </div>
                <span className="text-xs text-blue-600 font-medium">{nightsLeft} ночей залишилось</span>
              </div>
            </CardContent>
          </Card>

          {/* Quick info */}
          <div className="grid grid-cols-2 gap-2">
            <Card className={`${cardBg} border-0 shadow-sm`}><CardContent className="p-3">
              <Wifi className="h-4 w-4 text-blue-500 mb-1" />
              <p className="text-xs font-semibold">{HOTEL_INFO.wifi.ssid}</p>
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>{HOTEL_INFO.wifi.password}</p>
            </CardContent></Card>
            <Card className={`${cardBg} border-0 shadow-sm`}><CardContent className="p-3">
              <Clock className="h-4 w-4 text-green-500 mb-1" />
              <p className="text-xs font-semibold">Виїзд до {HOTEL_INFO.checkOut}</p>
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Пізній виїзд: у ресепшн</p>
            </CardContent></Card>
          </div>

          {/* Services */}
          <div>
            <p className={`text-sm font-semibold mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Послуги</p>
            <div className="space-y-2">
              {SERVICES.map((s, i) => (
                <button key={i} onClick={() => setScreen(s.screen as Screen)} className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition ${isDark ? "bg-gray-800 hover:bg-gray-700" : "bg-white hover:bg-gray-50"} shadow-sm`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.color}`}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{s.label}</p>
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>{s.desc}</p>
                  </div>
                  <ChevronRight className={`h-4 w-4 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                </button>
              ))}
            </div>
          </div>

          <button className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"} underline mx-auto block`} onClick={() => { setBooking(null); setScreen("lookup"); }}>
            Вийти
          </button>
        </div>
      )}

      {/* ── FOOD ORDER ── */}
      {screen === "food" && (
        <div className="p-4 space-y-3">
          <h2 className="font-bold text-lg">🍽️ Рум-сервіс</h2>
          {Object.entries(
            FOOD_ITEMS.reduce((acc: any, item) => { (acc[item.category] = acc[item.category] || []).push(item); return acc; }, {})
          ).map(([cat, items]: any) => (
            <div key={cat}>
              <p className={`text-xs font-semibold mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{cat}</p>
              <div className="space-y-2">
                {items.map((item: any) => (
                  <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl ${isDark ? "bg-gray-800" : "bg-white"} shadow-sm`}>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>{item.desc}</p>
                      <p className="font-bold text-blue-600 text-sm mt-0.5">₴{item.price}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {cart[item.id] ? (
                        <>
                          <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-bold">−</button>
                          <span className="w-4 text-center font-bold text-sm">{cart[item.id]}</span>
                          <button onClick={() => addToCart(item.id)} className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold">+</button>
                        </>
                      ) : (
                        <button onClick={() => addToCart(item.id)} className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">+</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {totalCartItems > 0 && (
            <div className="sticky bottom-4">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base shadow-lg" onClick={sendOrder}>
                🛒 Замовити · {totalCartItems} поз. · ₴{totalCartPrice}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── CHAT ── */}
      {screen === "chat" && (
        <div className="flex flex-col h-screen max-h-screen">
          <div className={`flex-1 overflow-y-auto p-4 space-y-3`} style={{ maxHeight: "calc(100vh - 130px)" }}>
            <p className={`text-center text-xs ${isDark ? "text-gray-500" : "text-gray-400"} mb-4`}>Чат з ресепшн · Онлайн</p>
            {chatHistory.map((m, i) => (
              <div key={i} className={`flex ${m.from === "guest" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.from === "guest" ? "bg-blue-600 text-white rounded-br-md" : isDark ? "bg-gray-700 rounded-bl-md" : "bg-white shadow-sm rounded-bl-md"}`}>
                  <p>{m.text}</p>
                  <p className={`text-xs mt-1 ${m.from === "guest" ? "text-blue-200" : isDark ? "text-gray-400" : "text-gray-400"}`}>{m.time}</p>
                </div>
              </div>
            ))}
          </div>
          <div className={`p-4 border-t ${isDark ? "border-gray-700 bg-gray-900" : "bg-white"} flex gap-2`}>
            <Input value={chatMsg} onChange={e => setChatMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()}
              placeholder="Напишіть повідомлення…" className={isDark ? "bg-gray-800 border-gray-700 text-white" : ""} />
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-9 w-9 p-0 flex-shrink-0" onClick={sendChat}><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* ── SERVICES (SPA/Events placeholder) ── */}
      {screen === "services" && (
        <div className="p-4 space-y-4">
          <h2 className="font-bold text-lg">🌿 Послуги готелю</h2>
          {[
            { icon: "🧘", title: "SPA та оздоровлення", items: ["Масаж спини — ₴800", "Ароматерапія — ₴950", "Хаммам — ₴1200", "Флоатинг — ₴1100"] },
            { icon: "🏊", title: "Активний відпочинок", items: ["Басейн (відкр.): 08:00–21:00", "Фітнес-зал: 07:00–22:00", "Тенісний корт: за бронюванням"] },
            { icon: "🎭", title: "Заходи сьогодні", items: ["19:00 — Жива музика в лобі", "21:00 — Кіно на терасі", "10:00 — Йога на траві"] },
          ].map((s, i) => (
            <Card key={i} className={`${cardBg} border-0 shadow-sm`}>
              <CardContent className="p-4">
                <p className="font-semibold mb-2">{s.icon} {s.title}</p>
                <ul className="space-y-1">
                  {s.items.map((item, j) => (
                    <li key={j} className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"} flex items-center gap-2`}>
                      <span className="w-1 h-1 bg-blue-400 rounded-full flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button variant="outline" size="sm" className="mt-3 text-blue-600 border-blue-200 h-7 text-xs" onClick={() => { toast({ title: "Запит надіслано", description: "Ресепшн зв'яжеться з вами найближчим часом" }); }}>
                  Замовити / Записатися
                </Button>
              </CardContent>
            </Card>
          ))}
          <p className={`text-center text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
            <Phone className="h-3 w-3 inline mr-1" />{HOTEL_INFO.phone}
          </p>
        </div>
      )}
    </div>
  );
}
