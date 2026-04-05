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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  TrendingUp, TrendingDown, Minus, Building2, Plus, RefreshCw,
  Edit3, Trash2, ExternalLink, Star, Activity, BarChart3, AlertTriangle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";
import { uk } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/rate-intel";
const tok = () => localStorage.getItem("hms_token") || "";

function PositionBadge({ position }: { position: string }) {
  if (position === "above") return (
    <Badge className="bg-red-100 text-red-700 gap-1"><TrendingUp size={11} /> Вище ринку</Badge>
  );
  if (position === "parity") return (
    <Badge className="bg-blue-100 text-blue-700 gap-1"><Minus size={11} /> Паритет</Badge>
  );
  if (position === "below") return (
    <Badge className="bg-green-100 text-green-700 gap-1"><TrendingDown size={11} /> Нижче ринку</Badge>
  );
  return <Badge variant="outline">Немає даних</Badge>;
}

function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={10} className={i < stars ? "fill-yellow-400 text-yellow-400" : "text-gray-200"} />
      ))}
    </div>
  );
}

const EMPTY_COMP = { name: "", websiteUrl: "", starRating: 3, roomType: "Стандарт", notes: "" };
const EMPTY_RATE = { competitorId: "", checkDate: format(new Date(), "yyyy-MM-dd"), price: "", notes: "" };

