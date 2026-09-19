import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Zap, TrendingUp, Gift, Star, Plus, RefreshCw, Edit3, Trash2,
  Send, CheckCircle2, XCircle, Clock, BarChart3, Sparkles,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/upsell";
const tok = () => localStorage.getItem("hms_token") || "";

const OFFER_TYPES: Record<string, { label: string; color: string }> = {
  upgrade:      { label: "Апгрейд номера",  color: "bg-blue-100 text-blue-700" },
  breakfast:    { label: "Сніданок",         color: "bg-yellow-100 text-yellow-700" },
  amenity:      { label: "Декор/Аменіті",    color: "bg-pink-100 text-pink-700" },
  spa:          { label: "SPA",              color: "bg-purple-100 text-purple-700" },
  transport:    { label: "Трансфер",         color: "bg-green-100 text-green-700" },
  late_checkout:{ label: "Пізній виїзд",     color: "bg-orange-100 text-orange-700" },
  other:        { label: "Інше",             color: "bg-gray-100 text-gray-700" },
};

const TRIGGER_TYPES: Record<string, string> = {
  manual:       "Ручний відправ",
  post_booking: "Після бронювання",
  pre_arrival:  "За день до приїзду",
  checkin:      "При заселенні",
  day_of_stay:  "В день проживання",
  checkout_day: "В день виїзду",
};

const STATUS_COLORS: Record<string, string> = {
  pending:  "bg-blue-50 text-blue-700",
  accepted: "bg-green-50 text-green-700",
  declined: "bg-red-50 text-red-700",
};

const EMPTY_TPL = {
  title: "", description: "", offerType: "upgrade", price: "",
  triggerType: "manual", triggerDaysBefore: 1, channel: "portal", isActive: true,
};

