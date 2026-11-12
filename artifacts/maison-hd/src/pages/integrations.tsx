import { useState, useEffect } from "react";
import {
  useListOtaChannels,
  useCreateOtaChannel,
  useUpdateOtaChannel,
  useDeleteOtaChannel,
  useSyncOtaChannel,
  useToggleOtaChannelSync,
  useListWebhookEndpoints,
  useCreateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useListIntegrationLogs,
  getListOtaChannelsQueryKey,
  getListWebhookEndpointsQueryKey,
  getListIntegrationLogsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Plus,
  Loader2,
  RefreshCw,
  Trash2,
  Globe,
  Webhook,
  CheckCircle2,
  XCircle,
  Clock,
  Link,
  Settings,
  Power,
  AlertCircle,
  Info,
  UtensilsCrossed,
  Zap,
  TrendingUp,
  ShoppingBag,
  Unplug,
  PlugZap,
  BarChart3,
} from "lucide-react";

import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import PosterOrderBridge from "@/components/poster-order-bridge";
import PosterPosNotifications from "@/components/poster-pos-notifications";

const OTA_CHANNEL_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  booking: { label: "Booking.com", color: "text-blue-700", bg: "bg-blue-100" },
  expedia: { label: "Expedia", color: "text-amber-700", bg: "bg-amber-100" },
  airbnb: { label: "Airbnb", color: "text-rose-700", bg: "bg-rose-100" },
  agoda: { label: "Agoda", color: "text-orange-700", bg: "bg-orange-100" },
  direct: { label: "Прямий", color: "text-emerald-700", bg: "bg-emerald-100" },
  other: { label: "Інше", color: "text-gray-700", bg: "bg-gray-100" },
};

const WEBHOOK_EVENTS = [
  { value: "reservation_created", label: "Бронювання створено" },
  { value: "reservation_cancelled", label: "Бронювання скасовано" },
  { value: "checkin", label: "Заселення" },
  { value: "checkout", label: "Виселення" },
  { value: "payment_received", label: "Оплата отримана" },
  { value: "night_audit", label: "Нічний аудит" },
];

const LOG_STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  error: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-700",
};

const LOG_TYPE_LABELS: Record<string, string> = {
  ota_sync: "OTA Синхр.",
  ota_toggle: "Перемикач",
  webhook_created: "Webhook",
  webhook_delivery: "Доставка",
};

function AddOtaDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState("booking");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [commissionRate, setCommissionRate] = useState("15");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateOtaChannel();

  const handleSubmit = () => {
    if (!name) return;
    createMutation.mutate(
      { data: { name, channelType, apiKey: apiKey || undefined, apiSecret: apiSecret || undefined, commissionRate: parseFloat(commissionRate) || 15 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOtaChannelsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListIntegrationLogsQueryKey() });
          toast({ title: "OTA канал додано" });
          onClose();
        },
        onError: () => toast({ title: "Помилка", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Додати OTA канал</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Назва канала</Label>
            <Input placeholder="Booking.com Основний" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Платформа</Label>
            <Select value={channelType} onValueChange={setChannelType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(OTA_CHANNEL_TYPES).map(([val, { label }]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input placeholder="••••••••" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>API Secret</Label>
              <Input placeholder="••••••••" type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Комісія (%)</Label>
            <Input type="number" min="0" max="100" step="0.5" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending || !name}>
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Додати
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddWebhookDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["reservation_created", "checkin", "checkout"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateWebhookEndpoint();

  const toggleEvent = (e: string) =>
    setSelectedEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);

  const handleSubmit = () => {
    if (!name || !url) return;
    createMutation.mutate(
      { data: { name, url, secret: secret || undefined, events: selectedEvents } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWebhookEndpointsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListIntegrationLogsQueryKey() });
          toast({ title: "Webhook додано" });
          onClose();
        },
        onError: () => toast({ title: "Помилка", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Додати Webhook</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Назва</Label>
            <Input placeholder="CRM Webhook" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>URL</Label>
            <Input placeholder="https://example.com/webhook" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Секрет (для підпису)</Label>
            <Input placeholder="••••••••" type="password" value={secret} onChange={e => setSecret(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Події</Label>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map(e => (
                <button
                  key={e.value}
                  onClick={() => toggleEvent(e.value)}
                  className={`text-xs px-3 py-2 rounded-lg border transition-colors text-left ${
                    selectedEvents.includes(e.value)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending || !name || !url}>
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Додати
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const BASE = (import.meta.env.BASE_URL || "").replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const authFetch = (path: string, opts: RequestInit = {}) => {
  const token = localStorage.getItem("hms_token") || "";
  return fetch(API + path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
};

function PosterTab() {
  const { toast } = useToast();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [revenue, setRevenue] = useState<any>(null);
  const [posterError, setPosterError] = useState<string | null>(null);

  const posterRequest = async (path: string, opts: RequestInit = {}) => {
    const r = await authFetch(path, opts);
    const data = await r.json();
    if (!r.ok || data.ok === false) throw new Error(data.error || data.syncError || "Не вдалося виконати запит до Poster.");
    return data;
  };

  const loadStatus = async () => {
    setLoading(true);
    try {
      const d = await posterRequest("/poster/status");
      setStatus(d);
      if (d.connected) await loadRevenue();
      else setRevenue(null);
    } catch (e: any) { setPosterError(e.message || "Не вдалося завантажити стан підключення."); }
    setLoading(false);
  };

  const loadRevenue = async () => {
    try {
      const d = await posterRequest("/poster/revenue");
      setRevenue(d.source === "live" ? d : null);
    } catch (e: any) { setPosterError(e.message || "Не вдалося завантажити звіт."); }
  };

  useEffect(() => { loadStatus(); }, []);

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true);
    setPosterError(null);
    try {
      const d = await posterRequest("/poster/connect", { method: "POST", body: JSON.stringify({ apiKey: apiKey.trim(), accountId: accountId.trim() || undefined }) });
      if (d.ok) {
        toast({ title: d.verified ? "Poster підключено та перевірено" : "Токен збережено, доступ ще не перевірено" });
        setApiKey(""); setAccountId("");
        await loadStatus();
        await handleSync();
      } else toast({ title: "Помилка підключення", description: d.error, variant: "destructive" });
    } catch (e: any) {
      setPosterError(e.message);
      toast({ title: "Помилка підключення", description: e.message, variant: "destructive" });
    }
    setConnecting(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    setPosterError(null);
    try {
      const d = await posterRequest("/poster/sync", { method: "POST", body: JSON.stringify({}) });
      if (d.source !== "live") throw new Error(d.syncError || "Сервер не повернув підтверджені дані Poster.");
      setRevenue(d);
      setStatus((previous: any) => ({ ...previous, connected: true, verified: true, lastSync: d.lastSync }));
      toast({ title: "Дані синхронізовано з Poster" });
    } catch (e: any) {
      setPosterError(e.message);
      toast({ title: "Синхронізацію не виконано", description: e.message, variant: "destructive" });
    }
    setSyncing(false);
  };

  const handleDisconnect = async () => {
    try {
      await posterRequest("/poster/disconnect", { method: "DELETE" });
      setStatus({ connected: false }); setRevenue(null);
      setPosterError(null);
      toast({ title: "Poster відключено" });
    } catch (e: any) { setPosterError(e.message); toast({ title: "Помилка", description: e.message, variant: "destructive" }); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      {posterError && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{posterError}</p>
          <p className="mt-1 text-xs">{revenue ? "Показано останній успішно отриманий звіт. Він може бути застарілим." : "Підтверджених показників немає. Демонстраційні суми не відображаються."}</p>
        </div>
      )}
      {/* Status / Connect card */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-100">
                <UtensilsCrossed className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <CardTitle>Poster POS</CardTitle>
                <CardDescription>Синхронізація виручки ресторану та рахунків на номер</CardDescription>
              </div>
            </div>
            {status?.connected ? (
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 text-sm font-medium ${status.verified ? "text-emerald-600" : "text-amber-600"}`}>
                  <CheckCircle2 className="w-4 h-4" /> {status.verified ? "Доступ перевірено" : "Токен збережено"}
                </span>
                <Button size="sm" variant="outline" onClick={handleDisconnect} className="gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200">
                  <Unplug className="w-3.5 h-3.5" /> Відключити
                </Button>
              </div>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <XCircle className="w-4 h-4" /> Не підключено
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {status?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {status.lastSync ? (
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Остання синхронізація: {format(new Date(status.lastSync), "d MMM, HH:mm", { locale: uk })}
                    </span>
                  ) : <span>Синхронізацію ще не виконано</span>}
                </div>
                <Button size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
                  {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Синхронізувати
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-orange-50 border border-orange-100 text-sm text-orange-700">
                <p className="font-medium mb-1">Як підключити Poster POS?</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Відкрийте Poster → Налаштування → Доступ до API</li>
                  <li>Скопіюйте токен доступу (Access Token)</li>
                  <li>Вставте токен нижче та натисніть «Підключити»</li>
                </ol>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Токен доступу Poster</Label>
                  <Input
                    type="password"
                    placeholder="218012abc123..."
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Назва аккаунту (опційно)</Label>
                  <Input
                    placeholder="ДОГОДА Ресторан"
                    value={accountId}
                    onChange={e => setAccountId(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleConnect} disabled={connecting || !apiKey.trim()} className="gap-2">
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
                  Підключити Poster
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!revenue && status?.connected && !posterError && (
        <p className="text-sm text-muted-foreground">Звіт ще не отримано. Натисніть «Синхронізувати», щоб завантажити фактичні показники Poster.</p>
      )}

      {status?.connected && <PosterPosNotifications request={posterRequest} />}
      {status?.connected && <PosterOrderBridge request={posterRequest} />}

      {/* Revenue Preview */}
      {revenue?.source === "live" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Виручка (30 днів)", value: `${(revenue.totalRevenue || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Транзакцій", value: (revenue.totalTransactions || 0).toLocaleString("uk-UA"), icon: ShoppingBag, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Середній чек", value: `${(revenue.avgCheck || 0).toLocaleString("uk-UA")} ₴`, icon: BarChart3, color: "text-violet-600", bg: "bg-violet-50" },
            ].map(item => (
              <Card key={item.label} className="shadow-sm">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${item.bg}`}>
                      <item.icon className={`w-4 h-4 ${item.color}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{item.value}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Daily revenue mini-chart */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Щоденна виручка ресторану</CardTitle>
              <CardDescription>{revenue.dateFrom} — {revenue.dateTo} · З Poster POS</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-28">
                {(revenue.dailyRevenue || []).slice(-30).map((d: any, i: number) => {
                  const max = Math.max(...(revenue.dailyRevenue || []).map((x: any) => x.revenue));
                  const pct = max > 0 ? (d.revenue / max) * 100 : 0;
                  const isWeekend = new Date(d.date).getDay() === 0 || new Date(d.date).getDay() === 6;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                        {d.date}: {Math.round(d.revenue).toLocaleString("uk-UA")} ₴
                      </div>
                      <div
                        className={`w-full rounded-t transition-all ${isWeekend ? "bg-orange-400" : "bg-orange-200"} hover:bg-orange-500`}
                        style={{ height: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>30 дн. тому</span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-2 rounded bg-orange-400 inline-block" /> вих.
                  <span className="w-3 h-2 rounded bg-orange-200 inline-block" /> буд.
                </span>
                <span>Сьогодні</span>
              </div>
            </CardContent>
          </Card>

          {/* Room charge feature */}
          <Card className="shadow-sm border-dashed">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-lg bg-violet-100 flex-shrink-0">
                  <ShoppingBag className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Рахунок на номер</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Гість може замовити страви у ресторані — рахунок автоматично додасться до бронювання.
                    Доступно через Poster касу або планшет у номері.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full">Poster Waiter app</span>
                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full">Room Service</span>
                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full">Мінібар</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAddOta, setShowAddOta] = useState(false);
  const [showAddWebhook, setShowAddWebhook] = useState(false);

  const { data: otaChannels, isLoading: otaLoading } = useListOtaChannels();
  const { data: webhooks, isLoading: webhooksLoading } = useListWebhookEndpoints();
  const { data: integrationLogs, isLoading: logsLoading } = useListIntegrationLogs({ limit: 50 });

  const deleteOtaMutation = useDeleteOtaChannel();
  const syncOtaMutation = useSyncOtaChannel();
  const toggleSyncMutation = useToggleOtaChannelSync();
  const deleteWebhookMutation = useDeleteWebhookEndpoint();

  const handleDeleteOta = (id: number) => {
    deleteOtaMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOtaChannelsQueryKey() });
        toast({ title: "Канал видалено" });
      },
    });
  };

  const handleSyncOta = (id: number) => {
    syncOtaMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOtaChannelsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListIntegrationLogsQueryKey() });
        toast({ title: "Синхронізацію ініційовано" });
      },
    });
  };

  const handleToggleSync = (id: number) => {
    toggleSyncMutation.mutate({ id }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListOtaChannelsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListIntegrationLogsQueryKey() });
        toast({ title: data.syncEnabled ? "Синхронізацію увімкнено" : "Синхронізацію вимкнено" });
      },
    });
  };

  const handleDeleteWebhook = (id: number) => {
    deleteWebhookMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWebhookEndpointsQueryKey() });
        toast({ title: "Webhook видалено" });
      },
    });
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Інтеграції</h1>
          <p className="text-muted-foreground mt-1">Poster POS, OTA канали, Webhook та журнал подій</p>
        </div>

        <Tabs defaultValue="poster">
          <TabsList>
            <TabsTrigger value="poster" className="gap-2"><UtensilsCrossed className="w-4 h-4" /> Poster POS</TabsTrigger>
            <TabsTrigger value="ota" className="gap-2"><Globe className="w-4 h-4" /> OTA Канали</TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-2"><Webhook className="w-4 h-4" /> Webhooks</TabsTrigger>
            <TabsTrigger value="logs" className="gap-2"><Info className="w-4 h-4" /> Журнал</TabsTrigger>
          </TabsList>

          {/* ── POSTER POS TAB ────────────────────────────── */}
          <TabsContent value="poster" className="mt-4">
            <PosterTab />
          </TabsContent>

          {/* ── OTA CHANNELS TAB ──────────────────────────── */}
          <TabsContent value="ota" className="mt-4">
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>OTA Канали</CardTitle>
                    <CardDescription>Booking.com, Expedia та інші платформи</CardDescription>
                  </div>
                  <Button onClick={() => setShowAddOta(true)} className="gap-2">
                    <Plus className="w-4 h-4" /> Додати канал
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {otaLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (otaChannels || []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">OTA канали не налаштовано</p>
                    <p className="text-xs mt-1">Додайте Booking.com або Expedia</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(otaChannels || []).map(channel => {
                      const meta = OTA_CHANNEL_TYPES[channel.channelType] || OTA_CHANNEL_TYPES.other;
                      return (
                        <div key={channel.id} className="flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-muted/20 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className={`p-2.5 rounded-lg ${meta.bg}`}>
                              <Globe className={`w-5 h-5 ${meta.color}`} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold">{channel.name}</p>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.bg} ${meta.color}`}>{meta.label}</span>
                                {channel.isActive ? (
                                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Активний
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-xs text-gray-500">
                                    <XCircle className="w-3.5 h-3.5" /> Вимкнено
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                                <span>Комісія: {channel.commissionRate}%</span>
                                <span>·</span>
                                <span>Бронювань: {channel.totalBookings}</span>
                                {channel.lastSync && (
                                  <>
                                    <span>·</span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {format(new Date(channel.lastSync), "d MMM HH:mm", { locale: uk })}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Синхр.</span>
                              <Switch
                                checked={channel.syncEnabled}
                                onCheckedChange={() => handleToggleSync(channel.id)}
                                disabled={toggleSyncMutation.isPending}
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSyncOta(channel.id)}
                              disabled={syncOtaMutation.isPending || !channel.syncEnabled}
                              className="gap-1.5"
                            >
                              <RefreshCw className="w-3.5 h-3.5" /> Синхр.
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteOta(channel.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Info cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              {[
                { icon: Globe, title: "Booking.com", desc: "Синхронізуйте бронювання та ціни автоматично", color: "text-blue-600", bg: "bg-blue-50" },
                { icon: Settings, title: "VingCard / Salto", desc: "Управляйте ключами-картками для номерів", color: "text-emerald-600", bg: "bg-emerald-50" },
                { icon: Webhook, title: "API / Webhook", desc: "Підключіть свою CRM або облікову систему", color: "text-violet-600", bg: "bg-violet-50" },
              ].map(item => (
                <Card key={item.title} className="border shadow-sm">
                  <CardContent className="pt-5">
                    <div className={`inline-flex p-2.5 rounded-lg ${item.bg} mb-3`}>
                      <item.icon className={`w-5 h-5 ${item.color}`} />
                    </div>
                    <h3 className="font-semibold text-sm">{item.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── WEBHOOKS TAB ──────────────────────────────── */}
          <TabsContent value="webhooks" className="mt-4">
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Webhook Endpoints</CardTitle>
                    <CardDescription>Отримуйте події реального часу у свою систему</CardDescription>
                  </div>
                  <Button onClick={() => setShowAddWebhook(true)} className="gap-2">
                    <Plus className="w-4 h-4" /> Додати webhook
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {webhooksLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (webhooks || []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Webhook className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Webhook endpoints не налаштовано</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(webhooks || []).map(webhook => (
                      <div key={webhook.id} className="flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 rounded-lg bg-violet-100">
                            <Link className="w-5 h-5 text-violet-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">{webhook.name}</p>
                              {webhook.isActive ? (
                                <span className="flex items-center gap-1 text-xs text-emerald-600">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Активний
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                  <XCircle className="w-3.5 h-3.5" /> Вимкнено
                                </span>
                              )}
                              {webhook.failureCount > 0 && (
                                <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                                  {webhook.failureCount} помилок
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate max-w-xs">{webhook.url}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {webhook.events.slice(0, 3).map(e => (
                                <span key={e} className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
                                  {WEBHOOK_EVENTS.find(ev => ev.value === e)?.label || e}
                                </span>
                              ))}
                              {webhook.events.length > 3 && (
                                <span className="text-xs text-muted-foreground">+{webhook.events.length - 3}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteWebhook(webhook.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── LOGS TAB ──────────────────────────────────── */}
          <TabsContent value="logs" className="mt-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-primary" />
                  Журнал інтеграцій
                </CardTitle>
                <CardDescription>Останні події OTA синхронізацій та webhook доставок</CardDescription>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (integrationLogs || []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Info className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Журнал порожній</p>
                    <p className="text-xs mt-1">Події з'являться після першої синхронізації або webhook доставки</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(integrationLogs || []).map(log => (
                      <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                        <div className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${log.status === "success" ? "bg-emerald-500" : log.status === "error" ? "bg-red-500" : "bg-amber-500"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${LOG_STATUS_STYLES[log.status] || "bg-gray-100 text-gray-700"}`}>
                              {log.status === "success" ? "OK" : log.status === "error" ? "Помилка" : "Очікування"}
                            </span>
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {LOG_TYPE_LABELS[log.type] || log.type}
                            </span>
                            {log.channelId && (
                              <span className="text-xs text-muted-foreground">канал #{log.channelId}</span>
                            )}
                          </div>
                          {log.message && (
                            <p className="text-sm mt-0.5 text-foreground">{log.message}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(log.createdAt), "d MMM yyyy, HH:mm:ss", { locale: uk })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {showAddOta && <AddOtaDialog onClose={() => setShowAddOta(false)} />}
      {showAddWebhook && <AddWebhookDialog onClose={() => setShowAddWebhook(false)} />}
    </AppLayout>
  );
}
