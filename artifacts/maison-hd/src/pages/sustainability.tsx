import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Leaf, Zap, Droplets, Trash2, Wind, Plus, RefreshCw,
  TrendingDown, TrendingUp, Target, CheckCircle2, Circle, Clock,
  Edit3, X, BarChart3,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/sustainability";
const tok = () => localStorage.getItem("hms_token") || "";
const headers = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

const CAT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  energy: { label: "Енергія",    icon: Zap,      color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  water:  { label: "Вода",       icon: Droplets,  color: "text-blue-600 bg-blue-50 border-blue-200" },
  waste:  { label: "Відходи",    icon: Trash2,    color: "text-red-600 bg-red-50 border-red-200" },
  co2:    { label: "Викиди CO₂", icon: Wind,      color: "text-gray-600 bg-gray-50 border-gray-200" },
  food:   { label: "Харчування", icon: Leaf,      color: "text-green-600 bg-green-50 border-green-200" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  planned:   { label: "Плановано",   icon: Circle,       className: "bg-gray-100 text-gray-600" },
  active:    { label: "Активна",     icon: Clock,        className: "bg-blue-100 text-blue-700" },
  completed: { label: "Завершена",   icon: CheckCircle2, className: "bg-green-100 text-green-700" },
  cancelled: { label: "Скасована",   icon: X,            className: "bg-red-100 text-red-600" },
};

const EMPTY_INIT = { title: "", description: "", category: "energy", status: "planned", impactScore: 3, startDate: "", estimatedSavings: "" };
const EMPTY_METRIC = { metricDate: format(new Date(), "yyyy-MM-dd"), category: "energy", metricName: "", value: "", unit: "" };

export default function SustainabilityPage() {
  const [tab, setTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [initiatives, setInitiatives] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [initModal, setInitModal] = useState(false);
  const [editInit, setEditInit] = useState<any>(null);
  const [initForm, setInitForm] = useState<any>(EMPTY_INIT);
  const [savingInit, setSavingInit] = useState(false);

  const [metricModal, setMetricModal] = useState(false);
  const [metricForm, setMetricForm] = useState<any>(EMPTY_METRIC);
  const [savingMetric, setSavingMetric] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [dRes, iRes, mRes, gRes] = await Promise.all([
        fetch(`${API}/dashboard`, { headers: headers() }),
        fetch(`${API}/initiatives`, { headers: headers() }),
        fetch(`${API}/metrics`, { headers: headers() }),
        fetch(`${API}/goals`, { headers: headers() }),
      ]);
      const [d, i, m, g] = await Promise.all([dRes.json(), iRes.json(), mRes.json(), gRes.json()]);
      setDashboard(d);
      setInitiatives(Array.isArray(i) ? i : []);
      setMetrics(Array.isArray(m) ? m : []);
      setGoals(Array.isArray(g) ? g : []);
    } catch { toast({ title: "Помилка завантаження", variant: "destructive" }); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSaveInit() {
    if (!initForm.title) return;
    setSavingInit(true);
    try {
      const url = editInit ? `${API}/initiatives/${editInit.id}` : `${API}/initiatives`;
      const method = editInit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(initForm) });
      if (!res.ok) throw new Error();
      toast({ title: editInit ? "Ініціативу оновлено" : "Ініціативу додано" });
      setInitModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingInit(false);
  }

  async function handleDeleteInit(id: number) {
    if (!confirm("Видалити ініціативу?")) return;
    try {
      await fetch(`${API}/initiatives/${id}`, { method: "DELETE", headers: headers() });
      toast({ title: "Ініціативу видалено" });
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
  }

  async function handleSaveMetric() {
    if (!metricForm.value || !metricForm.metricName) return;
    setSavingMetric(true);
    try {
      const res = await fetch(`${API}/metrics`, {
        method: "POST", headers: headers(), body: JSON.stringify(metricForm),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Показник збережено" });
      setMetricModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingMetric(false);
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sustainability & ESG</h1>
            <p className="text-muted-foreground text-sm">Екологічні показники та зелені ініціативи</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw size={14} className="mr-1" /> Оновити</Button>
            <Button variant="outline" size="sm" onClick={() => { setMetricForm(EMPTY_METRIC); setMetricModal(true); }}>
              <BarChart3 size={14} className="mr-1" /> Внести показник
            </Button>
            <Button size="sm" onClick={() => { setEditInit(null); setInitForm(EMPTY_INIT); setInitModal(true); }}>
              <Plus size={14} className="mr-1" /> Нова ініціатива
            </Button>
          </div>
        </div>

        {/* ESG Score */}
        {dashboard && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card className="md:col-span-1 border-green-200 bg-green-50">
              <CardContent className="p-4 text-center">
                <Leaf className="mx-auto text-green-600 mb-1" size={28} />
                <p className="text-4xl font-bold text-green-700">{dashboard.esgScore}</p>
                <p className="text-xs text-green-600 mt-1">ESG Score</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {dashboard.completedInitiatives}/{dashboard.totalInitiatives} ініціатив завершено
                </p>
              </CardContent>
            </Card>

            {Object.entries(dashboard.byCategory || {}).map(([cat, data]: [string, any]) => {
              const cfg = CAT_CONFIG[cat];
              if (!cfg) return null;
              const Icon = cfg.icon;
              return (
                <Card key={cat} className={`border ${cfg.color.split(" ").slice(1).join(" ")}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={14} className={cfg.color.split(" ")[0]} />
                      <p className="text-xs text-muted-foreground">{cfg.label}</p>
                    </div>
                    <p className={`text-xl font-bold ${cfg.color.split(" ")[0]}`}>
                      {parseFloat(data.latest).toLocaleString("uk-UA")}
                      <span className="text-xs font-normal ml-1">{data.unit}</span>
                    </p>
                    {data.trend !== 0 && (
                      <div className={`flex items-center gap-1 text-xs mt-1 ${data.trend < 0 ? "text-green-600" : "text-red-500"}`}>
                        {data.trend < 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                        {data.trend > 0 ? "+" : ""}{data.trend}% vs попередній місяць
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Цілі та прогрес</TabsTrigger>
            <TabsTrigger value="initiatives">Зелені ініціативи</TabsTrigger>
            <TabsTrigger value="metrics">Журнал показників</TabsTrigger>
          </TabsList>

          {/* ── Goals ── */}
          <TabsContent value="dashboard" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goals.map(goal => {
                const cfg = CAT_CONFIG[goal.category];
                const Icon = cfg?.icon || Leaf;
                const target = parseFloat(goal.targetValue);
                const current = goal.currentValue ? parseFloat(goal.currentValue) : null;
                // For environment, lower = better
                const progressPct = current !== null ? Math.max(0, Math.min(100, Math.round((1 - (current / target)) * 100))) : 0;
                return (
                  <Card key={goal.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className={cfg?.color.split(" ")[0] || "text-gray-500"} />
                        <CardTitle className="text-sm">{goal.metricName}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Ціль {goal.targetYear}: <strong>{parseFloat(goal.targetValue).toLocaleString("uk-UA")} {goal.targetUnit}</strong></span>
                        {current !== null && (
                          <span className="text-muted-foreground">Зараз: {current.toLocaleString("uk-UA")}</span>
                        )}
                      </div>
                      <Progress value={progressPct} className="h-2" />
                      <p className="text-xs text-muted-foreground text-right">{progressPct}% досягнуто</p>
                    </CardContent>
                  </Card>
                );
              })}
              {goals.length === 0 && (
                <Card className="md:col-span-2">
                  <CardContent className="p-8 text-center text-muted-foreground">Цілі ESG не встановлено</CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ── Green initiatives ── */}
          <TabsContent value="initiatives" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {initiatives.map(init => {
                const cfg = CAT_CONFIG[init.category];
                const Icon = cfg?.icon || Leaf;
                const sc = STATUS_CONFIG[init.status];
                const StatusIcon = sc?.icon || Circle;
                return (
                  <Card key={init.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Icon size={16} className={cfg?.color.split(" ")[0] || "text-gray-500"} />
                          <div>
                            <p className="font-medium text-sm">{init.title}</p>
                            <p className="text-xs text-muted-foreground">{cfg?.label || init.category}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditInit(init);
                            setInitForm({ title: init.title, description: init.description || "", category: init.category, status: init.status, impactScore: init.impactScore || 3, startDate: init.startDate || "", estimatedSavings: init.estimatedSavings || "" });
                            setInitModal(true);
                          }}><Edit3 size={12} /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDeleteInit(init.id)}>
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                      {init.description && <p className="text-sm text-muted-foreground">{init.description}</p>}
                      <div className="flex items-center justify-between">
                        <Badge className={`gap-1 ${sc?.className}`}><StatusIcon size={10} />{sc?.label}</Badge>
                        <div className="flex">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Leaf key={i} size={12} className={i < (init.impactScore || 3) ? "text-green-500" : "text-gray-200"} />
                          ))}
                        </div>
                      </div>
                      {init.startDate && (
                        <p className="text-xs text-muted-foreground">
                          Старт: {format(new Date(init.startDate + "T00:00:00"), "d MMM yyyy", { locale: uk })}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              <Card className="border-dashed cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => { setEditInit(null); setInitForm(EMPTY_INIT); setInitModal(true); }}>
                <CardContent className="flex flex-col items-center justify-center h-full min-h-[140px] text-muted-foreground gap-2">
                  <Plus size={24} className="opacity-40" />
                  <p className="text-sm">Нова ініціатива</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Metrics log ── */}
          <TabsContent value="metrics" className="mt-4">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Категорія</TableHead>
                    <TableHead>Показник</TableHead>
                    <TableHead className="text-right">Значення</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.slice(0, 50).map(m => {
                    const cfg = CAT_CONFIG[m.category];
                    const Icon = cfg?.icon || Leaf;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">
                          {format(new Date(m.metricDate + "T00:00:00"), "d MMM yyyy", { locale: uk })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Icon size={13} className={cfg?.color.split(" ")[0] || "text-gray-500"} />
                            <span className="text-sm">{cfg?.label || m.category}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{m.metricName}</TableCell>
                        <TableCell className="text-right font-mono">
                          {parseFloat(m.value).toLocaleString("uk-UA")} {m.unit}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {metrics.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-10">Немає даних</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Initiative modal ── */}
      <Dialog open={initModal} onOpenChange={setInitModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editInit ? "Редагувати ініціативу" : "Нова зелена ініціатива"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Назва *</Label>
              <Input placeholder="Встановлення сонячних панелей" value={initForm.title} onChange={e => setInitForm({ ...initForm, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Опис</Label>
              <Input placeholder="Деталі ініціативи..." value={initForm.description} onChange={e => setInitForm({ ...initForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Категорія</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={initForm.category} onChange={e => setInitForm({ ...initForm, category: e.target.value })}>
                  {Object.entries(CAT_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Статус</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={initForm.status} onChange={e => setInitForm({ ...initForm, status: e.target.value })}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Вплив (1–5)</Label>
                <Input type="number" min="1" max="5" value={initForm.impactScore}
                  onChange={e => setInitForm({ ...initForm, impactScore: parseInt(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>Дата початку</Label>
                <Input type="date" value={initForm.startDate} onChange={e => setInitForm({ ...initForm, startDate: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInitModal(false)}>Скасувати</Button>
            <Button onClick={handleSaveInit} disabled={savingInit || !initForm.title}>
              {savingInit ? "Зберігаємо..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Metric entry modal ── */}
      <Dialog open={metricModal} onOpenChange={setMetricModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Внести ESG показник</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Дата</Label>
                <Input type="date" value={metricForm.metricDate} onChange={e => setMetricForm({ ...metricForm, metricDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Категорія</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={metricForm.category} onChange={e => setMetricForm({ ...metricForm, category: e.target.value })}>
                  {Object.entries(CAT_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Назва показника *</Label>
              <Input placeholder="Споживання електроенергії" value={metricForm.metricName}
                onChange={e => setMetricForm({ ...metricForm, metricName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Значення *</Label>
                <Input type="number" placeholder="4500" value={metricForm.value}
                  onChange={e => setMetricForm({ ...metricForm, value: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Одиниця</Label>
                <Input placeholder="кВт·год" value={metricForm.unit}
                  onChange={e => setMetricForm({ ...metricForm, unit: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetricModal(false)}>Скасувати</Button>
            <Button onClick={handleSaveMetric} disabled={savingMetric || !metricForm.value || !metricForm.metricName}>
              {savingMetric ? "Зберігаємо..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