export default function UpsellPage() {
  const [tab, setTab] = useState("templates");
  const [templates, setTemplates] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const headers = { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" };

  // Template modal
  const [tplModal, setTplModal] = useState(false);
  const [editingTpl, setEditingTpl] = useState<any>(null);
  const [tplForm, setTplForm] = useState<any>(EMPTY_TPL);
  const [savingTpl, setSavingTpl] = useState(false);

  // Send modal
  const [sendModal, setSendModal] = useState(false);
  const [sendTemplate, setSendTemplate] = useState<any>(null);
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [tRes, oRes, sRes] = await Promise.all([
        fetch(`${API}/templates`, { headers }),
        fetch(`${API}/offers?limit=30`, { headers }),
        fetch(`${API}/stats`, { headers }),
      ]);
      const [t, o, s] = await Promise.all([tRes.json(), oRes.json(), sRes.json()]);
      setTemplates(Array.isArray(t) ? t : []);
      setOffers(Array.isArray(o) ? o : []);
      setStats(s);
    } catch { toast({ title: "Помилка завантаження", variant: "destructive" }); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingTpl(null);
    setTplForm(EMPTY_TPL);
    setTplModal(true);
  }

  function openEdit(tpl: any) {
    setEditingTpl(tpl);
    setTplForm({
      title: tpl.title, description: tpl.description || "", offerType: tpl.offerType,
      price: tpl.price || "", triggerType: tpl.triggerType, triggerDaysBefore: tpl.triggerDaysBefore,
      channel: tpl.channel, isActive: tpl.isActive,
    });
    setTplModal(true);
  }

  async function handleSaveTpl() {
    if (!tplForm.title) return;
    setSavingTpl(true);
    try {
      const url = editingTpl ? `${API}/templates/${editingTpl.id}` : `${API}/templates`;
      const method = editingTpl ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers, body: JSON.stringify(tplForm) });
      if (!res.ok) throw new Error();
      toast({ title: editingTpl ? "Оновлено" : "Шаблон створено" });
      setTplModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingTpl(false);
  }

  async function handleDeleteTpl(id: number) {
    if (!confirm("Видалити шаблон?")) return;
    try {
      await fetch(`${API}/templates/${id}`, { method: "DELETE", headers });
      toast({ title: "Шаблон видалено" });
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
  }

  async function handleSend() {
    if (!sendTemplate) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/offers/send`, {
        method: "POST", headers,
        body: JSON.stringify({ templateId: sendTemplate.id }),
      });
      if (!res.ok) throw new Error();
      toast({ title: `Оффер "${sendTemplate.title}" відправлено` });
      setSendModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSending(false);
  }

  async function handleRespond(offerId: number, action: "accept" | "decline") {
    try {
      await fetch(`${API}/offers/${offerId}/respond`, {
        method: "POST", headers, body: JSON.stringify({ action }),
      });
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
  }

  const acceptanceRate = stats?.acceptanceRate || 0;
  const rateColor = acceptanceRate >= 40 ? "text-green-600" : acceptanceRate >= 20 ? "text-yellow-600" : "text-red-500";

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Upsell Engine</h1>
            <p className="text-muted-foreground text-sm">Пропозиції та допродажі для гостей</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw size={14} className="mr-1" /> Оновити</Button>
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1" /> Новий шаблон</Button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-3 flex items-center gap-3">
                <Zap className="text-blue-500 shrink-0" size={20} />
                <div>
                  <p className="text-xs text-muted-foreground">Відправлено</p>
                  <p className="text-xl font-bold">{stats.total}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-3">
                <CheckCircle2 className="text-green-500 shrink-0" size={20} />
                <div>
                  <p className="text-xs text-muted-foreground">Прийнято</p>
                  <p className="text-xl font-bold">{stats.accepted}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-3">
                <XCircle className="text-red-400 shrink-0" size={20} />
                <div>
                  <p className="text-xs text-muted-foreground">Відхилено</p>
                  <p className="text-xl font-bold">{stats.declined}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-3">
                <BarChart3 className="text-indigo-500 shrink-0" size={20} />
                <div>
                  <p className="text-xs text-muted-foreground">Конверсія</p>
                  <p className={`text-xl font-bold ${rateColor}`}>{acceptanceRate}%</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-3">
                <TrendingUp className="text-emerald-500 shrink-0" size={20} />
                <div>
                  <p className="text-xs text-muted-foreground">Дохід, грн</p>
                  <p className="text-xl font-bold">{parseFloat(stats.revenueGenerated || 0).toLocaleString("uk-UA", { maximumFractionDigits: 0 })}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="templates">Шаблони офферів</TabsTrigger>
            <TabsTrigger value="offers">Активні пропозиції</TabsTrigger>
          </TabsList>

          {/* ── Templates tab ── */}
          <TabsContent value="templates" className="mt-4">
            {loading ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground">Завантаження...</div>
            ) : templates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Gift size={40} className="opacity-30" />
                  <p>Немає шаблонів офферів</p>
                  <Button onClick={openCreate}><Plus size={14} className="mr-1" /> Створити перший</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {templates.map(tpl => {
                  const typeInfo = OFFER_TYPES[tpl.offerType] || OFFER_TYPES.other;
                  const convRate = tpl.timesShown > 0 ? Math.round((tpl.timesAccepted / tpl.timesShown) * 100) : 0;
                  return (
                    <Card key={tpl.id} className={`relative ${!tpl.isActive ? "opacity-60" : ""}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm truncate">{tpl.title}</CardTitle>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tpl.description}</p>
                          </div>
                          {!tpl.isActive && <Badge variant="outline" className="text-xs shrink-0">Вимкнено</Badge>}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Badge className={`text-xs ${typeInfo.color}`}>{typeInfo.label}</Badge>
                          <Badge variant="outline" className="text-xs">
                            {TRIGGER_TYPES[tpl.triggerType] || tpl.triggerType}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-bold text-lg">
                            {tpl.price ? `${parseFloat(tpl.price).toLocaleString("uk-UA")} грн` : "Безкоштовно"}
                          </span>
                          <div className="text-right text-xs text-muted-foreground">
                            <div>Показів: {tpl.timesShown}</div>
                            <div className={convRate >= 30 ? "text-green-600" : "text-muted-foreground"}>
                              Конв: {convRate}%
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm" className="flex-1 text-xs"
                            onClick={() => { setSendTemplate(tpl); setSendModal(true); }}
                          >
                            <Send size={11} className="mr-1" /> Відправити
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEdit(tpl)}>
                            <Edit3 size={13} />
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-500" onClick={() => handleDeleteTpl(tpl.id)}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Offers tab ── */}
          <TabsContent value="offers" className="mt-4">
            {offers.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Sparkles size={40} className="opacity-30" />
                  <p>Немає відправлених пропозицій</p>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Назва</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead className="text-right">Ціна</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead>Дії</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offers.map(offer => {
                      const typeInfo = OFFER_TYPES[offer.offerType] || OFFER_TYPES.other;
                      return (
                        <TableRow key={offer.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{offer.title}</div>
                            {offer.description && <div className="text-xs text-muted-foreground truncate max-w-xs">{offer.description}</div>}
                          </TableCell>
                          <TableCell><Badge className={`text-xs ${typeInfo.color}`}>{typeInfo.label}</Badge></TableCell>
                          <TableCell className="text-right font-mono">
                            {offer.price ? `${parseFloat(offer.price).toLocaleString("uk-UA")} грн` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${STATUS_COLORS[offer.status] || ""}`}>
                              {offer.status === "pending" ? "Очікує" : offer.status === "accepted" ? "Прийнято" : "Відхилено"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {offer.createdAt ? new Date(offer.createdAt).toLocaleDateString("uk-UA") : "—"}
                          </TableCell>
                          <TableCell>
                            {offer.status === "pending" && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" className="text-green-600 text-xs h-7"
                                  onClick={() => handleRespond(offer.id, "accept")}>
                                  <CheckCircle2 size={12} className="mr-1" /> Прийняти
                                </Button>
                                <Button size="sm" variant="outline" className="text-red-500 text-xs h-7"
                                  onClick={() => handleRespond(offer.id, "decline")}>
                                  <XCircle size={12} className="mr-1" /> Відхилити
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Create/Edit template modal ── */}
      <Dialog open={tplModal} onOpenChange={setTplModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTpl ? "Редагувати шаблон" : "Новий шаблон оффера"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label>Назва *</Label>
              <Input placeholder="напр. Апгрейд номера" value={tplForm.title} onChange={e => setTplForm({ ...tplForm, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Опис</Label>
              <Textarea placeholder="Деталі пропозиції для гостя..." value={tplForm.description} onChange={e => setTplForm({ ...tplForm, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Тип офферу</Label>
                <Select value={tplForm.offerType} onValueChange={v => setTplForm({ ...tplForm, offerType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(OFFER_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ціна (грн)</Label>
                <Input type="number" placeholder="0" value={tplForm.price} onChange={e => setTplForm({ ...tplForm, price: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Тригер відправки</Label>
              <Select value={tplForm.triggerType} onValueChange={v => setTplForm({ ...tplForm, triggerType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Активний</Label>
              <Switch checked={tplForm.isActive} onCheckedChange={v => setTplForm({ ...tplForm, isActive: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTplModal(false)}>Скасувати</Button>
            <Button onClick={handleSaveTpl} disabled={savingTpl || !tplForm.title}>
              {savingTpl ? "Зберігаємо..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Send offer modal ── */}
      <Dialog open={sendModal} onOpenChange={setSendModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Відправити пропозицію</DialogTitle>
          </DialogHeader>
          {sendTemplate && (
            <div className="py-2 space-y-3">
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="font-semibold">{sendTemplate.title}</p>
                {sendTemplate.description && <p className="text-sm text-muted-foreground mt-1">{sendTemplate.description}</p>}
                {sendTemplate.price && (
                  <p className="text-lg font-bold mt-2">
                    {parseFloat(sendTemplate.price).toLocaleString("uk-UA")} грн
                  </p>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Пропозиція буде відправлена у гостьовий портал. Ви зможете відстежити відповідь гостя у вкладці «Активні пропозиції».
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendModal(false)}>Скасувати</Button>
            <Button onClick={handleSend} disabled={sending}>
              <Send size={14} className="mr-1" /> {sending ? "Відправляємо..." : "Відправити"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
