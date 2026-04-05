import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, TrendingDown, Tag, Calendar, Layers, Plus, Lock, X,
  Calculator, ChevronDown, ChevronUp, Loader2, RefreshCw, Info,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/revenue";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { "Authorization": `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const MODIFIER_ICONS: Record<string, string> = { occupancy: "📊", season: "🌿", day_of_week: "📅", event: "🎉", last_minute: "⚡", early_bird: "🐦" };
const CANCEL_LABELS: Record<string, string> = { flexible: "Гнучке", moderate: "Помірне", strict: "Строге", non_refundable: "Невідмовне" };
const DOW_UA = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MON_UA = ["", "Січ", "Лют", "Бер", "Квіт", "Трав", "Черв", "Лип", "Серп", "Вер", "Жовт", "Лист", "Груд"];

const TABS = [
  { id: "plans",    label: "Тарифні плани",   icon: Layers },
  { id: "rules",    label: "Правила цін",      icon: Tag },
  { id: "overrides",label: "Виключення",       icon: Calendar },
  { id: "calendar", label: "Калькулятор",      icon: Calculator },
];

export default function RevenuePage() {
  const [tab, setTab] = useState("plans");
  const [stats, setStats] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [showNewOverride, setShowNewOverride] = useState(false);

  // Calendar state
  const [units, setUnits] = useState<any[]>([]);
  const [calUnit, setCalUnit] = useState<string>("all");
  const [calDays, setCalDays] = useState<any[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const { toast } = useToast();

  const loadStats = useCallback(async () => { const r = await apiFetch("/stats"); if (r.ok) setStats(await r.json()); }, []);
  const loadPlans = useCallback(async () => { const r = await apiFetch("/plans"); if (r.ok) { const d = await r.json(); setPlans(d.plans || []); } }, []);
  const loadRules = useCallback(async () => { const r = await apiFetch("/rules"); if (r.ok) { const d = await r.json(); setRules(d.rules || []); } }, []);
  const loadOverrides = useCallback(async () => { const r = await apiFetch("/overrides"); if (r.ok) { const d = await r.json(); setOverrides(d.overrides || []); } }, []);
  const loadUnits = useCallback(async () => { const r = await apiFetch("/units"); if (r.ok) { const d = await r.json(); setUnits(d.units || []); } }, []);

  const loadCalendar = useCallback(async (unitId?: string) => {
    setCalLoading(true);
    const uid = unitId !== undefined ? unitId : calUnit;
    const params = uid && uid !== "all" ? `?unitId=${uid}` : "";
    const r = await apiFetch(`/calendar${params}`);
    if (r.ok) { const d = await r.json(); setCalDays(d.days || []); }
    setCalLoading(false);
  }, [calUnit]);

  useEffect(() => { loadStats(); loadPlans(); loadRules(); loadOverrides(); loadUnits(); }, []);
  useEffect(() => { if (tab === "calendar") loadCalendar(); }, [tab]);

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

  // Price color: green=below base, amber=slight up, red=high up
  const priceColor = (finalPrice: number, basePrice: number) => {
    if (finalPrice === 0) return "bg-gray-200 text-gray-400";
    const pct = ((finalPrice - basePrice) / basePrice) * 100;
    if (pct <= -5) return "bg-green-100 text-green-800";
    if (pct <= 5) return "bg-blue-50 text-blue-700";
    if (pct <= 20) return "bg-amber-100 text-amber-800";
    if (pct <= 40) return "bg-orange-100 text-orange-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-7 w-7 text-amber-600" />Revenue Management</h1>
            <p className="text-gray-500 text-sm">Тарифні плани, правила динамічного ціноутворення та калькулятор цін</p>
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
              { label: "Закритих дат", value: stats.closedDates, sub: "stop sell", color: "text-red-500" },
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
        <div className="flex gap-1 border-b overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-amber-600 text-amber-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <t.icon className="h-4 w-4" />{t.label}
              {t.id === "calendar" && <Badge className="bg-amber-100 text-amber-700 text-xs ml-1">New</Badge>}
            </button>
          ))}
        </div>

        {/* ── PLANS ── */}
        {tab === "plans" && (
          <div className="space-y-3">
            {plans.map(plan => (
              <Card key={plan.id} className={`border-0 shadow-sm ${plan.isDefault ? "ring-1 ring-amber-300" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${plan.status === "active" ? "bg-amber-100" : "bg-gray-100"}`}>
                      <Layers className={`h-5 w-5 ${plan.status === "active" ? "text-amber-600" : "text-gray-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{plan.name}</span>
                        {plan.isDefault && <Badge className="bg-amber-100 text-amber-700 text-xs border-amber-200">✓ За замовчуванням</Badge>}
                        <Badge className={plan.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                          {plan.status === "active" ? "Активний" : "Вимкнено"}
                        </Badge>
                      </div>
                      {plan.description && <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>}
                      <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
                        <span className="text-gray-600">Коефіцієнт:
                          <strong className={`ml-1 ${parseFloat(plan.baseModifier) > 1 ? "text-red-500" : parseFloat(plan.baseModifier) < 1 ? "text-green-600" : "text-gray-700"}`}>
                            ×{plan.baseModifier}
                          </strong>
                        </span>
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
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2 text-xs text-blue-700">
              <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>Правила застосовуються автоматично при розрахунку ціни. Вищий пріоритет = перевагу при конфлікті. Активуйте "Калькулятор" щоб побачити результат.</span>
            </div>
            {rules.map(rule => {
              const icon = MODIFIER_ICONS[rule.ruleType] || "⚙️";
              const val = parseFloat(rule.modifierValue);
              const isPos = val > 0;
              return (
                <Card key={rule.id} className={`border-0 shadow-sm transition-opacity ${!rule.isActive ? "opacity-55" : ""}`}>
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
                          {rule.priority > 10 && <Badge className="bg-red-50 text-red-500 text-xs border-red-200">🔥 Пріоритет {rule.priority}</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                          <span>{rule.planName || "Усі тарифи"}</span>
                          {rule.validFrom && <span>{rule.validFrom} → {rule.validTo || "…"}</span>}
                          <span className="text-gray-400">Пріоритет: {rule.priority}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`flex items-center gap-1 font-bold text-lg ${isPos ? "text-red-500" : "text-green-600"}`}>
                          {isPos ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                          {isPos ? "+" : ""}{val}%
                        </div>
                        <Button variant="ghost" size="sm" className={`h-7 text-xs mt-1 ${rule.isActive ? "text-gray-400 hover:text-gray-600" : "text-amber-600 hover:text-amber-700"}`}
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
            ) : overrides.map(o => (
              <div key={o.id} className={`flex items-center gap-3 p-3 rounded-xl border ${o.isClosed ? "bg-red-50 border-red-200" : "bg-white border-gray-100 shadow-sm"}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${o.isClosed ? "bg-red-100" : "bg-amber-100"}`}>
                  {o.isClosed ? <Lock className="h-4 w-4 text-red-500" /> : <Tag className="h-4 w-4 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{o.overrideDate}</span>
                    {o.unitName && <span className="text-xs text-gray-500">{o.unitName}</span>}
                    {o.isClosed
                      ? <Badge className="bg-red-100 text-red-600 text-xs border-red-200">🔒 Stop Sell</Badge>
                      : o.customPrice ? <Badge className="bg-amber-100 text-amber-700 text-xs border-amber-200">₴{parseFloat(o.customPrice).toLocaleString()}</Badge>
                      : null}
                  </div>
                  {o.reason && <p className="text-xs text-gray-500 mt-0.5">{o.reason}</p>}
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500" onClick={() => deleteOverride(o.id)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* ── PRICE CALENDAR ── */}
        {tab === "calendar" && (
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs mb-1 block text-gray-500">Оберіть номер / котедж</Label>
                <Select value={calUnit} onValueChange={v => { setCalUnit(v); loadCalendar(v); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Усі (середня ціна)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Загальний (базова ціна)</SelectItem>
                    {units.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name} — {parseFloat(u.basePrice || 0).toLocaleString()} ₴/ніч
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" className="h-9 mt-4" onClick={() => loadCalendar()} disabled={calLoading}>
                {calLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>

            {/* Legend */}
            <div className="flex gap-3 flex-wrap text-xs">
              {[
                { color: "bg-green-100 text-green-800", label: "Знижка" },
                { color: "bg-blue-50 text-blue-700", label: "Базова" },
                { color: "bg-amber-100 text-amber-800", label: "+5–20%" },
                { color: "bg-orange-100 text-orange-800", label: "+20–40%" },
                { color: "bg-red-100 text-red-800", label: ">+40%" },
                { color: "bg-gray-200 text-gray-400", label: "Закрито" },
              ].map(l => (
                <div key={l.label} className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${l.color}`}>
                  <span>{l.label}</span>
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            {calLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>
            ) : calDays.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-gray-400">
                <Calculator className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Оберіть номер і натисніть "Оновити"</p>
              </CardContent></Card>
            ) : (
              <>
                {/* Week header */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 font-medium">
                  {DOW_UA.map(d => <div key={d}>{d}</div>)}
                </div>

                {/* Build week rows */}
                {(() => {
                  const weeks: any[][] = [];
                  let week: any[] = [];
                  // Pad start
                  const firstDay = new Date(calDays[0].date + "T00:00:00Z");
                  const startDow = (firstDay.getUTCDay() + 6) % 7; // Mon=0
                  for (let i = 0; i < startDow; i++) week.push(null);
                  for (const day of calDays) {
                    week.push(day);
                    if (week.length === 7) { weeks.push(week); week = []; }
                  }
                  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
                  return weeks.map((w, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-1">
                      {w.map((day, di) => {
                        if (!day) return <div key={di} />;
                        const d = new Date(day.date + "T00:00:00Z");
                        const isToday = day.date === new Date().toISOString().slice(0, 10);
                        const colorClass = priceColor(day.finalPrice, day.basePrice);
                        const isExpanded = expandedDay === day.date;
                        return (
                          <div key={di} className="relative">
                            <button
                              className={`w-full rounded-lg p-1.5 text-center transition-transform hover:scale-105 cursor-pointer ${colorClass} ${isToday ? "ring-2 ring-indigo-400" : ""} ${day.isOverride ? "ring-1 ring-purple-400" : ""}`}
                              onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                            >
                              <div className={`text-xs font-bold ${isToday ? "text-indigo-700" : ""}`}>
                                {d.getUTCDate()}
                                {d.getUTCDate() === 1 && <span className="text-[9px] block opacity-70">{MON_UA[d.getUTCMonth() + 1]}</span>}
                              </div>
                              {day.isClosed ? (
                                <div className="text-[10px] font-bold">🔒</div>
                              ) : (
                                <div className="text-[10px] font-bold leading-none">
                                  {(day.finalPrice / 1000).toFixed(1)}к
                                </div>
                              )}
                              {day.appliedRules?.length > 0 && !day.isClosed && (
                                <div className="text-[8px] opacity-70">
                                  {day.appliedRules.map((r: any) => r.icon).join("")}
                                </div>
                              )}
                            </button>
                            {/* Tooltip */}
                            {isExpanded && (
                              <div className="absolute z-50 top-full left-0 mt-1 w-56 bg-white border border-gray-200 shadow-xl rounded-xl p-3 text-xs" style={{ minWidth: 200 }}>
                                <p className="font-bold text-sm mb-2">{day.date}</p>
                                {day.isClosed ? (
                                  <p className="text-red-600 font-medium">🔒 Закрита дата{day.reason && ` — ${day.reason}`}</p>
                                ) : (
                                  <>
                                    <div className="flex justify-between mb-1">
                                      <span className="text-gray-500">Базова ціна:</span>
                                      <span>{day.basePrice.toLocaleString()} ₴</span>
                                    </div>
                                    {day.appliedRules?.map((r: any, i: number) => (
                                      <div key={i} className="flex justify-between text-gray-600">
                                        <span>{r.icon} {r.name}</span>
                                        <span className={r.modifier > 0 ? "text-red-500" : "text-green-600"}>{r.modifier > 0 ? "+" : ""}{r.modifier}%</span>
                                      </div>
                                    ))}
                                    {day.isOverride && <div className="text-purple-600 mt-1">🎯 Ціна вручну{day.reason && ` (${day.reason})`}</div>}
                                    <div className="border-t pt-1 mt-1 flex justify-between font-bold">
                                      <span>Фінальна ціна:</span>
                                      <span className="text-lg">{day.finalPrice.toLocaleString()} ₴</span>
                                    </div>
                                    {day.modifier !== 0 && (
                                      <div className={`text-center text-xs mt-0.5 ${day.modifier > 0 ? "text-red-500" : "text-green-600"}`}>
                                        {day.modifier > 0 ? "+" : ""}{day.modifier.toFixed(0)}% від бази
                                      </div>
                                    )}
                                  </>
                                )}
                                <button className="mt-2 text-gray-400 hover:text-gray-600 w-full text-center text-xs" onClick={() => setExpandedDay(null)}>✕ Закрити</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}

                {/* Summary row */}
                {calDays.length > 0 && (() => {
                  const open = calDays.filter(d => !d.isClosed);
                  const avg = open.length > 0 ? Math.round(open.reduce((s, d) => s + d.finalPrice, 0) / open.length) : 0;
                  const min = open.length > 0 ? Math.min(...open.map(d => d.finalPrice)) : 0;
                  const max = open.length > 0 ? Math.max(...open.map(d => d.finalPrice)) : 0;
                  return (
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      {[
                        { label: "Мін. ціна", value: `${min.toLocaleString()} ₴`, color: "text-green-600" },
                        { label: "Середня ціна", value: `${avg.toLocaleString()} ₴`, color: "text-blue-600" },
                        { label: "Макс. ціна", value: `${max.toLocaleString()} ₴`, color: "text-red-500" },
                      ].map(s => (
                        <Card key={s.label} className="border-0 shadow-sm"><CardContent className="p-3 text-center">
                          <p className="text-xs text-gray-400">{s.label}</p>
                          <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                        </CardContent></Card>
                      ))}
                    </div>
                  );
                })()}
              </>
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
            if (r.ok) { toast({ title: "Виключення збережено" }); setShowNewOverride(false); loadOverrides(); loadStats(); if (tab === "calendar") loadCalendar(); }
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
      <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
        <input type="checkbox" checked={form.isClosed} onChange={e => { f("isClosed")(e.target.checked); if (e.target.checked) f("customPrice")(""); }} className="w-4 h-4 accent-red-500" />
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
