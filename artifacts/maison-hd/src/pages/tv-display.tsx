import { useState, useEffect, useCallback } from "react";
import { useRoute } from "wouter";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/maison-hd";
const API = BASE.replace("/maison-hd", "") + "/api/tv";

type Slide = "welcome" | "services" | "food" | "events" | "info" | "upsell";

const SLIDES: Slide[] = ["welcome", "services", "food", "events", "info"];

function pad(n: number) { return String(n).padStart(2, "0"); }

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const iv = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(iv); }, []);
  const days = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"];
  const months = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
  return (
    <div className="text-right">
      <div className="text-5xl font-bold tracking-tight text-white leading-none">
        {pad(time.getHours())}:{pad(time.getMinutes())}
      </div>
      <div className="text-base text-blue-200 mt-1">
        {days[time.getDay()]}, {time.getDate()} {months[time.getMonth()]} {time.getFullYear()}
      </div>
    </div>
  );
}

function QRCode({ url, label }: { url: string; label?: string }) {
  const fullUrl = `${window.location.origin}${url}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=ffffff&color=1e3a8a&qzone=1&data=${encodeURIComponent(fullUrl)}`;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bg-white rounded-2xl p-3 shadow-lg">
        <img src={qrSrc} width={140} height={140} alt="QR Code" className="block" />
      </div>
      <p className="text-blue-200 text-sm text-center">{label || "Скануйте для смартфону"}</p>
    </div>
  );
}

