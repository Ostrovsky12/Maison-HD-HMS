import { useState, useEffect, useCallback } from "react";
import { useRoute } from "wouter";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/tv";

type Slide = "welcome" | "weather" | "services" | "food" | "activities" | "events" | "upsell" | "info";

const SLIDES: Slide[] = ["welcome", "weather", "services", "food", "activities", "events", "upsell", "info"];

const SLIDE_LABELS: Record<Slide, string> = {
  welcome: "Ласкаво просимо",
  weather: "Погода",
  services: "SPA & Wellness",
  food: "Ресторан",
  activities: "Активності",
  events: "Заходи",
  upsell: "Спецпропозиція",
  info: "Інформація",
};

function pad(n: number) { return String(n).padStart(2, "0"); }

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  const days = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"];
  const months = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
  return (
    <div className="text-right">
      <div className="text-5xl font-bold tracking-tight text-white leading-none tabular-nums">
        {pad(time.getHours())}:{pad(time.getMinutes())}
        <span className="text-2xl text-blue-300 ml-1">:{pad(time.getSeconds())}</span>
      </div>
      <div className="text-sm text-blue-200 mt-1">
        {days[time.getDay()]}, {time.getDate()} {months[time.getMonth()]} {time.getFullYear()}
      </div>
    </div>
  );
}

