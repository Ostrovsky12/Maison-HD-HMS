import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, Play, Pause, Trash2, Plus, RefreshCw, CheckCircle2, XCircle,
  SkipForward, ChevronRight, Activity, ToggleLeft, ToggleRight,
  Sparkles, Gift, Coffee, BedDouble, ArrowUpCircle, Clock, Bot,
  ListChecks, Settings2, TrendingUp,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/maison-hd";
const API = BASE.replace("/maison-hd", "") + "/api/automation";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { "Authorization": `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const TRIGGER_OPTIONS = [
  { value: "booking_created", label: "Нове бронювання" },
  { value: "booking_confirmed", label: "Підтвердження бронювання" },
  { value: "checkin_today", label: "Заїзд сьогодні" },
  { value: "checkout_today", label: "Виїзд сьогодні" },
  { value: "checkout_tomorrow", label: "Виїзд завтра" },
  { value: "guest_birthday", label: "День народження гостя" },
  { value: "payment_overdue", label: "Прострочена оплата" },
  { value: "low_occupancy", label: "Низька завантаженість (<50%)" },
  { value: "hk_task_pending", label: "Завдання HK очікує >2год" },
  { value: "fb_order_ready", label: "Замовлення F&B готово" },
  { value: "spa_appointment_today", label: "Запис SPA сьогодні" },
  { value: "manual", label: "Ручний запуск" },
];
const ACTION_OPTIONS = [
  { value: "send_inbox_message", label: "Надіслати повідомлення в Inbox" },
  { value: "create_hk_task", label: "Створити завдання Housekeeping" },
  { value: "create_notification", label: "Сповіщення персоналу" },
  { value: "upsell_spa", label: "Пропозиція: SPA" },
  { value: "upsell_fb", label: "Пропозиція: F&B / доставка" },
  { value: "upsell_upgrade", label: "Пропозиція: апгрейд номера" },
  { value: "send_email", label: "Email гостю" },
  { value: "webhook_call", label: "Webhook виклик" },
];

const TRIGGER_ICONS: Record<string, any> = {
  booking_created: Sparkles, booking_confirmed: CheckCircle2, checkin_today: Zap,
  checkout_today: ChevronRight, checkout_tomorrow: Clock, guest_birthday: Gift,
  payment_overdue: XCircle, low_occupancy: TrendingUp, hk_task_pending: Settings2,
  fb_order_ready: Coffee, spa_appointment_today: Sparkles, manual: Play,
};
const ACTION_ICONS: Record<string, string> = {
  send_inbox_message: "💬", create_hk_task: "🧹", create_notification: "🔔",
  upsell_spa: "🛁", upsell_fb: "🍳", upsell_upgrade: "⬆️",
  send_email: "📧", webhook_call: "🔗",
};
const UPSELL_ICONS: Record<string, any> = { spa: Sparkles, upgrade: ArrowUpCircle, fb: Coffee, late_checkout: Clock };
const UPSELL_COLORS: Record<string, string> = {
  spa: "bg-teal-50 border-teal-200 text-teal-700",
  upgrade: "bg-purple-50 border-purple-200 text-purple-700",
  fb: "bg-orange-50 border-orange-200 text-orange-700",
  late_checkout: "bg-blue-50 border-blue-200 text-blue-700",
};
const STATUS_COLORS: Record<string, string> = {
  success: "bg-green-100 text-green-700", failed: "bg-red-100 text-red-600",
  skipped: "bg-yellow-100 text-yellow-700",
};
const STATUS_ICONS: Record<string, any> = { success: CheckCircle2, failed: XCircle, skipped: SkipForward };

const TABS = [
  { id: "rules", label: "Правила", icon: ListChecks },
  { id: "logs", label: "Журнал", icon: Activity },
  { id: "upsells", label: "Апсели", icon: Gift },
];

export default function AutomationPage() {
  const [tab, setTab] = useState("rules");
  const [stats, setStats] = useState<any>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [upsells, setUpsells] = useState<any[]>([]);
  const [triggerLabels, setTriggerLabels] = useState<Record<string, string>>({});
  const [actionLabels, setActionLabels] = useState<Record<string, string>>({});
  const [showNewRule, setShowNewRule] = useState(false);
  const [logFilter, setLogFilter] = useState("all");
  const { toast } = useToast();

  const loadStats = async () => { const r = await apiFetch("/stats"); if (r.ok) setStats(await r.json()); };
  const loadRules = async () => {
    const r = await apiFetch("/rules");
    if (r.ok) { const d = await r.json(); setRules(d.rules || []); setTriggerLabels(d.triggerLabels || {}); setActionLabels(d.actionLabels || {}); }
  };
  const loadLogs = async (s?: string) => {
    const status = s || logFilter;
    const r = await apiFetch(`/logs?limit=40${status !== "all" ? "&status=" + status : ""}`);
    if (r.ok) { const d = await r.json(); setLogs(d.logs || []); }
  };
  const loadUpsells = async () => { const r = await apiFetch("/upsells"); if (r.ok) { const d = await r.json(); setUpsells(d.upsells || []); } };

  useEffect(() => { loadStats(); loadRules(); loadLogs(); loadUpsells(); }, []);

  const toggleRule = async (id: number, isActive: boolean) => {
    const r = await apiFetch(`/rules/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: !isActive }) });
    if (r.ok) { toast({ title: !isActive ? "Правило активовано" : "Правило призупинено" }); loadRules(); loadStats(); }
  };

  const runRule = async (id: number, name: string) => {
    const r = await apiFetch(`/rules/${id}/run`, { method: "POST" });
    if (r.ok) { const d = await r.json(); toast({ title: `▶️ ${name}`, description: d.message }); loadLogs(); loadStats(); }
  };

  const deleteRule = async (id: number) => {
    if (!confirm("Видалити правило?")) return;
    const r = await apiFetch(`/rules/${id}`, { method: "DELETE" });
    if (r.ok) { toast({ title: "Видалено" }); loadRules(); loadStats(); }
  };

  const respondUpsell = async (id: number, status: string) => {
    const r = await apiFetch(`/upsells/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (r.ok) { loadUpsells(); loadStats(); toast({ title: status === "accepted" ? "✅ Прийнято" : "❌ Відхилено" }); }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-7 w-7 text-indigo-600" />AI Automation
            </h1>
            <p className="text-gray-500 text-sm">Правила автоматизації, розумні апсели, тригери і дії</p>
          </div>
          {tab === "rules" && (
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setShowNewRule(true)}>
              <Plus className="h-4 w-4 mr-2" />Нове правило
            </Button>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Активних правил</p>
              <p className="text-2xl font-bold text-indigo-600">{stats.activeRules}</p>
              <p className="text-xs text-gray-400">з {stats.totalRules} загалом</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Виконань всього</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalRuns}</p>
              <p className="text-xs text-gray-400">з початку роботи</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Успішних / Помилок</p>
              <p className="text-2xl font-bold text-green-600">{stats.logsSuccess}<span className="text-red-500 text-sm ml-1">/{stats.logsFailed}</span></p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Апселів активних</p>
              <p className="text-2xl font-bold text-amber-600">{stats.upsellPending}</p>
              <p className="text-xs text-gray-400">Прийнято: {stats.upsellAccepted}</p>
            </CardContent></Card>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* ── RULES TAB ── */}
        {tab === "rules" && (
          <div className="space-y-3">
            {rules.map(rule => {
              const TriggerIcon = TRIGGER_ICONS[rule.trigger] || Zap;
              return (
                <Card key={rule.id} className={`border-0 shadow-sm transition-all ${rule.isActive ? "" : "opacity-60"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${rule.isActive ? "bg-indigo-100" : "bg-gray-100"}`}>
                        <TriggerIcon className={`h-5 w-5 ${rule.isActive ? "text-indigo-600" : "text-gray-400"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{rule.name}</span>
                          <Badge className={rule.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                            {rule.isActive ? "Активне" : "Призупинено"}
                          </Badge>
                        </div>
                        {rule.description && <p className="text-xs text-gray-500 mt-0.5">{rule.description}</p>}
                        <div className="flex flex-wrap gap-2 mt-2">
                          <div className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                            <Zap className="h-3 w-3" />
                            {triggerLabels[rule.trigger] || rule.trigger}
                          </div>
                          {(rule.actions || []).map((a: any, i: number) => (
                            <div key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {ACTION_ICONS[a.type] || "⚡"} {actionLabels[a.type] || a.type}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                          <span>▶ {rule.runCount || 0} виконань</span>
                          {rule.lastRunAt && <span>Останнє: {new Date(rule.lastRunAt).toLocaleDateString("uk", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" title="Запустити вручну"
                          onClick={() => runRule(rule.id, rule.name)}
                          className="h-8 w-8 p-0 text-green-600 hover:bg-green-50">
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" title={rule.isActive ? "Призупинити" : "Активувати"}
                          onClick={() => toggleRule(rule.id, rule.isActive)}
                          className={`h-8 w-8 p-0 ${rule.isActive ? "text-indigo-600 hover:bg-indigo-50" : "text-gray-400 hover:bg-gray-100"}`}>
                          {rule.isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteRule(rule.id)}
                          className="h-8 w-8 p-0 text-red-400 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── LOGS TAB ── */}
        {tab === "logs" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select value={logFilter} onValueChange={v => { setLogFilter(v); loadLogs(v); }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі статуси</SelectItem>
                  <SelectItem value="success">✅ Успішні</SelectItem>
                  <SelectItem value="failed">❌ Помилки</SelectItem>
                  <SelectItem value="skipped">⏭ Пропущені</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => loadLogs()} className="h-9"><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>

            {logs.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-10 text-center text-gray-400">Записів немає</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {logs.map(log => {
                  const SIcon = STATUS_ICONS[log.status] || CheckCircle2;
                  return (
                    <div key={log.id} className={`flex items-start gap-3 p-3 rounded-xl border ${STATUS_COLORS[log.status]} bg-opacity-30`}>
                      <SIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${log.status === "success" ? "text-green-600" : log.status === "failed" ? "text-red-500" : "text-yellow-600"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-800">{log.ruleName || "Невідоме правило"}</span>
                          <Badge className="text-xs bg-blue-100 text-blue-700">{triggerLabels[log.trigger] || log.trigger}</Badge>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{log.resultMessage}</p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                        {new Date(log.triggeredAt).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── UPSELLS TAB ── */}
        {tab === "upsells" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Активні пропозиції для гостей, генеровані правилами автоматизації</p>
            {upsells.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-10 text-center text-gray-400">Пропозицій немає</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {upsells.map(u => {
                  const UIcon = UPSELL_ICONS[u.offerType] || Gift;
                  const colorClass = UPSELL_COLORS[u.offerType] || "bg-gray-50 border-gray-200 text-gray-700";
                  return (
                    <Card key={u.id} className={`border shadow-sm ${u.status === "declined" ? "opacity-50" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${colorClass}`}>
                            <UIcon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{u.title}</span>
                              <Badge className={u.status === "accepted" ? "bg-green-100 text-green-700" : u.status === "declined" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}>
                                {u.status === "accepted" ? "✓ Прийнято" : u.status === "declined" ? "✗ Відхилено" : "Очікує"}
                              </Badge>
                            </div>
                            {u.description && <p className="text-xs text-gray-500 mt-0.5">{u.description}</p>}
                            {u.price && <p className="font-bold text-indigo-600 mt-1">{parseFloat(u.price).toLocaleString()} ₴</p>}
                          </div>
                        </div>
                        {u.status === "pending" && (
                          <div className="flex gap-2 mt-3">
                            <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 h-8 text-xs" onClick={() => respondUpsell(u.id, "accepted")}>✓ Прийняти</Button>
                            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-red-600 border-red-200" onClick={() => respondUpsell(u.id, "declined")}>✗ Відхилити</Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Rule Dialog */}
      <NewRuleDialog open={showNewRule} onClose={() => setShowNewRule(false)}
        onSave={async (data: any) => {
          const r = await apiFetch("/rules", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Правило створено" }); setShowNewRule(false); loadRules(); loadStats(); }
          else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
        }} />
    </AppLayout>
  );
}

// ── New Rule Dialog ────────────────────────────────────────────────────────────
function NewRuleDialog({ open, onClose, onSave }: any) {
  const [form, setForm] = useState({ name: "", description: "", trigger: "", actions: [{ type: "", params: {} }] });
  const [loading, setLoading] = useState(false);

  const addAction = () => setForm(f => ({ ...f, actions: [...f.actions, { type: "", params: {} }] }));
  const removeAction = (i: number) => setForm(f => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }));
  const setAction = (i: number, type: string) => setForm(f => ({ ...f, actions: f.actions.map((a, idx) => idx === i ? { ...a, type } : a) }));

  const handleSubmit = async () => {
    if (!form.name || !form.trigger || form.actions.some(a => !a.type)) return;
    setLoading(true);
    await onSave(form);
    setLoading(false);
    setForm({ name: "", description: "", trigger: "", actions: [{ type: "", params: {} }] });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-indigo-600" />Нове правило автоматизації</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Назва правила *</Label><Input placeholder="Привітання при заїзді" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><Label>Опис</Label><Textarea rows={2} placeholder="Що робить це правило…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>

          <div>
            <Label>Тригер (ЯКЩО…) *</Label>
            <Select value={form.trigger} onValueChange={v => setForm(f => ({ ...f, trigger: v }))}>
              <SelectTrigger><SelectValue placeholder="Оберіть подію-тригер" /></SelectTrigger>
              <SelectContent>{TRIGGER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Дії (ТО…) *</Label>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addAction}><Plus className="h-3 w-3 mr-1" />Дія</Button>
            </div>
            <div className="space-y-2">
              {form.actions.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <Select value={a.type} onValueChange={v => setAction(i, v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Оберіть дію" /></SelectTrigger>
                    <SelectContent>{ACTION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{ACTION_ICONS[o.value]} {o.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {form.actions.length > 1 && (
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-red-400" onClick={() => removeAction(i)}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleSubmit} disabled={loading || !form.name || !form.trigger}>
            {loading ? "…" : "Створити правило"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
