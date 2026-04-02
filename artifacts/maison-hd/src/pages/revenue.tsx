import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, Tag, Calendar, Layers, Plus, Lock, Unlock, CheckCircle2, Pencil, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/maison-hd";
const API = BASE.replace("/maison-hd", "") + "/api/revenue";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { "Authorization": `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const MODIFIER_ICONS: Record<string, string> = { occupancy: "📊", season: "🌿", day_of_week: "📅", event: "🎉", last_minute: "⚡", early_bird: "🐦" };
const CANCEL_LABELS: Record<string, string> = { flexible: "Гнучке", moderate: "Помірне", strict: "Строге", non_refundable: "Невідмовне" };

const TABS = [
  { id: "plans", label: "Тарифні плани", icon: Layers },
  { id: "rules", label: "Правила цін", icon: Tag },
  { id: "overrides", label: "Перевизначення", icon: Calendar },
];

export default function RevenuePage() {
  const [tab, setTab] = useState("plans");
  const [stats, setStats] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [showNewOverride, setShowNewOverride] = useState(false);
  const { toast } = useToast();

  const loadStats = async () => { const r = await apiFetch("/stats"); if (r.ok) setStats(await r.json()); };
  const loadPlans = async () => { const r = await apiFetch("/plans"); if (r.ok) { const d = await r.json(); setPlans(d.plans || []); } };
  const loadRules = async () => { const r = await apiFetch("/rules"); if (r.ok) { const d = await r.json(); setRules(d.rules || []); } };
  const loadOverrides = async () => { const r = await apiFetch("/overrides"); if (r.ok) { const d = await r.json(); setOverrides(d.overrides || []); } };

  useEffect(() => { loadStats(); loadPlans(); loadRules(); loadOverrides(); }, []);

  const toggleRule = async (id: number, isActive: boolean) => {
    const r = await apiFetch(`/rules/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: !isActive }) });
    if (r.ok) { loadRules(); loadStats(); toast({ title: !isActive ? "✅ Правило активовано" : "⏸ Правило вимкнено" }); }
  };

  const togglePlan = async (id: number, status: string) => {
    const newStatus = status === "active" ? "inactive" : "active";
    const r = await apiFetch(`/plans/${id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
    if (r.ok) { loadPlans(); loadStats(); toast({ title: newStatus === "active" ? "✅ Тариф активовано" : "⏸ Тариф вимкнено" }); }
  };

  const deleteOverride = async (id: number) => {
    const r = await apiFetch(`/overrides/${id}`, { method: "DELETE" });
    if (r.ok) { loadOverrides(); loadStats(); toast({ title: "Видалено" }); }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-7 w-7 text-amber-600" />Revenue Management</h1>
            <p className="text-gray-500 text-sm">Тарифні плани, правила динамічного ціноутворення та виключення</p>
          </div>
          {tab === "overrides" && (
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setShowNewOverride(true)}>
              <Plus className="h-4 w-4 mr-2" />Нове виключення
            </Button>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Активних планів", value: stats.activePlans, sub: `з ${stats.totalPlans}`, color: "text-amber-600" },
              { label: "Активних правил", value: stats.activeRules, sub: `з ${stats.totalRules} загалом`, color: "text-blue-600" },
              { label: "Дат-виключень", value: stats.totalOverrides, sub: "кастомні ціни", color: "text-green-600" },
              { label: "Закритих дат", value: stats.closedDates, sub: "unavailable", color: "text-red-500" },
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
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-amber-600 text-amber-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* ── PLANS ── */}
        {tab === "plans" && (
          <div className="space-y-3">
            {plans.map(plan => (
              <Card key={plan.id} className={`border-0 shadow-sm ${plan.isDefault ? "border border-amber-200" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${plan.status === "active" ? "bg-amber-100" : "bg-gray-100"}`}>
                      <Layers className={`h-5 w-5 ${plan.status === "active" ? "text-amber-600" : "text-gray-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{plan.name}</span>
                        {plan.isDefault && <Badge className="bg-amber-100 text-amber-700 text-xs">✓ За замовчуванням</Badge>}
                        <Badge className={plan.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                          {plan.status === "active" ? "Активний" : "Вимкнено"}
                        </Badge>
                      </div>
                      {plan.description && <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>}
                      <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
                        <span className="text-gray-600">Коефіцієнт: <strong className={parseFloat(plan.baseModifier) > 1 ? "text-red-500" : parseFloat(plan.baseModifier) < 1 ? "text-green-600" : "text-gray-700"}>×{plan.baseModifier}</strong></span>
                        <span className="text-gray-600">Скасування: {CANCEL_LABELS[plan.cancellationPolicy] || plan.cancellationPolicy}</span>
                        <span className="text-gray-600">Мін. ночей: {plan.minStay || 1}</span>
                        {plan.includesBreakfast && <span className="text-green-600">🍳 Сніданок включено</span>}
                      </div>
                    </div>
                    {!plan.isDefault && (
                      <Button variant="ghost" size="sm" className={`h-8 text-xs flex-shrink-0 ${plan.status === "active" ? "text-gray-500" : "text-amber-600"}`}
                        onClick={() => togglePlan(plan.id, plan.status)}>
                        {plan.status === "active" ? "Вимкнути" : "Активувати"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── RULES ── */}
        {tab === "rules" && (
          <div className="space-y-3">
            {rules.map(rule => {
              const icon = MODIFIER_ICONS[rule.ruleType] || "⚙️";
              const val = parseFloat(rule.modifierValue);
              const isPos = val > 0;
              return (
                <Card key={rule.id} className={`border-0 shadow-sm ${!rule.isActive ? "opacity-60" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${rule.isActive ? "bg-amber-50" : "bg-gray-100"}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{rule.name}</span>
                          <Badge className={rule.isActive ? "bg-green-100 text-green-700 text-xs" : "bg-gray-100 text-gray-500 text-xs"}>
                            {rule.isActive ? "Активне" : "Вимкнено"}
                          </Badge>
                          {rule.priority > 5 && <Badge className="bg-red-50 text-red-500 text-xs">Пріоритет {rule.priority}</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                          <span className="text-gray-500">Тариф: {rule.planName || "—"}</span>
                          {rule.validFrom && <span>{rule.validFrom} → {rule.validTo || "…"}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`flex items-center gap-1 font-bold text-lg ${isPos ? "text-red-500" : "text-green-600"}`}>
                          {isPos ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                          {isPos ? "+" : ""}{val}%
                        </div>
                        <Button variant="ghost" size="sm" className={`h-7 text-xs mt-1 ${rule.isActive ? "text-gray-400" : "text-amber-600"}`}
                          onClick={() => toggleRule(rule.id, rule.isActive)}>
                          {rule.isActive ? "Вимкнути" : "Активувати"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── OVERRIDES ── */}
        {tab === "overrides" && (
          <div className="space-y-2">
            {overrides.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Виключень немає</p>
                <Button variant="outline" className="mt-3" onClick={() => setShowNewOverride(true)}>Додати перше</Button>
              </div>
            ) : (
              overrides.map(o => (
                <div key={o.id} className={`flex items-center gap-3 p-3 rounded-xl border ${o.isClosed ? "bg-red-50 border-red-200" : "bg-white border-gray-100"}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${o.isClosed ? "bg-red-100" : "bg-amber-100"}`}>
                    {o.isClosed ? <Lock className="h-4 w-4 text-red-500" /> : <Tag className="h-4 w-4 text-amber-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{o.overrideDate}</span>
                      {o.unitName && <span className="text-xs text-gray-500">{o.unitName}</span>}
                      {o.isClosed ? <Badge className="bg-red-100 text-red-600 text-xs">🔒 Закрито</Badge> : o.customPrice ? <Badge className="bg-amber-100 text-amber-700 text-xs">₴{parseFloat(o.customPrice).toLocaleString()}</Badge> : null}
                    </div>
                    {o.reason && <p className="text-xs text-gray-500 mt-0.5">{o.reason}</p>}
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500" onClick={() => deleteOverride(o.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* New Override Dialog */}
      <Dialog open={showNewOverride} onOpenChange={setShowNewOverride}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Нове цінове виключення</DialogTitle></DialogHeader>
          <NewOverrideForm onSave={async (data: any) => {
            const r = await apiFetch("/overrides", { method: "POST", body: JSON.stringify(data) });
            if (r.ok) { toast({ title: "Виключення збережено" }); setShowNewOverride(false); loadOverrides(); loadStats(); }
            else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
          }} onClose={() => setShowNewOverride(false)} />
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function NewOverrideForm({ onSave, onClose }: any) {
  const [form, setForm] = useState({ overrideDate: "", customPrice: "", isClosed: false, reason: "" });
  const f = (k: string) => (v: any) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="space-y-3">
      <div><Label>Дата *</Label><Input type="date" value={form.overrideDate} onChange={e => f("overrideDate")(e.target.value)} /></div>
      <div><Label>Ціна (₴) — якщо не закрито</Label><Input type="number" placeholder="2800" value={form.customPrice} onChange={e => f("customPrice")(e.target.value)} disabled={form.isClosed} /></div>
      <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl">
        <input type="checkbox" checked={form.isClosed} onChange={e => { f("isClosed")(e.target.checked); if (e.target.checked) f("customPrice")(""); }} className="w-4 h-4" />
        <div><p className="font-medium text-sm">Закрити дату (Stop Sell)</p><p className="text-xs text-gray-500">Заборонити бронювання на цю дату</p></div>
      </div>
      <div><Label>Причина</Label><Input placeholder="Технічне обслуговування / Виставка..." value={form.reason} onChange={e => f("reason")(e.target.value)} /></div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Скасувати</Button>
        <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => onSave(form)} disabled={!form.overrideDate}>Зберегти</Button>
      </DialogFooter>
    </div>
  );
}
