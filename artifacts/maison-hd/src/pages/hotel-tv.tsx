import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Tv, QrCode, Wifi, WifiOff, Settings, ExternalLink, Monitor, Sparkles, CheckCircle2, Eye } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/tv";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

function QrPreview({ roomCode }: { roomCode: string }) {
  const tvUrl = `${window.location.origin}${BASE}/tv/${roomCode}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&bgcolor=f8fafc&color=1e3a8a&qzone=1&data=${encodeURIComponent(tvUrl)}`;
  return <img src={qrSrc} width={80} height={80} alt="QR" className="rounded-lg border" />;
}

export default function HotelTvPage() {
  const [stats, setStats] = useState<any>(null);
  const [screens, setScreens] = useState<any[]>([]);
  const [toggling, setToggling] = useState<number | null>(null);
  const { toast } = useToast();

  const loadStats = async () => { const r = await apiFetch("/stats"); if (r.ok) setStats(await r.json()); };
  const loadScreens = async () => { const r = await apiFetch("/screens"); if (r.ok) { const d = await r.json(); setScreens(d.screens || []); } };

  useEffect(() => { loadStats(); loadScreens(); }, []);

  const toggleScreen = async (id: number, isActive: boolean) => {
    setToggling(id);
    const r = await apiFetch(`/screens/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: !isActive }) });
    if (r.ok) { loadScreens(); loadStats(); toast({ title: !isActive ? "📺 TV активовано" : "⏸ TV вимкнено" }); }
    else toast({ title: "Помилка", variant: "destructive" });
    setToggling(null);
  };

  const openTvUrl = (roomCode: string) => {
    window.open(`${BASE}/tv/${roomCode}`, "_blank");
  };

  const now = Date.now();
  const isOnline = (lastPing: string | null) => lastPing && now - new Date(lastPing).getTime() < 90_000;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Monitor className="h-7 w-7 text-indigo-600" />Hotel TV / In-Room Digital
            </h1>
            <p className="text-gray-500 text-sm">Управління телевізійними екранами в номерах, контент та QR-передача</p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Екранів налаштовано", value: stats.totalScreens, icon: Tv, color: "text-indigo-600", bg: "bg-indigo-50" },
              { label: "Активних TV", value: stats.activeScreens, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
              { label: "Онлайн зараз", value: stats.onlineScreens, icon: Wifi, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "QR-сканувань", value: stats.qrScans, icon: QrCode, color: "text-amber-600", bg: "bg-amber-50" },
            ].map((s, i) => (
              <Card key={i} className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}

        {/* Feature cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: "👋", title: "Welcome screen", desc: "Персоналізоване вітання гостя з ім'ям та датами" },
            { icon: "📱", title: "QR Handoff", desc: "Сканування → автоматичний перехід у Guest App" },
            { icon: "🛍️", title: "In-room upsell", desc: "SPA, рум-сервіс, апгрейди прямо з телевізора" },
            { icon: "📅", title: "Events & Info", desc: "Розклад заходів, Wi-Fi, послуги, довідка" },
          ].map((f, i) => (
            <div key={i} className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl p-4 border border-indigo-100">
              <div className="text-3xl mb-2">{f.icon}</div>
              <p className="font-semibold text-sm text-indigo-900">{f.title}</p>
              <p className="text-xs text-indigo-600 mt-0.5 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Screens list */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Tv className="h-5 w-5 text-indigo-600" />Екрани в номерах</h2>
          <div className="space-y-3">
            {screens.map(s => {
              const online = isOnline(s.lastPingAt);
              const tvUrl = `${BASE}/tv/${s.roomCode}`;
              const guestAppUrl = `${BASE}/guest-app`;
              const guestQrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&bgcolor=f8fafc&color=1e3a8a&qzone=1&data=${encodeURIComponent(window.location.origin + guestAppUrl)}`;
              return (
                <Card key={s.id} className={`border-0 shadow-sm ${!s.is_active ? "opacity-60" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Status LED */}
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${s.is_active ? "bg-indigo-100" : "bg-gray-100"}`}>
                        <Monitor className={`h-6 w-6 ${s.is_active ? "text-indigo-600" : "text-gray-400"}`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold">{s.display_name || s.room_code}</span>
                          <Badge className={s.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                            {s.is_active ? "Активний" : "Вимкнено"}
                          </Badge>
                          {s.is_active && (
                            <Badge className={online ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-600"}>
                              {online ? "🟢 Онлайн" : "⚪ Не підключено"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Код: <code className="bg-gray-100 px-1 rounded">{s.room_code}</code></span>
                          {s.unit_name && <span>Номер: {s.unit_name}</span>}
                          {s.floor && <span>Поверх: {s.floor}</span>}
                          {s.lastPingAt && <span>Ping: {new Date(s.lastPingAt).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })}</span>}
                        </div>
                      </div>

                      {/* QR для Guest App */}
                      <div className="flex-shrink-0 hidden md:block">
                        <p className="text-xs text-gray-400 text-center mb-1">Guest App QR</p>
                        <img src={guestQrSrc} width={64} height={64} alt="QR" className="rounded-lg border border-gray-200" />
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => openTvUrl(s.room_code)}>
                          <Eye className="h-3.5 w-3.5" />Переглянути
                        </Button>
                        <Button
                          size="sm"
                          className={`h-8 text-xs ${s.is_active ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
                          onClick={() => toggleScreen(s.id, s.is_active)}
                          disabled={toggling === s.id}>
                          {s.is_active ? "Вимкнути" : "Увімкнути"}
                        </Button>
                      </div>
                    </div>

                    {/* TV URL */}
                    {s.is_active && (
                      <div className="mt-3 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                        <span className="text-xs text-gray-400">URL:</span>
                        <code className="text-xs text-indigo-600 flex-1 truncate">{window.location.origin}{tvUrl}</code>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { navigator.clipboard.writeText(window.location.origin + tvUrl); toast({ title: "URL скопійовано" }); }}>
                          <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* How to set up */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50 to-violet-50">
          <CardContent className="p-5">
            <h3 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
              <Settings className="h-4 w-4" />Як налаштувати TV в номері
            </h3>
            <ol className="space-y-2 text-sm text-indigo-800">
              {[
                "Підключіть Smart TV або медіаплеєр (Fire Stick, Chromecast, Android Box) до Wi-Fi готелю",
                "Відкрийте браузер на TV та введіть URL-адресу екрана (наведений вище)",
                "Встановіть авто-запуск браузера при включенні TV",
                "Сторінка автоматично оновлюється кожні 2 хвилини і відображає поточного гостя",
                "QR-код у правому куті веде гостей до мобільного Guest App для замовлень",
              ].map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-800 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
