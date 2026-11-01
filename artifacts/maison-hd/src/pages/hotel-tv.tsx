import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Tv, QrCode, Wifi, Settings, ExternalLink, Monitor, CheckCircle2, Eye, Save, Plus, Trash2, Upload, ImageIcon } from "lucide-react";

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

const slideOptions = [
  ["welcome", "Привітання"], ["weather", "Погода"], ["services", "SPA"], ["food", "Ресторан"],
  ["activities", "Активності"], ["events", "Події"], ["upsell", "Пропозиції"], ["video", "Рекламні відео"], ["info", "Інформація"],
] as const;

const emptyEditor = {
  displayName: "",
  branding: {
    hotelName: "", logo: "🏨", logoUrl: "", primaryColor: "#1e40af", accentColor: "#f59e0b",
    tagline: "Ласкаво просимо!", headingFont: "Space Grotesk", bodyFont: "Inter",
  },
  contentConfig: {
    slideInterval: 8000,
    enabledSlides: ["welcome", "weather", "services", "food", "activities", "events", "upsell", "info"],
    hotelInfo: {
      wifiSsid: "", wifiPassword: "", phone: "", email: "", address: "", checkOutTime: "",
      receptionHours: "", breakfastHours: "", lunchHours: "", dinnerHours: "", roomServiceHours: "",
      spaHours: "", poolHours: "", fitnessHours: "", parkingInfo: "", housekeepingInfo: "",
    },
    activities: [] as any[],
    offers: [] as any[],
    promotionalVideos: [] as Array<{ url: string; title?: string }>,
    weather: { location: "", latitude: "", longitude: "" },
    weatherMode: "inherit",
  },
};