function SlideIndicator({ slides, current }: { slides: Slide[]; current: number }) {
  return (
    <div className="flex gap-2 justify-center">
      {slides.map((_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === current ? "w-8 bg-amber-400" : "w-2 bg-white/30"}`} />
      ))}
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

  const load = useCallback(async () => {
    if (!roomCode) return;
    try {
      const r = await fetch(`${API}/display/${roomCode}`);
      if (r.ok) { setData(await r.json()); setError(""); }
      else { const e = await r.json(); setError(e.error || "Помилка"); }
    } catch { setError("Немає з'єднання"); }
    finally { setLoading(false); }
  }, [roomCode]);

  // Heartbeat
  useEffect(() => {
    const ping = () => roomCode && fetch(`${API}/display/${roomCode}/ping`, { method: "POST" }).catch(() => {});
    ping();
    const iv = setInterval(ping, 30_000);
    return () => clearInterval(iv);
  }, [roomCode]);

  useEffect(() => { load(); const iv = setInterval(load, 120_000); return () => clearInterval(iv); }, [load]);

  // Auto-advance slides
  useEffect(() => {
    if (!data) return;
    const interval = data?.screen?.contentConfig?.slideInterval || 8000;
    const iv = setInterval(() => setSlide(s => (s + 1) % SLIDES.length), interval);
    return () => clearInterval(iv);
  }, [data]);

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center">
      <div className="text-center text-white">
        <div className="text-6xl mb-4">🏨</div>
        <p className="text-2xl font-light animate-pulse">Завантаження…</p>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 text-white flex flex-col overflow-hidden select-none cursor-none">

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between px-10 py-5 border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-amber-400 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
            {branding.logo || "🏨"}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-wide">{branding.hotelName || "Dogoda Resort"}</h1>
            <p className="text-blue-300 text-sm">{screen?.unitName || screen?.displayName}</p>
          </div>
        </div>
        <Clock />
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 flex gap-0 overflow-hidden">

        {/* ── LEFT PANEL (slides) ── */}
        <div className="flex-1 flex flex-col p-10">

          {/* Welcome / Personal greeting slide */}
          {currentSlide === "welcome" && (
            <div className="flex-1 flex flex-col justify-center">
              {guestName ? (
                <>
                  <p className="text-blue-300 text-xl mb-2">Ласкаво просимо,</p>
                  <h2 className="text-6xl font-bold mb-6 leading-tight">{guestName}</h2>
                  <div className="flex gap-8 mb-8">
                    <div className="bg-white/10 rounded-2xl px-6 py-4 backdrop-blur-sm">
                      <p className="text-blue-300 text-sm mb-1">Заїзд</p>
                      <p className="text-2xl font-semibold">{currentBooking.checkIn}</p>
                    </div>
                    <div className="bg-white/10 rounded-2xl px-6 py-4 backdrop-blur-sm">
                      <p className="text-blue-300 text-sm mb-1">Виїзд</p>
                      <p className="text-2xl font-semibold">{currentBooking.checkOut}</p>
                    </div>
                    <div className="bg-amber-400/20 border border-amber-400/40 rounded-2xl px-6 py-4">
                      <p className="text-amber-300 text-sm mb-1">Виїзд до</p>
                      <p className="text-2xl font-semibold text-amber-300">{hotel.checkOutTime}</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-7xl font-bold mb-4 leading-tight">{branding.tagline || "Ласкаво просимо!"}</h2>
                  <p className="text-blue-300 text-2xl mb-8">{branding.hotelName}</p>
                </>
              )}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: "📶", label: "Wi-Fi", val: hotel.wifi.ssid, sub: hotel.wifi.password },
                  { icon: "📞", label: "Ресепшн", val: hotel.phone, sub: "Цілодобово" },
                  { icon: "🕛", label: "Виїзд", val: hotel.checkOutTime, sub: "Пізній — у ресепшн" },
                ].map((i) => (
                  <div key={i.label} className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm">
                    <div className="text-3xl mb-2">{i.icon}</div>
                    <p className="text-blue-300 text-xs uppercase tracking-widest mb-0.5">{i.label}</p>
                    <p className="text-xl font-bold">{i.val}</p>
                    <p className="text-blue-400 text-sm">{i.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SPA Services */}
          {currentSlide === "services" && (
            <div className="flex-1 flex flex-col">
              <h2 className="text-4xl font-bold mb-2">🌿 SPA & Wellness</h2>
              <p className="text-blue-300 mb-8">Забронюйте через наш додаток або зателефонуйте на ресепшн</p>
              <div className="grid grid-cols-2 gap-5 flex-1">
                {(upsells?.spa || []).slice(0, 4).map((s: any) => (
                  <div key={s.id} className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/5 hover:bg-white/15 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <span className="bg-teal-400/20 text-teal-300 text-xs px-3 py-1 rounded-full">{s.category}</span>
                      <span className="text-2xl font-bold text-amber-300">₴{parseFloat(s.price).toLocaleString()}</span>
                    </div>
                    <h3 className="text-xl font-semibold mb-1">{s.name}</h3>
                    <p className="text-blue-300 text-sm">⏱ {s.duration} хвилин</p>
                  </div>
                ))}
                {(upsells?.spa || []).length === 0 && (
                  <div className="col-span-2 flex items-center justify-center h-40 text-blue-300 text-xl">
                    🧖 SPA відкрито 09:00 – 21:00
                  </div>
                )}
              </div>
            </div>
          )}

          {/* F&B / Room Service */}
          {currentSlide === "food" && (
            <div className="flex-1 flex flex-col">
              <h2 className="text-4xl font-bold mb-2">🍽️ Рум-сервіс</h2>
              <p className="text-blue-300 mb-8">Замовляйте прямо в номер через додаток · Доставка ~25 хвилин</p>
              <div className="grid grid-cols-3 gap-4 flex-1">
                {(upsells?.fb || []).slice(0, 6).map((f: any) => (
                  <div key={f.id} className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm border border-white/5">
                    <p className="text-lg font-semibold mb-1">{f.name}</p>
                    <p className="text-blue-300 text-sm line-clamp-2 mb-3">{f.description}</p>
                    <p className="text-2xl font-bold text-amber-300">₴{parseFloat(f.price).toLocaleString()}</p>
                  </div>
                ))}
                {(upsells?.fb || []).length === 0 && (
                  <div className="col-span-3 flex flex-col items-center justify-center h-40 gap-3 text-blue-300">
                    <span className="text-5xl">🍴</span>
                    <p className="text-xl">Ресторан відкрито 07:00 – 23:00</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Events */}
          {currentSlide === "events" && (
            <div className="flex-1 flex flex-col">
              <h2 className="text-4xl font-bold mb-2">🎭 Заходи та дозвілля</h2>
              <p className="text-blue-300 mb-8">Сьогодні та завтра у {branding.hotelName}</p>
              {events?.length > 0 ? (
                <div className="space-y-4 flex-1">
                  {events.map((e: any, i: number) => (
                    <div key={i} className="flex items-center gap-6 bg-white/10 rounded-2xl p-5 backdrop-blur-sm">
                      <div className="bg-amber-400/20 border border-amber-400/40 rounded-xl px-4 py-3 text-center flex-shrink-0">
                        <p className="text-amber-300 text-xs">Початок</p>
                        <p className="text-2xl font-bold text-amber-300">{e.start_time || "TBD"}</p>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold">{e.title}</h3>
                        <p className="text-blue-300">{e.space_name} · {e.start_date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                  <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
                    {[
                      { time: "19:00", label: "Жива музика в лобі", icon: "🎵" },
                      { time: "21:00", label: "Кіно на терасі", icon: "🎬" },
                      { time: "10:00", label: "Йога на траві", icon: "🧘" },
                      { time: "18:00", label: "Дегустація вин", icon: "🍷" },
                    ].map((e, i) => (
                      <div key={i} className="bg-white/10 rounded-2xl p-5 flex items-center gap-3">
                        <span className="text-3xl">{e.icon}</span>
                        <div>
                          <p className="text-amber-300 font-bold">{e.time}</p>
                          <p className="text-sm">{e.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Room Info */}
          {currentSlide === "info" && (
            <div className="flex-1 flex flex-col">
              <h2 className="text-4xl font-bold mb-2">ℹ️ Інформація</h2>
              <p className="text-blue-300 mb-8">{hotel.name} · {hotel.address}</p>
              <div className="grid grid-cols-2 gap-5 flex-1">
                {[
                  { icon: "📶", title: "Wi-Fi", lines: [`Мережа: ${hotel.wifi.ssid}`, `Пароль: ${hotel.wifi.password}`, "Безкоштовно для гостей"] },
                  { icon: "🍳", title: "Сніданок", lines: ["Ресторан, 1-й поверх", "07:00 – 10:30", "Включений у вартість"] },
                  { icon: "🏊", title: "Басейн & SPA", lines: ["Відкритий: 08:00 – 21:00", "SPA: 09:00 – 21:00", "Фітнес: 07:00 – 22:00"] },
                  { icon: "🚗", title: "Парковка", lines: ["Безкоштовна охоронювана", "Відео-спостереження 24/7", "Електро-зарядна станція"] },
                  { icon: "🧹", title: "Прибирання", lines: ["Щоденно 10:00 – 14:00", "Або за запитом", "DND — повісьте табличку"] },
                  { icon: "📞", title: "Контакти", lines: [hotel.phone, "info@dogoda.com", "Ресепшн — цілодобово"] },
                ].map((b) => (
                  <div key={b.title} className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">{b.icon}</span>
                      <p className="font-semibold text-lg">{b.title}</p>
                    </div>
                    {b.lines.map((l, i) => <p key={i} className={`text-sm ${i === 0 ? "text-white font-medium" : "text-blue-300"}`}>{l}</p>)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Slide indicator */}
          <div className="mt-6">
            <SlideIndicator slides={SLIDES} current={slide} />
          </div>
        </div>

        {/* ── RIGHT SIDEBAR (QR + upsell CTA) ── */}
        <aside className="w-72 bg-white/5 border-l border-white/10 flex flex-col items-center justify-between py-10 px-6">
          {/* Guest App QR */}
          <div className="w-full">
            <p className="text-center text-amber-300 font-semibold text-sm uppercase tracking-widest mb-4">Гостьовий додаток</p>
            <QRCode url={guestAppUrl} label="Скануйте камерою телефону" />
            <div className="mt-6 space-y-2">
              {[
                { icon: "🍽️", label: "Рум-сервіс" },
                { icon: "🧘", label: "Запис до SPA" },
                { icon: "💬", label: "Чат з ресепшн" },
                { icon: "📅", label: "Заходи готелю" },
              ].map((i) => (
                <div key={i.label} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-2.5 text-sm">
                  <span>{i.icon}</span>
                  <span>{i.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upsell CTA */}
          <div className="w-full">
            <div className="bg-amber-400/20 border border-amber-400/40 rounded-2xl p-5 text-center">
              <p className="text-amber-300 font-bold text-lg mb-1">Особлива пропозиція</p>
              <p className="text-white text-sm mb-3">SPA-масаж для двох</p>
              <p className="text-amber-300 text-3xl font-bold">₴1 600</p>
              <p className="text-amber-400/70 text-xs mt-1">-20% для гостей готелю</p>
            </div>
          </div>
        </aside>
      </main>

      {/* ── FOOTER ── */}
      <footer className="flex items-center justify-between px-10 py-3 border-t border-white/10 text-blue-400 text-sm">
        <span>{hotel.name} · {hotel.address}</span>
        <span>{screen?.unitName} · {screen?.roomCode}</span>
        <span>{hotel.phone}</span>
      </footer>
    </div>
  );
}