function QRCode({ url, label, size = 140 }: { url: string; label?: string; size?: number }) {
  const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=${size * 2}x${size * 2}&bgcolor=ffffff&color=1e3a8a&qzone=1&data=${encodeURIComponent(fullUrl)}`;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bg-white rounded-2xl p-3 shadow-xl">
        <img src={qrSrc} width={size} height={size} alt="QR" className="block" />
      </div>
      {label && <p className="text-blue-200 text-xs text-center">{label}</p>}
    </div>
  );
}

function SlideIndicator({ slides, current, onSlide }: { slides: Slide[]; current: number; onSlide?: (i: number) => void }) {
  return (
    <div className="flex gap-2 justify-center items-center">
      {slides.map((s, i) => (
        <button
          key={i}
          onClick={() => onSlide?.(i)}
          title={SLIDE_LABELS[s]}
          className={`rounded-full transition-all duration-500 cursor-pointer ${i === current ? "w-8 h-2 bg-amber-400" : "w-2 h-2 bg-white/30 hover:bg-white/60"}`}
        />
      ))}
    </div>
  );
}

function WeatherWidget() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const iv = setInterval(() => setTime(new Date()), 60_000); return () => clearInterval(iv); }, []);

  const hour = time.getHours();
  const isDay = hour >= 7 && hour < 20;
  const season = (() => {
    const m = time.getMonth();
    if (m >= 2 && m <= 4) return "spring";
    if (m >= 5 && m <= 7) return "summer";
    if (m >= 8 && m <= 10) return "autumn";
    return "winter";
  })();

  const seasonData: Record<string, { icon: string; temp: string; desc: string; feel: string; wind: string; humidity: string }> = {
    spring: { icon: "🌤", temp: "+15°", desc: "Переважно ясно", feel: "+12°", wind: "18 км/г", humidity: "52%" },
    summer: { icon: "☀️", temp: "+27°", desc: "Ясно та сонячно", feel: "+30°", wind: "10 км/г", humidity: "40%" },
    autumn: { icon: "🌥", temp: "+8°", desc: "Хмарно", feel: "+5°", wind: "25 км/г", humidity: "72%" },
    winter: { icon: "❄️", temp: "-3°", desc: "Морозно, сніг", feel: "-8°", wind: "20 км/г", humidity: "80%" },
  };
  const w = seasonData[season];

  const forecast = [
    { day: "Сьогодні", icon: w.icon, hi: w.temp, lo: (parseInt(w.temp) - 6) + "°" },
    { day: "Завтра", icon: season === "summer" ? "⛅" : season === "winter" ? "🌨" : "🌦", hi: (parseInt(w.temp) + 2) + "°", lo: (parseInt(w.temp) - 4) + "°" },
    { day: "Після", icon: season === "summer" ? "☀️" : season === "autumn" ? "🌧" : "🌤", hi: (parseInt(w.temp) - 1) + "°", lo: (parseInt(w.temp) - 7) + "°" },
  ];

  return (
    <div className="flex-1 flex flex-col justify-center">
      <div className="flex items-start gap-10 mb-10">
        <div>
          <div className="text-9xl mb-2">{w.icon}</div>
          <div className="text-blue-300 text-lg">{isDay ? "День" : "Ніч"} · Догода Resort</div>
        </div>
        <div>
          <div className="text-8xl font-bold mb-2">{w.temp}</div>
          <div className="text-3xl text-blue-200">{w.desc}</div>
          <div className="flex gap-6 mt-4">
            {[
              { label: "Відчувається", val: w.feel },
              { label: "Вітер", val: w.wind },
              { label: "Вологість", val: w.humidity },
            ].map(d => (
              <div key={d.label} className="bg-white/10 rounded-xl px-4 py-2">
                <div className="text-blue-300 text-xs">{d.label}</div>
                <div className="text-lg font-semibold">{d.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {forecast.map((f, i) => (
          <div key={i} className="flex-1 bg-white/10 rounded-2xl p-5 text-center backdrop-blur-sm border border-white/5">
            <p className="text-blue-300 text-sm mb-2">{f.day}</p>
            <div className="text-4xl mb-2">{f.icon}</div>
            <div className="flex justify-center gap-3">
              <span className="text-lg font-bold">{f.hi}</span>
              <span className="text-blue-400">{f.lo}</span>
            </div>
          </div>
        ))}
        <div className="flex-1 bg-white/10 rounded-2xl p-5 text-center backdrop-blur-sm border border-white/5">
          <p className="text-blue-300 text-sm mb-2">Вид для спорту</p>
          <div className="text-4xl mb-2">🏃</div>
          <div className="text-sm text-green-300 font-medium">
            {season === "summer" ? "Відмінно!" : season === "winter" ? "Лижі ⛷" : "Добре"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TvDisplayPage() {
  const [, params] = useRoute("/tv/:roomCode");
  const roomCode = params?.roomCode;

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [slide, setSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const load = useCallback(async () => {
    if (!roomCode) return;
    try {
      const r = await fetch(`${API}/display/${roomCode}`);
      if (r.ok) { setData(await r.json()); setError(""); }
      else { const e = await r.json(); setError(e.error || "Помилка"); }
    } catch { setError("Немає з'єднання"); }
    finally { setLoading(false); }
  }, [roomCode]);

  useEffect(() => {
    const ping = () => roomCode && fetch(`${API}/display/${roomCode}/ping`, { method: "POST" }).catch(() => {});
    ping();
    const iv = setInterval(ping, 30_000);
    return () => clearInterval(iv);
  }, [roomCode]);

  useEffect(() => { load(); const iv = setInterval(load, 120_000); return () => clearInterval(iv); }, [load]);

  useEffect(() => {
    if (!data || isPaused) return;
    const interval = data?.screen?.contentConfig?.slideInterval || 9000;
    const iv = setInterval(() => setSlide(s => (s + 1) % SLIDES.length), interval);
    return () => clearInterval(iv);
  }, [data, isPaused]);

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 flex items-center justify-center">
      <div className="text-center text-white">
        <div className="text-7xl mb-6 animate-bounce">🏨</div>
        <p className="text-3xl font-light animate-pulse text-blue-200">Завантаження…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-center text-white max-w-md">
        <div className="text-6xl mb-4">📺</div>
        <h1 className="text-3xl font-bold mb-2">Телевізор не налаштований</h1>
        <p className="text-slate-400">{error}</p>
        <p className="text-slate-500 text-sm mt-4">Код кімнати: {roomCode}</p>
      </div>
    </div>
  );

  const { screen, currentBooking, guestAppUrl, hotel, upsells, events } = data || {};
  const branding = screen?.branding || {};
  const guestName = currentBooking ? `${currentBooking.firstName} ${currentBooking.lastName}` : null;
  const currentSlide = SLIDES[slide];

  const bgGradients: Record<Slide, string> = {
    welcome: "from-blue-950 via-blue-900 to-indigo-900",
    weather: "from-slate-900 via-blue-900 to-indigo-950",
    services: "from-teal-950 via-teal-900 to-emerald-950",
    food: "from-amber-950 via-orange-900 to-red-950",
    activities: "from-green-950 via-emerald-900 to-teal-950",
    events: "from-purple-950 via-violet-900 to-indigo-950",
    upsell: "from-amber-900 via-orange-900 to-red-900",
    info: "from-blue-950 via-slate-900 to-indigo-950",
  };

  return (
    <div
      className={`min-h-screen bg-gradient-to-br ${bgGradients[currentSlide]} text-white flex flex-col overflow-hidden select-none cursor-none transition-all duration-1000`}
      onPointerDown={() => setIsPaused(p => !p)}
    >
      {/* Decorative background pattern */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* ── HEADER ── */}
      <header className="relative z-10 flex items-center justify-between px-10 py-5 border-b border-white/10 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center text-3xl shadow-xl">
            {branding.logo || "🏨"}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-wide">{branding.hotelName || hotel?.name || "Dogoda Resort"}</h1>
            <p className="text-blue-300 text-sm">{screen?.unitName || screen?.displayName || `Кімната ${roomCode}`}</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-center">
            <div className="text-xs text-blue-300 uppercase tracking-widest mb-0.5">{SLIDE_LABELS[currentSlide]}</div>
            {isPaused && <div className="text-xs text-amber-400">⏸ Зупинено</div>}
          </div>
          <Clock />
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="relative z-10 flex-1 flex gap-0 overflow-hidden">

        {/* ── LEFT / MAIN PANEL ── */}
        <div className="flex-1 flex flex-col p-10">

          {/* SLIDE: Welcome */}
          {currentSlide === "welcome" && (
            <div className="flex-1 flex flex-col justify-center">
              {guestName ? (
                <>
                  <p className="text-blue-300 text-2xl mb-2">Ласкаво просимо,</p>
                  <h2 className="text-7xl font-bold mb-8 leading-tight">{guestName}</h2>
                  <div className="flex gap-6 mb-10">
                    {[
                      { label: "Заїзд", val: currentBooking.checkIn, icon: "📅" },
                      { label: "Виїзд", val: currentBooking.checkOut, icon: "🧳" },
                      { label: "Виїзд до", val: hotel?.checkOutTime || "12:00", icon: "⏰", highlight: true },
                    ].map(i => (
                      <div key={i.label} className={`rounded-2xl px-8 py-5 backdrop-blur-sm ${i.highlight ? "bg-amber-400/20 border border-amber-400/40" : "bg-white/10"}`}>
                        <div className="text-2xl mb-1">{i.icon}</div>
                        <p className={`text-sm mb-1 ${i.highlight ? "text-amber-300" : "text-blue-300"}`}>{i.label}</p>
                        <p className={`text-3xl font-bold ${i.highlight ? "text-amber-300" : "text-white"}`}>{i.val}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-8xl font-bold mb-4 leading-tight">{branding.tagline || "Ласкаво просимо!"}</h2>
                  <p className="text-blue-300 text-3xl mb-10">{branding.hotelName || hotel?.name || "Dogoda Resort"}</p>
                </>
              )}
              <div className="grid grid-cols-3 gap-5">
                {[
                  { icon: "📶", label: "Wi-Fi", val: hotel?.wifi?.ssid || "Dogoda-Guest", sub: hotel?.wifi?.password || "dogoda2024" },
                  { icon: "📞", label: "Ресепшн", val: hotel?.phone || "+380 xxx", sub: "Цілодобово" },
                  { icon: "🕛", label: "Checkout", val: hotel?.checkOutTime || "12:00", sub: "Пізній виїзд — ресепшн" },
                ].map(i => (
                  <div key={i.label} className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/5">
                    <div className="text-4xl mb-3">{i.icon}</div>
                    <p className="text-blue-300 text-xs uppercase tracking-widest mb-1">{i.label}</p>
                    <p className="text-2xl font-bold">{i.val}</p>
                    <p className="text-blue-400 text-sm mt-1">{i.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SLIDE: Weather */}
          {currentSlide === "weather" && <WeatherWidget />}

          {/* SLIDE: SPA & Services */}
          {currentSlide === "services" && (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-5xl">🌿</span>
                <div>
                  <h2 className="text-4xl font-bold">SPA & Wellness</h2>
                  <p className="text-teal-300">Розслабтесь та поновіть сили</p>
                </div>
              </div>
              <p className="text-blue-300 mb-6">Забронюйте через гостьовий додаток або зателефонуйте на ресепшн · Відкрито 09:00 – 21:00</p>
              <div className="grid grid-cols-2 gap-5 flex-1">
                {(upsells?.spa || []).slice(0, 4).map((s: any, i: number) => (
                  <div key={i} className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/5 hover:bg-white/15 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <span className="bg-teal-400/20 text-teal-300 text-sm px-3 py-1 rounded-full">{s.category || "SPA"}</span>
                      <span className="text-3xl font-bold text-amber-300">₴{parseFloat(s.price || 0).toLocaleString()}</span>
                    </div>
                    <h3 className="text-2xl font-semibold mb-2">{s.name}</h3>
                    <p className="text-blue-300">⏱ {s.duration || 60} хвилин</p>
                  </div>
                ))}
                {(upsells?.spa || []).length === 0 && (
                  <>
                    {[
                      { name: "Класичний масаж", duration: 60, price: "1 200", cat: "Масаж" },
                      { name: "Масаж для двох", duration: 90, price: "2 200", cat: "Пара" },
                      { name: "Aromatherapy", duration: 75, price: "1 600", cat: "Релакс" },
                      { name: "Гарячі камені", duration: 90, price: "1 800", cat: "Преміум" },
                    ].map((s, i) => (
                      <div key={i} className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/5">
                        <div className="flex justify-between items-start mb-4">
                          <span className="bg-teal-400/20 text-teal-300 text-sm px-3 py-1 rounded-full">{s.cat}</span>
                          <span className="text-3xl font-bold text-amber-300">₴{s.price}</span>
                        </div>
                        <h3 className="text-2xl font-semibold mb-2">{s.name}</h3>
                        <p className="text-blue-300">⏱ {s.duration} хвилин</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* SLIDE: Restaurant & Food */}
          {currentSlide === "food" && (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-5xl">🍽️</span>
                <div>
                  <h2 className="text-4xl font-bold">Ресторан & Рум-Сервіс</h2>
                  <p className="text-orange-300">Доставка в номер · ~25 хвилин</p>
                </div>
              </div>
              <div className="flex gap-4 mb-6">
                {[
                  { icon: "🍳", label: "Сніданок", time: "07:00 – 10:30" },
                  { icon: "🥗", label: "Обід", time: "12:00 – 15:00" },
                  { icon: "🍷", label: "Вечеря", time: "18:00 – 22:30" },
                  { icon: "🛎", label: "Рум-сервіс", time: "07:00 – 23:00" },
                ].map(m => (
                  <div key={m.label} className="bg-white/10 rounded-xl px-4 py-3 text-center flex-1">
                    <div className="text-2xl">{m.icon}</div>
                    <div className="text-xs text-blue-300 mt-1">{m.label}</div>
                    <div className="text-sm font-medium">{m.time}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-4 flex-1">
                {(upsells?.fb || []).slice(0, 6).map((f: any, i: number) => (
                  <div key={i} className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm border border-white/5">
                    <p className="text-lg font-semibold mb-1">{f.name}</p>
                    <p className="text-blue-300 text-sm line-clamp-2 mb-3">{f.description}</p>
                    <p className="text-3xl font-bold text-amber-300">₴{parseFloat(f.price || 0).toLocaleString()}</p>
                  </div>
                ))}
                {(upsells?.fb || []).length === 0 && [
                  { name: "Сніданок шведський стіл", desc: "Широкий вибір страв", price: "Включено" },
                  { name: "Стейк Ribeye", desc: "Яловичина, 300г, гриль", price: "₴890" },
                  { name: "Суші сет", desc: "24 ролли, свіжа риба", price: "₴650" },
                  { name: "Піца Маргарита", desc: "30см, свіжі томати, моцарела", price: "₴380" },
                  { name: "Паста Карбонара", desc: "З беконом та пармезаном", price: "₴320" },
                  { name: "Десерт дня", desc: "Питайте у офіціанта", price: "₴180" },
                ].map((f, i) => (
                  <div key={i} className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm border border-white/5">
                    <p className="text-lg font-semibold mb-1">{f.name}</p>
                    <p className="text-blue-300 text-sm mb-3">{f.desc}</p>
                    <p className={`text-2xl font-bold ${f.price.startsWith("₴") ? "text-amber-300" : "text-green-300"}`}>{f.price}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SLIDE: Activities */}
          {currentSlide === "activities" && (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-5xl">🏔️</span>
                <div>
                  <h2 className="text-4xl font-bold">Активності & Пригоди</h2>
                  <p className="text-green-300">Відкрийте Догоду по-новому</p>
                </div>
              </div>
              <p className="text-blue-300 mb-6">Резервування через гостьовий додаток або ресепшн</p>
              <div className="grid grid-cols-3 gap-5 flex-1">
                {[
                  { icon: "🚵", name: "Велотури", desc: "Маршрути по Карпатах", time: "08:00 – 18:00", price: "₴400/особа", tag: "Активний" },
                  { icon: "🧘", name: "Йога та медитація", desc: "На свіжому повітрі, тренер включений", time: "07:30 & 18:00", price: "₴200/особа", tag: "Wellness" },
                  { icon: "🏊", name: "Басейн & Водні атракції", desc: "Відкритий та закритий басейн", time: "08:00 – 21:00", price: "Включено", tag: "Відпочинок" },
                  { icon: "🎣", name: "Рибальство", desc: "Озеро на території комплексу", time: "06:00 – 20:00", price: "₴300 + спорядження", tag: "Природа" },
                  { icon: "🌲", name: "Піший туризм", desc: "Гід та маршрути різної складності", time: "09:00 & 15:00", price: "₴350/особа", tag: "Пригоди" },
                  { icon: "🎾", name: "Тенісний корт", desc: "Ракетки та м'ячі в наявності", time: "08:00 – 20:00", price: "₴250/год", tag: "Спорт" },
                ].map((a, i) => (
                  <div key={i} className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm border border-white/5 hover:bg-white/15 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-4xl">{a.icon}</span>
                      <span className="bg-green-400/20 text-green-300 text-xs px-2 py-1 rounded-full">{a.tag}</span>
                    </div>
                    <h3 className="text-xl font-semibold mb-1">{a.name}</h3>
                    <p className="text-blue-300 text-sm mb-2">{a.desc}</p>
                    <p className="text-blue-400 text-xs mb-1">🕐 {a.time}</p>
                    <p className={`text-lg font-bold ${a.price === "Включено" ? "text-green-300" : "text-amber-300"}`}>{a.price}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SLIDE: Events */}
          {currentSlide === "events" && (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-5xl">🎭</span>
                <div>
                  <h2 className="text-4xl font-bold">Заходи та Дозвілля</h2>
                  <p className="text-purple-300">Сьогодні та завтра у {branding.hotelName || "Dogoda"}</p>
                </div>
              </div>
              <div className="flex-1 space-y-4 mt-6">
                {(events?.length > 0 ? events : [
                  { start_time: "19:00", title: "Жива музика в лобі", space_name: "Лобі-бар", start_date: "Сьогодні" },
                  { start_time: "21:00", title: "Кіно під зірками", space_name: "Відкрита тераса", start_date: "Сьогодні" },
                  { start_time: "10:00", title: "Майстер-клас з йоги", space_name: "Wellness-зона", start_date: "Завтра" },
                  { start_time: "18:00", title: "Дегустація карпатських вин", space_name: "Винний погріб", start_date: "Завтра" },
                  { start_time: "20:00", title: "Вечір живої музики", space_name: "Ресторан", start_date: "Завтра" },
                ]).map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-6 bg-white/10 rounded-2xl p-5 backdrop-blur-sm border border-white/5">
                    <div className="bg-amber-400/20 border border-amber-400/40 rounded-xl px-5 py-4 text-center flex-shrink-0 min-w-[80px]">
                      <p className="text-amber-300 text-xs">{e.start_date || "TBD"}</p>
                      <p className="text-3xl font-bold text-amber-300">{e.start_time || "TBD"}</p>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-semibold">{e.title}</h3>
                      <p className="text-blue-300">{e.space_name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SLIDE: Late Checkout Upsell */}
          {currentSlide === "upsell" && (
            <div className="flex-1 flex flex-col justify-center items-center text-center">
              <div className="max-w-3xl w-full">
                <div className="text-8xl mb-6">✨</div>
                <h2 className="text-6xl font-bold mb-4 leading-tight text-amber-300">Ексклюзивні<br />пропозиції для вас</h2>
                <p className="text-blue-200 text-xl mb-12">Спеціальні ціни для гостей готелю · Обмежена кількість</p>

                <div className="grid grid-cols-3 gap-6">
                  {[
                    {
                      icon: "🛏",
                      title: "Пізній виїзд",
                      desc: "Залишайтеся до 16:00 і насолоджуйтесь ще декількома годинами відпочинку",
                      price: "₴500",
                      orig: "₴800",
                      tag: "-37%",
                      cta: "до 16:00",
                    },
                    {
                      icon: "💆",
                      title: "SPA для двох",
                      desc: "Класичний масаж для двох + джакузі + фіточай в подарунок",
                      price: "₴1 600",
                      orig: "₴2 200",
                      tag: "-27%",
                      cta: "90 хвилин",
                    },
                    {
                      icon: "🌅",
                      title: "Романтичний вечір",
                      desc: "Вечеря при свічках, пляшка вина та квіти для двох",
                      price: "₴1 200",
                      orig: "₴1 800",
                      tag: "-33%",
                      cta: "з 19:00",
                    },
                  ].map((offer, i) => (
                    <div key={i} className="bg-white/10 backdrop-blur-sm rounded-3xl p-6 border border-amber-400/30 relative overflow-hidden">
                      <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">{offer.tag}</div>
                      <div className="text-5xl mb-4">{offer.icon}</div>
                      <h3 className="text-2xl font-bold mb-2">{offer.title}</h3>
                      <p className="text-blue-300 text-sm mb-4">{offer.desc}</p>
                      <div className="mb-2">
                        <span className="text-4xl font-bold text-amber-300">{offer.price}</span>
                        <span className="text-blue-400 line-through text-lg ml-2">{offer.orig}</span>
                      </div>
                      <div className="bg-amber-400/20 text-amber-300 text-sm px-3 py-1 rounded-full inline-block">{offer.cta}</div>
                    </div>
                  ))}
                </div>

                <p className="text-blue-400 text-sm mt-8">📞 Зателефонуйте на ресепшн або скористайтеся гостьовим додатком</p>
              </div>
            </div>
          )}

          {/* SLIDE: Info */}
          {currentSlide === "info" && (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-5xl">ℹ️</span>
                <div>
                  <h2 className="text-4xl font-bold">Інформація</h2>
                  <p className="text-blue-300">{hotel?.name || "Dogoda Resort"} · {hotel?.address || "Карпати, Україна"}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 flex-1">
                {[
                  { icon: "📶", title: "Wi-Fi", lines: [`Мережа: ${hotel?.wifi?.ssid || "Dogoda-Guest"}`, `Пароль: ${hotel?.wifi?.password || "dogoda2024"}`, "Безкоштовно для гостей"] },
                  { icon: "🍳", title: "Сніданок", lines: ["Ресторан, 1-й поверх", "07:00 – 10:30", "Включений у вартість"] },
                  { icon: "🏊", title: "Басейн & SPA", lines: ["Відкритий: 08:00 – 21:00", "SPA: 09:00 – 21:00", "Фітнес: 07:00 – 22:00"] },
                  { icon: "🚗", title: "Парковка", lines: ["Безкоштовна охоронювана", "Відеоспостереження 24/7", "Зарядна для електро"] },
                  { icon: "🧹", title: "Прибирання", lines: ["Щоденно 10:00 – 14:00", "Або за запитом", "DND — повісьте табличку"] },
                  { icon: "📞", title: "Контакти", lines: [hotel?.phone || "+380 xxx xxx xx", "info@dogoda.com", "Ресепшн — цілодобово"] },
                ].map((b) => (
                  <div key={b.title} className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm border border-white/5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-3xl">{b.icon}</span>
                      <p className="font-bold text-lg">{b.title}</p>
                    </div>
                    {b.lines.map((l, i) => (
                      <p key={i} className={`text-sm ${i === 0 ? "text-white font-medium" : "text-blue-300"}`}>{l}</p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Slide indicator */}
          <div className="mt-6">
            <SlideIndicator slides={SLIDES} current={slide} onSlide={setSlide} />
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <aside className="w-72 bg-white/5 border-l border-white/10 flex flex-col items-center justify-between py-10 px-6">
          {/* Guest App QR */}
          <div className="w-full">
            <p className="text-center text-amber-300 font-semibold text-xs uppercase tracking-widest mb-4">Гостьовий додаток</p>
            <QRCode url={guestAppUrl || `${BASE}/`} label="Скануйте камерою телефону" size={120} />
            <div className="mt-5 space-y-2">
              {[
                { icon: "🍽️", label: "Рум-сервіс" },
                { icon: "🧘", label: "Запис до SPA" },
                { icon: "💬", label: "Чат з ресепшн" },
                { icon: "📅", label: "Заходи готелю" },
                { icon: "🛏", label: "Пізній виїзд" },
              ].map((i) => (
                <div key={i.label} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-2.5 text-sm">
                  <span>{i.icon}</span>
                  <span className="text-sm">{i.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dynamic sidebar CTA based on slide */}
          <div className="w-full">
            {currentSlide === "upsell" || currentSlide === "welcome" ? (
              <div className="bg-amber-400/20 border border-amber-400/40 rounded-2xl p-5 text-center">
                <p className="text-amber-300 font-bold text-lg mb-1">Пізній виїзд</p>
                <p className="text-white text-sm mb-2">Залишайтеся до 16:00</p>
                <p className="text-amber-300 text-4xl font-bold">₴500</p>
                <p className="text-amber-400/70 text-xs mt-1">-37% для гостей</p>
              </div>
            ) : currentSlide === "services" ? (
              <div className="bg-teal-400/20 border border-teal-400/40 rounded-2xl p-5 text-center">
                <p className="text-teal-300 font-bold text-lg mb-1">SPA Пара</p>
                <p className="text-white text-sm mb-2">Масаж для двох · 90 хв</p>
                <p className="text-amber-300 text-4xl font-bold">₴1 600</p>
                <p className="text-teal-400/70 text-xs mt-1">Включає джакузі та чай</p>
              </div>
            ) : currentSlide === "activities" ? (
              <div className="bg-green-400/20 border border-green-400/40 rounded-2xl p-5 text-center">
                <p className="text-green-300 font-bold text-lg mb-1">Велотур</p>
                <p className="text-white text-sm mb-2">Карпатські маршрути · 3 год</p>
                <p className="text-amber-300 text-4xl font-bold">₴400</p>
                <p className="text-green-400/70 text-xs mt-1">Гід та спорядження</p>
              </div>
            ) : currentSlide === "weather" ? (
              <div className="bg-blue-400/20 border border-blue-400/40 rounded-2xl p-5 text-center">
                <div className="text-4xl mb-2">☀️</div>
                <p className="text-blue-300 font-bold text-lg mb-1">Активний день</p>
                <p className="text-white text-sm">Ідеально для прогулянок та велоспорту</p>
              </div>
            ) : (
              <div className="bg-amber-400/20 border border-amber-400/40 rounded-2xl p-5 text-center">
                <p className="text-amber-300 font-bold text-lg mb-1">Особлива пропозиція</p>
                <p className="text-white text-sm mb-3">SPA-масаж для двох</p>
                <p className="text-amber-300 text-3xl font-bold">₴1 600</p>
                <p className="text-amber-400/70 text-xs mt-1">-20% для гостей готелю</p>
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 flex items-center justify-between px-10 py-3 border-t border-white/10 text-blue-400 text-sm">
        <span>{hotel?.name || "Dogoda Resort"} · {hotel?.address || "Карпати"}</span>
        <span className="flex items-center gap-2">
          {SLIDES.map((s, i) => (
            <span key={s} className={`text-xs ${i === slide ? "text-amber-400 font-medium" : "opacity-40"}`}>
              {i === slide ? `● ${SLIDE_LABELS[s]}` : ""}
            </span>
          ))}
        </span>
        <span>{hotel?.phone || "+380 xxx"} · Ресепшн 24/7</span>
      </footer>
    </div>
  );
}