export default function HotelTvPage() {
  const [stats, setStats] = useState<any>(null);
  const [screens, setScreens] = useState<any[]>([]);
  const [toggling, setToggling] = useState<number | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [editor, setEditor] = useState<any>(emptyEditor);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ unitId: "", displayName: "" });
  const [availableUnits, setAvailableUnits] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [weatherProperty, setWeatherProperty] = useState<any>(null);
  const [propertyWeather, setPropertyWeather] = useState({ location: "", latitude: "", longitude: "" });
  const [savingWeather, setSavingWeather] = useState(false);
  const { toast } = useToast();

  const loadStats = async () => { const r = await apiFetch("/stats"); if (r.ok) setStats(await r.json()); };
  const loadScreens = async () => { const r = await apiFetch("/screens"); if (r.ok) { const d = await r.json(); setScreens(d.screens || []); } };

  const loadProperties = async () => {
    const r = await apiFetch("/properties/weather");
    if (!r.ok) throw new Error("Не вдалося завантажити погодні налаштування об’єктів");
    setProperties((await r.json()).properties || []);
  };
  useEffect(() => {
    loadStats(); loadScreens();
    const refreshProperties = () => loadProperties().catch(error => toast({ title: error.message, variant: "destructive" }));
    refreshProperties();
    const refresh = () => { loadScreens(); refreshProperties(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const openPropertyWeather = (property: any) => {
    setWeatherProperty(property);
    setPropertyWeather({
      location: property.weather?.location || "",
      latitude: property.weather?.latitude == null ? "" : String(property.weather.latitude),
      longitude: property.weather?.longitude == null ? "" : String(property.weather.longitude),
    });
  };

  const savePropertyWeather = async () => {
    if (!weatherProperty) return;
    setSavingWeather(true);
    try {
      const weather = {
        location: propertyWeather.location,
        ...(propertyWeather.latitude !== "" ? { latitude: Number(propertyWeather.latitude) } : {}),
        ...(propertyWeather.longitude !== "" ? { longitude: Number(propertyWeather.longitude) } : {}),
      };
      const r = await apiFetch(`/properties/${weatherProperty.id}/weather`, { method: "PATCH", body: JSON.stringify(weather) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Не вдалося зберегти погоду");
      await Promise.all([loadProperties(), loadScreens()]);
      setWeatherProperty(null);
      toast({ title: "Погодну локацію об’єкта збережено для всіх TV без перевизначення" });
    } catch (error: any) {
      toast({ title: error.message || "Не вдалося зберегти погоду", variant: "destructive" });
    } finally { setSavingWeather(false); }
  };

  const toggleScreen = async (id: number, isActive: boolean) => {
    setToggling(id);
    const r = await apiFetch(`/screens/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: !isActive }) });
    if (r.ok) { loadScreens(); loadStats(); toast({ title: !isActive ? "📺 TV активовано" : "⏸ TV вимкнено" }); }
    else toast({ title: "Помилка", variant: "destructive" });
    setToggling(null);
  };

  const editScreen = (screen: any) => {
    setEditing(screen);
    setEditor({
      displayName: screen.displayName || "",
      branding: { ...emptyEditor.branding, ...(screen.branding || {}) },
      contentConfig: {
        ...emptyEditor.contentConfig,
        ...(screen.contentConfig || {}),
        hotelInfo: { ...emptyEditor.contentConfig.hotelInfo, ...(screen.contentConfig?.hotelInfo || {}) },
        enabledSlides: screen.contentConfig?.enabledSlides || emptyEditor.contentConfig.enabledSlides,
        activities: screen.contentConfig?.activities || [],
        offers: screen.contentConfig?.offers || [],
        promotionalVideos: screen.contentConfig?.promotionalVideos || [],
        weather: { ...emptyEditor.contentConfig.weather, ...(screen.contentConfig?.weather || {}) },
        weatherMode: screen.weatherMode || "inherit",
      },
    });
  };

  const saveEditor = async () => {
    if (!editing || editor.contentConfig.enabledSlides.length === 0) {
      toast({ title: "Оберіть щонайменше один слайд", variant: "destructive" });
      return;
    }
    setSaving(true);
    const r = await apiFetch(`/screens/${editing.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...editor,
        contentConfig: { ...editor.contentConfig, ...(editor.contentConfig.weatherMode === "inherit" ? { weather: {} } : {}) },
      }),
    });
    if (r.ok) {
      await loadScreens();
      setEditing(null);
      toast({ title: "Налаштування Hotel TV збережено" });
    } else {
      toast({ title: "Не вдалося зберегти налаштування", variant: "destructive" });
    }
    setSaving(false);
  };

  const setInfo = (key: string, value: string) =>
    setEditor((old: any) => ({ ...old, contentConfig: { ...old.contentConfig, hotelInfo: { ...old.contentConfig.hotelInfo, [key]: value } } }));
  const setBrand = (key: string, value: string) =>
    setEditor((old: any) => ({ ...old, branding: { ...old.branding, [key]: value } }));
  const setWeather = (key: string, value: string) =>
    setEditor((old: any) => ({ ...old, contentConfig: { ...old.contentConfig, weather: { ...old.contentConfig.weather, [key]: value } } }));

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      toast({ title: "Оберіть PNG, JPG, WEBP або SVG до 5 МБ", variant: "destructive" });
      return;
    }
    setUploadingLogo(true);
    try {
      const request = await fetch(`${BASE.replace("/maison-hd", "")}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!request.ok) throw new Error("Не вдалося підготувати завантаження");
      const { uploadURL, objectPath } = await request.json();
      const upload = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!upload.ok) throw new Error("Не вдалося завантажити файл");
      setBrand("logoUrl", `${BASE.replace("/maison-hd", "")}/api/storage${objectPath}`);
      toast({ title: "Логотип завантажено. Збережіть налаштування." });
    } catch (error: any) {
      toast({ title: error.message || "Помилка завантаження", variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const uploadVideo = async (file?: File) => {
    if (!file) return;
    const allowed = ["video/mp4", "video/webm", "video/quicktime"];
    if (!allowed.includes(file.type) || file.size > 250 * 1024 * 1024) {
      toast({ title: "Оберіть MP4, WEBM або MOV до 250 МБ", variant: "destructive" });
      return;
    }
    setUploadingVideo(true);
    try {
      const request = await fetch(`${BASE.replace("/maison-hd", "")}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!request.ok) throw new Error("Не вдалося підготувати завантаження");
      const { uploadURL, objectPath } = await request.json();
      const upload = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!upload.ok) throw new Error("Не вдалося завантажити відео");
      const url = `${BASE.replace("/maison-hd", "")}/api/storage${objectPath}`;
      setEditor((old: any) => ({
        ...old,
        contentConfig: {
          ...old.contentConfig,
          promotionalVideos: [...old.contentConfig.promotionalVideos, { url, title: file.name.replace(/\.[^.]+$/, "") }],
          enabledSlides: old.contentConfig.enabledSlides.includes("video")
            ? old.contentConfig.enabledSlides
            : [...old.contentConfig.enabledSlides, "video"],
        },
      }));
      toast({ title: "Відео завантажено. Збережіть налаштування." });
    } catch (error: any) {
      toast({ title: error.message || "Помилка завантаження", variant: "destructive" });
    } finally {
      setUploadingVideo(false);
    }
  };

  const openCreate = async () => {
    const r = await apiFetch("/available-units");
    if (r.ok) {
      const data = await r.json();
      setAvailableUnits(data.units || []);
      setCreateForm({ unitId: "", displayName: "" });
      setCreating(true);
    } else toast({ title: "Не вдалося завантажити номери", variant: "destructive" });
  };

  const createScreen = async () => {
    if (!createForm.unitId) {
      toast({ title: "Оберіть номер", variant: "destructive" });
      return;
    }
    setSaving(true);
    const r = await apiFetch("/screens", { method: "POST", body: JSON.stringify({ ...createForm, unitId: Number(createForm.unitId) }) });
    if (r.ok) {
      setCreating(false);
      await Promise.all([loadScreens(), loadStats()]);
      toast({ title: "Новий TV-екран створено" });
    } else {
      const body = await r.json().catch(() => ({}));
      toast({ title: body.error || "Не вдалося створити екран", variant: "destructive" });
    }
    setSaving(false);
  };

  const openTvUrl = (roomCode: string) => {
    window.open(`${BASE}/tv/${roomCode}`, "_blank");
  };

  const now = Date.now();
  const isOnline = (lastPing: string | null) => lastPing && now - new Date(lastPing).getTime() < 90_000;
  const testScreen = screens.find(screen => screen.isActive);
  const testUrl = testScreen ? `${window.location.origin}${BASE}/tv/${testScreen.roomCode}` : "";

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
          <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4 mr-2" />Додати TV-екран
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="font-semibold">Спільна погода для об’єкта розміщення</h2>
            <p className="text-sm text-muted-foreground">Нові та наявні TV без власного перевизначення автоматично використовують локацію свого об’єкта. Зміни з’являться під час наступного оновлення TV.</p>
            {!properties.length && <p className="text-sm text-muted-foreground">Об’єктів немає або налаштування ще завантажуються.</p>}
            {properties.map(property => <div key={property.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
              <div><p className="font-medium">{property.name}</p>
                <p className="text-sm text-muted-foreground">{property.weather?.location
                  || (property.weather?.latitude != null && property.weather?.longitude != null
                    ? `${property.weather.latitude}, ${property.weather.longitude}` : "Погодну локацію не задано")}</p>
              </div>
              <Button variant="outline" onClick={() => openPropertyWeather(property)}>Налаштувати погоду</Button>
            </div>)}
          </CardContent>
        </Card>

        <Dialog open={!!weatherProperty} onOpenChange={open => { if (!open && !savingWeather) setWeatherProperty(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Погода — {weatherProperty?.name}</DialogTitle>
              <DialogDescription>Спільна локація для TV цього об’єкта. Координати мають пріоритет. Очистіть усі поля, щоб видалити спільну локацію.</DialogDescription>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); savePropertyWeather(); }} className="space-y-4">
              <div><Label htmlFor="property-weather-location">Населений пункт</Label>
                <Input id="property-weather-location" maxLength={255} value={propertyWeather.location}
                  onChange={e => setPropertyWeather(old => ({ ...old, location: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="property-weather-lat">Широта</Label>
                  <Input id="property-weather-lat" type="number" min="-90" max="90" step="any" value={propertyWeather.latitude}
                    onChange={e => setPropertyWeather(old => ({ ...old, latitude: e.target.value }))} /></div>
                <div><Label htmlFor="property-weather-lon">Довгота</Label>
                  <Input id="property-weather-lon" type="number" min="-180" max="180" step="any" value={propertyWeather.longitude}
                    onChange={e => setPropertyWeather(old => ({ ...old, longitude: e.target.value }))} /></div>
              </div>
              <DialogFooter><Button type="submit" disabled={savingWeather}>{savingWeather ? "Збереження…" : "Зберегти для об’єкта"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

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

        <Card className="border-indigo-200 bg-indigo-50/70 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <ExternalLink className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-indigo-950">URL для запуску Hotel TV</p>
                {testUrl ? (
                  <code className="block text-xs text-indigo-700 break-all mt-1">{testUrl}</code>
                ) : (
                  <p className="text-xs text-amber-700 mt-1">Увімкніть хоча б один TV-екран, щоб отримати робочий URL.</p>
                )}
              </div>
              {testUrl && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    navigator.clipboard.writeText(testUrl);
                    toast({ title: "URL скопійовано" });
                  }}>
                    Копіювати
                  </Button>
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => window.open(testUrl, "_blank")}>
                    Спробувати
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
                <Card key={s.id} className={`border-0 shadow-sm ${!s.isActive ? "opacity-60" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Status LED */}
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${s.isActive ? "bg-indigo-100" : "bg-gray-100"}`}>
                        <Monitor className={`h-6 w-6 ${s.isActive ? "text-indigo-600" : "text-gray-400"}`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold">{s.displayName || s.roomCode}</span>
                          <Badge className={s.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                            {s.isActive ? "Активний" : "Вимкнено"}
                          </Badge>
                          {s.isActive && (
                            <Badge className={online ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-600"}>
                              {online ? "🟢 Онлайн" : "⚪ Не підключено"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Код: <code className="bg-gray-100 px-1 rounded">{s.roomCode}</code></span>
                          {s.unitName && <span>Номер: {s.unitName}</span>}
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
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => editScreen(s)}>
                          <Settings className="h-3.5 w-3.5" />Редагувати
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => openTvUrl(s.roomCode)}>
                          <Eye className="h-3.5 w-3.5" />Переглянути
                        </Button>
                        <Button
                          size="sm"
                          className={`h-8 text-xs ${s.isActive ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
                          onClick={() => toggleScreen(s.id, s.isActive)}
                          disabled={toggling === s.id}>
                          {s.isActive ? "Вимкнути" : "Увімкнути"}
                        </Button>
                      </div>
                    </div>

                    {/* TV URL */}
                    {s.isActive && (
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

        <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Контент Hotel TV — {editing?.unitName || editing?.roomCode}</DialogTitle>
              <DialogDescription>Зміни зберігаються для цього TV-екрана та з’являться під час наступного оновлення.</DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="brand">
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="brand">Бренд</TabsTrigger>
                <TabsTrigger value="info">Інформація</TabsTrigger>
                <TabsTrigger value="slides">Слайди</TabsTrigger>
                <TabsTrigger value="content">Контент</TabsTrigger>
                <TabsTrigger value="videos">Відео</TabsTrigger>
              </TabsList>

              <TabsContent value="brand" className="space-y-4 pt-3">
                <div className="rounded-2xl border bg-slate-50 p-4">
                  <Label className="mb-2 block">Логотип компанії</Label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="h-24 w-40 rounded-xl border bg-white flex items-center justify-center overflow-hidden">
                      {editor.branding.logoUrl
                        ? <img src={editor.branding.logoUrl} alt="Логотип" className="h-full w-full object-contain p-2" />
                        : <div className="text-center text-slate-400"><ImageIcon className="h-8 w-8 mx-auto" /><span className="text-xs">Логотип не додано</span></div>}
                    </div>
                    <div>
                      <input id="tv-logo-upload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => uploadLogo(e.target.files?.[0])} />
                      <Button type="button" variant="outline" disabled={uploadingLogo} onClick={() => document.getElementById("tv-logo-upload")?.click()}>
                        <Upload className="h-4 w-4 mr-2" />{uploadingLogo ? "Завантаження…" : "Завантажити логотип"}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">PNG, JPG, WEBP або SVG, до 5 МБ. Рекомендовано прозорий фон.</p>
                      {editor.branding.logoUrl && <Button type="button" variant="ghost" size="sm" className="mt-1 text-red-600" onClick={() => setBrand("logoUrl", "")}>Видалити логотип</Button>}
                    </div>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div><Label>Назва екрана</Label><Input value={editor.displayName} onChange={e => setEditor((o: any) => ({ ...o, displayName: e.target.value }))} /></div>
                  <div><Label>Назва готелю</Label><Input value={editor.branding.hotelName} onChange={e => setBrand("hotelName", e.target.value)} /></div>
                  <div><Label>Резервний символ</Label><Input value={editor.branding.logo} onChange={e => setBrand("logo", e.target.value)} placeholder="🏨" /></div>
                  <div><Label>Слоган</Label><Input value={editor.branding.tagline} onChange={e => setBrand("tagline", e.target.value)} /></div>
                  <div><Label>Основний колір</Label><Input type="color" className="h-10" value={editor.branding.primaryColor} onChange={e => setBrand("primaryColor", e.target.value)} /></div>
                  <div><Label>Акцентний колір</Label><Input type="color" className="h-10" value={editor.branding.accentColor} onChange={e => setBrand("accentColor", e.target.value)} /></div>
                  <div><Label>Шрифт заголовків</Label>
                    <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={editor.branding.headingFont} onChange={e => setBrand("headingFont", e.target.value)}>
                      <option value="Space Grotesk">Space Grotesk</option><option value="Inter">Inter</option><option value="Georgia">Georgia</option><option value="Arial">Arial</option>
                    </select>
                  </div>
                  <div><Label>Шрифт основного тексту</Label>
                    <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={editor.branding.bodyFont} onChange={e => setBrand("bodyFont", e.target.value)}>
                      <option value="Inter">Inter</option><option value="Space Grotesk">Space Grotesk</option><option value="Georgia">Georgia</option><option value="Arial">Arial</option>
                    </select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="info" className="space-y-4 pt-3">
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    ["wifiSsid", "Wi-Fi мережа"], ["wifiPassword", "Пароль Wi-Fi"], ["phone", "Телефон ресепшн"],
                    ["email", "Email"], ["address", "Адреса"], ["checkOutTime", "Час виїзду"],
                    ["receptionHours", "Робота ресепшн"], ["breakfastHours", "Сніданок"], ["lunchHours", "Обід"],
                    ["dinnerHours", "Вечеря"], ["roomServiceHours", "Рум-сервіс"], ["spaHours", "SPA"],
                    ["poolHours", "Басейн"], ["fitnessHours", "Фітнес"],
                  ].map(([key, label]) => <div key={key}><Label>{label}</Label><Input value={editor.contentConfig.hotelInfo[key]} onChange={e => setInfo(key, e.target.value)} /></div>)}
                </div>
                <div><Label>Парковка</Label><Textarea value={editor.contentConfig.hotelInfo.parkingInfo} onChange={e => setInfo("parkingInfo", e.target.value)} /></div>
                <div><Label>Прибирання</Label><Textarea value={editor.contentConfig.hotelInfo.housekeepingInfo} onChange={e => setInfo("housekeepingInfo", e.target.value)} /></div>
              </TabsContent>

              <TabsContent value="slides" className="space-y-5 pt-3">
                <div>
                  <Label>Інтервал перемикання: {Math.round(editor.contentConfig.slideInterval / 1000)} сек.</Label>
                  <Input type="range" min="5000" max="30000" step="1000" value={editor.contentConfig.slideInterval}
                    onChange={e => setEditor((o: any) => ({ ...o, contentConfig: { ...o.contentConfig, slideInterval: Number(e.target.value) } }))} />
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {slideOptions.map(([id, label]) => {
                    const checked = editor.contentConfig.enabledSlides.includes(id);
                    return <div key={id} className="flex items-center justify-between rounded-xl border p-3">
                      <Label>{label}</Label><Switch checked={checked} onCheckedChange={(on) => setEditor((o: any) => ({
                        ...o, contentConfig: { ...o.contentConfig, enabledSlides: on ? [...o.contentConfig.enabledSlides, id] : o.contentConfig.enabledSlides.filter((s: string) => s !== id) }
                      }))} />
                    </div>;
                  })}
                </div>
                <div className="rounded-2xl border bg-slate-50 p-4 space-y-3">
                  <div>
                    <Label className="text-base">Локація для погоди</Label>
                    <div className="flex items-center justify-between gap-3 mt-2">
                      <Label htmlFor="tv-weather-override">Власна локація цього TV</Label>
                      <Switch id="tv-weather-override" checked={editor.contentConfig.weatherMode === "override"}
                        onCheckedChange={on => setEditor((old: any) => ({ ...old, contentConfig: { ...old.contentConfig, weatherMode: on ? "override" : "inherit" } }))} />
                    </div>
                    {editor.contentConfig.weatherMode === "inherit"
                      ? <p className="text-sm text-muted-foreground mt-2">Успадковує: {editing?.propertyName || "Об’єкт не прив’язаний"} — {(() => {
                        const weather = properties.find(p => p.id === editing?.propertyId)?.weather;
                        return weather?.location || (weather?.latitude != null && weather?.longitude != null ? `${weather.latitude}, ${weather.longitude}` : "Локацію об’єкта не задано");
                      })()}</p>
                      : <p className="text-xs text-muted-foreground mt-1">Вкажіть назву населеного пункту або точні координати. Координати мають пріоритет.</p>}
                  </div>
                  {editor.contentConfig.weatherMode === "override" && <>
                  <Input
                    value={editor.contentConfig.weather.location}
                    onChange={e => setWeather("location", e.target.value)}
                    placeholder="Наприклад, Буковель, Україна"
                  />
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <Label>Широта</Label>
                      <Input type="number" min="-90" max="90" step="any" value={editor.contentConfig.weather.latitude}
                        onChange={e => setWeather("latitude", e.target.value)} placeholder="48.353" />
                    </div>
                    <div>
                      <Label>Довгота</Label>
                      <Input type="number" min="-180" max="180" step="any" value={editor.contentConfig.weather.longitude}
                        onChange={e => setWeather("longitude", e.target.value)} placeholder="24.412" />
                    </div>
                  </div>
                  </>}
                </div>
              </TabsContent>

              <TabsContent value="content" className="space-y-6 pt-3">
                <section>
                  <div className="flex justify-between items-center mb-3"><Label className="text-base">Активності</Label>
                    <Button variant="outline" size="sm" onClick={() => setEditor((o: any) => ({ ...o, contentConfig: { ...o.contentConfig, activities: [...o.contentConfig.activities, { icon: "●", name: "", description: "", hours: "", price: "", tag: "" }] } }))}><Plus className="h-4 w-4 mr-1" />Додати</Button>
                  </div>
                  <div className="space-y-3">{editor.contentConfig.activities.map((a: any, i: number) =>
                    <div key={i} className="grid md:grid-cols-6 gap-2 border rounded-xl p-3">
                      {["icon", "name", "description", "hours", "price", "tag"].map(k => <Input key={k} placeholder={{icon:"Символ",name:"Назва",description:"Опис",hours:"Години",price:"Ціна",tag:"Тег"}[k as "icon"]} value={a[k]} onChange={e => setEditor((o: any) => { const activities=[...o.contentConfig.activities]; activities[i]={...activities[i],[k]:e.target.value}; return {...o,contentConfig:{...o.contentConfig,activities}}; })} />)}
                      <Button variant="ghost" size="sm" className="md:col-span-6 text-red-600" onClick={() => setEditor((o: any) => ({...o,contentConfig:{...o.contentConfig,activities:o.contentConfig.activities.filter((_: any,n:number)=>n!==i)}}))}><Trash2 className="h-4 w-4 mr-1"/>Видалити</Button>
                    </div>)}</div>
                </section>
                <section>
                  <div className="flex justify-between items-center mb-3"><Label className="text-base">Спеціальні пропозиції</Label>
                    <Button variant="outline" size="sm" onClick={() => setEditor((o: any) => ({ ...o, contentConfig: { ...o.contentConfig, offers: [...o.contentConfig.offers, { icon: "●", title: "", description: "", price: "", originalPrice: "", tag: "", cta: "" }] } }))}><Plus className="h-4 w-4 mr-1" />Додати</Button>
                  </div>
                  <div className="space-y-3">{editor.contentConfig.offers.map((a: any, i: number) =>
                    <div key={i} className="grid md:grid-cols-4 gap-2 border rounded-xl p-3">
                      {["icon", "title", "description", "price", "originalPrice", "tag", "cta"].map(k => <Input key={k} placeholder={{icon:"Символ",title:"Назва",description:"Опис",price:"Ціна",originalPrice:"Стара ціна",tag:"Позначка",cta:"Деталь"}[k as "icon"]} value={a[k]} onChange={e => setEditor((o: any) => { const offers=[...o.contentConfig.offers]; offers[i]={...offers[i],[k]:e.target.value}; return {...o,contentConfig:{...o.contentConfig,offers}}; })} />)}
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setEditor((o: any) => ({...o,contentConfig:{...o.contentConfig,offers:o.contentConfig.offers.filter((_: any,n:number)=>n!==i)}}))}><Trash2 className="h-4 w-4 mr-1"/>Видалити</Button>
                    </div>)}</div>
                </section>
              </TabsContent>

              <TabsContent value="videos" className="space-y-4 pt-3">
                <div className="rounded-2xl border border-dashed p-5 text-center bg-slate-50">
                  <input id="tv-video-upload" type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={e => uploadVideo(e.target.files?.[0])} />
                  <Upload className="h-8 w-8 mx-auto text-indigo-500 mb-2" />
                  <p className="font-medium">Рекламні відео для Hotel TV</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">MP4, WEBM або MOV до 250 МБ. Для Smart TV рекомендовано MP4 H.264 у Full HD.</p>
                  <Button type="button" variant="outline" disabled={uploadingVideo} onClick={() => document.getElementById("tv-video-upload")?.click()}>
                    {uploadingVideo ? "Завантаження…" : "Додати відео"}
                  </Button>
                </div>
                <div className="space-y-3">
                  {editor.contentConfig.promotionalVideos.map((video: any, index: number) => (
                    <div key={`${video.url}-${index}`} className="flex flex-col sm:flex-row gap-3 rounded-xl border p-3">
                      <video src={video.url} className="w-full sm:w-40 h-24 rounded-lg bg-black object-contain" muted preload="metadata" />
                      <div className="flex-1">
                        <Label>Назва відео</Label>
                        <Input value={video.title || ""} onChange={e => setEditor((old: any) => {
                          const promotionalVideos = [...old.contentConfig.promotionalVideos];
                          promotionalVideos[index] = { ...promotionalVideos[index], title: e.target.value };
                          return { ...old, contentConfig: { ...old.contentConfig, promotionalVideos } };
                        })} />
                      </div>
                      <Button type="button" variant="ghost" className="text-red-600 self-end sm:self-center" onClick={() => setEditor((old: any) => {
                        const promotionalVideos = old.contentConfig.promotionalVideos.filter((_: any, i: number) => i !== index);
                        return {
                          ...old,
                          contentConfig: {
                            ...old.contentConfig,
                            promotionalVideos,
                            enabledSlides: promotionalVideos.length
                              ? old.contentConfig.enabledSlides
                              : old.contentConfig.enabledSlides.filter((id: string) => id !== "video"),
                          },
                        };
                      })}><Trash2 className="h-4 w-4 mr-1" />Видалити</Button>
                    </div>
                  ))}
                  {editor.contentConfig.promotionalVideos.length === 0 && <p className="text-sm text-center text-muted-foreground py-4">Рекламних відео ще немає.</p>}
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Скасувати</Button>
              <Button onClick={saveEditor} disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? "Збереження…" : "Зберегти"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Додати TV-екран</DialogTitle>
              <DialogDescription>Прив’яжіть новий екран до номера. Система автоматично створить унікальний URL.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Номер або будинок</Label>
                <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={createForm.unitId} onChange={e => {
                  const unit = availableUnits.find(u => String(u.id) === e.target.value);
                  setCreateForm({ unitId: e.target.value, displayName: unit ? `TV — ${unit.name}` : "" });
                }}>
                  <option value="">Оберіть номер</option>
                  {availableUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}{unit.floor ? ` · ${unit.floor} поверх` : ""}</option>)}
                </select>
                {availableUnits.length === 0 && <p className="text-xs text-amber-700 mt-2">Для всіх номерів TV-екрани вже створені.</p>}
              </div>
              <div><Label>Назва екрана</Label><Input value={createForm.displayName} onChange={e => setCreateForm(old => ({ ...old, displayName: e.target.value }))} placeholder="Наприклад, TV — Номер 101" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreating(false)}>Скасувати</Button>
              <Button onClick={createScreen} disabled={saving || !availableUnits.length}>{saving ? "Створення…" : "Створити екран"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
