import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Plus, Wifi, WifiOff, AlertCircle, CheckCircle2, Link2, Globe, ArrowUpDown, List } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/ota";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { "Authorization": `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const CHANNEL_OPTIONS = [
  { value: "booking_com", label: "Booking.com", logo: "🏨" },
  { value: "airbnb", label: "Airbnb", logo: "🏠" },
  { value: "expedia", label: "Expedia / Hotels.com", logo: "✈️" },
  { value: "agoda", label: "Agoda", logo: "🌏" },
  { value: "ostrovok", label: "Ostrovok.ru", logo: "🏝️" },
  { value: "direct", label: "Прямий канал", logo: "📲" },
];
const STATUS_CFG: Record<string, { label: string; color: string; icon: any }> = {
  active: { label: "Активний", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  pending: { label: "Налаштування", color: "bg-yellow-100 text-yellow-700", icon: RefreshCw },
  error: { label: "Помилка", color: "bg-red-100 text-red-600", icon: AlertCircle },
  inactive: { label: "Вимкнено", color: "bg-gray-100 text-gray-500", icon: WifiOff },
};
const EVENT_TYPE_LABELS: Record<string, string> = {
  reservation_created: "🟢 Нове бронювання",
  reservation_modified: "🔵 Зміна бронювання",
  reservation_cancelled: "🔴 Скасування",
  availability_update: "📅 Доступність",
  rate_update: "💰 Тарифи",
  ping: "🔔 Ping",
};

const TABS = [
  { id: "channels", label: "Канали", icon: Globe },
  { id: "logs", label: "Журнал подій", icon: List },
  { id: "mappings", label: "Маппінг номерів", icon: ArrowUpDown },
];

export default function OtaPage() {
  const [tab, setTab] = useState("channels");
  const [stats, setStats] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [channelMeta, setChannelMeta] = useState<any>({});
  const [showNew, setShowNew] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);
  const { toast } = useToast();

  const loadStats = async () => { const r = await apiFetch("/stats"); if (r.ok) setStats(await r.json()); };
  const loadChannels = async () => { const r = await apiFetch("/channels"); if (r.ok) { const d = await r.json(); setChannels(d.channels || []); setChannelMeta(d.channelMeta || {}); } };
  const loadLogs = async () => { const r = await apiFetch("/logs?limit=40"); if (r.ok) { const d = await r.json(); setLogs(d.logs || []); } };
  const loadMappings = async () => { const r = await apiFetch("/mappings"); if (r.ok) { const d = await r.json(); setMappings(d.mappings || []); } };

  useEffect(() => { loadStats(); loadChannels(); loadLogs(); loadMappings(); }, []);

  const syncChannel = async (ch: any) => {
    setSyncing(ch.id);
    const r = await apiFetch(`/channels/${ch.id}/sync`, { method: "POST" });
    if (r.ok) { const d = await r.json(); toast({ title: d.message }); loadChannels(); loadLogs(); loadStats(); }
    else { const e = await r.json(); toast({ title: "Помилка синхронізації", description: e.error, variant: "destructive" }); }
    setSyncing(null);
  };

  const toggleChannel = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const r = await apiFetch(`/channels/${id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
    if (r.ok) { loadChannels(); loadStats(); toast({ title: newStatus === "active" ? "✅ Канал активовано" : "⏸ Канал призупинено" }); }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Globe className="h-7 w-7 text-violet-600" />OTA Channel Manager</h1>
            <p className="text-gray-500 text-sm">Управління каналами дистрибуції: Booking.com, Airbnb, Expedia та інші</p>
          </div>
          {tab === "channels" && <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-2" />Додати канал</Button>}
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Активних каналів", value: stats.activeChannels, sub: `з ${stats.totalChannels} підключених`, color: "text-violet-600" },
              { label: "Нових бронювань", value: stats.newReservations, sub: "через OTA каналів", color: "text-green-600" },
              { label: "Скасувань", value: stats.cancelledReservations, sub: "від гостей", color: "text-orange-500" },
              { label: "Помилок / Каналів", value: `${stats.errors} / ${stats.errorChannels}`, sub: "потребують уваги", color: "text-red-500" },
            ].map((s, i) => (
              <Card key={i} className="border-0 shadow-sm"><CardContent className="p-4">
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-400">{s.sub}</p>
              </CardContent></Card>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-violet-600 text-violet-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* ── CHANNELS ── */}
        {tab === "channels" && (
          <div className="space-y-3">
            {channels.map(ch => {
              const meta = channelMeta[ch.channel] || {};
              const scfg = STATUS_CFG[ch.status] || STATUS_CFG.inactive;
              const SIcon = scfg.icon;
              return (
                <Card key={ch.id} className={`border-0 shadow-sm ${ch.status === "error" ? "border border-red-200" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${ch.status === "active" ? "bg-violet-100" : "bg-gray-100"}`}>
                        {meta.logo || "🔗"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{ch.displayName}</span>
                          <Badge className={scfg.color}><SIcon className="h-3 w-3 mr-1" />{scfg.label}</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                          {ch.propertyIdExt && <span>ID: {ch.propertyIdExt}</span>}
                          {ch.lastSyncAt && <span>Синхр.: {new Date(ch.lastSyncAt).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })}</span>}
                        </div>
                        {ch.lastError && <p className="text-xs text-red-500 mt-1">⚠ {ch.lastError}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {ch.status === "active" && (
                          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => syncChannel(ch)} disabled={syncing === ch.id}>
                            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing === ch.id ? "animate-spin" : ""}`} />Синхр.
                          </Button>
                        )}
                        <Button variant={ch.status === "active" ? "outline" : "default"} size="sm"
                          className={`h-8 text-xs ${ch.status !== "active" ? "bg-violet-600 hover:bg-violet-700" : ""}`}
                          onClick={() => toggleChannel(ch.id, ch.status)}>
                          {ch.status === "active" ? "Вимкнути" : "Увімкнути"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── LOGS ── */}
        {tab === "logs" && (
          <div className="space-y-2">
            {logs.map(log => {
              const meta = channelMeta[log.channelType] || {};
              return (
                <div key={log.id} className={`flex items-start gap-3 p-3 rounded-xl border ${log.status === "error" ? "bg-red-50 border-red-200" : "bg-white border-gray-100"}`}>
                  <span className="text-xl flex-shrink-0">{meta.logo || "🔗"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{EVENT_TYPE_LABELS[log.eventType || ""] || log.eventType}</span>
                      {log.bookingRef && <Badge className="bg-blue-100 text-blue-700 text-xs">{log.bookingRef}</Badge>}
                      <span className="text-xs text-gray-400">{log.channelName}</span>
                    </div>
                    {log.payload?.guest && <p className="text-xs text-gray-500 mt-0.5">Гість: {log.payload.guest}{log.payload.checkIn ? ` · ${log.payload.checkIn} → ${log.payload.checkOut}` : ""}{log.payload.amount ? ` · ${log.payload.amount} ${log.payload.currency || ""}` : ""}</p>}
                    {log.errorMessage && <p className="text-xs text-red-500 mt-0.5">{log.errorMessage}</p>}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(log.receivedAt).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── MAPPINGS ── */}
        {tab === "mappings" && (
          <div>
            <p className="text-sm text-gray-500 mb-3">Відповідність внутрішніх номерів до кімнат у зовнішніх каналах</p>
            <div className="space-y-2">
              {mappings.map(m => {
                const meta = channelMeta[m.channelType] || {};
                return (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100">
                    <span className="text-lg">{meta.logo || "🔗"}</span>
                    <div className="flex-1 grid grid-cols-3 gap-2 text-sm">
                      <div><p className="text-xs text-gray-400">Наш номер</p><p className="font-medium">{m.unitName}</p></div>
                      <div><p className="text-xs text-gray-400">{m.channelName}</p><p className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded inline-block">{m.extRoomId}</p><p className="text-xs text-gray-500 mt-0.5">{m.extRoomName}</p></div>
                      <div><p className="text-xs text-gray-400">Надбавка</p><p className={`font-medium ${parseFloat(m.markupPercent) > 0 ? "text-orange-600" : "text-gray-600"}`}>{parseFloat(m.markupPercent) > 0 ? `+${m.markupPercent}%` : "0%"}</p></div>
                    </div>
                    <Badge className={m.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>{m.isActive ? "Активний" : "Вимкнено"}</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <NewChannelDialog open={showNew} onClose={() => setShowNew(false)} onSave={async (data: any) => {
        const r = await apiFetch("/channels", { method: "POST", body: JSON.stringify(data) });
        if (r.ok) { toast({ title: "Канал додано" }); setShowNew(false); loadChannels(); loadStats(); }
        else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
      }} />
    </AppLayout>
  );
}

function NewChannelDialog({ open, onClose, onSave }: any) {
  const [form, setForm] = useState({ channel: "", displayName: "", apiKey: "", propertyIdExt: "" });
  const f = (k: string) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const handleSubmit = async () => { if (!form.channel || !form.displayName) return; await onSave(form); setForm({ channel: "", displayName: "", apiKey: "", propertyIdExt: "" }); };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Globe className="h-5 w-5 text-violet-600" />Новий OTA канал</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Платформа *</Label>
            <Select value={form.channel} onValueChange={v => { const opt = CHANNEL_OPTIONS.find(o => o.value === v); f("channel")(v); if (opt && !form.displayName) f("displayName")(`${opt.logo} ${opt.label}`); }}>
              <SelectTrigger><SelectValue placeholder="Оберіть платформу" /></SelectTrigger>
              <SelectContent>{CHANNEL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.logo} {o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Назва *</Label><Input value={form.displayName} onChange={e => f("displayName")(e.target.value)} /></div>
          <div><Label>API ключ / токен</Label><Input value={form.apiKey} onChange={e => f("apiKey")(e.target.value)} placeholder="Залиште пустим якщо немає" /></div>
          <div><Label>Property ID (у платформі)</Label><Input value={form.propertyIdExt} onChange={e => f("propertyIdExt")(e.target.value)} placeholder="12345678" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button className="bg-violet-600 hover:bg-violet-700" onClick={handleSubmit} disabled={!form.channel || !form.displayName}>Підключити</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
