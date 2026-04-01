import { useState } from "react";
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
          <p className="text-muted-foreground mt-1">OTA канали, Webhook та журнал подій</p>
        </div>

        <Tabs defaultValue="ota">
          <TabsList>
            <TabsTrigger value="ota" className="gap-2"><Globe className="w-4 h-4" /> OTA Канали</TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-2"><Webhook className="w-4 h-4" /> Webhooks</TabsTrigger>
            <TabsTrigger value="logs" className="gap-2"><Info className="w-4 h-4" /> Журнал</TabsTrigger>
          </TabsList>

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