export default function RateIntelligencePage() {
  const [tab, setTab] = useState("dashboard");
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [compRates, setCompRates] = useState<any[]>([]);
  const [ourRates, setOurRates] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const headers = { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" };

  // Date range: today + 13 days
  const from = format(new Date(), "yyyy-MM-dd");
  const to = format(addDays(new Date(), 13), "yyyy-MM-dd");

  // Competitor modal
  const [compModal, setCompModal] = useState(false);
  const [editComp, setEditComp] = useState<any>(null);
  const [compForm, setCompForm] = useState<any>(EMPTY_COMP);
  const [savingComp, setSavingComp] = useState(false);

  // Rate entry modal
  const [rateModal, setRateModal] = useState(false);
  const [rateForm, setRateForm] = useState<any>(EMPTY_RATE);
  const [savingRate, setSavingRate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [cRes, crRes, orRes, dRes] = await Promise.all([
        fetch(`${API}/competitors`, { headers }),
        fetch(`${API}/competitor-rates?from=${from}&to=${to}`, { headers }),
        fetch(`${API}/our-rates?from=${from}&to=${to}`, { headers }),
        fetch(`${API}/dashboard?from=${from}&to=${to}`, { headers }),
      ]);
      const [c, cr, or_, d] = await Promise.all([cRes.json(), crRes.json(), orRes.json(), dRes.json()]);
      setCompetitors(Array.isArray(c) ? c : []);
      setCompRates(Array.isArray(cr) ? cr : []);
      setOurRates(Array.isArray(or_) ? or_ : []);
      setDashboard(d);
    } catch { toast({ title: "Помилка завантаження", variant: "destructive" }); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSaveComp() {
    if (!compForm.name) return;
    setSavingComp(true);
    try {
      const url = editComp ? `${API}/competitors/${editComp.id}` : `${API}/competitors`;
      const method = editComp ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers, body: JSON.stringify(compForm) });
      if (!res.ok) throw new Error();
      toast({ title: editComp ? "Конкурента оновлено" : "Конкурента додано" });
      setCompModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingComp(false);
  }

  async function handleDeleteComp(id: number) {
    if (!confirm("Видалити конкурента?")) return;
    try {
      await fetch(`${API}/competitors/${id}`, { method: "DELETE", headers });
      toast({ title: "Конкурента видалено" });
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
  }

  async function handleSaveRate() {
    if (!rateForm.competitorId || !rateForm.price) return;
    setSavingRate(true);
    try {
      const res = await fetch(`${API}/competitor-rates`, {
        method: "POST", headers, body: JSON.stringify(rateForm),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Тариф збережено" });
      setRateModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingRate(false);
  }

  // Group competitor rates by date for comparison table
  const dates = Array.from({ length: 7 }, (_, i) => format(addDays(new Date(), i), "yyyy-MM-dd"));
  const ourRateByDate = Object.fromEntries(ourRates.map(r => [r.snapDate, r]));
  const compRateByCompDate: Record<string, Record<string, number>> = {};
  compRates.forEach(cr => {
    if (!compRateByCompDate[cr.competitorId]) compRateByCompDate[cr.competitorId] = {};
    compRateByCompDate[cr.competitorId][cr.checkDate] = parseFloat(cr.price);
  });

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Rate Intelligence</h1>
            <p className="text-muted-foreground text-sm">Моніторинг тарифів конкурентів та позиціонування</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw size={14} className="mr-1" /> Оновити</Button>
            <Button variant="outline" size="sm" onClick={() => { setRateModal(true); setRateForm(EMPTY_RATE); }}>
              <Plus size={14} className="mr-1" /> Внести тариф
            </Button>
            <Button size="sm" onClick={() => { setEditComp(null); setCompForm(EMPTY_COMP); setCompModal(true); }}>
              <Building2 size={14} className="mr-1" /> Додати конкурента
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        {dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-2 border-blue-100">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Наш середній тариф</p>
                <p className="text-2xl font-bold text-blue-700">{dashboard.avgOurPrice?.toLocaleString("uk-UA")} грн</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Середній по ринку</p>
                <p className="text-2xl font-bold">{dashboard.avgCompPrice?.toLocaleString("uk-UA")} грн</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Розрив з ринком</p>
                <p className={`text-2xl font-bold ${dashboard.priceGap > 0 ? "text-red-500" : "text-green-600"}`}>
                  {dashboard.priceGap > 0 ? "+" : ""}{dashboard.priceGap?.toLocaleString("uk-UA")} грн
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Позиція</p>
                <PositionBadge position={dashboard.position} />
                <p className="text-xs text-muted-foreground mt-1">{dashboard.competitorCount} конкурентів</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Порівняння тарифів</TabsTrigger>
            <TabsTrigger value="competitors">Конкуренти</TabsTrigger>
            <TabsTrigger value="history">Журнал тарифів</TabsTrigger>
          </TabsList>

          {/* ── Rate comparison grid ── */}
          <TabsContent value="dashboard" className="mt-4">
            {loading ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground">Завантаження...</div>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Готель</TableHead>
                      {dates.map(d => (
                        <TableHead key={d} className="text-center min-w-[100px]">
                          <div>{format(new Date(d + "T00:00:00"), "EEE", { locale: uk })}</div>
                          <div className="font-bold">{format(new Date(d + "T00:00:00"), "d MMM", { locale: uk })}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Our rates row */}
                    <TableRow className="bg-blue-50/50">
                      <TableCell>
                        <div className="font-bold text-blue-700">Наш готель</div>
                        <div className="text-xs text-muted-foreground">Базова ставка</div>
                      </TableCell>
                      {dates.map(d => {
                        const r = ourRateByDate[d];
                        return (
                          <TableCell key={d} className="text-center">
                            {r ? (
                              <div>
                                <div className="font-bold text-blue-700">{parseFloat(r.ourPrice).toLocaleString("uk-UA")}</div>
                                {r.occupancyPct && <div className="text-xs text-muted-foreground">{r.occupancyPct}%</div>}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>

                    {/* Competitor rows */}
                    {competitors.map(comp => {
                      const compData = compRateByCompDate[comp.id] || {};
                      return (
                        <TableRow key={comp.id}>
                          <TableCell>
                            <div className="font-medium">{comp.name}</div>
                            <StarRating stars={comp.starRating || 3} />
                            {comp.websiteUrl && (
                              <a href={comp.websiteUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5">
                                Сайт <ExternalLink size={9} />
                              </a>
                            )}
                          </TableCell>
                          {dates.map(d => {
                            const price = compData[d];
                            const ourPrice = ourRateByDate[d] ? parseFloat(ourRateByDate[d].ourPrice) : null;
                            const diff = ourPrice && price ? ourPrice - price : null;
                            return (
                              <TableCell key={d} className="text-center">
                                {price ? (
                                  <div>
                                    <div className="font-medium">{price.toLocaleString("uk-UA")}</div>
                                    {diff !== null && (
                                      <div className={`text-xs ${diff > 0 ? "text-red-500" : diff < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                                        {diff > 0 ? "+" : ""}{diff.toLocaleString("uk-UA")}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {dashboard && dashboard.position === "above" && (
              <Card className="mt-3 border-orange-200 bg-orange-50">
                <CardContent className="p-3 flex items-start gap-2">
                  <AlertTriangle size={16} className="text-orange-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-orange-700">
                    Ваш тариф вищий за ринок на <strong>{Math.abs(dashboard.priceGap).toLocaleString("uk-UA")} грн</strong>.
                    Розгляньте можливість коригування цін для підвищення конкурентоспроможності.
                  </p>
                </CardContent>
              </Card>
            )}
            {dashboard && dashboard.position === "below" && (
              <Card className="mt-3 border-blue-200 bg-blue-50">
                <CardContent className="p-3 flex items-start gap-2">
                  <TrendingUp size={16} className="text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-blue-700">
                    Ваш тариф нижчий за ринок на <strong>{Math.abs(dashboard.priceGap).toLocaleString("uk-UA")} грн</strong>.
                    Є можливість підвищити ціну без ризику втрати клієнтів.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Competitors management ── */}
          <TabsContent value="competitors" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {competitors.map(comp => (
                <Card key={comp.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm">{comp.name}</CardTitle>
                        <StarRating stars={comp.starRating || 3} />
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditComp(comp);
                          setCompForm({ name: comp.name, websiteUrl: comp.websiteUrl || "", starRating: comp.starRating || 3, roomType: comp.roomType || "", notes: comp.notes || "" });
                          setCompModal(true);
                        }}><Edit3 size={13} /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDeleteComp(comp.id)}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm space-y-1">
                    {comp.roomType && <p className="text-muted-foreground">Тип: {comp.roomType}</p>}
                    {comp.websiteUrl && (
                      <a href={comp.websiteUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-500 hover:underline">
                        <ExternalLink size={12} /> {comp.websiteUrl}
                      </a>
                    )}
                    {comp.notes && <p className="text-muted-foreground text-xs">{comp.notes}</p>}
                    <p className="text-xs text-muted-foreground pt-1">
                      Даних тарифів: {compRates.filter(r => r.competitorId === comp.id).length}
                    </p>
                  </CardContent>
                </Card>
              ))}
              <Card className="border-dashed cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => { setEditComp(null); setCompForm(EMPTY_COMP); setCompModal(true); }}>
                <CardContent className="flex flex-col items-center justify-center h-full min-h-[120px] text-muted-foreground gap-2">
                  <Plus size={24} className="opacity-40" />
                  <p className="text-sm">Додати конкурента</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Rate history ── */}
          <TabsContent value="history" className="mt-4">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Конкурент</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead className="text-right">Тариф</TableHead>
                    <TableHead>Нотатки</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compRates.slice(0, 50).map(rate => (
                    <TableRow key={rate.id}>
                      <TableCell className="font-medium">{rate.competitorName}</TableCell>
                      <TableCell>{format(new Date(rate.checkDate + "T00:00:00"), "d MMM yyyy", { locale: uk })}</TableCell>
                      <TableCell className="text-right font-mono">{parseFloat(rate.price).toLocaleString("uk-UA")} грн</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{rate.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {compRates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-10">Немає даних тарифів</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Add/Edit competitor modal ── */}
      <Dialog open={compModal} onOpenChange={setCompModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editComp ? "Редагувати конкурента" : "Додати конкурента"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Назва *</Label>
              <Input placeholder="Назва готелю" value={compForm.name} onChange={e => setCompForm({ ...compForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Зірковість</Label>
                <Input type="number" min="1" max="5" value={compForm.starRating} onChange={e => setCompForm({ ...compForm, starRating: parseInt(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>Тип номера</Label>
                <Input placeholder="Стандарт" value={compForm.roomType} onChange={e => setCompForm({ ...compForm, roomType: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Вебсайт</Label>
              <Input placeholder="https://..." value={compForm.websiteUrl} onChange={e => setCompForm({ ...compForm, websiteUrl: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Нотатки</Label>
              <Input placeholder="Додаткова інформація..." value={compForm.notes} onChange={e => setCompForm({ ...compForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompModal(false)}>Скасувати</Button>
            <Button onClick={handleSaveComp} disabled={savingComp || !compForm.name}>
              {savingComp ? "Зберігаємо..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add rate entry modal ── */}
      <Dialog open={rateModal} onOpenChange={setRateModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Внести тариф конкурента</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Конкурент *</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={rateForm.competitorId}
                onChange={e => setRateForm({ ...rateForm, competitorId: e.target.value })}
              >
                <option value="">Оберіть конкурента</option>
                {competitors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Дата</Label>
                <Input type="date" value={rateForm.checkDate} onChange={e => setRateForm({ ...rateForm, checkDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Тариф (грн) *</Label>
                <Input type="number" placeholder="1500" value={rateForm.price} onChange={e => setRateForm({ ...rateForm, price: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Нотатки</Label>
              <Input placeholder="Джерело, канал..." value={rateForm.notes} onChange={e => setRateForm({ ...rateForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateModal(false)}>Скасувати</Button>
            <Button onClick={handleSaveRate} disabled={savingRate || !rateForm.competitorId || !rateForm.price}>
              {savingRate ? "Зберігаємо..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
